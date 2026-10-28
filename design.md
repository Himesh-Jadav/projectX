# Smaran.ai: DESIGN.md

Version 1.1 · 28 Oct 2026 (sidebar shell, 768px chat column, smoke background, login and account pages). Jet black, cerulean blue, neon rose.
This replaces the "dark glass over a photo" look in `UI_PROMPT.md` and PRD section 13. **Behaviour, API calls, state logic and the demo script do not change.** This document changes how things look and which surface is visible when.

---

## 1. Direction

- **Dark only.** One calm surface. The background is generated in code (a soft smoke shader, then static glows), never a photo, so nothing depends on the venue Wi-Fi.
- **Jet** is the canvas and every surface.
- **Cerulean** means "you" and "do": your queries, primary actions, links, focus.
- **Neon rose** means "memory" and "attention": memory chips, scores, conflicts, the live indicator.
- Neon is the exception. If more than two neon things are visible at once, remove one.
- Premium comes from restraint: thin borders, big type contrast, glow only where it carries meaning.

## 2. Screen architecture (v1.1: sidebar shell, one primary screen at a time)

The layout from your current build stays: **left sidebar + main area**, like ChatGPT. The sidebar is the project switcher, so the separate "ProjectPicker" screen is gone.

```
boot ──► /api/auth/me 401 ───────────► AuthScreen   (full screen, shader background, NO sidebar)
     └─► logged in ──────────────────► AppShell = Sidebar + Main
                                         Main shows exactly ONE of:
                                         · Workspace   (a project is selected)
                                         · Account     (user clicked "Account settings")
                                         · EmptyState  (no project yet: "Create your first workspace")
```

Rules:

1. AuthScreen has no sidebar, no header and no memory panel.
2. In AppShell the sidebar is always there. Main swaps between Workspace, Account and EmptyState with a 200ms crossfade (opacity plus 4px rise).
3. In Workspace the hero (title, subtitle, quick actions) exists **only while the thread is empty**.
4. **Sidebar**: docked 280px at 1024px and up, with a collapse button. Below 1024px it is a left drawer opened by a menu icon in the header. The collapsed state is remembered (localStorage inside try/catch).
5. **Memory panel**: closed by default. The header's "Memory" button toggles it. At 1440px and up it docks on the right (380px) and the chat column re-centres in what is left. Below 1440px it opens as a right drawer over a scrim. (Check: 1440 - 280 - 380 = 780, enough for the 768 chat column.)
6. **Overlays**: only one at a time (dialog, popover, drawer). Dialogs and drawers get a scrim, trap focus, and close on Esc and scrim click. Toasts are the only thing allowed to float without a scrim.
7. Each region scrolls on its own: sidebar project list, thread, panel body. The header and composer never scroll away. `html, body, #root { height: 100dvh; overflow: hidden }`.

Workspace layout, 1440px and up, memory open:

```
┌────────────┬───────────────────────────────────────────┬───────────────────┐
│ [logo]     │ Project name  ● Live     [Memory][Invite][~]│ Memory (7)        │ 56px header
│ Projects 1 ├───────────────────────────────────────────┤ [Used][All]...    │
│ [search]   │                                           │ ┌───────────────┐ │
│ ▌workspace │      ┌───────────────────────────┐        │ │ memory card   │ │
│            │      │ chat column, max 768px    │        │ └───────────────┘ │
│            │      │ (query right, reply left) │        │                   │
│ New ws     │      └───────────────────────────┘        │                   │
│ [name][+]  │      ┌───────────────────────────┐        │                   │
│ (avatar)   │      │ composer, same 768px      │        │      380px        │
│ himesh_02  │      └───────────────────────────┘        │                   │
└────────────┴───────────────────────────────────────────┴───────────────────┘
   280px                     fluid
```

Layers: background 0 · shell 10 · header and composer 20 · drawer 30 · scrim 40 · dialog and popover 50 · toast 60.

Background: one `<Backdrop>` component is mounted once at the app root, behind everything (`fixed inset-0 z-0`), and everything else sits at `relative z-10`. It has three modes, defined in section 12:

| Where | Mode |
|---|---|
| Login and sign up | `smoke-strong` (animated shader) |
| Workspace with an empty thread | `smoke-soft` (the same shader, dimmer) |
| Workspace after the first message, Account page, EmptyState | `calm` (static glows with a very slow drift) |

## 3. Color

### 3.1 Palette

**Jet (neutrals, a very slightly blue black)**

| Token | Hex | Use |
|---|---|---|
| jet-950 | `#050507` | App background, text on bright fills |
| jet-900 | `#0A0B10` | Top bar, memory panel, input fields |
| jet-850 | `#10121A` | Cards, responses, composer, dialogs |
| jet-800 | `#171A24` | Hover surface, active tab, toast, tooltip |
| jet-700 | `#222736` | Strong border, pressed surface |
| jet-650 | `#181B27` | Subtle border (decorative) |
| jet-500 | `#5B6379` | Input border, disabled text |
| jet-400 | `#7C849A` | Muted text |
| jet-300 | `#A7AEC0` | Secondary text |
| jet-100 | `#F2F4F8` | Primary text (never pure white) |

**Cerulean**

| Token | Hex | Use |
|---|---|---|
| cerulean-300 | `#8AD2F7` | Links, focus ring, text on cerulean tints |
| cerulean-400 | `#45B8F0` | Hover fill, active status dot |
| cerulean-500 | `#1BA3E6` | Primary fill |
| cerulean-600 | `#0C86C3` | Pressed fill |
| cerulean-700 | `#0A6A9E` | Rarely: dark accents |

**Neon rose**

| Token | Hex | Use |
|---|---|---|
| neon-300 | `#FF9EC7` | Text on neon tints, pending dot |
| neon-400 | `#FF66A6` | Hover fill, error text |
| neon-500 | `#FF3D8B` | Memory accent fill, glow |
| neon-600 | `#E8267A` | Pressed fill, invalid marker |
| neon-700 | `#B3125A` | Danger fill (with white text) |

### 3.2 Roles

