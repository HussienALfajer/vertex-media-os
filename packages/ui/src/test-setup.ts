import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are disabled, so Testing Library cannot register its automatic cleanup.
// Token, font and lint specs run in the node environment and have no DOM to reset.
afterEach(() => {
  if (typeof window === 'undefined') return;
  cleanup();
  // Every test starts from first-run preferences with a fresh root store.
  window.vertexUiSettings?.dispose();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
});
