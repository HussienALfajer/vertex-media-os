import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/ui-root';
import { Button, IconButton } from './button';
import { Field, Input } from './field';
import { AlertDialog, Dialog, DialogCancel, DropdownMenu, Popover } from './overlays';
import { useToast } from './toast';

function EditDialog({ removeOpener = false }: { removeOpener?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('سارة الخطيب');
  const [openerPresent, setOpenerPresent] = useState(true);
  const first = useRef<HTMLInputElement>(null);
  return (
    <main tabIndex={-1} data-vx-focus-fallback="">
      {openerPresent && <Button onClick={() => setOpen(true)}>تعديل المستخدم</Button>}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && removeOpener) setOpenerPresent(false);
        }}
        title="تعديل المستخدم"
        dirty={name !== 'سارة الخطيب'}
        initialFocus={first}
        actions={
          <>
            <DialogCancel />
            <Button variant="primary" onClick={() => setOpen(false)}>
              حفظ التغييرات
            </Button>
          </>
        }
      >
        <Field label="الاسم">
          <Input
            ref={first}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </Field>
        <DropdownMenu
          trigger={<IconButton icon="more" label="إجراءات إضافية" />}
          items={[
            { id: 'copy', label: 'نسخ المعرّف', onSelect: () => undefined },
            { id: 'disable', label: 'تعطيل المستخدم', intent: 'danger', onSelect: () => undefined },
            {
              id: 'audit',
              label: 'سجل التدقيق',
              disabled: true,
              description: 'يتطلب صلاحية التدقيق',
            },
          ]}
        />
      </Dialog>
    </main>
  );
}

const escape = (element: Element = document.activeElement ?? document.body) =>
  fireEvent.keyDown(element, { key: 'Escape', code: 'Escape' });

describe('Dialog', () => {
  it('is named by its title, focuses the requested field and restores the opener', async () => {
    render(
      <UiRoot>
        <EditDialog />
      </UiRoot>,
    );
    const opener = screen.getByRole('button', { name: 'تعديل المستخدم' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'تعديل المستخدم' });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'الاسم' })),
    );
    // A dialog's header and footer are not page landmarks (no extra banner/contentinfo).
    expect(within(dialog).queryByRole('banner')).toBeNull();
    expect(within(dialog).queryByRole('contentinfo')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('restores a pointer-pressed opener that the click did not focus (Safari/WebKit)', async () => {
    render(
      <UiRoot>
        <EditDialog />
      </UiRoot>,
    );
    const opener = screen.getByRole('button', { name: 'تعديل المستخدم' });
    fireEvent.pointerDown(opener);
    fireEvent.click(opener);
    expect(document.activeElement).toBe(document.body);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('falls back to the main region, never the body, when the opener disappears', async () => {
    render(
      <UiRoot>
        <EditDialog removeOpener />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تعديل المستخدم' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')));
  });

  it('guards every dismissal of a dirty form and keeps the draft', async () => {
    render(
      <UiRoot>
        <EditDialog />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تعديل المستخدم' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'الاسم' }), {
      target: { value: 'سارة' },
    });
    escape(within(dialog).getByRole('textbox'));
    const keep = await within(dialog).findByRole('button', { name: 'متابعة التحرير' });
    await waitFor(() => expect(document.activeElement).toBe(keep));
    fireEvent.click(keep);
    expect((within(dialog).getByRole('textbox', { name: 'الاسم' }) as HTMLInputElement).value).toBe(
      'سارة',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'تجاهل التغييرات' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('owns popups opened inside it and closes the topmost layer first on Escape', async () => {
    render(
      <UiRoot>
        <EditDialog />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تعديل المستخدم' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إجراءات إضافية' }));
    const menu = await screen.findByRole('menu');
    // The menu is portalled into the dialog it belongs to.
    expect(dialog.contains(menu)).toBe(true);
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    // Destructive actions are separated and placed last.
    expect(items.at(-1)).toContain('تعطيل المستخدم');
    expect(within(menu).getByRole('separator')).toBeTruthy();
    // Focus moves into the menu; Escape from there closes only the menu.
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    escape();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Focus returns to the icon trigger, whose supplemental tooltip is now the topmost layer.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: 'إجراءات إضافية' }),
      ),
    );
    const tooltip = await screen.findByText('إجراءات إضافية', { selector: '.vx-tooltip' });
    escape();
    await waitFor(() => expect(tooltip.isConnected).toBe(false));
    expect(screen.getByRole('dialog')).toBeTruthy();
    escape();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('AlertDialog', () => {
  function Confirm({ pending = false }: { pending?: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        title="تعطيل المستخدم؟"
        description="لن يتمكن من تسجيل الدخول حتى تُعاد تفعيله."
        confirmLabel="تعطيل المستخدم"
        onConfirm={() => undefined}
        pending={pending}
      >
        <p>سارة الخطيب — user@example.test</p>
      </AlertDialog>
    );
  }

  it('focuses the safe action and cancels on Escape', async () => {
    render(
      <UiRoot>
        <Confirm />
      </UiRoot>,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'تعطيل المستخدم؟' });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'إلغاء' })),
    );
    expect(within(dialog).queryByRole('button', { name: 'إغلاق' })).toBeNull();
    escape();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('defers dismissal with an explanation while a non-cancellable action runs', async () => {
    render(
      <UiRoot>
        <Confirm pending />
      </UiRoot>,
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('status').textContent).toContain('لا يمكن الإغلاق');
    escape();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});

