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

### 2026-09-22 — Large social card + "Open source" header pill (PR #69)

Goal: shared links unfurl as a full-width, on-brand 1200×630 card instead of
the 256px favicon thumbnail, and the header gains a quiet "Open source" trust
pill beside "100% encrypted" / "About" — added in the header so it costs the
entry view no vertical space.

**1. Token values** — no `globals.css` changes. The card at `public/og.png` is a
raster baked from the **light** (`:root`) tokens, so the tokens gain a new role
(the social card) with unchanged values:

| Token               | Light (`:root`)  | Hex used in card | Role in the card                         |
| ------------------- | ---------------- | ---------------- | ---------------------------------------- |
| `--background`      | `0 0% 100%`      | `#ffffff`        | card body (unchanged)                    |
| `--foreground`      | `240 10% 3.9%`   | `#09090b`        | wordmark + domain (unchanged)            |
| `--secondary`       | `240 4.8% 95.9%` | `#f4f4f5`        | footer strip, echoing the header (unchanged) |
| `--muted`           | `240 5% 90%`     | `#e4e4e7`        | rounded logo tile, like a header pill (unchanged) |
| `--muted-foreground`| `240 3.8% 46.1%` | `#71717a`        | tagline (unchanged)                      |
| `--border`          | `240 5.9% 90%`   | `#e4e4e7`        | footer top hairline (unchanged)          |

