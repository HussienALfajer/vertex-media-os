import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetCsrfToken } from '../../../lib/http';
import { createQueryClient } from '../../../query-client';
import { createAppRouter } from '../../../router';

vi.mock('../../../lib/navigation', () => ({ leaveApplication: vi.fn() }));

const ADMIN = {
  id: '0b7c7f2e-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  displayName: 'مديرة النظام',
};
const TARGET_ID = '0b7c7f2e-0000-4000-8000-000000000002';
const OPS = '0b7c7f2e-0000-4000-8000-0000000000d1';
const SALES = '0b7c7f2e-0000-4000-8000-0000000000d2';
const EDITOR = '0b7c7f2e-0000-4000-8000-0000000000e1';
const SYSTEM = '0b7c7f2e-0000-4000-8000-0000000000e2';

const ALL_CODES = [
  'iam.departments.read',
  'iam.roles.read',
  'iam.sessions.revoke',
  'iam.users.create',
  'iam.users.manage-access',
  'iam.users.manage-departments',
  'iam.users.manage-roles',
  'iam.users.read',
  'iam.users.update',
];

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    email: 'sara@example.test',
    displayName: 'سارة',
    accessState: 'ACTIVE',
    identitySyncState: 'SYNCED',
    invitationDeliveryState: 'SENT',
    invitationSentAt: '2026-09-20T08:00:00.000Z',
    firstActivatedAt: '2026-09-21T08:00:00.000Z',
    lastAccessStateChangedAt: '2026-09-21T08:00:00.000Z',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-21T08:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...user(),
    departments: [
      { id: OPS, code: 'ops', name: 'العمليات', state: 'ACTIVE', isPrimary: true },
      { id: SALES, code: 'sales', name: 'المبيعات', state: 'ACTIVE', isPrimary: false },
    ],
    roles: [{ id: EDITOR, code: 'editor', name: 'محرر', state: 'ACTIVE', isSystem: false }],
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  const { departments, roles, ...rest } = detail(overrides);
  return {
    id: rest.id,
    email: rest.email,
    displayName: rest.displayName,
    accessState: rest.accessState,
    identitySyncState: rest.identitySyncState,
    invitationDeliveryState: rest.invitationDeliveryState,
    departments,
    roles,
  };
}

const page = (items: unknown[], total = items.length) => ({ items, page: 1, pageSize: 25, total });

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
      ...headers,
    },
  });
}
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { status, code, ...extra });

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly csrf: string | undefined;
}
type Handler = (call: Call) => Response | Promise<Response>;

/**
 * A fake API answering by `METHOD /path` (query excluded) and recording each call. The signed-in
 * administrator holds `codes`; an unknown request fails like an unreachable API.
 */
function fakeApi(routes: Record<string, Handler>, codes: readonly string[] = ALL_CODES) {
  const calls: Call[] = [];
  const all: Record<string, Handler> = {
    'GET /api/health/live': () => json(200, { status: 'ok' }),
    'GET /api/auth/session': () =>
      json(200, {
        user: ADMIN,
        session: {
          idleExpiresAt: '2026-09-24T10:00:00.000Z',
          absoluteExpiresAt: '2026-09-24T18:00:00.000Z',
        },
      }),
    'GET /api/iam/me': () => json(200, { user: ADMIN, departments: [], permissionCodes: codes }),
    'GET /api/auth/csrf': () => json(200, { token: 'csrf-token' }),
    'GET /api/iam/departments': () =>
      json(
        200,
        page([
          {
            id: OPS,
            code: 'ops',
            name: 'العمليات',
            description: null,
            state: 'ACTIVE',
            version: 1,
          },
          {
            id: SALES,
            code: 'sales',
            name: 'المبيعات',
            description: null,
            state: 'ACTIVE',
            version: 1,
          },
        ]),
      ),
    'GET /api/iam/roles': () =>
      json(
        200,
        page([
          {
            id: EDITOR,
            code: 'editor',
            name: 'محرر',
            description: null,
            state: 'ACTIVE',
            isSystem: false,
            version: 1,
          },
          {
            id: SYSTEM,
            code: 'system-administrator',
            name: 'مسؤول النظام',
            description: null,
            state: 'ACTIVE',
            isSystem: true,
            version: 1,
          },
        ]),
      ),
    ...routes,
  };
  const mock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method,
      url,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      csrf: headers['x-csrf-token'],
    };
    calls.push(call);
    const handler = all[`${method} ${url.split('?')[0] ?? url}`];
    return handler === undefined
      ? Promise.reject(new Error(`Unexpected request ${method} ${url}`))
      : Promise.resolve(handler(call));
  });
  vi.stubGlobal('fetch', mock);
  const unsafe = () => calls.filter((call) => call.method !== 'GET');
  return { calls, unsafe };
}

