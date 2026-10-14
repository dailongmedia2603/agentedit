# Project Instructions

## Persistent context

- Read `PROJECT_OVERVIEW.md` before making architectural or cross-module changes.
- This workspace contains the Electron product in `capcut-ai-studio/`. The same app also runs headless as a CLI
  (`--agent-edit-cli`, `capcut-ai-studio/electron/cli/`) — packaged for GetTime as the skill `gettime/agent-edit/`. It edits
  videos only through Remotion (the CapCut draft flow was removed on 2026-09-26).
  `CapCutAPI/` is the legacy CapCut engine; the app no longer imports it, but the
  sidecar's Python venv currently lives at `CapCutAPI/.venv` — do not delete it.
- Preserve user-generated media, work directories, CapCut drafts, and unrelated
  changes unless the user explicitly asks to remove them.
- App display name is "Agent Edit" (productName, window title, menu). The internal
  package.json `name: "auto-capcut"`, `appId` and `~/.capcut-studio` must NOT change: Electron
  derives the userData folder and the Keychain item holding the encrypted API keys from them.

## Phat hanh ban moi (user nhan "Phat hanh ban X.Y.Z, ghi chu: ..." / "Phat hanh ban thu")

Day la quy trinh CHUAN, user da dong y tu truoc — lam du cac buoc, khong hoi lai tung buoc (PROJECT_OVERVIEW muc 15):
1. Chay kiem tra: `cd capcut-ai-studio && npx tsc --noEmit -p tsconfig.json` (+ test lien quan den phan vua sua). Loi -> sua
   truoc, KHONG phat hanh code hong.
2. Commit moi thay doi cua user (bo qua file media / thu muc khong lien quan nhu *.mov, marketing/) len `main`, message ro rang.
3. Chinh thuc: `npm run release -- X.Y.Z --notes "<ghi chu tieng Viet co dau>"` (tu tang version, tag, day remote
   `agentedit`). User khong ghi so -> sua loi tang so cuoi, tinh nang moi tang so giua. Khong ghi ghi chu -> tu tom tat ngan
   gon tu cac commit tu ban truoc (khach doc trong hop thoai cap nhat). "Ban thu" -> `npm run release -- --test --notes "..."`.
4. Theo doi GitHub Actions (`gh run list --repo dailongmedia2603/agentedit --workflow release.yml`) toi khi xong ca mac arm64 +
   mac Intel (x64, may `macos-15-intel`) + windows (~40-70 phut). Buoc nao do -> doc log (`gh api repos/dailongmedia2603/agentedit/actions/jobs/<id>/logs`), sua, phat
   hanh lai. KHONG bao "xong" khi chua xanh.
5. Bao user: link GitHub Release (file .dmg / Setup .exe cho khach moi) + may da cai se thay nut "Cap nhat len X.Y.Z" o lan
   mo app ke tiep.

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
- Build mặc định (`build` / `dist` / `dist:win`) là BẢN CÀI CHO MÁY KHÁC: ẩn nhật ký, Prompt & quy tắc, các bước,
  DevTools (PROJECT_OVERVIEW 11u). TỪ 2026-10-09 máy chủ app (/Applications ở máy này) DÙNG BẢN KHÁCH (bản phát hành
  qua `npm run release`, TỰ CẬP NHẬT) + cửa bí mật Ctrl/Cmd+Shift+Alt+D để hiện giao diện đầy đủ — KHÔNG build tay
  `STUDIO_FULL_UI=1` đè lên nữa (bản đầy đủ không tự cập nhật). Bản 1.2.2 đầy đủ cũ: ~/.capcut-studio/app-backup-20261009-174744-v1.2.2-full.
- Phiên bản: `package.json` `version` (tăng tay theo đợt tính năng) + MÃ BUILD tự sinh (`scripts/dist.mjs`, ngày-giờ,
  bản đầy đủ thêm `-full`) — hiện trên thanh tiêu đề app và trong tên file (.dmg / Setup .exe).
- Windows installer: build ON Windows x64 only — `cd capcut-ai-studio && powershell -ExecutionPolicy Bypass -File .\build-windows.ps1`
  (`npm run dist:win`; guide BUILD-WINDOWS.md, PROJECT_OVERVIEW.md section 14). Packaged self-test (any OS):
  `node scripts/selftest-packaged.mjs [--app <exe|.app>]`
- Type check: `cd capcut-ai-studio && npx tsc --noEmit -p tsconfig.json`
- Python syntax: `python3 -m compileall -q capcut-ai-studio/sidecar`
- Python tests (temp HOME so real data is untouched), from `capcut-ai-studio/`:
  `for t in tests/test_*.py; do HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python $t; done`
  (Windows ONNX vision path on macOS: `STUDIO_VISION=onnx STUDIO_MODELS_DIR=<models>`; see tests/test_windows_port.py)
