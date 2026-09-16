# breadcrumb

2026-09-16, transformation engine (`useRender` + `mergeProps`, worked example in universal-patterns.md is literally this component), verdict: clean.

## Changed

- `src/components/ui/breadcrumb.tsx` — `BreadcrumbLink` swapped `Slot`/`asChild` for `useRender`/`mergeProps`, matching the skill's own worked example almost verbatim. `data-slot="breadcrumb-link"` now comes from `state: { slot: 'breadcrumb-link' }` instead of a literal prop.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" breadcrumb.tsx` → no matches.
- `src/components/ui/card.tsx` (`PageBreadcrumb`, the only consumer) — both `<BreadcrumbLink asChild><Link>...</Link></BreadcrumbLink>` call sites (home crumb + per-segment crumb) converted to the self-closing `<BreadcrumbLink render={<Link>...</Link>} />` form, matching the shape confirmed against shadcn's own `base-sera` breadcrumb-example registry fixture (`BreadcrumbLink render={<Link href="#">Home</Link>} />`) fetched during this migration to verify the exact calling convention before touching call sites.

## Left alone

- `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis` — plain elements, no `Slot`/`asChild`, untouched.

## Behavior changes

None.

## Verify by hand

- Navigate to any nested route (e.g. a customer's details page) and confirm the breadcrumb trail renders and every non-final crumb is still a clickable `Link` to the right path.
