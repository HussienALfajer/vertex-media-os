/**
 * Leaves the single-page application with a top-level navigation: to the API's sign-in start
 * (spec Section 13) or to the identity provider after sign-out. Kept in one place so tests can
 * observe it instead of navigating the test document.
 */
export function leaveApplication(url: string): void {
  window.location.assign(url);
}
