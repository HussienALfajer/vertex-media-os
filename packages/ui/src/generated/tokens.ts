// Generated from src/tokens/tokens.json by scripts/generate-tokens.mjs. Do not edit by hand.
export interface TokenInfo {
  readonly name: string;
  readonly variable: `--vx-${string}`;
  readonly type: string;
  readonly mode: 'fixed' | 'theme' | 'density' | 'language';
  readonly layer: 'semantic' | 'component';
  readonly contexts: readonly string[];
  readonly description: string;
}

export const TOKEN_CATALOG: readonly TokenInfo[] = [
  {
    "name": "border.width.default",
    "variable": "--vx-border-width-default",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Default boundary and separator width (§16)."
  },
  {
    "name": "border.width.emphasis",
    "variable": "--vx-border-width-emphasis",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Selected navigation and tab indicator width (§16)."
  },
  {
    "name": "color.action.danger.background",
    "variable": "--vx-color-action-danger-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Filled destructive commit action."
  },
  {
    "name": "color.action.danger.foreground",
    "variable": "--vx-color-action-danger-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Label on destructive fills."
  },
  {
    "name": "color.action.danger.hover",
    "variable": "--vx-color-action-danger-hover",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Hovered destructive fill."
  },
  {
    "name": "color.action.danger.pressed",
    "variable": "--vx-color-action-danger-pressed",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Pressed destructive fill; Dark adds an inset danger boundary."
  },
  {
    "name": "color.action.disabled.background",
    "variable": "--vx-color-action-disabled-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Unavailable action fill."
  },
  {
    "name": "color.action.disabled.foreground",
    "variable": "--vx-color-action-disabled-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Unavailable action label."
  },
  {
    "name": "color.action.primary.background",
    "variable": "--vx-color-action-primary-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Resting fill of the primary commit action and checked controls."
  },
  {
    "name": "color.action.primary.foreground",
    "variable": "--vx-color-action-primary-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Label and glyph on primary and checked fills."
  },
  {
    "name": "color.action.primary.hover",
    "variable": "--vx-color-action-primary-hover",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Hovered primary fill."
  },
  {
    "name": "color.action.primary.pressed",
    "variable": "--vx-color-action-primary-pressed",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Pressed primary fill."
  },
  {
    "name": "color.action.quiet.hover",
    "variable": "--vx-color-action-quiet-hover",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared hover fill for secondary, ghost, menu and row interaction."
  },
  {
    "name": "color.action.quiet.pressed",
    "variable": "--vx-color-action-quiet-pressed",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared pressed fill for secondary and ghost interaction."
  },
  {
    "name": "color.action.secondary.background",
    "variable": "--vx-color-action-secondary-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Secondary action resting fill."
  },
  {
    "name": "color.action.secondary.border",
    "variable": "--vx-color-action-secondary-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Secondary action boundary."
  },
  {
    "name": "color.action.secondary.foreground",
    "variable": "--vx-color-action-secondary-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Secondary and ghost action label."
  },
  {
    "name": "color.background.canvas",
    "variable": "--vx-color-background-canvas",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Root work plane behind every page."
  },
  {
    "name": "color.background.raised",
    "variable": "--vx-color-background-raised",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Floating plane for dialogs, menus, popovers and tooltips."
  },
  {
    "name": "color.background.sidebar",
    "variable": "--vx-color-background-sidebar",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Quiet shell navigation plane."
  },
  {
    "name": "color.background.subtle",
    "variable": "--vx-color-background-subtle",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Passive grouping well and table headings."
  },
  {
    "name": "color.background.surface",
    "variable": "--vx-color-background-surface",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Content plane for forms, tables and bounded content."
  },
  {
    "name": "color.border.default",
    "variable": "--vx-color-border-default",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Passive surface enclosure and floating-surface edge."
  },
  {
    "name": "color.border.strong",
    "variable": "--vx-color-border-strong",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Required control outlines and resize handles."
  },
  {
    "name": "color.border.subtle",
    "variable": "--vx-color-border-subtle",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Decorative separators; never the only cue for a control."
  },
  {
    "name": "color.brand.accent",
    "variable": "--vx-color-brand-accent",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Small readable identity text only."
  },
  {
    "name": "color.brand.decorative",
    "variable": "--vx-color-brand-decorative",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Non-informational brand artwork only."
  },
  {
    "name": "color.brand.mark",
    "variable": "--vx-color-brand-mark",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Approved monochrome brand artwork and the typographic identity."
  },
  {
    "name": "color.chart.axis",
    "variable": "--vx-color-chart-axis",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Chart axes and tick labels (§37.1)."
  },
  {
    "name": "color.chart.background",
    "variable": "--vx-color-chart-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Chart plotting plane (§37.1)."
  },
  {
    "name": "color.chart.grid",
    "variable": "--vx-color-chart-grid",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Decorative chart grid lines (§37.1)."
  },
  {
    "name": "color.chart.series.1",
    "variable": "--vx-color-chart-series-1",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Categorical chart series 1; identity stays stable across views (§37.1)."
  },
  {
    "name": "color.chart.series.2",
    "variable": "--vx-color-chart-series-2",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Categorical chart series 2; identity stays stable across views (§37.1)."
  },
  {
    "name": "color.chart.series.3",
    "variable": "--vx-color-chart-series-3",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Categorical chart series 3; identity stays stable across views (§37.1)."
  },
  {
    "name": "color.chart.series.4",
    "variable": "--vx-color-chart-series-4",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Categorical chart series 4; identity stays stable across views (§37.1)."
  },
  {
    "name": "color.chart.series.5",
    "variable": "--vx-color-chart-series-5",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Categorical chart series 5; identity stays stable across views (§37.1)."
  },
  {
    "name": "color.chart.series.6",
    "variable": "--vx-color-chart-series-6",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Categorical chart series 6; identity stays stable across views (§37.1)."
  },
  {
    "name": "color.chart.zero",
    "variable": "--vx-color-chart-zero",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Chart zero baseline (§37.1)."
  },
  {
    "name": "color.field.background",
    "variable": "--vx-color-field-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Editable field fill and unchecked choice fill."
  },
  {
    "name": "color.field.border",
    "variable": "--vx-color-field-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Editable field and unchecked choice boundary."
  },
  {
    "name": "color.field.placeholder",
    "variable": "--vx-color-field-placeholder",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Optional placeholder example text."
  },
  {
    "name": "color.field.readonly.background",
    "variable": "--vx-color-field-readonly-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Read-only field fill; value stays readable."
  },
  {
    "name": "color.focus.gap",
    "variable": "--vx-color-focus-gap",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Separating gap between a control and its focus ring."
  },
  {
    "name": "color.focus.ring",
    "variable": "--vx-color-focus-ring",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Focus outline colour (§20)."
  },
  {
    "name": "color.icon.default",
    "variable": "--vx-color-icon-default",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Meaningful functional icons."
  },
  {
    "name": "color.overlay.scrim",
    "variable": "--vx-color-overlay-scrim",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Modal background dimming without blur."
  },
  {
    "name": "color.selection.text.background",
    "variable": "--vx-color-selection-text-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Browser text-selection background."
  },
  {
    "name": "color.selection.text.foreground",
    "variable": "--vx-color-selection-text-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Browser text-selection foreground."
  },
  {
    "name": "color.skeleton.base",
    "variable": "--vx-color-skeleton-base",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Loading placeholder shape."
  },
  {
    "name": "color.skeleton.highlight",
    "variable": "--vx-color-skeleton-highlight",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Loading placeholder pulse highlight."
  },
  {
    "name": "color.state.selected.background",
    "variable": "--vx-color-state-selected-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Selected or current item fill."
  },
  {
    "name": "color.state.selected.foreground",
    "variable": "--vx-color-state-selected-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Selected or current item text."
  },
  {
    "name": "color.state.selected.hover",
    "variable": "--vx-color-state-selected-hover",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Hovered selected fill."
  },
  {
    "name": "color.state.selected.indicator",
    "variable": "--vx-color-state-selected-indicator",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Selected navigation and tab marker."
  },
  {
    "name": "color.status.danger.background",
    "variable": "--vx-color-status-danger-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Failed, error or disabled-access status background; pair only with its matching foreground (§9.3)."
  },
  {
    "name": "color.status.danger.border",
    "variable": "--vx-color-status-danger-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Failed, error or disabled-access status boundary; aliases its foreground (§9.3)."
  },
  {
    "name": "color.status.danger.foreground",
    "variable": "--vx-color-status-danger-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Failed, error or disabled-access status text, icon and heading (§9.3)."
  },
  {
    "name": "color.status.info.background",
    "variable": "--vx-color-status-info-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Pending, queued or in-progress status background; pair only with its matching foreground (§9.3)."
  },
  {
    "name": "color.status.info.border",
    "variable": "--vx-color-status-info-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Pending, queued or in-progress status boundary; aliases its foreground (§9.3)."
  },
  {
    "name": "color.status.info.foreground",
    "variable": "--vx-color-status-info-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Pending, queued or in-progress status text, icon and heading (§9.3)."
  },
  {
    "name": "color.status.neutral.background",
    "variable": "--vx-color-status-neutral-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Inactive, draft, archived or unknown status background; pair only with its matching foreground (§9.3)."
  },
  {
    "name": "color.status.neutral.border",
    "variable": "--vx-color-status-neutral-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Inactive, draft, archived or unknown status boundary; aliases its foreground (§9.3)."
  },
  {
    "name": "color.status.neutral.foreground",
    "variable": "--vx-color-status-neutral-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Inactive, draft, archived or unknown status text, icon and heading (§9.3)."
  },
  {
    "name": "color.status.success.background",
    "variable": "--vx-color-status-success-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Active, complete or approved status background; pair only with its matching foreground (§9.3)."
  },
  {
    "name": "color.status.success.border",
    "variable": "--vx-color-status-success-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Active, complete or approved status boundary; aliases its foreground (§9.3)."
  },
  {
    "name": "color.status.success.foreground",
    "variable": "--vx-color-status-success-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Active, complete or approved status text, icon and heading (§9.3)."
  },
  {
    "name": "color.status.warning.background",
    "variable": "--vx-color-status-warning-background",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Attention, overdue or temporarily blocked status background; pair only with its matching foreground (§9.3)."
  },
  {
    "name": "color.status.warning.border",
    "variable": "--vx-color-status-warning-border",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Attention, overdue or temporarily blocked status boundary; aliases its foreground (§9.3)."
  },
  {
    "name": "color.status.warning.foreground",
    "variable": "--vx-color-status-warning-foreground",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Attention, overdue or temporarily blocked status text, icon and heading (§9.3)."
  },
  {
    "name": "color.text.disabled",
    "variable": "--vx-color-text-disabled",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Unavailable control text only; never readable records."
  },
  {
    "name": "color.text.link",
    "variable": "--vx-color-text-link",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Link text; underlined in prose."
  },
  {
    "name": "color.text.link-hover",
    "variable": "--vx-color-text-link-hover",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Hovered and active link text."
  },
  {
    "name": "color.text.muted",
    "variable": "--vx-color-text-muted",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Low-emphasis text that remains readable."
  },
  {
    "name": "color.text.primary",
    "variable": "--vx-color-text-primary",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Content, labels and primary text."
  },
  {
    "name": "color.text.secondary",
    "variable": "--vx-color-text-secondary",
    "type": "color",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Supporting information and metadata."
  },
  {
    "name": "component.badge.min-block",
    "variable": "--vx-component-badge-min-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum badge block size around its 20px line box."
  },
  {
    "name": "component.badge.padding-block",
    "variable": "--vx-component-badge-padding-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Badge block padding (24px minimum height minus the 20px line box)."
  },
  {
    "name": "component.badge.padding-inline",
    "variable": "--vx-component-badge-padding-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Badge inline padding."
  },
  {
    "name": "component.dialog.inline",
    "variable": "--vx-component-dialog-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Preferred maximum dialog inline size."
  },
  {
    "name": "component.dialog.viewport-margin",
    "variable": "--vx-component-dialog-viewport-margin",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Total viewport margin budget kept free around dialogs."
  },
  {
    "name": "component.dialog.wide-inline",
    "variable": "--vx-component-dialog-wide-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Dialog inline size for a justified structured form."
  },
  {
    "name": "component.drawer.inline",
    "variable": "--vx-component-drawer-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Preferred modal drawer inline size."
  },
  {
    "name": "component.drawer.max-inline",
    "variable": "--vx-component-drawer-max-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Maximum modal drawer inline size."
  },
  {
    "name": "component.inspector.inline",
    "variable": "--vx-component-inspector-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Default nonmodal inspector inline size."
  },
  {
    "name": "component.inspector.max-inline",
    "variable": "--vx-component-inspector-max-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Maximum nonmodal inspector inline size."
  },
  {
    "name": "component.inspector.min-inline",
    "variable": "--vx-component-inspector-min-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum nonmodal inspector inline size."
  },
  {
    "name": "component.menu.inline",
    "variable": "--vx-component-menu-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Preferred menu inline size."
  },
  {
    "name": "component.menu.max-inline",
    "variable": "--vx-component-menu-max-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Maximum menu inline size; long labels wrap."
  },
  {
    "name": "component.page-header.region-gap",
    "variable": "--vx-component-page-header-region-gap",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Gap within the page heading region."
  },
  {
    "name": "component.page-header.title-gap",
    "variable": "--vx-component-page-header-title-gap",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Gap between a page title and its subtitle."
  },
  {
    "name": "component.popover.inline",
    "variable": "--vx-component-popover-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Preferred popover inline size."
  },
  {
    "name": "component.popover.max-inline",
    "variable": "--vx-component-popover-max-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Maximum popover inline size."
  },
  {
    "name": "component.progress.track-block",
    "variable": "--vx-component-progress-track-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Determinate progress track thickness; implementation geometry within the §32 progress pattern."
  },
  {
    "name": "component.skeleton.pulse",
    "variable": "--vx-component-skeleton-pulse",
    "type": "duration",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Optional skeleton pulse period."
  },
  {
    "name": "component.spinner.rotation",
    "variable": "--vx-component-spinner-rotation",
    "type": "duration",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "One indeterminate spinner rotation (linear)."
  },
  {
    "name": "component.switch.inset",
    "variable": "--vx-component-switch-inset",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Switch thumb inset from the track edge."
  },
  {
    "name": "component.switch.thumb",
    "variable": "--vx-component-switch-thumb",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Switch thumb diameter."
  },
  {
    "name": "component.switch.track-block",
    "variable": "--vx-component-switch-track-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Switch track block size."
  },
  {
    "name": "component.switch.track-inline",
    "variable": "--vx-component-switch-track-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Switch track inline size."
  },
  {
    "name": "component.table.cell.padding-block",
    "variable": "--vx-component-table-cell-padding-block",
    "type": "dimension",
    "mode": "density",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Cell block padding around the 24px body line."
  },
  {
    "name": "component.table.cell.padding-inline",
    "variable": "--vx-component-table-cell-padding-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Cell inline padding for every column."
  },
  {
    "name": "component.table.column.actions",
    "variable": "--vx-component-table-column-actions",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum inline size of a actions column; values may force wider columns, never truncation."
  },
  {
    "name": "component.table.column.amount",
    "variable": "--vx-component-table-column-amount",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum inline size of a amount column; values may force wider columns, never truncation."
  },
  {
    "name": "component.table.column.identity",
    "variable": "--vx-component-table-column-identity",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum inline size of a identity column; values may force wider columns, never truncation."
  },
  {
    "name": "component.table.column.selection",
    "variable": "--vx-component-table-column-selection",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum inline size of a selection column; values may force wider columns, never truncation."
  },
  {
    "name": "component.table.column.status",
    "variable": "--vx-component-table-column-status",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum inline size of a status column; values may force wider columns, never truncation."
  },
  {
    "name": "component.table.column.text",
    "variable": "--vx-component-table-column-text",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Minimum inline size of a text column; values may force wider columns, never truncation."
  },
  {
    "name": "component.table.header.min-block",
    "variable": "--vx-component-table-header-min-block",
    "type": "dimension",
    "mode": "density",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Column-heading row minimum block size."
  },
  {
    "name": "component.table.row.min-block",
    "variable": "--vx-component-table-row-min-block",
    "type": "dimension",
    "mode": "density",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Single-line data row minimum block size."
  },
  {
    "name": "component.table.row.secondary-min-block",
    "variable": "--vx-component-table-row-secondary-min-block",
    "type": "dimension",
    "mode": "density",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Two-line (24 + 20px) data row minimum block size."
  },
  {
    "name": "component.table.row.touch-min-block",
    "variable": "--vx-component-table-row-touch-min-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Coarse-pointer row minimum around 44px controls."
  },
  {
    "name": "component.toast.inset",
    "variable": "--vx-component-toast-inset",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Toast viewport inset at block-end and inline-end."
  },
  {
    "name": "component.toast.inset-narrow",
    "variable": "--vx-component-toast-inset-narrow",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Toast viewport inset below 768px."
  },
  {
    "name": "component.toast.max-inline",
    "variable": "--vx-component-toast-max-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Maximum toast inline size."
  },
  {
    "name": "component.tooltip.max-inline",
    "variable": "--vx-component-tooltip-max-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Maximum tooltip inline size."
  },
  {
    "name": "component.tooltip.padding-block",
    "variable": "--vx-component-tooltip-padding-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Tooltip block padding."
  },
  {
    "name": "component.tooltip.padding-inline",
    "variable": "--vx-component-tooltip-padding-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "component",
    "contexts": [
      "component"
    ],
    "description": "Tooltip inline padding."
  },
  {
    "name": "focus.ring.offset",
    "variable": "--vx-focus-ring-offset",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Separating gap between a control and its focus ring (§20)."
  },
  {
    "name": "focus.ring.width",
    "variable": "--vx-focus-ring-width",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Solid focus ring width (§20)."
  },
  {
    "name": "font.family.arabic",
    "variable": "--vx-font-family-arabic",
    "type": "font-family",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Arabic text family (§12.1)."
  },
  {
    "name": "font.family.latin",
    "variable": "--vx-font-family-latin",
    "type": "font-family",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Latin text family (§12.1)."
  },
  {
    "name": "font.family.mono",
    "variable": "--vx-font-family-mono",
    "type": "font-family",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "IDs, logs and technical fragments; never all Arabic text (§12.1)."
  },
  {
    "name": "font.family.ui",
    "variable": "--vx-font-family-ui",
    "type": "font-family",
    "mode": "language",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Interface family: Arabic-first in Arabic UI and Latin-first in English UI (§12.1)."
  },
  {
    "name": "font.weight.medium",
    "variable": "--vx-font-weight-medium",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Label, control and heading-cell weight (§12.2)."
  },
  {
    "name": "font.weight.regular",
    "variable": "--vx-font-weight-regular",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Regular text weight (§12.2)."
  },
  {
    "name": "font.weight.semibold",
    "variable": "--vx-font-weight-semibold",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Headings and emphasis; emphasis uses weight, not colour (§12.2)."
  },
  {
    "name": "layer.base",
    "variable": "--vx-layer-base",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for base content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.modal",
    "variable": "--vx-layer-modal",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for modal content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.modal-popup",
    "variable": "--vx-layer-modal-popup",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for modal popup content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.modal-scrim",
    "variable": "--vx-layer-modal-scrim",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for modal scrim content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.popup",
    "variable": "--vx-layer-popup",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for popup content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.shell",
    "variable": "--vx-layer-shell",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for shell content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.sticky",
    "variable": "--vx-layer-sticky",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for sticky content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.toast",
    "variable": "--vx-layer-toast",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for toast content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "layer.tooltip",
    "variable": "--vx-layer-tooltip",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Shared stacking order for tooltip content; owned by the overlay manager, not by z-index escalation (§17.2)."
  },
  {
    "name": "motion.duration.base",
    "variable": "--vx-motion-duration-base",
    "type": "duration",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Menus, popovers, disclosure and state crossfade (§18)."
  },
  {
    "name": "motion.duration.enter",
    "variable": "--vx-motion-duration-enter",
    "type": "duration",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Dialog entrance (§18)."
  },
  {
    "name": "motion.duration.fast",
    "variable": "--vx-motion-duration-fast",
    "type": "duration",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Hover, press and focus-associated colour (§18)."
  },
  {
    "name": "motion.duration.instant",
    "variable": "--vx-motion-duration-instant",
    "type": "duration",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Reduced motion and immediate data corrections (§18)."
  },
  {
    "name": "motion.duration.panel",
    "variable": "--vx-motion-duration-panel",
    "type": "duration",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Drawer entrance (§18)."
  },
  {
    "name": "motion.ease.enter",
    "variable": "--vx-motion-ease-enter",
    "type": "easing",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Entrances (§18)."
  },
  {
    "name": "motion.ease.exit",
    "variable": "--vx-motion-ease-exit",
    "type": "easing",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Exits (§18)."
  },
  {
    "name": "motion.ease.standard",
    "variable": "--vx-motion-ease-standard",
    "type": "easing",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Within-page transitions (§18)."
  },
  {
    "name": "motion.offset.dialog",
    "variable": "--vx-motion-offset-dialog",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Maximum block displacement of a dialog entrance (§18)."
  },
  {
    "name": "motion.offset.drawer",
    "variable": "--vx-motion-offset-drawer",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Maximum displacement of a drawer entrance from its logical edge (§18)."
  },
  {
    "name": "motion.offset.popup",
    "variable": "--vx-motion-offset-popup",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Maximum block displacement of a menu, popover or tooltip entrance (§18)."
  },
  {
    "name": "radius.control",
    "variable": "--vx-radius-control",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Control, navigation item and tooltip corner (§15)."
  },
  {
    "name": "radius.none",
    "variable": "--vx-radius-none",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Flush regions and viewport-attached drawer edges (§15)."
  },
  {
    "name": "radius.overlay",
    "variable": "--vx-radius-overlay",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Dialog and modal-drawer exposed corner (§15)."
  },
  {
    "name": "radius.round",
    "variable": "--vx-radius-round",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Radio, switch and avatar shapes only (§15)."
  },
  {
    "name": "radius.small",
    "variable": "--vx-radius-small",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Checkbox, keycap and badge corner (§15)."
  },
  {
    "name": "radius.surface",
    "variable": "--vx-radius-surface",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Panel, menu, popover and bounded-table corner (§15)."
  },
  {
    "name": "shadow.floating",
    "variable": "--vx-shadow-floating",
    "type": "shadow",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Menus, popovers and tooltips; always with a default border (§17.1)."
  },
  {
    "name": "shadow.modal",
    "variable": "--vx-shadow-modal",
    "type": "shadow",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Modal dialog or drawer (§17.1)."
  },
  {
    "name": "shadow.none",
    "variable": "--vx-shadow-none",
    "type": "shadow",
    "mode": "theme",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Canvas, cards, tables and ordinary panels (§17.1)."
  },
  {
    "name": "size.breakpoint.medium",
    "variable": "--vx-size-breakpoint-medium",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Start of the medium range: collapsed rail, 24px gutters (§23)."
  },
  {
    "name": "size.breakpoint.wide",
    "variable": "--vx-size-breakpoint-wide",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Start of the wide range: expanded sidebar (§23)."
  },
  {
    "name": "size.breakpoint.xwide",
    "variable": "--vx-size-breakpoint-xwide",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Start of the extra-wide range: 32px gutters (§23)."
  },
  {
    "name": "size.choice.visual",
    "variable": "--vx-size-choice-visual",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Checkbox and radio visual size; the hit area includes the label (§14)."
  },
  {
    "name": "size.content.dashboard",
    "variable": "--vx-size-content-dashboard",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Maximum dashboard inline size (§22.2)."
  },
  {
    "name": "size.content.detail",
    "variable": "--vx-size-content-detail",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Maximum general-detail inline size (§22.2)."
  },
  {
    "name": "size.content.field",
    "variable": "--vx-size-content-field",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Preferred inline size of an ordinary short-text field (§22.2)."
  },
  {
    "name": "size.content.form",
    "variable": "--vx-size-content-form",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Maximum editing-form inline size (§22.2)."
  },
  {
    "name": "size.content.primary-min",
    "variable": "--vx-size-content-primary-min",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Minimum primary column before a split view stacks (§22.2)."
  },
  {
    "name": "size.content.reading",
    "variable": "--vx-size-content-reading",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Maximum reading-content inline size (§22.2)."
  },
  {
    "name": "size.content.secondary",
    "variable": "--vx-size-content-secondary",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Secondary metadata column in a detail + metadata split (§22.2)."
  },
  {
    "name": "size.control.block",
    "variable": "--vx-size-control-block",
    "type": "dimension",
    "mode": "density",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum block size of inputs, selects and buttons (§14)."
  },
  {
    "name": "size.control.large",
    "variable": "--vx-size-control-large",
    "type": "dimension",
    "mode": "density",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Rare touch-emphasized action size (§14)."
  },
  {
    "name": "size.control.small",
    "variable": "--vx-size-control-small",
    "type": "dimension",
    "mode": "density",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Small control size for secondary table and toolbar actions only (§14)."
  },
  {
    "name": "size.icon.default",
    "variable": "--vx-size-icon-default",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Button, field and sidebar icons (§21)."
  },
  {
    "name": "size.icon.empty",
    "variable": "--vx-size-icon-empty",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Restrained empty-state illustration icon (§21)."
  },
  {
    "name": "size.icon.large",
    "variable": "--vx-size-icon-large",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Prominent feedback icons (§21)."
  },
  {
    "name": "size.icon.small",
    "variable": "--vx-size-icon-small",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Metadata, table-status and small-control icons (§21)."
  },
  {
    "name": "size.menu.item",
    "variable": "--vx-size-menu-item",
    "type": "dimension",
    "mode": "density",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum menu item size; items wrap when needed (§14)."
  },
  {
    "name": "size.navigation.item",
    "variable": "--vx-size-navigation-item",
    "type": "dimension",
    "mode": "density",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum sidebar, navigation and tab row size (§14)."
  },
  {
    "name": "size.search.min",
    "variable": "--vx-size-search-min",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum SearchInput inline size (§14)."
  },
  {
    "name": "size.search.preferred",
    "variable": "--vx-size-search-preferred",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Preferred SearchInput inline size (§14)."
  },
  {
    "name": "size.shell.header",
    "variable": "--vx-size-shell-header",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum shell header block size (§22.1)."
  },
  {
    "name": "size.shell.rail",
    "variable": "--vx-size-shell-rail",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Collapsed navigation rail (§22.1)."
  },
  {
    "name": "size.shell.sidebar",
    "variable": "--vx-size-shell-sidebar",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Expanded desktop sidebar (§22.1)."
  },
  {
    "name": "size.target.touch",
    "variable": "--vx-size-target-touch",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum coarse-pointer target for actions and choice rows (§14)."
  },
  {
    "name": "size.textarea.min-block",
    "variable": "--vx-size-textarea-min-block",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum textarea block size (§14)."
  },
  {
    "name": "space.actions",
    "variable": "--vx-space-actions",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Gap between related buttons. (§13)"
  },
  {
    "name": "space.control.block",
    "variable": "--vx-space-control-block",
    "type": "dimension",
    "mode": "density",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Minimum block inset of buttons; controls may grow for multi-line text (§14)."
  },
  {
    "name": "space.control.inline",
    "variable": "--vx-space-control-inline",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Inline inset of text controls and buttons (§14)."
  },
  {
    "name": "space.field.gap",
    "variable": "--vx-space-field-gap",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Stack gap between label, control, description and error. (§13)"
  },
  {
    "name": "space.form.fields",
    "variable": "--vx-space-form-fields",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Gap between field groups. (§13)"
  },
  {
    "name": "space.form.sections",
    "variable": "--vx-space-form-sections",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Gap between titled form sections. (§13)"
  },
  {
    "name": "space.icon-label",
    "variable": "--vx-space-icon-label",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Gap between an icon and its label or a choice and its text. (§13)"
  },
  {
    "name": "space.menu.padding",
    "variable": "--vx-space-menu-padding",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Outer menu inset. (§13)"
  },
  {
    "name": "space.overlay.padding",
    "variable": "--vx-space-overlay-padding",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Inset of dialog and drawer content. (§13)"
  },
  {
    "name": "space.overlay.padding-narrow",
    "variable": "--vx-space-overlay-padding-narrow",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Overlay inset below the medium breakpoint (§23). (§13)"
  },
  {
    "name": "space.page.gutter",
    "variable": "--vx-space-page-gutter",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Page gutter from 768px to 1599px (§23). (§13)"
  },
  {
    "name": "space.page.gutter-narrow",
    "variable": "--vx-space-page-gutter-narrow",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Page gutter below 768px (§23). (§13)"
  },
  {
    "name": "space.page.gutter-wide",
    "variable": "--vx-space-page-gutter-wide",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Page gutter at 1600px and wider (§23). (§13)"
  },
  {
    "name": "space.popup.collision-padding",
    "variable": "--vx-space-popup-collision-padding",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Viewport collision padding kept around popups (§31.1)."
  },
  {
    "name": "space.popup.offset",
    "variable": "--vx-space-popup-offset",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Gap between a popover, menu or tooltip and its trigger (§31.1)."
  },
  {
    "name": "space.section",
    "variable": "--vx-space-section",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Gap between adjacent page sections. (§13)"
  },
  {
    "name": "space.surface.padding",
    "variable": "--vx-space-surface-padding",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Inset of a standard bounded work area. (§13)"
  },
  {
    "name": "space.toolbar.groups",
    "variable": "--vx-space-toolbar-groups",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Gap between search, filter and action groups. (§13)"
  },
  {
    "name": "type.body-long.line-height",
    "variable": "--vx-type-body-long-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Briefs, comments and long reading. Line-height ratio (§12.2)."
  },
  {
    "name": "type.body-long.size",
    "variable": "--vx-type-body-long-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Briefs, comments and long reading. Size (§12.2)."
  },
  {
    "name": "type.body-long.weight",
    "variable": "--vx-type-body-long-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Briefs, comments and long reading. Weight (§12.2)."
  },
  {
    "name": "type.body.line-height",
    "variable": "--vx-type-body-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Default operational text and table cells. Line-height ratio (§12.2)."
  },
  {
    "name": "type.body.size",
    "variable": "--vx-type-body-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Default operational text and table cells. Size (§12.2)."
  },
  {
    "name": "type.body.weight",
    "variable": "--vx-type-body-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Default operational text and table cells. Weight (§12.2)."
  },
  {
    "name": "type.code.line-height",
    "variable": "--vx-type-code-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "IDs, logs and technical fragments. Line-height ratio (§12.2)."
  },
  {
    "name": "type.code.size",
    "variable": "--vx-type-code-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "IDs, logs and technical fragments. Size (§12.2)."
  },
  {
    "name": "type.code.weight",
    "variable": "--vx-type-code-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "IDs, logs and technical fragments. Weight (§12.2)."
  },
  {
    "name": "type.control-touch.line-height",
    "variable": "--vx-type-control-touch-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Text inputs below 768px or with a coarse pointer, preventing mobile zoom. Line-height ratio (§12.2)."
  },
  {
    "name": "type.control-touch.size",
    "variable": "--vx-type-control-touch-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Text inputs below 768px or with a coarse pointer, preventing mobile zoom. Size (§12.2)."
  },
  {
    "name": "type.control-touch.weight",
    "variable": "--vx-type-control-touch-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Text inputs below 768px or with a coarse pointer, preventing mobile zoom. Weight (§12.2)."
  },
  {
    "name": "type.label.line-height",
    "variable": "--vx-type-label-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Controls, fields, menu items and navigation. Line-height ratio (§12.2)."
  },
  {
    "name": "type.label.size",
    "variable": "--vx-type-label-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Controls, fields, menu items and navigation. Size (§12.2)."
  },
  {
    "name": "type.label.weight",
    "variable": "--vx-type-label-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Controls, fields, menu items and navigation. Weight (§12.2)."
  },
  {
    "name": "type.metric.line-height",
    "variable": "--vx-type-metric-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "A small number of useful summaries. Line-height ratio (§12.2)."
  },
  {
    "name": "type.metric.size",
    "variable": "--vx-type-metric-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "A small number of useful summaries. Size (§12.2)."
  },
  {
    "name": "type.metric.weight",
    "variable": "--vx-type-metric-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "A small number of useful summaries. Weight (§12.2)."
  },
  {
    "name": "type.page-title-narrow.line-height",
    "variable": "--vx-type-page-title-narrow-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Page heading below 768px (§23). Line-height ratio (§12.2)."
  },
  {
    "name": "type.page-title-narrow.size",
    "variable": "--vx-type-page-title-narrow-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Page heading below 768px (§23). Size (§12.2)."
  },
  {
    "name": "type.page-title-narrow.weight",
    "variable": "--vx-type-page-title-narrow-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component"
    ],
    "description": "Page heading below 768px (§23). Weight (§12.2)."
  },
  {
    "name": "type.page-title.line-height",
    "variable": "--vx-type-page-title-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "One page heading. Line-height ratio (§12.2)."
  },
  {
    "name": "type.page-title.size",
    "variable": "--vx-type-page-title-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "One page heading. Size (§12.2)."
  },
  {
    "name": "type.page-title.weight",
    "variable": "--vx-type-page-title-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "One page heading. Weight (§12.2)."
  },
  {
    "name": "type.secondary.line-height",
    "variable": "--vx-type-secondary-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Help, metadata and captions; the 13px floor. Line-height ratio (§12.2)."
  },
  {
    "name": "type.secondary.size",
    "variable": "--vx-type-secondary-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Help, metadata and captions; the 13px floor. Size (§12.2)."
  },
  {
    "name": "type.secondary.weight",
    "variable": "--vx-type-secondary-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Help, metadata and captions; the 13px floor. Weight (§12.2)."
  },
  {
    "name": "type.section-title.line-height",
    "variable": "--vx-type-section-title-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Form and detail sections. Line-height ratio (§12.2)."
  },
  {
    "name": "type.section-title.size",
    "variable": "--vx-type-section-title-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Form and detail sections. Size (§12.2)."
  },
  {
    "name": "type.section-title.weight",
    "variable": "--vx-type-section-title-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Form and detail sections. Weight (§12.2)."
  },
  {
    "name": "type.subheading.line-height",
    "variable": "--vx-type-subheading-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Dialog titles and grouped summaries. Line-height ratio (§12.2)."
  },
  {
    "name": "type.subheading.size",
    "variable": "--vx-type-subheading-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Dialog titles and grouped summaries. Size (§12.2)."
  },
  {
    "name": "type.subheading.weight",
    "variable": "--vx-type-subheading-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Dialog titles and grouped summaries. Weight (§12.2)."
  },
  {
    "name": "type.table-heading.line-height",
    "variable": "--vx-type-table-heading-line-height",
    "type": "number",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Column headings. Line-height ratio (§12.2)."
  },
  {
    "name": "type.table-heading.size",
    "variable": "--vx-type-table-heading-size",
    "type": "dimension",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Column headings. Size (§12.2)."
  },
  {
    "name": "type.table-heading.weight",
    "variable": "--vx-type-table-heading-weight",
    "type": "font-weight",
    "mode": "fixed",
    "layer": "semantic",
    "contexts": [
      "component",
      "feature"
    ],
    "description": "Column headings. Weight (§12.2)."
  }
];
