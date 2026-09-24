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
const OPS = '0b7c7f2e-0000-4000-8000-0000000000d1';
const EDITOR = '0b7c7f2e-0000-4000-8000-0000000000e1';

const ALL_CODES = [
  'iam.departments.manage',
  'iam.departments.read',
  'iam.permissions.read',
  'iam.roles.manage',
  'iam.roles.read',
  'iam.users.read',
];

function department(overrides: Record<string, unknown> = {}) {
  return {
    id: OPS,
    code: 'ops',
    name: 'العمليات',
    description: 'فريق التشغيل',
    state: 'ACTIVE',
    version: 4,
    ...overrides,
  };
}

function role(overrides: Record<string, unknown> = {}) {
  return {
    id: EDITOR,
    code: 'editor',
    name: 'محرر',
    description: null,
    state: 'ACTIVE',
    isSystem: false,
    version: 2,
    permissionCodes: ['iam.users.read'],
    ...overrides,
  };
}

function permission(code: string, overrides: Record<string, unknown> = {}) {
  return {
    code,
    owningModule: code.split('.')[0],
    name: `اسم ${code}`,
    description: `وصف ${code}`,
    state: 'ACTIVE',
    sensitivity: 'STANDARD',
    ...overrides,
  };
}

const CATALOG = [
  permission('iam.users.read'),
  permission('iam.users.create', { sensitivity: 'SENSITIVE' }),
  permission('iam.roles.manage', { sensitivity: 'PRIVILEGED' }),
  permission('crm.leads.read'),
  permission('iam.legacy.export', { state: 'DEPRECATED' }),
];

const page = (items: unknown[], total = items.length) => ({ items, page: 1, pageSize: 25, total });

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  });
}
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { status, code, ...extra });

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
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
    'GET /api/iam/permissions': () => json(200, page(CATALOG)),
    'GET /api/iam/users': () => json(200, page([], 7)),
    ...routes,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const call: Call = {
        method,
        url,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
      calls.push(call);
      const handler = all[`${method} ${url.split('?')[0] ?? url}`];
      return handler === undefined
        ? Promise.reject(new Error(`Unexpected request ${method} ${url}`))
        : Promise.resolve(handler(call));
    }),
  );
  return { calls, unsafe: () => calls.filter((call) => call.method !== 'GET') };
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

const departmentRoute = `GET /api/iam/departments/${OPS}`;
const roleRoute = `GET /api/iam/roles/${EDITOR}`;

beforeEach(() => forgetCsrfToken());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('navigation', () => {
  it('shows each administration destination only for its read permission (D-03)', async () => {
    fakeApi({}, ['iam.roles.read']);
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'فتح التنقل' }));
    const navigation = await screen.findByRole('dialog');
    expect(within(navigation).getByRole('link', { name: 'الأدوار' }).getAttribute('href')).toBe(
      '/roles',
    );
    expect(within(navigation).queryByRole('link', { name: 'الأقسام' })).toBeNull();
    expect(within(navigation).queryByRole('link', { name: 'الصلاحيات' })).toBeNull();
    expect(within(navigation).queryByRole('link', { name: 'المستخدمون' })).toBeNull();
  });

  it('lists departments and permissions for their read permissions', async () => {
    fakeApi({}, ['iam.departments.read', 'iam.permissions.read']);
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'فتح التنقل' }));
    const navigation = await screen.findByRole('dialog');
    expect(within(navigation).getByRole('link', { name: 'الأقسام' })).toBeTruthy();
    expect(within(navigation).getByRole('link', { name: 'الصلاحيات' })).toBeTruthy();
    expect(within(navigation).queryByRole('link', { name: 'الأدوار' })).toBeNull();
  });
});

