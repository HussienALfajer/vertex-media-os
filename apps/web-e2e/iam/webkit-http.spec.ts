import { chromium } from '@playwright/test';
import { vertexCookie } from '../test-support/iam/browser-context.js';
import { expect, test } from '../test-support/iam/fixtures.js';
import { completeInvitation, passKeycloakSignIn } from '../test-support/iam/keycloak-pages.js';
import { actionLink, recordSecret, sql, waitForMail } from '../test-support/iam/stack.js';

/**
 * WebKit over plain HTTP (IAM-R09B J-11, D-06). WebKit keeps no `Secure` cookie for
 * `http://127.0.0.1`, so the `__Host-vertex-login` cookie never returns to the callback and sign-in
 * fails closed: no session, no cookie, a sign-in failure on the signed-out page. The cookie policy
 * is unchanged; WebKit is verified over the production HTTPS origin (Master Plan Section 15).
 */

test('J-11 WebKit cannot sign in over plain HTTP, and the sign-in fails closed', async ({
  adminApi,
  openContext,
  stack,
  uniqueEmail,
}) => {
  const email = uniqueEmail('webkit');
  const created = await adminApi.send<{ user: { id: string } }>('POST', '/api/iam/users', {
    email,
    displayName: 'E2E webkit',
  });
  // The invitation is Keycloak's own page, completed in Chromium; only the sign-in runs in WebKit.
  const chromiumBrowser = await chromium.launch();
  const invitation = await chromiumBrowser.newPage();
  const device = await completeInvitation(
    invitation,
    actionLink(await waitForMail(stack.mailpitUrl, email)),
  );
  await chromiumBrowser.close();
  recordSecret(stack, device.secret);

  const context = await openContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await passKeycloakSignIn(page, email, device);

  await expect(page.getByText('Sign-in could not be completed', { exact: true })).toBeVisible();
  expect(await vertexCookie(context, '__Host-vertex-login')).toBeUndefined();
  expect(await vertexCookie(context, '__Host-vertex-session')).toBeUndefined();
  expect(sql(stack, `SELECT count(*) FROM auth_session WHERE user_id = '${created.user.id}'`)).toBe(
    '0',
  );
  expect(
    sql(stack, `SELECT access_state FROM iam_application_user WHERE id = '${created.user.id}'`),
  ).toBe('INVITED');
});
