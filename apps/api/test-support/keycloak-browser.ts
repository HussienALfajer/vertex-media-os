import { createHmac } from 'node:crypto';

/**
 * A minimal browser for Keycloak's server-rendered pages: follows nothing automatically, keeps
 * cookies per name, and reads forms and links out of the HTML. Test-only.
 */
export class Browser {
  private readonly cookies = new Map<string, string>();

  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (cookie) headers.set('cookie', cookie);
    const response = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const separator = pair?.indexOf('=') ?? -1;
      if (pair && separator > 0)
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
}

const decode = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&#61;', '=')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

/** The action URL and hidden fields of the form with `id`, or undefined when the page has none. */
export function findForm(
  html: string,
  id: string,
): { readonly action: string; readonly hidden: Record<string, string> } | undefined {
  const form = new RegExp(`<form[^>]*id="${id}"[^>]*>([\\s\\S]*?)</form>`).exec(html);
  if (!form?.[0] || form[1] === undefined) return undefined;
  const action = /action="([^"]+)"/.exec(form[0].slice(0, form[0].indexOf('>') + 1));
  if (!action?.[1]) return undefined;
  const hidden: Record<string, string> = {};
  for (const input of form[1].matchAll(/<input[^>]*>/g)) {
    const tag = input[0];
    if (!/type="hidden"/.test(tag)) continue;
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (name) hidden[name] = decode(value);
  }
  return { action: decode(action[1]), hidden };
}

export function requireForm(html: string, id: string) {
  const form = findForm(html, id);
  if (!form) throw new Error(`form ${id} not found`);
  return form;
}

/** Every link target on the page. */
export function links(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => decode(match[1] ?? ''));
}

function base32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.replace(/[\s=]/g, '').toUpperCase();
  let bits = '';
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** RFC 6238 TOTP with the realm policy: HMAC-SHA1, 6 digits, 30-second period. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/**
 * A code the realm accepts that has not been used yet. The realm refuses reused codes and looks
 * one period around the current one, so the current, next and previous periods are candidates.
 */
export function freshTotp(secret: string, used: Set<string>): string {
  const now = Date.now();
  for (const at of [now, now + 30_000, now - 30_000]) {
    const code = totp(secret, at);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  throw new Error('no unused TOTP code in the accepted window');
}

export interface Page {
  readonly response: Response;
  readonly status: number;
  readonly location: string | null;
  readonly html: string;
}

/** Requests `url` and follows redirects while they stay on `origin`. */
export async function open(
  browser: Browser,
  url: string,
  origin: string,
  init: RequestInit = {},
): Promise<Page> {
  let response = await browser.request(url, init);
  for (let hops = 0; hops < 8; hops += 1) {
    const location = response.headers.get('location');
    if (response.status !== 302 && response.status !== 303) break;
    if (!location) break;
    const target = new URL(location, url).href;
    if (!target.startsWith(origin)) break;
    response = await browser.request(target);
  }
  return {
    response,
    status: response.status,
    location: response.headers.get('location'),
    html: response.status === 200 ? await response.text() : '',
  };
}

/** Submits the form with `id` on `page` with `fields` added to its hidden fields. */
export function submit(
  browser: Browser,
  page: Page,
  id: string,
  fields: Record<string, string>,
  origin: string,
): Promise<Page> {
  const form = requireForm(page.html, id);
  return open(browser, form.action, origin, {
    method: 'POST',
    body: new URLSearchParams({ ...form.hidden, ...fields }),
  });
}

/** The TOTP secret on the enrolment page, switching to the manual-entry view if needed. */
export async function totpSecret(
  browser: Browser,
  page: Page,
  origin: string,
): Promise<Page & { secret: string }> {
  const read = (html: string) =>
    /id="kc-totp-secret-key"[^>]*>\s*([A-Z2-7 ]+?)\s*</.exec(html)?.[1];
  let current = page;
  let secret = read(current.html);
  if (!secret) {
    const manual = links(current.html).find((link) => link.includes('mode=manual'));
    if (!manual) throw new Error('TOTP enrolment page without a manual-entry link');
    current = await open(browser, new URL(manual, origin).href, origin);
    secret = read(current.html);
  }
  if (!secret) throw new Error('TOTP secret not found on the enrolment page');
  return { ...current, secret: secret.replace(/\s/g, '') };
}

export const FORMS = {
  login: 'kc-form-login',
  otp: 'kc-otp-login-form',
  totpEnrolment: 'kc-totp-settings-form',
  passwordUpdate: 'kc-passwd-update-form',
  resetRequest: 'kc-reset-password-form',
} as const;

export const hasForm = (page: Page, id: string) => findForm(page.html, id) !== undefined;

/** The first Keycloak action-token link in an email body. */
export function actionLink(text: string): string {
  const link = /(https?:\/\/\S+\/login-actions\/action-token\S+)/.exec(text)?.[1];
  if (!link) throw new Error('message without an action link');
  return link;
}

/**
 * Follows an invitation link as its recipient: proceeds through Keycloak's pages, enrolling a
 * TOTP and setting `password` when asked. Returns which forms appeared and the TOTP secret.
 */
export async function followInvitation(
  link: string,
  origin: string,
  password: string,
): Promise<{ seen: string[]; secret: string | undefined; used: Set<string>; last: Page }> {
  const browser = new Browser();
  const used = new Set<string>();
  const seen: string[] = [];
  let secret: string | undefined;
  let page = await open(browser, link, origin);
  for (let step = 0; step < 8 && page.status === 200; step += 1) {
    if (hasForm(page, FORMS.totpEnrolment)) {
      seen.push('enrol-totp');
      const enrolment = await totpSecret(browser, page, origin);
      secret = enrolment.secret;
      page = await submit(
        browser,
        enrolment,
        FORMS.totpEnrolment,
        { totp: freshTotp(enrolment.secret, used), userLabel: 'test device' },
        origin,
      );
    } else if (hasForm(page, FORMS.passwordUpdate)) {
      seen.push('set-password');
      page = await submit(
        browser,
        page,
        FORMS.passwordUpdate,
        { 'password-new': password, 'password-confirm': password },
        origin,
      );
    } else {
      const proceed = links(page.html).find((target) =>
        target.includes('/login-actions/action-token'),
      );
      if (!proceed) break;
      seen.push('proceed');
      page = await open(browser, new URL(proceed, origin).href, origin);
    }
  }
  return { seen, secret, used, last: page };
}
