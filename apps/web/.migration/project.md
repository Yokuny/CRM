# project — whole-project Radix UI → Base UI migration

2026-09-16. Whole-project mode. All 17 Radix-dependent `ui/` wrappers migrated (label, separator, button, item, badge, breadcrumb, button-group, checkbox, switch, popover, select, form, dialog, dropdown-menu, tabs, scroll-area, tooltip), plus a full app-code consumer sweep. **0 wrappers remain on Radix.**

## Dependency swap

- `apps/web/package.json`: removed all 11 individual `@radix-ui/react-*` packages plus the unified `radix-ui` package; added `@base-ui/react@1.8.0`. Both coexisted during the migration (per the skill's hard rule) and were only removed after the last component (`form`) landed.
- `pnpm install` re-run at the end: `-69` packages from the lockfile/`node_modules` (radix's transitive tree).
- `apps/web/components.json`: `style` changed from the bare `"sera"` to `"base-sera"`. This wasn't just a migration-tracking flip — it fixed a **pre-existing, unrelated CLI bug** in this project's shadcn config: `components.json` never had the base-library prefix (`radix-`/`base-`) on its `style` field, which meant `shadcn info`'s `config.base` fell back to a hardcoded `"radix"` default (traced into the installed CLI's bundled source: `function ig(e){return e===void 0?"base":c$2(e).base??"radix"}`) regardless of what the code actually imported, and `shadcn add --overwrite` 404'd outright (it fetches `r/styles/<style>/<name>.json` using the raw `style` field verbatim, and `sera` alone isn't a valid registry path — only `radix-sera`/`base-sera` are). Verified after the fix: `shadcn info --json` now reports `"base": "base"` and `shadcn add button --overwrite --dry-run` resolves correctly against the `base-sera` registry.

## Golden-pair mechanism

This project's `ui/` components are heavily customized (its own visual identity — IBM Plex Mono + Karla, indigo-violet ink, custom badge palettes, non-stock spacing/variants) and diverge significantly from the current `sera` registry's own look on **both** the radix and base sides. Every component was therefore treated as CUSTOMIZED, never migrated via `shadcn add --overwrite` (which would have silently replaced this project's design with the registry's own restyle). Golden pairs (`https://ui.shadcn.com/r/styles/radix-sera/<name>.json` / `base-sera/<name>.json`) were fetched and diffed purely as a **reference for the mechanical API transform** (import paths, part renames, prop changes, class-attribute rewrites), then that transform was hand-replayed onto this project's actual file content, preserving every custom class and structural choice.

Two components (`form`, and effectively the pre-restructured `select`) had **no usable golden pair**: the current shadcn registry no longer ships a `form.tsx` at all (both `radix-sera/form.json` and `base-sera/form.json` return empty registry items — the ecosystem moved to `Field`/`FieldGroup`/`FieldSet` instead), so `form.tsx`'s `FormControl` was hand-authored using Base UI's own documented `useRender({ render: <element> })` → `React.cloneElement` mechanism, verified directly against `node_modules/@base-ui/react/internals/useRenderElement.js` to reproduce Radix `Slot`'s exact clone-and-merge behavior.

## App-code consumer sweep

Full `asChild` → `render` sweep across `apps/web/src` (not just the `ui/` wrappers) found and fixed real call sites in: `card.tsx`, `date-picker.tsx`, `dynamic-field.tsx`, and 11 route files (`customers/{details,index,list/index}`, `inbox/composer`, `kanban/index`, `processes/{add/index,index}`, `products/index`, `schedule/{index,professionals/index,spaces/index}`, `schedule/calendar/appointment-panel`). A separate sweep for `select`'s widened `onValueChange(value: Value | null, ...)` signature (per Base UI's real type, verified against `node_modules/@base-ui/react/select/root/SelectRoot.d.ts`) found and fixed 3 more real type-breaking call sites (`processes/{details,add/index}`, `schedule/calendar/index`) — these were caught by `tsc`, not guessed.

Zero consumers existed for `dialog`, `dropdown-menu`, and `tabs` (confirmed by grep before migrating — the app doesn't use them yet), so those three needed no call-site sweep.

## Behavior deltas flagged across the whole migration (not silently patched)

- **Tabs**: keyboard activation changes from Radix's automatic (arrow-focus activates) to Base UI's manual (Enter/Space required) — this project's wrapper never set an activation mode, so it silently relied on Radix's default. One-line revert available (`TabsList activateOnFocus`) if the product wants the old behavior back.
- **DropdownMenu**: checkbox/radio items no longer close the menu on click by default (`closeOnClick` defaults to `false` in Base UI vs. Radix's implicit close).
- **Button**: Base UI's real `Button` primitive defaults `type="button"` explicitly (Radix's plain `<button>` had no default, so an untyped button inside a `<form>` would fall back to the browser's native `type="submit"`). Audited every `<Button>` in the app for a missing `type`; none are rendered inside a `<form>`, so this is a strictly safer default here, not a regression.
- **Select**: `sideOffset` default changes from Radix's implicit `0` to `4` (a golden-derived recommendation for this exact component, no consumer overrides it — minor visual shift).
- **ScrollArea**: `type="scroll"` (fade-out-when-idle scrollbar) dropped from the kanban board's horizontal scroll area — no Base UI equivalent; visibility is CSS-driven there now.
- **Tooltip**: enter/exit animation mechanism changed from Tailwind keyframe utilities gated on Radix's `data-state` enum to Base UI's `data-starting-style`/`data-ending-style` transition idiom — same visual intent (fade + scale + directional slide-in), different CSS mechanism.
- **Popover**: `PopoverAnchor` has no Base UI equivalent (kept as an inert `{children}` passthrough per the hard rule, rather than deleted, since nothing currently uses it but a future caller shouldn't hit a missing export).
- **Checkbox/Switch**: fixed (not just flagged) a real latent bug carried over from the shadcn base registry itself — both now render a `<span>`, not a `<button>`, so the `disabled:` Tailwind pseudo-class variants these files had could never match; replaced with `data-disabled:` equivalents.

## Verify (full-project)

- `pnpm -w run format` / `pnpm -w run check` (biome + tsc + vitest, from the monorepo root): 2 failing tests, both pre-existing baseline failures unrelated to this migration (`appointmentConfirmation.service.unit.test.ts`, `media-card.unit.test.tsx` — confirmed identical failures on a clean baseline run before any migration work started). 2007/2009 tests pass.
- `cd apps/web && pnpm run build`: succeeds silently (Vite's strict Rollup resolution, which catches import issues `tsc`/esbuild miss, per `apps/web/CLAUDE.md`).
- `grep -rl "radix-ui\|@radix-ui" apps/web/src/components/ui/*.tsx`: 0 files.

**0 of 17 wrappers remain on Radix** (derived from disk, not tracked separately — re-run the grep above to confirm at any point in the future).
