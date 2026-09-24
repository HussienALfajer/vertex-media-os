import type { FastifyRequest } from 'fastify';

/**
 * Logged once per window when input anyone can repeat stops writing Audit evidence (IAM-R09 D-04):
 * the events go on being logged, and this line is the signal an alert watches for.
 */
export function logEvidenceLimited(request: FastifyRequest, evidence: string): void {
  request.log.warn(
    { auth: 'evidence-limited', evidence },
    'evidence limit reached for this window; further events are logged only',
  );
}
