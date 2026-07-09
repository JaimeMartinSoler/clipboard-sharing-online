# Style Migration — shared look with sibling sites

This document is the **source of truth for cross-site style changes**. Clipboard
Sharing Online is meant to look and feel like its sibling web apps
(`office-tools-online` / **office-dev-tools.com**). Whenever we change something
visual here that should also live on a sibling — colors, spacing, the header,
badges, panels, the theme tokens — we record it below so it can be replayed with
a single prompt, e.g.:

> "claude, apply the style from the sibling webpage from `STYLE_MIGRATION.md`"

**Rule for contributors (human or agent):** any requirement that changes shared
visual style **must** append/update an entry here in the same PR. See the note
in `CLAUDE.md` ("Sibling-site style parity").

The design system is a Tailwind v4 + CSS-variable token setup (shadcn-style HSL
triples) defined in [`src/app/globals.css`](../src/app/globals.css). Because both
sites share this token model, migrating a change is usually **copying the
variable values and the component class names** listed in each entry.

---

## How the token palette is layered

Surfaces are stacked light→dark (light mode) / dark→light (dark mode) so nothing
adjacent shares a shade:

| Token         | Role                                              | Used by |
| ------------- | ------------------------------------------------- | ------- |
| `--background`| Page body, inputs/textarea (`bg-background`)      | `body`, `Input`, `Select`, `Textarea` |
| `--card`      | Content panels (`bg-card`)                        | Room entry, Share, Creator, Privacy/About sections |
| `--secondary` | **Header bar** (`bg-secondary`)                   | `Header`, `Button variant="secondary"` |
| `--muted`     | Raised surfaces — **badges** at full strength (`bg-muted`); the **info status banner + Advanced Settings** panel at 50% (`bg-muted/50`) | Header pills, mono display boxes (`bg-muted`); info `StatusBanner` + Advanced Settings panel (`bg-muted/50`) |
| `--accent`    | Hover state for the badge/panel surface (`hover:bg-accent`) | Header pills, Advanced Settings rows, ghost/outline buttons |
| `--border` / `--input` | Hairlines and control borders            | global `*` border, inputs |

Guiding intent: **body → header → badges/panels** each move one step in
lightness, so the header never reads as the same block as the pills sitting on
it, and the pills match the Advanced Settings panel for a coherent palette.

---

## Change log

### 2026-07-08 — Lighten Advanced Settings panel to the info-banner shade (issue #59)

Goal: the Advanced Settings panel read too dark after the previous entry darkened
`--muted`. Match it to the info `StatusBanner`'s background — a softer,
half-strength muted surface — so the two raised areas on the entry view share one
shade.

**1. Token values** — no `globals.css` variables changed. This entry only swaps
which Tailwind utility consumes `--muted`:

| Mode | Variable | Before | After | Note |
| ---- | -------- | ------ | ----- | ---- |
| `:root` / `.dark` | `--muted` | unchanged | unchanged | now also drives the panel at 50% via `bg-muted/50` |

**2. Component class changes**

- `src/components/room-entry.tsx` — Advanced Settings container: `bg-muted` →
  `bg-muted/50` (matches the info `StatusBanner`, which already uses
  `bg-muted/50`).

**3. Migration to a sibling**

- No token values to copy. On the sibling's equivalent Advanced Settings / options
  panel, change its container background from `bg-muted` to `bg-muted/50` so it
  matches the info status banner's background.

### 2026-07-08 — Header / badge / panel grays + softer dark background (issue #56)

Goal: header no longer plain white, badges and Advanced Settings share a
coherent (slightly darker) shade, and the dark theme is charcoal rather than
near-black.

**1. Token values** — [`src/app/globals.css`](../src/app/globals.css)

Light mode (`:root`):

| Variable    | Before            | After           | Note |
| ----------- | ----------------- | --------------- | ---- |
| `--secondary` | `240 4.8% 95.9%` | `240 4.8% 95.9%` (unchanged) | now consumed by the header |
| `--muted`     | `240 4.8% 95.9%` | `240 5% 90%`   | badges + Advanced Settings, one step darker than header |
| `--accent`    | `240 4.8% 95.9%` | `240 5% 86%`   | hover for that surface |

Dark mode (`.dark`):

| Variable      | Before          | After          | Note |
| ------------- | --------------- | -------------- | ---- |
| `--background`| `240 10% 3.9%`  | `240 6% 12.5%` | ~9/255 → ~32/255, charcoal not void |
| `--card`      | `240 10% 3.9%`  | `240 6% 12.5%` | panels track the body |
| `--popover`   | `240 10% 3.9%`  | `240 6% 12.5%` | |
| `--secondary` | `240 3.7% 15.9%`| `240 5% 18%`   | header, one step above the body |
| `--muted`     | `240 3.7% 15.9%`| `240 5% 22%`   | badges + Advanced Settings |
| `--accent`    | `240 3.7% 15.9%`| `240 5% 27%`   | hover |
| `--border`    | `240 3.7% 15.9%`| `240 5% 20%`   | |
| `--input`     | `240 3.7% 15.9%`| `240 5% 20%`   | |