| Role | Value |
|---|---|
| Page background | jet-950 |
| Top bar, memory panel | jet-900 |
| Card, response, composer, dialog | jet-850 |
| Hover surface, active tab, toast | jet-800 |
| Text: primary, secondary, muted | `#F2F4F8`, `#A7AEC0`, `#7C849A` |
| Query text | `#EAF7FF` |
| Link | cerulean-300, hover cerulean-400 |
| Focus ring | cerulean-300, 2px, offset 2px |
| Primary action | fill cerulean-500, **text jet-950** |
| Memory / attention | fill neon-500 (text jet-950), text neon-300 |
| Destructive confirm | fill neon-700, text `#FFFFFF` |
| Error text | neon-400 |

**Text on a cerulean fill is always jet-950, never white.** White on cerulean-500 is only 2.83:1.

### 3.3 Alpha recipes (resolved over their real backgrounds)

| Recipe | Over | Resolved |
|---|---|---|
| Query bubble: cerulean-500 at 18% | jet-950 | `#09212F` |
| Query border: cerulean-500 at 35% | n/a | `rgba(27,163,230,0.35)` |
| Cerulean tint (hover, selected): cerulean-500 at 10% | jet-850 | `#11202E` |
| Memory chip: neon-500 at 12% | jet-850 | `#2D1728` |
| Memory chip hover: neon-500 at 20% | jet-850 | `#401B31` |
| Memory chip border: neon-500 at 35% | jet-850 | `#642142` |
| Conflict card: neon-500 at 8% | jet-850 | `#231523` |
| Scrim | n/a | `rgba(5,5,7,0.72)` plus `backdrop-filter: blur(6px)` |

### 3.4 Gradients and glow (the only ones allowed)

- **Wordmark `.ai`**: text gradient `linear-gradient(90deg, #45B8F0, #FF66A6)`.
- **Score bar fill**: `linear-gradient(90deg, #1BA3E6, #FF3D8B)`.
- **Hairline border** for the auth card, dialogs and the focused composer:
  ```css
  border: 1px solid transparent;
  background:
    linear-gradient(#10121A, #10121A) padding-box,
    linear-gradient(135deg, rgba(27,163,230,0.7), rgba(255,61,139,0.7)) border-box;
  ```
- **Glow tokens**
  - `glow-cerulean`: `0 0 0 1px rgba(27,163,230,0.55), 0 0 28px rgba(27,163,230,0.22)`
  - `glow-neon`: `0 0 0 1px rgba(255,61,139,0.50), 0 0 28px rgba(255,61,139,0.22)`
  - `glow-sm` (button hover): `0 0 20px rgba(27,163,230,0.35)`; rose version uses `rgba(255,61,139,0.35)`
- Glow appears only on: composer focus (cerulean), the selected memory chip or card (neon), primary or rose button hover, and the live dot. Never more than two at a time.

## 4. Contrast ledger (WCAG, computed)

Text needs 4.5:1, large text and UI parts need 3:1.

| Pair | Ratio |
|---|---|
| Primary `#F2F4F8` on jet-950 / 900 / 850 / 800 | 18.49 / 17.85 / 16.98 / 15.77 |
| Secondary `#A7AEC0` on jet-950 / 900 / 850 / 800 | 9.17 / 8.85 / 8.42 / 7.82 |
| Muted `#7C849A` on jet-950 / 900 / 850 / 800 | 5.45 / 5.26 / 5.01 / 4.65 |
| Cerulean-300 on jet-950 / 850 | 12.26 / 11.25 |
| Cerulean-400 on jet-950 / 850 | 9.08 / 8.34 |
| Cerulean-500 on jet-950 / 850 | 7.20 / 6.61 |
| Neon-300 on jet-950 / 850 | 10.64 / 9.76 |
| Neon-400 on jet-950 / 850 | 7.47 / 6.86 |
| Neon-500 on jet-950 / 850 | 6.10 / 5.60 |
| jet-950 text on cerulean-400 / 500 / 600 (hover / rest / pressed) | 9.08 / 7.20 / 5.06 |
| jet-950 text on neon-400 / 500 / 600 (hover / rest / pressed) | 7.47 / 6.10 / 4.84 |
| White on danger neon-700 `#B3125A` / hover `#C2145F` | 6.66 / 5.90 |
| Query text `#EAF7FF` on `#09212F` | 15.15 |
| Secondary on the query bubble | 7.45 |
| neon-300 on chip `#2D1728` / chip hover `#401B31` | 8.67 / 7.73 |
| Primary / secondary / neon-300 on conflict card `#231523` | 15.85 / 7.86 / 9.12 |
| Primary / cerulean-300 on cerulean tint `#11202E` | 15.02 / 9.96 |
| cerulean-300 / neon-300 on jet-800 (active tab) | 10.45 / 9.07 |
| Placeholder (muted) on jet-850 | 5.01 |
| Input border jet-500 on jet-850 | 3.12 |
| Status dots on jet-850: active / pending / superseded / invalid | 8.34 / 9.76 / 5.01 / 4.44 |
| Disabled text jet-500 on jet-850 (exempt) | 3.12 |
| **Never use:** white on cerulean-500 | 2.83 (fails) |
| **Never use:** jet-950 on the old neon `#E01F70` | 4.46 (fails; that is why neon-600 is `#E8267A`) |

## 5. Typography

| Role | Font | Why |
|---|---|---|
| Display and headings | **Bricolage Grotesque** (600-700) | A characterful grotesque with tight, slightly quirky shapes. Not the usual Inter or Space Grotesk. |
| UI and body | **Instrument Sans** (400-600) | Clean, warm and very legible at 14-16px, with a narrower feel than Inter. |
| Numbers, ids, dates, scores, labels of data | **JetBrains Mono** (400-500) | Makes memory metadata read as data. |

Scale (px, size/line-height):

