# Vertex OS — Design System

**Status:** Canonical design specification; implementation pending  
**Version:** 1.0.0  
**Scope:** Vertex OS application UI, Arabic/RTL and English/LTR, Light and Dark  
**Design baseline:** 22 September 2026

## 1. Document Role

This document owns Vertex OS's visual, spatial, interaction, content, and accessibility language. Future screens MUST use this system. It specifies the target design; it does not claim that tokens, components, fonts, or test infrastructure already exist.

MUST and MUST NOT are mandatory. SHOULD and SHOULD NOT establish strong defaults; deviations require a documented reason and review. MAY permits an option within the stated constraints.

Product scope remains in [PRODUCT.md](PRODUCT.md); domain ownership in [MODULES.md](MODULES.md); technical boundaries in [ARCHITECTURE.md](ARCHITECTURE.md); implementation rules in [ENGINEERING.md](ENGINEERING.md); security in [SECURITY.md](SECURITY.md); verification policy in [TESTING.md](TESTING.md). [IAM](modules/iam.md) owns access states and sensitive administrative operations. This document MUST NOT redefine those contracts.

The current web application is a technical status shell using React, Vite, TanStack Router/Query, and Tailwind. Its English text and ad hoc slate classes are implementation gaps against this target, not design precedents. No application source, dependency, UI package, or CSS implementation is introduced by this specification. The existing IAM specification anticipates this shared foundation; its provisional RTL wording is resolved here to require Arabic-first delivery.

### Reading map

| Need | Sections |
| --- | --- |
| Direction, brand, architecture | 2–7 |
| Palette, themes, typography, geometry | 8–17 |
| States, motion, focus, icons | 18–21 |
| Shell, responsive layout, RTL, accessibility | 22–25 |
| Components and operational patterns | 26–38 |
| Dependencies and theme delivery | 39–40 |
| Verification, governance, readiness | 41–46 |

## 2. Product Context

Vertex OS supports the internal lifecycle from lead and opportunity through delivery, approval, invoice, payment, and completion. Its primary design unit is an operational workspace: a list of records, a focused detail view, a structured editing flow, and a visible next action.

Arabic is the default interface language and RTL the default layout direction. English is a complete supported mode. Language, direction, theme, density, date semantics, and numeric formatting MUST be explicit, separate concerns.

The system serves long sessions involving administration, CRM, services, sales, projects, tasks, briefs, assets, approvals, content, time, finance, collaboration, notifications, automation, reporting, and audit. A reusable pattern MAY serve several domains; it MUST NOT absorb their business rules. Specifying a presentation pattern does not authorize a deferred product capability, an external client portal, full accounting, autonomous AI, or new infrastructure.

## 3. Design Vision

**A calm operational desk, unmistakably Vertex.** Warm ivory and ink-like green establish identity in Light. Deep green-neutral surfaces and restrained mint actions provide equivalent clarity in Dark. Champagne gold appears at the brand boundary, not throughout the work surface. Typography, alignment, and measured separation do most of the organizational work.

The characteristic screen has a quiet sidebar, a compact page heading, a clearly bounded work area, and readable rows. It uses few filled controls, modest corners, no routine card shadows, and no decorative dashboards. Important records, amounts, responsibilities, deadlines, and decisions receive emphasis before decoration.

## 4. Design Principles

1. **One language across modules.** The same intent MUST use the same component, semantic token, state, and copy pattern.
2. **Arabic shapes the foundation.** Control geometry MUST accommodate Arabic ascenders, descenders, diacritics, and mixed-script content without shrinking text.
3. **Density through structure.** Reduce repetition and padding before reducing readable type. Dense does not mean small targets or hidden information.
4. **Hierarchy before enclosure.** Use headings, alignment, spacing, and separators before adding a surface or card.
5. **State must be inspectable.** Selection, pending work, access state, validation, and stale data MUST remain distinguishable.
6. **Precision earns trust.** Save status, scope, totals, dates, permissions, and consequences MUST describe actual authoritative state.
7. **Progressive disclosure preserves context.** Reveal secondary actions without concealing the primary task, critical values, or errors.
8. **Accessibility is a design input.** Contrast, keyboard operation, reflow, and assistive technology behavior MUST shape components before release.

## 5. Brand Relationship and Reference Decisions

### 5.1 Evidence and decisions

The supplied references are research inputs, not instructions to install their packages or reproduce their implementation.

| Reference finding | Classification | Vertex decision |
| --- | --- | --- |
| Official green and gold raster logos | KEEP | Preserve artwork, proportions, orientation, and recognizable deep green/champagne relationship |
| Raster sampling: frequent interior colors near `#004139` and `#B9A87A` | ADAPT | Use these as brand anchors; JPEG compression is not a formal color specification |
| Website `globals.css`: primary `#07483D`, background `#F8F8F3`, foreground `#173F36` | ADAPT | Retain primary/ivory direction; organize text and surfaces into a smaller shared neutral system |
| Website gold variants `#B3A374`, `#AB9966`, and many local green/gray values | ADAPT | Consolidate identity gold into one anchor; introduce darker gold only for readable text |
| Website shadcn import, raw local colors, physical margins, ornamental asymmetric corners, large promotional type | REJECT | No shadcn, local palettes, marketing layout grammar, or physical-direction defaults |
| Claude reconstruction purpose tokens, quiet secondary controls, theme remapping, density scopes | KEEP | Adopt these principles in an original Vertex token contract |
| Claude layered palette/theme/elevation/purpose model | ADAPT | Use three ownership layers; elevation is a semantic role rather than a separate mandatory token layer |
| Recovered compact 24px controls and very small captions | REJECT | Arabic UI uses 36/40px controls and a 13px secondary-text floor |
| Claude clay action identity, serif voice, chat-specific families, overshoot and button squish | REJECT | Green action language, paired Arabic/Latin sans, no chat identity or decorative motion |
| Reconstructed table uses left alignment; switch uses physical X movement; overlays have partial behavior | REJECT | Define logical geometry and complete keyboard/focus contracts independently |
| Financial presentation, Arabic shaping, robust operational tables, conflicts, destructive administrative actions | MISSING | Define explicitly in this specification |

The archive's own README and forensics describe an unofficial reconstruction of Claude Desktop 2.2553.1, not complete Claude web source. Its catalog reports 888 unique token names and 1,926 occurrences, including scoped overrides; these are not 888 independent design requirements. Extracted declarations informed the analysis, while reconstructed React APIs and overlays were treated as illustrative. No proprietary font or source implementation is adopted.

### 5.2 Logo application

- The supplied green-on-white artwork is the Light reference; gold-on-green is the dark brand reference. Gold-on-white is suitable for sufficiently large brand artwork, not functional text or control icons.
- The supplied `vertex-green-mark.webp` contains the full lockup and white background. It MUST NOT be treated as an isolated transparent symbol or squeezed into a 20px navigation icon.
- Future production assets MUST preserve the official drawing. Obtain an approved vector or transparent export before fitting the lockup into tight shell spaces. Do not trace an approximation, recolor through CSS filters, mirror, stretch, animate, or crop away letterforms.
- Measure the visible artwork, not the generous source-image canvas. Full lockup minimum visible width is 96px; clear space on each side is at least one eighth of the visible artwork height. The embedded small “MEDIA” lettering is artwork, not navigation text.
- Use a compact, typographic `Vertex OS` label in the 56px shell header if approved artwork cannot fit legibly. A future standalone symbol requires a brand-approved asset.
- An interactive brand link MUST have a localized destination name, such as `الانتقال إلى الرئيسية`. Decorative artwork beside the same visible product name has empty alternative text.

Gold MUST NOT mean selected, successful, premium access, pending, or warning. One logo or small identity accent per shell is sufficient. Content surfaces MUST NOT use ornamental gold borders or gradients.

## 6. Design-System Architecture

| Layer | Owns | MUST NOT own |
| --- | --- | --- |
| Foundations | Tokens, theme, density, typography, icon and direction rules | Domain states or server data |
| UI primitives | Semantics, accessible interactions, standard visual states | Permissions, financial calculations, network calls |
| Product patterns | Shell, page header, form sections, table toolbar, record layout, feedback placement | Module-specific mutations or enum definitions |
| Feature compositions | Authorized capabilities, domain copy, data and workflows | New foundational styling or duplicated primitives |

React, Tailwind, and the repository's existing TanStack boundaries remain the implementation baseline. The future approved shared UI package is the home for business-neutral UI. Feature composition remains in its owning feature. No package is to be created solely to match this diagram.

An “InvoiceStatus” mapping belongs to Finance; the shared StatusIndicator owns its rendering. A role-permission editor belongs to IAM; Checkbox, Table, and confirmation behavior are shared. The backend remains authoritative for all permissions, transitions, totals, and writes.

## 7. Token Architecture

### 7.1 Three layers

`reference → semantic → component (only where justified)`

| Layer | Naming examples | Rules |
| --- | --- | --- |
| Reference | `ref.color.green.800`, `ref.space.4`, `ref.radius.2` | Raw values; private to foundations |
| Semantic | `color.background.canvas`, `color.action.primary.background`, `space.field.gap`, `size.control.block` | Public roles; components and approved layout utilities consume these |
| Component | `component.table.row.min-block`, `component.dialog.max-inline` | Only a stable component-specific decision not expressible as an existing role |

Names MUST describe purpose and use lowercase dot-separated segments; hyphens are allowed inside a segment. The future CSS mapping is deterministic: prepend `--vx-` and replace dots with hyphens. For example, `color.text.primary` maps to `--vx-color-text-primary`. Tailwind semantic utilities MUST resolve to these variables; feature code MUST NOT access raw palette stops or redefine variables.

Reference values do not vary by theme. Semantic aliases vary by theme or density only where specified. Component aliases MUST point to semantic roles, or to a documented geometry decision in this file; they MUST NOT contain private palettes. A token MUST have a type, description, owner, allowed contexts, and defined values for every applicable mode. Cycles, undefined aliases, spelling variants, and fallback hex values in consumers are prohibited.

### 7.2 Scope and economy

- Color, typography, spacing, sizing, radius, border, shadow, motion, and layer order are tokenized. Not every CSS property needs a token.
- A component variant is not a theme. There are no CRM, IAM, Finance, or per-page themes.
- Background/text pairs are a contract. A foreground intended for a filled action MUST NOT be placed on a pale surface.
- An existing role MUST be reused if the intent and state behavior match. Add a token only when independent change is meaningful; do not create aliases for every component part.
- Exact palette values occur only in Section 8. Other sections reference roles/stops; numeric contrast evidence may repeat colors for verification.
- The token vocabulary below is the initial contract. Missing business states require a mapping to existing tones, not new color tokens.

## 8. Reference Palette

All colors are opaque sRGB hex values unless explicitly identified as an overlay. Stops are intentionally sparse where no intermediate role exists; implementations MUST NOT invent complete ramps for symmetry.

### 8.1 Neutral and identity

| Reference | Value | Reference | Value | Reference | Value |
| --- | --- | --- | --- | --- | --- |
| `neutral.0` | `#FFFFFF` | `green.50` | `#EDF6F1` | `gold.50` | `#F6F2E7` |
| `neutral.50` | `#F8F8F3` | `green.100` | `#DCEEE5` | `gold.100` | `#EBE3CA` |
| `neutral.100` | `#EEEFE7` | `green.200` | `#B7DCCC` | `gold.300` | `#D2C395` |
| `neutral.200` | `#DCE1D9` | `green.300` | `#8FC5AD` | `gold.500` | `#B9A87A` |
| `neutral.300` | `#B9C3BC` | `green.400` | `#63B093` | `gold.700` | `#7B6833` |
| `neutral.400` | `#94A49B` | `green.500` | `#3B9175` | `gold.900` | `#4B3E20` |
| `neutral.500` | `#718078` | `green.600` | `#21745A` | — | — |
| `neutral.600` | `#56675E` | `green.700` | `#145C48` | — | — |
| `neutral.700` | `#3D4D45` | `green.800` | `#07483D` | — | — |
| `neutral.800` | `#293A32` | `green.900` | `#004139` | — | — |
| `neutral.850` | `#202D27` | `green.950` | `#052C26` | — | — |
| `neutral.900` | `#18231E` | — | — | — | — |
| `neutral.950` | `#101915` | — | — | — | — |

### 8.2 Functional and chart extensions

| Reference | Value | Reference | Value |
| --- | --- | --- | --- |
| `red.50` | `#FCEFF0` | `amber.50` | `#FCF3E4` |
| `red.300` | `#F0A2A5` | `amber.300` | `#E6B86A` |
| `red.700` | `#B3333B` | `amber.700` | `#8A4B08` |
| `red.800` | `#972831` | `amber.950` | `#382918` |
| `red.900` | `#7B2028` | `blue.50` | `#EDF3FB` |
| `red.950` | `#3B1C21` | `blue.300` | `#94BCEB` |
| `violet.300` | `#C0A6E8` | `blue.700` | `#265FA6` |
| `violet.700` | `#7253A3` | `blue.950` | `#192C45` |
| `teal.300` | `#80C9CC` | `teal.700` | `#19767C` |

