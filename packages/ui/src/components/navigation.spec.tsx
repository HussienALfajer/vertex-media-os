import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DIRECTIONAL_ICONS } from '../icons/icon';
import { UiRoot } from '../runtime/ui-root';
import { Breadcrumb, Pagination, SidebarNav, Tabs } from './navigation';

const renderUi = (node: ReactNode) => render(<UiRoot>{node}</UiRoot>);

function TabsHarness({ activation }: { activation?: 'manual' | 'automatic' }) {
  const [value, setValue] = useState('profile');
  return (
    <Tabs
      label="أقسام المستخدم"
      value={value}
      onValueChange={setValue}
      {...(activation ? { activation } : {})}
      items={[
        { id: 'profile', label: 'الملف', content: <p>بيانات الملف</p> },
        { id: 'roles', label: 'الأدوار', content: <p>الأدوار المسندة</p> },
        { id: 'sessions', label: 'الجلسات', content: <p>الجلسات النشطة</p> },
      ]}
    />
  );
}

describe('Tabs (§24.2, §30)', () => {
  it('moves to the visually adjacent tab: ArrowLeft is logical next in RTL', () => {
    renderUi(<TabsHarness />);
    const [profile, roles, sessions] = screen.getAllByRole('tab');
    profile?.focus();
    fireEvent.keyDown(profile as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(roles);
    // Manual activation: focus moves, the panel does not change until Enter/Space/click.
    expect(screen.getByRole('tabpanel').textContent).toBe('بيانات الملف');
    fireEvent.click(roles as HTMLElement);
    expect(screen.getByRole('tabpanel', { name: 'الأدوار' }).textContent).toBe('الأدوار المسندة');
    fireEvent.keyDown(roles as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(sessions);
    fireEvent.keyDown(sessions as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(profile);
  });

  it('uses ArrowRight for logical next in LTR and keeps a single tab stop', async () => {
    const view = renderUi(<TabsHarness activation="automatic" />);
    window.vertexUiSettings?.set({ language: 'en' });
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    tabs[0]?.focus();
    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    view.unmount();
  });
});

describe('Breadcrumb', () => {
  it('links ancestors and marks the current page without linking it', () => {
    renderUi(
      <Breadcrumb
        items={[
          { label: 'الإدارة', href: '/admin' },
          { label: 'المستخدمون', href: '/admin/users' },
          { label: 'سارة الخطيب' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'مسار التنقل' });
    expect(within(nav).getByRole('link', { name: 'المستخدمون' }).getAttribute('href')).toBe(
      '/admin/users',
    );
    const current = within(nav).getByText('سارة الخطيب');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.closest('a')).toBeNull();
  });
});

describe('Pagination', () => {
  it('states the known range and disables unavailable directions', () => {
    const change = vi.fn();
    renderUi(<Pagination mode="offset" page={1} pageSize={25} total={132} onPageChange={change} />);
    const nav = screen.getByRole('navigation', { name: 'صفحات النتائج' });
    expect(nav.textContent).toContain('1–25 من 132');
    expect(nav.textContent).toContain('الصفحة 1 من 6');
    expect(
      (within(nav).getByRole('button', { name: 'الصفحة السابقة' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(within(nav).getByRole('button', { name: 'الصفحة التالية' }));
    expect(change).toHaveBeenCalledWith(2);
  });

  it('never invents a page count for cursor pagination', () => {
    renderUi(
      <Pagination
        mode="cursor"
        hasPrevious
        hasNext={false}
        onPrevious={() => undefined}
        onNext={() => undefined}
        pageSize={25}
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(nav.textContent).not.toMatch(/من \d/);
    expect(
      (within(nav).getByRole('button', { name: 'الصفحة التالية' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('SidebarNav and directional icons', () => {
  it('marks the current destination with aria-current and keeps labels in rail mode', () => {
    renderUi(
      <SidebarNav
        label="التنقل الرئيسي"
        rail
        groups={[
          {
            id: 'main',
            items: [{ id: 'home', label: 'الرئيسية', href: '/', icon: 'home', current: true }],
          },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: 'الرئيسية' });
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('mirrors only logical direction icons', () => {
    expect(DIRECTIONAL_ICONS).toEqual(
      expect.arrayContaining([
        'chevron-end',
        'chevron-start',
        'arrow-end',
        'arrow-start',
        'panel-collapse',
        'panel-expand',
      ]),
    );
    for (const fixed of [
      'search',
      'check',
      'clock',
      'sort',
      'external',
      'globe',
      'refresh',
    ] as const)
      expect(DIRECTIONAL_ICONS).not.toContain(fixed);
  });
});