`.dark` — no changes (the card is a static image; it uses the light palette
because the site's `defaultTheme` is light). The footer's "100% encrypted" pill
reuses the `E2EBadge` greens (`green-700` text on `green-500/10`, `green-500/40`
border ≈ `#15803d` / `#e9f9ef` / `#a7e8bf`).

Card layout (1200×630): logo (`icon.png` artwork) 260px on a 300px `--muted`
tile with 36px radius at x=80; wordmark "Clipboard Sharing / Online" 80px bold;
tagline "End-to-end encrypted text / between your devices" 42px medium; a 100px
`--secondary` footer with the domain (32px semibold) left and the green lock
pill right. System sans (Segoe UI / Helvetica Neue / Arial).

**2. Component class changes**

- `src/components/header.tsx` — new external `<a>` pill before `EncryptedBadge`,
  wearing the shared `HEADER_PILL_CLASS` (no new classes): lucide `Github`
  `size-3.5 shrink-0` + `hidden whitespace-nowrap md:inline` "Open source" label
  (icon-only on phones, text from `md:` up — the same responsive format as the
  other pills). `target="_blank" rel="noopener noreferrer"`.
- `src/app/layout.tsx` — `twitter.card` `summary` → `summary_large_image`;
  `OG_IMAGE` (`src/lib/site.ts`) `/icon.png` 256×256 → `/og.png` 1200×630.

**Migration to a sibling:** render a 1200×630 PNG from the sibling's own light
tokens with the layout above (swap the wordmark, tagline and domain), save it as
`public/og.png`, point the Open Graph / Twitter image at it with accurate
`width`/`height`, and set `twitter.card: "summary_large_image"`. For the header,
add an icon-only-on-phones `HEADER_PILL_CLASS` link to the sibling's repo
(`Github` icon, "Open source" label from `md:`), placed before its privacy pill.

### 2026-09-22 — Content pages, below-the-fold landing content + site footer (issue #71)

Goal: give the site crawlable long-form pages and an internal link structure
without touching the tool itself. Content reuses the existing panel aesthetic
(`bg-card` bordered sections, as on `/privacy`); a quiet footer links every
page. The homepage entry view is pixel-identical above the fold — the new
content only starts below it.

**1. Token values** — no `globals.css` changes. Existing tokens gain new roles:

| Mode | Variable | Before | After | Note |
| ---- | -------- | ------ | ----- | ---- |
| `:root` / `.dark` | `--card` | unchanged | unchanged | now also the content-page / landing / FAQ panels |
| `:root` / `.dark` | `--muted` | unchanged | unchanged | also the call-to-action panel and the "honest caveat" callout at 50% (`bg-muted/50`) |
| `:root` / `.dark` | `--border` | unchanged | unchanged | also the footer's top hairline (`border-t`) and the use-case tiles |
| `:root` / `.dark` | `--muted-foreground` | unchanged | unchanged | body copy of the content sections and the footer links |

**2. Component class changes**

- `src/app/page.tsx` — `ClipboardApp` is now wrapped in `<div className="min-h-full">`
  (claims the whole first screen of the fixed-height `<main>`), followed by
  `LandingContent` (`mx-auto w-full max-w-3xl space-y-6 pt-16`).
- `src/components/content-page.tsx` (new) — `ContentPage`: `article.mx-auto
  max-w-2xl space-y-6`, centered `size-6` icon + `text-2xl font-semibold
  tracking-tight` H1, `text-center text-muted-foreground` lead.
  `ContentSection`: `space-y-2 rounded-lg border bg-card p-4 md:p-6`, H2
  `text-lg font-semibold tracking-tight` with an optional `size-4` icon, body
  `space-y-3 text-sm leading-relaxed text-muted-foreground`. `StartSharingCta`:
  `flex flex-col items-center gap-3 rounded-lg border bg-muted/50 p-6
  text-center` + a `buttonVariants({ size: "lg" })` link. Inline body links:
  `font-medium text-foreground underline underline-offset-2
  hover:text-muted-foreground`.
- `src/components/faq-section.tsx` (new) — centered `text-xl font-semibold
  tracking-tight` H2; one `space-y-1.5 rounded-lg border bg-card p-4` card per
  question (`font-medium` H3, `text-sm leading-relaxed text-muted-foreground`
  answer), always expanded.
- `src/components/site-footer.tsx` (new, rendered in `layout.tsx` inside
  `<main>` after `{children}`) — `mx-auto mt-12 max-w-3xl border-t pt-6 text-sm
  text-muted-foreground`; links in a centered `flex flex-wrap gap-x-5 gap-y-2`
  row, `hover:text-foreground hover:underline underline-offset-2`; a `mt-3
  text-center text-xs` tagline.
- `src/components/header.tsx` — no class change; the home click also scrolls
  `<main>` back to the top now that `/` scrolls.

**Migration to a sibling:** no token values to copy. Mirror the three building
blocks (content section card, muted CTA panel, bordered footer link row) with
the classes above. If the sibling has a fixed-height shell with a scrolling
`<main>`, wrap its tool in `min-h-full` before appending below-the-fold content
so the tool keeps the whole first screen, and render the footer inside `<main>`
after the page.

### 2026-09-29 — Drop the header "Open source" pill; trim the footer (issue #71 / PR #75)

Goal: a quieter header and footer. The header keeps only "100% encrypted" and
"About" (reverting the "Open source" pill added in PR #69); the footer lists
internal pages only, and the homepage "Open source" section keeps a single,
centered GitHub button. The repo stays linked from `/about`, the homepage and
`/security`.

**1. Token values** — no `globals.css` changes.

| Mode | Variable | Before | After | Note |
| ---- | -------- | ------ | ----- | ---- |
| `:root` / `.dark` | — | — | — | no token touched |

**2. Component class changes**

- `src/components/header.tsx` — removed the external `<a>` "Open source" pill
  (`HEADER_PILL_CLASS`, `Github` icon) before `EncryptedBadge`; the pill row is
  now `EncryptedBadge` + About.
- `src/components/site-footer.tsx` — removed the trailing external "Source on
  GitHub" `<li>`; the link row is the `PAGES` registry only (Home, Phone to PC,
  Privacy, Security, About). Classes unchanged.
- `src/components/landing-content.tsx` — "Open source — check it yourself"
  button row `flex flex-wrap gap-2` → `flex justify-center`; removed the
  `buttonVariants({ variant: "outline", size: "sm" })` "Privacy & security"
  link, leaving the one `buttonVariants({ size: "sm" })` GitHub button.
- `src/app/privacy/page.tsx` — H1 text "Privacy & Security" → "Privacy" (no
  class change).

**Migration to a sibling:** if the sibling replayed the 2026-09-22 "Open
source" header pill, delete that pill. Keep footer link rows to internal pages
only, and center a lone call-to-action button with `flex justify-center`.

### 2026-09-30 — Links land at the top with the header visible; in-section CTA; password-generate beat (PR #76)

Goal: following any internal link lands on the very top of the new page with
the header in view (it used to land a few pixels down with the header scrolled
away). Content pages drop the stand-alone call-to-action panel in favor of a
centered button inside the section it belongs to. Generating a password gives
subtle feedback — the pressed button and the password field "beat" — so it
never looks like a no-op when the password is masked.

**1. Token values** — no `globals.css` changes. Existing tokens gain new roles:

| Mode | Variable | Before | After | Note |
| ---- | -------- | ------ | ----- | ---- |
| `:root` / `.dark` | `--accent` | unchanged | unchanged | also the peak tint of the password-generate button beat |
| `:root` / `.dark` | `--ring` | unchanged | unchanged | also the faint (20%) ring pulsed on the password field |
| `:root` / `.dark` | `--muted` | unchanged | unchanged | no longer used by a CTA panel (`StartSharingCta` removed) |

**2. Component class changes**

- `src/app/layout.tsx` — shell `flex h-screen flex-col overflow-hidden` →
  `app-shell flex h-dvh flex-col overflow-clip`. `overflow-hidden` is still a
  (programmatic) scroll container, so Next's navigation `scrollIntoView()`
  could scroll the header out of view; `overflow-clip` cannot scroll, and
  `h-dvh` stops phones' overshooting `100vh` from making the document scroll.
  Also renders a new `RouteScrollReset` after `SiteFooter` inside `<main>`.
- `src/app/globals.css` — new `.app-shell` fallbacks for browsers without
  `dvh` (< iOS 15.4) or `overflow: clip` (< Safari 16): `@supports not (height:
  100dvh)` → `height: 100vh`, `@supports not (overflow: clip)` → `overflow:
  hidden`. (`@supports` rather than a duplicated declaration, so a CSS minifier
  can't collapse the fallback.)
- `src/components/route-scroll-reset.tsx` (new, no markup) +
  `src/lib/route-scroll.ts` (new) — on every pathname change, a layout effect
  scrolls `<main>` and the window to `top: 0`, unless the URL has a
  `#fragment` (Next already scrolled to it).
- `src/components/content-page.tsx` — `StartSharingCta` (`flex flex-col
  items-center gap-3 rounded-lg border bg-muted/50 p-6 text-center` panel)
  removed; replaced by `OpenClipboardButton`, the bare `buttonVariants({ size:
  "lg" })` "Open the clipboard →" link. `ContentPage`'s `title` accepts a
  `ReactNode`.
- `src/app/share-text-between-phone-and-pc/page.tsx` — H1 gets a phone-only
  text "Share text between your phone and PC" → "Share text between phone and
  PC", with a phone-only break (`<br className="sm:hidden" />` after
  "between"); `OpenClipboardButton`
  sits at the bottom of the "Phone to PC in under a minute" section in a
  `flex justify-center pt-1` row. `src/app/security/page.tsx` — trailing CTA
  panel removed.
- `src/components/privacy-highlights.tsx` — "…check our privacy policy" →
  "…check privacy & security", two links (`/privacy/`, `/security/`) with the
  existing `underline underline-offset-2 hover:text-foreground`.
- `src/components/room-entry.tsx` + `src/lib/motion.ts` (new) — no class
  change; the Password Simple/Safer buttons play `BUTTON_BEAT` (380 ms
  ease-out: `scale(0.95)` + `hsl(var(--accent))` at 30%, `scale(1.03)` at
  65%) and the password input plays `FIELD_BEAT` (480 ms ease-out:
  `letter-spacing: 0.18em` + `box-shadow: 0 0 0 3px hsl(var(--ring) / 0.2)` at
  35%), via the Web Animations API with implicit end keyframes. Skipped under
  `prefers-reduced-motion`.

**Migration to a sibling:** no token values to copy. If the sibling has the
same fixed-height shell with a scrolling `<main>`, swap `h-screen
overflow-hidden` → `app-shell h-dvh overflow-clip`, copy the two `.app-shell`
`@supports` fallbacks from `globals.css`, and add the `RouteScrollReset`
component (with `src/lib/route-scroll.ts`) after its page content. Put a single centered call-to-action button
inside the relevant section rather than a separate panel. For any control whose
effect can be invisible, copy `src/lib/motion.ts` and play the two beats on
the control and its target field.

### 2026-10-03 — Filled share buttons, creator attention pump, no-wrap editor, first-visit note (issue #72)

Goal: make "create → share → done" the obvious path. The Share options become
the room's primary-filled call to action (the creator's copy pumps twice on
arrival), the joiner's **Leave** reads as the same irreversible exit as the
creator's **Remove room**, Push/Clear grey out when they would do nothing, and
the editor keeps long lines intact. A share-link recipient on their first visit
gets a one-line note on what the site is.