These are reference colors, not permission to use colorful feature chrome. Violet and teal initially serve categorical visualization only. Success reuses the green family through separate semantic roles; action and success remain distinct concepts.

## 9. Semantic Color System

All names in the following tables have the `color.` prefix. A reference such as `neutral.50` means `ref.color.neutral.50`. Alias entries beginning `=` point to another semantic token in this section.

### 9.1 Surfaces, text, and boundaries

| Semantic token | Light | Dark | Contract |
| --- | --- | --- | --- |
| `background.canvas` | `neutral.50` | `neutral.950` | Root work plane |
| `background.surface` | `neutral.0` | `neutral.900` | Forms, tables, content |
| `background.raised` | `neutral.0` | `neutral.850` | Floating panels, dialogs, menus |
| `background.subtle` | `neutral.100` | `neutral.800` | Grouping, table headings, passive wells |
| `background.sidebar` | `=background.canvas` | `=background.surface` | Quiet shell navigation |
| `text.primary` | `neutral.950` | `neutral.50` | Content and labels |
| `text.secondary` | `neutral.600` | `neutral.300` | Supporting information |
| `text.muted` | `neutral.600` | `neutral.400` | Low emphasis, still readable |
| `text.disabled` | `neutral.500` | `neutral.600` | Unavailable controls only |
| `text.link` | `green.700` | `green.300` | Links; underline in prose |
| `text.link-hover` | `green.900` | `green.200` | Hover and active links |
| `border.subtle` | `neutral.200` | `neutral.800` | Decorative separators |
| `border.default` | `neutral.300` | `neutral.700` | Passive surface enclosure |
| `border.strong` | `neutral.600` | `neutral.400` | Required control outlines, resize handles |
| `icon.default` | `=text.secondary` | `=text.secondary` | Meaningful functional icons |
| `brand.mark` | `green.900` | `gold.500` | Approved monochrome artwork only |
| `brand.accent` | `gold.700` | `gold.300` | Small readable identity text |
| `brand.decorative` | `gold.500` | `gold.500` | Non-informational artwork |
| `selection.text.background` | `green.100` | `green.700` | Browser text selection |
| `selection.text.foreground` | `neutral.950` | `neutral.0` | Selected text |
| `overlay.scrim` | black at 40% | black at 64% | Background dimming; no blur |

Decorative boundaries are deliberately quiet and MUST NOT be the sole means of identifying an input, checkbox, selected item, or chart series. Use `border.strong`, a meaningful contrasting fill, and/or another approved state marker for those roles.

### 9.2 Actions and interaction surfaces

| Semantic token | Light | Dark |
| --- | --- | --- |
| `action.primary.background` | `green.800` | `green.300` |
| `action.primary.hover` | `green.900` | `green.200` |
| `action.primary.pressed` | `green.950` | `green.400` |
| `action.primary.foreground` | `neutral.0` | `neutral.950` |
| `action.secondary.background` | `=background.surface` | `=background.surface` |
| `action.secondary.foreground` | `=text.primary` | `=text.primary` |
| `action.secondary.border` | `=border.strong` | `=border.strong` |
| `action.quiet.hover` | `neutral.100` | `neutral.800` |
| `action.quiet.pressed` | `neutral.200` | `neutral.700` |
| `action.danger.background` | `red.700` | `red.300` |
| `action.danger.hover` | `red.800` | `red.50` |
| `action.danger.pressed` | `red.900` | `red.300` |
| `action.danger.foreground` | `neutral.0` | `neutral.950` |
| `action.disabled.background` | `neutral.100` | `neutral.800` |
| `action.disabled.foreground` | `=text.disabled` | `=text.disabled` |
| `state.selected.background` | `green.100` | `green.950` |
| `state.selected.foreground` | `green.800` | `green.200` |
| `state.selected.indicator` | `green.600` | `green.300` |
| `state.selected.hover` | `green.200` | `green.900` |
| `focus.ring` | `green.600` | `green.300` |
| `focus.gap` | `=background.surface` | `=background.surface` |
| `field.background` | `=background.surface` | `=background.surface` |
| `field.border` | `=border.strong` | `=border.strong` |
| `field.placeholder` | `=text.muted` | `=text.muted` |
| `field.readonly.background` | `=background.subtle` | `=background.subtle` |
| `skeleton.base` | `neutral.200` | `neutral.800` |
| `skeleton.highlight` | `neutral.100` | `neutral.700` |

Secondary and ghost actions share quiet hover/pressed fills. Ghost rests on transparent background with `text.primary`. Destructive quiet actions use `status.danger.foreground` and `status.danger.background` on hover, with an inset 1px danger boundary when pressed. A filled Dark danger action gains that inset boundary when pressed; its background intentionally stays at the same readable stop. Checked controls alias the primary background/foreground pair. Unchecked checkbox/radio uses `field.background` and `field.border`; its hover changes the boundary to `focus.ring`. The unchecked switch uses `background.subtle` with `border.strong` and a `text.secondary` thumb; checked track/thumb use the primary pair. Expanded controls use quiet hover fill plus their expanded glyph; expansion is not selection.

### 9.3 Status pairs

Each row defines `status.<tone>.background`, `.foreground`, and `.border`. The border aliases its foreground to preserve a strong cue when required. Banners and badges MUST use the matching pair, not mix tones. Body prose within a large status panel MAY use `text.primary`; its heading/icon uses the status foreground.

| Tone | Light background | Light foreground/border | Dark background | Dark foreground/border |
| --- | --- | --- | --- | --- |
| `neutral` | `neutral.100` | `neutral.600` | `neutral.800` | `neutral.300` |
| `info` | `blue.50` | `blue.700` | `blue.950` | `blue.300` |
| `success` | `green.50` | `green.700` | `green.950` | `green.300` |
| `warning` | `amber.50` | `amber.700` | `amber.950` | `amber.300` |
| `danger` | `red.50` | `red.700` | `red.950` | `red.300` |

### 9.4 Contrast acceptance