| Token | Spec | Used for |
|---|---|---|
| display | 56/60, 700, tracking -0.03em, Bricolage | Wordmark on the empty state and auth |
| h1 | 32/38, 600, tracking -0.02em, Bricolage | Project picker title |
| h2 | 22/28, 600, Bricolage | Dialog titles |
| h3 | 17/24, 600, Bricolage | Panel title, card titles |
| body-lg | 16/26, 400, Instrument | Assistant responses, composer text |
| body | 15/22, 400, Instrument | Queries, memory content, UI text |
| small | 13/19, 500, Instrument | Reasons, buttons, tabs, chips |
| label | 12/16, 600, tracking 0.08em, uppercase, Instrument | Section labels, form labels |
| mono | 13/20, 400, JetBrains Mono | Scores, ids |
| mono-sm | 12/16, 500, JetBrains Mono | Dates, type badges, counts |

Minimum text size is 12px. Response measure max 68ch.

Fonts must work offline (use Fontsource, no CDN):

```
npm i @fontsource-variable/bricolage-grotesque @fontsource-variable/instrument-sans @fontsource-variable/jetbrains-mono
```
```js
// main.jsx
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
```
Fontsource variable packages register the family as `"<Name> Variable"`, so every stack lists both names (see section 9). If a package name does not install, use this link instead:
`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap`

## 6. Shape, spacing, motion

- Spacing grid is 4px: 4, 8, 12, 16, 20, 24, 32, 40, 56.
- Radii: 8 (badges), 10 (icon buttons), 12 (buttons, inputs, tabs), 16 (cards), 20 (composer, dialogs), 999 (pills).
- Elevation comes from borders and glow, not from big shadows. Popovers and dialogs use `0 16px 48px rgba(0,0,0,0.6)`.
- Motion: hover and press 150ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; panels and drawers 220ms; dialogs 200ms (fade plus scale from 0.98); new messages fade up 8px over 180ms; typing dots pulse 1.2s.
- `@media (prefers-reduced-motion: reduce)` removes all movement and keeps only opacity changes.
- Hit targets are at least 36px tall (primary buttons 40px, inputs 44px).

## 7. Interaction states (apply to every control)

| State | Rule |
|---|---|
| Default | As specified per component below |
| Hover | One step up: surface 850 to 800, or border to a stronger tone. 150ms. Never hover-only for a critical action. |
| Pressed | One more step, plus `translateY(1px)` on buttons. No scale. |
| Focus-visible | `outline: 2px solid #8AD2F7; outline-offset: 2px`. Never removed. |
| Disabled | Fill jet-800, text jet-500, `cursor: not-allowed`, no hover change |
| Loading | A 14px spinner replaces the icon; the button keeps its width and is disabled |
| Selected | Cerulean tint with cerulean-300 text (navigation), or neon border and `glow-neon` (memory objects) |

**Color is never the only signal.** Status always has a distinct shape and a word in history views (see 8.8).

## 8. Components

### 8.1 Buttons (height 40, radius 12, padding 0 16, text 14/500)

| Variant | Default | Hover | Pressed | Disabled |
|---|---|---|---|---|
| Primary | fill `#1BA3E6`, text `#050507` | fill `#45B8F0` plus `glow-sm` | fill `#0C86C3` | fill `#171A24`, text `#5B6379` |
| Rose (Override) | fill `#FF3D8B`, text `#050507` | fill `#FF66A6` plus rose `glow-sm` | fill `#E8267A` | as above |
| Secondary | transparent, border `#222736`, text `#F2F4F8` | fill `#171A24`, border `#3A4157` | fill `#222736` | border `#181B27`, text `#5B6379` |
| Ghost | transparent, text `#A7AEC0` | fill `#171A24`, text `#F2F4F8` | fill `#222736` | text `#5B6379` |
| Danger confirm | fill `#B3125A`, text `#FFFFFF` | fill `#C2145F` | fill `#9E0F4F` | as above |

Icon buttons are 36x36, radius 10, ghost styling. The send button is 40x40, radius 12, primary styling; disabled when the text is empty or a request is in flight.

### 8.2 Inputs (auth, invite, rename)

Height 44, radius 12, fill jet-900, border `#5B6379`, text 15, placeholder `#7C849A`. Hover: border `#7C849A`. Focus: border `#45B8F0` plus `0 0 0 3px rgba(27,163,230,0.25)`. Error: border `#FF66A6` and a 13px message in `#FF66A6` with a small warning icon. Labels use the `label` style in `#A7AEC0`.

### 8.3 Header (inside Main, not full width)

Height 56, transparent while the thread is empty. Once there are messages it gets a 1px bottom border jet-650 and a solid jet-950 fill at 70%. **No backdrop blur** on the header (blur over an animated canvas is expensive; blur is allowed only on the composer and the auth card).
- Left: menu icon (below 1024px only), project name (Bricolage 16/600), live indicator.
- Right: **Memory** (secondary, with a mono count chip in neon-300; shows a pressed look while the panel is open), **Invite** (secondary, owners only), then the **Ambient** icon button.
- Keep every existing control (New session and so on). Do not remove any, only place it in this row.
- Live indicator: 8px neon-500 dot with a soft pulse and the word "Live" in mono-sm muted. Polling fallback: a hollow dot and "Polling".
- **Ambient toggle** replaces the sun/moon button. The app is dark only, so a theme toggle does nothing. This one turns the animated background on or off (icon: `Wind`, tooltip "Ambient motion on/off"), saved in localStorage inside try/catch. Off means the `calm` mode everywhere.

### 8.4 Hero and composer

- Hero (empty state): wordmark display (`Smaran` in primary, `.ai` in the gradient from 3.4), subtitle body-lg secondary: "Tell me what you've decided. I'll remember why."
- **Composer**: fill `rgba(16,18,26,0.82)` with `backdrop-filter: blur(16px)`, border 1px jet-700, radius 24, padding 12, same 768px column as the thread. Textarea transparent, 16/24, min height 48, grows to 150 and then scrolls. Footer row: memory toggle on the left, send on the right.
  - Focus-within: switch to the hairline border (3.4) plus `glow-cerulean`.
  - The composer is identified by its placeholder and its send button, so its resting border can stay quiet.
