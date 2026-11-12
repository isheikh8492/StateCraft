# 0004. Own components on Tailwind tokens

Date: 2026-11-11. Status: accepted. Refines the "shadcn/ui on Radix" line in spec v0.2.

## Decision

The interface is built from a small set of components owned by this repository (`packages/web/src/ui`), written in the shadcn/ui style (Tailwind classes, `class-variance-authority` for variants, `tailwind-merge` for overrides). Radix primitives are added one at a time, only when a component needs behaviour that is hard to get right by hand, such as dialogs, menus and comboboxes.

All colours, sizes and fonts are tokens in one file, `src/theme/tokens.css`. Tailwind's default palette, type scale, radii and shadows are switched off, so a class that is not a token does not exist.

## Why

It keeps the bundle and the dependency list small, and makes the token rule enforceable by the build instead of by review.

## Cost

Components that Radix would have given for free must be added deliberately. The window shell's drag and resize are pointer-only; keyboard users rely on minimise and maximise until keyboard moving is added.