describe('departments', () => {
  it('lists departments with their state; the state filter lives in the address', async () => {
    const api = fakeApi({
      'GET /api/iam/departments': () =>
        json(
          200,
          page([department(), department({ id: 'x', name: 'الأرشيف', state: 'INACTIVE' })]),
        ),
    });
    const { router } = renderAt('/departments');
    const table = await screen.findByRole('table', { name: 'قائمة الأقسام' });
    await waitFor(() => expect(table.textContent).toContain('الأرشيف'));
    expect(table.textContent).toContain('غير نشط');
    expect(within(table).getByRole('link', { name: 'العمليات' }).getAttribute('href')).toBe(
      `/departments/${OPS}`,
    );
    expect(screen.getByRole('button', { name: 'قسم جديد' })).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'الحالة' }), {
      target: { value: 'INACTIVE' },
    });
    await waitFor(() => expect(router.state.location.search).toEqual({ state: 'INACTIVE' }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) =>
            call.url.startsWith('/api/iam/departments?') && call.url.includes('state=INACTIVE'),
        ),
      ).toBe(true),
    );
  });

  it('ignores an invalid state read from the address and offers no creation without manage', async () => {
    const api = fakeApi({ 'GET /api/iam/departments': () => json(200, page([department()])) }, [
      'iam.departments.read',
    ]);
    renderAt('/departments?state=NOPE');
    await screen.findByRole('link', { name: 'العمليات' });
    expect(api.calls.some((call) => call.url.includes('NOPE'))).toBe(false);
    expect(screen.queryByRole('button', { name: 'قسم جديد' })).toBeNull();
  });

  it('creates a department and opens it with the result', async () => {
    const api = fakeApi({
      'GET /api/iam/departments': () => json(200, page([])),
      'POST /api/iam/departments': () => json(201, department({ description: null, version: 1 })),
      [departmentRoute]: () => json(200, department({ description: null, version: 1 })),
    });
    const { router } = renderAt('/departments');
    fireEvent.click(await screen.findByRole('button', { name: 'قسم جديد' }));
    const dialog = await screen.findByRole('dialog', { name: 'قسم جديد' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الرمز/ }), {
      target: { value: ' ops ' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الاسم/ }), {
      target: { value: 'العمليات' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء القسم' }));

    expect(await screen.findByText('أُنشئ القسم')).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/departments/${OPS}`);
    expect(api.unsafe()[0]?.body).toEqual({ code: 'ops', name: 'العمليات' });
  });

  it('shows a taken code and an invalid code on the code field', async () => {
    let answer = problem(409, 'IAM_DEPARTMENT_CODE_CONFLICT');
    fakeApi({
      'GET /api/iam/departments': () => json(200, page([])),
      'POST /api/iam/departments': () => answer,
    });
    renderAt('/departments');
    fireEvent.click(await screen.findByRole('button', { name: 'قسم جديد' }));
    const dialog = await screen.findByRole('dialog', { name: 'قسم جديد' });
    const code = within(dialog).getByRole('textbox', { name: /الرمز/ });
    fireEvent.change(code, { target: { value: 'ops' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الاسم/ }), {
      target: { value: 'العمليات' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء القسم' }));
    expect(await within(dialog).findByText('يوجد قسم بهذا الرمز.')).toBeTruthy();
    expect(code.getAttribute('aria-invalid')).toBe('true');

    answer = problem(400, 'VALIDATION_FAILED', { fields: ['code'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء القسم' }));
    expect(
      await within(dialog).findByText('الرمز غير صالح. راجع القاعدة أسفل الحقل.'),
    ).toBeTruthy();
  });

  it('confirms deactivation with the department, its consequence and its member count (D-05)', async () => {
    const api = fakeApi({
      [departmentRoute]: () => json(200, department()),
      [`POST /api/iam/departments/${OPS}/deactivate`]: () =>
        json(200, department({ state: 'INACTIVE', version: 5 })),
    });
    renderAt(`/departments/${OPS}`);
    expect(await screen.findByText('عدد المستخدمين: 7')).toBeTruthy();
    expect(
      api.calls.some(
        (call) => call.url.includes(`departmentId=${OPS}`) && call.url.includes('pageSize=1'),
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'إيقاف القسم' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'إيقاف القسم؟' });
    expect(confirm.textContent).toContain('العمليات');
    expect(confirm.textContent).toContain('ops');
    expect(confirm.textContent).toContain('يخرج القسم فورًا من السياق التنظيمي لكل أعضائه');
    expect(confirm.textContent).toContain('يمكن إضافة أعضاء جدد حتى يُفعّل مرة أخرى');
    expect(confirm.textContent).toContain('عدد الأعضاء بكل حالات الوصول: 7');
    expect(api.unsafe()).toHaveLength(0);

    fireEvent.click(within(confirm).getByRole('button', { name: 'إيقاف القسم' }));
    expect(await screen.findByText('أُوقف القسم')).toBeTruthy();
    expect(api.unsafe()[0]).toMatchObject({
      method: 'POST',
      url: `/api/iam/departments/${OPS}/deactivate`,
      body: { expectedVersion: 4 },
    });
  });

  it('states no member count without iam.users.read and reads no users', async () => {
    const api = fakeApi({ [departmentRoute]: () => json(200, department()) }, [
      'iam.departments.read',
      'iam.departments.manage',
    ]);
    renderAt(`/departments/${OPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'إيقاف القسم' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.textContent).not.toContain('عدد الأعضاء');
    expect(api.calls.some((call) => call.url.startsWith('/api/iam/users'))).toBe(false);
  });

  it('keeps the confirmation and reloads when the department changed meanwhile', async () => {
    let reads = 0;
    fakeApi({
      [departmentRoute]: () => {
        reads += 1;
        return json(200, department());
      },
      [`POST /api/iam/departments/${OPS}/deactivate`]: () => problem(409, 'IAM_VERSION_CONFLICT'),
    });
    renderAt(`/departments/${OPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'إيقاف القسم' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'إيقاف القسم' }));
    expect(await within(confirm).findByText(/تغيّر السجل منذ فتحه/)).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it('activates an inactive department directly and reports it', async () => {
    const api = fakeApi({
      [departmentRoute]: () => json(200, department({ state: 'INACTIVE' })),
      [`POST /api/iam/departments/${OPS}/activate`]: () => json(200, department({ version: 5 })),
    });
    renderAt(`/departments/${OPS}`);
    expect(await screen.findByText('هذا القسم غير نشط')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تفعيل القسم' }));
    expect(await screen.findByText('فُعّل القسم')).toBeTruthy();
    expect(api.unsafe()[0]?.body).toEqual({ expectedVersion: 4 });
  });

  it('edits against the read version; a stale write keeps the draft and loads the latest (D-16)', async () => {
    let conflict = true;
    const api = fakeApi({
      [departmentRoute]: () =>
        json(200, department({ version: conflict ? 4 : 6, name: 'التشغيل' })),
      [`PATCH /api/iam/departments/${OPS}`]: () =>
        conflict ? problem(409, 'IAM_VERSION_CONFLICT') : json(200, department({ version: 7 })),
    });
    renderAt(`/departments/${OPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل' }));
    const dialog = await screen.findByRole('dialog', { name: 'تعديل الاسم والوصف' });
    const name = within(dialog).getByRole('textbox', { name: /الاسم/ });
    fireEvent.change(name, { target: { value: 'العمليات الميدانية' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الوصف/ }), {
      target: { value: '   ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await within(dialog).findByText('تغيّر السجل منذ فتحه')).toBeTruthy();
    expect((name as HTMLInputElement).value).toBe('العمليات الميدانية');

    conflict = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'تحميل أحدث نسخة' }));
    expect(await within(dialog).findByText(/حُمّلت أحدث نسخة/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByText('حُفظت التغييرات')).toBeTruthy();
    const patches = api.unsafe();
    expect(patches[0]?.body).toEqual({
      expectedVersion: 4,
      name: 'العمليات الميدانية',
      description: null,
    });
    expect(patches[1]?.body).toMatchObject({ expectedVersion: 6 });
  });
});

describe('roles', () => {
  it('presents protection by the isSystem flag, never by name or code (D-07)', async () => {
    fakeApi({
      [roleRoute]: () =>
        json(
          200,
          role({ isSystem: true, name: 'مشرفو المنصة', code: 'platform', permissionCodes: [] }),
        ),
    });
    renderAt(`/roles/${EDITOR}`);
    expect(await screen.findByText('دور نظام محمي')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تعديل' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'تعديل الصلاحيات' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إيقاف الدور' })).toBeNull();
  });

  it('treats a custom role named "System Administrator" as custom', async () => {
    fakeApi({
      [roleRoute]: () =>
        json(200, role({ name: 'System Administrator', code: 'system-administrator' })),
    });
    renderAt(`/roles/${EDITOR}`);
    expect(await screen.findByRole('button', { name: 'تعديل الصلاحيات' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إيقاف الدور' })).toBeTruthy();
    expect(screen.queryByText('دور نظام محمي')).toBeNull();
    expect(screen.getAllByText('دور مخصص').length).toBeGreaterThan(0);
  });

  it('shows mapped codes only, and no editor, without iam.permissions.read', async () => {
    const api = fakeApi({ [roleRoute]: () => json(200, role()) }, [
      'iam.roles.read',
      'iam.roles.manage',
    ]);
    renderAt(`/roles/${EDITOR}`);
    expect(await screen.findByText('iam.users.read')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تعديل الصلاحيات' })).toBeNull();
    expect(api.calls.some((call) => call.url.startsWith('/api/iam/permissions'))).toBe(false);
  });

  it('deactivates with a danger confirmation, reach and optional reason', async () => {
    const api = fakeApi({
      [roleRoute]: () => json(200, role()),
      [`POST /api/iam/roles/${EDITOR}/deactivate`]: () => json(200, role({ state: 'INACTIVE' })),
    });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'إيقاف الدور' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'إيقاف الدور؟' });
    expect(confirm.textContent).toContain('محرر');
    expect(confirm.textContent).toContain('editor');
    expect(confirm.textContent).toContain('تخرج صلاحياته من كل من يحمله');
    await waitFor(() =>
      expect(confirm.textContent).toContain('عدد حاملي الدور بكل حالات الوصول: 7'),
    );
    fireEvent.change(within(confirm).getByRole('textbox', { name: /السبب/ }), {
      target: { value: 'مراجعة فصلية' },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'إيقاف الدور' }));
    expect(await screen.findByText('أُوقف الدور')).toBeTruthy();
    expect(api.unsafe()[0]?.body).toEqual({ expectedVersion: 2, reason: 'مراجعة فصلية' });
  });

  it('confirms activation as a grant and explains a grant-ceiling refusal in place', async () => {
    const api = fakeApi({
      [roleRoute]: () =>
        json(
          200,
          role({ state: 'INACTIVE', permissionCodes: ['iam.users.read', 'iam.legacy.export'] }),
        ),
      [`POST /api/iam/roles/${EDITOR}/activate`]: () => problem(403, 'IAM_GRANT_EXCEEDS_ACTOR'),
    });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تفعيل الدور' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'تفعيل الدور؟' });
    await waitFor(() =>
      expect(confirm.textContent).toContain('الصلاحيات التي ستعود لحاملي الدور: 1'),
    );
    expect(confirm.textContent).toContain('iam.users.read');
    // A DEPRECATED mapping is not effective and is not listed as granted.
    expect(confirm.textContent).not.toContain('iam.legacy.export');
    fireEvent.click(within(confirm).getByRole('button', { name: 'تفعيل الدور' }));
    expect(await within(confirm).findByText('لا يمكنك منح صلاحيات لا تملكها.')).toBeTruthy();
    expect(api.unsafe()[0]?.body).toEqual({ expectedVersion: 2 });
  });
});

describe('the permission editor', () => {
  async function openEditor() {
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الصلاحيات' }));
    return screen.findByRole('dialog', { name: 'صلاحيات الدور «محرر»' });
  }

  it('builds the set from the ACTIVE catalog only, with no code input (D-08)', async () => {
    fakeApi({
      [roleRoute]: () =>
        json(200, role({ permissionCodes: ['iam.users.read', 'iam.legacy.export'] })),
    });
    renderAt(`/roles/${EDITOR}`);
    const editor = await openEditor();
    expect(within(editor).queryByRole('textbox')).toBeNull();
    const boxes = within(editor).getAllByRole('checkbox');
    // Two module groups plus four ACTIVE permissions; the DEPRECATED one is not a choice.
    expect(boxes).toHaveLength(6);
    expect(within(editor).queryByRole('checkbox', { name: /iam\.legacy\.export/ })).toBeNull();
    expect(editor.textContent).toContain('صلاحيات لم تعد نشطة ستُزال عند الحفظ');
    expect(editor.textContent).toContain('iam.legacy.export');
    const iamGroup = within(editor).getByRole('checkbox', { name: 'كل صلاحيات iam' });
    expect((iamGroup as HTMLInputElement).indeterminate).toBe(true);
    expect(
      (within(editor).getByRole('checkbox', { name: /iam\.users\.read/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('reviews additions and removals, warns on a privileged addition, then saves', async () => {
    const api = fakeApi({
      [roleRoute]: () =>
        json(200, role({ permissionCodes: ['iam.users.read', 'iam.legacy.export'] })),
      [`PUT /api/iam/roles/${EDITOR}/permissions`]: () =>
        json(200, role({ version: 3, permissionCodes: ['iam.roles.manage'] })),
    });
    renderAt(`/roles/${EDITOR}`);
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole('checkbox', { name: /iam\.users\.read/ }));
    fireEvent.click(within(editor).getByRole('checkbox', { name: /iam\.roles\.manage/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));

    expect(await within(editor).findByText(/تضيف صلاحية امتيازية/)).toBeTruthy();
    const added = within(editor).getByRole('heading', { name: 'ستُضاف (1)' }).parentElement;
    const removed = within(editor).getByRole('heading', { name: 'ستُزال (2)' }).parentElement;
    expect(added?.textContent).toContain('iam.roles.manage');
    expect(removed?.textContent).toContain('iam.users.read');
    expect(removed?.textContent).toContain('iam.legacy.export');
    expect(editor.textContent).toContain('عدد حاملي الدور بكل حالات الوصول: 7');
    expect(api.unsafe()).toHaveLength(0);

    fireEvent.change(within(editor).getByRole('textbox', { name: /السبب/ }), {
      target: { value: 'فصل المهام' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'حفظ تغييرات الصلاحيات' }));
    expect(await screen.findByText('حُفظت صلاحيات الدور')).toBeTruthy();
    expect(api.unsafe()[0]).toMatchObject({
      method: 'PUT',
      body: { expectedVersion: 2, permissionCodes: ['iam.roles.manage'], reason: 'فصل المهام' },
    });
  });

  it('does not open the review without a change', async () => {
    fakeApi({ [roleRoute]: () => json(200, role()) });
    renderAt(`/roles/${EDITOR}`);
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    expect(await within(editor).findByText('لم تغيّر شيئًا بعد.')).toBeTruthy();
    expect(within(editor).queryByRole('button', { name: 'حفظ تغييرات الصلاحيات' })).toBeNull();
  });

  it('keeps the choice on a stale write, shows the latest mappings and saves against them', async () => {
    let stale = true;
    const api = fakeApi({
      [roleRoute]: () =>
        json(
          200,
          stale
            ? role()
            : role({ version: 5, permissionCodes: ['iam.users.read', 'crm.leads.read'] }),
        ),
      [`PUT /api/iam/roles/${EDITOR}/permissions`]: () =>
        stale ? problem(409, 'IAM_VERSION_CONFLICT') : json(200, role({ version: 6 })),
    });
    renderAt(`/roles/${EDITOR}`);
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole('checkbox', { name: /iam\.users\.create/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    fireEvent.click(await within(editor).findByRole('button', { name: 'حفظ تغييرات الصلاحيات' }));
    expect(await within(editor).findByText('تغيّر السجل منذ فتحه')).toBeTruthy();

    stale = false;
    fireEvent.click(within(editor).getByRole('button', { name: 'تحميل أحدث نسخة' }));
    const latest = await within(editor).findByText(/حُمّلت أحدث نسخة/);
    expect(latest.closest('[role="alert"], [role="status"], div')?.textContent).toContain(
      'crm.leads.read',
    );
    // The draft is kept: iam.users.create is still chosen.
    expect(
      (within(editor).getByRole('checkbox', { name: /iam\.users\.create/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    const removed = (await within(editor).findByRole('heading', { name: 'ستُزال (1)' }))
      .parentElement;
    expect(removed?.textContent).toContain('crm.leads.read');
    fireEvent.click(within(editor).getByRole('button', { name: 'حفظ تغييرات الصلاحيات' }));
    expect(await screen.findByText('حُفظت صلاحيات الدور')).toBeTruthy();
    expect(api.unsafe()[1]?.body).toMatchObject({
      expectedVersion: 5,
      permissionCodes: ['iam.users.create', 'iam.users.read'],
    });
  });

  it('explains a refused grant and keeps the review open', async () => {
    fakeApi({
      [roleRoute]: () => json(200, role()),
      [`PUT /api/iam/roles/${EDITOR}/permissions`]: () => problem(403, 'IAM_GRANT_EXCEEDS_ACTOR'),
    });
    renderAt(`/roles/${EDITOR}`);
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole('checkbox', { name: /crm\.leads\.read/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    fireEvent.click(await within(editor).findByRole('button', { name: 'حفظ تغييرات الصلاحيات' }));
    expect(await within(editor).findByText('لا يمكنك منح صلاحيات لا تملكها.')).toBeTruthy();
    expect(within(editor).getByRole('button', { name: 'حفظ تغييرات الصلاحيات' })).toBeTruthy();
  });

  it('reloads the role when the catalog refuses a code', async () => {
    let reads = 0;
    fakeApi({
      [roleRoute]: () => {
        reads += 1;
        return json(200, role());
      },
      [`PUT /api/iam/roles/${EDITOR}/permissions`]: () =>
        problem(409, 'IAM_PERMISSION_NOT_ASSIGNABLE'),
    });
    renderAt(`/roles/${EDITOR}`);
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole('checkbox', { name: /crm\.leads\.read/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    fireEvent.click(await within(editor).findByRole('button', { name: 'حفظ تغييرات الصلاحيات' }));
    expect(await within(editor).findByText(/لم تعد نشطة ولا يمكن ربطها/)).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });
});

describe('refusals, reach and visibility (review T-1 to T-9)', () => {
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));

  it('reports an unconfirmed edit as unconfirmed and reads the department again (D-16)', async () => {
    let reads = 0;
    fakeApi({
      [departmentRoute]: () => {
        reads += 1;
        return json(200, department());
      },
      [`PATCH /api/iam/departments/${OPS}`]: offline,
    });
    renderAt(`/departments/${OPS}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل' }));
    const dialog = await screen.findByRole('dialog', { name: 'تعديل الاسم والوصف' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الاسم/ }), {
      target: { value: 'التشغيل' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await within(dialog).findByText(/حُمّلت حالة القسم الحالية/)).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it('explains the system-role protection on a role edit and reads the role again', async () => {
    let reads = 0;
    fakeApi({
      [roleRoute]: () => {
        reads += 1;
        return json(200, role());
      },
      [`PATCH /api/iam/roles/${EDITOR}`]: () => problem(409, 'IAM_SYSTEM_ROLE_PROTECTED'),
    });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل' }));
    const dialog = await screen.findByRole('dialog', { name: 'تعديل الاسم والوصف' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الاسم/ }), {
      target: { value: 'محرر أول' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await within(dialog).findByText(/دور مسؤول النظام محمي/)).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it('creates a role and opens it; a taken role code is shown on the code field', async () => {
    let taken = true;
    fakeApi({
      'GET /api/iam/roles': () => json(200, page([])),
      'POST /api/iam/roles': () =>
        taken
          ? problem(409, 'IAM_ROLE_CODE_CONFLICT')
          : json(201, role({ permissionCodes: undefined })),
      [roleRoute]: () => json(200, role({ permissionCodes: [] })),
    });
    const { router } = renderAt('/roles');
    fireEvent.click(await screen.findByRole('button', { name: 'دور جديد' }));
    const dialog = await screen.findByRole('dialog', { name: 'دور جديد' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الرمز/ }), {
      target: { value: 'editor' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /الاسم/ }), {
      target: { value: 'محرر' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء الدور' }));
    expect(await within(dialog).findByText('يوجد دور بهذا الرمز.')).toBeTruthy();

    taken = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء الدور' }));
    expect(await screen.findByText('أُنشئ الدور')).toBeTruthy();
    expect(screen.getByText('لا يمنح الدور أي صلاحية حتى تُحدَّد صلاحياته.')).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/roles/${EDITOR}`);
  });

  it('names the role, its code and its reach on activation, as a grant rather than a danger (D-06)', async () => {
    fakeApi({ [roleRoute]: () => json(200, role({ state: 'INACTIVE' })) });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تفعيل الدور' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'تفعيل الدور؟' });
    expect(confirm.textContent).toContain('محرر');
    expect(confirm.textContent).toContain('editor');
    await waitFor(() =>
      expect(confirm.textContent).toContain('عدد حاملي الدور بكل حالات الوصول: 7'),
    );
    expect(
      within(confirm).getByRole('button', { name: 'تفعيل الدور' }).getAttribute('data-intent'),
    ).not.toBe('danger');
  });

  it('warns only when a PRIVILEGED permission is added', async () => {
    fakeApi({ [roleRoute]: () => json(200, role()) });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الصلاحيات' }));
    const editor = await screen.findByRole('dialog', { name: 'صلاحيات الدور «محرر»' });
    fireEvent.click(within(editor).getByRole('checkbox', { name: /iam\.users\.create/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    expect(await within(editor).findByRole('heading', { name: 'ستُضاف (1)' })).toBeTruthy();
    expect(editor.textContent).not.toContain('تضيف صلاحية امتيازية');
  });

  it('keeps an edited permission set behind the unsaved-changes guard', async () => {
    fakeApi({ [roleRoute]: () => json(200, role()) });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الصلاحيات' }));
    const editor = await screen.findByRole('dialog', { name: 'صلاحيات الدور «محرر»' });
    fireEvent.click(within(editor).getByRole('checkbox', { name: /crm\.leads\.read/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'إلغاء' }));
    expect(await within(editor).findByRole('button', { name: /متابعة التحرير/ })).toBeTruthy();
  });

  it('says when the catalog has more entries than the editor lists', async () => {
    fakeApi({
      [roleRoute]: () => json(200, role()),
      'GET /api/iam/permissions': () => json(200, page(CATALOG, 150)),
    });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الصلاحيات' }));
    const editor = await screen.findByRole('dialog', { name: 'صلاحيات الدور «محرر»' });
    expect(editor.textContent).toContain('تُعرض أول 100 من أصل 150.');
  });

  it('offers no department or role change without the manage permissions', async () => {
    fakeApi(
      {
        [departmentRoute]: () => json(200, department()),
        [roleRoute]: () => json(200, role()),
      },
      ['iam.departments.read', 'iam.roles.read', 'iam.permissions.read'],
    );
    renderAt(`/departments/${OPS}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'العمليات' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تعديل' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إيقاف القسم' })).toBeNull();
  });

  it('offers no role change without iam.roles.manage', async () => {
    fakeApi({ [roleRoute]: () => json(200, role()) }, ['iam.roles.read', 'iam.permissions.read']);
    renderAt(`/roles/${EDITOR}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'محرر' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تعديل' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'تعديل الصلاحيات' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إيقاف الدور' })).toBeNull();
  });

  it('labels the role kind in the list by the isSystem flag, not by the name', async () => {
    fakeApi({
      'GET /api/iam/roles': () =>
        json(
          200,
          page([
            role({ name: 'System Administrator', code: 'sysadmin-lookalike' }),
            role({ id: 'other', name: 'مشرفو المنصة', code: 'platform', isSystem: true }),
          ]),
        ),
    });
    renderAt('/roles');
    const table = await screen.findByRole('table', { name: 'قائمة الأدوار' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    const [, lookalike, system] = within(table).getAllByRole('row');
    expect(lookalike?.textContent).toContain('دور مخصص');
    expect(system?.textContent).toContain('دور النظام (محمي)');
  });

  it('reads the administrator’s own access again after a role change (D-13)', async () => {
    let meReads = 0;
    fakeApi({
      'GET /api/iam/me': () => {
        meReads += 1;
        return json(200, { user: ADMIN, departments: [], permissionCodes: ALL_CODES });
      },
      [roleRoute]: () => json(200, role()),
      [`POST /api/iam/roles/${EDITOR}/deactivate`]: () => json(200, role({ state: 'INACTIVE' })),
    });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'إيقاف الدور' }));
    const confirm = await screen.findByRole('alertdialog');
    const before = meReads;
    fireEvent.click(within(confirm).getByRole('button', { name: 'إيقاف الدور' }));
    expect(await screen.findByText('أُوقف الدور')).toBeTruthy();
    await waitFor(() => expect(meReads).toBeGreaterThan(before));
  });

  it('reloads the role when a code is not registered', async () => {
    let reads = 0;
    fakeApi({
      [roleRoute]: () => {
        reads += 1;
        return json(200, role());
      },
      [`PUT /api/iam/roles/${EDITOR}/permissions`]: () => problem(422, 'IAM_UNKNOWN_PERMISSION'),
    });
    renderAt(`/roles/${EDITOR}`);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الصلاحيات' }));
    const editor = await screen.findByRole('dialog', { name: 'صلاحيات الدور «محرر»' });
    fireEvent.click(within(editor).getByRole('checkbox', { name: /crm\.leads\.read/ }));
    fireEvent.click(within(editor).getByRole('button', { name: 'مراجعة التغييرات' }));
    fireEvent.click(await within(editor).findByRole('button', { name: 'حفظ تغييرات الصلاحيات' }));
    expect(await within(editor).findByText(/غير مسجّلة في الكتالوج/)).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });
});

describe('the permission catalog', () => {
  it('is read-only and labels sensitivity and state separately', async () => {
    fakeApi({});
    renderAt('/permissions');
    const table = await screen.findByRole('table', { name: 'كتالوج الصلاحيات' });
    await waitFor(() => expect(table.textContent).toContain('iam.roles.manage'));
    expect(table.textContent).toContain('صلاحية امتيازية');
    expect(table.textContent).toContain('حساسة');
    expect(table.textContent).toContain('متقادمة');
    expect(screen.queryByRole('button', { name: /جديد|إنشاء|تعديل/ })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('directory filters (carried forward from IAM-R08B)', () => {
  it('filters users by department and role through the address and the API', async () => {
    const api = fakeApi(
      {
        'GET /api/iam/departments': () => json(200, page([department()])),
        'GET /api/iam/roles': () => json(200, page([role()])),
        'GET /api/iam/users': () => json(200, page([])),
      },
      ['iam.users.read', 'iam.departments.read', 'iam.roles.read'],
    );
    const { router } = renderAt('/users');
    const departmentFilter = await screen.findByRole('combobox', { name: 'القسم' });
    await waitFor(() => expect(departmentFilter.hasAttribute('disabled')).toBe(false));
    fireEvent.change(departmentFilter, { target: { value: OPS } });
    await waitFor(() => expect(router.state.location.search).toEqual({ departmentId: OPS }));
    const roleFilter = screen.getByRole('combobox', { name: 'الدور' });
    await waitFor(() => expect(roleFilter.hasAttribute('disabled')).toBe(false));
    fireEvent.change(roleFilter, { target: { value: EDITOR } });
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ departmentId: OPS, roleId: EDITOR }),
    );
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) =>
            call.url.includes(`departmentId=${OPS}`) &&
            call.url.includes(`roleId=${EDITOR}`) &&
            call.url.includes('pageSize=25'),
        ),
      ).toBe(true),
    );
    expect(screen.getByText('القسم: العمليات')).toBeTruthy();
  });

  it('drops an invalid identifier read from the address and hides filters without read access', async () => {
    const api = fakeApi({ 'GET /api/iam/users': () => json(200, page([])) }, ['iam.users.read']);
    renderAt('/users?departmentId=not-an-id&roleId=1');
    await screen.findByRole('table');
    expect(api.calls.some((call) => call.url.includes('not-an-id'))).toBe(false);
    expect(api.calls.some((call) => call.url.includes('roleId'))).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'القسم' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'الدور' })).toBeNull();
  });
});
