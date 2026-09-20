---
name: Tips Beauty
description: Arabic-first Sudanese cosmetics commerce — a friendly sky-blue Storefront over a confident dark-console Admin Portal
colors:
  sky-blue: "#005696"
  sky-blue-soft: "#f0f9ff"
  palm-green: "#22AD52"
  aqua-glow: "#00AEEF"
  storefront-surface: "#f9fafb"
  storefront-border: "#e5e7eb"
  storefront-ink: "#1f2937"
  admin-surface: "#f8fafc"
  admin-border: "#f1f5f9"
  admin-console: "#0f172a"
typography:
  storefront-display:
    fontFamily: "Cairo, sans-serif"
    fontWeight: 700
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    lineHeight: 1.2
  storefront-body:
    fontFamily: "Cairo, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
    lineHeight: 1.5
  storefront-label:
    fontFamily: "Cairo, sans-serif"
    fontWeight: 700
    fontSize: "0.625rem"
    letterSpacing: "0.1em"
  admin-heading:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 900
    fontSize: "1.875rem"
    letterSpacing: "-0.02em"
  admin-body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "0.875rem"
components:
  button-primary:
    backgroundColor: "{colors.sky-blue}"
    textColor: "#ffffff"
    rounded: "12px"
    padding: "14px 24px"
  button-primary-admin:
    backgroundColor: "{colors.admin-console}"
    textColor: "#ffffff"
    rounded: "16px"
    padding: "12px 24px"
  card:
    backgroundColor: "#ffffff"
    rounded: "16px"
  card-admin:
    backgroundColor: "#ffffff"
    rounded: "24px"
---

# Design System: Tips Beauty

## Overview

**Creative North Star: "The Clear Sky Counter"**

Tips Beauty's Storefront is a bright, approachable beauty counter lit by open sky-blue light: generously rounded white cards, soft colored-glow shadows, and Arabic type (Cairo) carrying most of the personality since imagery is still thin. It is warm and optimistic, never clinical or minimal-for-its-own-sake — decorative blurred color circles and a blue-to-teal hero gradient signal "beauty retail," not "SaaS dashboard."

The Admin Portal is a deliberately separate identity: **"The Confident Dark Console."** Where the Storefront invites, the Admin Portal commands — a near-black slate-900 sidebar, heavyweight `font-black` labels, and a near-black (not sky-blue) primary button say "this is a work tool, not the shop." The two surfaces share the same brand color primitives (sky blue, palm green, aqua glow) and the same generous-radius, soft-shadow language, but never share type family, base neutral (warm gray vs. cool slate), or which color leads a primary action. This split is intentional, confirmed with the product owner — do not unify them.

**Key Characteristics:**
- Two surfaces, one palette: sky blue / palm green / aqua glow recur everywhere; only their *role* changes per surface.
- Generously rounded throughout (12–24px); nothing in either surface uses a sharp corner.
- Flat by default; a soft, color-tinted shadow "glow" appears only under primary actions and active nav states, never on resting cards.
- RTL Arabic is the default reading direction on both surfaces; layouts must be built RTL-first, not mirrored after the fact.

## Colors

Both surfaces draw from one three-color brand palette, but each surface pairs it with its own neutral ground.

### Primary
- **Sky Blue** (`#005696`): The Storefront's dominant color — primary CTAs, active nav/tab states, links, focus rings, icon accents. Carries the vast majority of color on the Storefront.

### Secondary
- **Palm Green** (`#22AD52`): Rare and specific — used only for the cart-count badge and success/positive accents. Never used as a CTA fill.

### Tertiary
- **Aqua Glow** (`#00AEEF`): Decorative only — soft blurred glow shapes behind hero sections. Never used on text, borders, or interactive elements.

### Neutral — Storefront
- **Storefront Surface** (`#f9fafb`, gray-50): Page background, input fill.
- **Storefront Border** (`#e5e7eb`, gray-200): Card/input borders, dividers.
- **Storefront Ink** (`#1f2937`, gray-800): Primary body text.

### Neutral — Admin Portal
- **Admin Surface** (`#f8fafc`, slate-50): Page background behind cards.
- **Admin Border** (`#f1f5f9`, slate-100): Card borders, table header tint.
- **Admin Console** (`#0f172a`, slate-900): The sidebar fill *and* the primary button fill — deliberately near-black rather than brand-blue, marking "operate" actions as distinct from "shop" actions.

