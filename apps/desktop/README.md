# apps/desktop

Electron app around the `apps/web` build (FR-50…FR-53). The web app and `packages/core` are
used unchanged; this folder only adds the platform layer. See the
[root README](../../README.md#desktop-app-windows) for commands.

## How it fits together

| Part                     | What it does                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `src/main/main.ts`       | App lifecycle, window, `app://evm` protocol serving `dist/web`, menu, IPC wiring                                          |
| `src/main/security.ts`   | SR-06 rules: app-only navigation, https-only external links, no new windows or permissions, strict CSP, safe file serving |
| `src/main/ipc.ts`        | Handlers behind `window.evmDesktop`; every message checked for sender and Zod schema                                      |
| `src/main/settings.ts`   | Model + API key; key encrypted with `safeStorage`, renderer only sees the last 4 characters                               |
| `src/main/ai.ts`         | AI summary and "Test connection" in the main process, using `@evm/platform/ai` (same code as the proxy)                   |
| `src/main/logger.ts`     | `logs/main.log` in the user-data folder, rotated at 1 MB, secrets redacted                                                |
| `src/main/menu.ts`       | File / View / Help menu; dev tools only in development                                                                    |
| `src/preload/preload.ts` | Exposes the narrow `window.evmDesktop` API (no `ipcRenderer`, `fs` or Node)                                               |
| `scripts/build.mjs`      | Bundles main + preload with esbuild and copies the web build into `dist/`                                                 |
| `scripts/dev.mjs`        | Runs the Vite dev server and Electron together                                                                            |
| `scripts/make-icon.mjs`  | Draws `build/icon.png` / `build/icon.ico`                                                                                 |

The contract (`window.evmDesktop` type, channel names, Zod schemas) is in
`packages/platform/src/bridge.ts`; the web app picks the desktop or browser behaviour in
`apps/web/src/platform/`.

## Security settings (SR-06)

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`,
`devTools` off when packaged. The page is served from the private `app://evm` origin with a
strict CSP (`default-src 'none'`, `connect-src 'self'`): the renderer has no network access —
AI calls happen in the main process.

## Tests

- `tests/*.test.ts` (Vitest, no Electron needed): IPC validation, native dialogs, settings
  storage with `safeStorage` mocked, AI, logging, security rules, menu.
- `e2e/smoke.spec.ts` (Playwright + Electron): launches the built app, checks the security
  settings and the exposed API, loads the sample project (dashboard CPI 0.87), blocks
  navigation and new windows.
