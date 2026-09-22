# Vertex OS — Design System Foundation Execution Plan

**Repository path:** `docs/plans/DESIGN_SYSTEM_PLAN.md`  
**Status:** COMPLETE  
**Implementation audit:** 2026-09-22 12:45 +03:00; resumption 13:40; continuation 14:45; NVDA review 15:52; closed 15:55 after the final gates  
**Plan type:** Living execution plan  
**Design specification:** `docs/DESIGN_SYSTEM.md` v1.0.1  
**Baseline date:** 2026-09-22  
**Scope owner:** Vertex OS shared frontend foundation  
**Execution target:** coding agent operating from the repository root

> This plan is the implementation contract for the Vertex OS Design System Foundation.
>
> It translates the canonical decisions in `docs/DESIGN_SYSTEM.md` into a bounded,
> verifiable implementation sequence.
>
> It does not redefine the design system, product scope, architecture, security,
> testing policy, IAM behavior, or business-module ownership.

---

## 1. Purpose / Big Picture

Vertex OS already has an executable Phase 0 technical foundation and a canonical
design-system specification.

What does not yet exist is the executable shared UI foundation that turns those
design decisions into code.

This plan creates that foundation.

At completion, Vertex OS must have one real, reusable, tested UI system that owns:

- design tokens;
- semantic colors;
- Light and Dark themes;
- Arabic/RTL and English/LTR foundations;
- typography;
- density;
- spacing;
- sizing;
- borders;
- radii;
- elevation;
- motion;
- focus;
- accessibility behavior;
- core UI primitives;
- form primitives;
- feedback primitives;
- overlays;
- navigation primitives;
- application-shell patterns;
- data-table patterns;
- responsive behavior;
- print/export presentation rules for the application UI;
- a development specimen environment;
- visual-regression foundations.

The existing Phase 0 web shell must consume the new shared foundation rather than
continue using ad hoc Tailwind slate/emerald/red styling.

The objective is not to create every component Vertex OS may ever need.

The objective is to create the smallest complete shared foundation that makes the
first real business module—IAM—safe to implement without inventing foundational
UI decisions inside the module.

At completion:

```text
docs/DESIGN_SYSTEM.md
        ↓
machine-readable tokens
        ↓
Vertex UI foundations
        ↓
shared primitives
        ↓
shared operational patterns
        ↓
/dev/ui design-system lab
        ↓
automated + manual verification
        ↓
Design System Foundation v1 CLOSED
        ↓
IAM implementation
```

---

## 2. How to Use This Plan

This document is a living execution plan.

The executing agent MUST keep the following sections current while work proceeds:

- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Verification Evidence`
- `Outcomes & Retrospective`

Before modifying implementation, the agent MUST read:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/MODULES.md`
- `docs/ENGINEERING.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/modules/iam.md`
- this plan in full

Canonical ownership remains:

```text
PRODUCT.md          -> product scope and terminology
ARCHITECTURE.md     -> architecture and package boundaries
MODULES.md          -> domain ownership
ENGINEERING.md      -> implementation rules
SECURITY.md         -> security policy
TESTING.md          -> verification policy
DESIGN_SYSTEM.md    -> UI/design-system contract
modules/iam.md      -> IAM business behavior
this plan           -> design-system implementation order
```

If implementation discovers a contradiction with `docs/DESIGN_SYSTEM.md`, it MUST
NOT silently reinterpret the specification.

The agent MUST determine whether the problem is:

1. an implementation defect;
2. an unclear specification requiring clarification;
3. an actual design-system defect requiring a deliberate spec amendment;
4. an architecture/security conflict requiring explicit approval.

Routine implementation details that remain inside the accepted design-system
contract do not require repeated approval.

The agent MUST NOT:

- commit;
- push;
- merge;
- deploy;
- publish packages;
- create external services;
- modify production infrastructure;

unless separately authorized.

---

## 3. Canonical Alignment Prerequisite

One sequencing mismatch exists between the approved project workflow and the
current wording of `docs/DESIGN_SYSTEM.md` §44.1.

The current design specification says the implementation task should compose the
first **real IAM workflow** before the design-system implementation sequence is
finished.

The approved Vertex OS project sequence is:

```text
Design System Specification
        ↓
Design System Foundation
        ↓
Design System Verification
        ↓
Design System CLOSED
        ↓
IAM implementation
```

This plan preserves that approved sequence.

Before changing this plan from `READY FOR APPROVAL` to `APPROVED`, amend
`docs/DESIGN_SYSTEM.md` §44.1 so that the design-system phase proves cross-module
coherence using the already-required synthetic scenarios in §44.3, and the first
real IAM workflow begins only after Design System Foundation closure.

Resolved on 2026-09-22: §44.1 now requires synthetic proof, shell migration,
verification, and foundation closure before real IAM. The implementation audit
confirmed the package/tooling baseline and made the concrete refinements in
DS-D013–DS-D018 below. Approval authorizes implementation; it does not assert
that release checks have already passed.

---

## 4. Current Repository State

This section records the state at plan authoring; the delivered state is in Section 43.

At plan authoring time, Phase 0 is complete.

The relevant current executable state includes:

```text
apps/api
apps/web
apps/web-e2e
packages/database
infra/
scripts/
```

The workspace currently uses:

- Node.js 24 line;
- pnpm 12.5.1;
- Nx 23.2.1;
- React 19.3;
- Vite 8.3;
- Tailwind CSS 4.3;
- TanStack Router;
- TanStack Query;
- Vitest;
- React Testing Library;
- Playwright.

The root verification commands already exist:

```bash
pnpm verify
pnpm verify:full
pnpm deps:audit
```

`apps/web` is currently a Phase 0 technical shell.

Its global stylesheet is effectively only:

```css
@import 'tailwindcss';
```

The root layout and technical-status feature still use ad hoc Tailwind values such
as slate, emerald, and red.

Those values are implementation gaps against `docs/DESIGN_SYSTEM.md`.

No shared `packages/ui` package currently exists.

No implemented Vertex token system exists.

No implemented Light/Dark design-system theme exists.

No implemented Arabic-first UI root exists.

No Base UI dependency currently exists.

No TanStack Table dependency currently exists in the web package.

No Storybook or separate component-documentation runtime exists.

This plan therefore introduces the first real Vertex UI implementation.

---

## 5. Canonical Constraints Carried Into This Plan

The following decisions are already made and MUST NOT be reopened casually.

### 5.1 One Vertex visual system

Vertex OS has one visual and interaction language across all modules.

Feature code MUST NOT create:

- local color systems;
- local spacing scales;
- local status colors;
- alternate button systems;
- alternate form systems;
- module-specific themes;
- local focus styles;
- parallel UI primitives.

### 5.2 Arabic-first

Arabic is the first-run language.

The root defaults to:

```text
lang="ar"
dir="rtl"
```

English/LTR remains fully supported.

RTL MUST be structural rather than produced by blanket CSS flipping.

### 5.3 Themes

Both themes are first-class:

```text
Light
Dark
```

First-run theme preference is:

```text
system
```

Dark is a deliberate semantic remapping, not inversion.

### 5.4 Density

The supported density modes are:

```text
Default
Compact
```

Default is first-run.

Compact is for appropriate fine-pointer desktop usage.

Coarse-pointer environments MUST resolve to Default target sizing.

### 5.5 Brand

The product identity is based on:

- deep Vertex green;
- restrained champagne gold;
- warm ivory;
- supporting neutral tones.

Gold is identity, not general workflow status.

Gold MUST NOT become:

- primary action color;
- success;
- selected;
- warning;
- premium permission;
- pending state.

### 5.6 UI technology

The implementation baseline remains:

- React;
- Tailwind CSS;
- Vertex-owned components;
- semantic design tokens.

`shadcn` MUST NOT be introduced.

Base UI MAY be adopted selectively behind Vertex-owned APIs after evaluation.

### 5.7 Backend authority

This plan implements presentation behavior only.

The UI MUST NOT become authoritative for:

- permissions;
- business state transitions;
- financial calculations;
- totals;
- access control;
- workflow eligibility.

### 5.8 No premature component catalog

`docs/DESIGN_SYSTEM.md` defines the full expected catalog.

This plan MUST NOT implement every catalog entry simply because it appears in the
specification.

A component is implemented now only when it is needed for:

1. the design-system foundation itself;
2. the application shell;
3. the design-system verification specimens;
4. the first real IAM workflows immediately after foundation closure.

Everything else remains an approved future component, not a placeholder.

---

## 6. Scope

The Design System Foundation includes:

### Foundations

- shared UI package;
- single machine-readable token source;
- token validation;
- deterministic token generation;
- CSS custom properties;
- TypeScript token references where runtime access is justified;
- semantic Tailwind bridge;
- Light theme;
- Dark theme;
- root language/direction handling;
- density handling;
- UI preference resolution;
- typography;
- locally hosted approved fonts;
- spacing;
- sizing;
- radii;
- borders;
- shadows;
- layers;
- motion;
- focus;
- reduced motion;
- forced-color compatibility;
- baseline global styles;
- application print/export presentation using the explicit Light presentation.

### Core primitives

- Button;
- IconButton;
- ButtonGroup;
- Field;
- Label;
- Description;
- ErrorMessage;
- Fieldset/Legend support;
- Input;
- Textarea;
- SearchInput;
- Checkbox;
- Radio;
- Switch;
- simple Select;
- Badge;
- StatusIndicator;
- Surface;
- Alert;
- InlineMessage;
- Toast;
- Spinner;
- Progress;
- Skeleton;
- EmptyState;
- ErrorState.

### Overlays and navigation required by the foundation

- Dialog;
- AlertDialog;
- Drawer;
- Popover where justified;
- DropdownMenu;
- Tooltip;
- Breadcrumb;
- Tabs;
- Pagination;
- AppSidebar visual primitives;
- sidebar navigation items;
- one shared overlay ownership/ordering mechanism.

### Operational patterns required before IAM

- PageHeader;
- FormSection;
- TableToolbar;
- FilterBar;
- BulkActionBar;
- RecordHeader;
- Inspector;
- semantic Table;
- DataTable foundation.

### Shell

- Arabic-first application shell;
- responsive navigation;
- top header;
- main work area;
- skip link;
- layout primitives;
- theme/density/language development controls;
- technical-status migration.

### Design-system lab

A development route:

```text
/dev/ui
```

used to demonstrate and verify foundations and shared patterns.

### Verification

- frontend behavior tests;
- RTL tests;
- keyboard tests;
- accessibility tests;
- responsive tests;
- Light/Dark tests;
- Default/Compact tests;
- reduced-motion tests;
- forced-color checks where practical;
- print/export presentation checks;
- Chromium/Firefox/WebKit browser-engine checks for shared overlay, form, and bidi behavior;
- high-value visual regression;
- Playwright verification;
- repository-wide verification.

---

## 7. Explicit Non-Goals

This phase MUST NOT implement:

- IAM backend;
- IAM database models;
- Keycloak;
- authentication;
- application sessions;
- RBAC;
- CRM;
- Projects;
- Tasks;
- Finance;
- Content;
- real dashboards;
- real notification data;
- real client records;
- real invoice behavior;
- real finance mutations;
- domain status machines;
- API contracts for business modules.

This phase MUST NOT introduce:

- Storybook merely because this is a design-system project;
- Chromatic or other hosted visual-regression SaaS;
- shadcn;
- multiple primitive libraries;
- CSS-in-JS framework;
- another utility-CSS framework;
- a second theme engine;
- Redux or other global-state infrastructure for UI preferences;
- a dedicated backend preference service;
- design-system-specific database tables;
- new infrastructure services.

This phase does not require implementing:

