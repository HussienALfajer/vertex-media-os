import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

/**
 * What the IAM stack's global setup (`stack.setup.ts`) hands to the test workers through
 * `process.env` (D-03, D-05). Generated secrets stay in memory and in the operating system's
 * temporary directory, never in `test-output`, which CI uploads when a run fails.
 */
export interface IamStack {
  /** Keycloak as the browser and the API reach it, for example `http://127.0.0.1:32768`. */
  readonly keycloakUrl: string;
  readonly issuer: string;
  /** Mailpit's HTTP API. */
  readonly mailpitUrl: string;
  /** Storage state of the bootstrap administrator's signed-in session (D-05). */
  readonly adminState: string;
  readonly adminEmail: string;
  readonly postgres: {
    readonly container: string;
    readonly user: string;
    readonly database: string;
  };
  /** Master-realm credentials of the test Keycloak, for Keycloak-side actions (J-09). */
  readonly keycloakAdmin: { readonly username: string; readonly password: string };
  /** Environment of the operator commands (`iam-bootstrap`), without the process environment. */
  readonly commandEnv: Record<string, string>;
}

export const STACK_VARIABLE = 'VERTEX_E2E_IAM_STACK';

/** The web origin of the IAM stack (D-02). The API behind its `/api` proxy listens on 3110. */
export const WEB_ORIGIN = 'http://127.0.0.1:4320';
export const API_PORT = 3110;
export const WEB_PORT = 4320;

/** The password every synthetic user sets in Keycloak. Local test value only. */
export const TEST_PASSWORD = 'correct horse battery staple, e2e only';

export function iamStack(): IamStack {
  const value = process.env[STACK_VARIABLE];
  if (value === undefined)
    throw new Error(`${STACK_VARIABLE} is not set: run through playwright.iam.config.mts`);
  return JSON.parse(value) as IamStack;
}

/** Runs SQL in the stack's PostgreSQL container and returns psql's unaligned, tuple-only output. */
export function sql(stack: IamStack, statement: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      stack.postgres.container,
      'psql',
      '-U',
      stack.postgres.user,
      '-d',
      stack.postgres.database,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-c',
      statement,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  ).trim();
}

// ---------------------------------------------------------------------------------------------
// Mail sink
// ---------------------------------------------------------------------------------------------

interface MailpitSummary {
  readonly ID: string;
}

/** Waits for the newest message to `recipient` and returns its text body. */
export async function waitForMail(mailpitUrl: string, recipient: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const query = new URLSearchParams({ query: `to:"${recipient}"`, limit: '1' });
    const listed = await fetch(`${mailpitUrl}/api/v1/search?${query}`);
    if (!listed.ok) throw new Error(`Mailpit search answered ${listed.status}.`);
    const { messages } = (await listed.json()) as { messages: MailpitSummary[] };
    const newest = messages[0];
    if (newest) {
      const detail = await fetch(`${mailpitUrl}/api/v1/message/${newest.ID}`);
      if (!detail.ok) throw new Error(`Mailpit message answered ${detail.status}.`);
      return ((await detail.json()) as { Text: string }).Text;
    }
    if (Date.now() > deadline)
      throw new Error(`No message for ${recipient} arrived at the mail sink.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The Keycloak action-token link of an invitation email. */
export function actionLink(text: string): string {
  const link = /(https?:\/\/\S+\/login-actions\/action-token\S+)/.exec(text)?.[1];
  if (!link) throw new Error('The message holds no action link.');
  return link;
}

// ---------------------------------------------------------------------------------------------
// TOTP (the realm policy: HMAC-SHA1, 6 digits, 30-second period; reused codes are refused)
// ---------------------------------------------------------------------------------------------

function base32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret.replace(/[\s=]/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}

function totp(secret: string, at: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/** A TOTP device: a secret and the codes already spent, so no code is used twice. */
export class Authenticator {
  private readonly used = new Set<string>();

  constructor(readonly secret: string) {}

  /** A code the realm accepts that was not used yet: the current, next or previous period. */
  code(): string {
    const now = Date.now();
    for (const at of [now, now + 30_000, now - 30_000]) {
      const code = totp(this.secret, at);
      if (!this.used.has(code)) {
        this.used.add(code);
        return code;
      }
    }
    throw new Error('no unused TOTP code in the accepted window');
  }
}

/** JWT-shaped text: three base64url parts, the first a JSON header (`eyJ`). */
export const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
/** Response fields that would carry identity-provider tokens. */
export const TOKEN_FIELD =
  /"(access_token|id_token|refresh_token|idToken|accessToken|refreshToken)"/;
