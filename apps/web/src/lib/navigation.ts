/**
 * Leaves the single-page application with a top-level navigation. Kept in one place so tests
 * can observe it instead of navigating the test document.
 */
export function leaveApplication(url: string): void {
  window.location.assign(url);
}