function renderAt(path: string) {
  const client = createQueryClient();
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}

const detailPath = `/users/${TARGET_ID}`;
const detailRoute = `GET /api/iam/users/${TARGET_ID}`;

async function openUserActions() {
  fireEvent.click(await screen.findByRole('button', { name: 'إجراءات المستخدم' }));
  return screen.findByRole('menu');
}

async function chooseAction(name: string) {
  const menu = await openUserActions();
  fireEvent.click(within(menu).getByRole('menuitem', { name }));
  return screen.findByRole('alertdialog');
}

beforeEach(() => forgetCsrfToken());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('navigation', () => {
  it('shows the Users destination only to a user holding iam.users.read (review T-11)', async () => {
    fakeApi({}, ['iam.users.read']);
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'فتح التنقل' }));
    const navigation = await screen.findByRole('dialog');
    expect(within(navigation).getByRole('link', { name: 'المستخدمون' }).getAttribute('href')).toBe(
      '/users',
    );
    expect(within(navigation).getByText('الإدارة')).toBeTruthy();
  });

  it('omits the destination and its empty group without the permission', async () => {
    fakeApi({}, []);
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'فتح التنقل' }));
    const navigation = await screen.findByRole('dialog');
    expect(within(navigation).getByRole('link', { name: 'الرئيسية' })).toBeTruthy();
    expect(within(navigation).queryByRole('link', { name: 'المستخدمون' })).toBeNull();
    expect(within(navigation).queryByText('الإدارة')).toBeNull();
  });
});

