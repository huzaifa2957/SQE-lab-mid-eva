# How to run EVM Cost Tracker

All commands are run from the project folder (the one with `package.json`) in a terminal such
as PowerShell or Git Bash.

## 1. One-time setup

1. Install **Node.js 20.19 or newer** (LTS) from https://nodejs.org.
2. Install the dependencies:

   ```sh
   npm install
   ```

## 2. Web app

```sh
npm run dev -w apps/web
```

Open http://localhost:5173. Click **Load sample project** to try it with example data.

To try the production build instead:

```sh
npm run build -w apps/web
npm run preview -w apps/web     # http://localhost:4173
```

## 3. AI summary (optional)

Without this, the app writes a rule-based summary offline.

1. Get a free API key at https://aistudio.google.com/apikey.
2. Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY` and `GEMINI_MODEL` (copy the
   model name from Google AI Studio, e.g. a current "Flash" model).
3. Start the AI proxy:

   ```sh
   npm run dev -w apps/ai-proxy    # http://localhost:3001
   ```

4. Create `apps/web/.env.local` containing:

   ```
   VITE_AI_PROXY_URL=http://localhost:3001
   ```

5. Restart the web app (`npm run dev -w apps/web`), open **Insights** and click
   **Generate AI summary**.

## 4. Desktop app (Windows)

```sh
npm run dev -w apps/desktop       # run the desktop app during development
npm run build -w apps/desktop     # build the web app + desktop app
npm run dist -w apps/desktop      # build the installer
```

The installer is created at `apps/desktop/release/EVM-Cost-Tracker-Setup-<version>.exe`.
The first `dist` downloads the installer tools, so it takes a few minutes.

The installer is not code-signed, so Windows may show "Windows protected your PC". Click
**More info → Run anyway**.

For AI on desktop: open **Settings → Desktop: Gemini API key**, enter the model name and your key,
click **Save key**, then **Test connection**. No `.env` or proxy is needed for the desktop app.

## 5. Reports

Open the **Report** page and use **Download PDF**, **Excel** or **CSV**. To regenerate the examples
in `docs/sample-reports/` (needs Edge or Chrome installed):

```sh
npm run sample-reports
```

## 6. Checks and tests

```sh
npm run lint                      # code style
npm run typecheck                 # TypeScript
npm run test                      # all unit and component tests
npm run test:coverage             # tests with coverage report (coverage/index.html)
npm run test:e2e -w apps/desktop  # Electron smoke test (run "npm run build -w apps/desktop" first)
```

## 7. Troubleshooting

| Problem                                           | Fix                                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listen EACCES` / port already in use             | Another program uses the port, or Windows reserves it. Stop the other program, or run Vite on another port: `npx vite --port 5180` inside `apps/web`. |
| AI proxy says `GEMINI_MODEL is not set`           | Add the model name to `.env` (step 3).                                                                                                                |
| "Generated offline (rule-based)" instead of AI    | No key, no internet, or the proxy isn't running. The reason is shown next to the label.                                                               |
| Desktop: `electron` not found after `npm install` | Run `node node_modules/electron/install.js` to download Electron.                                                                                     |
| Old data or layout after an update                | In the browser, reload with Ctrl+F5. Saved projects stay in the browser's storage; use **Save project file** to keep a copy.                          |

More detail: [README.md](README.md) and [apps/desktop/README.md](apps/desktop/README.md).