- **Memory toggle**: 36px icon button. On: neon-300 icon on `rgba(255,61,139,0.12)`. Off: `#7C849A` icon with a diagonal strike. Tooltip "Memory on/off".
- **Quick actions** (4 pills, empty state only): height 36, fill jet-900, border jet-700, text small `#A7AEC0`. Hover: fill `#11202E`, border `rgba(27,163,230,0.5)`, text primary. They fill the textarea and do not send.
- Conversation state: the composer docks to the bottom with a 24px gap, and a 32px fade (`linear-gradient(transparent, #050507)`) sits above it.

### 8.5 Thread

- **Chat column**: `mx-auto w-full max-w-[768px] px-6` (px-4 below 640px). Query, reply, chips and composer all live inside this one column, so the right and left edges always line up. This fixes the full-width look.
- **Query (your message)**: right aligned, `w-fit max-w-[75%]` (a short question stays small), fill `#09212F`, border `rgba(27,163,230,0.35)`, text `#EAF7FF` body 15/22, radius 18 18 6 18, padding 12 16.
- **Response row**: a 32px avatar tile on the left (fill jet-800, radius 10, sparkle icon in cerulean-300), 12px gap, then the bubble: `w-fit max-w-full` so a short answer stays short and a long one stops at the column edge. Fill jet-850, border jet-700, text primary body-lg 16/26, radius 18 18 18 6, padding 14 18.
  - Always `overflow-wrap: anywhere`. Code blocks scroll horizontally inside the bubble (`overflow-x: auto`) and never widen it.
  - Markdown: links cerulean-300 underlined (offset 3px), hover cerulean-400. Inline code: fill jet-800, text cerulean-300, mono 13, radius 6, padding 2 6. Blockquote: 2px left border `rgba(27,163,230,0.5)`, text secondary. Lists keep 8px item gaps.
  - "Memory off" label under the reply: mono-sm muted.
- **Typing indicator**: a response bubble holding three 6px cerulean-400 dots pulsing in sequence.
- **Memory chips** under a response (8px gap, wrap): pill height 32, fill `#2D1728`, border `#642142`, content `TYPE · first 40 chars` (type in mono-sm uppercase neon-300, content in small neon-300). Hover: fill `#401B31` plus rose `glow-sm`. Selected (after click): border neon-500 plus `glow-neon`.
- **Conflict card** (inline, 16px under the reply): fill `#231523`, border `#642142`, radius 16, padding 16. Top row: label "CONFLICT" in neon-300 plus the existing memory's author and date in mono-sm muted. Body: content primary 15, reason secondary 13. Buttons: **Override** (rose) and **Keep** (secondary). If the viewer cannot resolve it: the text "Waiting for Alice's review" (secondary) and a **Withdraw** ghost button. After resolving, it collapses to one muted line: "Overridden: A → B" or "Kept: A".
- **Check-in card** (new session): fill jet-850, 3px left stripe in cerulean-400, text primary. Buttons: "Still true" (secondary) and "No longer true" (ghost). Raised once per assumption.

### 8.6 Memory panel

Width 380 (docked at 1440px and up, a drawer below, see section 2), fill jet-900, 1px left border jet-650. Header 56px tall to align with the top bar: "Memory" (h3) plus a count chip (mono-sm on jet-800).
- **Tabs**: segmented control, container fill jet-950 with border jet-650, radius 12, padding 4. Tab height 32, radius 8, small text. Inactive: `#7C849A`, hover `#A7AEC0`. Active: fill jet-800, text neon-300. Tabs: **Used**, **All**, **Timeline**, **Activity**.
- Body: padding 16, gap 12, scrolls on its own. Empty state: muted text "No memories yet. Say what you've decided."
- **Memory card**: fill jet-850, border jet-650, radius 16, padding 14 16.
  - Top row: type badge (mono-sm uppercase, tracking 0.06em, text secondary, border jet-700, radius 8, padding 2 8) and the status marker (8.8) on the right.
  - Content: body 15 primary. Reason: small 13/19 secondary. Footer: `by Alice · 24 Oct` in mono-sm muted.
  - `<details>` "Source" in small cerulean-300; the quote sits in a blockquote.
  - Hover: border `#222736`, fill `#13151E`. Selected: border neon-500 plus `glow-neon`.
  - Actions (All tab): Invalidate and Delete as ghost icon buttons, visible on hover **and** focus-within. Delete asks inline: "Delete permanently?" with Yes (danger confirm) and No (ghost). Only shown to the author or an owner.
- **Used tab extras**: a score bar (4px tall, radius 2, track jet-800, fill the gradient from 3.4, width = final score), numbers `sim 0.82 · conf 0.90 · final 0.74` in mono-sm muted, and the "why" line in small secondary.
- **All tab**: filter pills (all, decision, assumption, constraint, outcome) in the quick-action style, with a "Show history" switch. If anything needs review, a **Needs your review** block comes first: label in neon-300 with a count, then conflict cards.
- **Timeline**: vertical 2px jet-700 line, one node per memory, newest on top. The active node is a filled cerulean-400 dot, older ones a dashed ring. Each entry shows date (mono-sm), content, reason.
- **Activity**: one row per event: time (mono-sm muted), actor name in cerulean-300, the action in secondary ("saved a decision: ...", "joined").

### 8.7 Auth screen (login and sign up), restyled from the smoke login component

- Full screen, `smoke-strong` background, no sidebar.
- **Logo at the top of the screen**: the existing logo file, centred, 24px from the top (height 40px on desktop, 32px on mobile). Use the existing asset as it is (find it, see the Codex prompt). Do not redraw it. On the empty state of the chat, the same logo is already in the sidebar.
- **Card**: centred, width 400, fill `rgba(10,11,16,0.62)` with `backdrop-filter: blur(20px)`, 1px border `rgba(255,255,255,0.10)` (a white at 10% is fine here, it is a hairline), radius 20, padding 32, shadow `0 24px 80px rgba(0,0,0,0.55)`.
- Heading "Welcome back" or "Create your account" (Bricolage 28/600), one line of body-secondary under it. A "Log in / Sign up" segmented control stays if the app has one.
- **Inputs use the floating-label underline style from the component**, in our colors: no box, bottom border 2px `#5B6379`, text 15 primary, label sits as a placeholder and floats up to 12px on focus or when filled. Focus: bottom border `#45B8F0` and the label turns `#8AD2F7`. Error: border and message `#FF66A6`. Icons (User, Lock) are 16px in `#7C849A`, turning cerulean-300 on focus. Use the fields we already have (do not add new ones).
- **Submit**: full-width primary button, 44px, text plus an `ArrowRight` that nudges 4px right on hover (150ms).
- **Leave out** from the sample component: "Forgot password", the "or continue with" divider and the Google button. We have no such features, and this task adds none.
- Switch link at the bottom: "Don't have an account? **Sign up**" with the link in cerulean-300, hover cerulean-400.
- Text on the card is always on the card fill, never straight on the shader, so contrast holds (section 12.4).

