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
      // Every header, `Set-Cookie` included (`headers()` leaves the cookie headers out).
      this.pending.push(
        response.allHeaders().then(
          (headers) => {
            if (JWT.test(JSON.stringify(headers)))
              this.findings.push(`JWT in the headers of ${url}`);
          },
          () => undefined,
        ),
      );
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
 * What the context holds that page scripts or the cookie jar could leak (D-12): `document.cookie`
 * and web storage of every open page of the web origin, read in that page (session storage belongs
 * to one tab), and the values of the cookies the app receives. Web storage may hold only the UI preference; no
 * readable value and no cookie value may be a token.
 */
export async function scriptVisibleSecrets(context: BrowserContext): Promise<string[]> {
  const findings: string[] = [];
  // Cookies the web app's paths receive. Keycloak's own cookies share the host (cookies ignore the
  // port) but are scoped to `/realms/`, so the web app never receives them.
  for (const cookie of await context.cookies()) {
    const reachesApp = cookie.path === '/' || cookie.path.startsWith('/api');
    if (reachesApp && JWT.test(cookie.value)) findings.push(`JWT in the cookie ${cookie.name}`);
  }
  let pages = context.pages().filter((page) => page.url().startsWith(`${WEB_ORIGIN}/`));
  if (pages.length === 0) {
    // The app itself: Firefox shows a JSON response in a viewer that never finishes loading.
    const page = await context.newPage();
    await page.goto(`${WEB_ORIGIN}/`);
    pages = [page];
  }
  for (const page of pages) {
    const readable = await page.evaluate(() => {
      const entries = (area: Storage) =>
        Array.from({ length: area.length }, (_, index) => {
          const key = area.key(index) ?? '';
          return { key, value: area.getItem(key) ?? '' };
        });
      return {
        cookie: document.cookie,
        local: entries(window.localStorage),
        session: entries(window.sessionStorage),
      };
    });
    if (readable.cookie.includes('__Host-vertex') || JWT.test(readable.cookie))
      findings.push('a Vertex cookie readable by page scripts');
    for (const { key, value } of [...readable.local, ...readable.session]) {
      if (key !== PREFERENCES.key || JWT.test(value)) findings.push(`web storage entry ${key}`);
    }
  }
  return findings;
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