describe('global popups and toasts under a modal', () => {
  function Page() {
    const [dialog, setDialog] = useState(false);
    const toast = useToast();
    return (
      <>
        <Popover title="تصفية النتائج" trigger={<Button>تصفية</Button>}>
          <Button onClick={() => setDialog(true)}>فتح نافذة</Button>
        </Popover>
        <Button onClick={() => toast.show({ tone: 'danger', message: 'تعذّر حفظ التفضيل.' })}>
          إشعار
        </Button>
        <Dialog open={dialog} onOpenChange={setDialog} title="مهمة مستقلة">
          <p>محتوى</p>
        </Dialog>
      </>
    );
  }

  it('closes an unrelated global popup and suspends toasts while a modal is active', async () => {
    render(
      <UiRoot>
        <Page />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'إشعار' }));
    const region = screen.getByRole('region', { name: 'الإشعارات' });
    expect(within(region).getByText('تعذّر حفظ التفضيل.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تصفية' }));
    const popover = await screen.findByRole('dialog', { name: 'تصفية النتائج' });
    fireEvent.click(within(popover).getByRole('button', { name: 'فتح نافذة' }));
    await screen.findByRole('dialog', { name: 'مهمة مستقلة' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'تصفية النتائج' })).toBeNull());
    expect(within(region).queryByText('تعذّر حفظ التفضيل.')).toBeNull();
    escape();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'مهمة مستقلة' })).toBeNull());
    // The persistent error toast returns once the modal is gone.
    expect(within(region).getByText('تعذّر حفظ التفضيل.')).toBeTruthy();
  });
});

describe('Toast lifetime (§32)', () => {
  function Emitter() {
    const toast = useToast();
    return (
      <>
        <Button
          onClick={() => toast.show({ id: 'saved', tone: 'success', message: 'تم حفظ التغييرات' })}
        >
          نجاح
        </Button>
        <Button onClick={() => toast.show({ tone: 'warning', message: 'تحذير مستمر' })}>
          تحذير
        </Button>
      </>
    );
  }

  it('dismisses a plain success after six visible seconds, pausing while hovered', async () => {
    vi.useFakeTimers();
    render(
      <UiRoot>
        <Emitter />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نجاح' }));
    const region = screen.getByRole('region', { name: 'الإشعارات' });
    const toast = within(region).getByText('تم حفظ التغييرات').closest('.vx-toast') as HTMLElement;
    fireEvent.pointerEnter(toast);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(within(region).queryByText('تم حفظ التغييرات')).not.toBeNull();
    fireEvent.pointerLeave(toast);
    await act(() => vi.advanceTimersByTimeAsync(5_900));
    expect(within(region).queryByText('تم حفظ التغييرات')).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(within(region).queryByText('تم حفظ التغييرات')).toBeNull();
    vi.useRealTimers();
  });

  it('keeps non-success toasts, coalesces repeats and shows at most three', async () => {
    vi.useFakeTimers();
    render(
      <UiRoot>
        <Emitter />
      </UiRoot>,
    );
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'تحذير' }));
    fireEvent.click(screen.getByRole('button', { name: 'نجاح' }));
    fireEvent.click(screen.getByRole('button', { name: 'نجاح' }));
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    const region = screen.getByRole('region', { name: 'الإشعارات' });
    expect(within(region).getAllByText('تحذير مستمر')).toHaveLength(3);
    vi.useRealTimers();
  });

  it('announces a toast once through the shared polite region without taking focus', async () => {
    render(
      <UiRoot>
        <Emitter />
      </UiRoot>,
    );
    const button = screen.getByRole('button', { name: 'نجاح' });
    button.focus();
    fireEvent.click(button);
    const live = document.querySelector('[aria-live="polite"]');
    await waitFor(() => expect(live?.textContent).toBe('تم حفظ التغييرات'));
    expect(document.activeElement).toBe(button);
  });
});