### 8.11 Sidebar (matches your current layout)

Width 280, fill jet-900 (solid, no blur), 1px right border jet-650, flex column, padding 12.
1. **Logo row**, 64px tall: the logo image, height 32, left aligned. Collapse button on the right (ghost icon button, `PanelLeft`).
2. **"Projects"** label (label style, jet-300) with a count chip (mono-sm on jet-800).
3. **Search** input: height 40, radius 12, fill jet-850, border jet-700, placeholder `#7C849A`. Focus: cerulean border plus the 3px soft ring.
4. **Project list** (scrolls): rows 44px, radius 12, text 14/500 secondary. Hover: fill jet-800. **Selected**: fill `#11202E`, text cerulean-300, and a 2px cerulean-400 bar on the left edge. An icon on the left, name truncated with an ellipsis.
5. **New workspace** (pinned above the user block): label, name input, then a secondary "Create workspace" button with a plus icon, full width.
6. **User block** (bottom, 64px): 36px avatar (initial on jet-800), name 14/600, "Account settings" in small muted, chevron. It opens a popover with **Account settings** and **Log out**. Hover fill jet-800.

### 8.12 Account page ("Account settings", shown in Main)

- Sidebar stays. Main shows a centred column, width 640, on the `calm` background.
- h1 "Account" (Bricolage 28/600). Under it, stacked cards (jet-850, border jet-700, radius 16, padding 24, 16px gap).
- Card 1, profile: 64px avatar, name (h3), username or email in mono-sm muted. Show only the fields that exist today.
- Card 2, projects and roles: one row per project (name, role badge, member count).
- Card 3, session: a secondary "Log out" button. If the app already has a change-password form, restyle it with the 8.2 inputs and the primary button. Add nothing new.
- A "Back to chat" ghost button with an arrow at the top left of the column.

### 8.8 Status markers (shape plus word, not color alone)

| Status | Marker | Color |
|---|---|---|
| active | filled dot | cerulean-400 |
| pending | ring (hollow) dot, label "Pending" | neon-300 |
| superseded | dashed ring, content text muted, label "Replaced" | `#7C849A` |
| invalid | cross mark, label "Invalid" | neon-600 `#E8267A` |

### 8.9 Dialogs, popovers, toasts, tooltips

- **Dialog** (InviteDialog): width 520, fill jet-850, hairline border, radius 20, padding 24. Header: h2 plus a ghost close button. Footer buttons right aligned. Scrim from 3.3. Contents: "Create invite link" (primary), the URL in a mono 13 field with a Copy button (secondary, text changes to "Copied" for 2s), expiry text in small muted, then the members list (name, role badge, Remove ghost button for owners, with the same inline confirm as delete).
- **Popover** (project switcher, user menu): fill jet-850, border jet-700, radius 14, shadow `0 16px 48px rgba(0,0,0,0.6)`, padding 6. Items 36px tall, radius 8, hover fill jet-800. The current project has a cerulean-400 dot. Closes on Esc and outside click.
- **Toast**: fixed at bottom center, 24px from the edge, fill jet-800, border jet-700, radius 14, a 3px left stripe (cerulean-400 for "saved", neon-500 for notices and warnings), text small primary. Hides after 3 seconds. Examples: "3 memories saved", "Not saved: looks like a secret", "Alice added a decision".
- **Tooltip**: fill jet-800, border jet-700, radius 8, text 12 secondary, 6/10 padding.

### 8.10 Global details

- Scrollbars: `scrollbar-width: thin; scrollbar-color: #222736 transparent`, WebKit thumb `#222736`, hover `#3A4157`, radius 8.
- Text selection: `::selection { background: rgba(255,61,139,0.35); color: #FFFFFF }`.
- Icons: lucide only, 16px, stroke 1.75, color inherits the text color.
- Empty and error text always uses plain words, never raw error codes.

## 9. Tokens (paste into `src/index.css`)

```css
@import "tailwindcss";

@theme {
  --font-display: "Bricolage Grotesque Variable", "Bricolage Grotesque", "Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Instrument Sans Variable", "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace;

  --color-jet-950: #050507;
  --color-jet-900: #0A0B10;
  --color-jet-850: #10121A;
  --color-jet-800: #171A24;
  --color-jet-700: #222736;
  --color-jet-650: #181B27;
  --color-jet-500: #5B6379;
  --color-jet-400: #7C849A;
  --color-jet-300: #A7AEC0;
  --color-jet-100: #F2F4F8;

  --color-cerulean-300: #8AD2F7;
  --color-cerulean-400: #45B8F0;
  --color-cerulean-500: #1BA3E6;
  --color-cerulean-600: #0C86C3;
  --color-cerulean-700: #0A6A9E;

  --color-neon-300: #FF9EC7;
  --color-neon-400: #FF66A6;
  --color-neon-500: #FF3D8B;
  --color-neon-600: #E8267A;
  --color-neon-700: #B3125A;

  --radius-badge: 8px;
  --radius-control: 12px;
  --radius-card: 16px;
  --radius-dialog: 20px;

  --shadow-glow-cerulean: 0 0 0 1px rgba(27,163,230,0.55), 0 0 28px rgba(27,163,230,0.22);
  --shadow-glow-neon: 0 0 0 1px rgba(255,61,139,0.50), 0 0 28px rgba(255,61,139,0.22);
  --shadow-pop: 0 16px 48px rgba(0,0,0,0.6);
}

:root {
  color-scheme: dark;
  --bg: var(--color-jet-950);
  --surface-1: var(--color-jet-900);
  --surface-2: var(--color-jet-850);
  --surface-3: var(--color-jet-800);
  --border-subtle: var(--color-jet-650);
  --border-strong: var(--color-jet-700);
  --border-input: var(--color-jet-500);
  --text: var(--color-jet-100);
  --text-2: var(--color-jet-300);
  --text-3: var(--color-jet-400);
  --text-disabled: var(--color-jet-500);
  --query-bg: #09212F;
  --query-border: rgba(27,163,230,0.35);
  --query-text: #EAF7FF;
  --chip-bg: #2D1728;
  --chip-bg-hover: #401B31;
  --chip-border: #642142;
  --conflict-bg: #231523;
  --cerulean-tint: #11202E;
  --scrim: rgba(5,5,7,0.72);
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

html, body, #root { height: 100dvh; overflow: hidden; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 22px;
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid var(--color-cerulean-300); outline-offset: 2px; }
::selection { background: rgba(255,61,139,0.35); color: #fff; }
* { scrollbar-width: thin; scrollbar-color: var(--color-jet-700) transparent; }
```