### Semantic Status — Admin Portal
A separate, deliberately-used palette for state and category, kept apart from the three brand colors above. Always the `-50` tint as a background with the matching `-600`/`-700` shade as text/icon — never gray text on these tints.
- **Emerald** (`bg-emerald-50` / `text-emerald-600`): Success, active, in-stock, published — the "good" state.
- **Amber** (`bg-amber-50` / `text-amber-600`): Pending, low-stock, awaiting review — the "needs attention" state.
- **Red** (`bg-red-50` / `text-red-600`): Error, out-of-stock, inactive, deletion.
- **Blue / Purple** (`bg-blue-50` / `bg-purple-50` with matching `-600` text): Reserved for dashboard KPI-card variety only (revenue, order count) — never used for status pills.

### Named Rules
**The One Voice Rule.** On the Storefront, sky blue is the only color allowed to say "act here" (buttons, active states, focus rings). Green and cyan are never used for calls to action — reserve them for their single existing roles (badge count, decoration) so they stay legible when they do appear.

**The Console Contrast Rule.** The Admin Portal's primary button is never sky-blue — it is near-black (`admin-console`). Sky blue in the Admin Portal is reserved for the active sidebar item and focus rings only, so the one primary action per screen stays visually unambiguous against a UI that otherwise uses blue for navigation state.

## Typography

**Storefront:** Cairo (with system sans-serif fallback), loaded via Google Fonts, for everything — headings, body, and labels.
**Admin Portal:** Inter (with system-ui fallback), loaded via Google Fonts.

**Character:** The Storefront pairs a warm, rounded Arabic sans (Cairo) at moderate weight (700 for headings, 400 body) with soft color — approachable, retail-warm. The Admin Portal leans on extreme weight contrast instead of color or serif flourish: `font-black` (900) headings and labels against a plain, quiet body, reading as "no-nonsense operations tool."

### Hierarchy — Storefront
- **Display** (700, `clamp(1.875rem, 4vw, 3rem)`, 1.2): Hero headline only (`HomePage` hero, auth page titles).
- **Body** (400, 1rem, 1.5): Paragraph copy, descriptions.
- **Label** (700, 0.625rem/10px, 0.1em tracking, uppercase): Brand name on product cards, small eyebrow tags.

### Hierarchy — Admin Portal
- **Heading** (900, 1.875rem/30px, -0.02em tracking): Page titles (`PageHeader`).
- **Body** (400, 0.875rem/14px): Table cells, paragraph text.
- **Label** (900, 0.625rem/10px, 0.1em tracking, uppercase): Field labels, table headers, status pills.

### Named Rules
**The Weight-Over-Ornament Rule (Admin).** The Admin Portal never reaches for a second typeface or color to create hierarchy — it reaches for weight. `font-black` marks anything structurally important (headings, labels, table headers); everything else stays regular weight.

## Layout

Both surfaces use Tailwind's default 4px spacing scale with no custom overrides — no bespoke spacing tokens exist to extract. Both are mobile-first and built RTL (`dir="rtl"` at the document root); breakpoints are Tailwind defaults (`md:` at 768px, `lg:` at 1024px).

**Storefront:** Single-column, content capped at `max-w-4xl`, centered. No persistent chrome besides a sticky translucent header (`backdrop-blur-md`) — the product grid and detail pages are the whole experience.

**Admin Portal:** Classic operate shell — a fixed 288px (`w-72`) dark sidebar (collapses to an overlay drawer under `lg:`) plus a scrollable main content column capped at `max-w-[1600px]`. This is the one place the two surfaces structurally diverge, appropriately — a console needs persistent navigation; a shop doesn't.

## Elevation & Depth

Flat by default on both surfaces. Depth is used sparingly and always as a *response to emphasis*, never as ambient decoration on resting cards, which carry only a barely-there `shadow-sm`.

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Default for every card/container on both surfaces — present but nearly invisible.
- **Storefront emphasis glow** (`box-shadow: 0 10px 15px -3px rgb(0 86 150 / 0.15), 0 4px 6px -4px rgb(0 86 150 / 0.15)`): Primary CTAs and the search bar — a sky-blue-tinted glow, confirmed as the deliberate "this is the action" signal.
- **Admin emphasis glow** (`box-shadow: 0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)`): The primary button and the active sidebar item — a near-black-tinted glow, echoing `admin-console` rather than sky blue.

### Named Rules
**The Tinted-Glow Rule.** A shadow is only ever colored when it sits under the one primary action on screen, and the tint always matches that element's own fill color (blue glow under a blue button, dark glow under a dark button). Every other surface — cards, inputs, secondary buttons — stays a neutral, near-invisible `shadow-sm`.