describe('the user directory', () => {
  it('lists each user, their role and local access state', async () => {
    fakeApi({
      'GET /api/iam/users': () =>
        json(
          200,
          page([
            summary(),
            summary({
              id: '0b7c7f2e-0000-4000-8000-000000000003',
              displayName: 'ليلى',
              email: 'layla@example.test',
              accessState: 'INVITED',
              identitySyncState: 'FAILED',
              invitationDeliveryState: 'FAILED',
            }),
          ]),
        ),
    });
    renderAt('/users');

    await screen.findByRole('link', { name: 'سارة' });
    const table = screen.getByRole('table', { name: 'دليل المستخدمين' });
    const rows = within(table).getAllByRole('row');
    const active = rows[1] as HTMLElement;
    const invited = rows[2] as HTMLElement;
    expect(within(active).getByRole('link', { name: 'سارة' }).getAttribute('href')).toBe(
      `/users/${TARGET_ID}`,
    );
    expect(active.textContent).toContain('sara@example.test');
    expect(active.textContent).toContain('العمليات · رئيسي');
    expect(active.textContent).toContain('نشط');
    expect(active.textContent).not.toContain('الدعوة');
    expect(invited.textContent).toContain('بانتظار أول دخول');
    expect(invited.textContent).not.toContain('مزامنة');
    expect(screen.getByRole('button', { name: 'إضافة مستخدم' })).toBeTruthy();
  });

  it('shows an unknown state value as unknown, never as success', async () => {
    fakeApi({
      'GET /api/iam/users': () => json(200, page([summary({ accessState: 'ARCHIVED' })])),
    });
    renderAt('/users');
    const table = await screen.findByRole('table');
    await waitFor(() => expect(table.textContent).toContain('حالة غير معروفة (ARCHIVED)'));
  });

  it('keeps the search text out of the address and sends it to the API; the filter goes to both', async () => {
    const api = fakeApi({ 'GET /api/iam/users': () => json(200, page([summary()])) });
    const { router } = renderAt('/users');
    await screen.findByRole('table');

    fireEvent.change(screen.getByRole('searchbox', { name: 'البحث في المستخدمين' }), {
      target: { value: 'sara' },
    });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    await waitFor(() =>
      expect(api.calls.some((call) => call.url.includes('search=sara'))).toBe(true),
    );
    expect(router.state.location.href).not.toContain('sara');

    fireEvent.change(screen.getByRole('combobox', { name: 'حالة الوصول' }), {
      target: { value: 'SUSPENDED' },
    });
    await waitFor(() => expect(router.state.location.search).toEqual({ accessState: 'SUSPENDED' }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) => call.url.includes('accessState=SUSPENDED') && call.url.includes('search=sara'),
        ),
      ).toBe(true),
    );
  });

  it('tells no users from no matching results', async () => {
    fakeApi({ 'GET /api/iam/users': () => json(200, page([])) }, ['iam.users.read']);
    renderAt('/users?accessState=DISABLED');
    expect(await screen.findByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeTruthy();
    expect(screen.queryByText('لا يوجد مستخدمون بعد')).toBeNull();
    expect(screen.queryByRole('button', { name: 'إضافة مستخدم' })).toBeNull();
  });

  it('shows an empty directory with no invitation action to a reader without iam.users.create', async () => {
    fakeApi({ 'GET /api/iam/users': () => json(200, page([])) }, ['iam.users.read']);
    renderAt('/users');
    expect(await screen.findByText('لا يوجد مستخدمون بعد')).toBeTruthy();
    expect(screen.getByText('لم يُضف أي مستخدم بعد.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'إضافة مستخدم' })).toBeNull();
  });

  it('keeps paging in the address and returns to the first page when the filter changes', async () => {
    const api = fakeApi({
      'GET /api/iam/users': () => json(200, { ...page([summary()], 60), page: 2, pageSize: 50 }),
    });
    const { router } = renderAt('/users?page=2&pageSize=50&accessState=NOPE');
    await screen.findByRole('link', { name: 'سارة' });
    // An unknown filter value is dropped, not sent.
    expect(api.calls.some((call) => call.url === '/api/iam/users?page=2&pageSize=50')).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'حالة الوصول' }), {
      target: { value: 'ACTIVE' },
    });
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ pageSize: 50, accessState: 'ACTIVE' }),
    );
  });

  it('presents a refusal as missing access and a failure as an error, never as empty', async () => {
    fakeApi({ 'GET /api/iam/users': () => problem(403, 'AUTHORIZATION_DENIED') }, [
      'iam.users.read',
    ]);
    renderAt('/users');
    expect(await screen.findByText('لا تملك صلاحية الوصول إلى هذه الصفحة')).toBeTruthy();
    expect(screen.queryByText('لا يوجد مستخدمون بعد')).toBeNull();
  });

  it('shows an unreadable answer as a load failure with a retry', async () => {
    fakeApi({ 'GET /api/iam/users': () => json(200, { unexpected: true }) });
    renderAt('/users');
    // Reads are retried twice after a failure (query client) before the error is shown.
    expect(await screen.findByText('تعذّر تحميل المستخدمين', {}, { timeout: 8_000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeTruthy();
  }, 10_000);
});

describe('creating a user', () => {
  it('requires email and password without another verification field', async () => {
    const api = fakeApi({});
    renderAt('/users/new');
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة المستخدم' }));
    expect(await screen.findByText('أدخل البريد الإلكتروني.', { selector: 'a' })).toBeTruthy();
    expect(api.unsafe()).toEqual([]);
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(screen.getByLabelText(/كلمة المرور/)).toBeTruthy();
  });

  it('does not offer the form without iam.users.create (review AB-1)', async () => {
    const api = fakeApi({}, ['iam.users.read', 'iam.departments.read', 'iam.roles.read']);
    renderAt('/users/new');
    expect(await screen.findByText('لا تملك صلاحية الوصول إلى هذه الصفحة')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(api.calls.some((call) => call.url.startsWith('/api/iam/departments'))).toBe(false);
  });

  it('creates with memberships and roles, then opens the user with its reported states', async () => {
    const api = fakeApi({
      'POST /api/iam/users': () =>
        json(201, {
          user: user({
            accessState: 'INVITED',
            identitySyncState: 'FAILED',
            invitationDeliveryState: 'NOT_SENT',
            firstActivatedAt: null,
            invitationSentAt: null,
          }),
        }),
      [detailRoute]: () =>
        json(
          200,
          detail({
            accessState: 'INVITED',
            identitySyncState: 'FAILED',
            invitationDeliveryState: 'NOT_SENT',
            firstActivatedAt: null,
            invitationSentAt: null,
          }),
        ),
    });
    const { router } = renderAt('/users/new');
    fireEvent.change(await screen.findByLabelText(/البريد الإلكتروني/), {
      target: { value: ' sara@example.test ' },
    });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), {
      target: { value: 'a secure employee password 4!' },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'العمليات' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'القسم الرئيسي' }), {
      target: { value: OPS },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'محرر' }));
    fireEvent.click(screen.getByRole('button', { name: 'إضافة المستخدم' }));

    expect(await screen.findByText('أُضيف المستخدم')).toBeTruthy();
    const [create] = api.unsafe();
    expect(create).toMatchObject({
      method: 'POST',
      url: '/api/iam/users',
      csrf: 'csrf-token',
      body: {
        email: 'sara@example.test',
        password: 'a secure employee password 4!',
        memberships: [{ departmentId: OPS, isPrimary: true }],
        roleIds: [EDITOR],
      },
    });
    expect(router.state.location.pathname).toBe(detailPath);
    // The one-time flag leaves the address.
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    const facts = screen.getByRole('region', { name: 'حالة الحساب' });
    expect(facts.textContent).toContain('بانتظار أول دخول');
    expect(facts.textContent).not.toContain('الدعوة');
  });

  it('asks for deliberate confirmation before creating a System Administrator', async () => {
    const api = fakeApi({ 'POST /api/iam/users': () => problem(409, 'IAM_EMAIL_CONFLICT') });
    renderAt('/users/new');
    fireEvent.change(await screen.findByLabelText(/البريد الإلكتروني/), {
      target: { value: 'sara@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), {
      target: { value: 'a secure employee password 5!' },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'مسؤول النظام' }));
    fireEvent.click(screen.getByRole('button', { name: 'إضافة المستخدم' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'إسناد دور مسؤول النظام' });
    expect(dialog.textContent).toContain('sara@example.test');
    expect(api.unsafe()).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'إسناد دور مسؤول النظام' }));

    // A taken email is shown on its field; the form keeps the input.
    expect(
      await screen.findByText('يوجد مستخدم بهذا البريد الإلكتروني.', { selector: 'a' }),
    ).toBeTruthy();
    expect((screen.getByLabelText(/البريد الإلكتروني/) as HTMLInputElement).value).toBe(
      'sara@example.test',
    );
  });
});

