import { cleanup } from '@testing-library/react';
import type {} from '@vertex-os/ui';
import { afterEach } from 'vitest';

// jsdom does not implement scrolling; the router's scroll restoration only needs a no-op.
window.scrollTo = () => undefined;

// Vitest globals are disabled, so Testing Library cannot register its automatic cleanup.
afterEach(() => {
  cleanup();
  // Each test starts from first-run UI preferences (Arabic, system theme, Default density).
  window.vertexUiSettings?.dispose();
  localStorage.clear();
});