- License (1 key = 1 máy, PROJECT_OVERVIEW 13g): server `cd license-server && npm run dev:api` + `npm run dev:admin` rồi
  `npm test`; app `cd capcut-ai-studio && HOME=$(mktemp -d) node tests/test_license.mts` (cần 2 worker trên). Dev app không
  cần key: `STUDIO_LICENSE=off npm run dev`. Bí mật ký: `~/.capcut-studio/license-secrets.json` — KHÔNG đưa lên git.
- Electron/renderer helpers test (Node >= 23): `cd capcut-ai-studio && node tests/test_project_media.mts`
  (and `HOME=$(mktemp -d) node tests/test_toolchain.mts`, `tests/test_project_delete.mts`)
- Doctor / toolchain (tool versions pinned in `capcut-ai-studio/sidecar/assets/toolchain.json` +
  `sidecar/requirements.lock`): `env -u ELECTRON_RUN_AS_NODE STUDIO_DOCTOR=1 <app binary> --user-data-dir=<tmp>`
  prints the report (temp user-data-dir = no Keychain prompt). Fresh-machine test: add `STUDIO_DOCTOR_FIX=1` and run with
  `env -i HOME=<tmp> PATH=/usr/bin:/bin:/usr/sbin:/sbin <app binary> --user-data-dir=<tmp>/ud` (the terminal PATH would
  find the real machine's tools; Electron's profile folder on macOS IGNORES $HOME — without --user-data-dir the test
  opens the real profile with the encrypted API keys and may trigger a Keychain prompt).
- Tu cap nhat + phat hanh (PROJECT_OVERVIEW 15): `npm run release -- X.Y.Z --notes "..."` (tag -> GitHub Actions build Mac +
  Windows -> R2; khach tu cap nhat), `npm run release -- --test` (kenh test). Test: `HOME=$(mktemp -d) node tests/test_updater.mts`,
  ban dong goi `node scripts/selftest-update.mjs`. Bi mat `~/.capcut-studio/update-signing.json` + `mac-codesign.p12/.json`
  (KHONG len git; mat khoa ky = app da cai khong nhan ban moi). Ban day du khong tu cap nhat.
- CHE DO CLI + ky nang GetTime (PROJECT_OVERVIEW 16): app chay khong cua so `"<app>/Contents/MacOS/Agent Edit" --agent-edit-cli
  <lenh>` (ban dev: `env -u ELECTRON_RUN_AS_NODE STUDIO_LICENSE=off node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
  --user-data-dir=<tmp> --agent-edit-cli status`). Ky nang GetTime: `gettime/agent-edit/` (SKILL.md + scripts/agent-edit, cai
  tang He thong, chat bat Toan quyen). Job CLI: `~/.capcut-studio/cli/jobs/<id>/`. Ban dong goi: selftest-packaged muc [6b] + `node scripts/selftest-gettime.mjs`
  (script ky nang bash / agent-edit.ps1 cai qua may chu gia + goi CLI; Windows chi tren CI).
- TAO VIDEO bang skill motionmaxxing + AUTOMATION VIDEO + SaydiVoice (PROJECT_OVERVIEW 17): skill dong goi o
  `capcut-ai-studio/skills/motionmaxxing` (BAN CHINH — `~/.claude/skills/motionmaxxing` la lien ket toi day). Test:
  `cd capcut-ai-studio && node tests/test_motion.mts`; tu kiem that (ton han muc Claude + Saydi): `env -u ELECTRON_RUN_AS_NODE
  STUDIO_LICENSE=off STUDIO_MOTION_TEST=<brief.json> <app binary> . --user-data-dir=<tmp>`.
- DAO DIEN Edit Video + the gioi am thanh (PROJECT_OVERVIEW 18, `sidecar/director.py`): `cd capcut-ai-studio &&
  HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_director.py`.
- Mac INTEL (x64): CI `macos-15-intel`. Tren may Apple Silicon: Node x64 + `arch -x86_64 npm ci` (roi
  `npm_config_arch=x64 node node_modules/electron/install.js` — electron tu tai ban ARM khi thay Rosetta) + `arch -x86_64 node
  scripts/dist.mjs --mac` -> `release/mac/`. onnxruntime Intel ghim 1.22.0 trong requirements.lock (marker platform_machine).
- Render self-test: `env -u ELECTRON_RUN_AS_NODE STUDIO_REMOTION_RENDER=<spec.json> STUDIO_REMOTION_OUT=<out.mp4> <app binary>`
  (VSCode terminals set `ELECTRON_RUN_AS_NODE=1`, which makes the app binary exit silently)
