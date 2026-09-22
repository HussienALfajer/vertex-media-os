import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/ui-root';
import { Button } from './button';
import { Field, Input } from './field';
import { Alert, LoadingState, LONG_OPERATION_MS, Progress } from './feedback';
import {
  DisplayPreferences,
  ErrorSummary,
  FormActions,
  PageHeader,
  type FormIssue,
} from './patterns';
import { AppShell } from './shell';

const renderUi = (node: ReactNode) => render(<UiRoot>{node}</UiRoot>);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ErrorSummary (§28.3)', () => {
  function Form({ issues }: { issues: FormIssue[] }) {
    const [attempt, setAttempt] = useState(0);
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setAttempt((value) => value + 1);
        }}
      >
        <ErrorSummary issues={attempt > 0 ? issues : []} attempt={attempt} />
        <Field id="role-name" label="اسم الدور" error={attempt > 0 ? 'أدخل اسم الدور.' : undefined}>
          <Input defaultValue="" />
        </Field>
        <Field id="role-code" label="رمز الدور">
          <Input defaultValue="" />
        </Field>
        <FormActions>
          <Button type="submit" variant="primary">
            حفظ التغييرات
          </Button>
        </FormActions>
      </form>
    );
  }

  it('does not show errors before the first submission', () => {
    renderUi(<Form issues={[{ fieldId: 'role-name', message: 'أدخل اسم الدور.' }]} />);
    expect(screen.queryByText('أدخل اسم الدور.')).toBeNull();
  });

  it('focuses the summary for several issues and links each issue to its field', async () => {
    renderUi(
      <Form
        issues={[
          { fieldId: 'role-name', message: 'أدخل اسم الدور.' },
          { fieldId: 'role-code', message: 'الرمز مستخدم بالفعل.' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    const summary = await screen.findByText('يوجد خطآن يحتاجان إلى تصحيح');
    await waitFor(() => expect(document.activeElement).toBe(summary.parentElement));
    fireEvent.click(screen.getByRole('link', { name: 'الرمز مستخدم بالفعل.' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'رمز الدور' }));
  });

  it('focuses the field itself for a single field issue', async () => {
    renderUi(<Form issues={[{ fieldId: 'role-name', message: 'أدخل اسم الدور.' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'اسم الدور' })),
    );
  });
});

describe('page grammar and feedback', () => {
  it('renders one focusable page heading', () => {
    renderUi(
      <PageHeader
        title="المستخدمون"
        description="إدارة الوصول."
        actions={<Button variant="primary">دعوة مستخدم</Button>}
      />,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'المستخدمون' });
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('keeps an embedded header in the surrounding outline without making it the route focus target', () => {
    renderUi(<PageHeader headingLevel={3} title="عنوان تجريبي" />);
    const heading = screen.getByRole('heading', { level: 3, name: 'عنوان تجريبي' });
    expect(heading.hasAttribute('tabindex')).toBe(false);
    expect(heading.hasAttribute('data-vx-page-heading')).toBe(false);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('says that indeterminate work is still pending after ten seconds, in the same status', async () => {
    vi.useFakeTimers();
    const { container } = renderUi(<Progress label="جارٍ تصدير التقرير" />);
    const status = within(container).getByRole('status');
    expect(status.textContent).toBe('جارٍ تصدير التقرير');
    await act(() => vi.advanceTimersByTimeAsync(LONG_OPERATION_MS - 1));
    expect(status.textContent).toBe('جارٍ تصدير التقرير');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(status.textContent).toContain('لا يزال العمل جاريًا');
  });

  it('announces danger alerts assertively and other tones politely, only when asked', () => {
    renderUi(
      <>
        <Alert tone="danger" title="تعذّر الحفظ" announce />
        <Alert tone="info" title="يوجد تحديث" announce />
        <Alert tone="warning" title="قيد المراجعة" />
      </>,
    );
    expect(screen.getByRole('alert').textContent).toContain('تعذّر الحفظ');
    expect(
      screen.getAllByRole('status').some((node) => node.textContent?.includes('يوجد تحديث')),
    ).toBe(true);
    expect(screen.getByRole('region', { name: 'قيد المراجعة' })).toBeTruthy();
  });

  it('shows a skeleton only after 150ms while naming the loading region at once', async () => {
    vi.useFakeTimers();
    const { container } = renderUi(<LoadingState label="جارٍ تحميل الأدوار" />);
    expect(within(container).getByRole('status').textContent).toBe('جارٍ تحميل الأدوار');
    expect(container.querySelector('.vx-skeleton')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(149));
    expect(container.querySelector('.vx-skeleton')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(container.querySelector('.vx-skeleton')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('display preferences', () => {
  it('changes language, theme and density at the root without remounting the page', async () => {
    renderUi(
      <>
        <Field label="مسودة">
          <Input defaultValue="نص غير محفوظ" />
        </Field>
        <DisplayPreferences />
      </>,
    );
    const draft = screen.getByRole('textbox');
    fireEvent.click(screen.getByRole('button', { name: 'تفضيلات العرض' }));
    const panel = await screen.findByRole('dialog', { name: 'تفضيلات العرض' });
    fireEvent.click(within(panel).getByRole('radio', { name: 'داكن' }));
    fireEvent.click(within(panel).getByRole('radio', { name: 'مضغوطة' }));
    fireEvent.click(within(panel).getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.dataset['density']).toBe('compact');
    expect(screen.getByRole('textbox')).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe('نص غير محفوظ');
  });
});

describe('AppShell (§22.1, §23)', () => {
  const media = (width: number) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => {
        const min = /min-width: ([\d.]+)rem/.exec(query);
        return {
          matches: min ? width >= Number(min[1]) * 16 : false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
      }),
    );
  const nav = [
    {
      id: 'main',
      items: [{ id: 'home', label: 'الرئيسية', href: '/', icon: 'home' as const, current: true }],
    },
  ];

  it('shows the expanded sidebar at wide widths and lets the user collapse it to a named rail', () => {
    media(1440);
    renderUi(
      <AppShell productName="Vertex OS" homeHref="/" navigation={nav}>
        <h1>الصفحة</h1>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: /^Vertex OS.*الانتقال إلى الرئيسية$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'طي التنقل' }));
    expect(screen.getByRole('button', { name: 'توسيع التنقل' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.getByRole('link', { name: 'الرئيسية' })).toBeTruthy();
  });

  it('uses a modal navigation drawer below 768px', async () => {
    media(390);
    renderUi(
      <AppShell productName="Vertex OS" homeHref="/" navigation={nav}>
        <h1>الصفحة</h1>
      </AppShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'التنقل الرئيسي' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'فتح التنقل' }));
    const drawer = await screen.findByRole('dialog', { name: 'التنقل الرئيسي' });
    expect(
      within(drawer).getByRole('link', { name: 'الرئيسية' }).getAttribute('aria-current'),
    ).toBe('page');
  });
});