**1. Token values** — no `globals.css` changes. Existing tokens gain new roles:

| Mode | Variable | Before | After | Note |
| ---- | -------- | ------ | ----- | ---- |
| `:root` / `.dark` | `--primary` / `--primary-foreground` | unchanged | unchanged | now also the fill of the four Share-options buttons |
| `:root` / `.dark` | `--destructive` / `--destructive-foreground` | unchanged | unchanged | now also the joiner's **Leave** button |
| `:root` / `.dark` | `--muted` | unchanged | unchanged | also the `bg-muted/50` surface of the first-visit explainer (same as the info banner) |

**2. Component class changes**

- `src/components/share-controls.tsx` — `ShareButton` `variant="outline"` →
  `variant={revealed ? "outline" : "default"}`: all four buttons are filled;
  Show password / Show QR flip to `outline` while their reveal is open (label
  "Hide …") and back when it closes. The `Share options` `<h2>` and each button
  carry `data-attention`; with `attention` (creator only) they play
  `ATTENTION_BEAT` once on mount. While **Copy password** shows its "Copied"
  confirmation it takes the disabled look — `w-full justify-start gap-2` →
  `w-full justify-start gap-2 pointer-events-none opacity-50` plus
  `aria-disabled` (not the real `disabled` attribute, which would drop focus).
