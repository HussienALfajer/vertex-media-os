import { expect, type Page } from '@playwright/test';
import { Authenticator, TEST_PASSWORD, WEB_ORIGIN } from './stack.js';

/**
 * Keycloak's own pages, driven as their user would (D-04): the invitation's required actions
 * (TOTP enrolment and a new password) and the password and OTP sign-in forms. Vertex OS shows
 * none of these fields itself (spec Section 40).
 */

const TOTP_FORM = 'form#kc-totp-settings-form';
const PASSWORD_FORM = 'form#kc-passwd-update-form';
const LOGIN_FORM = 'form#kc-form-login';
const OTP_FORM = 'form#kc-otp-login-form';

async function enrolTotp(page: Page): Promise<Authenticator> {
  const manual = page.locator('a[href*="mode=manual"]');
  if (await manual.isVisible()) await manual.click();
  const secret = (await page.locator('#kc-totp-secret-key').innerText()).replace(/\s/g, '');
  const device = new Authenticator(secret);
  const form = page.locator(TOTP_FORM);
  await form.locator('input[name="totp"]').fill(device.code());
  await form.locator('input[name="userLabel"]').fill('e2e device');
  await form.locator('[type="submit"]').first().click();
  return device;
}

async function setPassword(page: Page): Promise<void> {
  const form = page.locator(PASSWORD_FORM);
  await form.locator('input[name="password-new"]').fill(TEST_PASSWORD);
  await form.locator('input[name="password-confirm"]').fill(TEST_PASSWORD);
  await form.locator('[type="submit"]').first().click();
}

/**
 * Follows an invitation link as its recipient: proceeds through Keycloak's required actions,
 * enrolling TOTP and setting the test password, until Keycloak confirms the account update.
 * Returns the enrolled TOTP device.
 */
export async function completeInvitation(page: Page, link: string): Promise<Authenticator> {
  await page.goto(link);
  let device: Authenticator | undefined;
  let password = false;
  for (let step = 0; step < 6 && (device === undefined || !password); step += 1) {
    const next = page
      .locator(`${TOTP_FORM}, ${PASSWORD_FORM}, a[href*="/login-actions/action-token"]`)
      .first();
    await next.waitFor();
    if (await page.locator(TOTP_FORM).isVisible()) device = await enrolTotp(page);
    else if (await page.locator(PASSWORD_FORM).isVisible()) {
      await setPassword(page);
      password = true;
    } else await next.click();
  }
  if (device === undefined || !password)
    throw new Error('the invitation did not ask for TOTP and a password');
  await expect(page.locator('body')).toContainText('Your account has been updated');
  return device;
}

/**
 * Completes Keycloak's sign-in forms on `page` (password, then OTP) and waits until the browser
 * is back on the web app.
 */
export async function passKeycloakSignIn(
  page: Page,
  email: string,
  device: Authenticator,
): Promise<void> {
  const login = page.locator(LOGIN_FORM);
  await login.waitFor();
  await login.locator('input[name="username"]').fill(email);
  await login.locator('input[name="password"]').fill(TEST_PASSWORD);
  await login.locator('[type="submit"]').first().click();
  const otp = page.locator(OTP_FORM);
  await otp.waitFor();
  await otp.locator('input[name="otp"]').fill(device.code());
  await otp.locator('[type="submit"]').first().click();
  await page.waitForURL(`${WEB_ORIGIN}/**`);
}

/**
 * Starts sign-in from the web app's signed-out page and completes it in Keycloak. While the
 * Keycloak session lives, Keycloak answers without a form and the browser returns at once.
 */
export async function signIn(page: Page, email: string, device: Authenticator): Promise<void> {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const login = page.locator(LOGIN_FORM);
  await login
    .or(page.getByRole('region', { name: 'Account' }))
    .first()
    .waitFor();
  if (await login.isVisible()) await passKeycloakSignIn(page, email, device);
}

/** Submits only Keycloak's password form, for an identity that must not get further. */
export async function submitKeycloakPassword(page: Page, email: string): Promise<void> {
  const login = page.locator(LOGIN_FORM);
  await login.waitFor();
  await login.locator('input[name="username"]').fill(email);
  await login.locator('input[name="password"]').fill(TEST_PASSWORD);
  await login.locator('[type="submit"]').first().click();
}
