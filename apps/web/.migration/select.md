# select

2026-09-16, transformation engine (restructured per universal-patterns.md + wrapper-shapes.md's "Select" section), verdict: clean, real consumer-side type breakage found and fixed (not silently patched).

## Changed

- `src/components/ui/select.tsx`:
  - Import: `import * as SelectPrimitive from '@radix-ui/react-select'` → `import { Select as SelectPrimitive } from '@base-ui/react/select'`.
  - `Select`: was a wrapper function (`data-slot="select"`); now a **bare re-export** `const Select = SelectPrimitive.Root`, matching `wrapper-shapes.md`'s explicit guidance — `SelectPrimitive.Root.Props` is generic over `<Value, Multiple>` and breaks the usual `ComponentProps<typeof X>` pattern, so the base-sera registry itself sidesteps it the same way. Confirmed no CSS/test anywhere selects on `[data-slot=select]`, so dropping it is zero-impact.
  - `SelectGroup`/`SelectValue`: type only, `ComponentProps<typeof X>` → `X.Props`.
  - `SelectTrigger`: `SelectPrimitive.Icon asChild><IconDown/></Icon>` → `<SelectPrimitive.Icon render={<IconDown className="stroke-2" />} />` (self-closing — verified this exact self-closing shape against shadcn's own base-sera select-example/select.tsx fixtures before writing it, not guessed).
  - `SelectContent`: restructured `Portal>Content` into `Portal>Positioner>Popup>[ScrollUpButton, List(children), ScrollDownButton]`. Dropped the Radix `position` prop entirely per `wrapper-shapes.md`; replaced with `alignItemWithTrigger`, `side`, `sideOffset` (default `4`), `align`, `alignOffset` picked from `Positioner.Props` and explicitly forwarded (declare→destructure→forward, per the "Positioner props: Pick means FORWARD" rule — skipping this silently breaks positioning with no type error).
    **Important default-preservation decision**: the project's original wrapper defaulted to `position="popper"` (overriding Radix's own `"item-aligned"` default), and no consumer anywhere overrides `position`. `alignItemWithTrigger` is the closest Base UI equivalent, but per `consumer-props.md`'s own mapping table `position="popper"` → `alignItemWithTrigger={false}` — the OPPOSITE of the golden registry's own default of `true` (which corresponds to `"item-aligned"`, the golden's un-overridden default). Defaulted this wrapper's `alignItemWithTrigger` to `false` to preserve this project's actual popper-anchored visual behavior, not the golden's item-aligned one. Moved the "popper mode" translate-offset classes to key off `!alignItemWithTrigger` instead of the removed `position === 'popper'` check, and `SelectPrimitive.List`'s width classes now key off `alignItemWithTrigger` (using `--anchor-width`, the Base UI CSS var replacing `--radix-select-trigger-width`).
    CSS var rename: `--radix-select-content-available-height` → `--available-height`, `--radix-select-content-transform-origin` → `--transform-origin`.
  - `SelectLabel`: repointed from `SelectPrimitive.Label` to `SelectPrimitive.GroupLabel` — confirmed via `node_modules/@base-ui/react/select/{label,group-label}/*.d.ts` doc comments that Base UI's `Label` is a NEW, unrelated part ("automatically associated with the select **trigger**"), while `GroupLabel` ("automatically associated with its parent **group**") is the actual replacement for Radix's `Select.Label` (which this project always used inside a `SelectGroup`). Public wrapper name kept as `SelectLabel` for API stability (same treatment as HoverCard→PreviewCard keeping its public name).
  - `SelectItem`: `data-[disabled]:` → `data-disabled:` (cosmetic-only rewrite to the canonical shorthand — both already resolve to the same presence-based attribute on both libraries; the project's own Biome config already suggests this canonical form elsewhere).
  - `SelectScrollUpButton`/`SelectScrollDownButton`: repointed `ScrollUpButton`/`ScrollDownButton` → `ScrollUpArrow`/`ScrollDownArrow` per the part-rename table.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" select.tsx` → no matches.
- Consumer sweep — **real type breakage found and fixed**, per `consumer-props.md`'s documented `onValueChange` widening (`(value: string) => void` → `(value: Value | null, eventDetails) => void`; verified the exact generic signature in `node_modules/@base-ui/react/select/root/SelectRoot.d.ts`). 4 call sites failed `tsc` after the wrapper change:
  - `src/routes/_private/processes/details.tsx:124` — `onValueChange = (stage: string) => {...}` widened to `(stage: string | null) => {...}` with an added `!stage` early-return guard (this field is always populated in practice; a real `null` here would only occur from a future intentionally-clearable Select, which doesn't exist yet).
  - `src/routes/_private/processes/add/index.tsx:88` — `onValueChange={setSelectedKey}` (state typed `useState('')`, a plain `string`) → wrapped as `onValueChange={(value) => setSelectedKey(value ?? '')}` rather than widening the state type, since `''` already serves as this field's own "nothing selected" sentinel.
  - `src/routes/_private/schedule/calendar/index.tsx:87,97` — `handleProfessionalChange`/`handleSpaceChange`, both `(value: string) => void`, widened to `(value: string | null) => void` and merged the existing `ALL_FILTER_VALUE` sentinel check with a `!value` check (`!value || value === ALL_FILTER_VALUE ? undefined : value`).
  All 4 fixes verified by a full `tsc --noEmit` pass returning zero errors project-wide after the change.
- `PopoverTrigger`/select are unrelated, but while sweeping consumers I also found and fixed 2 stray `asChild` usages not caught by the initial classification pass (`components/ui/date-picker.tsx:13`, `components/dynamic-field/dynamic-field.tsx:213`, both `<PopoverTrigger asChild><Button>...</Button></PopoverTrigger>`) — reported under [[popover]] since that's the wrapper they call into, not select.

## Left alone

- `SelectPrimitive.Icon`'s `Value`/`Multiple` generics: not exercised anywhere in this app (every `<Select>` call site works with plain `string` values, `multiple` is never passed), so the bare re-export's loss of an explicit non-generic `Select` function signature has no observable effect here.

## Behavior changes

- **`sideOffset` default changed from unset (`0`, Radix's implicit default) to `4`** per `wrapper-shapes.md`'s explicit golden-derived guidance for this exact component. No consumer overrides it, so every select popup opens 4px further from its trigger than before — a minor, likely-imperceptible visual shift, flagged per the hard rule rather than silently matched to `0`.
- `onValueChange`'s widened `string | null` type is a real, load-bearing type change (see the 4 consumer fixes above) — flagging here even though it's fixed, since it's the kind of thing that would silently miscompile if this file is ever reverted/reapplied without the consumer sweep.

## Verify by hand

- `/processes/add` — pick a template, confirm the select updates and "Confirmar" enables.
- `/processes/details` — change the stage select, confirm it mutates and reverts to the prior value on error.
- `/schedule/calendar` — filter by professional/space via the two selects, confirm the "todos" (all) sentinel option still clears the filter.
- Any `SelectContent` with a `SelectGroup` + `SelectLabel` (dynamic-field templates, if any use grouped options) — confirm the group heading still renders and is announced correctly by screen readers (GroupLabel's `aria-labelledby` wiring).
- Keyboard: open a select with Enter/Space, arrow through items, confirm scroll-up/down arrows appear on a long list and typeahead-jump still works.
