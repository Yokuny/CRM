# form

2026-09-16, transformation engine — no golden pair exists for this component (confirmed: both `radix-sera/form.json` and `base-sera/form.json` return an empty registry item with no files; the current shadcn registry replaced this whole pattern with `Field`/`FieldGroup`/`FieldSet` + context-based wiring instead of a generic Slot-merging `FormControl`, which is not what this project uses). Hand-authored per the skill's Slot→`useRender` guidance and Base UI's own `render`-as-clone-target mechanism. Verdict: clean, zero consumer changes needed across all 17 call sites.

## Changed

- `src/components/ui/form.tsx`:
  - `FormLabel`: `ComponentProps<typeof LabelPrimitive.Root>` (a type-only `@radix-ui/react-label` import) → `ComponentProps<typeof Label>`, referencing this project's own already-migrated `Label` component (a native `<label>` since [[label]]'s migration). No runtime change — `FormLabel` already just renders `<Label htmlFor={formItemId} ...>`.
  - `FormControl`: this is the "manual Slot idiom" from `universal-patterns.md`, but *without* an `asChild` toggle — Radix's `Slot` here is used unconditionally to clone whatever single child is passed (`<FormControl><Input/></FormControl>`) and merge `id`/`aria-describedby`/`aria-invalid` onto it. Base UI has no standalone `Slot` export to swap in directly. Verified in `node_modules/@base-ui/react/internals/useRenderElement.js` (`evaluateRenderProp`) that when `useRender`'s `render` param is a plain `ReactElement` (not a function), it does exactly `React.cloneElement(render, mergeProps(props, render.props))` — i.e. the *exact* mechanism `Slot` uses. So `FormControl` now treats its own `children` as the `render` target: `useRender({ render: children, props: mergeProps<'div'>({...}, props) })`. This reproduces Radix Slot's behavior precisely rather than improvising a new pattern.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" form.tsx` → no matches.

## Left alone

- `Form` (= `FormProvider`), `FormField` (wraps react-hook-form's `Controller`), `useFormField`, `FormItem`, `FormDescription`, `FormMessage` — none touch Radix, untouched.
- **Consumer sweep**: checked all 17 files importing `form.js` (auth, invite, schedule settings/calendar panels, professionals/spaces add+details, products add+details, kanban add+3 panels) — `FormControl`'s external contract (a single child, no extra props ever passed to `FormControl` itself) never changed, so `tsc --noEmit` came back with **zero new errors** project-wide after this change. No call site needed editing.

## Behavior changes

None. `FormControl`'s prop-merge behavior (`id`, `aria-describedby`, `aria-invalid`, `data-slot`) is reproduced exactly via `useRender`'s element-cloning path, which is the same `React.cloneElement` mechanism Radix's `Slot` used internally.

## Verify by hand

- `/auth` or `/schedule/professionals/add` — submit the form with a validation error, confirm the invalid field's input gets `aria-invalid` and the error message's `id` is correctly wired into the input's `aria-describedby` (screen-reader announcement, or inspect the DOM attributes directly).
- Any form field composing `FormControl` around a non-native-input component (`Select`, `Checkbox`) — confirm the wrapped component still receives and forwards the injected `id`/`aria-*` props correctly (they all accept arbitrary `...props` pass-through already).