- CalendarView;
- TimelineView;
- FileItem;
- VersionList;
- CommentComposer;
- MoneyField;
- DateInput;
- TimeInput;
- complex Combobox;
- ContextMenu;
- editable spreadsheet grid;
- chart library;
- rich chart component library;
- notification center.

Those components are introduced only when a real feature requires them.

---

## 8. Scope Boundary With IAM

This plan preserves the project sequence:

```text
Design System Foundation
        ↓
Foundation verification
        ↓
Foundation CLOSED
        ↓
IAM implementation
```

Therefore this plan MUST NOT create IAM business behavior.

Before foundation closure, `/dev/ui` MUST demonstrate synthetic scenarios for:

- Arabic IAM user directory;
- role-permission editor;
- CRM filtered list;
- project inspector;
- Finance review.

These fixtures use static synthetic data only.

They prove that the shared language works across different product shapes.

They do not constitute implementation of those modules.

The first real IAM workflow becomes the first real production consumer immediately
after this plan closes.

---

## 9. Success Criteria

The Design System Foundation is complete only when all of the following are true.

### Foundations

- one machine-readable token source exists;
- generated outputs are deterministic;
- token aliases are valid and acyclic;
- semantic tokens cover Light and Dark;
- components do not consume raw palette values where semantic roles exist;
- arbitrary feature color/spacing overrides are absent;
- theme resolution works before normal application rendering;
- language and direction are applied correctly;
- density works consistently;
- reduced-motion behavior exists;
- typography is implemented with approved local assets;
- print/export uses the explicit Light presentation and removes interactive chrome.

### Shared UI

- `@vertex-os/ui` is a real used package;
- it contains no business rules;
- it does not import backend/database code;
- application feature code imports Vertex components rather than third-party
  primitives directly;
- core primitives have explicit applicable state coverage;
- keyboard interaction works;
- focus is visible and correctly restored;
- form relationships are accessible;
- overlays have correct focus and Escape behavior;
- shared overlay ownership prevents unrelated popups/toasts from floating above an active modal.

### Application shell

- Arabic/RTL is the first-run presentation;
- English/LTR can be exercised;
- Light/Dark can be exercised;
- Default/Compact can be exercised;
- responsive shell behavior matches the specification;
- the technical status functionality still works;
- old ad hoc slate/emerald/red presentation is removed.

### Tables

- standard Table/DataTable foundation exists;
- sorting presentation is accessible;
- filters preserve focus;
- current-page selection semantics are explicit;
- bulk-action presentation exists;
- horizontal overflow is contained;
- RTL column order follows the design system.

### Verification

- `/dev/ui` covers foundations and critical states;
- required synthetic cross-module specimens exist;
- frontend tests pass;
- visual regression exists for high-value surfaces;
- accessibility checks exist;
- Playwright proves critical mode combinations;
- shared overlay/form/bidi behavior is checked in Chromium, Firefox, and WebKit;
- `pnpm verify` passes;
- `pnpm verify:full` passes;
- `pnpm deps:audit` is reviewed/passes according to repository policy.

---

## 10. Target Repository Shape

Only real used implementation should be created.

Expected shape:

```text
packages/
  ui/
    package.json
    tsconfig.json
    tsconfig.lib.json
    eslint.config.mjs
    src/
      index.ts

      tokens/
        tokens.json
        token-types.ts

      generated/
        tokens.css
        tokens.ts

      styles/
        foundations.css
        typography.css
        print.css
        utilities.css
        index.css

      runtime/
        ui-settings.ts
        ui-root.tsx
        direction.ts
        preferences.ts
        overlay-manager.ts

      icons/
        registry.ts
        ...

      components/
        button/
        icon-button/
        field/
        input/
        textarea/
        search-input/
        checkbox/
        radio/
        switch/
        select/
        badge/
        status-indicator/
        alert/
        inline-message/
        toast/
        spinner/
        progress/
        skeleton/
        surface/
        empty-state/
        error-state/
        ...

      overlays/
        dialog/
        alert-dialog/
        drawer/
        popover/
        dropdown-menu/
        tooltip/

      navigation/
        breadcrumb/
        tabs/
        pagination/
        sidebar/

      data/
        table/
        data-table/

      patterns/
        page-header/
        form-section/
        table-toolbar/
        filter-bar/
        bulk-action-bar/
        record-header/
        inspector/

      assets/
        fonts/
        ...

      test/
        ...

    scripts/
      generate-tokens.mjs
      validate-tokens.mjs

    LICENSES/
      ...

apps/
  web/
    src/
      routes/
        dev/
          ui...
      ...
```

This tree is indicative.

Directories MUST NOT be created before they contain real implementation.

The final structure MAY be simpler when several small components are clearer
together.

---

## 11. Package Boundary

Create one shared browser library:

```text
@vertex-os/ui
```

Nx tags:

```text
type:lib
scope:web
layer:ui
```

The package MUST NOT depend on:

- `apps/web`;
- backend code;
- database code;
- business-domain implementation;
- API clients;
- TanStack Query;
- application authentication state.

Router coupling SHOULD remain outside low-level UI primitives.

If a router-aware composition is required for the shell, create the smallest
application-side adapter rather than teaching all UI primitives about routing.

Nx/ESLint boundaries SHOULD make inappropriate dependencies executable failures
where practical.

---

## 12. Token Source Strategy

The implementation MUST use exactly one canonical machine-readable token source.

Recommended initial source:

```text
packages/ui/src/tokens/tokens.json
```

The source represents:

- reference colors;
- semantic colors;
- typography;
- spacing;
- sizes;
- density values;
- radii;
- border widths;
- shadows;
- motion;
- layers.

Aliases MUST be explicit.

The generator produces at minimum:

```text
packages/ui/src/generated/tokens.css
packages/ui/src/generated/tokens.ts
```

`tokens.css` owns CSS custom properties.

`tokens.ts` exists only for legitimate runtime consumers such as chart/color or
programmatic token references.

Generated files MUST contain a generated-file notice and MUST NOT be edited by
hand.

A local generator/validator SHOULD use Node and repository tooling before adding
a new token framework dependency.

The validator MUST detect:

- duplicate names;
- unknown references;
- alias cycles;
- missing theme mappings;
- malformed values;
- undeclared modes;
- semantic tokens pointing directly to invalid values;
- component tokens bypassing approved layers.

Generation MUST be deterministic.

Running the generator twice without source changes MUST produce no diff.

---

## 13. CSS Variable Contract

Generated variables follow the canonical prefix:

```text
--vx-
```

Example:

```text
color.text.primary
        ↓
--vx-color-text-primary
```

Reference tokens MAY exist in generated output for foundation use.

Shared components MUST consume semantic variables.

Feature code MUST NOT consume reference palette stops directly when a semantic
role exists.

No component may contain fallback raw hex values that conceal an undefined token.

---

## 14. Tailwind Integration

Tailwind remains a composition utility.

It MUST NOT become an independent design-token source.

The semantic bridge maps Tailwind-facing utilities to `--vx-*` semantic variables.

There must be one theme definition.

Do not create parallel:

```text
Tailwind theme
+
Vertex theme
```

with duplicated values.

Feature code may use approved semantic utilities for:

- layout;
- placement;
- responsive composition;
- semantic type/color roles.

Feature code MUST NOT routinely use:

```text
bg-[#...]
text-[#...]
p-[...]
rounded-[...]
shadow-[...]
```

to bypass the design system.

Shared components own their internal visual implementation.

---

## 15. Progress

Update this checklist with timestamps and verification evidence during execution.

Acceptance was re-verified from scratch in the continuation session (2026-09-22 14:45–15:55
+03:00); code written by earlier sessions was not accepted because it existed. Evidence rows are
in Section 38.

- [x] DS-0 — Repository/design-system preflight and implementation decisions. 2026-09-22 13:40;
      decisions DS-D013–DS-D028, audited again as DS-D029–DS-D039.
- [x] DS-1 — Shared UI package and token pipeline. 2026-09-22 15:25 (E-01, E-02, E-03).
- [x] DS-2 — Theme, language, direction, density, typography, print, and global foundations.
      2026-09-22 15:25 (E-02, E-05, E-07, E-10).
- [x] DS-3 — Core actions, fields, state, and feedback primitives. 2026-09-22 15:25 (E-02, E-06).
- [x] DS-4 — Choice controls and form foundation. 2026-09-22 15:25 (E-02, E-05, E-06).
- [x] DS-5 — Overlay and navigation foundation. 2026-09-22 15:25 (E-02, E-05).
- [x] DS-6 — Table and data-dense workflow foundation. 2026-09-22 15:25 (E-02, E-05, E-07, E-08).
- [x] DS-7 — Application shell and Phase 0 shell migration. 2026-09-22 15:25 (E-04, E-05).
- [x] DS-8 — `/dev/ui` specimen lab and cross-module proof fixtures. 2026-09-22 15:25 (E-05, E-08).
- [x] DS-9 — Accessibility, bidi, responsive, cross-browser, visual, and browser hardening.
      2026-09-22 15:52 (E-05–E-12a; the NVDA pass found and fixed two defects, DS-D039).
- [x] DS-10 — Repository-wide verification, documentation sync, and closeout. 2026-09-22 15:55
      (E-13–E-15, re-run after the NVDA fixes).

Do not mark a milestone complete because its files exist.

Mark it complete only after its acceptance criteria pass.

---

# 16. DS-0 — Preflight and Implementation Decisions

## Goal

Validate repository reality and resolve the few implementation choices intentionally
left open by `docs/DESIGN_SYSTEM.md`.

## Work

Before writing components:

1. inspect current web/app/test configuration;
2. confirm the design-system spec in the working tree matches the reviewed version;
3. capture the current working-tree state;
4. verify the current Node/pnpm/Nx/React/Vite/Tailwind baseline;
5. identify all current ad hoc UI styling that will eventually migrate;
6. confirm package creation does not conflict with Nx boundaries;
7. verify production logo asset availability;
8. resolve font asset delivery;
9. evaluate icon source;
10. evaluate whether Base UI is required for the first overlay primitives;
11. evaluate TanStack Table for the standard DataTable;
12. verify current Playwright browser availability and what is required to cover Chromium/Firefox/WebKit.

## Required decisions

### D0-A — Logo

If an approved vector/transparent production logo is unavailable, use the
canonical `Vertex OS` text identity fallback.

Do not trace the raster artwork.

The missing vector MUST NOT block design-system implementation.

### D0-B — Fonts

Use:

```text
IBM Plex Sans Arabic
IBM Plex Sans
IBM Plex Mono
```

Only the required approved weights/scripts are shipped.

Store the applicable license alongside the assets.

No external font CDN.

### D0-C — Icons

Select one outlined family only after confirming:

- license;
- 24-unit geometry;
- visual compatibility;
- coverage;
- RTL suitability;
- quality at 16/20/24px.

Create a shared registry carrying directional metadata.

If no candidate meets the contract, use a small reviewed internal SVG set until a
family is approved.

Do not mix icon families.

### D0-D — Base UI

Do not install Base UI simply because the specification permits it.

Evaluate it when implementing:

- Dialog;
- AlertDialog;
- Popover;
- Tooltip;
- Menu;
- other complex composites.

If adopted:

- pin the selected version according to repository dependency policy;
- record the exact reason;
- record native/custom alternative considered;
- expose only Vertex APIs;
- test RTL, portals, focus, keyboard, screen-reader behavior;
- feature code MUST NOT import it directly.

### D0-E — Table engine

TanStack Table is already the architectural direction for DataTable behavior.

Add it only when DS-6 begins and only if the standard table pattern uses behavior
that genuinely benefits from it.

The underlying semantic HTML remains Vertex-owned.

## Acceptance

- all decisions above recorded in `Decision Log`;
- no new runtime dependency exists without a real consumer;
- no architecture conflict remains unresolved;
- repository is ready for `@vertex-os/ui`.

---

