/**
 * The Vertex icon set (docs/DESIGN_SYSTEM.md §21): original outlined geometry on a 24-unit
 * grid, drawn with a 1.75-unit round stroke and `currentColor`.
 *
 * `directional` records logical intent. Only directional icons mirror in RTL, through the
 * `:dir(rtl)` rule in the icon stylesheet; there is no blanket transform. Logos, checks,
 * clocks, search, currency, vertical sort arrows, refresh, external links and geographic
 * symbols are never mirrored.
 */
const CIRCLE = 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z';
const dot = (x: number, y: number) => `M${x - 0.9} ${y}a0.9 0.9 0 1 0 1.8 0 0.9 0.9 0 1 0-1.8 0Z`;

const registry = {
  // Actions and navigation
  check: { path: 'M5 12.5 9.5 17 19 7.5', directional: false },
  dash: { path: 'M6.5 12h11', directional: false },
  close: { path: 'M6.5 6.5l11 11M17.5 6.5l-11 11', directional: false },
  'chevron-end': { path: 'm9.5 6 6 6-6 6', directional: true },
  'chevron-start': { path: 'm14.5 6-6 6 6 6', directional: true },
  'chevron-down': { path: 'm6 9.5 6 6 6-6', directional: false },
  'arrow-end': { path: 'M5 12h14m-6-6 6 6-6 6', directional: true },
  'arrow-start': { path: 'M19 12H5m6-6-6 6 6 6', directional: true },
  menu: { path: 'M4 7h16M4 12h16M4 17h16', directional: false },
  more: { path: `${dot(6, 12)}${dot(12, 12)}${dot(18, 12)}`, directional: false },
  search: {
    path: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 20 20',
    directional: false,
  },
  filter: { path: 'M4 5.5h16l-6 7.5v5l-4 2v-7L4 5.5Z', directional: false },
  sort: { path: 'M8 5v14M4.5 8.5 8 5l3.5 3.5M16 19V5m-3.5 10.5L16 19l3.5-3.5', directional: false },
  'sort-ascending': { path: 'M12 19V5M6.5 10.5 12 5l5.5 5.5', directional: false },
  'sort-descending': { path: 'M12 5v14m-5.5-5.5L12 19l5.5-5.5', directional: false },
  plus: { path: 'M12 5v14M5 12h14', directional: false },
  trash: { path: 'M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5', directional: false },
  refresh: { path: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4', directional: false },
  copy: { path: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4', directional: false },
  external: {
    path: 'M14 4h6v6m0-6-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    directional: false,
  },
  'panel-collapse': { path: 'M4.5 5.5h15v13h-15zM9.5 5.5v13m6-8.5-2 2 2 2', directional: true },
  'panel-expand': { path: 'M4.5 5.5h15v13h-15zM9.5 5.5v13m4-8.5 2 2-2 2', directional: true },
  sliders: { path: 'M4 7h10m4 0h2M4 17h4m4 0h8M14 5v4M8 15v4', directional: false },
  globe: {
    path: `${CIRCLE}M3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3Z`,
    directional: false,
  },
  printer: {
    path: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
    directional: false,
  },
  // Status (§33): every tone pairs with a shape, never colour alone.
  info: { path: `${CIRCLE}M12 11v5.5${dot(12, 7.75)}`, directional: false },
  'check-circle': { path: `${CIRCLE}M8 12.5l2.75 2.75L16 10`, directional: false },
  'minus-circle': { path: `${CIRCLE}M8 12h8`, directional: false },
  'alert-circle': { path: `${CIRCLE}M12 7.5V13${dot(12, 16.25)}`, directional: false },
  'alert-triangle': {
    path: `M10.3 4.2 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0ZM12 9.5v4${dot(12, 16.75)}`,
    directional: false,
  },
  clock: { path: `${CIRCLE}M12 7.5V12l3 2`, directional: false },
  progress: { path: 'M12 3a9 9 0 1 1-9 9M12 7.5V12h4.5', directional: false },
  'pause-circle': { path: `${CIRCLE}M10 9v6m4-6v6`, directional: false },
  lock: { path: 'M7.5 11V8a4.5 4.5 0 0 1 9 0v3M5.5 11h13v9h-13zM12 14.5v2.5', directional: false },
  archive: { path: 'M3.5 5h17v4h-17zM5 9v10h14V9m-9 4h4', directional: false },
  // Objects used by shell navigation and the synthetic proof scenarios
  home: { path: 'M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4Z', directional: false },
  file: {
    path: 'M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Zm0 0V8h4.5',
    directional: false,
  },
  user: {
    path: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4.5 20a7.5 7.5 0 0 1 15 0',
    directional: false,
  },
  shield: {
    path: 'M12 3.5 5 6.5v5c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9v-5l-7-3Z',
    directional: false,
  },
  briefcase: { path: 'M4 8h16v11H4zM9 8V5.5h6V8M4 13h16', directional: false },
  folder: {
    path: 'M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-12Z',
    directional: false,
  },
  wallet: {
    path: `M4 7.5h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12A1.5 1.5 0 0 1 5.5 5H17${dot(15.5, 13.5)}`,
    directional: false,
  },
  grid: {
    path: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
    directional: false,
  },
  layers: {
    path: 'M12 4 3.5 8.5 12 13l8.5-4.5L12 4ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
    directional: false,
  },
  table: { path: 'M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 10v8.5', directional: false },
  form: { path: 'M5 4.5h14v15H5zM8 9h8m-8 4h8m-8 4h5', directional: false },
  type: { path: 'M5 6.5V5h14v1.5M12 5v14m-2.5 0h5', directional: false },
  cursor: { path: 'M5 4l6.5 16 2.3-6.7L20.5 11 5 4Z', directional: false },
} as const satisfies Record<string, { path: string; directional: boolean }>;

export type IconName = keyof typeof registry;
export type IconSize = 'small' | 'default' | 'large' | 'empty';

/** Names of icons that mirror in RTL; exported for the icon specimen and tests. */
export const DIRECTIONAL_ICONS: readonly IconName[] = (Object.keys(registry) as IconName[]).filter(
  (name) => registry[name].directional,
);
export const ICON_NAMES = Object.keys(registry) as IconName[];

/** Decorative icon; the surrounding control or text always supplies the accessible name. */
export function Icon({ name, size = 'default' }: { name: IconName; size?: IconSize }) {
  const icon = registry[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="vx-icon"
      data-size={size}
      data-directional={icon.directional ? '' : undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icon.path} />
    </svg>
  );
}
