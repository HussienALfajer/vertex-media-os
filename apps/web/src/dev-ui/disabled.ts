import type { ComponentType } from 'react';
import type * as Lab from './index';

/**
 * Production stand-in for the design-system lab (see ./index.ts). The /dev/ui route resolves
 * to not-found before these can render; they exist only to satisfy the imports.
 */
const unavailable: ComponentType = () => null;

export const LabLayout = unavailable;
export const LabOverview = unavailable;
export const LabSection = unavailable;

// Compile-time guard: the stand-in exports exactly the lab entry's names.
const exports: Record<keyof typeof Lab, ComponentType> = { LabLayout, LabOverview, LabSection };
void exports;