# 17. DS-1 — Shared UI Package and Token Pipeline

## Goal

Create the real shared UI boundary and make the canonical token system executable.

## Work

Create:

```text
packages/ui
```

with:

```text
name: @vertex-os/ui
tags:
  type:lib
  scope:web
  layer:ui
```

Implement:

- package exports;
- TypeScript project configuration;
- ESLint integration;
- Nx build/typecheck/lint/test integration;
- source-resolution pattern compatible with the repository;
- `tokens.json`;
- token validator;
- deterministic token generator;
- generated CSS variables;
- generated TS token references where justified;
- semantic Tailwind bridge.

Add focused architecture enforcement so the UI package cannot accidentally depend
on application/business/backend implementation.

## Token validation tests

Prove:

- every alias resolves;
- no cycles;
- every applicable theme has a mapping;
- required density values exist;
- names follow conventions;
- duplicate aliases fail;
- invalid raw values fail;
- deterministic generation produces no diff.

## Acceptance

The following succeed:

```bash
pnpm nx run @vertex-os/ui:lint
pnpm nx run @vertex-os/ui:typecheck
pnpm nx run @vertex-os/ui:test
pnpm nx run @vertex-os/ui:build
```

and a consuming web test proves `apps/web` can import the package through the
supported workspace resolution path.

No component styling exists outside tokens/foundations yet.

---

# 18. DS-2 — Root Modes, Typography, Print, and Global Foundations

## Goal

Implement the environment in which every future Vertex component operates.

## 18.1 Theme

Implement:

```text
preference:
  system | light | dark

resolved:
  light | dark
```

Theme MUST be available before normal application paint.

Theme changes MUST preserve:

- focus;
- form content;
- selection;
- scroll position.

No theme-specific component implementation.

Components consume semantic aliases.

## 18.2 Language and direction

Implement root handling for:

```text
Arabic -> lang=ar, dir=rtl
English -> lang=en, dir=ltr
```

Arabic is the first-run default.

Portals MUST receive/inherit:

- language;
- direction;
- theme;
- density.

## 18.3 Density

Implement:

```text
default
compact
```

Effective density resolves pointer constraints.

Coarse pointer MUST not retain undersized Compact targets.

## 18.4 Preferences

Only non-sensitive UI preferences may be persisted:

- language;
- theme preference;
- density preference.

Use a versioned local schema.

Storage failure MUST gracefully fall back.

MUST NOT store:

- authentication;
- sessions;
- permissions;
- business data;
- drafts.

## 18.5 Typography

Self-host approved IBM Plex assets.

Implement:

- Arabic stack;
- Latin stack;
- mono stack;
- UI font routing;
- type roles;
- real weights 400/500/600;
- tabular numeric behavior where required.

Verify:

- Arabic diacritics;
- mixed Latin/Arabic;
- fallback rendering;
- no clipping;
- no synthetic bold;
- no Arabic letter spacing.

## 18.6 Global foundations

Implement:

- canvas/body defaults;
- text defaults;
- selection colors;
- focus foundation;
- logical box sizing;
- reduced-motion behavior;
- forced-color-compatible baseline;
- logical direction utilities;
- semantic spacing/sizing utilities.

## 18.7 Print/export presentation

Implement the design-system print presentation required by the canonical spec:

- explicit Light theme;
- omit interactive chrome;
- repeat table headings where supported;
- retain labels;
- retain units/currency;
- retain status text;
- never imply that UI printing is an official financial-document workflow.

## Acceptance

A minimal specimen can switch:

```text
Arabic RTL Light Default
Arabic RTL Dark Default
Arabic RTL Light Compact
Arabic RTL Dark Compact
English LTR Light Default
English LTR Dark Default
English LTR Light Compact
English LTR Dark Compact
```

without remounting or losing state.

No component-specific Dark-mode overrides are required.

Print preview shows the explicit Light presentation with functional meaning intact.

---

# 19. DS-3 — Core Actions, Fields, States, and Feedback

## Goal

Implement the core interaction vocabulary before complex compositions.

## Components

Implement:

### Actions

- Button
- IconButton
- ButtonGroup

Required:

- primary;
- secondary;
- ghost;
- danger intent where permitted;
- small/medium/large according to the specification;
- disabled;
- pending;
- icon handling;
- stable label width;
- correct focus behavior.

Gold button variants are forbidden.

### Field structure

Implement:

- Field;
- Label;
- Description;
- ErrorMessage;
- Fieldset/Legend support.

Relationships MUST be programmatic.

### Text entry

Implement:

- Input;
- Textarea;
- SearchInput.

Required states:

- rest;
- hover;
- focus;
- focus-visible;
- disabled;
- read-only;
- invalid;
- pending where applicable.

### Classification and status

Implement:

- Badge;
- StatusIndicator.

No business enum exists inside these components.

### Containment

Implement:

- Surface.

Surface has no interaction or shadow by default.

### Feedback

Implement:

- Alert;
- InlineMessage;
- Toast;
- Spinner;
- Progress;
- Skeleton;
- EmptyState;
- ErrorState.

Toast behavior MUST follow the canonical placement, persistence, count, and
announcement rules. Toasts MUST participate in overlay ownership so they do not
become interactable above an unrelated active modal.

Loading behavior MUST follow the canonical timing/state rules.

## Tests

Behavior tests cover:

- keyboard activation;
- focus visibility;
- pending suppression of duplicate action;
- disabled semantics;
- read-only semantics;
- error association;
- RTL icon placement;
- accessible names;
- reduced motion;
- toast announcement/persistence rules.

## Acceptance

All applicable interaction-state combinations are visible in `/dev/ui` scaffolding
before moving to more complex controls.

---

# 20. DS-4 — Choice Controls and Form Foundation

## Goal

Create one reliable form language.

## Components

Implement:

- Checkbox;
- Radio;
- Switch;
- simple Select.

Do not introduce a complex Combobox unless a real foundation specimen demonstrates
a need that native/simple Select cannot satisfy.

## Form behavior

Implement reusable presentation support for:

- required indication;
- optional indication;
- field help;
- linked validation errors;
- form error summary;
- section grouping;
- dirty-state warning pattern;
- save/cancel action arrangement;
- busy submit state.

Do NOT create generic business-form state infrastructure.

The design-system layer owns presentation behavior only.

Features remain responsible for:

- schemas;
- backend errors;
- concurrency contracts;
- mutation behavior;
- domain validation.

## Permission specimen

Create a synthetic role-permission specimen demonstrating:

- grouped checkboxes;
- mixed state;
- explicit save;
- dangerous change review;
- readable permission labels.

This is static design verification, not IAM.

## Acceptance

Keyboard-only completion of the specimen must be possible in both directions and
themes.

---

# 21. DS-5 — Overlay and Navigation Foundation

## Goal

Implement shared complex interaction behavior needed by administrative workflows.

## Shared overlay ownership

Implement one shared overlay ownership mechanism responsible for:

- ordering;
- Escape routing;
- outside interaction;
- inert background;
- focus restoration;
- modal/popup ownership;
- toast interaction while content is inert.

Z-index alone MUST NOT be treated as overlay ownership.

## Overlay order

Implement in this order:

1. Dialog
2. AlertDialog
3. Tooltip
4. DropdownMenu
5. Popover
6. Drawer

Each implementation must prove the behavior before the next family expands.

## Required overlay behavior

- accessible name;
- correct initial focus;
- Escape routing;
- contained focus for modal content;
- inert background;
- focus restoration;
- nested popup ownership;
- dirty-dismissal hook;
- RTL collision placement;
- scrollable long body;
- reduced motion;
- overlay layer contract.

If Base UI is adopted, these rules remain Vertex-owned.

## Navigation

Implement:

- Breadcrumb;
- Tabs;
- Pagination;
- sidebar visual/navigation primitives.

Navigation semantics MUST remain distinct from menus and selection controls.

## Acceptance

Demonstrate:

- modal + nested menu;
- AlertDialog safe focus;
- RTL and LTR placement;
- long Arabic labels;
- narrow viewport drawer;
- Escape sequencing;
- trigger removal fallback.

---

# 22. DS-6 — Table and Data-Dense Foundation

## Goal

Create the standard operational list/table pattern before IAM.

## Table foundation

Implement:

- semantic Table;
- DataTable composition;
- TableToolbar;
- FilterBar;
- BulkActionBar;
- pagination integration;
- selection;
- sorting;
- horizontal overflow;
- sticky header support;
- optional sticky identity/actions columns where safe.

TanStack Table MAY provide behavioral state orchestration.

It MUST NOT replace semantic rendering.

## Required behavior

Prove:

- 48px Default row;
- 40px Compact row;
- logical column order in RTL;
- identity at inline-start;
- row actions at inline-end;
- numeric values at inline-end;
- exact amounts not truncated;
- accessible sorting;
- current-page selection;
- mixed header checkbox;
- explicit selection scope;
- preserved focus after filtering;
- no-results vs no-records distinction;
- query failure vs empty result distinction;
- background refresh without full skeleton;
- narrow-screen internal overflow;
- critical columns not silently hidden.

## Synthetic IAM specimen

Create an Arabic users-directory table with synthetic records containing separate:

- user identity;
- department;
- access status;
- provisioning status;
- last activity;
- row actions.

Use the exact shared five-tone status system.

No real IAM data or API exists.

## Acceptance

The table specimen works in all eight shared design combinations.

At least:

```text
Arabic RTL Light Default
Arabic RTL Dark Compact
English LTR Light Default
English LTR Dark Compact
```

must have focused visual baselines, while automated behavior tests exercise the
remaining mode mappings.

---

# 23. DS-7 — Application Shell and Technical-Shell Migration

## Goal

Make the real `apps/web` consume the Vertex system.

## Shell

Implement:

- 240px wide sidebar;
- 64px collapsed rail behavior where specified;
- 56px minimum header;
- main landmark;
- named navigation landmark;
- skip link;
- page heading grammar;
- logical inline-start/inline-end layout;
- narrow modal navigation drawer;
- medium collapsed-rail behavior;
- desktop expanded navigation;
- page gutters;
- supported content maxima.

## Phase 0 status migration

Preserve the real technical status behavior.

Replace its existing ad hoc styling with shared:

- Surface;
- StatusIndicator or appropriate feedback primitive;
- typography;
- spacing;
- semantic tokens.

Its backend query behavior must remain unchanged unless a verified defect is found.

## Root migration

Remove old root-level ad hoc:

```text
slate
emerald
red
```

presentation from the application shell.

The real app root becomes:

```text
Vertex UI root
  -> shell
  -> routes
```

without adding authentication or fake business navigation.

Navigation destinations that do not exist MUST NOT be presented as if they are
usable production features.

The development design-system route may expose synthetic navigation separately.

## Acceptance

The root application still passes the Phase 0 liveness journey while visibly
using the canonical Vertex design system.

---

# 24. DS-8 — `/dev/ui` Design-System Lab

## Goal

Create one internal environment for visual, behavioral, RTL, theme, and regression
verification without adding Storybook.

## Route

Create:

```text
/dev/ui
```

The route MUST:

- use synthetic data only;
- never load business records;
- not appear in normal production navigation;
- be excluded from production exposure or explicitly hard-gated according to the
  simplest reliable Vite/router mechanism;
- remain available to development and automated visual tests.

## Lab structure

Recommended sections:

```text
Foundations
Typography
Color roles
Spacing / sizing / radius
Themes
Density
RTL / bidi
Actions
Fields
Choices
Feedback
Status
Overlays
Navigation
Tables
Shell / layouts
Responsive specimens
Print presentation
Accessibility stress cases
Cross-module proofs
```

## State matrix

For important primitives show:

- rest;
- hover representation where meaningful;
- focus;
- focus-visible;
- pressed;
- selected;
- checked;
- indeterminate;
- disabled;
- read-only;
- loading;
- invalid;
- warning;
- success.

