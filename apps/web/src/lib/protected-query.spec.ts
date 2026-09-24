import { describe, expect, it } from 'vitest';
import { protectedQuery } from './protected-query';

describe('protectedQuery (IAM-R08B D-04, review S-11)', () => {
  it('declares the required permission on the query, which permission loss relies on', () => {
    const options = protectedQuery({
      permission: 'iam.users.read',
      queryKey: ['iam', 'users'],
      queryFn: () => Promise.resolve([]),
    });
    expect(options.meta).toEqual({ permission: 'iam.users.read' });
    expect(options.queryKey).toEqual(['iam', 'users']);
  });
});
