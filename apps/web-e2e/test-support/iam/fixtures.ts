import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  expect,
  request as playwrightRequest,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { ApiTraffic, scriptVisibleSecrets, webContext } from './browser-context.js';
import { completeInvitation, signIn } from './keycloak-pages.js';
import {
  actionLink,
  iamStack,
  waitForMail,
  WEB_ORIGIN,
  type Authenticator,
  type IamStack,
} from './stack.js';

export interface JourneyUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly device: Authenticator;
  readonly context: BrowserContext;
  readonly page: Page;
}

export interface NewUser {
  readonly label: string;
  readonly roleIds?: readonly string[];
  readonly memberships?: readonly { readonly departmentId: string; readonly isPrimary: boolean }[];
}

/** The administrator's session as an API client: the in-memory CSRF token, as the web app keeps it. */
export class AdminApi {
  private csrf: string | undefined;

  constructor(readonly request: APIRequestContext) {}

  private async token(): Promise<string> {
    if (this.csrf === undefined) {
      const response = await this.request.get('/api/auth/csrf');
      expect(response.status()).toBe(200);
      this.csrf = ((await response.json()) as { token: string }).token;
    }
    return this.csrf;
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.request.get(path);
    expect(response.status(), `GET ${path}`).toBe(200);
    return (await response.json()) as T;
  }

  async send<T>(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data: unknown,
  ): Promise<T> {
    const response = await this.request.fetch(path, {
      method,
      data,
      headers: { 'x-csrf-token': await this.token() },
    });
    expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(
      true,
    );
    return (await response.json()) as T;
  }
}

interface Fixtures {
  /** The `/api` traffic of every context the test opens; asserted token-free afterwards (D-12). */
  traffic: ApiTraffic;
  /** Opens an English browser context on the web app whose traffic is watched. */
  openContext: (options?: { storageState?: string }) => Promise<BrowserContext>;
  /** A page in the bootstrap administrator's signed-in session (D-05). */
  admin: Page;
  /** The bootstrap administrator's session as an API client. */
  adminApi: AdminApi;
  /** Invites a user through the real API; the invitee completes the invitation and signs in. */
  activeUser: (user: NewUser) => Promise<JourneyUser>;
  /** An email address no other journey uses. */
  uniqueEmail: (label: string) => string;
}

export const test = base.extend<Fixtures, { stack: IamStack }>({
  stack: [
    // eslint-disable-next-line no-empty-pattern -- a Playwright fixture without dependencies.
    async ({}, use) => {
      await use(iamStack());
    },
    { scope: 'worker' },
  ],

  // eslint-disable-next-line no-empty-pattern -- a Playwright fixture without dependencies.
  traffic: async ({}, use) => {
    const traffic = new ApiTraffic();
    await use(traffic);
    expect(await traffic.settled()).toEqual([]);
  },

  openContext: async ({ browser, traffic }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options = {}) => {
      const context = await webContext(browser, traffic, options);
      contexts.push(context);
      return context;
    });
    for (const context of contexts) {
      expect(await scriptVisibleSecrets(context)).toEqual([]);
      await context.close();
    }
  },

  admin: async ({ openContext, stack }, use) => {
    const context = await openContext({ storageState: stack.adminState });
    await use(await context.newPage());
  },

  adminApi: async ({ stack }, use) => {
    // Playwright's own HTTP client keeps no `Secure` cookie for plain HTTP, so the administrator's
    // session cookie is sent as a header.
    const { cookies } = JSON.parse(readFileSync(stack.adminState, 'utf8')) as {
      cookies: { name: string; value: string }[];
    };
    const request = await playwrightRequest.newContext({
      baseURL: WEB_ORIGIN,
      extraHTTPHeaders: {
        cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
      },
    });
    await use(new AdminApi(request));
    await request.dispose();
  },

  // eslint-disable-next-line no-empty-pattern -- a Playwright fixture without dependencies.
  uniqueEmail: async ({}, use) => {
    await use((label) => `${label}-${randomUUID()}@example.test`);
  },

  activeUser: async ({ adminApi, openContext, stack, uniqueEmail }, use) => {
    await use(async ({ label, roleIds = [], memberships = [] }) => {
      const email = uniqueEmail(label);
      const displayName = `E2E ${label}`;
      const created = await adminApi.send<{ user: { id: string } }>('POST', '/api/iam/users', {
        email,
        displayName,
        ...(roleIds.length > 0 ? { roleIds } : {}),
        ...(memberships.length > 0 ? { memberships } : {}),
      });
      const context = await openContext();
      const page = await context.newPage();
      const device = await completeInvitation(
        page,
        actionLink(await waitForMail(stack.mailpitUrl, email)),
      );
      await signIn(page, email, device);
      await expect(page.getByRole('region', { name: 'Account' })).toContainText(displayName);
      return { id: created.user.id, email, displayName, device, context, page };
    });
  },
});

export { expect };