Do not build an enormous matrix for components where a state is semantically
impossible.

## Bidi stress fixtures

Include:

```text
المشروع: VX-2026-014
user@example.test
Campaign-v2.pdf
+90 555 010 0200
37.5%
-1,234.50 USD
```

and long Arabic names, diacritics, mixed filenames, long labels, and truncated
secondary content.

## Cross-module synthetic proof scenarios

### IAM

- user directory;
- access/provisioning statuses;
- permission editor;
- destructive access confirmation.

### CRM

- filtered leads/clients list;
- active filters;
- empty filtered result;
- preserved list-return context presentation.

### Project

- record header;
- mixed-language filename;
- version metadata;
- inspector.

### Finance

- exact signed amount;
- explicit currency;
- negative/zero/missing distinctions;
- conflict state;
- uncertain save outcome.

None may contain real business logic.

## Acceptance

A reviewer must be able to inspect the complete visual language from one route
without opening source code.

---

# 25. DS-9 — Accessibility, RTL, Responsive, Cross-Browser, and Visual Hardening

## Goal

Turn the implementation from “looks correct” into evidence-backed production
foundation.

## 25.1 Accessibility automation

Add the smallest appropriate automated accessibility integration to the existing
frontend/browser testing stack.

Axe integration MAY be added as a development-only dependency when justified.

Automated checks MUST NOT be claimed as complete accessibility certification.

## 25.2 Manual keyboard verification

Verify:

- Tab order;
- Shift+Tab;
- Enter/Space activation;
- radio movement;
- tabs;
- menus;
- dialogs;
- Escape;
- drawer;
- pagination;
- table controls;
- focus restoration.

## 25.3 Screen-reader verification

Minimum manual baseline:

```text
NVDA + supported Windows browser
```

Verify:

- Arabic language announcement;
- labels;
- field errors;
- menus;
- dialogs;
- status messages;
- table headings/sorting;
- selected states.

If Apple/touch support is in the supported release surface, add VoiceOver/Safari
verification before release.

Record evidence in this plan.

## 25.4 RTL verification

Verify:

- root direction;
- portals;
- sidebar;
- inspectors;
- menus;
- breadcrumb;
- pagination;
- table ordering;
- switches;
- directional icons;
- mixed text;
- numbers;
- email;
- IDs;
- filenames;
- currency.

Do not accept screenshot mirroring as proof.

## 25.5 Responsive verification

Required widths:

```text
320
390
768
1024
1440
```

Also test:

```text
200% text resizing
400% browser zoom
coarse-pointer sizing
```

No ordinary page-level horizontal overflow is permitted.

Tables may overflow only inside their named region.

## 25.6 Reduced motion

Verify:

- 0ms structural motion;
- no displacement;
- no skeleton animation;
- no smooth scroll;
- static busy alternative.

## 25.7 Forced colors

Verify that:

- focus remains visible;
- boundaries remain meaningful;
- selection remains inspectable;
- status retains non-color cues.

## 25.8 Cross-browser behavior

Shared overlay, form, bidi, and focus behavior MUST be checked in:

- Chromium;
- Firefox;
- WebKit.

A browser-engine failure affecting supported users must be fixed or explicitly
scoped before release.

Do not treat Chromium-only success as design-system completion.

## 25.9 Visual regression

Use the existing Playwright stack.

Create a small high-value baseline set rather than screenshotting every component
permutation.

Required baseline categories:

- token/theme foundation;
- main controls;
- form;
- overlay;
- table;
- shell;
- Arabic IAM synthetic specimen;
- Dark specimen.

Visual baselines MUST:

- use deterministic fonts;
- use fixed synthetic data;
- use fixed dates/times;
- disable optional motion;
- avoid network variability.

Snapshot updates require human review.

Do not blindly regenerate expected images.

Account for supported CI/local platform differences deliberately rather than
loosening thresholds until tests stop failing.

## 25.10 Print/export verification

Verify print presentation for:

- ordinary page content;
- tables;
- status labels/text;
- units/currency;
- removal of interactive chrome.

This is UI presentation verification only.

## Acceptance

No unresolved high-severity accessibility, RTL, responsive, browser-engine, or
visual-system defect remains.

---

# 26. DS-10 — Repository Verification and Closeout

## Goal

Prove the foundation is ready for IAM.

## Required focused checks

During implementation run the narrowest affected targets.

Before closure, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Then:

```bash
pnpm verify
```

Then the complete repository gate:

```bash
pnpm verify:full
```

Then:

```bash
pnpm deps:audit
```

On Windows/non-interactive captured Nx output use:

```text
NX_DAEMON=false
```

as required by repository policy.

No check may be reported as passed unless it was actually executed successfully.

If GitHub CI is unable to run because of an external account/billing issue, report
local verification separately and do not claim remote CI success.

## Documentation reconciliation

Update documentation only where executable reality changed.

At minimum verify whether changes are required in:

- `README.md`;
- `AGENTS.md`;
- `docs/ARCHITECTURE.md`;
- `docs/TESTING.md`;
- `docs/DESIGN_SYSTEM.md`.

Do not duplicate the design-system specification into README files.

## Cleanup

Before closure:

- remove unused experimental dependency;
- remove dead token;
- remove unused component;
- remove placeholder directory;
- remove obsolete Phase 0 style;
- remove temporary specimen hack;
- confirm generated artifacts are reproducible;
- confirm no unlicensed asset;
- confirm no proprietary Claude asset/code entered the repository.

---

# 27. Component Delivery Matrix

The catalog is deliberately divided into three groups.

## 27.1 Foundation — implement in this plan

```text
Button
IconButton
ButtonGroup

Field
Label
Description
ErrorMessage
Fieldset/Legend

Input
Textarea
SearchInput

Checkbox
Radio
Switch
Select

Badge
StatusIndicator
Surface

Alert
InlineMessage
Toast
Spinner
Progress
Skeleton
EmptyState
ErrorState

Dialog
AlertDialog
Drawer
DropdownMenu
Tooltip
Popover where needed

Breadcrumb
Tabs
Pagination
Sidebar primitives

Table
DataTable

PageHeader
FormSection
TableToolbar
FilterBar
BulkActionBar
RecordHeader
Inspector
```

## 27.2 Implement only if a real foundation need appears

```text
Combobox
Accordion
Disclosure
SegmentedControl
ContextMenu
Avatar
Metric
DescriptionList / KeyValue
```

The agent MUST record the concrete consumer before adding one.

## 27.3 Defer to owning future workflows

```text
DateInput
TimeInput
MoneyField
CalendarView
TimelineView
FileItem
UploadField
VersionList
CommentComposer
advanced editable grid
chart components
notification center
```

Their rules already exist in the canonical design specification.

Their code does not need to exist yet.

---

# 28. Test Matrix

## 28.1 Token tests

Prove:

- parsing;
- alias resolution;
- cycle detection;
- complete theme modes;
- complete density modes;
- generated output stability;
- semantic-reference ownership.

## 28.2 Primitive tests

Prove meaningful behavior:

- activation;
- disabled;
- pending;
- focus;
- controlled state;
- uncontrolled state where supported;
- required;
- invalid;
- read-only;
- accessible name.

Do not test React or browser behavior that Vertex does not customize.

## 28.3 Form tests

Prove:

- label association;
- description association;
- error association;
- invalid state;
- fieldset/legend;
- error-summary focus;
- dirty-state confirmation presentation.

## 28.4 Overlay tests

Prove:

- opening;
- initial focus;
- Tab containment;
- Escape;
- outside dismissal where allowed;
- nested popup Escape order;
- dirty dismissal;
- restoration;
- RTL;
- modal/toast ownership.

## 28.5 Navigation tests

Prove:

- current destination;
- tab keyboard behavior;
- pagination meaning;
- breadcrumbs;
- directional icons.

## 28.6 Table tests

Prove:

- header semantics;
- sorting;
- current-page selection;
- mixed state;
- query-change selection reset;
- bulk-action count;
- row-action naming;
- numeric alignment semantics;
- RTL order.

## 28.7 Mode tests

Exercise:

```text
Arabic / English
Light / Dark
Default / Compact
```

Do not create eight identical test copies for every trivial component.

Use representative shared specimens.

## 28.8 Browser E2E

E2E proves only critical integrated behavior:

- first paint theme/direction;
- switching theme;
- switching direction/language in dev specimen;
- density;
- dialog focus/restoration;
- table overflow/selection;
- narrow shell;
- liveness feature still operational;
- `/dev/ui` high-value visual snapshots;
- print presentation where automation is practical.

Cross-engine E2E or focused browser checks cover Chromium/Firefox/WebKit for the
shared overlay/form/bidi surfaces required by the canonical spec.

---

# 29. Accessibility Acceptance

The Design System Foundation is not releasable if any of these are knowingly broken:

- keyboard access;
- visible focus;
- Arabic labels;
- label/control relationships;
- modal focus ownership;
- focus restoration;
- color-independent statuses;
- RTL navigation;
- 200% text resizing;
- 400% zoom;
- required coarse-pointer targets;
- reduced motion;
- critical contrast requirements.

An upstream library claiming accessibility does not waive Vertex verification.

---

# 30. Performance and Bundle Discipline

The design system SHOULD remain operationally lightweight.

During implementation:

- avoid unnecessary runtime theme libraries;
- prefer CSS variables for theme changes;
- avoid JS layout measurements where CSS can solve them;
- do not ship all icon assets when tree-shaking/import selection can avoid it;
- ship only approved font weights/scripts;
- lazy-load development-only specimen code where appropriate;
- avoid chart libraries in the foundation;
- avoid heavy animation dependencies.

If a new production dependency meaningfully affects bundle size, record:

- purpose;
- bundle impact;
- native alternative;
- replacement cost.

Do not set an arbitrary bundle-size number without repository evidence.

Prevent unexplained regression instead.

---

# 31. Security and Privacy Constraints

The design-system phase must not accidentally become a security boundary.

MUST NOT:

- persist auth state in UI preference storage;
- persist permission data;
- persist business drafts;
- fake authorization by hiding buttons;
- include real staff/customer data in specimens;
- leak protected information into visual snapshots;
- use production IDs/emails;
- implement password/MFA controls inside Vertex;
- create fake access-control infrastructure.

Synthetic fixtures MUST use obviously fictional values.

---

# 32. Dependency Policy

Every new dependency must have a real consumer.

Before adding it:

1. identify the behavior it solves;
2. inspect existing/native capabilities;
3. verify compatibility with current React/Vite/TypeScript versions;
4. verify license;
5. verify release stability;
6. record exact resolved version;
7. verify bundle/runtime implications where applicable;
8. run `pnpm deps:audit`.

Do not add a dependency “for later”.

---

# 33. Design-System Source Ownership

The final ownership model is:

```text
docs/DESIGN_SYSTEM.md
    ↓ describes intended contract

tokens.json
    ↓ machine-readable implementation source

generated CSS / TS
    ↓ generated artifacts

@vertex-os/ui
    ↓ shared behavior and components

apps/web
    ↓ product composition

business modules
    ↓ domain-specific composition/state mapping
```

Feature code MUST never become a second token or component source.

---

# 34. Migration Rule for Existing UI

Migration is incremental but no knowingly parallel design language may remain in a
touched surface.

When a current Phase 0 component is migrated:

- replace its ad hoc visual tokens fully;
- keep its real behavior;
- update tests;
- remove obsolete styling.

Do not leave:

```text
old styles + new styles
```

for the same component.

The technical shell is small enough that it SHOULD be completely migrated before
foundation closure.

---

# 35. `/dev/ui` Is Verification, Not Production Functionality

The design-system lab MUST NOT become:

