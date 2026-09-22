import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ExactAmount,
  FileName,
  formatAmount,
  formatDate,
  formatInstant,
  parseDecimal,
} from './format';
import { UI_MESSAGES } from './messages';
import { UiRoot } from './ui-root';

const strip = (text: string) => text.replace(/[‎‏؜]/g, '');

describe('exact decimal entry (§24.4)', () => {
  it('normalizes Arabic-Indic and Persian digits without floating point', () => {
    expect(parseDecimal('-١٢٫٣٠', { scale: 2, signed: true })).toEqual({
      ok: true,
      value: '-12.30',
    });
    expect(parseDecimal('۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳.۰۱', { scale: 2 })).toEqual({
      ok: true,
      value: '9007199254740993.01',
    });
    expect(parseDecimal('-0.00', { scale: 2, signed: true })).toEqual({ ok: true, value: '0.00' });
  });

  it('rejects ambiguous grouping, exponents, unsigned negatives and excess precision', () => {
    for (const value of ['1,200', '١٬٢٠٠', '1e3', '1.2.3', '−12'])
      expect(parseDecimal(value, { scale: 2, signed: true }).ok).toBe(false);
    expect(parseDecimal('-5', { scale: 2 }).ok).toBe(false);
    expect(parseDecimal('1.001', { scale: 2 })).toEqual({ ok: false, reason: 'precision' });
  });
});

describe('exact amounts', () => {
  it('keeps every digit, the sign, the precision and the explicit ISO currency', () => {
    expect(formatAmount('-1234.50', 'USD')).toBe('-1,234.50 USD');
    expect(formatAmount('9007199254740993.01', 'SAR')).toBe('9,007,199,254,740,993.01 SAR');
    expect(formatAmount('0.00', 'EUR')).toBe('0.00 EUR');
    expect(() => formatAmount('12.5e3', 'USD')).toThrow();
    expect(() => formatAmount('12.50', 'usd')).toThrow();
  });

  it('renders one isolated LTR run and never shows missing as zero', () => {
    render(
      <UiRoot>
        <p>
          الرصيد: <ExactAmount value="-1234.50" currency="USD" />
        </p>
        <p data-testid="missing">
          <ExactAmount value={null} currency="USD" />
        </p>
      </UiRoot>,
    );
    const amount = screen.getByText('-1,234.50 USD');
    expect(amount.tagName).toBe('BDI');
    expect(amount.getAttribute('dir')).toBe('ltr');
    expect(screen.getByTestId('missing').textContent).toBe(UI_MESSAGES.ar.notApplicable);
  });
});

describe('dates and instants', () => {
  it('formats date-only values as day, month name and year without a time-zone shift', () => {
    expect(strip(formatDate('2026-09-22', 'ar'))).toBe('22 سبتمبر 2026');
    expect(formatDate('2026-09-22', 'en')).toBe('September 22, 2026');
    expect(strip(formatDate('2024-02-29', 'ar'))).toContain('29');
    expect(() => formatDate('2025-02-29', 'ar')).toThrow();
  });

  it('shows instants in an explicit zone and labels the UTC fallback', () => {
    expect(formatInstant('2026-09-22T21:30:00Z', 'en')).toContain('UTC');
    expect(formatInstant('2026-09-22T21:30:00Z', 'en', 'Asia/Riyadh')).toContain('00:30');
    expect(() => formatInstant('2026-09-22T21:30:00', 'en')).toThrow();
  });
});

describe('isolated user content', () => {
  it('keeps a filename extension separate from a truncatable base name', () => {
    render(<FileName name="حملة الخريف Campaign-v2.pdf" />);
    const name = screen.getByTitle('حملة الخريف Campaign-v2.pdf');
    expect(name.tagName).toBe('BDI');
    expect(name.lastElementChild?.textContent).toBe('.pdf');
    expect(name.textContent).toBe('حملة الخريف Campaign-v2.pdf');
  });
});

describe('design-system copy', () => {
  it('uses all six Arabic plural forms with Latin digits', () => {
    const summary = UI_MESSAGES.ar.selectionSummary;
    expect(summary(0, 0)).toBe('لم يُحدَّد أي سجل');
    expect(summary(1, 0)).toBe('تم تحديد سجل واحد');
    expect(summary(2, 0)).toBe('تم تحديد سجلين');
    expect(summary(3, 0)).toBe('تم تحديد 3 سجلات');
    expect(summary(11, 0)).toBe('تم تحديد 11 سجلًا');
    expect(summary(100, 4)).toBe('تم تحديد 100 سجل، منها 4 خارج هذه الصفحة');
    expect(UI_MESSAGES.en.selectionSummary(1, 0)).toBe('1 record selected');
    expect(UI_MESSAGES.ar.range(26, 50, 1234)).toBe('26–50 من 1,234');
  });

  it('defines every message in both languages', () => {
    expect(Object.keys(UI_MESSAGES.en).sort()).toEqual(Object.keys(UI_MESSAGES.ar).sort());
  });
});
