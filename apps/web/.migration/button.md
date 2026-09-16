# button

2026-09-16, real primitive swap (`@base-ui/react/button`, per the hard rule against a hand-rolled `useRender` wrapper), verdict: clean, one flagged behavior delta (net-safer, verified inert here).

## Changed

- `src/components/ui/button.tsx` — replaced `import { Slot } from '@radix-ui/react-slot'` with `import { Button as ButtonPrimitive } from '@base-ui/react/button'`. Dropped the `asChild`/`Slot` ternary entirely: `ButtonPrimitive` is itself polymorphic (`render` prop native to `BaseUIComponentProps`), so the wrapper just forwards `...props` straight through. Type became `ButtonPrimitive.Props & VariantProps<typeof btnVars>`, dropping the manual `{ asChild?: boolean }` field. All variant/size classes, `data-variant`/`data-size` attributes untouched.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" button.tsx` → no matches.
- Consumer sweep (`asChild` → `render`, per consumer-props.md), only files that needed a **Button** fix (files needing both a Button and an Item fix are reported in item.md instead, since both source diffs land in the same file):
  - `src/routes/_private/customers/list/index.tsx`, `products/index.tsx`, `schedule/professionals/index.tsx`, `schedule/spaces/index.tsx` — `<Button asChild variant="basic"><Link>{t('add')}</Link></Button>` → `<Button variant="basic" render={<Link>{t('add')}</Link>} />`.
  - `src/routes/_private/inbox/@components/composer.tsx` — same shape, target is a plain `<a>` (WhatsApp deep link), not `<Link>`.
  - `src/routes/_private/processes/add/index.tsx` — same shape, `<Link to="/customers/details" search={...}>{t('back')}</Link>` with multi-line children, `render` value kept as a JSX block for readability.
  - `src/routes/_private/schedule/calendar/@components/appointment-panel.tsx:364` — `<Button type="button" variant="basic" asChild><a ...>` → `render` prop, `type="button"` kept (irrelevant for a render-only button since the DOM node ends up being the rendered `<a>`, but harmless to keep explicit).

## Left alone

- `src/components/ui/date-picker.tsx`, `calendar.tsx`, `card.tsx` (back button) and the 5 "Editar" toggle buttons across `*/details.tsx` — none use `asChild`/`render`, unaffected by this migration.

## Behavior changes

- **Default `type` attribute.** Verified in `node_modules/@base-ui/react/internals/use-button/useButton.js`: when `nativeButton` is true (the default), Base UI's `getButtonProps` explicitly sets `type: 'button'` unless the caller's own props override it (caller props are merged last, so an explicit `type="submit"` still wins). Radix's Slot/native `<button>` had no such default, so inside a `<form>` an untyped button fell back to the browser's native `type="submit"`.
  Audited every `<Button>` call site in `apps/web/src` (`python3` scan for `<Button` tags missing `type=` across the full opening-tag span, not just same-line grep): 8 call sites omit `type`, none are rendered inside a `<form>` element (`grep -n "<form"` on each of their files found none). This migration's new default is strictly safer (no more accidental implicit-submit buttons), not a regression — flagged per the hard rule anyway since it is a real behavior change if a future `<Button>` without `type` is ever placed inside a form and expected to submit it implicitly.

## Verify by hand

- Click every `render`-based Button/Link combo above (nav "Adicionar" buttons, WhatsApp deep link, process "Voltar") and confirm navigation/external-link behavior is unchanged and the button's visual variant still applies to the rendered `<a>`/`<Link>`.
- Submit the auth (`/auth`), customer-add, and product-add forms — their submit buttons keep explicit `type="submit"` already, confirm nothing regressed.