> Contrast direction differs by mode: in light mode the badges are **darker**
> than the header; in dark mode they are **lighter** (more elevated). The
> requirement is only that header and badges never share a shade — both modes
> satisfy it, and elevation reads more naturally in dark mode.

**2. Component class changes**

- `src/components/header.tsx` — header bar `bg-background` → `bg-secondary`.
- `src/components/encrypted-badge.tsx` — `HEADER_PILL_CLASS`
  `bg-secondary text-secondary-foreground` → `bg-muted text-foreground`
  (hover stays `hover:bg-accent`). This class is shared by the "100% encrypted"
  badge and the About pill.
- `src/components/room-entry.tsx` — Advanced Settings container `bg-muted/70` →
  `bg-muted` (exact match with the badges); its collapse-toggle hover
  `hover:bg-muted` → `hover:bg-accent` and the inner switch row
  `hover:bg-muted/50` → `hover:bg-accent` (the old muted hovers were invisible
  once the container itself became solid `bg-muted`).

**Migration to a sibling:** copy the token values above into the sibling's
`globals.css` (matching `:root` / `.dark`), then apply the same `bg-secondary`
(header), `bg-muted` (badges + raised panels), and `hover:bg-accent` (their
hover) class choices to the equivalent components.

---

### 2026-07-08 — Advanced Settings control edges keep definition on the muted panel (issue #56 / PR #58)

Goal: after the panel became a solid `bg-muted`, the resting controls that sit
directly on it lost their outline in **light mode** — `--border` and `--input`
(both `90%`) share the panel's lightness (`--muted` `240 5% 90%`), so the
Private/Public switch row border and its off-state track were near-invisible
until hover/toggle. Give those edges the next step darker.

**1. Token values** — no `globals.css` changes. This entry reuses the existing
`--accent` token (light `240 5% 86%`, dark `240 5% 27%`) — deliberately one step
darker than `--muted`, so it reads as an edge in both modes:

| Token      | Light          | Dark          | Relation to panel (`--muted`) |
| ---------- | -------------- | ------------- | ----------------------------- |
| `--muted`  | `240 5% 90%`   | `240 5% 22%`  | the Advanced Settings panel |
| `--accent` | `240 5% 86%`   | `240 5% 27%`  | one step off → visible edge |

**2. Component class changes**

- `src/components/room-entry.tsx` — the Private/Public switch row `border` →
  `border border-accent`; the off-state switch track `bg-input` → `bg-accent`
  (the `on` state stays `bg-primary`). Nothing else changes; the `--border` /
  `--input` tokens are untouched so inputs elsewhere (on `bg-card` / white) keep
  their hairline.

**Migration to a sibling:** wherever a bordered control or an off-state toggle
track sits on the `bg-muted` raised panel, use `border-accent` / `bg-accent`
instead of the default `border` / `bg-input` so the edge survives the
90%-on-90% collision in light mode.

---

### 2026-07-09 — Public/Private off-state track survives the row hover (issue #62 / PR #62)

Goal: the Private/Public switch row hovers to `bg-accent`, but the previous entry
(#58) also gave the **off-state** track `bg-accent`. On hover the track matched
the row exactly, so the switch became invisible — only the white knob showed.
Give the off-state track its own gray so it reads in the resting, hover, and
toggled states.

**1. Token values** — no `globals.css` changes. Reuses the existing
`--muted-foreground` token at `40%` opacity for the off-state track; it stays
distinct from both the `--muted` panel and the `--accent` hover in both modes:

| Token               | Light         | Dark          | Role                              |
| ------------------- | ------------- | ------------- | --------------------------------- |
| `--muted`           | `240 5% 90%`  | `240 5% 22%`  | the Advanced Settings panel       |
| `--accent`          | `240 5% 86%`  | `240 5% 27%`  | row border + row `hover` fill     |
| `--muted-foreground`| `240 3.8% 46.1%` | `240 5% 64.9%` | off-state track (`/40` opacity) |

**2. Component class changes**

- `src/components/room-entry.tsx` — the off-state switch track
  `bg-accent` → `bg-muted-foreground/40` (the `on` state stays `bg-primary`, the
  row keeps `border-accent` + `hover:bg-accent`). The track no longer collides
  with the row's own hover fill.

**Migration to a sibling:** for any off-state toggle track that sits inside a row
which itself hovers to `bg-accent`, use `bg-muted-foreground/40` (not `bg-accent`)
so the track stays visible when the row is hovered.
