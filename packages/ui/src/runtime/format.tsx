import type { ReactNode } from 'react';
import type { Language } from './settings';
import { useUiMessages, useUiSettings } from './ui-root';

/**
 * Presentation of exact values and mixed-direction text (docs/DESIGN_SYSTEM.md §24.3–§24.4).
 * The domain owns precision, rounding, currency and time zones; these helpers only render
 * what they are given without changing it.
 */

/** Unknown-direction user content (names, titles, filenames) isolated from its sentence. */
export function Bdi({ children }: { children: ReactNode }) {
  return <bdi>{children}</bdi>;
}

/** Known left-to-right runs: emails, URLs, phone numbers, technical IDs, ISO dates (§24.3). */
export function LtrText({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** Technical identifier: monospace, isolated LTR, copied exactly. */
export function TechnicalId({ children }: { children: string }) {
  return (
    <bdi dir="ltr" className="vx-code">
      {children}
    </bdi>
  );
}

/**
 * Filename that may truncate its base name but always keeps the extension (§24.3). The full
 * value stays in the DOM for assistive technology and copying.
 */
export function FileName({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0 && dot < name.length - 1;
  return (
    <bdi className="vx-filename" title={name}>
      <span className="vx-filename-base">{hasExtension ? name.slice(0, dot) : name}</span>
      {hasExtension && <span>{name.slice(dot)}</span>}
    </bdi>
  );
}

const WESTERN = /[٠-٩۰-۹]/g;

/** Maps Arabic-Indic and Persian digits to ASCII for the shared parser (§24.4). */
export function normalizeDigits(value: string): string {
  return value.replace(WESTERN, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

export type DecimalParseResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'syntax' | 'precision' };

/**
 * Strict decimal entry: accepts ASCII/Arabic/Persian digits and one unambiguous decimal
 * separator; rejects grouping, exponents and excess precision instead of guessing or
 * rounding. Never converts through binary floating point (AR-037).
 */
export function parseDecimal(
  input: string,
  options: { scale: number; signed?: boolean },
): DecimalParseResult {
  if (!Number.isInteger(options.scale) || options.scale < 0)
    throw new Error('A non-negative domain scale is required');
  const normalized = normalizeDigits(input.trim()).replace('٫', '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized) || (!options.signed && /^[+-]/.test(normalized)))
    return { ok: false, reason: 'syntax' };
  const [whole = '', fraction = ''] = normalized.split('.');
  if (fraction.length > options.scale) return { ok: false, reason: 'precision' };
  const sign = whole.startsWith('-') ? '-' : '';
  const integer = whole.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '');
  const zero = !/[1-9]/.test(integer + fraction);
  const padded = options.scale > 0 ? `.${fraction.padEnd(options.scale, '0')}` : '';
  return { ok: true, value: `${zero ? '' : sign}${integer}${padded}` };
}

const CANONICAL_DECIMAL = /^-?\d+(?:\.\d+)?$/;

/**
 * Formats a backend-canonical decimal string with grouping and its ISO currency code, keeping
 * every digit, the sign and the given precision. Throws on anything that is not canonical.
 */
export function formatAmount(value: string, currency: string): string {
  if (!CANONICAL_DECIMAL.test(value)) throw new Error('A canonical decimal string is required');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('An ISO 4217 currency code is required');
  const negative = value.startsWith('-');
  const [whole = '', fraction] = value.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`} ${currency}`;
}

/**
 * An exact signed amount as one isolated LTR run (§24.3). `null` means missing, which is
 * never shown as zero (§24.4, §38).
 */
export function ExactAmount({ value, currency }: { value: string | null; currency: string }) {
  const messages = useUiMessages();
  if (value === null) return <span className="vx-missing">{messages.notApplicable}</span>;
  return (
    <bdi dir="ltr" className="vx-numeric" data-negative={value.startsWith('-') ? '' : undefined}>
      {formatAmount(value, currency)}
    </bdi>
  );
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date-only value as day + month name + year, Gregorian with Latin digits, without any
 * time-zone conversion (§24.4).
 */
export function formatDate(value: string, language: Language): string {
  const match = ISO_DATE.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : undefined;
  if (!date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Date-only values use a valid YYYY-MM-DD');
  return new Intl.DateTimeFormat(language, {
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * An instant in an explicit IANA time zone; without one it is shown in UTC with a visible
 * UTC label rather than an invented zone (§24.4). 24-hour time, Latin digits.
 */
export function formatInstant(value: string, language: Language, timeZone = 'UTC'): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error('An instant requires an explicit offset');
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) throw new Error('Invalid instant');
  return new Intl.DateTimeFormat(language, {
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(instant);
}

/** Date-only value rendered in the current language. */
export function DateText({ value }: { value: string }) {
  const { language } = useUiSettings();
  return <time dateTime={value}>{formatDate(value, language)}</time>;
}

/** Instant rendered with its zone label in the current language. */
export function InstantText({ value, timeZone }: { value: string; timeZone?: string }) {
  const { language } = useUiSettings();
  return <time dateTime={value}>{formatInstant(value, language, timeZone)}</time>;
}