- `src/lib/motion.ts` — new `ATTENTION_BEAT`: `BUTTON_BEAT`'s pump at 3× the
  amplitude and without the background tint (`scale(0.85)` at 30%,
  `scale(1.09)` at 65%, 380 ms ease-out), `iterations: 2`, `delay: 300`. At the
  peak, adjacent buttons briefly overlap a few px across their `gap-2`
  (transforms never reflow). Skipped under `prefers-reduced-motion`.
- `src/components/clipboard-app.tsx` — joiner **Leave** `variant="outline"` →
  `variant="destructive"` (same as `CreatorPanel`'s Remove room).
- `src/components/room-editor.tsx` — textarea `min-h-60` → `min-h-54
  sm:min-h-60` (one text line / 10% shorter on portrait phones so the Share
  options fit the same screen), plus `wrap="off" overflow-x-auto
  whitespace-pre` (horizontal scroll instead of soft-wrap). Push is disabled
  in live push-mode rooms while the text equals the last-synced copy (not in
  manual rooms, not "Sync now"); Clear is
  disabled while the box is empty — the existing `disabled:opacity-50` style.
- `src/components/first-visit-explainer.tsx` (new) — `flex items-start gap-2
  rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground` row:
  lock icon, one sentence with a `TEXT_LINK_CLASS` "How it works ↗" link
  (`target="_blank"`), and an `X` dismiss button (`hover:text-foreground`).

**Migration to a sibling:** no token values to copy. For a panel whose buttons
are the next step, use the filled `default` button variant and swap a
Show/Hide toggle to `outline` while its reveal is open. To point a user at
them once, copy `ATTENTION_BEAT` from `src/lib/motion.ts` and play it on mount
on the heading and buttons. Grey out a one-shot button's brief "Copied"
confirmation with `pointer-events-none opacity-50` + `aria-disabled`. Give an irreversible "leave" action the
`destructive` variant. For a code/text editor textarea, add `wrap="off"
overflow-x-auto whitespace-pre`. A one-time note uses the info-banner surface
(`bg-muted/50`, `border`, `text-muted-foreground`) with a dismiss `X`.
