# Design system — EVM Cost Tracker

All UI, charts and reports follow this document. Tokens live in
[`apps/web/src/index.css`](../apps/web/src/index.css) and are exposed to Tailwind through
`@theme`; components use the Tailwind classes, never raw hex values.

## 1. Style

Clean, modern dashboard with an **earthy green** theme and **bright lime** accents. Rounded panels,
thin 1px borders for separation, minimal shadows, plenty of empty space.

## 2. Fonts

Self-hosted with `@fontsource` (work offline in the desktop app; no CSP font exceptions).

| Font          | Tailwind       | Use                                                    |
| ------------- | -------------- | ------------------------------------------------------ |
| Space Grotesk | `font-display` | Page headings, section titles, large numbers           |
| DM Sans       | `font-sans`    | Body text, navigation, buttons, form labels (default)  |
| IBM Plex Mono | `font-mono`    | Code, task IDs, technical info, small uppercase labels |

## 3. Type scale

| Token             | Size | Use                                            |
| ----------------- | ---- | ---------------------------------------------- |
| `text-page`       | 36px | Page heading (medium weight, Space Grotesk)    |
| `text-section`    | 23px | Section heading                                |
| `text-subsection` | 18px | Small heading                                  |
| `text-body`       | 15px | Body text (default)                            |
| `text-control`    | 14px | Buttons and inputs                             |
| `text-support`    | 12px | Supporting text, badges, uppercase mono labels |
| `text-metric`     | 32px | Large dashboard numbers (Space Grotesk)        |

## 4. Colour tokens

| Token              | Tailwind colour  | Light     | Dark      | Use                                  |
| ------------------ | ---------------- | --------- | --------- | ------------------------------------ |
| `--accent`         | `accent`         | `#D4F468` | `#D4F468` | Primary buttons, selected nav, focus |
| `--accent-hover`   | `accent-hover`   | `#C5E84F` | `#E0F88C` | Primary button hover                 |
| `--accent-text`    | `accent-text`    | `#263719` | `#263719` | Text on lime                         |
| `--feature`        | `feature`        | `#183A2B` | `#1F4733` | Forest-green feature panels          |
| `--feature-text`   | `feature-text`   | `#F4F5EF` | `#F0F4E9` | Text on feature panels               |
| `--feature-muted`  | `feature-muted`  | `#B7CDBE` | `#B9CBBE` | Secondary text on feature panels     |
| `--bg`             | `bg`             | `#F4F5EF` | `#101612` | Page background                      |
| `--card`           | `card`           | `#FFFFFF` | `#18221B` | Cards, sidebar, top bar              |
| `--card-subtle`    | `card-subtle`    | `#F8F9F4` | `#1D2920` | Table headers, hover                 |
| `--text`           | `text`           | `#17241C` | `#F0F4E9` | Main text                            |
| `--text-muted`     | `muted`          | `#5B685F` | `#A7B3A9` | Secondary text                       |
| `--border`         | `border`         | `#D8DED3` | `#2E3B32` | 1px borders and dividers             |
| `--border-strong`  | `border-strong`  | `#879483` | `#6b7a6e` | Input borders                        |
| `--success`        | `success`        | `#3F8F5B` | `#3F8F5B` | Status icons/borders                 |
| `--success-soft`   | `success-soft`   | `#E3F1E7` | `#1D3526` | Badge / row tint                     |
| `--success-strong` | `success-strong` | `#2A6640` | `#8FD3A6` | Status text                          |
| `--warning`        | `warning`        | `#D9A23A` | `#D9A23A` |                                      |
| `--warning-soft`   | `warning-soft`   | `#FBF0D9` | `#3A2F18` |                                      |
| `--warning-strong` | `warning-strong` | `#7A5410` | `#F0C878` |                                      |
| `--error`          | `error`          | `#B85450` | `#B85450` | Muted red                            |
| `--error-soft`     | `error-soft`     | `#F7E3E2` | `#3D2221` |                                      |
| `--error-strong`   | `error-strong`   | `#933B37` | `#EFA19C` |                                      |

The base status colours (`#3F8F5B`, `#D9A23A`, `#B85450`) don't reach 4.5:1 for text, so
**status text uses the `-strong` shade on the `-soft` tint**. Every text/background pair is checked
against WCAG AA (4.5:1) in both modes by `apps/web/src/test/contrast.test.ts`.

## 5. Light / dark mode

- Follows the system setting by default (`prefers-color-scheme`), with a toggle in the top bar and a
  choice in Settings (System / Light / Dark).
- The choice is stored in `localStorage` (`evm.theme`), always inside `try/catch`.
- `data-theme="light|dark"` on `<html>` selects the token set.

## 6. Layout

- Left sidebar (Projects, Data, Dashboard, Insights, Report, Settings), slim top bar (project name,
  status date, theme toggle), spacious main area (max width ~1200px, 32px padding).
- Each page: **title top left, main action button top right** (`PageHeader`).
- Content: two-column layouts, metric rows, cards and simple tables. **24px gaps** between sections.

## 7. Components

| Component             | Rules                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card                  | 12px radius, 24px padding, 1px border, card background, no shadow                                                                                      |
| FeaturePanel          | Forest-green background, light text, 12px radius                                                                                                       |
| Button                | 8px radius, 14px text. **Primary**: lime + dark green text. **Secondary**: transparent + border. **Ghost**: text only. **Danger**: error text + border |
| Input / Select        | 8px radius, 14px text, visible label, error text below with icon, `aria-invalid`                                                                       |
| Badge                 | Small, fully rounded, **icon + text** (never colour alone): success / warning / error / neutral                                                        |
| MetricCard            | Mono uppercase label, 32px Space Grotesk value, optional badge; "N/A" has a reason tooltip                                                             |
| Table                 | Thin row dividers, mono font for IDs, numbers right-aligned in mono with tabular figures; error rows tinted `error-soft`, warning rows `warning-soft`  |
| Modal / ConfirmDialog | Card styling, overlay, Esc closes, focus moves in and returns                                                                                          |
| Toast                 | Bottom-right, icon + text, optional action (e.g. Undo), announced via `aria-live`                                                                      |
| FileDropzone          | Dashed border, drag-and-drop plus a "Choose file" button                                                                                               |
| Icons                 | `lucide-react` outline icons, 16–18px, `aria-hidden` when next to text                                                                                 |
| Selected nav item     | Lime background, dark green text                                                                                                                       |

## 8. Accessibility

- WCAG AA contrast for all text in both modes (tested).
- Every input has a label; status is always icon + text + colour.
- Visible focus ring: 3px lime outline with a 2px dark inner ring, so it shows on every background.
- All actions reachable by keyboard; dialogs trap focus and close with Esc.

## 9. Charts and reports (Phases 4 and 6)

- Series colours come from the tokens: PV = `--text-muted`, EV = `--success`, AC = `--error`,
  BAC/reference lines = `--border-strong`, highlight = `--accent`.
- Chart text uses DM Sans; numbers in tooltips use IBM Plex Mono.
- PDF reports use the light-mode palette with the same fonts.
