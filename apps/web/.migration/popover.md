# popover

2026-09-16, transformation engine (positioner model per universal-patterns.md + overlays.md's "popover" section), verdict: clean, 2 consumer `asChild` call sites found and fixed.

## Changed

- `src/components/ui/popover.tsx`:
  - Import: `import * as PopoverPrimitive from '@radix-ui/react-popover'` → `import { Popover as PopoverPrimitive } from '@base-ui/react/popover'`.
  - `Popover`/`PopoverTrigger`: unchanged bare re-exports (`.Root`/`.Trigger`), same shape in both libraries.
  - `PopoverAnchor`: Base UI's Popover has **no Anchor part at all** — confirmed empty by listing `node_modules/@base-ui/react/popover/index.parts.d.ts` (Positioner takes an `anchor` prop instead, per the hard rule this is one of the two documented "no equivalent" gaps). No consumer in this app imports `PopoverAnchor` (grepped `apps/web/src`, only its own declaration matched). Per the hard rule ("Popover Anchor ... has no equivalent: inert passthrough + flag") kept it as a trivial `{children}`-passthrough component rather than deleting the export outright, so a future import doesn't silently break — flagged here as the behavior gap it is.
  - `PopoverContent`: restructured `Portal>Content` into `Portal>Positioner>Popup`, per the universal Portal/Positioner/Popup model. `align`/`sideOffset` (the only two positioning props this wrapper ever exposed) moved from `Content` to `Positioner` and are explicitly destructured and forwarded (declare→destructure→forward — the "Pick means FORWARD" rule; skipping this silently breaks positioning). `Positioner` gets `className="isolate z-50"` per `wrapper-shapes.md`'s convention table. `data-[state=open/closed]:` → `data-open:`/`data-closed:` in the Popup's className; `data-[side=...]:` slide-in classes left untouched (still parameterized, unchanged per class-mapping.md).
  Leftover scan: `grep -n "radix-ui\|@radix-ui" popover.tsx` → no matches.
- Consumer sweep (`asChild` → `render`) — found 2 real call sites the initial per-component classification pass missed (both use the calendar-in-a-popover pattern):
  - `src/components/ui/date-picker.tsx:13` — `<PopoverTrigger asChild><Button variant={...} className="...">...</Button></PopoverTrigger>` → `<PopoverTrigger render={<Button variant={...} className="...">...</Button>} />`.
  - `src/components/dynamic-field/dynamic-field.tsx:213` — same shape, the tenant-configurable date/datetime field's calendar trigger.

## Left alone

- `date-picker.tsx` itself is a self-contained, propless demo component (per its own file: not currently wired to any prop-driven form field — `dynamic-field.tsx`'s date leaf duplicates its Popover/Calendar/Button composition directly rather than reusing it, per that file's own comment). Left as-is beyond the `asChild` fix; not in scope to refactor.

## Behavior changes

- `PopoverAnchor` is now an inert passthrough instead of a real positioning primitive — inert today only because nothing uses it; flagged so a future consumer doesn't assume it repositions the popup the way Radix's did (they'd need `Positioner anchor={...}` on `PopoverContent` instead).

## Verify by hand

- `dynamic-field.tsx`'s date/datetime field type (any tenant form with a date field) — click the date button, confirm the calendar popover opens, positioned correctly, and selecting a date closes it and updates the button label.
- `date-picker.tsx`'s standalone demo (if rendered anywhere reachable) — same check.