describe('the user detail', () => {
  it('shows first sign-in pending without invitation or identity-provider status', async () => {
    fakeApi({
      [detailRoute]: () => json(200, detail({ accessState: 'INVITED', firstActivatedAt: null })),
    });
    renderAt(detailPath);
    const facts = await screen.findByRole('region', { name: 'حالة الحساب' });
    expect(facts.textContent).toContain('بانتظار أول دخول');
    expect(facts.textContent).not.toContain('الدعوة');
    expect(facts.textContent).not.toContain('المزامنة');
    expect(screen.getByRole('region', { name: 'الملف' }).textContent).toContain('لم يُفعَّل بعد');
  });

  it('omits invitation delivery after the user left INVITED', async () => {
    fakeApi({ [detailRoute]: () => json(200, detail()) });
    renderAt(detailPath);
    const facts = await screen.findByRole('region', { name: 'حالة الحساب' });
    expect(facts.textContent).not.toContain('الدعوة');
  });

  it('offers only the actions the permission codes and the access state admit', async () => {
    fakeApi({ [detailRoute]: () => json(200, detail({ accessState: 'SUSPENDED' })) }, [
      'iam.users.read',
      'iam.users.manage-access',
    ]);
    renderAt(detailPath);
    const menu = await openUserActions();
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['إعادة تفعيل الوصول', 'تعطيل المستخدم', 'إنهاء الوصول نهائيًا']);
    // No iam.users.update, manage-roles or manage-departments: no such controls.
    expect(screen.queryByRole('button', { name: 'تعديل الاسم' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إسناد دور' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إضافة إلى قسم' })).toBeNull();
    expect(screen.queryByRole('button', { name: /إزالة دور/ })).toBeNull();
  });

  it('shows no action menu to a reader', async () => {
    fakeApi({ [detailRoute]: () => json(200, detail()) }, ['iam.users.read']);
    renderAt(detailPath);
    await screen.findByRole('region', { name: 'حالة الحساب' });
    expect(screen.queryByRole('button', { name: 'إجراءات المستخدم' })).toBeNull();
  });

  it('confirms a suspension naming the target and consequence, sends the reason and reports the result', async () => {
    let state = 'ACTIVE';
    const api = fakeApi({
      [detailRoute]: () => json(200, detail({ accessState: state })),
      [`POST /api/iam/users/${TARGET_ID}/suspend`]: () => {
        state = 'SUSPENDED';
        return json(200, { user: user({ accessState: 'SUSPENDED' }), sessionsRevoked: 2 });
      },
    });
    renderAt(detailPath);

    const dialog = await chooseAction('إيقاف الوصول مؤقتًا');
    expect(
      within(dialog).getByRole('heading', { name: 'إيقاف وصول المستخدم مؤقتًا؟' }),
    ).toBeTruthy();
    expect(dialog.textContent).toContain('سارة');
    expect(dialog.textContent).toContain('sara@example.test');
    expect(dialog.textContent).toContain('تُنهى جلساته فورًا');
    // The safe action has the initial focus (DESIGN_SYSTEM Section 35).
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'إلغاء' })),
    );
    expect(api.unsafe()).toEqual([]);

    fireEvent.change(within(dialog).getByLabelText(/السبب/), { target: { value: '  إجازة  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إيقاف الوصول مؤقتًا' }));

    expect(await screen.findByText('تم إيقاف الوصول مؤقتًا')).toBeTruthy();
    expect(screen.getByText(/أُنهيت الجلسات النشطة: 2/)).toBeTruthy();
    expect(api.unsafe()).toEqual([
      {
        method: 'POST',
        url: `/api/iam/users/${TARGET_ID}/suspend`,
        body: { reason: 'إجازة' },
        csrf: 'csrf-token',
      },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'حالة الحساب' }).textContent).toContain(
        'موقوف مؤقتًا',
      ),
    );
  });

  it('warns when the target is the signed-in administrator', async () => {
    fakeApi({ [`GET /api/iam/users/${ADMIN.id}`]: () => json(200, detail({ id: ADMIN.id })) });
    renderAt(`/users/${ADMIN.id}`);
    const dialog = await chooseAction('إنهاء الجلسات');
    expect(dialog.textContent).toContain('هذا حسابك أنت');
  });

  it.each([
    ['ACTIVE', 'أُعيد الوصول: الحالة الآن «نشط»'],
    ['INVITED', 'أُعيد إلى «بانتظار أول دخول»'],
  ])('states the reactivation target the backend derived (%s)', async (target, message) => {
    const api = fakeApi({
      [detailRoute]: () => json(200, detail({ accessState: 'DISABLED' })),
      [`POST /api/iam/users/${TARGET_ID}/reactivate`]: () =>
        json(200, { user: user({ accessState: target }), target }),
    });
    renderAt(detailPath);
    const dialog = await chooseAction('إعادة تفعيل الوصول');
    // The confirmation explains both outcomes without predicting one.
    expect(dialog.textContent).toContain('يحدد الخادم النتيجة');
    // Restoring access is not a harmful commitment: primary, not danger (DS Section 35).
    expect(
      within(dialog)
        .getByRole('button', { name: 'إعادة تفعيل الوصول' })
        .getAttribute('data-intent'),
    ).not.toBe('danger');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إعادة تفعيل الوصول' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(api.unsafe()[0]?.body).toEqual({ expectedVersion: 3 });
  });

  it('explains a refusal in the dialog and keeps the reason; a rule refusal needs no reload', async () => {
    let reads = 0;
    fakeApi({
      [detailRoute]: () => {
        reads += 1;
        return json(200, detail());
      },
      [`POST /api/iam/users/${TARGET_ID}/disable`]: () => problem(409, 'IAM_LAST_SYSTEM_ADMIN'),
    });
    renderAt(detailPath);
    const dialog = await chooseAction('تعطيل المستخدم');
    fireEvent.change(within(dialog).getByLabelText(/السبب/), { target: { value: 'تحقيق' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'تعطيل المستخدم' }));
    expect(
      await within(dialog).findByText('يجب أن يبقى مسؤول نظام نشط واحد على الأقل.'),
    ).toBeTruthy();
    expect((within(dialog).getByLabelText(/السبب/) as HTMLTextAreaElement).value).toBe('تحقيق');
    expect(reads).toBe(1);
  });

  it('reloads the user after a refusal that means its state changed', async () => {
    let reads = 0;
    fakeApi({
      [detailRoute]: () => {
        reads += 1;
        return json(200, detail());
      },
      [`POST /api/iam/users/${TARGET_ID}/suspend`]: () =>
        problem(409, 'IAM_INVALID_ACCESS_TRANSITION'),
    });
    renderAt(detailPath);
    const dialog = await chooseAction('إيقاف الوصول مؤقتًا');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إيقاف الوصول مؤقتًا' }));
    expect(await within(dialog).findByText(/لا تسمح حالة الوصول الحالية/)).toBeTruthy();
    await waitFor(() => expect(reads).toBe(2));
  });

  it('offers only session revocation for a TERMINATED user', async () => {
    fakeApi({ [detailRoute]: () => json(200, detail({ accessState: 'TERMINATED' })) });
    renderAt(detailPath);
    const items = within(await openUserActions())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['إنهاء الجلسات']);
  });

  it('offers no invitation action while awaiting first sign-in', async () => {
    fakeApi({ [detailRoute]: () => json(200, detail({ accessState: 'INVITED' })) });
    renderAt(detailPath);
    const items = within(await openUserActions())
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(items).not.toContain('إعادة إرسال الدعوة');
    expect(items).not.toContain('إعادة تفعيل الوصول');
  });

  it('treats a lost answer as unconfirmed and reads the user again before any repeat', async () => {
    let reads = 0;
    fakeApi({
      [detailRoute]: () => {
        reads += 1;
        return json(200, detail());
      },
      [`POST /api/iam/users/${TARGET_ID}/terminate`]: () =>
        Promise.reject(new TypeError('offline')),
    });
    renderAt(detailPath);
    const dialog = await chooseAction('إنهاء الوصول نهائيًا');
    expect(dialog.textContent).toContain('لا يمكن التراجع عنه');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنهاء الوصول نهائيًا' }));
    expect(await within(dialog).findByText(/لم تتأكد النتيجة/)).toBeTruthy();
    await waitFor(() => expect(reads).toBe(2));
  });

  it('asks to try again after a CSRF refusal instead of reporting a connectivity problem (S-5)', async () => {
    fakeApi({
      [detailRoute]: () => json(200, detail()),
      [`POST /api/iam/users/${TARGET_ID}/revoke-sessions`]: () =>
        problem(403, 'CSRF_VALIDATION_FAILED'),
    });
    renderAt(detailPath);
    const dialog = await chooseAction('إنهاء الجلسات');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنهاء الجلسات' }));
    expect(await within(dialog).findByText('تعذّر التحقق من الطلب. أعد المحاولة.')).toBeTruthy();
  });

  it('reports local session revocation', async () => {
    fakeApi({
      [detailRoute]: () => json(200, detail()),
      [`POST /api/iam/users/${TARGET_ID}/revoke-sessions`]: () => json(200, { sessionsRevoked: 1 }),
    });
    renderAt(detailPath);
    const dialog = await chooseAction('إنهاء الجلسات');
    expect(dialog.textContent).toContain('لا تتغير حالة وصوله');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنهاء الجلسات' }));
    expect(await screen.findByText(/أُنهيت الجلسات النشطة: 1/)).toBeTruthy();
  });

  it('removes the user data when the administrator loses iam.users.read (review AB-2)', async () => {
    let codes = ALL_CODES;
    let denied = false;
    fakeApi({
      'GET /api/iam/me': () => json(200, { user: ADMIN, departments: [], permissionCodes: codes }),
      [detailRoute]: () => (denied ? problem(403, 'AUTHORIZATION_DENIED') : json(200, detail())),
    });
    const { client } = renderAt(detailPath);
    expect(await screen.findByRole('region', { name: 'الملف' })).toBeTruthy();
    expect(client.getQueryData(['iam', 'users', 'detail', TARGET_ID])).toBeDefined();

    codes = [];
    denied = true;
    await client.refetchQueries({ queryKey: ['auth'] });

    await waitFor(() => expect(screen.queryByText('sara@example.test')).toBeNull());
    expect(await screen.findByText('لا تملك صلاحية الوصول إلى هذه الصفحة')).toBeTruthy();
    expect(client.getQueryData(['iam', 'users', 'detail', TARGET_ID])).toBeUndefined();
  });

  it('shows a missing user as not found', async () => {
    fakeApi({ [detailRoute]: () => problem(404, 'IAM_USER_NOT_FOUND') });
    renderAt(detailPath);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'المستخدم غير موجود' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'العودة إلى المستخدمين' })).toBeTruthy();
  });

  it('renders in English', async () => {
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' }));
    fakeApi({ [detailRoute]: () => json(200, detail({ accessState: 'INVITED' })) });
    renderAt(detailPath);
    const facts = await screen.findByRole('region', { name: 'Account status' });
    expect(facts.textContent).toContain('Awaiting first sign-in');
    expect(facts.textContent).not.toContain('Invitation');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('editing the display name', () => {
  it('keeps the draft on a stale write, loads the latest version and saves against it', async () => {
    let version = 3;
    let name = 'سارة';
    const api = fakeApi({
      [detailRoute]: () => json(200, detail({ version, displayName: name })),
      [`PATCH /api/iam/users/${TARGET_ID}`]: (call) => {
        const body = call.body as { expectedVersion: number; displayName: string };
        if (body.expectedVersion !== version) return problem(409, 'IAM_VERSION_CONFLICT');
        name = body.displayName;
        version += 1;
        return json(200, user({ displayName: name, version }));
      },
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الاسم' }));
    const dialog = await screen.findByRole('dialog', { name: 'تعديل الاسم المعروض' });
    // Someone else saves first.
    version = 4;
    name = 'سارة أحمد';
    fireEvent.change(within(dialog).getByLabelText(/الاسم المعروض/), {
      target: { value: 'سارة خالد' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التغييرات' }));

    expect(await within(dialog).findByText('تغيّر السجل منذ فتحه')).toBeTruthy();
    expect((within(dialog).getByLabelText(/الاسم المعروض/) as HTMLInputElement).value).toBe(
      'سارة خالد',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'تحميل أحدث نسخة' }));
    expect(await within(dialog).findByText(/حُمّلت أحدث نسخة/)).toBeTruthy();
    expect(dialog.textContent).toContain('سارة أحمد');
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التغييرات' }));

    expect(await screen.findByText('تم حفظ الاسم')).toBeTruthy();
    expect(api.unsafe().map((call) => call.body)).toEqual([
      { expectedVersion: 3, displayName: 'سارة خالد' },
      { expectedVersion: 4, displayName: 'سارة خالد' },
    ]);
  });
});

describe('roles and departments of a user', () => {
  it('assigns the System Administrator role only through a warned, explicitly named action', async () => {
    const api = fakeApi({
      [detailRoute]: () => json(200, detail()),
      [`POST /api/iam/users/${TARGET_ID}/roles`]: () => problem(403, 'IAM_GRANT_EXCEEDS_ACTOR'),
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'إسناد دور' }));
    const dialog = await screen.findByRole('dialog', { name: 'إسناد دور إلى المستخدم' });
    expect(dialog.textContent).toContain('سارة');
    expect(dialog.textContent).toContain('sara@example.test');
    const select = within(dialog).getByRole('combobox', { name: /الدور/ });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    // A role the user already holds is not offered again.
    expect(within(select).queryByRole('option', { name: 'محرر' })).toBeNull();
    fireEvent.change(select, { target: { value: SYSTEM } });
    expect(within(dialog).getByText(/يمنح دور مسؤول النظام كل صلاحيات/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/السبب/), { target: { value: 'مناوبة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إسناد دور مسؤول النظام' }));

    expect(await within(dialog).findByText('لا يمكنك منح صلاحيات لا تملكها.')).toBeTruthy();
    expect(api.unsafe()[0]?.body).toEqual({ roleId: SYSTEM, reason: 'مناوبة' });
  });

  it('removes a role with its reason in the request body (IAM-R08B D-02)', async () => {
    const api = fakeApi({
      [detailRoute]: () => json(200, detail()),
      [`DELETE /api/iam/users/${TARGET_ID}/roles/${EDITOR}`]: () =>
        new Response(null, { status: 204 }),
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'إزالة دور محرر' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'إزالة الدور من المستخدم؟' });
    expect(dialog.textContent).toContain('sara@example.test');
    expect(dialog.textContent).toContain('محرر');
    fireEvent.change(within(dialog).getByLabelText(/السبب/), { target: { value: 'انتهت المهمة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إزالة الدور' }));
    expect(await screen.findByText('أُزيل الدور')).toBeTruthy();
    expect(api.unsafe()).toEqual([
      {
        method: 'DELETE',
        url: `/api/iam/users/${TARGET_ID}/roles/${EDITOR}`,
        body: { reason: 'انتهت المهمة' },
        csrf: 'csrf-token',
      },
    ]);
  });

  it('warns before removing the System Administrator role', async () => {
    fakeApi({
      [detailRoute]: () =>
        json(
          200,
          detail({
            roles: [
              {
                id: SYSTEM,
                code: 'system-administrator',
                name: 'مسؤول النظام',
                state: 'ACTIVE',
                isSystem: true,
              },
            ],
          }),
        ),
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'إزالة دور مسؤول النظام' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('لا يمكن إزالة آخر مسؤول نظام نشط');
  });

  it('removes the primary membership with an explicitly chosen replacement', async () => {
    const api = fakeApi({
      [detailRoute]: () => json(200, detail()),
      [`DELETE /api/iam/users/${TARGET_ID}/departments/${OPS}`]: () =>
        json(200, { primaryDepartmentId: SALES }),
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'إجراءات قسم العمليات' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'إزالة من القسم' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'إزالة المستخدم من القسم؟' });
    expect(dialog.textContent).toContain('سارة');
    expect(dialog.textContent).toContain('sara@example.test');
    expect(dialog.textContent).toContain('العمليات · رئيسي');
    expect(dialog.textContent).toContain('لا تتغير أدواره ولا صلاحياته');
    fireEvent.change(within(dialog).getByRole('combobox', { name: /القسم الرئيسي الجديد/ }), {
      target: { value: SALES },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إزالة من القسم' }));
    expect(await screen.findByText('أُزيل المستخدم من القسم')).toBeTruthy();
    expect(api.unsafe()[0]).toMatchObject({
      method: 'DELETE',
      url: `/api/iam/users/${TARGET_ID}/departments/${OPS}?replacementPrimaryDepartmentId=${SALES}`,
      body: undefined,
    });
  });

  it('removes a secondary membership without a replacement and a role without a reason', async () => {
    const api = fakeApi({
      [detailRoute]: () => json(200, detail()),
      [`DELETE /api/iam/users/${TARGET_ID}/departments/${SALES}`]: () =>
        json(200, { primaryDepartmentId: OPS }),
      [`DELETE /api/iam/users/${TARGET_ID}/roles/${EDITOR}`]: () =>
        new Response(null, { status: 204 }),
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'إجراءات قسم المبيعات' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'إزالة من القسم' }));
    const membership = await screen.findByRole('alertdialog');
    // Only the primary membership asks for a replacement.
    expect(within(membership).queryByRole('combobox')).toBeNull();
    fireEvent.click(within(membership).getByRole('button', { name: 'إزالة من القسم' }));
    expect(await screen.findByText('أُزيل المستخدم من القسم')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'إزالة دور محرر' }));
    const role = await screen.findByRole('alertdialog', { name: 'إزالة الدور من المستخدم؟' });
    fireEvent.change(within(role).getByLabelText(/السبب/), { target: { value: '   ' } });
    fireEvent.click(within(role).getByRole('button', { name: 'إزالة الدور' }));
    expect(await screen.findByText('أُزيل الدور')).toBeTruthy();
    expect(api.unsafe().map(({ url, body }) => [url, body])).toEqual([
      [`/api/iam/users/${TARGET_ID}/departments/${SALES}`, undefined],
      [`/api/iam/users/${TARGET_ID}/roles/${EDITOR}`, undefined],
    ]);
  });

  it('re-reads the own access after removing one of the administrator’s own roles', async () => {
    let sessionReads = 0;
    fakeApi({
      [`GET /api/iam/users/${ADMIN.id}`]: () => json(200, detail({ id: ADMIN.id })),
      [`DELETE /api/iam/users/${ADMIN.id}/roles/${EDITOR}`]: () =>
        new Response(null, { status: 204 }),
      'GET /api/auth/session': () => {
        sessionReads += 1;
        return json(200, {
          user: ADMIN,
          session: {
            idleExpiresAt: '2026-09-24T10:00:00.000Z',
            absoluteExpiresAt: '2026-09-24T18:00:00.000Z',
          },
        });
      },
    });
    renderAt(`/users/${ADMIN.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'إزالة دور محرر' }));
    const dialog = await screen.findByRole('alertdialog');
    const before = sessionReads;
    fireEvent.click(within(dialog).getByRole('button', { name: 'إزالة الدور' }));
    expect(await screen.findByText('أُزيل الدور')).toBeTruthy();
    await waitFor(() => expect(sessionReads).toBeGreaterThan(before));
  });

  it('hides pickers without read access to departments and roles', async () => {
    fakeApi({ [detailRoute]: () => json(200, detail()) }, [
      'iam.users.read',
      'iam.users.manage-departments',
      'iam.users.manage-roles',
    ]);
    renderAt(detailPath);
    await screen.findByRole('region', { name: 'الملف' });
    expect(screen.queryByRole('button', { name: 'إضافة إلى قسم' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إسناد دور' })).toBeNull();
    // Removal needs no picker, so it stays available.
    expect(screen.getByRole('button', { name: 'إزالة دور محرر' })).toBeTruthy();
  });

  it('says when a picker lists only the first page of a longer list', async () => {
    fakeApi({
      [detailRoute]: () => json(200, detail()),
      'GET /api/iam/roles': () =>
        json(200, {
          ...page([
            {
              id: SYSTEM,
              code: 'x',
              name: 'دور',
              description: null,
              state: 'ACTIVE',
              isSystem: false,
              version: 1,
            },
          ]),
          total: 140,
        }),
    });
    renderAt(detailPath);
    fireEvent.click(await screen.findByRole('button', { name: 'إسناد دور' }));
    expect(await screen.findByText('تُعرض أول 100 من أصل 140.')).toBeTruthy();
  });

  it('adds a membership and re-reads the administrator’s own access after changing their own grants', async () => {
    let sessionReads = 0;
    const api = fakeApi({
      [`GET /api/iam/users/${ADMIN.id}`]: () =>
        json(200, detail({ id: ADMIN.id, departments: [] })),
      [`POST /api/iam/users/${ADMIN.id}/departments`]: () =>
        json(201, { departmentId: SALES, isPrimary: true, demotedPrimaryDepartmentId: null }),
      'GET /api/auth/session': () => {
        sessionReads += 1;
        return json(200, {
          user: ADMIN,
          session: {
            idleExpiresAt: '2026-09-24T10:00:00.000Z',
            absoluteExpiresAt: '2026-09-24T18:00:00.000Z',
          },
        });
      },
    });
    renderAt(`/users/${ADMIN.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة إلى قسم' }));
    const dialog = await screen.findByRole('dialog', { name: 'إضافة المستخدم إلى قسم' });
    const select = within(dialog).getByRole('combobox', { name: /القسم/ });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    fireEvent.change(select, { target: { value: SALES } });
    // A first membership is proposed as primary.
    expect(
      (within(dialog).getByRole('checkbox', { name: 'اجعله القسم الرئيسي' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    const before = sessionReads;
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(await screen.findByText('أُضيف المستخدم إلى القسم')).toBeTruthy();
    expect(api.unsafe()[0]?.body).toEqual({ departmentId: SALES, isPrimary: true });
    await waitFor(() => expect(sessionReads).toBeGreaterThan(before));
  });
});
