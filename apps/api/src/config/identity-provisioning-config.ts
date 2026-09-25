/** Compatibility setting while IAM's legacy invitation status is retired. */
export interface IdentityProvisioningConfig {
  readonly invitationLifespanSeconds: number;
}

export function loadIdentityProvisioningConfig(
  _source: Readonly<Record<string, string | undefined>>,
): IdentityProvisioningConfig {
  return { invitationLifespanSeconds: 43_200 };
}
