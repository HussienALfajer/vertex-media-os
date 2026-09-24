import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { JWT, TOKEN_FIELD, WEB_ORIGIN } from './stack.js';

/** The stored UI preference that selects English (the first-run language is Arabic). */
const PREFERENCES = {
  key: 'vertex.ui.preferences',
  value: JSON.stringify({ version: 1, language: 'en' }),
};

/**
 * Everything the web app's pages received from `/api` in one context, so a journey can prove that
 * no identity-provider token reached the browser (D-12; spec Section 47).
 */
export class ApiTraffic {
  readonly findings: string[] = [];
  private readonly pending: Promise<void>[] = [];

  watch(context: BrowserContext): void {
    context.on('response', (response) => {
      const url = response.url();
      if (!url.startsWith(`${WEB_ORIGIN}/api/`)) return;
      const headers = JSON.stringify(response.headers());
      if (JWT.test(headers)) this.findings.push(`JWT in the headers of ${url}`);
      if (response.status() >= 300 && response.status() < 400) return;
      this.pending.push(
        response.text().then(
          (body) => {
            if (JWT.test(body)) this.findings.push(`JWT in the body of ${url}`);
            if (TOKEN_FIELD.test(body)) this.findings.push(`token field in the body of ${url}`);
          },
          // A body the page no longer holds (navigation) cannot be read; it reached no script.
          () => undefined,
        ),
      );
    });
  }

  /** Waits for every body read so far and returns what was found. */
  async settled(): Promise<string[]> {
    await Promise.all(this.pending);
    return this.findings;
  }
}

/** A browser context in English whose `/api` traffic is watched. */
export async function webContext(
  browser: Browser,
  traffic: ApiTraffic,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: WEB_ORIGIN, ...options });
  await context.addInitScript(
    ({ origin, key, value }) => {
      if (window.location.origin === origin) window.localStorage.setItem(key, value);
    },
    { origin: WEB_ORIGIN, ...PREFERENCES },
  );
  traffic.watch(context);
  return context;
}

/**
 * What page scripts of the web origin can read: `document.cookie` and web storage. None of it may
 * hold a Vertex cookie value or a token (D-12).
 */
export async function scriptVisibleSecrets(context: BrowserContext): Promise<string[]> {
  const page = await context.newPage();
  await page.goto(`${WEB_ORIGIN}/api/health/live`);
  const readable = await page.evaluate(() => {
    const storage = (area: Storage) =>
      Array.from({ length: area.length }, (_, index) => area.getItem(area.key(index) ?? '') ?? '');
    return [document.cookie, ...storage(window.localStorage), ...storage(window.sessionStorage)];
  });
  await page.close();
  return readable.filter((value) => value.includes('__Host-vertex') || JWT.test(value));
}

/** Calls the API from `page` (which must show the web app), as the web app's own code would. */
export async function fetchFromPage(
  page: Page,
  path: string,
): Promise<{ readonly status: number; readonly code: string | undefined }> {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: 'same-origin' });
    const body = (await response.json().catch(() => ({}))) as { code?: unknown };
    return { status: response.status, code: typeof body.code === 'string' ? body.code : undefined };
  }, path);
}

/**
 * The context's Vertex cookie `name`. Read unfiltered: `cookies(url)` leaves out `Secure` cookies
 * for a plain-HTTP URL although the browser sends them to `127.0.0.1`.
 */
export async function vertexCookie(context: BrowserContext, name: string) {
  return (await context.cookies()).find((cookie) => cookie.name === name);
}