- business demo application;
- fake dashboard;
- feature prototype backlog;
- production admin route;
- alternate navigation system.

Its only purposes are:

- design inspection;
- interaction inspection;
- accessibility inspection;
- visual regression;
- cross-module design proof.

Synthetic specimens are deliberately static.

---

# 36. Decision Log

Record only material decisions.

Initial expected entries:

| ID | Decision | Status |
| --- | --- | --- |
| DS-D001 | `@vertex-os/ui` is the shared UI boundary | Accepted by plan |
| DS-D002 | One machine-readable token source generates CSS/TS artifacts | Accepted by canonical spec |
| DS-D003 | `/dev/ui` is used instead of introducing Storybook in Foundation v1 | Proposed by plan |
| DS-D004 | Arabic/RTL is first-run; English/LTR fully supported | Canonical |
| DS-D005 | Light/Dark + Default/Compact are root modes | Canonical |
| DS-D006 | Base UI is evaluated per complex interaction, never globally adopted by default | Canonical |
| DS-D007 | TanStack Table may back DataTable behavior while semantic rendering remains Vertex-owned | Canonical |
| DS-D008 | Complex future catalog components remain demand-driven | Canonical |
| DS-D009 | Synthetic cross-module fixtures prove foundation before real IAM | Accepted; §44.1 corrected 2026-09-22 |
| DS-D010 | Shared overlay ownership is a foundation concern | Canonical |
| DS-D011 | Chromium/Firefox/WebKit behavior coverage is required for overlay/form/bidi surfaces | Canonical |
| DS-D012 | UI print/export presentation uses explicit Light theme | Canonical |

Add actual dependency/version/asset decisions during execution.

### Implementation audit — 2026-09-22 12:45 +03:00

The full required document set and the actual manifests, lockfile-backed installed
packages, Vite/router setup, strict TypeScript configuration, Nx constraints,
frontend tests, Playwright smoke setup, and CI workflow were inspected. Only the
existing untracked plan was present at entry; it is preserved and amended in place.
No accepted ADR directory or nested agent contract exists. The specified browser
stack matches the repository. No IAM or other business capability is authorized here.

| ID | Decision and evidence | Consequence |
| --- | --- | --- |
| DS-D013 | Keep one `packages/ui` library, using the existing source export condition and TypeScript project references. Add `layer:ui` enforcement forbidding domain/app and Query/router coupling. | No extra foundation packages or state framework. |
| DS-D014 | Use a typed array-based JSON token source so duplicate names remain detectable. Generate CSS and the Tailwind 4 semantic bridge deterministically; omit generated runtime TS until a real runtime consumer needs it. Check output freshness in UI lint/build. | No duplicate palette or unused runtime token map; aliases resolve per mode, including print Light. |
| DS-D015 | Use IBM's published OFL-1.1 assets: `@ibm/plex-sans-arabic` 1.1.0, `@ibm/plex-sans` 1.1.0, `@ibm/plex-mono` 2.5.0. Vendor only upright WOFF2 400/500/600 and their licenses, with origin/hash inventory. Use CSS unicode routing, retaining upstream shaping tables. | No font CDN or font npm runtime dependency. Font rendering remains an acceptance check. Text identity fallback because no approved logo asset exists in the repo. |
| DS-D016 | Small original 24-unit, 1.75-stroke icon registry; directional metadata per icon. Selectively adopt MIT `@base-ui/react` 1.8.0 (published 2026-09-04; React 19 supported) for complex overlay focus, dismissal, positioning and menu behavior. Simple actions/inputs/choices remain native. | Vertex owns APIs/styles and overlay ownership policy; no feature primitive imports. Bundle impact measured after real consumers. |
| DS-D017 | Evaluate MIT TanStack Table 9.2.4 (published 2026-08-28, React >=18) at DS-6 against installed API, not presumed v8 APIs. Add dev-only axe browser integration when DS-9 consumes it. | Exact pinning, one-day cooldown and dependency audit remain mandatory. |
| DS-D018 | Preserve production-build liveness E2E. Add a separate explicit specimen build/server and production exclusion assertion for `/dev/ui`; cover all three engines. Visual snapshots are platform-specific with zero retries locally and require review. | A test build cannot silently expose fixtures in production. Manual NVDA/Arabic voice and actual browser zoom remain explicit release evidence, not inferred from axe or viewport tests. |

Milestone ordering is retained except that Toast's modal-suspension acceptance is
completed with DS-5, and DS-3/DS-4 specimens begin in the lab scaffolding before
DS-8 assembles the complete cross-module proof. No acceptance requirement is removed.

### Resumption audit — 2026-09-22 13:40 +03:00

Execution resumed in a new agent session after the previous session stopped mid-DS-1.
The working tree was re-audited against this plan and `docs/DESIGN_SYSTEM.md` before any
further change. Findings:

- §44.1 of the specification is correctly reconciled (synthetic proof → shell migration →
  verification → closure → real IAM). No further sequencing conflict exists.
- `packages/ui` existed as an unverified draft: it did not compile (`shell.tsx` imported a
  non-existent export), no milestone had passed acceptance, and no verification evidence was
  recorded. The draft also deviated from the specification in ways that are defects, not
  choices: the UI font stack was Latin-first in Arabic UI; menus/popovers used overlay radius
  and dialogs/tooltips used the wrong background role; the switch used a 1px thumb inset
  instead of 2px; the toast width reused the dialog width; checkbox/radio relied on
  `accent-color`, which cannot express the specified unchecked boundary, hover boundary,
  mixed dash, or forced-colors cues; toasts were individually wrapped live regions that do
  not announce reliably; component CSS was unlayered, so it would override Tailwind
  composition utilities; the Tailwind bridge left Tailwind's default type, shadow, radius,
  breakpoint, tracking and animation scales available as a parallel system; DS chrome copy
  was hard-coded as inline `ar ? … : …` expressions; the token source carried generated
  placeholder descriptions and duplicated table geometry under two names.
- Font assets were verified byte-for-byte (SHA-256) against the IBM npm tarballs
  `@ibm/plex-sans-arabic@1.1.0`, `@ibm/plex-sans@1.1.0`, `@ibm/plex-mono@2.5.0`
  (`fonts/complete/woff2/*`). They are retained.
- `@base-ui/react@1.8.0` (MIT, React 17–19 peer range, published 2026-09-04) is retained;
  its 1.8.0 type declarations were inspected rather than presumed.
- A stray empty pnpm store skeleton (`.pnpm-store/`, no files) was created in the
  repository root by an earlier command; the real store is `D:\.pnpm-store`. It is removed.

Corrected and additional decisions (these supersede conflicting details above):

| ID | Decision and evidence | Consequence |
| --- | --- | --- |
| DS-D019 | Keep the reusable parts of the draft (array-based token engine, root preference store, blocking same-origin bootstrap, exact-decimal parser) and rebuild the rest against the specification. | No draft code is accepted because it exists; everything passes the milestone acceptance again. |
| DS-D020 | Raw values live only in `ref.*`. Semantic tokens alias references; component tokens alias semantics or cite a specification geometry decision. Token `contexts` are functional: `foundation` (private), `component`, `feature`. Only `feature` tokens are bridged into Tailwind. A fourth mode axis, `language`, carries `font.family.ui` (Arabic-first in Arabic UI, Latin-first in English UI) exactly as §12.1 defines. | Token metadata is enforced, not decorative; the Tailwind theme cannot expose private palette stops. |
| DS-D021 | Generated CSS also carries: explicit `color-scheme` per theme, a `prefers-color-scheme` fallback for a root without `data-theme` (first paint is correct even if the bootstrap fails), the coarse-pointer Default-density override, and the explicit Light print mapping. The Tailwind bridge resets every default Tailwind scale that would form a parallel system (color, spacing, radius, type, font, shadow, blur, tracking, leading, breakpoints, containers, easing, animation) and replaces them with semantic roles and the §23 breakpoints (`medium` 768, `wide` 1200, `xwide` 1600). | Feature code composes only semantic roles; `dark:`/palette/arbitrary styling has nothing to bind to and is also linted. |
| DS-D022 | Tailwind is the styling pipeline and the feature-composition utility. Shared component internals are authored once as token-driven CSS inside Tailwind's `base`/`components` cascade layers (not as long utility strings), because their contracts depend on state selectors, `:dir()`, forced colors and print. Components expose no `className`/`style`; outer placement uses wrapper utilities. | One visual implementation per component; utilities cannot silently override component internals. |
| DS-D023 | Design-system chrome copy (close, pagination, selection summaries, loading, required note, etc.) lives in one typed Arabic/English catalogue in `@vertex-os/ui` with `Intl.PluralRules` six-form Arabic plurals and Latin digits. Domain copy stays with features. One shared polite announcer in `UiRoot` serves sort/filter/toast announcements. | No per-component language branches or competing live regions. |
| DS-D024 | TanStack Table is evaluated and **not** added in Foundation v1. The foundation DataTable is server-driven (controlled sort, stable-ID selection, cursor/offset pagination), which TanStack Table would only wrap with `manual*` flags. The Vertex column contract (`id`, header, cell, kind, sortable, align) is deliberately compatible with a later internal adoption for a demonstrated client-side workspace need (resizing, visibility, multi-sort) without a public API change. | No speculative dependency; AC-10's "where appropriate" is satisfied by recorded evaluation. |
| DS-D025 | Base UI is used only for Dialog/AlertDialog/Drawer (focus trap, scroll lock, outside-press, nested floating tree), Menu, Popover and Tooltip. Buttons, fields, choices, native Select, Tabs, Breadcrumb, Pagination, Table and Toast are Vertex-native. Tabs are native because §24.2's visual-arrow rule is small, fully testable and should not depend on a library's interpretation. All Base UI opens/closes are controlled by Vertex wrappers so the shared overlay manager decides dismissal, dirty guards, restoration fallback and global-popup closure when an unrelated modal opens. | Base UI stays an implementation detail; ESLint bans `@base-ui/*`/`@floating-ui/*` outside `@vertex-os/ui`. |
| DS-D026 | `/dev/ui` is a file route whose component and loader are compiled only when `import.meta.env.DEV` or the explicit `lab` build mode is active; production resolves it to the not-found page and the production bundle is asserted to contain no lab module. The lab is served for tests from a separate `vite build --mode lab` output. | The shipped production artifact contains no synthetic fixtures. |
| DS-D027 | Behavioural browser tests run on host Playwright browsers across Chromium, Firefox and WebKit for the shared overlay/form/bidi/focus surfaces. Visual baselines are captured by Chromium running inside the pinned `mcr.microsoft.com/playwright:v1.63.0-noble` image (connected via Playwright's `run-server`, using the repository's locked `playwright-core`), so Windows development and Linux CI compare against one reviewed Linux baseline set with no tolerance loosening. | Pixel evidence is deterministic across platforms; Docker is already a `verify:full` prerequisite. |
| DS-D028 | Design-system conformance is enforced in `pnpm lint` by a small local ESLint plugin owned by `@vertex-os/ui`: no arbitrary Tailwind values, physical-direction utilities, raw palette utilities or `dark:` variants in application markup; no `style` props outside the lab's token specimens; no direct `@base-ui/*`/`@floating-ui/*` imports and no deep `@vertex-os/ui/*` imports in feature code. | The correct path is the easiest path; violations fail the fast gate. |

### Continuation audit — 2026-09-22 14:45 +03:00

A new agent session resumed after the previous one stopped during DS-9. The working tree was
re-audited against this plan, `docs/DESIGN_SYSTEM.md` and the canonical documents before any
change. State found:

- §44.1 of the specification was correctly reconciled; no other sequencing conflict exists.
- `@vertex-os/ui` lint, typecheck, 140 unit tests and build passed; web lint/typecheck/8 tests
  passed. The implementation matched the specification closely (token contract, overlay
  ownership, bidi formatters, Arabic-first root) and was retained.
