import type { Tone } from '@vertex-os/ui';

/** The result of an administrative action, shown in the page's context (IAM-R08B D-10). */
export interface Outcome {
  readonly tone: Tone;
  readonly title: string;
  readonly detail?: string | undefined;
}