Tailwind class recipes for the four things most often got wrong:

```
Query bubble : ml-auto max-w-[80%] rounded-[18px_18px_6px_18px] border border-cerulean-500/35 bg-[#09212F] px-4 py-3 text-[15px] leading-[22px] text-[#EAF7FF]
Response     : max-w-[68ch] rounded-[18px_18px_18px_6px] border border-jet-700 bg-jet-850 px-[18px] py-3.5 text-base leading-[26px] text-jet-100
Primary btn  : h-10 rounded-xl bg-cerulean-500 px-4 text-sm font-medium text-jet-950 transition hover:bg-cerulean-400 hover:shadow-[0_0_20px_rgba(27,163,230,0.35)] active:translate-y-px active:bg-cerulean-600 disabled:bg-jet-800 disabled:text-jet-500
Memory chip  : h-8 rounded-full border border-[#642142] bg-[#2D1728] px-3 text-[13px] text-neon-300 transition hover:bg-[#401B31]
```

## 10. Don'ts

- No pure `#000` or `#fff` for surfaces or body text. No other hues anywhere.
- No white text on cerulean-500. No neon text for long body copy.
- No gradients other than the four in 3.4 and the background system in section 12. No background image.
- No glow on more than two elements at once. No muted (`#7C849A`) text directly on the shader.
- No sun/moon theme toggle (the app is dark only).
- No hover-only critical actions. No emoji. No icons outside lucide.
- Do not render two primary screens at once (section 2).
- Do not change behaviour, API calls or text copy while restyling.

## 11. Acceptance checklist

1. Logged out: only the auth screen, with the logo at the top, the glass card, and the slow smoke behind it. No sidebar.
2. Logged in: sidebar on the left (logo, search, project list, new workspace, user block). Main shows one thing only.
3. Empty thread: hero, composer, 4 quick actions over the dimmer smoke. Nothing else.
4. **After the first message** the smoke fades out over 0.7s into the calm background, and the hero and quick actions are gone.
5. Chat column is 768px max and centred. Queries hug their text (max 75%). Replies hug their text (max column width). Composer and column edges line up.
6. Query and reply are different surfaces (cerulean-tinted vs plain jet) and readable.
7. Memory chips are neon, send is cerulean with dark text, Override is rose.
8. Memory panel is closed by default. The Memory button opens it: docked at 1440px and up, drawer below. Only one overlay at a time.
9. Account settings opens the Account page inside the same shell, on the calm background.
10. Every control has visible hover, pressed, focus and disabled states, and transitions are 150ms (no instant jumps).
11. Keyboard-only pass reaches every control, and the focus ring is always visible.
12. Fonts are Bricolage Grotesque, Instrument Sans and JetBrains Mono, with the network off.
13. Ambient toggle off, or `prefers-reduced-motion` on: no animation anywhere, a static frame only.
14. Dev tools Performance tab: on the login page the GPU stays low, and the shader stops (no rAF) when the tab is hidden and after the first message.
15. Run the PRD section 14 and 26 demo scripts. Behaviour is unchanged.

## 12. Background system (v1.1)

### 12.1 What it is and why

The sample's smoke shader is a good fit: it is slow, soft and has no hard shapes. We recolor it (cerulean mixed with a little neon rose on jet black), slow it down, dim it, and run it **only where nobody is reading dense text**: login, sign up and the empty chat. When the user sends the first message it fades out and a static, barely moving glow takes over. That keeps the chat calm and keeps the GPU idle.

| Mode | Where | Shader gain | Notes |
|---|---|---|---|
| `smoke-strong` | login, sign up | 0.55 | Text lives on the glass card |
| `smoke-soft` | empty chat | 0.38 | Hero text uses primary or secondary color only |
| `calm` | chat with messages, Account | no shader | Two soft glows drifting over 60 to 75s, plus 4% grain |

### 12.2 Bugs in the sample component that must NOT be copied

1. The effect depends on `[isHovering, mousePosition, color]`, so it rebuilds the whole WebGL program on **every mouse move**.
2. `requestAnimationFrame` is never cancelled, so loops stack up and leak.
3. It sets `canvas.width` every frame, which clears and reallocates the buffer.
4. The blur `div` sits above the canvas and swallows mouse events, so the mouse ripple never worked.
5. It renders at full resolution and keeps running in hidden tabs.
6. It is TypeScript with `"use client"`. Our web app is Vite, so write it as `.jsx` (or `.tsx` if the repo is already TypeScript) and drop `"use client"`.

The version below builds the program once, reads the mouse through a ref with smoothing, renders at half resolution (the fog is soft, so nobody can tell), pauses when the tab is hidden, shows one still frame for reduced motion, and releases the GL context on unmount.

### 12.3 Code

`web/src/components/SmokeBackground.jsx`

