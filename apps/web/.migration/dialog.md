# dialog

2026-09-16, transformation engine (golden-pair diff of `radix-sera`/`base-sera` dialog.json used to derive the mechanical rename set, then replayed onto the project's existing customized markup), verdict: clean, no consumer changes needed.

## Changed

- `src/components/ui/dialog.tsx`
  - Import: `import * as DialogPrimitive from '@radix-ui/react-dialog'` → `import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'`.
  - `Dialog`/`DialogTrigger`/`DialogPortal`/`DialogClose` stay bare `const` re-exports of `.Root`/`.Trigger`/`.Portal`/`.Close` — these four part names are identical between Radix and Base UI, so only the import source changed, matching the project's pre-existing (non-shadcn-stock) choice not to wrap them in functions with `data-slot`.
  - `DialogOverlay` (line ~11): primitive swapped `DialogPrimitive.Overlay` → `DialogPrimitive.Backdrop` (part rename per overlays.md); public wrapper name kept as `DialogOverlay` (same pattern the hover-card mapping uses: internal primitive renamed, public name stays). Prop type `ComponentProps<typeof DialogPrimitive.Overlay>` → `DialogPrimitive.Backdrop.Props`.
  - `DialogContent` (line ~24): primitive swapped `DialogPrimitive.Content` → `DialogPrimitive.Popup`; prop type → `DialogPrimitive.Popup.Props`. No `Positioner` added — centered dialogs use `Popup` directly per overlays.md ("centered modal: no Positioner").
  - Class-string rewrites, applied identically on Overlay and Content, verified against the actual golden-pair diff (which keeps `animate-in`/`fade-in-0`/`zoom-in-95`/`slide-in-from-*` utility classes unchanged and only renames the attribute-selector prefix — confirmed this project's Tailwind v4 install compiles bare `data-open:`/`data-closed:` to `[data-open]`/`[data-closed]` natively, no custom variant config needed):
    - `data-[state=open]:` → `data-open:`
    - `data-[state=closed]:` → `data-closed:`
  - On the in-content close button: `data-[state=open]:bg-accent data-[state=open]:text-accent-foreground` → `data-open:bg-accent data-open:text-accent-foreground`. Note: this selector is almost certainly dead CSS in both the old and new versions — `DialogPrimitive.Close` doesn't carry an open/closed presence attribute in either Radix or Base UI — but it's pre-existing, out of scope to fix, renamed mechanically like everything else.
  - `DialogTitle`/`DialogDescription`: prop types → `DialogPrimitive.Title.Props` / `DialogPrimitive.Description.Props`. Part names unchanged (`Title`→`Title`, `Description`→`Description`).
  - `DialogHeader`/`DialogFooter`: untouched — plain `<div>`s, not primitive-backed.
  - Removed the now-unused `ComponentProps` import (all primitive-backed prop types now come from `DialogPrimitive.<Part>.Props` instead of `ComponentProps<typeof DialogPrimitive.<Part>>`); kept `HTMLAttributes` for Header/Footer.
  - Leftover scan: `grep -n "radix-ui\|@radix-ui" dialog.tsx` → no matches.

## Left alone

- No consumer in `apps/web/src` imports from `dialog.tsx` outside the file itself (confirmed by the caller ahead of time via project-wide grep) — zero call-site changes needed.
- `components.json` / `package.json` not touched, per instructions (dependency cleanup happens centrally later).

## Behavior changes

- None expected for this file's own behavior. One pre-existing oddity carried forward unfixed: the `data-open:bg-accent`/`data-open:text-accent-foreground` classes on the in-content `DialogPrimitive.Close` button appear to never have matched anything (Close has no open/closed state attribute in either library) — not a regression introduced by this migration, just renamed in place.

## Verify by hand

- Open a dialog from any trigger in the app; confirm the backdrop fades in and the panel scales/slides in from center.
- Press Escape; dialog closes and focus returns to the trigger element.
- Click the X close button (top-right); dialog closes.
- Click outside the dialog panel (on the backdrop); dialog closes (default `modal` behavior unchanged).
- Tab through dialog contents; focus should stay trapped inside while open (focus trap unchanged, `modal` defaults to `true` in both libraries).
