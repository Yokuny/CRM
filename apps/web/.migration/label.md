# label

2026-09-16, transformation engine (no Base UI counterpart), verdict: clean, no behavior change.

## Changed

- `src/components/ui/label.tsx` — removed `@radix-ui/react-label` (`LabelPrimitive.Root`), replaced with a native `<label>` per the hard rule (Base UI ships no Label primitive; Radix's Label only added click-to-focus/text-select prevention that native `<label>` already provides). Type narrowed from `ComponentProps<typeof LabelPrimitive.Root>` to `ComponentProps<'label'>`. Added a `biome-ignore lint/a11y/noLabelWithoutControl` since `htmlFor`/children arrive through the generic `...props` spread (same shape as every consumer already using this wrapper) and Biome can't see the association statically.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" label.tsx` → only the biome-ignore comment's own explanatory text, no import/usage left.

## Left alone

- No other files reference `LabelPrimitive` directly; all consumers (`checkbox.tsx`, `form.tsx`, and app code) import the `Label` wrapper by name and are unaffected by the internal swap.

## Behavior changes

None. Native `<label>` provides the same click-to-focus and text-selection-prevention behavior Radix's `Label.Root` added.

## Verify by hand

- Click a form label in any route using `Field`/`FormLabel` (e.g. `/auth`) and confirm focus moves to the associated input.
- Confirm no visual change (className untouched).