```jsx
import { useEffect, useRef } from "react";

const VERT = `attribute vec4 a_position; void main(){ gl_Position = a_position; }`;
const FRAG = `
precision mediump float;
uniform vec2 iResolution; uniform float iTime; uniform vec2 iMouse;
uniform vec3 u_c1; uniform vec3 u_c2; uniform float u_gain;
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / iResolution;
  vec2 p = (2.0 * fc - iResolution) / min(iResolution.x, iResolution.y);
  float t = iTime * 0.22;
  vec2 rc = 2.0 * (iMouse / iResolution) - 1.0;
  vec2 d = p;
  for (float i = 1.0; i < 8.0; i++) {
    d.x += 0.5 / i * cos(i * 2.0 * d.y + t + rc.x * 3.1415);
    d.y += 0.5 / i * cos(i * 2.0 * d.x + t + rc.y * 3.1415);
  }
  float glow = smoothstep(0.9, 0.2, abs(sin(d.x + d.y + t)));
  float k = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(d.x * 0.9 - d.y * 0.6 + t * 0.7)) * 0.6;
  float vig = 1.0 - 0.55 * smoothstep(0.25, 0.95, distance(uv, vec2(0.5)));
  gl_FragColor = vec4(mix(u_c1, u_c2, k) * glow * u_gain * vig, 1.0);
}`;

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export default function SmokeBackground({ gain = 0.5, interactive = true, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // the calm layer underneath stays visible

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n) => gl.getUniformLocation(prog, n);
    const uRes = u("iResolution"), uTime = u("iTime"), uMouse = u("iMouse");
    gl.uniform3fv(u("u_c1"), rgb("#1BA3E6")); // cerulean-500
    gl.uniform3fv(u("u_c2"), rgb("#FF3D8B")); // neon-500
    gl.uniform1f(u("u_gain"), gain);

    const SCALE = 0.5;
    const m = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const onMove = (e) => { m.tx = e.clientX / window.innerWidth; m.ty = 1 - e.clientY / window.innerHeight; };
    if (interactive) window.addEventListener("pointermove", onMove, { passive: true });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;

    const draw = (now) => {
      const w = Math.max(2, Math.floor(canvas.clientWidth * SCALE));
      const h = Math.max(2, Math.floor(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      m.x += (m.tx - m.x) * 0.04; m.y += (m.ty - m.y) * 0.04; // smooth, no snapping
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, reduce ? 12 : (now - t0) / 1000);
      gl.uniform2f(uMouse, m.x * w, m.y * h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = !reduce && !document.hidden ? requestAnimationFrame(draw) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("resize", kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", kick);
      window.removeEventListener("resize", kick);
      window.removeEventListener("pointermove", onMove);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [gain, interactive]);

  return <canvas ref={ref} aria-hidden="true" className={`absolute inset-0 h-full w-full ${className}`} />;
}
```

`web/src/components/Backdrop.jsx` (mounted once at the app root)

```jsx
import { useEffect, useState } from "react";
import SmokeBackground from "./SmokeBackground";

// mode: "smoke-strong" | "smoke-soft" | "calm"
export default function Backdrop({ mode, animated = true }) {
  const wantSmoke = animated && mode !== "calm";
  const [mounted, setMounted] = useState(wantSmoke);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (wantSmoke) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), 700); // unmount after the fade, which also stops the GPU work
    return () => clearTimeout(id);
  }, [wantSmoke]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-jet-950" aria-hidden="true">
      <div className="ambient-calm absolute inset-0" />
      {mounted && (
        <div className="absolute inset-0 transition-opacity duration-700 ease-out" style={{ opacity: shown ? 1 : 0 }}>
          <SmokeBackground gain={mode === "smoke-strong" ? 0.55 : 0.38} />
        </div>
      )}
    </div>
  );
}
```

Which mode when (computed in the app root):

```
not logged in                    -> "smoke-strong"
workspace, thread has 0 messages -> "smoke-soft"
anything else                    -> "calm"
animated = ambient toggle state (default true)
```
A project opened with existing history starts directly in `calm`. Starting a new session (empty thread) fades the smoke back in.

Add to `src/index.css`:

```css
.ambient-calm::before, .ambient-calm::after { content: ""; position: absolute; inset: -10%; will-change: transform; }
.ambient-calm::before {
  background: radial-gradient(45% 40% at 15% 0%, rgba(27,163,230,0.13), transparent 70%);
  animation: drift-a 60s ease-in-out infinite alternate;
}
.ambient-calm::after {
  background: radial-gradient(40% 35% at 100% 100%, rgba(255,61,139,0.09), transparent 70%);
  animation: drift-b 75s ease-in-out infinite alternate;
}
.ambient-calm {
  /* 4% film grain so the dark gradients never band */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.04'/></svg>");
}
@keyframes drift-a { to { transform: translate3d(4%, 3%, 0); } }
@keyframes drift-b { to { transform: translate3d(-4%, -3%, 0); } }
@media (prefers-reduced-motion: reduce) { .ambient-calm::before, .ambient-calm::after { animation: none; } }
```

### 12.4 Contrast on the moving shader (computed)

Worst-case pixel (glow = 1) at gain 0.55 is about `#0F5A7F` (cerulean), `#8C224C` (rose) or `#5A3860` (mix). At gain 0.38: `#0A3E57`, `#611735`, `#3E2743`.

| Text color | On gain 0.55 | On gain 0.38 | Rule |
|---|---|---|---|
| `#F2F4F8` (primary) | 6.9 to 8.8 : 1 | 10.4 to 12.1 : 1 | OK anywhere |
| `#A7AEC0` (secondary) | 3.4 to 4.4 : 1 | 5.1 to 6.0 : 1 | OK on the empty chat. **Not** straight on the login shader, so keep it on the card |
| `#7C849A` (muted) | 2.0 to 2.6 : 1 | 3.1 to 3.6 : 1 | **Never** directly on the shader |

So: on the empty chat, hero text and hints use primary or secondary. The composer has its own fill. On login, all text sits on the glass card.

### 12.5 Smooth actions