- Not done: no milestone was marked, no evidence was recorded, the visual-regression suite
  referenced by the Playwright config (`playwright.visual.config.mts`) did not exist, and the last
  browser run had failed. A full three-engine run gave 93 passed / 15 failed.
- Pre-existing gate failures: `@vertex-os/web-e2e:typecheck` failed (so `pnpm typecheck` and
  `pnpm verify` could not pass) and 70 design-system files failed `pnpm format:check`.

| ID | Decision and evidence | Consequence |
| --- | --- | --- |
| DS-D029 | Supersedes DS-D014's "omit generated TS": the generator also emits `generated/tokens.ts`, a public-role catalogue (no reference stops, no values) whose real consumer is the lab's token specimens. The chart-series roles and `color.brand.decorative` are specified contract roles whose consumers are demand-driven (§37.1, §5.2); the token-usage test allow-lists exactly these and fails on any other unused private token. | One source still generates every artifact; nothing unused hides in the token set. |
| DS-D030 | Vertex owns modal focus restoration (`restoreFocus`). Base UI returns focus to the first tabbable *descendant* of a non-tabbable target, so the declared fallback (the main region) would have focused an arbitrary control. The opener is the focused element, or — because Safari/WebKit do not focus a pressed button and instead focus the nearest focusable ancestor — the last pressed control; a menu item's opener is its menu trigger. Focus the user deliberately moved elsewhere is not stolen. | §20/§31.2 restoration is identical in Chromium, Firefox and WebKit (E-05). |
| DS-D031 | Visual baselines (DS-D027) are implemented as Playwright projects: `visual-browser` (setup) starts `mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30…a4a27` with Docker, running `run-server` from the repository's locked `playwright-core` mounted read-only (no network fetch in the container); `visual` connects with `exposeNetwork: '<loopback>'` to reach the host lab build; `visual-browser-teardown` removes the container. Snapshots have no platform suffix, `updateSnapshots` is `none` in CI, zero tolerance changes. Constants live once in `playwright.config.mts` (project metadata) because Nx loads that config with Node type stripping, which cannot import `.ts` through a `.js` specifier. | One reviewed Linux baseline set for Windows development and Linux CI; baselines change only through an explicit, reviewed `--update-snapshots` run. |
| DS-D032 | `PageHeader`/`RecordHeader` take `headingLevel` (default 1). §12.2 decouples the semantic level from the page-title type role; a header embedded in another outline (lab specimens) is not an h1 and not the route-focus target. | One h1 per page, including in the lab (axe `page-has-heading-one`/strict locators). |
| DS-D033 | A required `Fieldset` states the requirement in its legend's accessible name ("(مطلوب)"); `aria-required` is not allowed on the group role (axe `aria-allowed-attr`) and a checkbox group has no native required state. Clarified in `DESIGN_SYSTEM.md` §28.1 (v1.0.1). | Group requirements are announced without invalid ARIA. |
| DS-D034 | The conformance lint rule also forbids `vx-*` classes in application markup (`internal`): they are `@vertex-os/ui` internals (§26.3). The lab now uses Tailwind's `lining-nums tabular-nums`. | Features cannot restyle component internals. |
| DS-D035 | Base UI bundle impact measured on the production build with a temporary chunk probe (not committed): Base UI + Floating UI 137.5 kB minified / 45.4 kB gzip; Vertex UI 30.3 / 10.4 kB; React 206.8 / 64.8 kB; TanStack 106.1 / 35.2 kB. Total application JS 479.7 / 155.6 kB gzip. Native alternative: hand-written focus trapping, scroll lock, nested outside-press, collision positioning and Arabic menu typeahead — rejected as a larger correctness risk. Replacement cost: confined to `overlays.tsx`, `tooltip.tsx` and `ui-root.tsx` behind unchanged Vertex APIs. | Recorded per §30; no budget number is invented. |
| DS-D036 | Indeterminate `Progress` states "still in progress" after `LONG_OPERATION_MS` (10 s) in the same status region (§34). Unused chrome copy (`noSelection`, `closeNavigation`) is removed. `IconButton` honours `pendingLabel` and has its own variant union, closing a type hole that let `secondary + danger` compile (compile-time test added). | No dead copy; §26.1 invalid combinations fail typecheck. |
| DS-D037 | CSS state-precedence defects found by review are fixed at their root: disabled now outranks every variant/intent (danger buttons rendered danger colours while disabled); coarse-pointer 44px targets outrank the small/large size rules; `:read-only` no longer outranks `:disabled` on inputs; breadcrumb links, menu items, the brand link and rail links get touch targets. | §14 and §19 hold in rendered output (E-06, E-09). |
| DS-D039 | From the NVDA pass: (1) modal header and footer are plain `div`s — as `<header>`/`<footer>` in a portal they were exposed as extra `banner`/`contentinfo` landmarks (NVDA said "content info landmark"); unit test and axe landmark rules on the open modal now guard it. (2) Focus is returned in a layout effect in the commit that closes the modal, while the modal still holds focus: `DialogPortal` makes the closing portal inert, which dropped focus to `<body>` before effect-time restoration. The effect-time `restoreFocus` remains the fallback. Standard `aria-modal` semantics are kept although NVDA reads the page's first line briefly when it discards the dialog buffer. | Screen-reader users hear the opener after closing; DOM focus goes directly dialog → opener in all engines (140/140). |
| DS-D038 | E2E sources use `.js` relative specifiers and the named `AxeBuilder` export (the repository's `nodenext` resolution); lab preference seeding happens once per `openLab` call so reload-persistence is actually tested; WebKit-sensitive checks use keyboard activation where the engine's pointer model differs natively. | `pnpm typecheck` passes; tests prove behaviour rather than harness artefacts. |

---

# 37. Surprises & Discoveries

The executing agent maintains this section.

For every material discovery record:

```text
Date:
Milestone:
Observed:
Expected:
Impact:
Action:
```

Examples of discoveries worth recording:

- Vite package-source resolution behaves differently from expected;
- selected font file clips Arabic diacritics;
- selected primitive library mishandles RTL submenu keys;
- a semantic color pairing fails after real rendering;
- a focus outline is clipped by table scrolling;
- Playwright snapshots differ structurally between platforms;
- Compact violates coarse-pointer targets.

Do not log ordinary implementation details.

```text
Date: 2026-09-22 14:50   Milestone: DS-9
Observed: WebKit does not focus a clicked button; it focuses the nearest focusable ancestor
          (<main tabindex=-1>). Base UI then returned focus to the first tabbable descendant of
          that "opener", i.e. an unrelated button.
Expected: focus returns to the control that opened the dialog, or to the declared fallback.
Impact:   wrong focus restoration for pointer users in Safari; VoiceOver users lose context.
Action:   DS-D030 (pressed-control opener, Vertex-owned restoreFocus); WebKit E2E now passes.

Date: 2026-09-22 14:55   Milestone: DS-9
Observed: `.vx-button[data-size='small']` outranked the coarse-pointer 44px rule (36px touch
          targets); `.vx-button[data-variant='primary'][data-intent='danger']` outranked
          `:disabled` (disabled danger buttons painted danger colours).
Expected: §14 touch minima and §19 disabled precedence regardless of variant.
Impact:   undersized touch targets; disabled destructive actions looked available.
Action:   DS-D037; found by the touch scan and by visual review of the baselines.

Date: 2026-09-22 14:55   Milestone: DS-9
Observed: `aria-required` on <fieldset> (role group) is invalid ARIA; lab specimens embedding a
          PageHeader produced a second h1.
Expected: valid ARIA; one h1 per page.
Impact:   axe violations; ambiguous outline for screen-reader users.
Action:   DS-D032, DS-D033; spec §28.1 clarified (v1.0.1).

Date: 2026-09-22 15:00   Milestone: DS-9
Observed: visual review showed English token descriptions in Arabic pages with punctuation on
          the wrong side (no isolation, no lang="en").
Expected: §24.3 isolation of foreign-direction runs and correct language for speech.
Action:   descriptions render as <bdi lang="en" dir="ltr">; variant identifiers use TechnicalId.

Date: 2026-09-22 14:50   Milestone: DS-10
Observed: `@vertex-os/web-e2e:typecheck` failed on the lab specs and 70 files failed Prettier;
          `page.addInitScript` re-seeded preferences on every reload, so the "persists after
          reload" test could never pass.
Action:   DS-D038; files formatted; seeding made once-per-call.

Date: 2026-09-22 15:52   Milestone: DS-9 (NVDA)
Observed: NVDA announced "content info landmark" inside the confirmation dialog; after closing a
          dialog NVDA read the page top instead of the opener. The system code page is cp1256,
          so NVDA-related console output must be decoded deliberately; NVDA mouse tracking and
          other foreground windows can pollute a run (controlled: foreground asserted per step).
Expected: no page landmarks inside dialogs; the opener announced after closing.
Impact:   confusing landmark list and lost context for screen-reader users.
Action:   DS-D039; re-verified with NVDA (E-12a).

Date: 2026-09-22 15:20   Milestone: DS-10
Observed: the dialog Tab-containment test failed once in Chromium and WebKit under load. A probe
          showed that at the modal boundary Tab lands on Base UI's hidden focus guard (an
          aria-hidden span in the modal portal), which returns focus inside within a frame.
Expected: containment is correct; the test sampled focus mid-redirect.
Action:   the test asserts the settled focus (a real escape never settles inside). Stability:
          45/45 on that test (15× per engine), then 342/342 for the whole behaviour suite (3×).

Date: 2026-09-22 14:58   Milestone: DS-9
Observed: Nx builds its project graph by loading playwright.config.mts under Node's native type
          stripping, which cannot resolve a `.js` specifier to a `.ts` file.
Action:   visual-browser constants moved into the config and passed as project metadata (DS-D031).
```

---

# 38. Verification Evidence

Maintain a concise evidence table.

All rows were executed on Windows 11 (Node 24.21.0, pnpm 12.5.1, Docker 29.2.1) with
`NX_DAEMON=false`. Remote GitHub CI has **not** run this work: nothing was committed or pushed.

| ID | Milestone | Command / manual check | Result | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| E-01 | DS-1 | `node packages/ui/scripts/generate-tokens.mjs --check`; token tests in `@vertex-os/ui:test` | Pass | 2026-09-22 15:05 | 373 tokens (137 reference, 194 semantic, 42 component; 55 bridged). 31 rejection cases (duplicates, CSS-name collisions, types, modes, aliases, cycles, layer/ownership/context rules), determinism and order-independence, every §9.4 ratio reproduced, text ≥ 4.5 and boundaries ≥ 3 on every plane in both themes, no dead private token, no fallback `var()`, no raw colour/pixel in component CSS. |
| E-02 | DS-1–DS-6 | `pnpm nx run @vertex-os/ui:test` | 11 files, 146 tests pass | 2026-09-22 15:15 | Includes the conformance lint-plugin tests and font-file tests (SHA-256 against inventory, OFL names, upright 400/500/600, Arabic GSUB `init/medi/fina/rlig/calt` and GPOS `mark/mkmk`, harakat and Arabic-Indic/Persian digit coverage, tabular Latin figures, Arabic-only unicode routing). |
| E-03 | DS-1 | `pnpm nx run-many -t lint typecheck -p @vertex-os/ui @vertex-os/web @vertex-os/web-e2e` | Pass, 0 warnings | 2026-09-22 15:10 | `layer:ui` may depend only on `layer:ui` and bans TanStack Query/Router; `@base-ui/*`/`@floating-ui/*` and deep `@vertex-os/ui/*` imports banned outside the package; `vertex-ui/no-raw-styling` (arbitrary, physical, palette, `dark:`, `z-`, `vx-*`). Compile-time test rejects `secondary + danger`. |
| E-04 | DS-7 | `pnpm nx run @vertex-os/web:test` | 8 tests pass | 2026-09-22 15:15 | Arabic RTL first run, liveness pending/available/unavailable, one main landmark, named navigation, skip link, not-found. |
| E-05 | DS-2–DS-9 | `pnpm test:e2e` (full suite, three times) and behaviour suite `--repeat-each=3` | 130/130 ×3; 342/342 | 2026-09-22 15:25 | smoke 5 (liveness ar/en, production exposes no lab and ships no lab module or fixture, first paint stores theme/dir/lang before `<body>`); lab-chromium 67; lab-firefox 21; lab-webkit 21 (dialog containment/inert/restoration, dirty guard, nested Escape, AlertDialog safe focus, menu-trigger and removed-trigger restoration, drawer logical edges, forms/summary, choices, search, RTL table order, bidi isolation, directional icons, RTL/LTR tab arrows, switch thumb, live modes + persistence, sorting/selection/filters/narrow overflow); visual 14 (+ setup/teardown). |
| E-06 | DS-3/DS-9 | Chromium touch scan (`isMobile`, `hasTouch`, Compact saved) on actions/forms/navigation/IAM + open menu | Pass | 2026-09-22 15:25 | Every visible button, field, select, tab, sidebar link, breadcrumb link, brand link and choice row ≥ 44px; density resolves to Default; disabled replaces every variant (computed colours). |
| E-07 | DS-2/DS-6 | Chromium: all eight Arabic/English × Light/Dark × Default/Compact combinations on the IAM directory | Pass | 2026-09-22 15:25 | Root attributes, 68/60px two-line rows (+1px separator), logical column order, theme surface colour, keyboard sorting. |
| E-08 | DS-8/DS-9 | Visual baselines in the pinned Linux Chromium (DS-D031) | 18 images, each reviewed | 2026-09-22 15:02 | colour roles ar Light/Dark, typography, delivered families (diacritics, mixed runs, figures), bidi cases, button matrix ar Light and en Dark Compact, field states, choice states ar Light/Dark, dialog over inert page ar Light/Dark, IAM directory in the four DS-6 combinations, role-permission editor, shell 1440 ar Light, shell 390 Finance ar Dark. Review found and fixed two defects (disabled danger colours; unisolated English metadata). Re-rendering without source change rewrote 0 unchanged images (determinism). Agent review only: human design review of the baseline set is still required by §41.2 before release. |
| E-09 | DS-9 | axe-core 4.13 (`@axe-core/playwright`) on all 15 lab pages in ar Light and en Dark Compact, plus an open modal | 31 scans, 0 violations | 2026-09-22 15:25 | Tags wcag2a/aa, wcag21a/aa, wcag22aa (includes rendered colour contrast). Supplements, never replaces, manual review. |
| E-10 | DS-2/DS-9 | Chromium print emulation of `/dev/ui/print` with Dark stored | Pass | 2026-09-22 15:25 | Light canvas `rgb(248, 248, 243)`, shell/sidebar/buttons/row actions hidden, `thead` is `table-header-group`, amount `-1,234.50 SAR` and status text kept, PDF produced. |
| E-11 | DS-9 | Chromium media checks | Pass | 2026-09-22 15:25 | 320/390 narrow, 768/1024 rail, 1440 expanded, no page-level horizontal scroll on five pages each; 400% zoom as 320 CSS px at DPR 4; 200% text via the browser's own font-size setting (shell narrows, fields grow to ≥ 80px); reduced motion (0s transitions/animation); forced colours (2px Highlight outline, checked fill); web fonts blocked: no clipped text. |
| E-12 | DS-9 | Manual keyboard review (agent-driven Tab traversal, Chromium + Firefox, `/dev/ui/iam`, `/dev/ui/forms`) | Pass | 2026-09-22 15:08 | Identical logical order in both engines: skip link → brand → collapse → navigation → preferences → content in DOM order; every stop shows the 2px ring; disabled rows skipped with their actions still reachable; one stop per radio group. |
| E-12a | DS-9 | NVDA 2026.2 (official launcher, SHA-1 matched NV Access's API, Authenticode "NV Access Limited", run as a temporary portable copy with the owner's approval) + Chromium 1243 (Chrome for Testing) + Microsoft Naayf (ar-SA) OneCore voice, automatic language switching on; focus-driven scenarios with the test window verified in the foreground at every step; speech from NVDA's IO log | Pass after two fixes | 2026-09-22 15:52 | Arabic spoken with the Arabic voice (`ar_SA`), English page with English labels. Announced correctly: table size, row/column position and column headers; sort button then "sorted ascending" plus the polite sort message; row checkboxes named with the record; "checked"; row menu button, items with position, destructive item last; AlertDialog title + consequence + focus on the safe "إلغاء"; Dialog name + description + focused required field; required, invalid entry + error text, read only, half checked, radio group "طريقة العرض (مطلوب)", switch on; error summary heading + list of same-page links; warning toast announced without moving focus; tab control, "selected 1 of 4", ArrowLeft → "2 of 4" in RTL; focus returned to the opener/menu trigger. Defects found and fixed: modal header/footer exposed as banner/contentinfo landmarks; focus returning through `<body>` (DS-D039). Observed NVDA behaviour kept as is: when an `aria-modal` dialog closes, NVDA drops its dialog buffer and reads the page's first line for ~0.2 s before announcing the focused opener. Not covered: NVDA browse-mode reading commands (injected keys), Firefox with NVDA, VoiceOver. |
| E-13 | DS-10 | `pnpm verify` (format:check → lint → typecheck → test → build) | Pass | 2026-09-22 15:55 | Run as the first half of E-14. Earlier attempts failed on an `IconButton` type change (fixed at its root, DS-D036). |
| E-14 | DS-10 | `pnpm verify:full` | **Pass** (exit 0, 2 m 6 s) | 2026-09-22 15:55 | Final run after the NVDA fixes (an identical pass at 15:25 preceded them): verify + Prisma validate/generate + Testcontainers integration (api 3, database 4) + e2e 130/130. Earlier runs: one failed on a new assertion that ignored the 1px row separator (test corrected); one exposed the focus-guard sampling flake (Section 37). |
| E-15 | DS-10 | `pnpm deps:audit` | Pass | 2026-09-22 15:55 | Only the four pre-existing reviewed Phase 0 exceptions; no advisory from `@base-ui/react` 1.8.0 or `@axe-core/playwright` 4.13.0. |
| E-16 | DS-10 | Remote GitHub Actions | **Not run** | — | Requires a commit/push, which this task did not authorize. CI now installs Chromium, Firefox and WebKit. |

Never replace evidence with “should pass”.

---

# 39. Definition of Done

## 39.1 Architecture

- [x] `@vertex-os/ui` is a real Nx workspace library.
- [x] Package boundaries prevent inappropriate dependencies.
- [x] No business/domain authority lives in the UI package.
- [x] No shadcn exists.
- [x] No unnecessary infrastructure/tooling was introduced.

## 39.2 Tokens

- [x] One canonical machine-readable source exists.
- [x] Token generation is deterministic.
- [x] Alias validation exists.
- [x] Light/Dark mappings are complete.
- [x] Semantic token consumption is enforced by convention/tooling where practical.
- [x] Raw feature colors/spacing are removed from migrated surfaces.

## 39.3 Modes

- [x] Arabic/RTL first-run works.
- [x] English/LTR works.
- [x] Light works.
- [x] Dark works.
- [x] Default density works.
- [x] Compact density works.
- [x] coarse-pointer override works.
- [x] preference storage is non-sensitive and versioned.
- [x] theme applies without unacceptable first-paint flash.

## 39.4 Typography and assets

- [x] approved IBM Plex assets are locally hosted.
- [x] applicable license is retained.
- [x] Arabic shaping/diacritics are verified.
- [x] fallback rendering does not clip.
- [x] tabular/numeric presentation is verified.
- [x] no unapproved/proprietary reference asset was copied into implementation.

## 39.5 Core UI

- [x] foundation components follow `DESIGN_SYSTEM.md`.
- [x] applicable states exist.
- [x] focus is consistent.
- [x] disabled/read-only/loading/invalid remain distinct.
- [x] status tones are shared.
- [x] gold has not leaked into workflow semantics.

## 39.6 Forms

- [x] visible labels exist.
- [x] descriptions/errors are programmatically associated.
- [x] choice controls are keyboard accessible.
- [x] form summary behavior is proven.
- [x] permission-editor specimen demonstrates mixed state and review.

## 39.7 Feedback

- [x] alert/inline/toast roles remain distinct.
- [x] toast lifetime and announcement rules match the spec.
- [x] critical outcomes are not toast-only.
- [x] toast interaction respects modal/inert ownership.

## 39.8 Overlays

- [x] shared overlay ownership exists.
- [x] focus ownership is correct.
- [x] Escape order is correct.
- [x] background is inert for modal surfaces.
- [x] focus restores correctly.
- [x] dirty dismissal can be guarded.
- [x] RTL placement works.
- [x] portal theme/direction inheritance works.

## 39.9 Tables

- [x] semantic table foundation exists.
- [x] sorting is accessible.
- [x] selection scope is explicit.
- [x] bulk action presentation works.
- [x] narrow overflow is contained.
- [x] exact critical values remain readable.
- [x] RTL ordering is correct.
- [x] IAM synthetic directory proves real use.

## 39.10 Shell

- [x] real web app uses the Vertex root.
- [x] responsive shell works.
- [x] skip link works.
- [x] landmarks are correct.
- [x] Phase 0 API status behavior still works.
- [x] old ad hoc shell design is removed.

## 39.11 Lab

- [x] `/dev/ui` exists in the approved environment.
- [x] foundation states can be inspected.
- [x] both themes can be inspected.
- [x] both directions can be inspected.
- [x] both densities can be inspected.
- [x] cross-module synthetic proof scenarios exist.
- [x] no real business data is used.

## 39.12 Accessibility

- [x] automated accessibility checks exist where valuable.
- [x] keyboard review completed.
- [x] NVDA path reviewed (E-12a).
- [x] contrast verified on rendered states.
- [x] 200% text resize passes.
- [x] 400% zoom passes.
- [x] reduced motion passes.
- [x] forced colors reviewed.
- [x] touch/coarse-pointer targets pass.

## 39.13 Cross-browser

- [x] Chromium shared overlay/form/bidi checks pass.
- [x] Firefox shared overlay/form/bidi checks pass.
- [x] WebKit shared overlay/form/bidi checks pass.

## 39.14 Print

- [x] print uses explicit Light presentation.
- [x] interactive chrome is omitted.
- [x] table headings/labels/units/status text remain meaningful.

## 39.15 Visual regression

- [x] high-value visual baselines exist.
- [x] deterministic assets/data are used.
- [x] Light/Dark evidence exists.
- [x] RTL evidence exists.
- [x] baseline changes require review (CI never writes baselines; human design review of the initial set is still owed, E-08).

## 39.16 Repository verification

- [x] `pnpm verify` passes.
- [x] `pnpm verify:full` passes.
- [x] `pnpm deps:audit` is satisfied according to repository policy.
- [x] no unrelated regression is introduced.
- [x] documentation matches executable reality (README, AGENTS.md routing, DESIGN_SYSTEM.md v1.0.1, this plan).

---

# 40. Stop Conditions

Execution MUST stop rather than improvise if:

- `DESIGN_SYSTEM.md` requires a contradictory behavior in two places that materially
  changes public component behavior;
- the §44.1 sequencing alignment has not been resolved before implementation starts;
- a required implementation needs an architecture-significant dependency not
  already approved;
- selected font licensing cannot be established;
- selected third-party primitive cannot satisfy RTL/accessibility requirements and
  replacing it materially changes the plan;
- repository state has diverged significantly from this plan;
- implementing the foundation would require modifying IAM/domain behavior;
- a security constraint would need to be weakened.

Routine bugs and ordinary implementation choices are not stop conditions.

---

# 41. Forbidden Implementation Shortcuts

The executing agent MUST NOT:

- copy the recovered Claude source into Vertex;
- import proprietary Claude assets;
- copy Claude component APIs blindly;
- recreate shadcn;
- put raw brand palette values directly throughout components;
- create a local dark class per component;
- hard-code physical `left/right` where logical properties apply;
- implement RTL using blanket transforms;
- create one generic universal component with dozens of behavior props;
- add Base UI directly to feature imports;
- put API calls in shared UI components;
- put TanStack Query in UI primitives;
- hide authorization logic inside UI components;
- add Storybook because “design systems usually use it”;
- implement future catalog components speculatively;
- disable focus to make screenshots prettier;
- weaken tests because a primitive is difficult to make accessible;
- lower contrast to match a raster logo sample;
- use `opacity` on entire disabled components;
- fake a backend status in real app navigation;
- convert synthetic proof fixtures into production features.

---

# 42. Expected Outcome

After this plan is complete, the repository should have:

```text
Phase 0 engineering foundation             COMPLETE
Design-system specification                COMPLETE
Design-system executable foundation        COMPLETE
Vertex shared UI primitives                COMPLETE for foundation scope
Application shell                          MIGRATED
Design-system lab                          COMPLETE
RTL/Light/Dark/Density foundations         VERIFIED
Accessibility foundation                   VERIFIED
Cross-browser behavior                     VERIFIED for shared critical surfaces
Print presentation                         VERIFIED
Visual regression foundation               VERIFIED
IAM business implementation                NOT STARTED
```

The first business module can then be implemented without inventing:

- colors;
- spacing;
- focus;
- typography;
- tables;
- forms;
- overlays;
- navigation language;
- feedback patterns.

That is the principal success criterion.

---

# 43. Outcomes & Retrospective

Recorded 2026-09-22 15:25 +03:00 after execution; updated 15:55 after the NVDA pass.

### Delivered

**`@vertex-os/ui` (`packages/ui`, tags `type:lib`, `scope:web`, `layer:ui`).** Actual shape (simpler
than the indicative tree in Section 10; directories exist only where code exists):

```text
src/tokens/tokens.json          single machine-readable source (373 tokens, array form)
scripts/token-engine.mjs        validator + deterministic generator; generate-tokens.mjs (--check)
src/generated/                  tokens.css, tailwind.css (semantic bridge), tokens.ts (catalogue)
src/assets/fonts/ + LICENSES/   9 IBM Plex WOFF2 (Arabic/Sans/Mono × 400/500/600) + OFL-1.1, SHA-256 inventory
src/runtime/                    settings (store + blocking head bootstrap), UiRoot, overlay manager,
                                messages (ar/en, six-form plurals), exact-value/bidi formatters
src/icons/icon.tsx              48 original 24-unit, 1.75-stroke icons; 6 marked directional
src/components/                 one file per family (see list below)
src/styles/                     token-driven CSS per family in Tailwind base/components layers, print
lint/vertex-ui-plugin.mjs       conformance rule consumed by apps/web
```

Components and patterns: Button, IconButton, ButtonGroup; Field (label, description, error),
Fieldset/Legend, ErrorMessage, Input, Textarea, SearchInput, native Select; Checkbox (mixed),
Radio, Switch (pending); Badge, StatusIndicator (five tones, icon + label), Surface; Alert (section
and page placement), InlineMessage, Toast (queue of three, coalescing, six-second pausable success,
modal suspension, one shared announcer), Spinner, Progress (determinate; indeterminate with the
10-second notice), Skeleton, LoadingState, EmptyState, NoResultsState, ErrorState; Dialog, Drawer,
DialogCancel, AlertDialog, DropdownMenu, Popover, Tooltip; Breadcrumb, Tabs, Pagination
(offset/cursor), SidebarNav; DataTable, TwoLineCell, TableToolbar, FilterBar, BulkActionBar,
`useTableSelection`, `nextSort`; Page, PageHeader, RecordHeader, FormSection, FormActions,
RequiredNote, ErrorSummary, DescriptionList, Inspector, InspectorLayout, DisplayPreferences,
AppShell; exact-value helpers Bdi, LtrText, TechnicalId, FileName, ExactAmount, DateText,
InstantText, `parseDecimal`, `normalizeDigits`.

**`apps/web`.** Real shell migrated: `UiRoot` with a router adapter (`RouterLink`), route-change
heading focus, `ApplicationShell` (only the real Home destination), display preferences, Arabic
not-found page, `ApiStatus` on Surface + StatusIndicator with the unchanged liveness query. No
slate/emerald/red or other ad hoc styling remains. `/dev/ui` lab: overview with the eight-mode
controls, 10 foundation/component/pattern sections and 4 synthetic proofs (IAM directory, access
and provisioning statuses, role-permission editor with review, sensitive confirmation; CRM filtered
list, active filters, no results, return context; Projects record header, inspector,
mixed-language filename/version; Finance exact signed amounts, explicit currency,
negative/zero/missing, conflict, uncertain outcome). Compiled only for `dev` and `--mode lab`.

**`apps/web-e2e`.** Production smoke and lab-exclusion checks; shared lab behaviour in Chromium,
Firefox and WebKit; Chromium media/axe/responsive/touch/print/fallback/eight-mode checks; visual
baselines in the pinned Linux image.

**Repository.** Nx `layer:ui` constraints and third-party primitive import bans; CI installs all
three engines; README, AGENTS.md routing and `DESIGN_SYSTEM.md` v1.0.1 reconciled.

**Dependencies.** Production: `@base-ui/react` 1.8.0 (MIT; exact pin; brings `@base-ui/utils`
0.4.0, `@floating-ui/*`, `reselect`) — DS-D016/D025/D035. Development: `@axe-core/playwright`
4.13.0 (MPL-2.0, root) — DS-D017; `typescript` in `apps/web` devDependencies (the Vite config
compiles the head bootstrap from the same TypeScript source). Container image (not an npm
dependency): `mcr.microsoft.com/playwright:v1.63.0-noble`, digest-pinned — DS-D027/D031.

### Deviations

- DS-D024: TanStack Table evaluated and not added (server-driven DataTable; column contract ready
  for internal adoption). §29.1 of the specification now states this explicitly.
- DS-D029: a generated TypeScript token catalogue exists after all, for a real consumer.
- `DESIGN_SYSTEM.md` 1.0.0 → 1.0.1 (patch, §42.2): §44.1 sequencing, §28.1 required groups, stale
  status statements in §1, §29.1 and §41 reconciled. No token, palette or behaviour decision changed.

### Removed ideas

Storybook (the lab suffices); a separate visual Playwright config file (projects in one config
instead); `accent-color` choices and unlayered component CSS from the first draft; per-component
language branches; physical-direction and palette utilities (removed from the Tailwind theme and
linted); TanStack Table for v1; a runtime token map for components.

### Verification

Section 38, rows E-01 to E-16. Every automated gate passes locally and the NVDA/Arabic-voice pass
is done (E-12a). Not executed: human design review of the initial baseline set (E-08, owed by the
design-system owner under §41.2) and remote GitHub CI (E-16, needs a push).

### Remaining design-system backlog

Demand-driven only (Section 27.2/27.3), none needed by the foundation: Combobox, Accordion,
Disclosure, SegmentedControl, ContextMenu, Avatar, Metric, DateInput, TimeInput, MoneyField,
CalendarView, TimelineView, FileItem, UploadField, VersionList, CommentComposer, editable grid,
chart components (tokens already specified), notification center, ActivityList. VoiceOver/Safari
verification becomes required if Apple or touch devices enter the supported release surface.

---

# 44. Completion Report Format

At completion, the executing agent MUST report:

## 1. Executive Result

Use exactly one:

```text
DESIGN SYSTEM FOUNDATION COMPLETE
```

or:

```text
DESIGN SYSTEM FOUNDATION NOT COMPLETE
```

## 2. Delivered Foundation

Summarize:

- tokens;
- themes;
- typography;
- runtime modes;
- package;
- primitives;
- overlays;
- tables;
- shell;
- lab.

## 3. Dependencies Added

For each dependency:

- package;
- version;
- reason;
- production/dev-only;
- major implications.

## 4. Architecture Enforcement

Describe:

- package tags;
- dependency rules;
- feature-import rules;
- third-party primitive boundary.

## 5. Verification

Report every command actually run and its real result.

## 6. Accessibility / RTL Evidence

Report:

- keyboard;
- screen reader;
- RTL;
- zoom/reflow;
- reduced motion;
- forced colors.

## 7. Cross-Browser Evidence

Report the shared overlay/form/bidi/focus checks performed in:

- Chromium;
- Firefox;
- WebKit.

## 8. Visual Evidence

Report reviewed baseline groups and known limitations.

## 9. Deferred Catalog

List only intentionally demand-driven components.

## 10. Known Risks

Concrete unresolved risks only.

## 11. Final Working-Tree Summary

Report files changed and unrelated changes preserved.

## 12. Readiness Verdict

When complete use exactly:

```text
READY FOR IAM IMPLEMENTATION
```

Otherwise:

```text
NOT READY FOR IAM IMPLEMENTATION
```

## 13. Exact Next Step

When ready:

```text
Begin IAM implementation from IAM-0 using docs/modules/iam.md and the completed Vertex Design System Foundation.
```

Then stop.

---

# 45. Plan Quality Rules

While executing and updating this plan:

- preserve canonical ownership;
- keep milestones independently verifiable;
- report observed evidence;
- avoid speculative abstraction;
- implement the smallest coherent shared foundation;
- do not confuse catalog completeness with foundation completeness;
- make accessibility part of implementation, not final polish;
- test Arabic from the beginning;
- test Dark mode from the beginning;
- test real component states rather than ideal screenshots only;
- remove experiments before closing a milestone;
- keep the plan synchronized with actual implementation discoveries.

The design system is successful when future modules naturally look and behave like
Vertex OS without needing local design decisions.

---

# 46. Completion Rule

This plan becomes `COMPLETE` only when:

1. every required milestone DS-0 through DS-10 passes;
2. all Foundation Definition-of-Done items are satisfied;
3. the actual web shell uses the system;
4. synthetic cross-module specimens prove coherence;
5. accessibility and RTL have evidence;
6. Chromium/Firefox/WebKit critical shared behavior has evidence;
7. print presentation is verified;
8. high-value visual baselines exist;
9. repository verification passes;
10. documentation matches executable reality;
11. no known foundational UI defect is being deferred into IAM.

The expected final sequence is:

```text
Phase 0                                  ✅
        ↓
docs/DESIGN_SYSTEM.md                    ✅
        ↓
canonical §44.1 sequencing alignment
        ↓
docs/plans/DESIGN_SYSTEM_PLAN.md
        ↓
DS-0  Preflight
        ↓
DS-1  Tokens + @vertex-os/ui
        ↓
DS-2  Themes + RTL + density + fonts + print
        ↓
DS-3  Core primitives + feedback
        ↓
DS-4  Forms + choice controls
        ↓
DS-5  Overlay manager + overlays + navigation
        ↓
DS-6  Tables + operational patterns
        ↓
DS-7  Real application shell
        ↓
DS-8  /dev/ui + cross-module specimens
        ↓
DS-9  Accessibility + RTL + cross-browser + visual hardening
        ↓
DS-10 Final verification + audit
        ↓
DESIGN SYSTEM FOUNDATION v1 CLOSED
        ↓
IAM-0
        ↓
IAM-1 ... IAM-7
        ↓
IAM verification / audit
        ↓
IAM CLOSED
        ↓
CRM
```
