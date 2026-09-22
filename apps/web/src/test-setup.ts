import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement scrolling; the router's scroll restoration only needs a no-op.
window.scrollTo = () => undefined;

// Vitest globals are disabled, so Testing Library cannot register its automatic cleanup.
afterEach(() => {
  cleanup();
});