Normal text MUST reach 4.5:1; qualifying large text 3:1; essential graphical/control boundaries 3:1 against adjacent colors. Vertex targets 4.5:1 for all ordinary UI labels regardless of weight. Disabled controls are exempt from the WCAG text threshold but MUST NOT use disabled colors for readable records or explanations. These thresholds follow [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Calculated sRGB ratios for the specified opaque pairs, rounded to two decimals:

| Pair | Ratio | Consequence |
| --- | --- | --- |
| Light secondary text / subtle background | 5.19:1 | Lowest of the regular Light neutral text surfaces |
| Dark muted text / subtle background | 4.61:1 | Lowest regular Dark neutral text surface; do not further dim |
| Light primary label / resting primary fill | 10.48:1 | Primary action |
| Dark primary label / resting primary fill | 9.18:1 | Primary action |
| Dark primary label / pressed primary fill | 6.96:1 | Pressed remains readable |
| Light focus ring / subtle background | 4.89:1 | Focus on regular Light planes |
| Dark focus ring / subtle background | 6.16:1 | Focus on regular Dark planes |
| Light success, warning, danger, info matched pairs | 7.18, 6.17, 5.43, 5.75:1 | All meet normal text threshold |
| Dark success, warning, danger, info matched pairs | 7.71, 7.63, 7.58, 7.16:1 | All meet normal text threshold |
| Brand gold / white | 2.35:1 | Prohibited for functional text and informative thin icons |
| Brand gold / brand green | 4.93:1 | Suitable brand pairing |
| Dark gold text stop / pale gold | 4.85:1 | Readable identity accent |

These calculations establish palette feasibility, not rendered accessibility certification. Implementation MUST verify actual compositing, borders, font rendering, focus geometry, and every state combination. Do not lower opacity on whole components to synthesize disabled, muted, or selected states.

## 10. Light Theme

Light uses an ivory canvas, white content planes, dark green-neutral text, and deep green actions. The sidebar is canvas-colored; a separator provides structure. Most visible area SHOULD remain canvas or surface. Green is concentrated in the primary action, links, selected state, and meaningful indicators.

Adjacent white panels require spacing or a separator, not escalating shadows. Large forms use a single surface or the canvas with clear sections. Gold decoration MUST NOT compete with status colors. Photos, client artwork, and documents retain their own colors inside a neutral viewer.

## 11. Dark Theme

Dark uses four deliberate depths: canvas `neutral.950`, surface `neutral.900`, raised `neutral.850`, subtle `neutral.800`. Raised content is slightly lighter; it is not a white panel with inverted text. Primary actions use a subdued mint fill with dark text, preserving legibility without electric green.

Use the same hierarchy, spacing, type weights, and status names as Light. Dark MUST NOT reduce text opacity, increase border thickness, or glow around controls. Borders define floating edges because shadows are less visible. Images MUST NOT be automatically inverted or globally dimmed; the media viewer may offer an explicit viewing background when useful.

## 12. Typography

### 12.1 Families and delivery

The chosen pairing is **IBM Plex Sans Arabic** for Arabic and **IBM Plex Sans** for Latin, with **IBM Plex Mono** for technical text. The Arabic family's clear forms and the related Latin family support a consistent operational voice without marketing-style headings. The [official IBM Plex repository](https://github.com/IBM/plex) supplies the families under the Open Font License; implementation MUST retain the relevant license with approved self-hosted assets.

| Token | Family/fallback stack |
| --- | --- |
| `font.family.arabic` | `"IBM Plex Sans Arabic", "Noto Sans Arabic", Tahoma, sans-serif` |
| `font.family.latin` | `"IBM Plex Sans", "Segoe UI", Arial, sans-serif` |
| `font.family.mono` | `"IBM Plex Mono", Consolas, "Liberation Mono", monospace` |
| `font.family.ui` | Arabic family then Latin family in Arabic UI; Latin family then Arabic family in English UI, followed by their system fallbacks |

The future font configuration MUST route Arabic glyphs to the Arabic face and Latin glyphs to the Latin face, including within mixed text. Numeric tabular shaping MUST be verified on the delivered files; monospace is not a fallback for all Arabic text. Use real weights 400, 500, and 600. No synthetic bold, synthetic Arabic italics, condensed UI face, or decorative serif. Load only required weights/scripts, use font-display swap, preserve shaping tables when subsetting, and test fallback clipping before fonts resolve. No remote font-CDN dependency.

### 12.2 Type roles

Sizes below are CSS-pixel equivalents at a 16px root. Implement as rem sizes; line-height is the listed ratio so it scales with text. Both languages share sizes and line boxes. Density MUST NOT change typography.

| Role token `type.*` | Size / line box | Weight | Use |
| --- | --- | --- | --- |
| `page-title` | 24 / 36 | 600 | One page heading |
| `section-title` | 18 / 28 | 600 | Form/detail sections |
| `subheading` | 16 / 24 | 600 | Dialog titles, grouped summaries |
| `body` | 14 / 24 | 400 | Default operational text, table cells |
| `body-long` | 16 / 28 | 400 | Briefs, comments, long reading |
| `label` | 14 / 24 | 500 | Controls, fields, menu items, navigation |
| `secondary` | 13 / 20 | 400 | Help, metadata, captions |
| `table-heading` | 13 / 20 | 500 | Column headings |
| `metric` | 28 / 40 | 600 | A small number of useful summaries |
| `code` | 13 / 20 | 400 | IDs, logs, technical fragments |

Tracking is zero for all UI roles and both scripts. Arabic MUST NOT use letter spacing, forced kashida, uppercase-like styling, or justified text. Latin UI uses sentence case. Emphasis uses weight 600, not a new color. Headings MUST wrap rather than clip; the semantic heading level follows the document outline independently of its type role.

Numbers use lining/tabular figures in aligned amounts, dates, timers, and metrics. Prose uses normal proportional spacing. Full financial amounts, signs, and currency codes MUST remain readable; never abbreviate them in transaction review. A technical ID may use the mono role without making its surrounding sentence monospace.

Text inputs use 16/24 on viewports below 768px and whenever a coarse pointer is present, preventing small-input mobile zoom behavior. This is the only routine control-type override. No essential UI text below 13px. Multi-line Arabic MUST have enough block space for diacritics; fixed row/control values are minima, not clipping boxes.

## 13. Spacing

The base unit is 4px. A 2px half-step exists for optical alignment and compact internal grouping. Values below are reference tokens `ref.space.<key>`; implementation converts them to rem.

| Key | 0 | 0-5 | 1 | 1-5 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Value | 0 | 2 | 4 | 6 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |

| Semantic token | Value | Use |
| --- | --- | --- |
| `space.icon-label` | 8 | Icon and label, checkbox and text |
| `space.field.gap` | 4 | Label, control, description/error stack |
| `space.form.fields` | 20 | Between field groups |
| `space.form.sections` | 32 | Between titled sections |
| `space.actions` | 8 | Related buttons |
| `space.toolbar.groups` | 16 | Search/filter/action groups |
| `space.section` | 24 | Adjacent page sections |
| `space.surface.padding` | 24 | Standard bounded work area |
| `space.overlay.padding` | 24 | Dialog/drawer content |
| `space.menu.padding` | 4 | Outer menu inset |
| `space.page.gutter` | 24 | Desktop; 16 narrow, 32 wide as Section 23 |

Control padding and table cells use Section 14. An exceptional optical correction MUST be inside the shared icon/component implementation, documented, and at most 1px; feature code cannot use this exception for arbitrary layout. Borders and focus widths are not spacing steps.

## 14. Density and Sizing

There are two user-facing density modes: **Default** and **Compact**. Default is the first-run choice. Compact is an explicit preference for fine-pointer desk work. A shell-level preference governs controls, navigation, menus, and rows together; pages MUST NOT mix density modes to fit a screenshot. Coarse-pointer environments MUST resolve to Default and apply the touch target minima below, even if Compact was saved.

| Semantic/component dimension | Default | Compact | Notes |
| --- | --- | --- | --- |
| `size.control.block` | 40px | 36px | Input, select, button minimum |
| `size.control.small` | 36px | 32px | Secondary table/toolbar actions only |
| `size.control.large` | 48px | 48px | Touch-emphasized actions, rare |
| `space.control.inline` | 12px | 12px | Text control inset |
| `space.control.block` | 8px | 6px | Button minimum; allow multi-line growth |
| `size.navigation.item` | 40px | 36px | Sidebar and navigation rows |
| `size.menu.item` | 36px | 32px | Minimum, wrap when needed |
| `component.table.row.min-block` | 48px | 40px | Single-line data row |
| `component.table.header.min-block` | 40px | 36px | Column headings |
| `component.table.cell.padding-block` | 12px | 8px | With 24px body line |
| `component.table.cell.padding-inline` | 12px | 12px | All columns |
| `component.table.row.secondary-min-block` | 68px | 60px | Two lines, 24 + 20px |
| `size.choice.visual` | 20px | 20px | Checkbox/radio; hit area includes label |
| `component.switch.track` | 40 × 24px | 40 × 24px | 20px thumb, 2px inset |

Dimensions are rem equivalents except hairlines; all are minimums. Small controls MUST NOT become the default for forms. IconButtons are square at their control size. Every independent target MUST have at least a 24 × 24 CSS-pixel hit region with no overlap; Vertex's normal fine-pointer controls exceed this. For touch/coarse pointers, all actions and choice label rows MUST provide at least 44 × 44px; table rows become at least 52px when needed for padding around controls. Do not enlarge invisible hit boxes over neighboring actions.

Textarea minimum is 120px, resizable in the block direction. SearchInput is 240px preferred, 160px minimum, and full width on narrow screens. Badges are at least 24px tall, with 4px block and 8px inline padding as needed by their 20px line box; they are not interactive targets unless rendered as an explicit removable filter control.

## 15. Radius

| Reference | Value | Semantic use |
| --- | --- | --- |
| `ref.radius.0` | 0 | Flush table regions and separators |
| `ref.radius.1` | 4px | `radius.small`: checkbox, keycap, small badge |
| `ref.radius.2` | 6px | `radius.control`: controls, nav items, tooltips |
| `ref.radius.3` | 8px | `radius.surface`: panels, menus, bounded tables |
| `ref.radius.4` | 12px | `radius.overlay`: dialogs and modal drawers |
| `ref.radius.full` | 9999px | `radius.round`: avatars, radio, switch only |

Pill buttons and pill-shaped status labels are not part of the default system. Nested child radii MUST not exceed their container's radius. Flush drawers use square corners against the viewport edge; only exposed logical corners receive overlay radius. Feature-specific asymmetrical rounding is forbidden.

## 16. Borders and Separators

`border.width.default` is 1px; `border.width.emphasis` is 2px. Required field outlines use `field.border`. Decorative row separators use `border.subtle`. Focus uses its own geometry, not a thicker field border that shifts layout.

Use one shared separator between adjacent regions, not two overlapping borders. Data tables use horizontal separators without a full cell grid; permission matrices MAY add restrained column group separators. Error fields keep a 1px danger border and gain text/icon feedback; they MUST NOT grow. Selected navigation adds a 2px inline-start indicator inside reserved space. Dashed borders are reserved for drop targets. Static cards MUST NOT suggest interaction by changing on hover.

## 17. Elevation and Layering

### 17.1 Planes and shadows

| Token / plane | Light shadow | Dark shadow | Use |
| --- | --- | --- | --- |
| `shadow.none` | none | none | Canvas, cards, tables, ordinary panels |
| `shadow.floating` | `0 4px 16px rgb(0 0 0 / 12%)` | `0 4px 16px rgb(0 0 0 / 28%)` | Menus, popovers, tooltips |
| `shadow.modal` | `0 16px 48px rgb(0 0 0 / 20%)` | `0 16px 48px rgb(0 0 0 / 40%)` | Modal dialog or drawer |

Floating surfaces MUST also have a 1px `border.default`. Elevation describes occlusion, not importance: an important section remains on the page plane. Nonmodal inspectors use a separator and no shadow. Sticky headers use a separator rather than permanent elevation.

### 17.2 Layer contract

| Token | Value |
| --- | --- |
| `layer.base` | 0 |
| `layer.sticky` | 10 |
| `layer.shell` | 20 |
| `layer.popup` | 30 |
| `layer.modal-scrim` | 40 |
| `layer.modal` | 50 |
| `layer.modal-popup` | 60 |
| `layer.tooltip` | 70 |
| `layer.toast` | 80 |

One shared overlay manager MUST own order, Escape routing, outside interaction, inert background, and restoration. A popup opened inside a dialog belongs to that dialog and uses its popup layer. Global popups close before opening an unrelated modal. Tooltips and toast actions belonging to inert background content MUST NOT float over or become interactive above a modal. Native top-layer elements require the same ownership policy; z-index alone cannot establish it.

## 18. Motion

| Token | Value | Use |
| --- | --- | --- |
| `motion.duration.instant` | 0ms | Reduced motion, immediate data corrections |
| `motion.duration.fast` | 100ms | Hover, press, focus-associated color |
| `motion.duration.base` | 160ms | Menus, popovers, disclosure, state crossfade |
| `motion.duration.enter` | 200ms | Dialog entrance |
| `motion.duration.panel` | 240ms | Drawer entrance |
| `motion.ease.standard` | `cubic-bezier(0.2, 0, 0, 1)` | Within-page transitions |
| `motion.ease.enter` | `cubic-bezier(0, 0, 0.2, 1)` | Entrances |
| `motion.ease.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |

Hover changes color only. Press does not scale, move, bounce, or squish a control. Menu/popover entrance fades with at most 4px block displacement; exit is 100ms opacity. Dialog entrance is opacity plus at most 8px block displacement; exit 160ms. Drawer entrance moves at most 24px from its logical attachment edge while fading; exit 160ms. Disclosure uses 160ms measured height, with no clipping of focused children. Focus indication appears immediately; it MUST NOT wait for animation.

Reduced motion sets these transitions to 0ms, removes displacement, skeleton shimmer, smooth scrolling, and animated chart drawing. A static busy indicator plus text replaces rotation. Default indeterminate spinner rotation is 1000ms linear; optional skeleton pulse is 1600ms and MUST stop within five seconds, leaving a static skeleton. No looping decorative motion, numeric count-up, confetti, parallax, overshoot, or background theme crossfade.

Layout space MUST be reserved before asynchronous content arrives. Motion MUST NOT postpone an authoritative state update or turn completion into an artificial delay. Changing density or language is immediate and preserves focus and context.

## 19. Interaction States

Every interactive primitive MUST define all applicable states in this table. State is semantic, not a collection of unrelated CSS effects.

| State | Visual/behavior contract |
| --- | --- |
| Rest | Role's base surface, text, and boundary |
| Hover | Approved hover fill; only on hover-capable pointers; no essential action revealed exclusively by hover |
| Pressed | Approved pressed fill during activation; no persistent state implied |
| Focus | Actual DOM focus; native behavior retained; field editing focus has a visible ring |
| Focus-visible | Section 20 ring in addition to other state cues |
| Selected/current | Selected fill, explicit marker, and appropriate `aria-selected` or `aria-current`; never inferred from focus |
| Checked | Primary fill and visible check/dot; native checked state or correct ARIA state |
| Indeterminate | Primary fill with horizontal dash; checkbox mixed state announced; never applied to radio/switch |
| Expanded | Expanded glyph and `aria-expanded`; controlled content relationship; not automatically “selected” |
| Disabled | Disabled tokens; operation unavailable; explanatory text remains normal contrast |
| Read-only | Read-only background, readable value, copy/select preserved; not visually or semantically disabled |
| Loading/pending | Stable label area, inline indicator, localized busy message; suppress duplicate action |
| Invalid/error | Danger boundary and linked error text/icon; ring remains the normal focus ring |
| Warning | Warning message and icon; MUST NOT imply invalid input unless the domain rejects it |
| Success | Confirmed outcome shown only after authoritative success; not a green border on every valid field |
| Dragging/drop available | Clear outline and textual destination; equivalent non-drag action required |

Precedence is layered: disabled removes hover/press; busy prevents repeated submission but retains context; selected survives hover; invalid replaces a field boundary; focus-visible is always drawn above these. Focus MUST NOT disappear when a focused action becomes busy. In a composite menu, a disabled item MAY remain in arrow navigation to expose an explanation; it MUST be announced disabled and suppress all activation. Ordinary native disabled buttons are skipped in Tab order.

Use native `disabled` where focus retention is unnecessary. Use `aria-disabled` only where retained focus/discoverability is intentional, with pointer, keyboard, and programmatic activation guarded. Permission checks remain server-side. Read-only controls and unavailable records MUST NOT use `text.disabled` as a substitute for readable content.

Buttons perform actions; links navigate. Toggle buttons expose `aria-pressed`. Do not replace a link with a clickable div, nest buttons inside links, or attach invisible row click handlers as the only navigation path.

## 20. Focus System

Focus is a **2px solid `focus.ring` outline with a 2px separating gap**. The gap uses `focus.gap`; it forms a contrasting boundary against filled controls. Radius follows the control. On a colored panel or media surface, provide the solid gap backing and verify the outside ring against its surroundings; move the control to a neutral toolbar if a reliable boundary cannot be established. No glow-only focus.

The same geometry applies to primary, secondary, destructive, checked, and selected controls. Field focus remains visible during pointer text editing. Other controls MAY limit the extra ring to `:focus-visible`, while keeping native focus behavior intact. Forced-colors mode MUST retain a visible outline using system Highlight/Canvas colors and non-color state indicators.

Focus MUST NOT be clipped by scroll containers, overlay edges, sticky headers, or rounded wrappers. Keep at least 4px clearance around focusable content and appropriate scroll padding at sticky boundaries. Vertex requires the full focused control to remain visible when it can fit, exceeding the minimum partially-visible criterion.

Route navigation focuses the new page heading or main region and announces the page title; browser Back restores list context and focus when possible. Sorting, filtering, and background refresh keep focus at the initiating control. Removal moves focus to the next logical item or list heading. If an overlay trigger disappears, restore to the nearest surviving logical control, never silently to the document body.

## 21. Iconography

Vertex uses one shared set of simple outlined SVG icons on a 24-unit viewBox, with a consistent 1.75-unit stroke, rounded caps and joins. A future icon source MUST be reviewed for licensing, Arabic-context meaning, and coverage before adoption; the visual specification does not require a new runtime dependency. Do not mix filled and outlined families for decoration.

| Token | Size | Use |
| --- | --- | --- |
| `size.icon.small` | 16px | Metadata, table status, small controls |
| `size.icon.default` | 20px | Buttons, fields, sidebar |
| `size.icon.large` | 24px | Prominent feedback |
| `size.icon.empty` | 32px | Restrained empty-state illustration |

Icons use `currentColor`, center optically within a fixed box, and have `space.icon-label` separation. Small icons MUST preserve stroke clarity. Decorative icons are hidden from assistive technology; an IconButton MUST have a localized accessible name that includes context where needed. Tooltips supplement names, not supply them. Color alone MUST NOT distinguish similar actions.

Mirror navigation back/forward, logical previous/next, breadcrumb separators, submenu chevrons, and “move to start/end” arrows. Do not mirror logos, checkmarks, clocks, search, camera, attachment, currency symbols, vertical sort arrows, undo/redo conventions, external-link symbols, media playback, or real-world geographic/map icons. A shared icon registry MUST record `directional` intent; never flip every SVG using a blanket RTL transform. Disclosure chevrons point toward inline-end when closed and down when open.

## 22. Layout Architecture

### 22.1 App shell

- Desktop sidebar occupies **240px** at inline-start; optional user-collapsed rail is **64px**. In Arabic this is the right side. The rail requires named icons, tooltips, and a visible expand action; it MUST NOT be the first-run default.
- A **56px minimum** top header spans the content area. It holds navigation context and global utilities. A page's title and primary action belong below, not duplicated in the header.
- The sidebar contains the product identity, grouped navigation, and a bottom account/settings area. It uses text and neutral icons; active items use selected fill and a 2px inline-start marker, never gold.
- DOM landmarks are header, named main navigation, main, and optional complementary inspector. A first-focus skip link moves to main. There is one main landmark and one page h1.
- The main document scrolls vertically by default. Independently scrolling regions are limited to long navigation, bounded data workspaces, and overlay content. Avoid three competing vertical scroll areas.
- Global utilities MUST not suggest unavailable capabilities. Show search/notifications only when backed by the approved feature; do not build speculative command infrastructure.

### 22.2 Page grammar

Every page follows: optional breadcrumbs → title/context/actions → optional tabs → search/filter toolbar → content → pagination or relevant footer. Use 8px between title and subtitle, 16px within the heading region, and 24px before the working content. One prominent primary action per work context; tertiary actions belong in a named overflow menu.

| Pattern | Width and structure |
| --- | --- |
| Data index | Full available content width; no arbitrary maximum; bounded horizontal table scrolling |
| General detail | Maximum 1200px, centered in content region |
| Editing form | Maximum 720px for the form itself; preferred field width 480px for ordinary short text |
| Reading content | Maximum 720px; comments/briefs use body-long type |
| Detail + metadata | Flexible primary column, 320px secondary column, 24px gap; stack when primary would fall below 560px |
| Inspector | 360px default, 320–480px allowed; inline-end; nonmodal while sufficient content width remains |
| Dashboard | Maximum 1440px; 12-column grid with 24px gaps; focus on actionable lists and trends |

These widths are rem equivalents. Dashboards SHOULD use at most four small summary metrics before detailed evidence. A metric includes label, value, period, and comparable change when valid; it does not need a large decorative card. Trend semantics depend on the measure: rising expenses are not automatically green.

Detail views use heading/status/owner first, then domain-specific sections, with related records linked. A selected list row may open an inspector; it MUST also have a stable detail route. Inspectors MUST NOT obscure required financial totals or confirmation context. Audit evidence and operational activity MUST be separately named even if they share a timeline primitive.

## 23. Responsive Design

Breakpoints describe available CSS viewport space, not device identity. Component containers may stack sooner to protect their minimum readable widths.

| Range | Shell and gutters | Content behavior |
| --- | --- | --- |
| Narrow: below 768px | Sidebar becomes a modal navigation drawer; 16px gutters; header grows if text requires it | One content column; full-width fields; wrapped toolbars; inspectors become routes or full-screen dialogs |
| Medium: 768–1199px | Collapsed 64px rail by default; expandable navigation drawer; 24px gutters | Forms can use two columns only when each has at least 240px; details usually stacked |
| Wide: 1200–1599px | Expanded 240px sidebar; 24px gutters | Split view only when primary width remains at least 560px |
| Extra-wide: 1600px and above | Expanded sidebar; 32px gutters | Apply page maxima; data pages may use remaining width |

The user MAY collapse wide navigation. Medium navigation MUST not automatically consume 240px of work area. Below 768px the page title becomes 20/32 while retaining weight 600; all other type roles retain their scale. Overlay padding becomes 16px. Footer actions wrap at an 8px gap without changing DOM order; if stacked, secondary precedes primary, leaving the commit action at block-end.

At 320 CSS pixels and at 400% browser zoom, shell, forms, and ordinary prose MUST reflow without page-level horizontal scrolling. Genuine two-dimensional tables, timelines, and charts MAY scroll inside a labeled region with an obvious overflow cue and a simpler accessible representation. Do not hide critical columns solely to fit a viewport. Mobile keyboards and safe-area insets MUST not cover the focused field or commit action; use dynamic viewport sizing and scrollable dialog bodies.

## 24. RTL and Bidirectional Architecture

### 24.1 Root direction and layout

The Arabic root is `lang="ar"`, `dir="rtl"`; English is `lang="en"`, `dir="ltr"`. Direction MUST be set in markup before the interface appears. CSS direction alone is insufficient for semantics and third-party keyboard behavior. All portals MUST inherit or receive the current language, direction, theme, and density.

Spacing, anchoring, borders, rounding, and text alignment MUST use inline/block concepts. Sidebar is inline-start, inspector inline-end, field label text start-aligned. Avoid `row-reverse` or CSS `order` to compensate for incorrect DOM order. The reading, visual, tab, and screen-reader sequence MUST agree.

| Element | Arabic/RTL behavior |
| --- | --- |
| Page title/actions | Title at inline-start, primary actions at inline-end; wrap without reversing source order |
| Breadcrumb | Ancestors to current item in logical reading order; separator points inline-end |
| Pagination | Previous points inline-start, next inline-end; numeric text keeps internal number order |
| Menus | Text starts at inline-start; icon before label, shortcut/submenu indicator at inline-end |
| Drawer | Navigation enters from inline-start; inspector from inline-end |
| Dialog | Centered; title starts inline-start; close at inline-end; body follows root direction |
| Table | First logical column at inline-start; selection then record identity; row actions at inline-end |
| Switch | Off thumb at inline-start, on at inline-end; semantic on/off independent of physical position |
| Step progress | First step at inline-start; progression toward inline-end; numbered text isolated |
| Determinate progress bar | Fills from inline-start; value remains a normal numeric run |
| Vertical timeline | Axis at inline-start; chronology stated, normally latest first for activity |
| Horizontal workflow timeline | Stages run inline-start to inline-end; explicit names and dates |
| Plot/time axis | Section 37 quantitative coordinate convention, not a global CSS flip |

### 24.2 Keyboard direction

Tab follows DOM order; it MUST NOT be manually reversed. In horizontal tabs, segmented choices, calendar rows, and spatial grids, ArrowLeft moves to the visibly adjacent item on the left and ArrowRight to the right. This means logical next in RTL is usually ArrowLeft. Vertical arrows retain up/down meaning. Home moves to the first logical item; End to the last. Submenus open toward inline-end and close toward inline-start, with collision placement independent of logical ownership. Native text-editing keys MUST NOT be intercepted or reversed.

### 24.3 Isolation and mixed strings

Known LTR runs—emails, URLs, phone numbers, technical IDs, code, ISO dates—MUST have LTR direction and bidi isolation. Unknown user names, record titles, and filenames MUST be isolated with `bdi`/`dir="auto"` rather than having their direction guessed from the application locale. Paragraph-level user prose may use `dir="auto"` independently. These choices follow [W3C bidi markup guidance](https://www.w3.org/International/articles/inline-bidi-markup/).

Construct localized messages with placeholders, never ad hoc string concatenation. Isolate each substituted value; punctuation belongs to the surrounding localized sentence unless part of the value. A phone number includes its plus sign in the isolated run. A numeric amount includes its sign, decimal/grouping separators, and formatted currency unit as a complete formatted unit. Do not reverse strings, insert visible spacing to “fix” punctuation, or store layout-direction marks in canonical IDs.

| Synthetic specimen | Required handling |
| --- | --- |
| `المشروع: VX-2026-014` | Arabic sentence; isolated LTR ID; colon remains part of Arabic label |
| `تم إرسال الدعوة إلى user@example.test` | Isolated LTR email with unambiguous copy behavior |
| `ملف الحملة Campaign-v2.pdf` | Isolate whole filename; retain extension and internal order |
| `الهاتف: +90 555 010 0200` | One LTR phone run; localized label outside |
| `التقدم: 37.5%` | Localized formatted percent unit isolated; never mirror digits |
| `الرصيد: -1,234.50 USD` | Entire signed amount/currency run isolated; amount copy is exact |
| `إصدار (v2) — مشروع تجريبي` | Isolate the Latin version inside surrounding punctuation |

Truncation occurs at the logical end of a displayed run. For filenames, preserve the extension using a dedicated filename pattern; full value must be available through focus/tap disclosure and copy. Do not split a grapheme cluster or Arabic joining sequence. Suspicious bidi controls in identifiers MUST be represented safely in privileged inspection views without silently rewriting the stored value.

### 24.4 Numbers, money, dates, and time

- V1 presentation default is Gregorian calendar, Latin digits (`latn`), and 24-hour time in both languages. Arabic month/day names and sentence pluralization are localized. Explicitly configure these choices; do not inherit a workstation's numbering/calendar defaults. No separate numbering/calendar preference UI is required by this decision.
- Arabic decimal digits (`٠١٢٣٤٥٦٧٨٩`) and Persian digits (`۰۱۲۳۴۵۶۷۸۹`) MUST be accepted in numeric input and normalized through the shared parser. Accept an unambiguous locale decimal separator; reject ambiguous grouping instead of guessing. Values remain exact domain representations.
- Currency is always explicit. Financial tables use ISO currency codes in their heading or each amount; mixed currencies require codes per row and separate totals. Use a shared locale formatter with the domain's precision/rounding rules, never binary floating-point conversion of exact money strings. Negative values retain a visible minus; red alone is insufficient. Zero is not “missing.”
- Amount cells align to the column's inline-end; their inner numeric runs are isolated. Decimal precision is consistent within a currency column. Never crop significant digits or show only a tooltip for full transaction amounts.
- Date-only fields remain dates, without timezone conversion. Display as an unambiguous localized day + month name + year, such as `22 سبتمبر 2026`. Technical inspection may additionally show isolated `2026-09-22`.
- Instants display in an explicitly selected user timezone, otherwise the organization-configured timezone. No timezone is invented here. If neither is available, display UTC with a visible UTC label. Audit and cross-zone operational views MUST expose the zone/offset and exact timestamp, even when a relative summary is shown.
- Future local schedules include their IANA timezone. Day boundaries, overdue state, business week/weekend, and due-date authority remain domain-owned. Calendar first weekday MUST use organization configuration; until provided, ISO Monday is the visible UI fallback, not a declaration of working days.
- Relative time is supplementary. Hover/focus/tap disclosure exposes the exact timestamp, while critical audit evidence displays it directly. Date range filters name their timezone and inclusive/exclusive meaning according to the API contract.

## 25. Accessibility

The release target is **WCAG 2.2 Level AA** across the supported application experience. Palette checks alone do not establish conformance. The shared UI MUST support meaningful names, roles, values, relationships, and keyboard operation; use native semantics before ARIA. Interaction design MUST align with the relevant [WAI-ARIA Authoring Practices patterns](https://www.w3.org/WAI/ARIA/apg/patterns/), with the explicit Vertex RTL rules above.

- Headings and landmarks provide navigation; visible labels are included in accessible names. Labels MUST NOT be replaced by placeholders or tooltips. Field help and error messages are programmatically associated.
- Status, sorting, selected rows, required fields, and validation MUST have text or shape cues as well as color. Unread notifications require an accessible unread state, not only a dot.
- Keyboard users can reach and perform every action. No positive tabindex, hover-only essential UI, drag-only action, or focus trap outside a modal.
- Text remains usable at 200% resizing, with increased text spacing, fallback fonts, and long translations. Zoom and browser font preferences MUST NOT be disabled.
- Coarse/fine pointer targets follow Section 14. Dragging, reordering, resizing, chart hover, and calendar selection require keyboard and single-pointer alternatives.
- Tooltips/hover cards remain dismissible, hoverable, and persistent while the user interacts. Escape dismisses the highest active nonblocking layer without losing the surrounding task.
- Modal overlays require an accessible name, deliberate initial focus, inert background, contained Tab navigation, and focus restoration. Do not mark nonmodal inspectors as modal.
- Dynamic feedback uses one announcement per meaningful change. Use polite status messages for normal updates and assertive alerts for immediate blocking failures; do not make entire tables live regions.
- Avoid automatic expiry for messages containing required actions. Session-expiry UX follows security policy and offers explanation/re-authentication; it MUST NOT collect credentials inside Vertex.
- User-provided media previews require appropriate text alternatives; video with meaningful audio needs captions when a supported workflow presents it as content. UI decorative icons are silent.
- Forced colors, reduced motion, keyboard-only use, and Arabic screen-reader output are first-class acceptance cases.

WCAG minima are supplemented by Vertex's stricter control sizes, ring geometry, and full-focus visibility policy. Any accessibility exception requires a specific, reviewed remediation plan; an upstream primitive's accessibility claim is not evidence that its composition is correct.

## 26. Component Architecture and Public API Philosophy

### 26.1 Responsibility and composition

Primitives MUST expose semantic HTML, accessible relationships, controlled state where needed, and approved variants. Complex structures SHOULD use small compound parts with a documented anatomy: trigger, content, title, description, actions. Simple native inputs SHOULD remain simple; do not require a compound tree to render a text field.

Prefer explicit slots for leading icon, trailing action, description, and content when the slot has a stable role. Slots MUST NOT bypass focus behavior, nesting validity, target sizes, or styling ownership. No universal “render anything” control, arbitrary element substitution, or Boolean prop combinations such as primary + danger + subtle + raised.

| Concern | Contract |
| --- | --- |
| Actions | `variant`: primary, secondary, ghost; `intent`: default or danger where supported |
| Sizing | `size`: small, medium, large; medium maps to current density; small allowed only in specified contexts |
| Feedback | `tone`: neutral, info, success, warning, danger; domain enum mapping remains outside primitive |
| State | Native disabled/readOnly/required where available; open, checked, selected, expanded only for appropriate semantics |
| Async | Explicit pending state and text; primitive does not infer it from a Promise |
| Direction/theme | Inherit the root; do not expose per-button theme or direction props |
| Accessibility | Native attributes forwarded safely; names and relationships cannot be suppressed by a slot |
| Styling | Component owns internal visual styles; caller may size/place its outer box with approved layout utilities |

Invalid variant combinations MUST be excluded or rejected. Danger is supported by filled primary and quiet ghost actions; a gold “brand” button variant is not approved. Links are a distinct semantic action even if they share visual sizing.

### 26.2 State model

An input may be controlled with value/checked and a change callback, or uncontrolled with a default value/checked. It MUST NOT switch modes during its lifetime or accept conflicting controlled/default inputs. Empty values, clearing, and change reasons MUST be documented. Overlay open state follows the same rule. Controlled owners decide whether a requested close proceeds, enabling dirty-state protection.

Refs and native form participation MUST remain available. Components MUST not copy server state into a second hidden authoritative state or silently commit on blur. Identity is stable across sorting and filtering. Focus and selection are not reconstructed from DOM position.

### 26.3 Styling ownership

Semantic color/type/layout utilities are permitted for feature composition. Features MUST NOT target component internals, supply replacement token maps, use arbitrary hex/spacing classes, or add dark overrides around shared controls. Feature-specific domain layouts may compose shared spacing and grid roles; new shared behavior returns to the system through governance. Escape hatches require documented scope and an expiry, not an undocumented className bypass.

## 27. Component Catalog

This catalog defines expected capabilities, not a requirement to implement every component before the first feature. Shared rules in Sections 13–26 apply to every family.

| Family | Components and anatomy | Required distinctions |
| --- | --- | --- |
| Actions | Button, IconButton, ButtonGroup: label, optional icon, pending indicator | Primary commits; secondary alternatives; ghost tertiary; grouped controls retain individual names and focus |
| Field structure | Field, Label, Description, ErrorMessage, Fieldset/Legend | One stable input ID; description/error relationships; group labels are real legends |
| Text entry | Input, Textarea, SearchInput | Visible label; clear action named; search clear does not submit; textarea preserves line breaks |
| Choices | Select, Combobox, Checkbox, Radio, Switch | Select fixed options; combobox search; checkbox independent/multiple; radio exclusive; switch immediate reversible setting |
| Structured entry | DateInput, TimeInput, NumberInput, MoneyField pattern | Parsing separate from formatting; exact value/currency and date semantics owned outside primitive |
| Navigation | AppSidebar, SidebarItem, Header, Breadcrumb, Tabs, Pagination | Links for destinations, tabs for panels, current location explicit |
| Data | Table, DataTable, DescriptionList/KeyValue, Badge, StatusIndicator, Avatar, Metric, Surface | Table semantics preserved; KeyValue is composition over description list, not a second competing pattern |
| Disclosure | Accordion, Disclosure, SegmentedControl | Disclosure reveals content; segmented control changes one setting; navigation must use tabs/links |
| Overlays | Dialog, AlertDialog, Drawer, Popover, DropdownMenu, ContextMenu, Tooltip | Modality and focus behavior explicit; a tooltip never contains actions |
| Feedback | Alert, Toast, InlineMessage, Spinner, Progress, Skeleton, EmptyState, ErrorState | Duration and announcement reflect impact; loading is not a status success |
| Work patterns | PageHeader, FormSection, TableToolbar, FilterBar, BulkActionBar, RecordHeader, Inspector, ActivityList | Compose primitives; no hidden domain logic |
| Operational content | FileItem, UploadField, VersionList, CommentComposer, CalendarView, TimelineView | Available only with approved workflows; preserve status, author/version context, alternate non-drag navigation |

Avatar sizes are 24, 32, and 40px; default 32px. Use a neutral fill with initials from grapheme-aware parsing or a generic person glyph; do not assign arbitrary user-specific colors. Avatar names remain readable nearby. Presence dots exist only if real presence data exists.

Badge is a short classification, not an action. StatusIndicator adds a meaningful icon and domain label; it never becomes a colored enum with no explanation. Surface provides containment only; it does not acquire hover, pointer cursor, or elevation by default. Metric communicates units and period; no fabricated percentage change when the comparison is undefined.

Operational content follows the same system:

- FileItem shows filename, type/size when known, version, and real transfer/processing state. UploadField provides a native file-picker action as well as an optional drop target, displays domain-provided file/size limits before selection, and separates transfer progress from processing/acceptance. Removing a queued file, cancelling an active upload, and deleting a stored asset are different actions with different consequences. Failures retain per-file context and a safe retry path; preview content is untrusted.
- VersionList shows version identity, author, time, and review/approval outcome separately. A preview or download always identifies the selected version. Historical approval MUST NOT visually transfer to a newer unreviewed version.
- CommentComposer uses a visible label, explicit submit, pending/error preservation, and shared mention-combobox behavior when mentions exist. Enter inserts a newline; an optional modified-Enter shortcut may submit only when advertised. Render user content safely; do not store a private browser draft without domain/security approval.
- CalendarView and TimelineView show named dates/stages and current filters, offer list/detail alternatives, and provide a form-based way to change scheduling or order. Dragging is an optional shortcut with explicit confirmation where consequences require it. Collision, overdue, and dependency semantics come from the owning module.

## 28. Forms

### 28.1 Structure and data entry

Labels sit above controls, aligned inline-start. Help follows the control; error follows help or replaces only help that is no longer useful. Placeholder text is optional example content. Group related fields under a section title and concise explanation. Use Fieldset/Legend for choice groups. Most forms use one column; closely related short fields may share two columns when each retains 240px minimum width.

Required fields have a visible `*` and a form-level localized explanation; the symbol is decorative to screen readers because required is programmatically exposed. Optional fields use `اختياري` only where mixed requirements would be unclear. Do not duplicate “required” text on every required field. Name, purpose, autocomplete, and input mode MUST match the value type. Browser autofill and paste remain available.

Use native text/email/url/tel controls where appropriate. For money, identifiers, and precision-sensitive numbers, prefer text input with an appropriate input mode and shared parser over browser spinbuttons that may alter values or impose floating-point conversion. A genuine bounded numeric stepper must expose min/max/step and accessible increment/decrement actions. Scrolling the page MUST NOT silently change a financial value.

Dates permit keyboard text entry with a visible format example and optional calendar picker. A calendar opens focused on the current value or today, supports arrow-day navigation, PageUp/PageDown month navigation, Home/End within the configured week, Enter to select, and Escape to close. Disabled dates are explained when relevant. Month/year choice must be efficient for distant dates. Time entry supports 24-hour hours/minutes and states the timezone when applicable; text entry remains usable without the picker. Selecting a date MUST NOT unexpectedly submit the form.

### 28.2 Choice controls

Select SHOULD use native HTML for a short, simple single choice. Combobox is used when searching a substantial option set is necessary; show loading, no results, and query failure as distinct states. Options have stable IDs; active option, selected option, and input text remain distinct. Clearing does not select the first option. Querying is bounded, handles input composition, and ignores stale results. Multi-select uses a named removable list of choices plus search, not an ever-growing line that pushes the form off-screen.

Checkboxes suit values committed with the enclosing form. Radios show a small exclusive set. A Switch means an immediate, reversible setting change with visible pending/error recovery; security-sensitive access changes MUST NOT be one-click switches. Permissions are grouped checkboxes with a clear mixed group state and an explicit review/save step, governed by IAM.

### 28.3 Validation

Validate on submit, and on blur after a meaningful edit. Do not show errors for untouched empty fields on initial render. Once an error is visible, revalidate while correcting it without announcing every keystroke. Server validation is authoritative and may add errors beyond the client schema.

On failed submission, preserve values, render an error summary at the form start, and focus it when multiple/global errors exist; link each entry to the field. For a single local error, focus that field and expose its associated message. Use `aria-invalid` only while invalid. Unknown server failures get a form-level message and safe reference, never a stack trace. Hidden/collapsed fields with errors MUST be revealed before focus moves to them.

### 28.4 Save, cancel, dirty state

- Default is explicit save. Footer actions are `حفظ التغييرات` and `إلغاء`; primary sits at inline-end, secondary immediately before it in logical order. Create flows use a specific creation verb.
- Save is available for attempted validation; do not disable it solely because untouched required fields are empty. Save MAY be disabled when there are no changes, with the reason evident.
- On submit, preserve the label width, show `جارٍ الحفظ…`, mark the form busy, and prevent duplicate submission. Fields included in the request become temporarily noneditable or the feature explicitly tracks subsequent edits as a separate revision. Never mark later edits saved by an earlier response.
- Cancel from a dirty form offers `متابعة التحرير` and `تجاهل التغييرات`. The safe choice receives initial focus. Route changes and overlay dismissal use the same guard. Browser unload uses the browser's native guard where supported; do not promise recovery that cannot be guaranteed.
- Autosave is limited to low-risk draft prose or reversible preferences with a defined concurrency contract. Show saving/saved/failed state. It is prohibited for permissions, access changes, financial posting, approvals, and contractual commitment.
- Keep unsaved content in current memory where permitted. Do not persist business drafts, financial data, or authentication state in browser storage merely to implement recovery. Server drafts require an approved domain capability.

### 28.5 Conflicts and uncertain outcomes

A stale-write conflict MUST preserve the user's draft and show that the record changed. Offer `عرض التغييرات` and a deliberate reload/reapply flow comparing relevant fields. No silent overwrite or generic automatic retry. If the API has no merge capability, show a read-only comparison and allow copying/re-entering changes against a refreshed version.

A network timeout after submission may mean the operation succeeded. Present “result not yet confirmed,” preserve context, and reconcile through the owning feature before enabling a duplicate financial or privileged action. Shared primitives do not implement idempotency; they display its domain outcome. A form MUST NOT report success from a client-only optimistic calculation.

## 29. Tables and Data-Dense Interfaces

### 29.1 Structure and layout

DataTable composes a semantic HTML Table with sorting/filtering/selection state. TanStack Table is the architectural direction; it does not automatically supply accessible rendering. The current web dependencies do not yet contain it. Ordinary record lists MUST NOT use `role="grid"` merely because cells contain controls. Reserve an interactive grid for a demonstrated spreadsheet-like editing need with a complete keyboard model.

Use `type.body` for values, `type.table-heading` for headings, and Section 14 geometry. Headers use subtle background and secondary text, with sentence-case labels. Cells align to inline-start; numeric measure cells align to inline-end. Dates are consistent within their column. Use a record name/link as the row's primary identity. Full values that determine an action—amount, currency, target identity, access state—MUST NOT be hidden by ellipsis.

Selection is the first logical column, record identity next, data columns after, actions last. A status column uses a label plus icon rather than filling the entire row with color. Row hover uses quiet hover fill only when the row has interactive content; selected fill persists and changes to selected hover. Selection also has a checked box, so color is redundant. No zebra striping by default.

### 29.2 Sorting, filtering, and search

- A sort button appears inside a header. Default cycle is unsorted → ascending → descending → unsorted unless the feature requires an explicit default sort. Expose `aria-sort` on the active single-sort header. Announce direction. Multi-sort is allowed only through explicit controls showing precedence and a clear reset.
- FilterBar contains search, named filters, active removable filters, and clear-all. A small number of filters apply immediately; a complex filter panel uses Apply/Reset. Do not mix commit models within one panel.
- Text search uses a 300ms debounce, respects IME composition, supports Enter for immediate search, cancels/ignores superseded requests, and preserves focus. This delay is interaction behavior, not an animation token. Clearing search refreshes results and announces the new count.
- Sort/filter/page state SHOULD survive detail navigation and Back. URL state may hold non-sensitive filters; personal/sensitive queries MUST NOT be placed in URLs by default. Use safe in-memory navigation state when appropriate.
- Distinguish no records from no matching results, with permission-aware creation or filter-clear actions. A failed query is never an empty result.

### 29.3 Selection and bulk actions

Each row checkbox name includes its record identity. The header checkbox selects eligible rows on the current page only; mixed state reflects partial selection. The UI explicitly says how many are selected and in what scope. “Select all matching results” is a separate, explicit action allowed only when the backend supports a stable query-wide selection contract. Never infer it from a page checkbox.

Explicit ID selection MAY persist across pages, with a count of off-page selections. Changing query/filter context clears selection and announces it; sorting preserves explicit IDs. Query-wide selection is invalidated when its query changes. Unauthorized or ineligible rows explain unavailability without exposing hidden details.

The BulkActionBar replaces the toolbar's action region without shifting the table header, states selection count, offers clear selection, and shows only meaningful operations. Bulk destructive confirmation names the scope and expected impact. Partial outcomes list successes/failures by authorized record and allow safe retry of failed items; no blanket success toast.

### 29.4 Columns, scrolling, and pagination

Column resizing is optional for wide data workspaces. Minimum widths: selection 48px, primary identity 200px, ordinary text 144px, amount 144px, status 160px, actions 48px. Values may force wider columns; these are not truncation permissions. Resizers provide keyboard increments of 8px plus reset; pointer dragging has an equivalent named width control. Column hiding is user-managed only for optional data, with a restore-defaults action.

Use sticky headings inside a bounded table scroll region, or under the shell header on document-scrolling lists, never conflicting sticky stacks. The identity column MAY stick at inline-start together with selection; the actions column sticks at inline-end only when it does not obscure cells. Sticky backgrounds are opaque and their total width cannot consume the narrow viewport. On small screens keep at most the primary identity column sticky, or remove stickiness.

Default page size is 25; options are 25, 50, and 100 where the API supports them. Preserve page size preference without storing row data. Show range and total only when the server knows the total; cursor pagination uses Previous/Next and must not fabricate page counts. After deletion or filtering, move to a valid page and announce the result. Background refresh retains existing rows with a small updating message instead of flashing the entire skeleton.

Horizontal overflow remains within a named, keyboard-scrollable region. On narrow screens an equivalent summary list MAY show identity, status, owner, deadline/amount as relevant, with a labeled detail route exposing every remaining field. Maintain access to the complete table. Hidden critical data cannot be “solved” by a mobile card.

### 29.5 Keyboard and large data

Ordinary tables retain browser table navigation and Tab only through actual links/buttons/checkboxes. The primary record link supports opening a new tab. Row actions have visible or focus-revealed controls, remain discoverable on touch, and use names such as `إجراءات المشروع التجريبي`.

An approved editable grid has one roving cell focus, spatial arrow navigation, Home/End within a row, Ctrl+Home/End for grid bounds, Enter/F2 to edit, Escape to cancel cell edits, and an explicit commit contract. Text editing MUST retain native arrow behavior while in edit mode. Stable row/column IDs, total counts, selection announcements, and focus restoration are mandatory. Drag selection is optional and never the sole method.

Pagination is the default performance strategy. Virtualization requires measured need and proof that focus, screen-reader row indices, row height changes, selection, and return navigation remain correct. Do not render every hidden row solely for assistive technology or claim totals the backend did not provide.

## 30. Navigation

Sidebar grouping follows work areas rather than exposing every internal module. The baseline groups are: personal work; commercial work (CRM/services/sales); delivery (projects/tasks/briefs/assets/approvals/content/time); finance; reports; administration. Features own the exact available destinations. Empty groups and unauthorized destinations are omitted without revealing protected counts. No third-level permanent sidebar tree; deeper context uses detail navigation.

Breadcrumbs describe hierarchy, not browsing history. The current item is text with `aria-current="page"`; ancestors are links. On narrow screens collapse middle ancestors into a named menu while preserving the nearest parent and current identity. Keep a visible parent/back route when context requires it.

Tabs switch related panels with one tab stop and arrow navigation; automatic activation is appropriate only when content is already available without noticeable delay. Otherwise Enter/Space activates the focused tab. Routing destinations styled as tabs remain links with current-page semantics. Underline tabs use a 2px selected indicator and no pill enclosure; their minimum height is the navigation item size.

DropdownMenu contains actions; Popover contains arbitrary contextual content; Select/Combobox chooses values. Do not use menu roles for a form or navigation list. Menus support Up/Down, Home/End, Enter/Space, Escape, and typeahead including Arabic. Destructive items are separated at the end, named explicitly, and use danger text. ContextMenu MUST have the same operations reachable through a visible menu button; right-click/long-press is supplementary.

Search defaults to the current work area with scope in its label. A future global search must separate result type, identity, and destination and respect server authorization; no new search infrastructure is implied. Keyboard shortcuts MUST have a discoverable equivalent control, avoid browser/assistive-technology conflicts, and never trigger from ordinary typing. Single-character shortcuts are off by default.

## 31. Overlays

### 31.1 Geometry and choice

| Component | Geometry | Use |
| --- | --- | --- |
| Dialog / AlertDialog | 480px preferred maximum inline size; 640px for a justified structured form; viewport minus 32px minimum margin budget | One focused task or deliberate confirmation |
| Modal Drawer | 480px preferred, 640px maximum, from logical edge; full viewport width below 768px | Contextual multi-section task too large for a dialog |
| Nonmodal Inspector | Section 22 widths; no scrim | Read/inspect while keeping list usable |
| Popover | 320px preferred, 480px maximum; 8px trigger gap, 8px viewport collision padding | Filters and contextual controls |
| DropdownMenu / ContextMenu | 224px preferred; 192–320px range; wrap long labels | Short action list |
| Tooltip | 280px maximum; 8px trigger gap; 4px block/8px inline padding | Supplemental concise explanation |

Dimensions are rem equivalents with viewport clamping. Dialogs use raised background, overlay radius, and modal shadow; menu/popover use surface radius and floating shadow; tooltip uses raised background, primary text, and control radius. All have default borders. Header/body/footer share the same inline padding. Body scrolls when required while title and actions remain reachable; max block size is dynamic viewport minus 32px, except full-screen narrow drawers. No essential content outside a scrollable body.

Use a route for long, linkable, multi-step work. Do not build a full administrative application inside a dialog. One modal task at a time; a temporary confirmation of that task MAY replace its body while preserving the draft, instead of stacking another modal. A combobox/menu inside a modal is an owned popup, not a second modal task.

### 31.2 Focus, dismissal, and ownership

Dialogs have a visible title. Short routine forms initially focus the first meaningful input; long content initially focuses its heading; dangerous confirmation focuses the safe action. Modal Tab/Shift+Tab stays within active content, background is inert, and close restores focus. Screen-reader descriptions MUST be concise; do not flatten a long structured form into one giant description.

Escape closes the topmost popup first, then the parent modal on a subsequent press. A clean ordinary dialog/drawer may close on outside click. Dirty forms guard every dismissal path. AlertDialog does not close on outside click; Escape performs the safe cancel action. A pending non-cancellable operation may temporarily defer closure with a visible explanation, but MUST offer a route out once the outcome is resolved or the waiting view can safely detach. Closing a view MUST NOT falsely imply cancelling a server operation.

Nonmodal popovers do not trap focus; Tab proceeds naturally and closes transient content when focus leaves it, unless an explicit nonmodal task pattern requires persistence. An interactive popover needs a name and appropriate semantics; a positioning wrapper alone is not a dialog. Positioning collisions may change the physical side without changing source order, RTL behavior, or focus ownership.

Tooltips show after 500ms pointer dwell or immediately on keyboard focus, remain while hovered/focused, dismiss on Escape, and contain no actions. A second tooltip within an active tooltip group may open immediately. On touch, required information must be inline or available through an explicit help control. A disabled button's reason MUST NOT rely on its tooltip.

## 32. Feedback

| Pattern | Placement | Lifetime and announcement |
| --- | --- | --- |
| InlineMessage | Beside the relevant field/action | Persists while relevant; error relationship or polite status |
| Alert | At affected form/section start | Persists until resolved/dismissed when safe; blocking failures announced once |
| Page banner | Below shell/header, above page content | Shared service/session issue; does not cover navigation |
| Toast | Viewport block-end, inline-end, 24px inset or 16px narrow | Optional confirmation only; polite announcement; no focus theft |
| Progress | Within the affected operation | Named value/range or indeterminate status; completion acknowledged |

Toast width is 360px maximum and viewport minus 32px on narrow screens. At most three are visible; repeated events coalesce rather than stack indefinitely. A nonessential success toast MAY dismiss after 6 seconds, pausing while hovered, focused, or the document is hidden. Toasts containing an action, error, uncertain outcome, or information unavailable elsewhere MUST persist until dismissed or resolved. Critical outcomes belong in the task context, not exclusively in a toast. Interactive toasts are suspended while an unrelated modal makes their context inert.

Success text confirms what happened: `تم حفظ التغييرات`. Error text states what failed and the next safe step. Do not repeat the same message as both an assertive alert and a live toast. Cosmetic copy actions can use a brief nearby polite status. A successful destructive action SHOULD update the record/list and leave a readable outcome; undo exists only when a real supported reversal exists.

## 33. Status System

Tones are global presentation categories, not domain state machines. Each module MUST maintain an explicit mapping from its canonical states to a shared tone, Arabic/English label, and icon. Unknown states use a neutral “unknown status” label and a diagnostic path; they MUST NOT be silently classified as success.

| Meaning | Tone | Redundant cue | Rule |
| --- | --- | --- | --- |
| Active / enabled | success | Check-circle + label | Does not imply permission to every operation |
| Complete / approved | success | Check + precise label | Completion and approval remain different domain values |
| Inactive / draft | neutral | Circle/minus + label | Do not dim the record |
| Pending / queued | info | Clock + label | Ordinary waiting is not a warning |
| In progress | info | Progress/working icon + label | Use spinner only for actual short pending work |
| Attention / overdue | warning | Triangle + label | Requires attention but is not necessarily a failure |
| Temporarily blocked | warning | Pause/lock + reason | Use danger only for a failed or critical condition |
| Error / failed | danger | Error-circle + label | Failure with recovery path |
| Disabled access | danger | Lock + explicit access label | A domain access condition, not a disabled UI control |
| Archived / terminal historical | neutral | Archive + label | Preserve readable history |
| Destructive action | danger action intent | Named verb and consequence | Action treatment, not a persisted status |

IAM-specific baseline from [its specification](modules/iam.md): INVITED → info/`مدعو`; ACTIVE → success/`نشط`; SUSPENDED → warning/`موقوف مؤقتًا`; DISABLED → danger/`معطّل`; TERMINATED → neutral/`منتهي الوصول`. Provisioning PENDING → info/`بانتظار المزامنة`; SYNCED → success/`تمت المزامنة`; FAILED → danger/`فشلت المزامنة`. Access and provisioning MUST be separately labeled. Invitation delivery failure is a third operational outcome with its own message and authorized resend action; it MUST NOT imply that identity creation was rolled back.

Do not color every project stage differently. Stages such as proposed, contracted, or in review remain neutral/info unless the domain's actual condition requires success, warning, or danger. Deadline, risk, and lifecycle state may coexist as separately labeled facts. A task's “complete” badge does not automatically mean its project is complete.

## 34. Loading, Empty, Error, and Stale States

| Condition | Required presentation |
| --- | --- |
| Initial load | Keep shell and heading; show a correctly shaped skeleton after 150ms if no content is ready; mark only affected region busy |
| Short action pending | Immediate button/field busy state; width stable; duplicate activation prevented |
| Background refresh | Keep authorized stale content; show updating status; do not replace it with a full skeleton |
| Long operation | After 10 seconds show that work is still pending and any real recovery/cancel option; do not invent percentages |
| No records yet | Short title, purpose, and one permitted first action |
| No filter matches | Retain query/filters; offer clear filters; do not offer unrelated setup |
| No permission | Clear access-limited message and allowed navigation; do not reveal protected record names/counts |
| Signed out / session expired | Sign-in action via backend flow; explain safe recovery; no Vertex password/MFA fields |
| Record not found | Safe explanation and parent destination; respect API policy on existence disclosure |
| Load failure | Explain affected scope; retry read safely; retain existing content only if still authorized |
| Mutation failure | Preserve input/selection and show actionable error in context |
| Uncertain mutation result | Reconciliation state; no immediate duplicate financial/security action |
| Offline | Persistent connectivity message; existing data identified as potentially stale; no unsupported offline write queue |

Skeletons match the expected row/field structure and are hidden from screen readers; one localized loading message names the region. Never show fabricated amounts, statuses, or user names in skeletons. Transition immediately when content arrives; no minimum artificial wait. Show determinate progress only with a real denominator; announce progress at meaningful intervals rather than every percentage point.

Read retry MAY be automatic and bounded by the owning feature's data policy; mutation retry is never inferred by a shared ErrorState. A 401 is not an empty dataset, and 403 is not a network error. On permission loss or logout, protected stale data MUST be removed according to security policy. An error-state retry button remains keyboard accessible and does not reset unrelated work.

## 35. Dangerous and Destructive Actions

Routine reversible actions use direct feedback; dangerous, security-sensitive, financially significant, or irreversible actions require deliberate review where the domain mandates it. The UI MUST not add frivolous confirmation to every interaction.

A confirmation MUST show the specific action, exact target identity, scope/count, material consequences, and reversibility. Financial commitment review includes exact amount and currency. Initial focus goes to the safe choice. Action labels say `تعطيل المستخدم`, `إلغاء الاعتماد`, or the actual supported operation, not `نعم` or `موافق`. Danger fill is reserved for committing harmful/destructive consequences; privilege grants can use primary fill with a clear warning and explicit confirmation.

IAM requires confirmation for suspend, disable, terminate, revoke sessions, adding/removing System Administrator, role-permission edits, role deactivation, and department deactivation affecting scope. The reason field is offered where IAM supports it; it MUST NOT block urgent security revocation. User termination preserves the record and MUST NOT be presented as hard deletion or offer an unsupported restore.

Typed-name confirmation SHOULD NOT be routine; it may be justified for a large irreversible bulk action when it materially reduces risk, with paste and assistive technology support. Re-authentication, if required, follows the existing backend/Keycloak flow. A second password prompt inside Vertex is forbidden.

After confirmation, show pending and reconcile actual results. Backend authorization or concurrency rejection is explained without discarding context. “Undo” MUST correspond to a valid backend capability, time window, and known outcome; removing a toast cannot undo a mutation.

## 36. Notifications

Notification UI distinguishes unread, read, actionable, and failed-to-load states. It displays a meaningful title, subject, time, and destination without exposing unauthorized details. An unread dot is accompanied by an accessible unread label; counts above 99 may display `99+` while the accessible name states the known count.

Opening a notification or explicitly marking it read changes read state; merely scrolling past it does not. “Mark all read” names its scope. Notification navigation lands at the relevant record/section and handles removed or inaccessible targets gracefully. Notification failure MUST NOT block unrelated work.

Group repeated events by subject only when no important decision or distinct outcome is lost. No default sound, browser notification request, or persistent animation. In-app notification capability does not authorize external messaging integrations. Operational activity, notifications, and audit evidence retain their distinct purposes and permissions.

## 37. Data Visualization

### 37.1 Categorical palette

Use semantic tokens `color.chart.series.1` through `.6` in this order. Keep series identity stable across filtering, views, and themes; do not assign color by transient row position.

| Series | Light | Dark | Default line marker / pattern |
| --- | --- | --- | --- |
| 1 | `green.700` | `green.300` | Circle / solid |
| 2 | `blue.700` | `blue.300` | Square / long dash |
| 3 | `violet.700` | `violet.300` | Triangle / short dash |
| 4 | `amber.700` | `amber.300` | Diamond / dot |
| 5 | `teal.700` | `teal.300` | Cross / dash-dot |
| 6 | `red.700` | `red.300` | Plus / long-short dash |

All six Light series have at least 5.35:1 contrast against white; all Dark series have at least 6.73:1 against the raised Dark plane. This does not establish contrast between adjacent series or color-vision differentiation. Lines MUST combine color with marker/dash and direct labels where practical. Adjacent bars/segments require visible separation and labels; dense stacks that cannot be read without color MUST use another chart form or an accompanying exact table. Use at most six simultaneous categorical series; prefer small multiples for more.

Additional roles: `color.chart.axis = text.secondary`, `color.chart.grid = border.subtle`, `color.chart.background = background.surface`, `color.chart.zero = border.strong`. Grid lines are decorative; axes needed to interpret data must remain legible. Chart annotations use UI typography, never microscopic labels.

Sequential scales use three labeled bins from low to high: Light green.600/green.700/green.900; Dark green.500/green.300/green.200. Expose numeric bin limits and exact values; hue/luminance alone is insufficient. Diverging displays use blue/neutral/red with a labeled meaningful midpoint and sign/value labels; red means the named category/direction unless the chart explicitly represents danger. Gold is not a default quantitative series.

### 37.2 Chart behavior and RTL

Quantitative x-axes, including chronological time axes, increase left-to-right in both interface languages; numeric y-axes increase bottom-to-top. This is an intentional coordinate convention and MUST be communicated by visible tick labels and units. RTL mirrors the surrounding title, legend reading order, controls, and tooltip text, not the plot data or coordinate system. A process stage diagram follows RTL logical progression instead, and MUST not be confused with a quantitative chart.

Category-only ordered charts may follow logical reading order, but their first/last labels and data correspondence MUST remain explicit. Calendar grids follow the configured week order in interface direction; media timelines preserve playback convention. Never apply a transform to an entire canvas/SVG to “support RTL.”

Every chart needs a descriptive title, period, units/currency, meaningful summary, and accessible data alternative. Hover data MUST be available by keyboard focus and tap. Tooltip dismissal and focus follow the shared overlay rules. Screen readers need a concise trend summary and a navigable data table, not thousands of unlabeled point nodes.

No 3D plots, decorative gradients, truncated bar baselines, or misleading dual axes. Zero/missing/no-permission are different values. Avoid donut charts for precise comparisons. Negative values and comparisons MUST be explained. An operational dashboard MUST state data freshness, filter scope, timezone where relevant, and whether a total is partial. Financial aggregation remains backend-authoritative.

## 38. Content and Arabic UX Writing

Use concise Modern Standard Arabic. Labels name the concept; actions begin with a clear verb. Avoid translated English word order, unnecessary honorifics, gender assumptions, marketing claims, slang, and exclamation marks. Keep Arabic text naturally shaped and do not add tatweel for visual balance. English uses sentence case and the same level of precision.

Shared terminology MUST map back to [PRODUCT.md](PRODUCT.md); one concept has one approved translation. The initial interface glossary is:

| Concept | Arabic label | Distinction |
| --- | --- | --- |
| Lead | عميل محتمل | Not yet a qualified opportunity |
| Opportunity | فرصة بيعية | Qualified commercial opportunity |
| Client / contact | عميل / جهة اتصال | Organization/party versus its contact |
| Proposal / quotation | مقترح تجاري / عرض سعر | Scope proposal versus pricing statement |
| Contract | عقد | Commercial agreement |
| Project / task | مشروع / مهمة | Delivery context versus actionable unit |
| Brief | موجز العمل | Structured execution requirements |
| Asset / version | أصل رقمي / إصدار | Resource versus its revision |
| Review / approval | مراجعة / اعتماد | Evaluation versus authorized acceptance |
| Revision request | طلب تعديلات | Required changes, not final rejection by default |
| Invoice / payment | فاتورة / دفعة | Billed record versus received funds |
| Outstanding balance | الرصيد المستحق | Derived financial value |
| Activity / audit history | سجل النشاط / سجل التدقيق | Operational awareness versus accountability evidence |
| Role / permission | دور / صلاحية | Assignment grouping versus capability |

| Situation | Preferred Arabic copy |
| --- | --- |
| Save | `حفظ التغييرات` |
| Cancel edit | `إلغاء` |
| Continue after dirty warning | `متابعة التحرير` |
| Discard dirty changes | `تجاهل التغييرات` |
| Retry a safe read | `إعادة المحاولة` |
| Empty filtered list | `لا توجد نتائج مطابقة` / `جرّب تعديل عوامل التصفية.` |
| Conflict | `تغيّر هذا السجل أثناء تحريره. راجع التغييرات قبل الحفظ.` |
| Unknown save outcome | `لم نتمكن من تأكيد الحفظ بعد. جارٍ التحقق من النتيجة.` only while actual reconciliation runs |
| Session expiry | `انتهت الجلسة. سجّل الدخول للمتابعة.` |
| Access denial | `ليست لديك صلاحية لتنفيذ هذا الإجراء.` |

Errors state the problem and an actionable remedy; do not blame the user or expose implementation details. Use locale-aware plural messages for zero, one, two, few, many, and other; never concatenate an Arabic noun onto a count. Empty values use `غير محدد` or a labeled em dash as appropriate; they MUST NOT look like zero. Dates, count labels, and confirmation targets use the same shared formatters across modules.

Truncation is permitted for secondary lists with accessible full-value disclosure. Action labels, form errors, critical record identities in confirmations, and monetary values MUST wrap or receive sufficient space. Text expansion of at least 40% is a design test input, not a maximum supported translation length. Operational copy MUST describe user consequences rather than libraries, token names, API codes, or infrastructure unless a privileged diagnostic view needs them.

## 39. Base UI Adoption Rules

Base UI is an optional unstyled interaction implementation, not Vertex's public design system. Its [accessibility documentation](https://base-ui.com/react/overview/accessibility) makes clear that application composition still needs accessibility work. Its [DirectionProvider](https://base-ui.com/react/utils/direction-provider) provides component direction configuration; implementation must keep that value aligned with DOM direction, including portals.

| Prefer native / Vertex-simple | Consider Base UI behind a Vertex wrapper |
| --- | --- |
| Button, anchor, input, textarea, label, fieldset, simple checkbox/radio | Dialog/AlertDialog where focus/overlay ownership needs mature composition |
| Simple native select, progress, disclosure | Combobox or complex Select with search, active option, keyboard behavior |
| Table, description list, layout, avatar, badge, typography | Menu/submenu, Popover/Tooltip with positioning and dismissal |
| Straightforward noninteractive display | Tabs or composite controls when tested direction/focus handling reduces risk |

Adopt a primitive only when it solves a demonstrated behavioral need and passes the component's Arabic/English, keyboard, screen-reader, portal, and theme tests. A wrapper MUST own naming, slots, variants, tokens, supported states, and accessible defaults. Feature code MUST import the Vertex component, not Base UI directly. Library-specific props, DOM details, or render contracts MUST NOT become mandatory feature-level APIs.

Do not use Base UI merely to replace a native button, provide CSS identity, implement business logic, or expand the catalog speculatively. Do not combine different primitive libraries for the same interaction family without an approved replacement plan. No shadcn components, CLI, generated templates, or theme conventions are permitted, even if they internally use Base UI.

This document approves selective evaluation, not installation or a specific version. During the implementation task, verify the chosen pinned release's APIs and complete an adoption record covering need, native alternative, behavior tests, bundle impact, styling ownership, and replacement cost. A dependency with architectural impact still follows repository approval rules.

## 40. Theme Implementation Architecture

### 40.1 Root settings

One root configuration resolves **language**, **direction**, **theme preference**, **resolved theme**, and **density preference/effective density**. Theme preference is `system`, `light`, or `dark`; first-run default is `system`. Resolution is explicit preference first, otherwise system preference, otherwise Light. Arabic/RTL and Default density are first-run defaults independent of theme.

Theme applies before the first visible application paint to avoid a flash. A minimal bootstrap may read only validated UI preferences; it must follow CSP and must not read/store authentication data. The root exposes resolved Light/Dark via a data attribute and the appropriate color-scheme. System theme changes update the interface only while preference is `system`. Form editing state, focus, selection, and scroll position survive a theme change.

Language and direction are resolved together. A direction change updates every owned portal and third-party direction provider without remounting the whole application or discarding unsaved work. User-generated content retains its own bidi isolation independent of the shell.

Non-sensitive UI preferences MAY be saved locally with a versioned schema and graceful storage-denied fallback. Do not store business records, authentication, permission state, or drafts alongside them. Account synchronization is allowed only through an approved existing/future preference capability; this specification invents no endpoint. Preferences do not require a new backend service.

### 40.2 Tokens and CSS delivery

Implementation MUST establish one machine-readable token source, emitting or sharing CSS variables and any TypeScript references from the same definitions. The specification remains the intended contract; generated artifacts are not hand-edited. A discrepancy between the source and this document is a defect requiring deliberate reconciliation.

Theme scopes remap semantic aliases. Component rules consume those aliases and do not contain separate Light/Dark color implementations. Tailwind utilities reference semantic variables rather than creating a second theme map. Portals attach within a root that receives the same variables; background/foreground pair ownership survives nesting. Arbitrary nested themes are not supported; an isolated media preview uses a documented viewer surface, not a hidden alternate application theme.

Avoid runtime color mixing to invent hover/status values. Opaque approved values make contrast predictable. Browser forced-colors overrides may substitute system colors while preserving roles and boundaries. Print/export rendering uses an explicit Light presentation, omits interactive chrome, repeats table headings, and retains labels/units/status text. Printing is presentation only; generating an official financial document remains a domain workflow.

## 41. Testing Strategy

This section defines future design-system acceptance in addition to [TESTING.md](TESTING.md). Existing tests verify the technical shell, not this design system. Documentation-only delivery does not establish component accessibility or visual regression coverage.

### 41.1 Verification matrix

| Surface | Required evidence when implemented |
| --- | --- |
| Tokens | Unique names, valid types, acyclic/resolved aliases, full mode coverage, approved foreground/background contrast |
| Primitive interactions | Testing Library/Vitest tests for meaningful keyboard, focus, open/close, disabled, pending, invalid, controlled/uncontrolled behavior |
| Shared visual foundations | High-value visual baselines for controls, forms, tables, shell, and overlays in both themes and directions |
| Forms | Required/error associations, summary focus, dirty-state guard, stale-write conflict, unknown mutation result |
| Tables | Sort state, page/query selection scope, keyboard actions, overflow, sticky focus clearance, exact values |
| Overlays | Initial focus, containment, inert background, nested popup Escape, dismissal, restoration, long-content scrolling |
| Localization | Arabic shaping/diacritics, mixed strings, digit parsing, negative money, zero/missing, long labels, localized plural forms |
| Responsive | 320, 390, 768, 1024, 1440px widths; 200% text resize and 400% browser zoom; touch/coarse-pointer target sizing |
| User preferences | System/explicit themes, first paint, live change, density, reduced motion, forced colors, storage unavailable |
| Security-sensitive UX | No misleading hidden success, no lost privileged-action confirmation, access/provisioning separation, protected stale-data removal |

Use the eight core combinations of Arabic/English × Light/Dark × Default/Compact for shared specimen review. Compact tests apply to fine-pointer environments; coarse-pointer tests prove the Default override and 44px targets. Exercise critical error, loading, selected, checked/mixed, disabled, read-only, and focus combinations as well as rest state. Do not snapshot every page merely to multiply modes.

### 41.2 Visual and accessibility evidence

Visual baselines MUST load approved fonts deterministically, use synthetic data and fixed dates, disable optional animation, and be reviewed for the intended rendering change. Baseline updates require a human design review of changed images; blindly accepting all snapshots is prohibited. Pixel snapshots supplement behavior tests and do not prove semantics.

Before a shared interactive family is production-ready, manually verify keyboard-only behavior and a screen-reader path. Baseline is NVDA with a supported Windows browser; add VoiceOver/Safari testing for touch/Apple use. Confirm an Arabic-capable voice and correct language announcements. Automated accessibility scanning is useful but not a substitute for these tests. Browser engine coverage SHOULD include Chromium, Firefox, and WebKit for shared overlay, form, and bidi behavior; failures affecting supported users must be resolved or explicitly scoped before release.

Color checks MUST include all actual surfaces/states, not only palette swatches. Test selected + hover + focus, invalid + focus, and pending with retained focus. Chart QA includes grayscale/color-vision simulation, exact data access, and RTL axes. Text-spacing tests use increased line/paragraph/word/letter spacing without lost content; this does not authorize default letter spacing on Arabic UI.

### 41.3 Repository gates and present document validation

Implementation uses repository-defined commands: `pnpm verify` for the fast gate; `pnpm verify:full` for Prisma, PostgreSQL integration, and Playwright smoke coverage in addition; `pnpm deps:audit` where required. Use `NX_DAEMON=false` when capturing Nx on Windows. Add needed checks to the existing root command flow, not duplicate CI steps or invent a separate certification gate.

For this specification, validation consists of checking source alignment, complete decisions, local links, token references, numerical contrast, and whitespace. Repository `.prettierignore` excludes `docs/`; a passing format command alone does not validate this Markdown. Browser/component tests cannot certify a system that has not yet been implemented. Section 45 separates document completion from implementation release acceptance.

## 42. Governance and Evolution

### 42.1 Ownership

Vertex Media's designated design-system owner is accountable for this specification and its visual coherence. The frontend maintainer owns token/component implementation and migration safety. The accessibility reviewer verifies interaction/assistive-technology behavior. Domain owners approve the meaning of feature states and actions; security and Finance reviewers participate when their boundaries are affected. These are review responsibilities, not newly invented organization roles or infrastructure.

| Proposed change | Required review material |
| --- | --- |
| New semantic token | Existing-role analysis, precise meaning, consumers, Light/Dark mappings, contrast evidence |
| New component variant | Distinct user intent, why composition fails, full state matrix, both directions/themes |
| New primitive | Real workflow need, native/shared alternative, semantics, keyboard model, tests, ownership |
| New product pattern | At least two concrete uses, or one complex reusable need with explicit rationale; domain boundary analysis |
| Exceptional feature styling | Why existing roles fail, smallest scope, owner, expiry/removal plan; no local token system |
| Breaking change | Affected consumers, migration, compatibility window, tests, docs and release notes |

The default response to a missing variant is to inspect existing patterns, not add props. A variant is justified by a different stable intent or anatomy, not by one module wanting a different shade. A new business enum normally adds a mapping, not a new component. Implementation MAY proceed from one real use; speculative duplicates are not evidence of reuse.

### 42.2 Change discipline

Changes MUST update the canonical rule and implementation together within the affected task scope. Reference palettes, semantic contracts, and accessibility behavior cannot be overridden locally. If a task is documentation-only, record the implementation gap explicitly rather than claiming migration occurred. Security, financial semantics, and architecture retain their separate authority and approval requirements.

Use semantic versioning for the public design contract: patch for clarifications/corrections preserving intent, minor for additive compatible roles/patterns, major for breaking token/API/behavior changes. A visual change with meaningful layout or workflow impact requires migration review even when TypeScript still compiles. Version numbers do not replace Git history or the repository release process.

Deprecation requires a replacement, migration instructions, affected-consumer inventory, and a removal milestone. Keep an alias during migration only when its semantics are identical; never alias incompatible roles merely to suppress errors. Remove deprecated usage across known consumers before removing the alias. No permanent “legacy theme” or module fork. Tokens and variants with no justified consumer SHOULD be removed through review.

## 43. Forbidden Patterns

- Raw colors, arbitrary spacing/radii, local semantic tokens, per-module themes, or inline replacements for shared tokens.
- Direct reference-palette consumption in feature/components when a semantic role exists; fallback hex values hiding missing aliases.
- shadcn, duplicate buttons, private form systems, and direct third-party primitive imports in feature code.
- Gold for workflow status or primary actions; random avatar/category colors outside the chart contract.
- Card-everything layouts, static card hover effects, excessive shadows, ornamental gradients, glass/blur surfaces, pill-shaped primary controls, and asymmetric marketing corners.
- Tiny table text to fit more columns, clipped Arabic glyphs, letter-spaced Arabic, mirrored numbers/logos, or physical left/right layout defaults.
- Blanket RTL transforms, reversed string contents, CSS visual order that contradicts DOM order, and date-only values converted through local midnight timestamps.
- Focus removal without an equivalent visible indicator; color-only state; tooltip-only labels; disabled explanations that require hovering a disabled control.
- Hover-only essential actions, drag-only workflows, clickable divs, nested interactive elements, or tables presented as grids without a grid keyboard model.
- Whole-component opacity for disabled states, read-only values made unreadable, spinners for ordinary business “pending,” or success before authoritative confirmation.
- Silent form overwrites, automatic retry of uncertain privileged/financial mutations, fake progress, fabricated totals, and unsupported undo.
- Routine autosave of permissions, approvals, financial posting, or contracts; local browser persistence of authentication or business drafts.
- Hard deletion presented as ordinary IAM termination, password/MFA forms in Vertex, or treating UI permission checks as authorization.
- Dialog stacks for navigation, uncontrolled z-index escalation, unrelated popups above modals, toasts as the only record of a critical outcome.
- Default bounce/squish/parallax, arbitrary animation values, endlessly pulsing skeletons, and motion that ignores reduced-motion preferences.
- Hidden essential table columns as the sole responsive strategy; unauthorized data preserved as “stale”; audit evidence conflated with an activity feed.
- Universal components with unrelated business modes, speculative packages/dependencies, and tests that assert implementation details instead of meaningful behavior.

## 44. Implementation Readiness

The foundational design decisions are fixed by this version: palette and semantic mappings, first-class themes, paired typography, 4px spacing rhythm, Default/Compact density, control sizes, logical layout, focus geometry, state precedence, form/table contracts, chart semantics, and governance. Implementation agents MUST use these decisions rather than reopening them by default.

### 44.1 Delivery sequence for a future implementation task

1. Establish the single token source, theme/direction/density root, licensed font delivery, and semantic Tailwind bridge. Verify aliases and contrast before feature styling.
2. Deliver actions, field structure, text/choice inputs, status, focus, and feedback with accessible behavior.
3. Deliver shell/page grammar, overlays/navigation, and the standard table/filter/selection pattern.
4. Compose the first real IAM workflow using those primitives; prove Arabic/English and both themes, including sensitive confirmation and stale-write behavior.
5. Extend only for the next actual module's needs. Migrate the technical shell to the shared foundations as part of implementation, preserving its system-status behavior.

This sequence is not authorization to create every catalog component now. No application package, dependency, component, font asset, or token file is delivered with this document.

### 44.2 Required implementation inputs and boundaries

| Input | Decision now | What remains to verify during implementation |
| --- | --- | --- |
| Brand assets | Preserve supplied artwork; Section 5 sizing rules | Approved production vector/transparent export or use the specified text identity fallback |
| Fonts | IBM Plex Arabic/Sans/Mono and explicit type roles | Exact licensed files, shaping, numeral features, fallback metrics, loading behavior |
| Icons | One 24-unit outlined family with per-icon mirroring metadata | Licensed source, coverage, optical rendering at 16/20px |
| Complex primitives | Selective Base UI behind Vertex APIs | Pinned version and actual accessibility/RTL behavior; no dependency added here |
| Domain state maps | Shared five-tone system; IAM mapping specified | New module enums and labels reviewed by their owners |
| Time/currency | Explicit shared presentation; domain authority retained | Organization timezone/workweek and domain precision from supported configuration/contracts |
| Runtime/testing | Existing repository scripts and tools | High-value visual fixtures, actual browser and screen-reader results |

These are asset/integration acceptance checks, not invitations to invent a new visual foundation. A missing integration value MUST use the explicit fallback provided here or block the affected workflow when the domain requires it. It MUST NOT be silently guessed.

### 44.3 Cross-module proof scenarios

Before declaring the implemented foundation ready, demonstrate the same shell and patterns with synthetic data for: an Arabic IAM directory with independent access/provisioning badges; a role-permission form with mixed groups and change review; a CRM filtered list with preserved return context; a project inspector with a mixed-language filename/version; and a Finance review with an exact signed amount, currency, and conflict state. These are design fixtures, not permission to implement deferred modules or real financial mutations.

The same controls, spacing, type roles, focus, loading language, and tones MUST be recognizable in all scenarios. A specimen is not complete if it shows only ideal rest states.

## 45. Definition of Done

### Specification delivery

- [ ] Only `docs/DESIGN_SYSTEM.md` is created for this task; unrelated working-tree changes are preserved.
- [ ] Reference decisions distinguish observed evidence from reconstructed examples and original Vertex decisions.
- [ ] Tokens resolve, Light/Dark semantics match, and contrast evidence supports the approved opaque pairings.
- [ ] Arabic typography, bidi content, touch/density, keyboard, focus, tables, forms, overlays, and financial presentation have explicit rules.
- [ ] Domain/security boundaries and V1 exclusions remain intact.
- [ ] Local document links, terminology, numeric rules, and cross-references are reviewed; no foundational decision is left as “choose later.”
- [ ] Implementation gaps and future validation are described without claiming they already exist.

### Implementation release acceptance

- [ ] Shared tokens and component APIs match this specification; no unexplained local override or parallel pattern exists.
- [ ] Real fonts/assets render correctly in both languages/themes and required density modes.
- [ ] Every applicable state, combination, and recovery path is implemented, named, and keyboard accessible.
- [ ] Critical form, table, overlay, selection, conflict, and sensitive-action behavior has meaningful tests.
- [ ] Contrast, reflow, full focus visibility, bidi, reduced motion, forced colors, touch, and manual screen-reader checks have evidence.
- [ ] High-value visual baselines are reviewed rather than blindly accepted; no required information is clipped/hidden.
- [ ] Domain authority, authorization, auditability, money/date semantics, and safe uncertain-outcome handling remain intact.
- [ ] Relevant repository checks pass; unrun/failed checks are reported with reasons. The full gate is satisfied before release as required by repository policy.
- [ ] Documentation, tokens, contracts, component behavior, and consumers are synchronized; deprecations have a complete migration.

These checklists define acceptance criteria; unchecked boxes are not claims of failed verification, and the implementation list MUST NOT be marked complete by a documentation-only change.

## 46. Final Design-System Invariants

1. Vertex OS has one visual and interaction system across all modules.
2. Arabic/RTL is native to the architecture; English/LTR is equally complete.
3. Light and Dark express the same semantic hierarchy through deliberate mappings.
4. Components consume semantic roles; features compose shared components and patterns.
5. Green identifies action and selection; status labels distinguish operational meaning; gold remains restrained identity.
6. Density changes geometry, never readability, semantics, or access to information.
7. Focus, selection, checked, expanded, disabled, read-only, and busy remain distinct states.
8. Forms preserve work and make save, conflict, and uncertainty explicit.
9. Tables preserve identity, exact values, selection scope, and keyboard access at every viewport.
10. Layout follows logical directions; embedded values preserve their own readable order.
11. Accessibility is verified in rendered behavior, not assumed from a library or token sheet.
12. UI communicates authoritative business outcomes; it does not become their authority.
13. Extensions must improve coherence across the product, not give one module a separate identity.
