import type { TestInfo } from '@playwright/test';

/** The visual baseline browser, declared once in playwright.config.mts (project metadata). */
export interface VisualBrowser {
  readonly image: string;
  readonly container: string;
  readonly port: number;
}

export function visualBrowser(info: TestInfo): VisualBrowser {
  const { image, container, port } = info.project.metadata as Partial<VisualBrowser>;
  if (typeof image !== 'string' || typeof container !== 'string' || typeof port !== 'number')
    throw new Error('The visual-browser projects must declare { image, container, port } metadata');
  return { image, container, port };
}
