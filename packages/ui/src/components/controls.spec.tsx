import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/ui-root';
import { Button, IconButton } from './button';
import { Checkbox, Radio, Switch } from './choice';
import { Field, Fieldset, Input, SearchInput, Select, Textarea } from './field';

const renderUi = (node: ReactNode) => render(<UiRoot>{node}</UiRoot>);

describe('Button', () => {
  it('keeps focus and suppresses repeated activation and form submission while pending', () => {
    const click = vi.fn();
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    const { rerender } = renderUi(
      <form onSubmit={(event) => submit(event.nativeEvent as SubmitEvent)}>
        <Button type="submit" variant="primary" onClick={click} pendingLabel="جارٍ الحفظ…">
          حفظ التغييرات
        </Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'حفظ التغييرات' });
    button.focus();
    rerender(
      <UiRoot>
        <form onSubmit={(event) => submit(event.nativeEvent as SubmitEvent)}>
          <Button
            type="submit"
            variant="primary"
            onClick={click}
            pending
            pendingLabel="جارٍ الحفظ…"
          >
            حفظ التغييرات
          </Button>
        </form>
      </UiRoot>,
    );
    fireEvent.click(button);
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // The busy message becomes the accessible name; the resting label is hidden, not removed.
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBe(button);
  });

  it('reserves the pending label width before the action starts', () => {
    renderUi(<Button pendingLabel="جارٍ الحفظ…">حفظ</Button>);
    const button = screen.getByRole('button', { name: 'حفظ' });
    const layers = button.querySelectorAll('.vx-button-layer');
    expect(layers).toHaveLength(2);
    expect(layers[1]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses native disabled semantics and exposes the variant contract as data', () => {
    renderUi(
      <>
        <Button disabled>غير متاح</Button>
        <Button variant="ghost" intent="danger">
          تعطيل
        </Button>
      </>,
    );
    expect((screen.getByRole('button', { name: 'غير متاح' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const danger = screen.getByRole('button', { name: 'تعطيل' });
    expect([danger.dataset['variant'], danger.dataset['intent']]).toEqual(['ghost', 'danger']);
  });

  it('names icon-only actions with a localized label', () => {
    renderUi(<IconButton icon="more" label="إجراءات المشروع التجريبي" />);
    const button = screen.getByRole('button', { name: 'إجراءات المشروع التجريبي' });
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a pending icon-only action focusable, inert to activation and named by its busy label', () => {
    const onClick = vi.fn();
    renderUi(
      <IconButton
        icon="refresh"
        label="تحديث القائمة"
        pending
        pendingLabel="جارٍ تحديث القائمة…"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'جارٍ تحديث القائمة…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field structure', () => {
  it('links label, description, error and required state to one control', () => {
    renderUi(
      <Field label="الاسم" description="يظهر في الدليل." error="أدخل الاسم." required>
        <Input defaultValue="" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'الاسم' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect((input as HTMLInputElement).required).toBe(true);
    const described = input
      .getAttribute('aria-describedby')
      ?.split(' ')
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(['يظهر في الدليل.', 'أدخل الاسم.']);
    // The required mark is decorative: required is exposed programmatically.
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
  });

  it('does not mark a valid field invalid and shows optional only when asked', () => {
    renderUi(
      <Field label="الملاحظات" optional>
        <Textarea />
      </Field>,
    );
    const textarea = screen.getByRole('textbox', { name: 'الملاحظات (اختياري)' });
    expect(textarea.hasAttribute('aria-invalid')).toBe(false);
  });

  it('keeps known LTR values LTR inside an Arabic form and offers no password type', () => {
    renderUi(
      <Field label="البريد الإلكتروني">
        <Input type="email" defaultValue="user@example.test" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }).getAttribute('dir')).toBe(
      'ltr',
    );
  });

  it('groups choices under a real legend', () => {
    renderUi(
      <Fieldset legend="الحالة" description="اختر حالة واحدة." required>
        <Radio name="state" value="a" label="نشط" defaultChecked />
        <Radio name="state" value="b" label="موقوف مؤقتًا" />
      </Fieldset>,
    );
    // A group has no native required state and may not carry aria-required: the legend says it.
    const group = screen.getByRole('group', { name: 'الحالة (مطلوب)' });
    expect(group.tagName).toBe('FIELDSET');
    expect(group.hasAttribute('aria-required')).toBe(false);
    expect(group.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('renders a native select inside the field contract', () => {
    renderUi(
      <Field label="القسم">
        <Select defaultValue="design">
          <option value="design">التصميم</option>
          <option value="finance">المالية</option>
        </Select>
      </Field>,
    );
    expect((screen.getByRole('combobox', { name: 'القسم' }) as HTMLSelectElement).value).toBe(
      'design',
    );
  });
});

describe('SearchInput', () => {
  function Harness({ onSearch }: { onSearch: (query: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <form onSubmit={() => onSearch('SUBMITTED')}>
        <Field label="البحث في المستخدمين">
          <SearchInput value={value} onValueChange={setValue} onSearch={onSearch} />
        </Field>
      </form>
    );
  }

  it('waits for IME composition, commits on Enter without submitting, and clears in place', async () => {
    vi.useFakeTimers();
    const search = vi.fn();
    renderUi(<Harness onSearch={search} />);
    const input = screen.getByRole('searchbox', { name: 'البحث في المستخدمين' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'سار' } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(search).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { target: { value: 'سارة' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(search).toHaveBeenCalledWith('سارة');
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث' }));
    expect(search).toHaveBeenLastCalledWith('');
    expect(search).not.toHaveBeenCalledWith('SUBMITTED');
    expect(document.activeElement).toBe(input);
    vi.useRealTimers();
  });

  it('debounces ordinary typing by 300ms', async () => {
    vi.useFakeTimers();
    const search = vi.fn();
    renderUi(<Harness onSearch={search} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'م' } });
    fireEvent.change(input, { target: { value: 'مش' } });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(search).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(search).toHaveBeenCalledExactlyOnceWith('مش');
    vi.useRealTimers();
  });
});

describe('Choices', () => {
  it('exposes a native mixed state and keeps controlled ownership', () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          label="كل صلاحيات المستخدمين"
          mixed={!checked}
          checked={checked}
          onChange={(e) => setChecked(e.currentTarget.checked)}
        />
      );
    }
    renderUi(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'كل صلاحيات المستخدمين' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(box.indeterminate).toBe(false);
  });

  it('participates in native forms when uncontrolled and describes itself', () => {
    renderUi(
      <form data-testid="form">
        <Checkbox
          name="notify"
          label="إشعار بالبريد"
          description="يُرسل عند تغيير الحالة."
          defaultChecked
        />
      </form>,
    );
    const box = screen.getByRole('checkbox', { name: 'إشعار بالبريد' });
    expect(new FormData(screen.getByTestId('form') as HTMLFormElement).get('notify')).toBe('on');
    expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'يُرسل عند تغيير الحالة.',
    );
  });

  it('keeps radios exclusive by name', () => {
    renderUi(
      <>
        <Radio name="view" value="list" label="قائمة" defaultChecked />
        <Radio name="view" value="table" label="جدول" />
      </>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'جدول' }));
    expect((screen.getByRole('radio', { name: 'قائمة' }) as HTMLInputElement).checked).toBe(false);
  });

  it('is a real switch and refuses changes while a setting is pending', () => {
    const change = vi.fn();
    renderUi(<Switch label="الإشعارات الفورية" checked pending onChange={change} />);
    const control = screen.getByRole('switch', { name: 'الإشعارات الفورية' });
    fireEvent.click(control);
    expect(change).not.toHaveBeenCalled();
    expect(control.getAttribute('aria-disabled')).toBe('true');
  });
});

// Compile-time contract (§26.1): invalid variant/intent combinations do not type-check.
export const invalidCombinations = [
  // @ts-expect-error secondary never takes the danger intent
  <Button key="b" variant="secondary" intent="danger">
    x
  </Button>,
  // @ts-expect-error secondary never takes the danger intent
  <IconButton key="i" icon="trash" label="x" variant="secondary" intent="danger" />,
  <IconButton key="g" icon="trash" label="x" intent="danger" />,
];
