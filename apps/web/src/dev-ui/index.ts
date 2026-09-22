/**
 * Entry of the design-system lab, imported only through the `#design-lab` alias. Vite maps
 * the alias here for development, tests and the explicit lab build, and to `disabled.ts`
 * for production, so no lab module ever enters the production module graph (DS-D026).
 */
export { LabLayout, LabOverview } from './lab-layout';
export { LabSection } from './lab-section';
