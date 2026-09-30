# Project Instructions

## Persistent context

- Read `PROJECT_OVERVIEW.md` before making architectural or cross-module changes.
- This workspace contains the Electron product in `capcut-ai-studio/`. It edits
  videos only through Remotion (the CapCut draft flow was removed on 2026-09-26).
  `CapCutAPI/` is the legacy CapCut engine; the app no longer imports it, but the
  sidecar's Python venv currently lives at `CapCutAPI/.venv` — do not delete it.
- Preserve user-generated media, work directories, CapCut drafts, and unrelated
  changes unless the user explicitly asks to remove them.
- App display name is "Agent Edit" (productName, window title, menu). The internal
  package.json `name: "auto-capcut"`, `appId` and `~/.capcut-studio` must NOT change: Electron
  derives the userData folder and the Keychain item holding the encrypted API keys from them.

## CodeGraph

- The project CodeGraph index lives in `.codegraph/`.
- Prefer CodeGraph MCP tools for architecture, call-flow, symbol lookup, and
  impact analysis. Use `codegraph_explore` as the primary discovery tool.
- Check `codegraph_status` when index freshness matters. The MCP server normally
  auto-syncs source changes.
- CLI fallback:
  - `codegraph status`
  - `codegraph sync`
  - `codegraph index --force`

## Verification

- Desktop build: `cd capcut-ai-studio && npm run build`
- Type check: `cd capcut-ai-studio && npx tsc --noEmit -p tsconfig.json`
- Python syntax: `python3 -m compileall -q capcut-ai-studio/sidecar`
- Python tests (temp HOME so real data is untouched), from `capcut-ai-studio/`:
  `for t in tests/test_*.py; do HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python $t; done`
- Electron/renderer helpers test (Node >= 23): `cd capcut-ai-studio && node tests/test_project_media.mts`
  (and `HOME=$(mktemp -d) node tests/test_toolchain.mts`, `tests/test_project_delete.mts`)
- Doctor / toolchain (tool versions pinned in `capcut-ai-studio/sidecar/assets/toolchain.json` +
  `sidecar/requirements.lock`): `env -u ELECTRON_RUN_AS_NODE STUDIO_DOCTOR=1 <app binary> --user-data-dir=<tmp>`
  prints the report (temp user-data-dir = no Keychain prompt). Fresh-machine test: add `STUDIO_DOCTOR_FIX=1` and run with
  `env -i HOME=<tmp> PATH=/usr/bin:/bin:/usr/sbin:/sbin <app binary> --user-data-dir=<tmp>/ud` (the terminal PATH would
  find the real machine's tools; Electron's profile folder on macOS IGNORES $HOME — without --user-data-dir the test
  opens the real profile with the encrypted API keys and may trigger a Keychain prompt).
- Render self-test: `env -u ELECTRON_RUN_AS_NODE STUDIO_REMOTION_RENDER=<spec.json> STUDIO_REMOTION_OUT=<out.mp4> <app binary>`
  (VSCode terminals set `ELECTRON_RUN_AS_NODE=1`, which makes the app binary exit silently)