## Shapes

Both surfaces are generously rounded with no sharp corners anywhere; radius scales with the size of the element rather than following one fixed value.

- **Small elements** (inputs, buttons, badges): 12px (`rounded-xl`).
- **Cards, search bars** (Storefront): 16px (`rounded-2xl`).
- **Cards** (Admin Portal): 24px (`rounded-3xl`) — visibly softer/larger than the Storefront's card radius, part of the console's heavier, more padded feel.
- **Pills, avatars, badges**: fully round (`rounded-full`).

Borders are hairline (1px) and low-contrast — `storefront-border` / `admin-border` — used to separate white cards from a barely-different-toned page background, not to create strong outlines.

## Components

### Buttons
- **Shape:** 12px radius (Storefront), 16px radius (Admin) — see Shapes.
- **Storefront primary:** Sky Blue fill, white text, bold, `14px 24px` padding, tinted glow shadow, hover darkens to `#1d4ed8`, `active:scale-95` tap feedback.
- **Admin primary:** Admin Console (near-black) fill, white text, `font-black`, `12px 24px` padding, dark-tinted glow shadow, hover lightens to slate-800, `active:scale-95` tap feedback.
- **Secondary (Admin):** White fill, `admin-border` outline, slate-600 text — no shadow, used for cancel/dismiss actions.
- **Icon buttons (Storefront):** Circular, translucent white (`bg-white/90`), used for wishlist/share overlays on product imagery — always paired with a `hover:scale-110` micro-interaction.

### Cards / Containers
- **Storefront:** 16px radius, white fill, hairline `storefront-border`, `shadow-sm` at rest; product cards additionally get `active:scale-95` on tap (the whole card is a tap target, not just the CTA).
- **Admin:** 24px radius, white fill, hairline `admin-border`, `shadow-sm` at rest — visibly more padded/softer than the Storefront's cards.

### Inputs / Fields
- **Storefront:** 12px radius, `storefront-surface` fill, `storefront-border` outline, leading icon inset (email/lock icons in auth forms), focus = 2px Sky Blue ring, no border-color change on focus.
- **Admin:** 16px radius, `admin-surface` fill, `admin-border` outline, `font-bold` value text, focus = 2px Sky Blue ring (blue is the one focus color shared by both surfaces).

### Navigation
- **Storefront header:** Sticky, translucent white (`backdrop-blur-md`), logo left, inline text nav right (RTL), active link = Sky Blue + bold, no underline. Mobile collapses to a hamburger-triggered dropdown panel.
- **Admin sidebar:** Fixed 288px, `admin-console` fill, white text at low opacity when inactive; the active item is the one place per screen that gets a solid Sky Blue fill + glow — everything else in the sidebar stays monochrome. Collapses to an overlay drawer under `lg:`.

### Status Pill (signature, Admin)
A small rounded-full badge (`px-2.5 py-1`, `font-black`, 10px uppercase) with exactly two states: active = pale emerald fill/text, inactive = pale slate fill/text. Used for drivers, products, banners — anywhere a staff member needs an at-a-glance on/off read.

## Do's and Don'ts

### Do:
- **Do** keep Sky Blue as the only "act here" color on the Storefront, and Admin Console (near-black) as the only "act here" color in the Admin Portal — see The Console Contrast Rule.
- **Do** scale radius with element size (12px small elements → 16–24px cards → full pills); never introduce a sharp (0px) corner on either surface.
- **Do** keep resting cards at `shadow-sm` only; reserve the tinted glow shadow for the single primary action per screen.
- **Do** build every new screen RTL-first (`dir="rtl"`); Arabic copy and icon placement are the default, not a mirrored afterthought.
- **Do** use the documented Semantic Status palette (emerald/amber/red, `-50` bg + `-600`/`-700` text) for any new status pill or KPI card in the Admin Portal, rather than inventing a new hue.

### Don't:
- **Don't** give the Admin Portal a sky-blue primary button — that would collapse the intentional Storefront/Admin distinction (see Admin identity, confirmed with the product owner).
- **Don't** use Palm Green or Aqua Glow as a call-to-action fill — Green is reserved for the cart badge/success accent, Aqua is decorative-only.
- **Don't** add a new shadow color that isn't a tint of the element's own fill; ambient/neutral shadows on non-primary elements break the Tinted-Glow Rule.
- **Don't** reach for indigo, violet, or any hue outside the documented brand + Semantic Status palettes — it reads as an off-system accident, not a deliberate choice.