- Every interactive element: `transition: background-color, border-color, color, box-shadow, transform, opacity` at 150ms `var(--ease)`. Nothing changes instantly.
- Animate only `transform` and `opacity` for movement (never `width`, `height`, `top` or `left` on large areas).
- Sidebar collapse: 220ms (animate `grid-template-columns` on the shell, or translate the sidebar). Memory panel and drawers: 240ms slide with a scrim fade. Dialogs: 200ms fade plus scale from 0.98.
- Screen swaps (auth to app, Workspace to Account): 200ms crossfade with a 4px rise.
- New message: fade up 8px over 180ms. Thread auto-scroll uses `scrollTo({ top, behavior: "smooth" })` and only when the user is already within 120px of the bottom.
- Typing dots 1.2s pulse. Toasts slide up 12px and fade over 180ms.
- Blur (`backdrop-filter`) only on the composer and the auth card. Never on the sidebar, header or panel.
- `prefers-reduced-motion`: keep opacity changes only.
## 13. Prompts for Codex (run in this order, one at a time)

Run each prompt in a fresh Codex message. Paste **only** the text inside the code block. After each one, open the app and check the matching items in section 11 before moving on.

### Prompt A: shell, sidebar, chat column, colors and fonts

```
Read DESIGN.md fully (v1.1). Restyle and restructure ONLY. Do not change behaviour, API calls, state logic, routes or visible text.
Keep every control that exists today (Memory, Invite, New session, search, create workspace, account menu), only restyle and place them.

1. Install the Fontsource packages from section 5 and import them in main.jsx. Stop using bg.png and any background image.
2. Paste the tokens from section 9 into src/index.css. Replace every old neutral, black/60, glass and hard-coded color with the new
   jet, cerulean and neon tokens.
3. Implement the shell from section 2: Sidebar (section 8.11) + Main. Main shows exactly one of Workspace, Account, EmptyState.
   Sidebar is docked 280px at 1024px and up with a collapse button (remember the state in localStorage inside try/catch) and a left
   drawer below 1024px. The memory panel is CLOSED by default, toggled by the header Memory button: docked 380px at 1440px and up,
   a right drawer with a scrim below that. Only one overlay at a time, Esc closes it. Each region scrolls on its own.
4. Header per section 8.3. Replace the sun/moon theme button with the Ambient toggle (Wind icon, saved in localStorage in try/catch,
   exposed through a small context so Backdrop can read it). No backdrop blur on the header.
5. Chat column per section 8.5: one centred column, max-w-[768px], px-6. Queries are right aligned, w-fit, max 75%. Replies are
   left aligned with a 32px avatar tile and a w-fit bubble that stops at the column edge. The composer, the memory chips and the
   hero all sit inside the same 768px column. Add overflow-wrap:anywhere and horizontal scroll for code blocks.
6. Restyle everything else per section 8 (buttons, inputs, thread, chips, conflict card, check-in card, memory panel tabs and cards,
   dialogs, popovers, toasts, tooltips, scrollbars) and the smooth-action rules in section 12.5.
7. Report PASS or FAIL for checklist items 2, 3, 5 to 8, 10 to 12 and 15, then list the files you changed.
```

### Prompt B: background, login and sign up, account page

```
Read DESIGN.md sections 2, 8.7, 8.12 and 12. Restyle and restructure ONLY. No behaviour, API or text changes.

1. Create web/src/components/SmokeBackground.jsx and web/src/components/Backdrop.jsx EXACTLY as written in section 12.3
   (use .tsx only if the repo is already TypeScript). Do not copy the sample component's structure: it has the bugs listed in 12.2.
   Add the .ambient-calm CSS from 12.3 to src/index.css.
2. Mount <Backdrop> once at the app root, behind everything (the rest of the UI sits at relative z-10).
   Mode: not logged in = "smoke-strong"; workspace with 0 messages in the thread = "smoke-soft"; everything else = "calm".
   Pass animated from the Ambient toggle. A project opened with existing history starts in "calm"; a new session fades the smoke back in.
3. Find the existing logo file (run: ls web/public web/src/assets; rg -il "logo" web/src). It is the same logo the sidebar uses.
   Use that file as it is. Do NOT redraw, recolor or recreate it. Put it centred at the top of the login and sign up screen,
   24px from the top, 40px tall (32px on mobile).
4. Rebuild the login and sign up screen per section 8.7: glass card (width 400), floating-label underline inputs in our colors,
   primary submit button with the arrow nudge, switch link. Use ONLY the fields and actions that exist today. Do not add a Google
   button, a forgot-password link or a divider.
5. Rebuild the Account settings screen per section 8.12 inside the AppShell (sidebar stays). Show only what exists today.
   "Account settings" in the sidebar user popover opens it, and "Back to chat" returns to the workspace.
6. Check the shader behaviour: it must stop (no requestAnimationFrame) when the tab is hidden and after the fade to "calm", and
   show one still frame when prefers-reduced-motion is on. Confirm there is no WebGL program rebuild on mouse move.
7. Report PASS or FAIL for checklist items 1, 4, 9, 13 and 14, then list the files you changed.
```

### Prompt C: bug fix, raw memory ids showing in replies (this one is NOT a restyle)

Your screenshot shows replies containing text like `【6ae09909f70d1dbe719c2216 – decision · by himesh_02】`. The model is copying the memory ids from the context we give it. Fix it on both sides.

```
Bug: assistant replies show raw memory markers such as 【6ae09909f70d1dbe719c2216 – decision · by himesh_02】.
Do not change anything else.

1. Server: find where the recalled memories are formatted into the chat prompt (rg -n "decision" server/src/services server/src/routes).
   Keep the ids out of the visible text of the context. Give the model each memory as plain fields (type, content, reason, author, date)
   and add one instruction line to the system prompt: "Never print memory ids, brackets, or any marker like 【…】. When you refer to
   a memory, say it in words, for example: 'you decided on PostgreSQL earlier'. Do not write 'by <username>' unless the person asks who decided."
   Keep the ids in the structured memoriesUsed array that the UI uses for the chips.
2. Client: add a tiny render-time sanitizer used by the reply component only. It removes anything matching
   /[【\[][0-9a-f]{24}[^】\]]*[】\]]/g from the reply text before it is shown. Do not modify the stored text.
3. Add a test: a reply string containing such a marker renders without it.
```