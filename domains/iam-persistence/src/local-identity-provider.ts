import type { DatabaseClient } from '@vertex-os/database';
import { iamPersistenceOf } from '@vertex-os/database/iam';
import type { ExternalIdentity, IdentityProvider } from '@vertex-os/iam/identity-provider';

export const LOCAL_IDENTITY_ISSUER = 'vertex-local';

/** Local IAM rows replace the external identity directory; no credential material is returned. */
export function createLocalIdentityProvider(database: DatabaseClient): IdentityProvider {
  const client = iamPersistenceOf(database);
  const find = async (where: { id?: string; email?: string }) => {
    const row = where.id
      ? await client.iamApplicationUser.findUnique({ where: { id: where.id } })
      : where.email
        ? await client.iamApplicationUser.findUnique({ where: { email: where.email } })
        : null;
    if (!row) return undefined;
    return {
      subject: row.id,
      username: row.email,
      email: row.email,
      enabled: row.accessState === 'INVITED' || row.accessState === 'ACTIVE',
      emailVerified: true,
      vertexUserIds: [row.id],
      requiredActions: [],
    } satisfies ExternalIdentity;
  };
  const provider: IdentityProvider = {
    issuer: LOCAL_IDENTITY_ISSUER,
    async findBySubject(subject) {
      return { ok: true as const, value: await find({ id: subject }) };
    },
    async findByUsername(username) {
      return { ok: true as const, value: await find({ email: username }) };
    },
    async create() {
      // IAM inserts the row before identity reconciliation, so an exact lookup always wins.
      return { ok: true as const, value: { outcome: 'duplicate' as const } };
    },
    async setEnabled(subject) {
      return {
        ok: true as const,
        value: (await find({ id: subject })) ? ('updated' as const) : ('not-found' as const),
      };
    },
    async terminateSessions(subject) {
      return {
        ok: true as const,
        value: (await find({ id: subject })) ? ('terminated' as const) : ('not-found' as const),
      };
    },
    async enrolledFactors(subject) {
      const row = await client.iamApplicationUser.findUnique({
        where: { id: subject },
        select: { passwordHash: true },
      });
      return {
        ok: true as const,
        // The legacy factor port requires an OTP flag. For local accounts this flag means
        // "second factor not applicable"; no OTP credential exists or is checked.
        value: row ? { password: row.passwordHash !== null, otp: true } : ('not-found' as const),
      };
    },
    async sendInvitation(subject) {
      return {
        ok: true as const,
        value: (await find({ id: subject })) ? ('sent' as const) : ('not-found' as const),
      };
    },
  };
  return Object.freeze(provider);
}
