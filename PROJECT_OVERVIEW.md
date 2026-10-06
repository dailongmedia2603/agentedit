# Agent Edit (truoc la Auto CapCut) - Tong quan source code

Tai lieu nay mo ta trang thai source ngay 2026-09-26 (sau khi GO luong CapCut), de lam moc khi
tiep tuc phat trien.

## 0. Thay doi 2026-09-26: go toan bo luong CapCut

Theo yeu cau nguoi dung, app chi con dung video bang Remotion. Da go:

- UI: menu "Tao video" (Pipeline dung draft CapCut), "Kho transition", "Kho hieu ung"
  (hieu ung canh / filter / font CapCut), cong tac "Buoc Review", provider Claude trong Cai dat
  (2026-09-27 dua lai Claude lam AI LAP KE HOACH — muc 11g),
  cac the CapCut trong Doctor (phien ban CapCut, dong bo compat, font swatch, CapCut Engine
  memory + skill), phan draft CapCut trong "Video da tao".
- Electron: services capcut/compat/probe/profile/fonts, IPC capcut:* fonts:* engine:* prefs:*
  transition:* kho:* pipeline:(understand|understandReference|plan|review|autoplan|build|deploy|
  export|selftest|revise), che do debug STUDIO_FULLRUN / STUDIO_TESTPLAN / STUDIO_UPDATE / STUDIO_E2E.
- Sidecar: route /doctor /find_effect /understand /understand_reference /plan /review /autoplan
  /revise /build /deploy /export /selftest /transition/* /kho/* /engine/*; module transition_lib,
  effect_lib, kho_draft, engine_manager, memory_store; script build_draft, deploy_draft,
  auto_export, find_effect, harvest_effects, probe_capcut, dump_resource_map, verify_kho,
  verify_fonts; asset effects_index.json, compat.json; references capability-map/plan-schema/
  edit-thinking; phan CapCut trong providers.py / engine.py / plan_guard.py / prompt_store.py.
- Test chi cua CapCut (effect_lib, transition_lib, transitions, engine_manager, skip_review,
  revision_loop). test_info_flow / test_run_log / test_plan_guard duoc viet lai cho luong Remotion.

Giu nguyen co chu dich:

- Ten NOI BO: `name: "auto-capcut"` trong package.json (Electron lay lam app.name -> userData
  `~/Library/Application Support/auto-capcut` chua `secrets.enc` + muc Keychain "auto-capcut Safe
  Storage"), `appId: app.autocapcut.desktop`, thu muc du lieu `~/.capcut-studio`. Doi = mat khoa API /
  du lieu. Ten HIEN THI (2026-09-26): "Agent Edit" = `productName` (electron-builder.yml), tieu de cua so,
  thanh tren cung (src/assets/logo.png), menu macOS (electron/main.ts `APP_DISPLAY_NAME`). Icon:
  `build/make_icon.py` (logo-agent-edit.png -> icon.icns, than icon 824/1024). Header `X-Title` /
  `User-Agent` gui API proxy van la AutoCapCut (proxy nhan dien client) — co y khong doi.
- Thu muc `CapCutAPI/`: venv Python cua sidecar hien nam o `CapCutAPI/.venv` (state.json ->
  venv_python). Doctor chi con kiem venv nay; may moi thi Doctor tao venv o
  `~/.capcut-studio/sidecar-venv`.
- Du lieu nguoi dung: projects.json (du an CapCut cu chi bi AN khoi "Video da tao"),
  prompt_overrides.json (muc CapCut cu nam im, van tinh vao fingerprint -> cache buoc AI khong
  bi mat), thu vien phan tich (phan `ref_gemini` cu chi con doc/xoa), kho transition/hieu ung
  cu trong `~/.capcut-studio` (khong con dung).
- Ban ma nguon truoc khi go: `~/.capcut-studio/source-backup-20260926-before-remove-capcut/`.

Kiem chung khi go: build + tsc (0 loi, ca --noUnusedLocals) + 9 bo test Python PASS; build_spec
tren plan Remotion that cho RenderSpec giong het tung byte truoc/sau (chi khac 1 dong bao cao:
"+ transition White Flash" -> "+ chuyen canh flash"); render MP4 qua Electron PASS; soat 7 trang
UI qua CDP khong co loi console.

## 1. Muc tieu san pham

Ung dung macOS nhan video goc, dung AI de phan tich va lap ke hoach edit, sau do dung video
HOAN TOAN bang code (Remotion 4.0.528), xem truoc va xuat MP4 1080x1920 ngay trong app.

Pipeline:

1. Nguoi dung chon mot hoac nhieu video nguon; moi video duoc nen 720p (muc 11b), Gemini xem cac
   source (vua 20 MB thi 1 request nhu cu; qua thi cat theo dung luong + ghep) va tao `sourceBrief`
   voi phan tich rieng theo `source_id`; Whisper can lai gio loi noi (muc 11a).
2. (Tuy chon) video mau: Gemini xem + nghe video mau, roi dai khung day -> bo phong cach (muc 11o; truoc 2026-09-28
   la GPT qua Codex CLI).
   (Tuy chon) TU LIEU CUA NGUOI DUNG: anh / video chen LEN video + muc dich, Gemini doc tung tu lieu (muc 11p).
3. AI lap ke hoach (GPT hoac Claude — muc 11g) lap plan qua cac buoc (`server.remotion_autoplan_route`): B1 chon chat lieu + cau chuyen
   -> B2 timeline -> code keo diem cat ve ranh gioi cau + noi lien timeline -> B3 hook ->
   R4 thiet ke (bo cuc + lop do hoa + chuyen canh + mau) -> tao anh -> R5 phu de -> B6 meme ->
   B7 SFX. Cau chuyen cua B1 va phan video mau lien quan (`providers.phong_cach_cho_buoc`) di vao
   moi buoc. Test luong: `tests/test_info_flow.py`.
4. `remotion_plan.build_spec(plan)` -> RenderSpec (dung lai lop cau truc cua plan_guard).
5. Xem truoc bang @remotion/player -> Render MP4 bang @remotion/renderer.

## 2. Cau truc repository

### `capcut-ai-studio/`

Ung dung desktop chinh: Renderer React + TypeScript + Tailwind; main process Electron; bridge
preload + IPC; sidecar Flask/Python; composition Remotion o `remotion-src/`; build electron-vite +
electron-builder, macOS arm64.

### `CapCutAPI/`

Engine CapCut cu. App KHONG con import/goi code nay; chi dung venv `CapCutAPI/.venv` lam Python
cho sidecar (co the chuyen sang venv rieng bang Doctor neu muon bo han thu muc nay).

### Root scripts va data

`build_*.py`, `render_final.py`, `deploy_to_capcut.py`, `export_capcut.py`, `gen_index.py`,
`gen_report.py`, `BAO_CAO_KHO_CAPCUT.md` la script/tai lieu nghien cuu cua giai doan CapCut, khong
phai code runtime. Cac thu muc `work*`, video `.mp4`, release la artifact.

## 3. Kien truc runtime

```text
React renderer
  -> window.studio (preload contextBridge)
  -> Electron ipcMain
  -> sidecar Flask tai 127.0.0.1:<random-port>   (AI, kho SFX/meme, thu vien, build_spec)
  -> electron/services/remotion.ts -> utilityProcess remotion-worker.ts -> MP4
  -> electron/services/media-server.ts (http 127.0.0.1 + token) cho Player + render
```

Bao mat noi bo:

- `contextIsolation=true`, `nodeIntegration=false`.
- Electron sinh token ngau nhien moi lan khoi dong sidecar.
- Cac endpoint sidecar nghiep vu yeu cau header `X-Studio-Token`.
- API key duoc Electron luu bang `safeStorage` (macOS Keychain), sau do day vao RAM
  cua sidecar qua `/config`.

## 4. Module ownership

### Electron

- `electron/main.ts`: tao window, dang ky IPC, che do tu kiem (STUDIO_DOCTOR, STUDIO_TESTCONN,
  STUDIO_RAWGPT, STUDIO_REMOTION_RENDER, STUDIO_DUMPCFG).
- `electron/ipc.ts`: toan bo contract renderer -> main -> sidecar.
- `electron/services/doctor.ts` + `toolchain.ts`: kiem + TU CAI toan bo cong cu khi mo app (muc 11n).
- `electron/services/sidecar.ts`: spawn Flask, random port/token, health check, HTTP client.
- `electron/services/secrets.ts`: provider config va API key (van giu cau hinh claude neu co).
- `electron/services/projects.ts`: luu project vao `~/.capcut-studio/projects.json`.
- `electron/services/remotion.ts`, `electron/remotion-worker.ts`: render MP4.
- `electron/services/media-server.ts`, `runlog.ts`, `myinstants.ts`, `state.ts`, `env.ts`, `paths.ts`.

### Renderer

- `src/App.tsx`: shell, sidebar, readiness gate (moi truong + Gemini + GPT).
- `src/pages/Doctor.tsx`, `Settings.tsx` (Gemini, GPT, Claude + chon AI lap ke hoach), `Sfx.tsx`, `Memes.tsx`, `Prompts.tsx`.
- `src/pages/CreateVideo.tsx` (the nhieu video, muc 11v) -> `src/pages/RemotionStudio.tsx` (1 video, muc 11).
- `src/pages/Projects.tsx`: danh sach + chi tiet project Remotion (an du an CapCut cu).

### Sidecar

- `sidecar/server.py`: Flask routes va orchestration (`/understand_sources`, `/remotion/*`,
  `/library/*`, `/prompts/*`, `/sfx/*`, `/meme/*`, `/config`, `/test_connection`, `/cli_status`).
- `sidecar/providers.py`: Gemini (hieu nguon: nen/cat/goi song song/ghep; gan nhan meme; 3 duong
  API goc / proxy / Antigravity CLI `agy`), cac buoc chung B1/B2/B3/B6/B7, ngu canh dung chung, `_chat`
  (API key hoac CLI subscription; Claude key goc -> `_anthropic_chat` /messages), `plan_chat` (AI lap
  ke hoach dang chon), `_safe_json`.
- `sidecar/gemini_media.py`: nen 720p + cat theo dung luong + ghep ket qua cac phan (muc 11b).
- `sidecar/remotion_plan.py`, `motion_design.py`, `reference_video.py`, `asset_gen.py`,
  `media_vision.py`, `sfx_kit.py`: luong Remotion (muc 11). `user_media.py`: tu lieu cua nguoi dung (muc 11p).
- `sidecar/plan_guard.py`: lop cau truc dung chung cho build_spec (quy doi gio, hook, meme cat vao,
  can SFX, chu tranh meme) + thong so nguoi dung chinh.
- `sidecar/engine.py` (kho SFX + resolve sfx_id/meme_id), `music_lib.py` (kho nhac nen, muc 13l), `meme_lib.py`, `analysis_library.py`,
  `speech_align.py`, `prompt_store.py`, `step_cache.py`, `run_log.py`, `debug_log.py`,
  `cli_providers.py`, `config.py`.

## 5. Du lieu va file runtime

- Engine state: `~/.capcut-studio/state.json` (venv_python, remotion_concurrency, remotion_license_key).
- Project metadata: `~/.capcut-studio/projects.json` (`mode: "remotion"`, con tro `currentRemotion`).
- Work directories: `~/.capcut-studio/projects/<slug>-<timestamp>/` (MP4 render ra nam o day).
- SFX: `~/.capcut-studio/sfx/` + `sfx_library.json`. Meme: `~/.capcut-studio/memes/` + `meme_library.json`.
- Nhac nen (13l): `~/.capcut-studio/music/` + `music_library.json` (kem settings: tu them nhac, muc so voi giong noi).
- Thu vien phan tich: `~/.capcut-studio/library/`. Cache buoc AI: `~/.capcut-studio/cache/steps/`.
- Prompt/quy tac nguoi dung sua: `~/.capcut-studio/prompt_overrides.json`.
- API secrets: Electron userData `secrets.enc`.

## 6. Plan Remotion (xem them muc 11)

`plan` (ban THO, gio than video): `source_videos[]`, `segments[]` (source_id, start/end nguon,
target_start, beat, `rm_transition`), `hook`, `captions`, `caption_theme`, `scene_effects`, `grade`,
`scenes`, `layers`, `assets`, `style_kit`, `faces`, `inserts`, `audio`, `speech`, `asr_words`,
`_pipeline`. `build_spec` tu dung cau truc (hook len dau, meme cat vao) va quy doi gio.

## 7. State machine UI (Video Remotion)

Stage: `upload` -> `preview` -> `done` (tu 2026-10-02 buoc video mau nam TRONG `upload`, xem 11v; du an cu
status `reference` mo o `upload`). Dang chay duoc persist thanh `understanding` / `analyzing_reference` / `planning` /
`rendering` (ca luc DANG CHO LUOT o hang doi); mo lai app thi bao gian doan va co nut chay lai dung buoc. Moi the
video luon mounted khi doi tab / doi the nen render khong mat tien do.

## 8. Diem can uu tien sua

1. Nhieu IPC goi `startSidecar()` cung luc luc mo app co the spawn 2 sidecar (race, co tu truoc).
2. Chua co test tu dong cho renderer/IPC contract; hien co tsc + soat UI qua CDP thu cong.
3. venv sidecar van nam trong `CapCutAPI/.venv`; muon bo han CapCutAPI thi cho Doctor tao venv moi.

## 9. Trang thai xac minh 2026-09-26

- `npm run build`: PASS. `tsc --noEmit` (ca --noUnusedLocals): 0 loi.
- `python3 -m compileall -q capcut-ai-studio/sidecar`: PASS.
- 9 bo test Python (`capcut-ai-studio/tests/test_*.py`, HOME tam): PASS.
- Render MP4 qua Electron (STUDIO_REMOTION_RENDER): PASS. Doctor (STUDIO_DOCTOR): uv + venv OK.

## 10. Nguyen tac khi phat trien tiep

- Moi field moi trong plan phai duoc cap nhat dong bo: prompt, build_spec, TypeScript type
  (`remotion-src/types.ts`, `src/global.d.ts`), composition va UI preview.
- Them danh muc Remotion = sua `sidecar/assets/remotion_catalog.json` + cach ve trong `remotion-src/`
  (test `tests/test_remotion_plan.py` muc [7] bat thieu).
- Moi buoc dai can persist trang thai cu the va co resume dung buoc.
- Them dau vao moi cho buoc AI thi phai them vao khoa `_step(...)` cua buoc do.


## 11a. Can gio loi noi (sidecar/speech_align.py, them 2026-09-25)

Gemini ghi gio cau trong transcript TRE 0.5-2.5s (do tren "test 1.mp4": trung vi +1.55s,
cac moc cach deu ~1.25s — Gemini "rai deu" chu khong do). Sau `/understand_sources` (va o
`/autoplan`, `/remotion/autoplan` cho brief cu), sidecar chay faster-whisper `small` (CPU,
int8, chi dung model DA CO trong ~/.cache/huggingface, khong tu tai) lay gio TUNG CHU, ghep
voi chu Gemini (difflib, bo dau) -> giu CHU Gemini, lay GIO that; emotion_map/key_moments
co gian theo cung ham quy doi. Ket qua ghi `sources[].timing` (`asr-align` | `gemini` + ly_do),
gio cu giu o `start_gemini`, chu Whisper o `asr_words`. Cache: ~/.capcut-studio/cache/asr/.
Luong Remotion con bam tung caption vao chu Whisper (karaoke dung chu). Do lai tren MP4 xuat
ra: caption lech loi noi trung vi -0.04s. Test: `tests/test_speech_align.py`.

## 11b. Video gui Gemini: nen 720p + cat THEO DUNG LUONG (sidecar/gemini_media.py, 2026-09-26)

Ly do: gui file goc (vd 138 MB HEVC 1080p) qua proxy = 1 request base64 ~184 MB -> timeout / 502;
Gemini CLI tung chan file > 20 MiB. Gemini chi lay ~1 khung/giay va tu thu nho khung -> 720p gan nhu
khong mat thong tin. Do that IMG_3839.MOV: 138 MB -> 10.8 MB, nen ~18-24s.

- `compress`: canh ngan <= 720 (tinh ca rotation), khong phong to, fps <= 30, H.264 CRF 28, AAC
  mono 64k. Cache `~/.capcut-studio/cache/gemini-media/` (khoa = duong dan + kich thuoc + mtime file
  goc), don file khong dung > 7 ngay. Nen hong -> gui file goc (hanh vi cu) + canh bao.
- `split` (chi khi ban nen > `PIECE_LIMIT_BYTES` = 20 MB thap phan, duoi muc 20 MiB cua CLI): diem
  cat tinh tu TONG BYTE goi tin (ffprobe), lui ve giua khoang im lang gan nhat (silencedetect, cua so
  <= 20s / 25% phan), phan sau bat dau o keyframe truoc diem cat ~5s (chong lan) va cat bang stream
  copy (khong nen lai, gio chinh xac). Diem bat dau khong phai keyframe (GOP dai hon 1 phan) -> nen
  lai rieng phan do. KHONG ep keyframe day khi nen: do that ton them 18-40% dung luong.
- Goi (`providers.gemini_understand_sources`): video nguyen gom chung 1 lan goi mien tong <= 20 MB
  (vua het -> y nhu cu, khong ghep); moi phan cat 1 lan kem ghi chu "PHAN k/n, giay A-B". Song song
  toi da 3; ket qua tung lan luu `step_cache` ("gemini_sources", 48h) -> loi 1 lan chi gui lai lan do;
  `fresh` bo qua cache nay. Luong phu phai `run_log.set_run` lai (nhat ky theo luong).
  Khoa cache cua file trong cache nen dung TEN + kich thuoc (khong dung mtime: file duoc "cham" moi
  lan dung lai -> mtime doi -> cache khong bao gio trung — loi da gap khi test).
- Ghep (`merge_parts`): cong gio bat dau phan; ranh giua 2 phan = giua doan chong lan, muc thuoc
  phan nao theo `start`; quality lay muc te nhat; roi 1 luot AI chi chu (`_GEMINI_MERGE_PROMPT`,
  sua duoc trong menu Prompt) viet lai tom tat + xep hang lai key_moments theo chi so, KHONG doi gio.
  Luot ghep hong -> giu ban ghep co hoc + canh bao.
- Test: `tests/test_gemini_media.py` (can ffmpeg).

## 11c. Gemini bang tai khoan Google qua Antigravity CLI `agy` — cli_providers.py, 2026-09-26

Gemini CLI (`gemini`) KHONG dung duoc cho tai khoan ca nhan (free / Google AI Pro / Ultra) tu
18/06/2026: dang nhap van thanh cong nhung moi yeu cau bi Google tra `IneligibleTierError: This client
is no longer supported...` (do that tren may user). Thay bang Antigravity CLI `agy` (da chay that 1.2.11
bang tai khoan Pro cua user):
- `agy -p <prompt> --output-format json --disable-slash-commands --print-timeout <n>s --model <m>`,
  thu muc lam viec `~/.capcut-studio/agy-work/`. JSON: `conversation_id`, `status` (SUCCESS|ERROR…),
  `response`, `error`, `usage`. Model: `agy models` (app chi lay model `gemini-*`, Pro dung dau);
  mac dinh `gemini-3.1-pro-high`. Ten model cu cua Gemini CLI da luu -> `agy_model()` doi ten.
- agy la AGENT: video den model qua cong cu `view_file` (image/pdf/video/audio, <= 100 MB) -> inlineData
  video/mp4 (ca hinh + tieng). Prompt liet ke duong dan TUYET DOI tung video (hard link vao
  `jobs/<id>/`). Do that: video thu 12s (so tren man hinh, vat chuyen dong, loi noi tieng Viet) -> dung
  het; IMG_3839 2 phut voi prompt Hieu nguon -> 160s, 62 cum loi thoai, cam xuc co bang chung tu net mat.
- agy luu MOI luot 2 ban sao video: `~/.gemini/antigravity-cli/conversations/<id>.db` va
  `brain/<id>/.tempmediaStorage/*.mp4` -> xoa theo conversation_id sau moi luot. So file trong
  `.tempmediaStorage` = so video model DA MO -> it hon so video gui -> bao loi (khong dung ket qua doan).
- Dang nhap: giao dien toan man hinh -> can Terminal that. Electron ghi `~/.capcut-studio/agy-login/
  dang-nhap-agy.command` (dat SSH_CONNECTION/SSH_CLIENT/SSH_TTY -> agy IN LINK + nhan ma, khong tu mo
  trinh duyet mac dinh -> user dan link vao dung trinh duyet co tai khoan Pro) roi `shell.openPath`;
  renderer hoi lai `cli_status` moi 4s. Phien luu `~/.gemini/antigravity-cli/antigravity-oauth-token`
  (app chi kiem tra CO file) — nam trong HOME that nen KHONG chay agy voi HOME rieng duoc.
- Cai: nut trong app chay trinh cai chinh chu `curl -fsSL https://antigravity.google/cli/install.sh | bash`
  (kiem SHA-512, dat `~/.local/bin/agy`, THEM dong PATH vao `~/.zprofile`). agy tu cap nhat nen.
- agy nhan MCP cua IDE (`codegraph` trong ~/.gemini/config) nhung do that luot headless khong bat no.
- Google (dien dan chinh thuc): goi binary agy chinh chu headless tu app khac tren tai khoan AI Pro ca
  nhan duoc phep neu khong lay token; chay dong thoi / lien tuc de cham gioi han RPM/TPM -> app chay
  toi da 2 luot agy cung luc (`GEMINI_PARALLEL_AGY`), API thi 3.
- Chua dung duoc: `agy` in ra loi dang nhap / het han muc -> `_auth_hint` / `_quota_hint` tieng Viet.
- Test: `tests/test_gemini_agy.py` (chuong trinh `agy` gia, HOME tam).
- Kiem thu tu dong: KHONG chay giao dien `agy` trong pty de do — lan dau chay no tu mo trinh duyet that
  cua user (lenh `open` gia trong PATH khong chan duoc).

## 11d. Video HDR (iPhone) -> ban lam viec SDR; lop tach nguoi khop khung (2026-09-26)

Su co that (IMG_3839.MOV = HEVC 10-bit, BT.2020, HLG + Dolby Vision): nguoi trong video da dung bac mau /
chay sang, lop tach nguoi lech khi cu dong. Do bang so:
- Moi cho doc video bang ffmpeg KHONG chuyen HDR->SDR (tach nguoi, anh chup tu nguon, anh thu nho, ban
  nen gui Gemini) ra khung sang hon ban chuan cua Apple ~27 muc + nhat mau. Lop tach nguoi lay RGB tu cac
  khung do -> nguoi de len video nen bac/chay. Xem truoc (Chrome) phat thang HLG + CSS filter (grade) ->
  chay sang; render (Remotion `toneMapped` mac dinh) ra mau khac.
- `sidecar/media_sdr.py`: `working_path(path)` — video HDR (transfer HLG/PQ) -> ban SDR BT.709 tao 1 LAN
  (cache `~/.capcut-studio/cache/media-sdr/`, xoa neu 60 ngay khong dung) bang `avconvert` (AVFoundation,
  mau dung nhu Anh/QuickTime, 2 phut video = ~20s); ket qua phai THAT SU la SDR (avconvert gap H.264 8-bit
  gan nhan HLG thi giu nguyen HLG) -> khong thi ffmpeg zscale+tonemap hable npl=203 (gan Apple nhat trong
  cac phuong an ffmpeg da do); hong het -> file goc. Video SDR: tra nguyen, khong ton gi.
- Noi vao: `build_spec` (`working_sources` -> path = ban SDR, orig_path = goc; meme / overlay qua
  `working_path`), `/remotion/autoplan` SAU B1-B3 (du lieu vao cac buoc AI giu duong dan goc -> cache
  dung lai), `media_vision.face_box/subject_matte`, `asset_gen.source_still`, `gemini_media.prepare`
  (nen tu ban SDR), `reference_video.analyze_reference`, anh thu nho thu vien (`sdr_vf`, ten `_v2.jpg`).
- Spec co `media: 2` (`remotion_plan.SPEC_MEDIA_VERSION`). RemotionStudio mo du an co spec cu (media < 2)
  -> tu dung lai spec tu plan (khong goi AI) + thong bao.
- Lop tach nguoi cham 1 khung: ffmpeg `-ss A` lay khung DAU TIEN tu A tro di, A giua 2 khung (85.61s =
  khung 2568.3) -> bat dau khung 2569 nhung spec ghi 85.61. Sua: `matte_grid_start` lam tron XUONG khung
  nguon (fps danh nghia) + ghi dung moc do vao spec. Do bang render Remotion (chu sau nguoi): cach cu 3.5%
  diem lech trong vung nguoi, dung khung 0.00%. (Do bang ffmpeg `-ss` KHONG dung duoc — quy uoc chon khung
  cua Remotion khac.) Cache matte `v2`.
- Xem truoc: video nen + lop tach nguoi la 2 the video, Remotion mac dinh cho lech 0.45s -> clip co lop
  tach nguoi dat `acceptableTimeShiftInSeconds` 0.15s (`SUBJECT_SYNC_SEC`). Do that khi phat: lech 0.013s.
- Test: `tests/test_media_sdr.py`.

## 11e. Cat an toan theo tieng noi + lop chu khop loi (sidecar/speech_cut.py, 2026-09-26)

Su co that (IMG_3839, du an r_muhwdi9idyzqlb): "cat canh khi tieng chua noi het" va "chu / anh nhay ra
kem am thanh di truoc vai giay". Nguyen nhan: diem cat lay theo "cum tu" Gemini (cum noi lien van bi coi
la khoang lang -> cat giua cau), cat dung moc het chu cua Whisper (Whisper bao het chu SOM hon am that,
va hay nuot khoang lang vao chu); lop chu R4 neo o dau cau thay vi luc noi tu khoa (som toi 1.58s).
- Chi dung toi cho NHAY DOAN (hai doan lien nhau tren timeline ma khong noi tiep trong nguon).
- Cuoi doan: khong cat giua chu / giua cau (dau cau, lang >= 0.25s, dau phay + lang >= 0.12s, hoac lang
  THAT >= 0.18s trong am thanh). Thu tu: noi cho het cau (<= 1.2s) -> noi lien sang doan ke tiep cung
  nguon -> lui ve cho ngat truoc (<= 1.2s) -> noi toi 2.5s -> giu nguyen. Diem cat = het tieng that (do to
  10ms, nguong = nen + 35% khoang dong, lang >= 40ms o vung duoi am) + 30ms; duoi am duoc vuot moc Whisper
  cua chu sau toi 0.1s; noi lien khong co lang -> cat o cho nho tieng nhat.
- Dau doan: lui ve dau cau (<= 1.2s) / bo chu bi cat do; vao truoc tieng dau 30ms; khong tu cat bot lang.
- Khong keo vao doan nguon da dung cho doan khac. Meme / SFX neo DUNG mep doan vua bi thu vao -> theo mep
  moi (`follow_anchors`). `plan_guard.source_to_timeline` du phong = cuoi doan GAN NHAT truoc gio nguon
  (truoc day lay doan dau tien -> meme giay 109 bi chen len giay 1.3).
- Lop chu (`snap_layers`): tim chu Whisper khop phan chu CHINH cua lop (khong dau, gan dung, >= 60% chu
  khoa theo thu tu) trong [src_start-0.6, src_end+1]; Whisper nghe sai -> dung chu phu de (moc noi suy);
  tu da bi cat khoi video -> bo qua. Lop hien 0.12s truoc tu (`LAYER_LEAD`); hinh cung `group` doi theo;
  SFX rieng cua plan trung gio bat dau cu cua lop (<= 0.15s) doi theo; SFX cua lop di theo lop san.
- Noi vao: `build_spec` (sau chuan_hoa_segments; loi -> bo qua, giu diem cat cu), `plan_guard._hook_segment`
  (`fix_range`), `/remotion/autoplan` ngay sau B2 (B3..B7 thay dung timeline se dung). Moi ham on dinh:
  chay lai khong doi. Do to cache `~/.capcut-studio/cache/speech-energy/` (file goc mat -> dung ban SDR).
- Spec `media: 3` -> RemotionStudio mo du an cu tu dung lai spec tu plan.
- File video nguon bi chuyen / xoa -> `build_spec` tra loi "Khong tim thay file video nguon" (truoc day ra
  spec khong clip ma van ok) -> UI giu spec cu, hien ly do, lan mo sau thu lai.
- Do tren du an that (spec cu -> moi): cho nhay canh cat khi con tieng 7 -> 0, giua chu 1 -> 0, giua cau
  1 -> 0 (render that: 13/13 diem cat nam trong lang); lop chu hien som > 0.5s: 7 -> 0 (lech lon nhat
  1.58s -> 0.20s); video dai 64.7s -> 65.9s.
- Kem theo: `media_sdr` KHONG cham gio sua ban SDR nua (file `.used` danh dau con dung) — truoc do moi lan
  dung spec deu tach nguoi lai (~100s) vi khoa cache matte theo gio sua. Sidecar: `startSidecar` dung chung
  1 lan khoi dong (truoc day mo app spawn 2-3 sidecar, tat app chi tat 1 -> sidecar mo coi) + sidecar tu
  thoat khi app me mat (`_theo_doi_app_me`).
- Test: `tests/test_speech_cut.py`. Luu y tu kiem render trong terminal VSCode: phai `env -u
  ELECTRON_RUN_AS_NODE` (VSCode dat bien nay -> binary app chay nhu node va thoat ngay, khong log).

## 11f. Video cua du an duoc chep vao thu muc du an (2026-09-26)

Su co that: IMG_3839.MOV + tiktok_video.mp4 bi chuyen khoi Downloads -> du an mat video (du an luu duong
dan tuyet doi toi file goc o videos, sourceBrief, referenceAnalysis, rmPlan, rmSpec).
- Them video nguon / video mau (chon file, keo-tha, chon tu thu vien) -> `electron/services/project-media.ts`
  chep vao `<workDir>/video-nguon/` | `<workDir>/video-mau/` (workDir = `~/.capcut-studio/projects/...`, tao
  ngay luc them video). `copyFile(COPYFILE_FICLONE)`: cung o APFS = clone (tuc thi, khong ton them dung
  luong, file goc giu nguyen); khac o -> chep that, kiem dung luong trong (+512MB). Chep ra `.dang-chep` roi
  doi ten, giu ngay sua goc. Cung noi dung da co -> dung lai; khac noi dung cung ten -> `ten-2`. IPC
  `media:import` chi ghi trong `~/.capcut-studio/projects/`. Moi buoc sau dung ban trong du an; video luu
  `origPath` (noi chon file, de hien thi / nhan trung).
- Mo du an cu (`src/lib/projectMedia.ts` `adoptProjectMedia`): video con nam ngoai -> chep vao + thay duong
  dan o MOI noi trong du an (`replacePaths`, thay chuoi trung khop hoan toan) + luu. Video nguon da mat +
  spec con ban lam viec SDR (`cache/media-sdr`) DUNG do dai (+-0.6s, dung 1 ung vien) -> chep ban do vao du
  an (`<ten>-ban-sdr.mov`, `recovered: true`) va dung no; con lai -> banner "Chon lai file" (kiem do dai
  lech <= 1s, chep vao du an, thay duong dan, dung lai spec). Nguon doi duong dan / file cua spec mat ->
  dung lai spec tu plan (`staleTick`).
- Thu vien phan tich nhan video theo NOI DUNG nen ban chep van dung lai phan tich cu; file thu vien tro
  toi bi mat -> tro sang ban chep cung noi dung (`analysis_library._refresh_path`).
- Keo-tha: Electron 32+ bo `File.path` -> keo-tha video truoc day KHONG them duoc gi; nay dung
  `webUtils.getPathForFile` (preload `pathForFile`).
- Test: `node tests/test_project_media.mts` (Node >= 23), `tests/test_analysis_library.py`. Tu kiem UI: HOME
  tam + du an gia lap; keo-tha qua CDP phai tao File that bang `DOM.setFileInputFiles` roi phat `drop` vao
  dung o `.border-dashed` (`Input.dispatchDragEvent` khong toi trang).
- Xoa du an trong app KHONG xoa thu muc du an (co ban render + video chep) — giu nguyen quy tac cu.

## 11g. AI lap ke hoach: GPT hoac Claude (2026-09-27)

- Chon trong Cai dat API -> muc "AI lap ke hoach"; luu `state.json` -> `plan_provider` ("gpt" mac dinh,
  "claude"). Sidecar doc lai moi lan (`config.plan_provider()`), khong can khoi dong lai.
- MOI buoc ke hoach (B1, B2, B3, B6, B7 trong providers.py; R4 motion_design/remotion_plan; R5) goi
  `providers.plan_chat(...)`. Buoc ke hoach moi PHAI goi `plan_chat`, dung goi thang `_chat("gpt")`.
- Van GPT (Codex CLI): tao anh AI (`asset_gen`) + chu anh AI (`text_art`). Phan tich video mau: Gemini tu
  2026-09-28 (muc 11o).
- Khoa cache buoc: `config.provider_fingerprint(plan_provider())`; van tay GPT giu dang cu (cache cu
  van dung), doi sang Claude thi chay lai that. Plan ghi `_pipeline.ai` (UI hien "Ke hoach ... (Claude)").
- Claude CLI: `claude -p --output-format json --model <id> --max-turns 1 --tools "" --no-session-persistence
  --setting-sources "" --strict-mcp-config ... [--effort low|medium|high|xhigh|max]`. Dang nhap: app mo
  Terminal chay `claude auth login --claudeai` (file .command, giong agy), UI hoi lai `cli_status` 4s/lan.
  Nut "Cap nhat Claude Code" chay `claude update`.
- Model (`cli_providers.SPEC["claude"]`) da goi that 2026-09-27 voi Claude Code 2.1.186: opus-5, fable-5,
  sonnet-5, haiku-4-5 chay; opus-5-5 can CLI >= 2.1.280, fable-5-1 >= 2.1.251 (`min_cli` -> UI ghi
  "can cap nhat", loi API "does not support this model; version X" -> `_outdated_hint`).
- Do that B1/B2/B3 bang claude-opus-5 (du an quang cao 37s): 32s / 47s / 12s, JSON hop le.
- Test: `tests/test_claude_planner.py`.

## 11h. Xoa du an o "Video da tao" (2026-09-27)

- Nut Xoa mo hop xac nhan (`Projects.tsx` DeleteDialog). Mac dinh CHI go khoi danh sach (projects.json).
  Tick "Chuyen ca file tren may vao Thung rac" -> `shell.trashItem` thu muc du an (ban chep video nguon/mau,
  video da render) + `runs/<id>` (nhat ky). Thung rac hong -> KHONG go khoi danh sach.
- Chan dua vao Thung rac (`projects.ts` trashBlock): thu muc ngoai `~/.capcut-studio/projects/`, chinh
  thu muc projects/, dung chung voi du an hop le khac, dang render vao thu muc do (ipc). Video goc ngoai du
  an, thu vien phan tich va cache buoc AI khong bao gio bi dung.
- Trang Video Remotion luon mounted va tu luu du an -> App truyen `deletedReq` (du an dang mo bi xoa ->
  reset, khong luu nguoc lai) va nhan `onBusy` (dang chay buoc / chep video -> nut Xoa bi khoa).
- Test: `HOME=$(mktemp -d) node tests/test_project_delete.mts` (gia lap 'electron' qua
  `tests/helpers/electron-mock-loader.mjs` — dung lai cho test service Electron khac).

## 11i. Noi dung + chu + anh AI: luat cung bang code (2026-09-27)

- Noi dung: B1/B2 KHONG dao thu tu, chi bo im lang / tieng dem / cau lap; hook la BAN SAO dat len dau.
  `providers.giu_thu_tu_nguon` (sau B1 + B2), nhieu video: B1 tra `thu_tu_video` theo noi dung,
  `providers.thu_tu_video` kiem, `bo_trung_giua_video` bo doan noi lai giua 2 video. Test `test_content_order.py`.
- Khoa cache (`prompt_store.fingerprint`) tinh prompt DANG CO HIEU LUC (ca mac dinh) — truoc chi tinh phan user sua.
- Quy tac chu (`motion_design.py` muc QUY TAC CHU; goi trong `remotion_plan.build_spec`):
  1 khong emoji: lop `emoji` + `emoji_pop` + ky tu emoji trong chu/caption bi bo (catalog khong con emoji_pop);
  2 `reading_order` (gio nguon, sau `snap_layers`): tang/lop cung group NOI TRUOC len tren/trai — moc lay tu
  CUNG mot nguon (Whisper hoac chu phu de), cum ngan khop du tu, chon to hop moc gan nhau nhat;
  3 `text_rules` (moi lop text) chu dac, glow <= 0.3 co chu, thu vua 94% khung + `ensure_legible` do do sang
  NEN THAT sau khoi chu (khung video / anh panel / gradient) -> tuong phan < 4.5 hoac nen nhieu chi tiet thi
  them vien + bong; 5 `_behind_clear` (trong `attach_subject_mattes`): mat na tach nguoi that
  (`media_vision.matte_mask`) — che <= 22% khoi chu va <= 10% nua tren, khong dat thi nang/thu nho, cuoi cung
  dua chu ra truoc nguoi tren dau; 6 chu de len nhau: dy >= -0.3em, doi mau TANG PHU + vien tach; hai TO HOP
  khac nhau chong nhau -> khoi truoc tat khi khoi sau hien (`separate_group_overlaps`); 7 phan cap theo co
  NHIN THAY (chu viet tay x0.62): tang phu khac font <= 75%, <= 2 font, to hop nhieu font tang chinh >= 84px.
- Anh AI: `asset_gen._ASSET_IMAGE_PROMPT` (sua duoc trong menu, template {prompt}{context}{out}) +
  `motion_design.asset_contexts` (cau dang noi luc anh hien, vai tro tren man hinh, chu cung luc, chu de) —
  boi canh nam trong khoa cache anh. R4 viet prompt 7 phan + `illustrates`.
- Do dac tren khung hinh (neo dinh dau, do che, do nen, ne mat) quy doi qua `motion_design.clip_map` / `_zoom_at`
  — giu KHOP `AutoEdit.tsx` (cover + object-position theo mat + jump-cut zoom `scale`).
- `SPEC_MEDIA_VERSION` 4 -> du an cu mo lai tu dung lai spec tu plan (ap quy tac chu); anh cu giu nguyen
  (muon anh theo prompt moi thi lap plan lai). `DESIGN_VERSION` 4. Test: `tests/test_text_rules.py`.

## 11j. Phong cach: CHI tu video mau, khong mac dinh, khong luu chung (2026-09-27)

- User: app edit NHIEU loai video -> khong duoc co phong cach mac dinh. Truoc do bo "mac dinh" chinh la
  phong cach mau1 (chu do phat sang sau dau + chu viet tay, the cam, vong tron cuoi) nen moi video khong
  video mau deu giong nhau; bo cua video mau con bi tron phan thieu tu mau1; R4 prompt + `audit_design`
  ep chi tieu mau1 (>= 3 bo cuc, to hop nhieu tang moi 12s, hook fisheye, CTA Follow).
- Co video mau: `motion_design.style_kit_for` tra NGUYEN style_kit boc tu video mau do (luot 2
  `reference_gpt`), luu kem phan tich video mau trong thu vien (`analysis_library` ref_gpt) -> chon lai
  video mau tu thu vien la dung lai. `audit_design` dem chi tieu theo CHINH bo do (share bo cuc,
  motion.density, recipes, broll_style).
- Khong video mau: style_kit = None. R4 tu thiet ke theo noi dung + tone + edit_request va ghi `style`
  (mood, palette, fonts, image_style, density) -> `motion_design.session_style` kiem -> `plan.style_kit`
  (_nguon "phien_nay") — chi nam trong plan du an do. `audit_design` chi kiem loi cau truc.
- Gia tri cai san da go: nen the/graphic khong ghi mau -> mau lay tu khung video (`_video_colors`),
  hoa van mac dinh "none", pop-out khong mac dinh; DSL muc 7 chi con vi du CU PHAP (cho trong `<...>`);
  vi du schema R4/R5 la placeholder. Quy tac chu (11i) van ap cho moi phong cach.
- Test: `test_remotion_plan.py` [12][13], `test_info_flow.py` (co video mau -> R4 nhan dung bo cua no;
  khong -> style_kit null, plan khong luu bo nao).

## 11k. LUONG EDIT MOI — hieu ung tu de xuat theo boi canh + tu viet code (2026-09-27)

- 2026-09-28: LA LUONG DUY NHAT. Da go nut "Luong Edit moi" + luong cu (v1): IPC settings:getEditFlow /
  setEditFlow, `config.edit_flow_v2`, `EditFlow` (state.ts), tham so `edit_flow` cua autoplan (client cu gui
  "v1" -> bi bo qua), nhanh R4 v1 (`hook_rule.luat("R4")` trong R4 thiet ke + giu effects / speedlines kho).
  GIU (dung chung): kho hieu ung Remotion + cach ve (Hook-FX chon trong kho la du phong khi Hook-FX-plan hong,
  `fallback_effect`, R4-visual du phong van co `luat("R4")`), cach ve speedlines / scene_effects (du an cu).
  Khoa cache R4 giu `"flow": "v2"`, prompt `_NEW_FLOW_NOTE` giu nguyen chu, `_pipeline.luong` = "v2" ("v1" = du
  an lap khi con luong cu). Kiem: autoplan (AI gia, 6 kich ban) code moi vs code cu + edit_flow v2 GIONG HET:
  thu tu buoc, system prompt + payload tung buoc, khoa cache, plan, spec. state.json van con khoa `edit_flow` (bo qua).
  Ban nguon truoc khi go: `~/.capcut-studio/source-backup-20260928-before-remove-edit-v1/`.
- (Lich su) Bat / tat: nut "Luong Edit moi" tren trang Video Remotion -> state.json `edit_flow` = "v2" | "v1" (IPC
  settings:getEditFlow / setEditFlow); autoplan nhan kem `edit_flow`. TAT = luong cu y nguyen (khong buoc nao
  moi chay, khoa cache R4 khong doi).
- Bat: R4 khong khai effects / speedlines (`motion_design._NEW_FLOW_NOTE` + code go); sau R5 chay
  `fx_flow`: `fx_moments` (boi canh TUNG segment: loi noi, cam xuc, su kien, bo cuc, chu tren man hinh, mat,
  hook) -> FX-plan (`_FX_PLAN_SYSTEM`: context -> goal -> why_fit -> visual, khong co muc tieu thi khong dat;
  `sanitize_plan` bo hieu ung thieu ly do / ngoai khoanh khac / 2 transform chong) -> FX-code
  (`_FX_CODE_SYSTEM`, tu kiem lan 2 `fit_check`) -> hop cach ly `sidecar/fx_runtime.mjs` kiem -> loi thi FX-fix
  1 luot -> van loi thi bo. `plan.fx` giu code + boi canh (hien trong "Ket qua: Ke hoach").
- HOP CACH LY: Node `vm` context rong, API dinh nghia BEN TRONG context, chi chuoi JSON qua bien gioi,
  `codeGeneration.strings = false` (chan Function('...')), tu cam (constructor, require, Math.random, Date...),
  timeout 250ms / lan goi, the / thuoc tinh cho phep (khong text / image / url ngoai). Chay bang binary
  Electron (`STUDIO_NODE_BIN` = process.execPath, ELECTRON_RUN_AS_NODE) hoac `node` (dev / test).
- Dung: `fx_flow.fx_to_spec` (trong build_spec) ve SAN tung khung -> `~/.capcut-studio/cache/fx/<hash>.json`
  (khoa: code + do dai + fps + khung + vi tri mat + tham so); spec.fx (lop phu front / behind) + spec.fxTransforms
  (so tung khung). Remotion `FxLayer.tsx` chi hien chuoi SVG da loc (may chu media cho phep .json CHI trong
  cache/fx); transform ap vao khung video (ban goc + ban tach nguoi). Code AI KHONG chay trong app / trinh render.
- Test: `tests/test_fx_flow.py`, `tests/test_info_flow.py` [11].

## 11l. Luong Edit moi — CHU ANH AI cho moi cum chu noi bat (2026-09-27)

- Ap cho MOI cum chu noi bat (lop chu R4, chu hero R5, chu hook); KHONG ap phu de karaoke, the trich dan
  (reveal), cum > 48 ky tu, bo dem so. Luon chay (sau R5), chay nen song song voi FX / B6 / B7 (muc 11q).
- `sidecar/text_art.py`: `lockups_from` (lop cung group gop 1 cum -> phan cap chinh / phu dung ca to hop) ->
  `_pack` (<= 3 cum, <= 5 hang / tam) -> `gen_sheet` (Codex image_generation, prompt `_TEXT_ART_PROMPT`, NEN
  TRONG SUOT, tam dau lam MAU phong cach cho cac tam sau qua `-i`) -> `slice_sheet`: `segment_rows` (tach moi khe
  roi gop khe hep nhat toi dung so hang; hang dinh nhau -> tach o cho mong nhat), OCR Vision vi-VT kiem chinh ta
  (bo dau, >= 0.72) + khung TUNG TU (`boundingBoxForRange`), cat PNG vao `~/.capcut-studio/cache/textart/`.
  Cum loi -> tao lai 1 lan -> van loi thi giu chu code. plan["text_art"]["items"].
- Dung: `motion_design.art_index` (tra theo chu cua TANG) + `_attach_art` (sau text_rules: co chu = khop BE NGANG
  phan chu dac voi be ngang chu thiet ke, chan 0.75-1.9 co; tang sau chong nhe phan dem; vao theo TUNG TU
  `words_rise` neu R4 chi khai vao ca khoi), `hero_captions_to_art` (chu hero/hook -> lop chu anh). _text_width /
  _text_height doc kich thuoc anh -> ne mat / phu de / chu sau nguoi van dung. Remotion `Layers.tsx` ArtText:
  moi tu la cung anh, clip-path theo khoang x, vao lech nhau.
- Do that (video 1:49): 18 cum / 6 tam, ~4 phut; 18/18 dat sau khi sua cach tach hang. Test `tests/test_text_art.py`.

## 11m. Gio chu, cat noi lai, luat hook (2026-09-27, ca 2 luong)

- GIO CHU (`speech_cut.snap_layers`): cau phu de (loi Gemini) CHUA cum chu lam MOC — chi tim tieng noi trong cau
  do +-0.8s (Whisper bo sot cau dau 'mình là Mr Vi Coding' tung lam chu nhay 2.7s sang 'mình sẽ'). Cum ngan chi con
  <= 1 chu khoa -> khop NGUYEN CUM (cho chen <= 2 chu dem: 'rất LÀ quan trọng'). Diem khop tru 0.25/giay lech (cho
  day du hon o xa khong thang cho vua du tai gio AI); diem < 0.25 bo; khong moc cau + doi > 1.5s chi khi >= 2 chu khoa
  khop het. Hinh / chu khong khop trong nhom theo lop khop GAN no nhat. SFX anchor hook chi theo lop cua hook, kep
  trong khoang hook (truoc day tieng dam mo hook bi keo ra ngoai -> hook mat tieng). Player tai truoc anh chu AI 2.5s.
- NOI LAI (`providers.bo_lap_trong_video`, sau B1): o CHO VAP (B1 bo cau giua / khoang >= 0.8s / cau '...' / cau bat
  dau 'ờ') so cau truoc vs sau (quy hoach dong, >= 2 cau khop theo thu tu, >= 5 chu mang y, moi cap co chu RIENG) ->
  bo lan truoc tu cau lap dau toi cho vap, ghi `removed`. Sau B2: `ton_trong_da_bo` (B2 khong dua lai), `gioi_han_cat`
  (segment ke phan da bo -> hard_lo/hard_hi; `safe_start` locked: dang co tieng thi TIEN toi khoang lang, khong lui
  vao 'Ví dụ như là' da bo), `speech_cut.trim_filler_edges` (dau/cuoi doan >= 0.6/0.8s khong co chu Whisper ma loi
  Gemini xac nhan chi la 'ờ' / lang -> cat sat). Prompt B1/B2 them muc DOAN NOI LAI.
- LUAT HOOK (`sidecar/hook_rule.py`): hook (ban sao dau video; khong co hook = 3.5s dau) BAT BUOC co hieu ung HINH +
  AM THANH gay chu y, KHONG ep loai, MUC DO THEO TONE (user: "ke chuyen nhe nhang thi hieu ung phu hop"): nhe (ro nhung
  em, khong rung/loe/glitch) / vua (dut khoat) / manh (manh tay, chong lop). B3 ghi hook.attention.muc_do (+ ly do);
  khong co -> `muc_do()` doan theo tone B1 + edit_request + mood. Code NOI luat vao prompt B3 / R4-visual (du phong) / FX-plan /
  B7 (khong nam trong prompt user sua). `ensure()` sau build_spec DO tren SPEC that (`measure`): chuyen dong khung
  (bien do + toc do len dinh; rung = giat DOI CHIEU, dich tam khi zoom khong tinh), lop hinh tu viet (ve khung SVG bang
  NSImage -> do phu + do dong; khung trong = 0), hieu ung kho (bang loai x cuong do). Nguong: nhe >= 0.45 cham <= 0.8s,
  khong gat; vua >= 0.8 / manh >= 1.1 cham <= 0.5s; va >= 0.75 x hieu ung manh nhat than video (tran 1.5 x muc). SFX vao
  <= 1s (nhe 1.5s), am luong >= 0.3. Thieu / yeu / muon / gat -> AI lam lai kem so do (v2: Hook-FX-plan tu viet code, bo
  transform cu; con lai Hook-FX chon trong kho; Hook-SFX), van khong dat -> du phong theo muc + du nguong (nhe focus;
  vua zoom_punch (+focus); manh zoom_punch + flash), ghi `_pipeline.luat_hook`. Prompt `_HOOK_FIX_SFX_PROMPT`,
  `_HOOK_FIX_VISUAL_PROMPT`. Do that video IMG_3839: hook cu (fx5 day may 10%, cham 0.96s) = 0.55 -> YEU.
- 2026-09-28 (user: "hook van khong du manh, van khong cat khoang nghi, tach nguoi khi chuyen dong khong chuan"):
  - HOOK do theo NHIP (`hook_rule.measure` -> events): thay doi so voi 0.2s truoc (giu zoom KHONG tinh), lop hinh ve
    khung -> thay doi alpha, chu / hinh vao = nhip nho, cut = nhip toan khung. BAT BUOC hieu ung TOAN KHUNG (chuyen dong
    khung / hieu ung kho / lop phu >= 35% khung; icon nho khong tinh) + so nhip (nhe 1 / vua 2 / manh 3) + khong dung im
    (vua 2s / manh 1.5s). Muc do: YEU CAU EDIT (style / purpose) > B3 > tone. Du phong du nhip theo muc.
    Do video 09-28: 2 nhip, dung im 1.7s o muc manh -> CHUA DAT (luat cu bao 2.20 "dat" vi lay zoom dang giu).
  - `speech_cut.tighten_pauses` (sau B2, ca 2 luong): lang THAT (dB) > `pause_limit` (nhanh 0.30 / thuong 0.45 / nhe 0.75s)
    giua doan -> tach doan (+0.08 scale jump-cut); cho noi 2 doan (duoi + dau) -> cat; chi o doan CO chu Whisper, khong
    cat qua chu dau / cuoi. Mep cat danh dau quiet_start / quiet_end -> fix_segment_cuts giu nguyen (on dinh).
  - Tach nguoi (`media_vision.subject_matte`, key v3): moi khung DOC LAP bang VNGenerateForegroundInstanceMaskRequest,
    chi giu vat the trung >= 40% mat na nguoi, trung vi 3 khung (bo nhap nhay, khong tre). Truoc: VNSequenceRequestHandler
    keo mang nen canh dau khi gio tay (thua ~1.6% khung), hut tay vung nhanh. May khong co API -> cach cu.
- SPEC_MEDIA_VERSION 7 (tach nguoi moi); 6: du an cu mo lai tu dung spec (gio chu + SFX hook moi, khong goi AI). Cat noi lai + luat
  hook (AI bo sung) chi co khi LAP KE HOACH LAI.
- Test `tests/test_cut_hook_rules.py` (+ test_info_flow [0]/[11]).

## 11n. DOCTOR: kiem + TU CAI toan bo cong cu khi mo app (2026-09-28)

User: "may nguoi khac cai app ve phai co day du toan bo cong cu (dung phien ban) de edit chuan nhat".
- Moc phien ban + nguon tai + SHA-256 o MOT file `sidecar/assets/toolchain.json` (Electron + Python cung doc);
  thu vien Python khoa 47 goi trong `sidecar/requirements.lock` (tao tu venv dang chay tot, `uv pip compile`, macOS 14).
- Danh sach (nhom trong Doctor): He thong — macOS >= 14 Apple Silicon (onnxruntime cua faster-whisper chi co ban
  macOS 14+), avconvert (co san), bo dung Remotion + fx_runtime (trong app). Xu ly video & am thanh — FFmpeg/FFprobe
  7.0 tinh (zackees/ffmpeg_bins GHIM MA COMMIT + SHA-256, chinh la ban dang chay tren may user), Whisper small
  (Systran/faster-whisper-small revision 536b066 + SHA-256 tung file), Chrome Headless Shell 149.0.7790.0 (ban
  @remotion/renderer 4.0.528 kiem — test so voi TESTED_VERSION). Python — uv (cai ban 0.11.18), Python 3.12 venv,
  47 goi dung ban, Vision (tach nguoi + OCR vi-VT). AI — Gemini (agy >= 1.2.11 hoac API key), AI lap ke hoach
  (Claude Code >= 2.1.283 hoac API key / GPT), Codex >= 0.156.1 (anh AI + chu anh AI; ban GitHub openai/codex ghim
  SHA-256, KHONG can Node/npm).
- CLI AI: tu cap nhat + may chu bo ban cu -> luat "khong thap hon ban da kiem chung" (cai moi thi dung ban ghim).
  Con lai (ffmpeg, Whisper, Chrome, Python + goi): DUNG ban ghim.
- Cai o thu muc nguoi dung, khong sudo: `~/.capcut-studio/tools/bin` (ffmpeg, ffprobe, codex — tim TRUOC moi noi:
  env.ts, `remotion_plan._ffbin`, `cli_providers._EXTRA_DIRS`), ~/.local/bin (uv / Claude / agy — trinh cai chinh chu),
  venv `~/.capcut-studio/sidecar-venv` (hoac venv cu trong state.json neu dung Python 3.12), cache Hugging Face.
  Tai ve sai SHA-256 -> xoa, bao loi. May da co DUNG ban ffmpeg (hash khop) -> chep, khong tai (Doctor bao ro "chep,
  khong tai"). Mang chap chon (do that: 1/3 luot tai 42 MB bi ngat "terminated", 1 luot ra sai ma) -> `download` tai
  TIEP bang HTTP Range (toi 6 lan), sai kich thuoc / sai ma -> tai lai tu dau (toi 3 luot) roi moi bao loi.
- Do that may moi (HOME tam, PATH Finder): tu cai 281s (uv, Python + 47 goi, ffmpeg, Whisper, Chrome, Codex) + Claude
  2.1.283 + agy 1.2.12; sau do Whisper nghe dung loi, OCR vi, VP9 alpha, hop cach ly FX, sidecar /health deu chay; render
  MP4 GIONG HET TUNG BYTE ban render tren may user. May user: chi can chep ffmpeg (1s).
- Mo app: `src/lib/useDoctor.ts` (App luon mounted) -> doctor:run (~1s) -> con muc `auto` chua dat -> doctor:autoFix
  (main process, thu tu uv -> Python + goi -> ffmpeg -> Whisper -> Chrome -> CLI; moi muc 1 lan / luot; bao tien trinh
  su kien doctor:progress + doctor:log) -> kiem lai. Doi tab khong ngat. San sang = khong con muc "fail" (warn = mat 1
  phan, vd Codex chua dang nhap -> khong anh AI). Dang nhap tai khoan / API key van o Cai dat API.
- Python-side: `sidecar/scripts/toolchain.py probe` (Python, tung goi, Vision, Whisper) / `whisper-install` (tai theo
  revision, GHI refs/main — tai theo ma commit thi huggingface_hub khong ghi, faster-whisper local_files_only lai doc no).
- Nut "Cai" o Cai dat API cho Codex / Claude dung chung bo cai nay (bo nhanh npm).
- Tu kiem: `STUDIO_DOCTOR=1 <app>` (in bao cao), `+ STUDIO_DOCTOR_FIX=1` (tu cai nhu luc mo app), `STUDIO_DOCTOR_FIX_ONLY=
  claude,agy`. May moi: `env -i HOME=<tam> PATH=/usr/bin:/bin:/usr/sbin:/sbin <app> --user-data-dir=<tam>/ud` (PATH nhu app
  mo tu Finder — PATH terminal co ~/.local/bin that se lam test "may moi" tim thay cong cu cua may that). LUON kem
  --user-data-dir tam: tren macOS thu muc userData cua Electron KHONG theo $HOME -> thieu no thi test mo thu muc that
  (secrets.enc) va co the hoi Keychain (da dinh 2026-09-28).
- Test: `tests/test_toolchain.py`, `node tests/test_toolchain.mts`.

## 11o. Video mau bang GEMINI (2026-09-28, user: bo Codex cho viec nay; Codex chi con tao anh AI + chu anh AI)

- `sidecar/reference_video.py` (thay reference_gpt.py): may do (ffmpeg) moc cat + do to; luot 1 Gemini xem + NGHE
  ban nen 720p (`gemini_media.prepare(allow_split=False)`, HDR -> SDR) kem so do (tin so do hon gio Gemini uoc); luot 2
  dai khung day (~6 khung/s, anh) -> style_kit (Gemini chi lay ~1 khung/s khi xem video). `providers.gemini_files`:
  gui file bat ky (video / anh) qua 3 cach ket noi (API goc: anh inline, video Files API; proxy: data URI; agy: file —
  da thu that agy mo + dem ca anh).
- Thu vien: kind moi `ref_video` (nguon `gemini-ref:`); ban GPT cu `ref_gpt` (cung schema) van dung lai khi chua co ban
  Gemini; `ref_gemini` (luong CapCut) khong bao gio dung cho Remotion. Khong dung lai id `_GEMINI_REFERENCE_PROMPT`
  (prompt_overrides.json con ban sua cu cua luong CapCut).
- Do that mau1.mp4 (215s, agy gemini-3.1-pro-high): 220s, nen 12.8 MB, du schema, audio nghe that (whoosh/pop/go
  phim), style_kit 5 recipe (co "chu khong lo sau lung"), font deu trong danh muc.
- Sua chu 2 prompt video mau -> van tay prompt_store doi 1 lan -> cache buoc AI (48h) chay lai 1 lan.
- Test: `tests/test_reference_video.py`, `tests/test_analysis_library.py` [5].

## 11p. TU LIEU CUA NGUOI DUNG — anh / video chen LEN video (sidecar/user_media.py, 2026-09-28)

User: upload anh / video cua minh (anh san pham, logo, anh chup man hinh, bang gia, clip demo) de HIEN THI LEN video
dang edit (khong noi vao mach A-roll); dat MUC DICH cho tung tu lieu; Gemini doc hieu; AI lap ke hoach chen dung luc
noi toi, vi tri + co hop; anh AI co the lay anh san pham that lam mau.
- UI (`src/components/UserMediaPanel.tsx`, trong RemotionStudio o buoc Hieu nguon + Video mau + Xem truoc): chon /
  keo-tha -> `media:import` kind `insert` chep vao `<workDir>/tu-lieu-chen/` -> Gemini doc NGAY (`remotion:understandMedia`
  -> `/remotion/understand_media`). Moi tu lieu: "Dung de" (show = chen / ai_ref = chi lam mau anh AI / both), "Cach hien
  thi" (auto / overlay khung noi / cutout sticker / split nua tren / fullscreen), o "Muc dich" (la gi, chen khi nao). Luu
  `Project.userMedia` (khong luu `analyzing`). Doi tu lieu sau khi co plan -> banner "Cap nhat ke hoach" (runPlan khong
  fresh: B1-B3 dung lai cache, R4 tro di chay lai vi khoa R4 doi). runPlan doi cac luot Gemini dang chay.
- Gemini (`_USER_MEDIA_PROMPT`, sua duoc trong menu, tieng Viet CO DAU vi hien thang cho user): mo ta KHACH QUAN (loai,
  chu_the, dac_diem_nhan_dien, chu_trong_anh, can_doc_chu, nen, tach_nen_duoc, tu_khoa, hop_khi_noi_ve, goi_y_hien_thi;
  video: canh / doan_dep). May do (khong phai AI): kich thuoc, ti le, `cao_khi_rong_1`, nen trong suot THAT (>= 3% diem
  trong suot), do dai / tieng video. Luu `~/.capcut-studio/cache/user-media/<van tay noi dung>_v1.json` (cung anh o du an
  khac -> dung lai); "Doc lai" = fresh. Loi: che `?key=` + token trong chuoi loi (truoc day URL Files API lo khoa API).
  Da goi that (agy gemini-3.1-pro-high): anh 1254px ~35-41s, dung schema.
- Ban lam viec anh (`working_image`): HEIC/HEIF/TIFF/BMP/AVIF -> PNG/JPG (sips + PIL), xoay theo EXIF, canh dai <= 2400;
  video HDR -> ban SDR (media_sdr). `refresh_assets` tao lai khi cache mat (build_spec).
- R4: payload `tu_lieu_nguoi_dung` (planner_view: muc dich + gemini + do_dac) + luat `_USER_MEDIA_NOTE` noi cuoi prompt
  (sua duoc trong menu) — CHI khi co tu lieu (khong co -> prompt / payload / khoa cache y nhu cu). Khoa R4 them `"um"`
  (key_view: id, muc dich, van tay file, hash phan tich + so do + hash luat). 2 prompt moi co `own_key` ->
  `prompt_store.fingerprint` bo qua (them / sua chung KHONG lam cache B1..B7 moi du an chay lai). Tu lieu = tai nguyen
  DANG KY SAN (`kind` user_image / user_video, R4 dung thang id); ai_image `ref_media` -> `asset_gen` gui anh qua Codex
  `-i` (SAU "-") + boi canh "ANH MAU DINH KEM" (khoa anh AI chi doi khi co anh mau). `audit` (trong audit_design) -> 1
  vong R4 tu sua; `finalize_design` (ham thuan, chay ca khi R4 lay tu cache): bo khai trung id, loc ref_media, dung loai
  lop anh <-> video, bo hien anh goc cua tu lieu chi 'lam mau', DU PHONG tu lieu 'chen' con thieu vao cau loi noi khop
  nhat (cum trong ghi chu user trong so 1.0 — cat tai tu dem, KHONG loc do dai chu vi tieng Viet ngan 'gia'; tu_khoa
  Gemini 1 tieng 0.6; 'cuoi video' / 'dau video' -> cau cuoi / dau; tai lieu DOC co chu can doc -> scene broll contain),
  khong khop -> canh bao (kem ly do R4), khong doan bua.
- Dung spec (motion_design + user_media): lop `image` / `video` (LAYER_TYPES them "video", chi tu lieu video) co `um`,
  h = w x ti le THAT, w toi thieu (co chu can doc 0.72 / logo 0.22 / video 0.45 / anh 0.30), cao <= 0.62 khung, trong
  vung an toan 0.06..0.82, `place_layers` ne mat (tren dau / duoi cam / canh ben / thu nho); PNG trong suot / cutout ->
  sticker (khong khung, khong box-shadow); video: `mediaStart`, cat theo phan con lai; mat do 8 nhip/10s KHONG bo tu
  lieu; phu de ne khung tu lieu (`_layer_band`). Panel scene tu lieu (`panel_media`): video -> RSMedia video; co chu can
  doc / lech ti le > 1.5x -> fit contain (Remotion lot ban mo cua anh); video panel ngan scene theo do dai. FX-plan thay
  `tu_lieu_dang_hien`; meme B6 trung luc tu lieu hien -> bo (`drop_conflicting_inserts`).
- Sticker tu anh nguoi dung: Vision tach nen (`prepare_cutouts`); ban tach < 15% dien tich anh goc (`_cutout_ok`) = chi
  lay 1 manh (do that: chai trang nen xam -> chi con nap xanh) -> bo, dung khung anh nguyen ven.
- Do that R4 (Claude opus-5-5 effort high, du an Scion 35s, 3 tu lieu): 316s, dat du 3 tu lieu dung cau noi ngay luot dau
  (sticker luc nhac ten san pham, nhan chai split contain luc noi chu tieng Nhat, clip cua hang Nhat luc noi 'cua hang
  ben Nhat' tu doan_dep), 1 ai_image ref_media ta dung chai mau; audit / du phong khong can chay. Render that: khong de
  mat, chu doc duoc.
- Remotion: `Layers.tsx` lop video trong <Sequence premountFor> rieng (khung OffthreadVideo tinh tu luc lop bat dau);
  `Scenes.tsx` PanelMedia contain = ban mo phia sau (anh) / nen toi (video). Render that PASS (sticker, video noi, menu
  contain, logo trong suot).
- Bao cao: `plan._pipeline.tu_lieu` (usage_report: gio timeline + cach hien + ly do R4 + du phong + so anh AI dung mau),
  `plan.user_media`, `summary.tu_lieu`; UI hien trong panel + "Ket qua: Ke hoach".
- Test: `tests/test_user_media.py` (chuan hoa, ban lam viec, Gemini + cache + route, luong thong tin toi R4 / FX / B6,
  du phong, lop bao ve, anh mau Codex, khoa cache).

## 11q. Viec Codex chay nen trong /remotion/autoplan (2026-09-30)

Chi doi LICH chay, khong doi dau vao / prompt / khoa cache / thu tu cac buoc Claude. Phu thuoc that:
B1 -> B2 -> B3 -> R4 -> R5 -> FX-plan -> FX-code -> B6 -> B7; anh AI chi can R4; chu anh AI can R4 + R5; chi GHEP PLAN
moi can file anh + chu anh.

- `server.remotion_autoplan_route`: sau R4 tao `ThreadPoolExecutor` `_nen` (2 luong "autoplan-nen"), CHI cho viec CODEX:
  - anh AI (`motion_design.resolve_assets`, ~1-4 phut) chay NEN; truoc day R5 / FX / B6 / B7 phai dung cho no.
    Cho ket qua ngay truoc khi ghep plan; canh bao anh loi chen DUNG CHO CU (`_cho_canh_bao_anh`).
  - TXT-art (chu anh AI) van chay nen tu sau R5, nhung gio cho o buoc ghep plan (truoc: cho truoc B6).
  - `finally: _nen.shutdown(wait=False)` — loi giua chung thi tra loi ngay, khong cho viec nen.
- KHONG GOI CLAUDE CLI DONG THOI (moi buoc Claude chay lan luot o luong chinh, nhu cu). Da thu roi bo 09-30: FX-code
  3 lo cung luc + B6 song song FX. Do that video 111s: 3 luot `claude -p` khoi dong cung giay -> 1 luot xong 80s, 2 luot
  bi CHAN DUNG ~900s roi cung luc moi chay (CLI tu bao duration_ms 185s / 242s, dong ho that 1086s / 1143s); API luc do
  van tra loi luot nho trong 5s. 104 luot tuan tu truoc do: 0 lan. Chua ro nguyen nhan (khoa / hang doi dung chung
  giua cac tien trinh claude?) — muon song song lai phai tim ra truoc; neu chan > gioi han 1200s buoc FX bi bo.
  Codex (tao anh) chay song song voi Claude thi on (chu anh AI da lam vay tu 09-27).
- NHAT KY THEO LUONG: `run_log` luu run hien hanh theo thread -> viec o luong phu phai boc `run_log.carry(fn)`,
  khong thi su kien / luot goi AI trong luong do bi mat (truoc 09-30 luong TXT-art bi mat nhat ky vi ly do nay).
- Kiem hoi quy: harness AI gia (10 kich ban: day du, dung cache, khong video mau, B6 / FX-code / R5 / B7 / R4 loi,
  moi anh loi, FX-fix) code cu vs moi: luot goi AI (hash system + payload), khoa cache, plan, spec, guard, canh bao (ca
  thu tu), buoc dung lai GIONG HET. Bay: so khoa R4/R5 giua 2 ban chep phai `os.utime(ns=...)` file `sidecar/assets/*`
  (fingerprint = mtime danh muc).
- DO THAT A/B 09-30 (Claude opus-5-5 high, cung du an, cache co lap, chi khau lap plan): video 28s cu 698s / moi 708s;
  video 111s cu 1097s / moi 1077s. Khong ro tren dong ho vi AI dao dong lon (R4 +55..+107s, FX-plan +40s o lan moi).
  Mo phong cheo (cung thoi gian tung buoc, chi doi lich): nhanh 11-17% (~120-160s) = dung thoi gian cho anh AI; chu anh
  AI chua lan nao la nut that. Chat luong 2 ban nhu nhau (anh du, chu anh du, luat hook dat, 0 canh bao).
- Test: `tests/test_info_flow.py` [12] (anh / chu anh chay nen, R5 khong cho anh, B6 / B7 khong cho chu anh, KHONG co 2
  luot Claude chong thoi gian, nhat ky luong nen, canh bao anh loi).
- Ban nguon truoc khi sua: `~/.capcut-studio/source-backup-20260930-before-parallel/`.

## 11r. Zoom muot, LUAT CUNG khoang lang, SFX theo giong noi, chu anh AI cat ngang (2026-10-01)

User: (1) zoom in/out "cat roi thay khung zoom" -> giat; (2) cat khoang lang / noi lap chua chat, cat phai giu tron
tieng; (3) chu anh AI: duoi 'g' hang tren con du manh tren hang duoi; (4) SFX khi chu hien qua to so voi video tieng nho.
- ZOOM MUOT: `remotion_plan._smooth_zoom` gan `zoomFrom`/`zoomDur` cho clip doi muc `scale` so clip truoc (khong tinh
  meme); renderer `AutoEdit.clipZoomAt` = `remotion_plan.clip_zoom_at` (easeInOutCubic). Moi khung doi <= `ZOOM_MAX_STEP`
  0.03; clip qua ngan -> zoom it hon. `look.ts` cameraAt: zoom_out_reveal / pan / fisheye / shake / ken_burns / zoom_punch
  khong con bat-tat scale tuc thi. Hieu ung tu viet: `fx_flow.smooth_scale` (gioi han toc do, ve 1.0 o 2 dau) + luat
  trong `_FX_CODE_SYSTEM`. `tighten_pauses` KHONG con xen ke +0.08 scale o cho cat lang. Prompt B2 mac dinh sua cau
  "scale xen ke" (user co override `_TIMELINE_SYSTEM` -> dam bao bang code, khong bang prompt).
- KHOANG LANG (`speech_cut`): gioi han nghe thay `pause_limit` nhanh 0.22 / thuong 0.28 / nhe 0.40s (truoc 0.30/0.45/0.75),
  luu `plan.pause_limit` (plan cu: theo `_pipeline.tone`). Mep cat theo NGUONG MEM (`Audio.soft`, cuc bo `soft_in` =
  trung vi khoang lang + 6 dB) + giu 60ms sau tieng / 50ms truoc tieng -> khong cup duoi am. Cat ca: giua doan, cho noi,
  dau + CUOI video (giu 0.2s), ban sao hook (`split_quiet` -> nhieu manh kind hook, chuyen canh chi o manh cuoi), doan
  Whisper bo sot chu (chi can NGUON co loi + doan co tieng; canh im hoan toan giu nguyen). Manh sat mep ngan: noi lien
  -> gop vao doan ben canh; khong chu (hoi tho) -> bo. `cut_restarts`: vap noi lai ngay cum 2-8 chu (co ngap >= 0.15s)
  -> bo lan dau, 2 diem cat deu trong lang. `follow_removed`: moc meme/SFX trong phan da cat -> mep cat.
  `cut_after`: khoang lang ngan ma tieng vang lai TRUOC chu sau = con trong chu ('tính'); valley uu tien sau moc het chu.
  `safe_end` khong co cho ngat cau -> ve ranh gioi chu (khong giua chu). Meme cat vao: `quiet_point` chot diem cat vao
  lang that; `plan_guard._cut_at` cho manh dau ngan neu noi lien doan truoc.
- KIEM LAI (`audit_cuts`): sau B2 (autoplan: siet -> restart -> cat an toan -> siet lai -> kiem; ghi run_log "Kiem tra cat")
  va trong `build_spec` (body: fix; timeline cuoi gom hook + meme: chi bao). Phan loai mep cat co tieng: `giua_chu` (bao),
  `noi_lien` (2 chu noi lien khong lang: chap nhan), `duoi_am` (keo toi khi tieng tat, vuot hard_hi/hard_lo toi 0.25s,
  khong chen chu moi). Ket qua: `report.kiem_cat`, issue "Kiem tra cat: ..." (severity low).
- SFX THEO GIONG: `speech_cut.loudness_series` (ebur128 momentary moi 0.1s tren tieng doi STEREO + apad 0.5s cho SFX ngan,
  cache `-m2.npy`), `voice_level` (p90 khung co tieng cua doan dung), `playback_lufs`. `plan_guard.mix_sfx`: muc = min(muc
  tuyet doi SFX_MIX, giong + `SFX_REL[loai]`); SFX khi chu/hinh hien (`_from_layer`) <= giong + `SFX_ACCENT_REL` (-3 dB);
  bo san volume 0.2; kiem lai tran; `_rel_db` -> spec audio `rel`. Luat hook nghe ro = `rel >= SND_MIN_REL` (-8 dB).
  Meme cat vao: `_meme_volume` <= giong. Do that (render): video nho (giong -35) SFX cu +8..+20.6 dB -> moi +0.6..+3.8.
- CHU ANH AI: prompt them dai trong >= 1/8 anh giua 2 hang tinh ca duoi g/y/p, dau nang, dau thanh + `_ROW_GAP_RULE` LUON
  noi vao prompt (ke ca ban user sua); `MAX_ROWS` 4; `slice_sheet` -> `row_masks`: gan TRON tung net (thanh phan lien
  thong, `_components` khong can scipy) ve hang chua nhieu pixel nhat, pixel hang khac trong suot; net dinh 2 hang (>=20%
  moi ben) chia theo duong cat. Do that tam 'tầng voucher / HỜI': khung cu hang HỜI chua 3077 pixel cua 'g' -> 0.
  `ART_VERSION` 2.
- `SPEC_MEDIA_VERSION` 8 -> du an cu mo lai tu dung lai spec (zoom muot + luat lang + SFX theo giong; khong goi AI). Chu anh
  AI moi chi co khi lap ke hoach lai. Do 11 du an that (cu -> moi): lang con sot 42 -> 2, zoom nhay o diem cat 528 -> 0,
  mep cat co tieng 42 -> 21 (con lai o ranh gioi phan B1/B2 da bo: tieng dem / cau lap, duoc bao ro).
- Test: `tests/test_smooth_zoom_audio.py` (moi), `test_cut_hook_rules.py` [7][8], `test_speech_cut.py` [8].

## 11s. Menu "Tao video" + BRAND GUIDELINE + AI lap ke hoach co dinh Claude (2026-10-01)

- Menu / tieu de "Video Remotion" -> "Tao video"; bo chu "Remotion" tren giao dien Tao video / Video da tao / nhat ky
  (id noi bo `remotion`, thu muc du an `remotion-*`, muc Doctor "Bo dung Remotion" giu nguyen).
- AI lap ke hoach LUON Claude: `config.plan_provider()` = "claude" (bo qua state.json `plan_provider` cu); duong GPT chi
  mo cho TEST bang `STUDIO_PLANNER_TEST=gpt`. Electron `planProviderOf` = 'claude'; Cai dat API bo khung "AI lap ke hoach".
- BRAND GUIDELINE (khong bat buoc) — `src/components/BrandGuideForm.tsx` (5 truong: typography, colors, graphics,
  imagery, motion), luu `Project.brandGuide`, gui autoplan `brand_guide`. `sidecar/brand_guide.py`:
  - `STEP_FIELDS`: plan (R4 / R4-visual) = ca 5; captions (R5) = typography + colors; text_art = typography + colors +
    graphics + imagery; image (anh AI, qua `asset_contexts` -> `thuong_hieu` -> `_context_text`) = colors + graphics +
    imagery; fx (FX-plan, FX-code / FX-fix, Hook-FX-plan) = motion + colors + graphics. `rule_text` NOI vao system
    prompt bang code (ke ca prompt user da sua); B1/B2/B3/B6/B7 KHONG nhan.
  - Khoa cache: moi buoc chi them "brand" khi CO Brand Guideline -> du an khong co giu nguyen cache + prompt.
  - EP BANG CODE: `fonts()` = font DANH MUC duoc nhac ten (dau = tieu de, cuoi = noi dung / phu de); `hexes()` = ma
    #hex / rgb(). `apply_kit` (autoplan sau R4 + build_spec): palette ve he thuong hieu, fonts theo vai, subtitle.font,
    broll_style = Phong cach hinh anh. `enforce_plan` (dau build_spec, TRUOC dung lop chu): font + mau layers / scenes /
    caption_theme / captions / style_kit. `enforce_spec` (sau tao spec): mau code tu sinh. FX overlay: ban sao khung
    `-b<hash>.json` da `snap_svg`. Mau trung tinh (trang / den / xam: vien, bong) giu nguyen; sac do cach <= 60 (redmean)
    giu (tong dam / nhat cua mau thuong hieu). Chi mo ta (khong ma / khong ten font) -> chi qua prompt.
  - Uu tien hon phong cach boc tu video mau o 5 mat nay (yeu cau ro rang cua du an, khong phai phong cach mac dinh).
- Test: `tests/test_brand_guide.py` (don vi + ca luong autoplan AI gia: dung truong tung buoc, ban dung dung font / mau,
  khong Brand Guideline -> prompt / payload y nhu cu); `test_claude_planner.py` [1].

## 11t. Moi chu co tieng, huy hieu bang anh AI, nang giong nho, luat sang tao (2026-10-01)

- LUAT CHU CO TIENG: KHONG con tran so SFX (bo `SFX_CAP_MOTION` 16 — do that: 29 lop chu + 6 SFX B7, tran cat het tu giay
  ~56/135, 17 chu cuoi im). build_spec: SFX khong gan chu van theo gian cach `SFX_MIN_GAP`; tieng CHU (`MD.is_text_sfx`:
  `_text` lop chu R4 / `_auto_text` / B7 `purpose: reveal`) khong bao gio bi bo vi gian cach, chi "dung chung" khi trung
  luc < `TEXT_SFX_SAME` 0.12s. Sau do `MD.ensure_text_sfx`: moi lop text / counter / badge + caption hero / micro (gom chu
  hook) chua co tieng trong [t-0.15, t+0.15] -> gan tieng bo kit hop chu (`text_sfx_family`: counter ding, badge pop,
  typewriter typing, truot swoosh, dap whoosh, chu nho click, con lai pop). `clear_over_inserts` chay TRUOC buoc nay.
  `engine.resolve_plan_sfx`: tran MAX_SFX chi tinh SFX khong phai `reveal`. `mix_sfx`: lap cung tieng chi giam trong
  `SFX_REPEAT_WINDOW` 10s, toi da `SFX_REPEAT_MAX_STEPS` 2 bac (truoc: 0.85^n ca video -> chu ve sau ~-20 dB). Spec audio
  `textAuto: true` = tieng code tu gan -> luat hook KHONG tinh la tieng gay chu y (hook van can SFX AI chon).
  Prompt B7 (mac dinh + ban user sua trong prompt_overrides.json, ban sao `.bak-20261001`) bo "2-5 SFX"; R4 muc 7: MOI lop
  chu phai co `sfx` hop chu.
- HUY HIEU BANG ANH AI (`sidecar/graphic_art.py`, buoc nen "GFX-art" song song TXT-art, pool nen 3 luong): lop `badge`
  -> AI tao ANH CA PHAN TU (hinh + chat lieu + icon theo y nghia + chu), KHAC text_art (chi chu). Moi `group` <= 3 phan
  tu = 1 anh 1024x1536, moi phan tu 1 hang; nhom dau lam mau `-i` cho nhom sau; cat bang `text_art.segment_rows/row_masks`;
  kiem OCR (`contains`, >= 0.72) + hinh (ti le 0.4-2.5); sai -> tao lai 1 lan (prompt khac `attempt=2`). Prompt
  `_GRAPHIC_ART_PROMPT` (own_key, khoa rieng `prompt_fp`). `plan["graphic_art"]`; `MD._attach_graphic` dat `L.art` (than
  phan tu = w thiet ke); Layers.tsx badge co `art` -> ve anh. Do that: 5/5 phan tu dat OCR, ~150s / 2 nhom.
- HUY HIEU VE CODE (du phong): `MD.badge_colors` lay mau tu palette video (bg_gradient / primary / accent), chu tuong phan
  >= 4.5; Layers.tsx bo mau cam co dinh (#F28B3C / #E2601F / #FFD2A8...), chi nhan -> chu to vua long huy hieu.
- GIONG NOI NHO (`sidecar/voice_boost.py`): autoplan sau B2 `assess` = do LUFS M p90 khung co loi tren file GOC (cung
  thuoc voice_level) + Gemini `source.giong_noi` (GEMINI_NOTE noi bang code vao prompt Hieu nguon; `merge_parts` gop).
  Muc tieu -15; thieu >= 6 dB -> nang; 3-6 dB chi khi Gemini nghe nho / khong ro; tran 20 dB va dinh p99 khong bi ep qua
  6 dB. `plan["voice_boost"]`; build_spec `apply` sau media_sdr: ban lam viec `cache/voice-boost` (hinh copy, tieng
  volume + alimiter -1 dBFS level=false latency=true; lech 0 ms do bang tuong quan), ghi `orig_path` -> speech_cut / cat
  van tren file goc; `voice_level` cong `voice_gain_db` -> SFX / meme can theo giong sau nang. Do that du an 'hoc sinh':
  -34.4 -> +19.4 dB -> -15.0 (I -18.3 LUFS, TP -0.8).
- LUAT SANG TAO + CAM XUC (`sidecar/creative.py`, prompt `_CREATIVE_RULE` sua duoc): noi bang code vao B3 / R4 (ca R4
  du phong) / R5 / FX-plan / B6 / B7 (ke ca prompt user da sua); B1 / B2 khong nhan (luat giu thu tu noi dung).
- Test: `tests/test_badge_voice.py`; `test_remotion_plan.py` [5][6b], `test_plan_guard.py` [7], `test_info_flow.py` cap nhat.
- Huy hieu AI tren Windows: OCR 1 dong (PP-OCR) doc ca huy hieu tron ra rac -> `graphic_art.read_text` quet DAI NGANG
  (20-38% cao) khi khong co Vision; do that 5/5 huy hieu that doc dung (~0.4s / phan tu), chu sai van bi loai.

## 11u. BAN CAI CHO MAY KHAC: an quy trinh / nhat ky / prompt (2026-10-02)

- Co BUILD `__CLIENT_UI__` (electron.vite.config.ts, ca main + renderer): `command === 'build'` va KHONG co
  `STUDIO_FULL_UI=1` -> an. Nghia la `npm run build` / `dist` / `dist:win` (build-windows.ps1) mac dinh la BAN CAI;
  `npm run dev` va `STUDIO_FULL_UI=1 npm run dist` = giao dien day du (ban cua chu app tren may cua minh — app trong
  /Applications may chu app CAI BANG BAN DAY DU, khong cai ban an len may nay).
- `src/lib/clientUi.ts`: `isFullUi()` / `useFullUi()`; cua bi mat Ctrl/Cmd+Shift+Alt+D bat / tat (localStorage
  `studio.fullUi`, chi may do). An: menu Prompt & quy tac; RunLogPanel + nut Nhat ky (Tao video, Video da tao); thanh
  cac buoc; khung Ket qua (hieu nguon / video mau / ke hoach / kiem tra ky thuat) + "Dung lai N buoc"; Doctor "Nhat ky
  cai dat"; ten AI / ten buoc trong loi nhan (chay: "Dang phan tich" -> "Dang tao video"; loi: "Co loi khi ..."; canh
  bao: chi muc "Tu lieu..." + 1 dong chung); Cai dat API vai tro chung chung; thu vien "Mau" (khong "Gemini").
  main.ts: menu Xem khong co DevTools + `webPreferences.devTools = false`.
  2026-10-06 (user yeu cau): an CA menu Tai nguyen (SFX / meme / Text / nhac nen / hieu ung) — kho tu dong bo khi mo app;
  Doctor co the "Tai nguyen" -> muc "Dong bo tai nguyen" (Dang dong bo… / Dong bo xong + so muc tung kho + gio / Dong bo
  loi + nut "Dong bo lai"), ca 2 ban deu hien.
- Chuc nang KHONG doi (sidecar van ghi nhat ky ~/.capcut-studio/runs tren may khach, chi khong hien).

## 11v. Hieu nguon + video mau CUNG LUC; NHIEU VIDEO chay cung luc (2026-10-02)

- GOP BUOC: o man "Hieu nguon" co the "Video mau (khong bat buoc)". `RemotionStudio.runAnalyze`: xin 1 luot "gemini"
  roi goi `/understand_sources` VA `/remotion/understand_reference` SONG SONG (Promise.allSettled; khong co video mau
  thi chi nguon) -> xong goi thang `runPlan` (khong con man / buoc "Video mau"; stepper 5 buoc). Route, thu vien, cache
  KHONG doi. Da co brief / phan tich mau trong du an (khong fresh) thi khong goi lai. Nguon loi -> loi
  `understand-sources` (phan mau xong van giu); nguon xong + mau loi -> loi `understand-reference` (nut "Bo qua video
  mau" / "Tiep tuc" = `runReference` chi chay lai phan mau). "Phan tich lai tu dau" = fresh ca hai.
- NHIEU VIDEO: `src/pages/CreateVideo.tsx` = thanh THE + moi the 1 `RemotionStudioPage` (1 du an) LUON mounted (an khi
  khong xem) -> moi the giu nguyen co che cu. "Them video" / "Tao them video khac" (tren khung dang chay) = the moi.
  Dong the KHONG xoa du an; the dang chay / dang cho khong dong duoc. "Mo trong Tao video": the dang mo du an do ->
  chuyen sang; the dang xem trong -> mo vao do; khong thi the moi. The dang mo luu `projects.json` `openRemotion`
  (+ `currentRemotion` = the dang xem; `saveProject` khong con gianh con tro khi da co `openRemotion`).
- HANG DOI `src/lib/jobQueue.ts` (renderer, dung chung moi the; FIFO; huy cho -> `QueueCancelled`, buoc thoat im):
  `gemini` (hieu nguon + mau; tu lieu nguoi dung KHONG qua hang doi), `claude` (ca /remotion/autoplan), `render`
  (LUON 1 — Electron chi chay 1 render). Gioi han o Cai dat API "Tao nhieu video cung luc" — nguoi dung NHAP SO
  1..20 (state.json `video_jobs_gemini` mac dinh 2, `video_jobs_claude` mac dinh 1). DO THAT 2026-10-02 (Claude CLI
  2.1.283, opus-5-5 high, prompt that cac buoc plan): 3 / 5 / 10 luot `claude -p` CUNG LUC deu xong, cho <= 2.1s (chi la
  khoi dong CLI), tung luot khong cham hon -> loi chan ~900s cua 09-30 (muc 11q) KHONG con; gioi han that = han muc goi
  Claude (moi video ~9-12 luot). Dang cho: khung chay hien "Dang cho luot ... video X dang ..., con N video cho truoc" + "Huy cho";
  the hien chip trang thai; nhat ky ghi luc cho / toi luot.
- An toan nhieu the: tien do render chi the giu luot render nhan (`renderingRef`); "Huy render" / "Lam moi" chi huy
  render CUA THE DO; `genRef` — buoc cu xong sau khi "Lam moi" / mo du an khac thi bo ket qua. "Video da tao" khong
  cho xoa MOI du an dang chay (`busyIds`). Sidecar da `threaded=True`, nhat ky theo luong; Whisper dung chung model
  (CTranslate2 tu xep hang).
- Test: `node tests/test_job_queue.mts` (FIFO, gioi han, kep, huy cho, doi gioi han); `tests/test_project_delete.mts`
  [6] (the dang mo). E2E (tam, scratchpad): app dev + HOME tam + `sitecustomize.py` thay 3 route AI bang ban gia co do
  tre + ghi gio -> 3 video: toi da 2 phan tich cung luc, plan 1 luc, nguon + mau cua 1 video chong thoi gian, render
  that lan luot (khong chong), huy cho, video mau loi -> "Bo qua video mau", mo lai app con du the.

## 11w. Mat nguoi noi khong bi che + anh tach nen SACH (2026-10-03)

- LOI THAT: (1) hook '1 NUT LA XONG' de ngang mat — caption hero / chu anh AI cua hook sinh o `hero_captions_to_art`
  SAU `_avoid_faces` (buoc nay chi xet lop chu R4, bo lop co keyframes), anh / huy hieu khong buoc nao xet mat;
  (2) anh cot song: mang toi HINH CHU NHAT de len mat = `boxShadow` cua khung anh (Layers.tsx) ve bong cho ca khung
  chu nhat cua sticker trong suot; them Vision giu BONG DO tren san (ban trong suot), BO SOT mang vat toi mau (de nut
  bam do tham -> phan con lai trong nhu vet bong) va de lop alpha rat thap tren ca khung.
- `MD.protect_face(spec)` (motion_design.py) chay tren SPEC CUOI trong `build_spec` 2 lan: sau `hero_captions_to_art`
  + `fx_to_spec` (truoc tach nguoi / do tuong phan) va sau `dodge_subtitles` (phu de da doi cho). Xet lop chu / chu
  anh / bo dem / huy hieu / anh / tu lieu / box-circle CUA TO HOP chu + caption hero + phu de (phu de chi o hook).
  Khung that: `_guard_box` (co chu, kich thuoc anh doc header, keyframe phong to, diem neo); mat: `_face_rect` = 
  `fx_flow._face_px` (bo cuc + jump-cut zoom) x camera `_cam_at` (DINH zoom_punch / shake / pan... nhu look.ts
  cameraAt + fxTransforms), mau moi 0.2s suot luc lop hien. HOOK (clip kind hook): che <= FACE_HOOK_MAX 2%; than
  video <= FACE_BODY_MAX 15%. Thu: tren dau -> tren tran -> duoi cam -> canh ben, x 1 / 0.88 / ... / 0.42 (gan nhat
  thang); to hop doi ca khoi. Hook khong con cho -> BO lop (nhat ky ghi). Khong xet: lop `behind` + to hop cua no,
  `ring` (khoanh mat co y), box / circle rieng le, lop phu > 55% khung, opacity < 0.3. Chay lai khong doi (on dinh).
- `sidecar/cutout_refine.py` (chi numpy + PIL) — `media_vision.lift_subject` (Vision `generateScaledMask...` -> mat na
  mem) va `vision_onnx.cutout` (BiRefNet) deu qua `refine`: anh co NEN TRON MOT MAU (>= 90% vien cung sac do, sang)
  -> diem "giong nen" = cung sac do, do sang 22%..112% nen; NEN = vung giong nen + min (grad <= 6) noi lien vien
  anh; BONG = nen toi hon 97% -> alpha 0 KE CA khi mat na AI tinh la vat. Phan vat AI bo sot = khac mau nen (xam
  trung tinh KIN trong vat van tinh) + noi lien chu the -> lay lai. Mem vien CHI vao trong, diem vien dung mau nen ->
  trong suot, khu mau nen o vien; alpha < 0.08 -> 0. Anh DA trong suot (Codex) -> dung alpha cua anh, khong qua
  Vision. Nen phuc tap (khung video, anh chup) -> mat na AI + xoa lop mo. PNG ghi `studio_cut` = VERSION;
  `fresh()` sai phien ban -> tach lai (asset_gen / user_media / `MD._asset_path` cua plan cu deu goi lift_subject).
- Renderer: lop anh `cutout: true` (MD `is_cutout`, user_media sticker; spec cu: ten `*_cut.png`) -> `drop-shadow`
  theo VIEN vat (blur <= 12px), khong khung / overflow / box-shadow.
- SPEC_MEDIA_VERSION 9 (sidecar + RemotionStudio.tsx, truoc UI de 7): mo du an cu -> dung lai spec tu plan (khong goi AI).
- Hieu ung tu viet (fx) VAN co the loe 1-2 khung qua mat (vd chuyen den trang -> mau tu mat) — prompt FX da cam ve de
  len mat tru khi co y; khong kiem bang code.
- Test: `tests/test_face_cutout.py` (anh gia lap: mat na AI om bong / bo sot vat / lop mo; Codex trong suot; phien
  ban; hook + zoom_punch; caption hero + phu de; ring / behind giu nguyen; on dinh). Kiem bang mat: render cua so
  ngan cua 2 du an that (hook '1 NUT LA XONG' -> duoi cam; cot song -> ben trai, het mang chu nhat).

## 11x. Phien ban + MA BUILD trong app va ten file (2026-10-03)

- `npm run dist` / `dist:dir` / `dist:win` / `dist:win:dir` = `node scripts/dist.mjs --mac|--win [--dir]`: dat
  `STUDIO_BUILD_ID` = ngay-gio luc build (vd `20261003-2250`; `STUDIO_FULL_UI=1` them `-full`) roi chay lan luot cac
  buoc cu (electron-vite build -> bundle remotion / ffmpeg / (models) / python -> compile-sidecar -> protect ->
  electron-builder). `electron.vite.config.ts` define `__APP_BUILD__` (main) -> `app:info.build` -> thanh tieu de
  "Agent Edit · v1.1.0 · build ..." + About panel + boot log. electron-builder.yml artifactName dung
  `${env.STUDIO_BUILD_ID}` -> `Agent Edit-1.1.0-b<ma>-arm64.dmg`, `Agent Edit-Setup-1.1.0-b<ma>-x64.exe` (chay
  electron-builder TRUC TIEP khong qua dist.mjs se loi vi thieu bien). So phien ban = package.json `version`
  (1.1.0 tu 2026-10-03), tang tay. `npm run build` / dev: khong co ma build -> chi hien "v1.1.0".

## 11y. LOAI VIDEO: doc 9:16 (mac dinh) / ngang 16:9 (2026-10-04, `sidecar/canvas.py`)

- UI: the "Loai video" (`src/components/OrientationPicker.tsx`) o man tao video; du an luu `orientation`
  (vang mat = doc). `runPlan` gui `orientation` -> `/remotion/autoplan`. Xem truoc / video xong / "Video da tao"
  lay khung tu spec (khung ngang: khung xem rong, xep doc).
- Sidecar: route dat `canvas.use(W, H)` cho CA luot lap ke hoach (luong nen qua `run_log.carry` mang theo);
  `build_spec` dat khung tu `plan.canvas`. Moi phep do trong motion_design / user_media / fx_flow doc khung qua
  `canvas.size()` / `fw()` / `fh()` (khong con so 1080 / 1920 co dinh). Don vi px thiet ke = px tren CANH NGAN 1080
  (Remotion `pxScale = min(W,H)/1080` — truoc la W/1080, khung ngang se phong chu 1.78 lan). Phu de rong 86% (doc)
  / 70% (ngang) — `canvas.caption_frac` KHOP `look.ts captionFrac`.
- AI biet khung ngang: `story.khung_hinh` (B2..B7, chu anh, do hoa anh — luong phu doc qua `canvas.note_for`),
  ghi chu `canvas.note(step)` noi cuoi prompt R4 / R4-visual / R5 / FX-plan / FX-code, boi canh anh AI
  `khung_video` + vai tro anh ben canh (asset_gen `_VAI_TRO_NGANG`), anh khong khai ti le -> 16:9. Khoa cache doi
  theo (story / `canvas.keyed` cho FX-code). KHUNG DOC: khong them gi -> prompt, khoa cache, spec GIONG HET truoc
  (da so spec tung byte ma cu vs moi).
- Bo cuc khung ngang (`motion_design._landscape_scene`): split trai/phai (`panel_side`, `panel_ratio` = phan be
  ngang), card = the A-roll ben phai (`card_x`), circle (`circle_x/y/d`, d <= 0.5) nam tron trong khung; KHONG
  pop-out. Phu de split/card giu dai duoi.
- Nguon khac chieu khung (vd video doc dien thoai -> khung ngang): clip fit 'blur' = contain giua nen mo;
  `motion_design.fit_scale` / `clip_map` / `face_in_canvas` tinh mat theo contain (CHI khung ngang — khung doc giu
  cach cu: nguon ngang tren khung doc van tinh mat theo cover, chua sua). Ban tach nguoi ve contain khi fit blur.
- Test: `tests/test_landscape.py`, `tests/test_info_flow.py` [13] (route that, AI gia, ngang + doc). Render that
  1920x1080 qua `STUDIO_REMOTION_RENDER` da kiem (nguon ngang + nguon doc).

## 10b. Thu vien phan tich video (sidecar/analysis_library.py, them 2026-09-26)

Luu ket qua "Hieu nguon" (Gemini + gio loi noi Whisper) va "Video mau" (GPT/Codex) de lan sau
dung lai, khong goi lai AI. Phan `ref_gemini` (video mau bang Gemini cua luong CapCut cu) chi con
doc/xoa, khong tao moi.

- Luu tai `~/.capcut-studio/library/items/<fp>.json` (+ `thumbs/<fp>.jpg`). `fp` = van tay NOI DUNG
  file (kich thuoc + 3 doan 1MB dau/giua/cuoi) -> doi ten / chuyen thu muc van nhan ra.
- Tu luu sau moi lan `/understand_sources`, `/remotion/understand_reference` thanh cong. Lan sau cung video -> tra ban da luu (`reused` / `analysis._library`). `fresh: true` =
  phan tich lai. Nhieu video tron: chi gui Gemini video chua luu, ghep brief bang `compose_brief`.
- Route: `/library/list` (lan dau nhap phan tich tu projects.json cu), `/library/lookup`,
  `/library/delete`. UI: `src/components/LibraryPicker.tsx` (hop chon + `useLibraryLookup` + nhan
  "Da phan tich") dung o RemotionStudio.tsx.
- Luu y: sua prompt Gemini/GPT KHONG tu lam cu ban da luu — nguoi dung bam "Phan tich lai".
- Test: `HOME=$(mktemp -d) <venv> tests/test_analysis_library.py`.

## 11. Luong Video Remotion (menu "Video Remotion", them 2026-09-25)

Luong duy nhat cua app (tu 2026-09-26): dung video HOAN TOAN bang code (Remotion 4.0.528), xem
truoc va xem MP4 hoan chinh ngay trong app.

```text
Hieu nguon: /understand_sources (nen 720p + cat theo dung luong -> Gemini API / agy -> ghep, + can gio Whisper)
Video mau:  /remotion/understand_reference -> reference_video.py (2 luot, Gemini — muc 11o)
            luot 1: ffmpeg do moc cat + do to; Gemini XEM + NGHE ban nen 720p -> phan tich (schema chung)
            luot 2: DAI KHUNG DAY 6 khung/s (hook, 4 cho cat, outro) dang anh -> style_kit + recipes
            (_RM_STYLE_KIT_PROMPT)
Plan:       /remotion/autoplan: B1/B2/B3/B6/B7 (prompt chung trong providers.py),
            mat nguoi (media_vision.face_box) + style_kit (motion_design.style_kit_for),
            R4-design (_RM_DESIGN_SYSTEM, motion_design.py): scenes + layers + assets +
              effects + transitions + grade; hong -> R4-visual cu (_RM_VISUAL_SYSTEM)
            assets: anh AI qua Codex image_generation (asset_gen.py, song song, cache)
              + khung nguon + tach nen (Vision)
            R5 (_RM_CAPTION_SYSTEM + ghi chu che do do hoa): phu de theo style_kit.subtitle
Spec:       remotion_plan.build_spec(plan) -> RenderSpec (gio timeline, da quy doi)
            dung lai plan_guard: hook cold-open, meme CAT vao, can SFX, clear_over_inserts
Xem truoc:  @remotion/player trong renderer (remotion-src/AutoEdit.tsx)
Render:     electron/services/remotion.ts -> utilityProcess electron/remotion-worker.ts
            -> @remotion/renderer renderMedia (bundle dung san o out/remotion-bundle)
Media:      electron/services/media-server.ts (http 127.0.0.1 + token, ho tro Range)
            cho ca Player lan Chrome headless luc render
```

- THIET KE CHUYEN DONG (them 2026-09-26, `sidecar/motion_design.py`):
  - Ngon ngu dung GPT duoc dung: `sidecar/references/remotion-dsl.md` (dang ky trong menu Prompt
    & quy tac, sua duoc) + 55 thuat ngu edit `references/edit-glossary.md`. KHONG co bo phong cach mac
    dinh (da xoa remotion_style_default.json 2026-09-27) — xem muc 11j.
  - scenes (bo cuc A-roll): full / split / card / circle / broll / graphic, `morph` giua bo cuc.
    Khoang trong giua scene = full. POP-OUT (dau troi khoi the) chi khi scene / bo video mau khai.
  - layers: chu nhieu tang (spans: font, co, mau, gradient, glow, vien, nghieng), box, vong tu
    ve, mui ten, anh, emoji, huy hieu, so chay, vet toc do; enter/exit/loop + keyframe;
    `group` (to hop di chung), `behind_subject` (chu SAU nguoi), `replaces_subtitle`.
  - Lop bao ve bang code (layers_to_spec / attach_subject_mattes / dodge_subtitles): quy doi gio
    nguon, ne mat theo KHOI (duoi cam -> tren dau -> sau nguoi -> thu nho), neo chu sau nguoi
    ngang DINH DAU do tu ban tach nen, phu de ne lop chu, bo hero trung lop chu, gioi han 8
    nhip / 10s, tu gan SFX tu bo tieng tong hop `sfx_kit.py` (kit-whoosh/pop/boom/...).
  - Tach nguoi: `media_vision.subject_matte` (VNGeneratePersonSegmentationRequest ->
    WebM VP9 alpha, cache `~/.capcut-studio/cache/vision/`, ~4s xu ly / 1s video). Renderer ve
    A-roll 2 lan: ban goc -> lop `behind` -> ban "chi nguoi" (cung camera/fisheye/tint) -> lop
    truoc. Can pyobjc-framework-Vision (macOS 12+); thieu -> tat behind/pop-out, video van dung.
  - Hieu ung `focus` ve TRONG khung A-roll (chu phia tren van net). `fisheye` = feDisplacementMap.
- Transition / hieu ung / mau / kieu chu / font chi lay trong danh muc Remotion. Kho SFX va kho
  meme (file ngoai) dung nguyen. Them muc danh muc moi = sua `remotion_catalog.json` + cach ve
  trong `remotion-src/` (test `tests/test_remotion_plan.py` muc [7] bat thieu).
- `remotion_plan.map_range`: quy doi gio nguon theo CHUOI DOAN LIEN TIEP, khong dung
  `source_to_timeline` cho tung dau mut (giay nam dung ranh gioi hai doan bi quy nham).
  Caption KHONG BAO GIO bi doi gio de tranh chong — chi cat duoi / bo trung lap.
- Transition can chat lieu hai ben (crossfade, slide, wipe, iris, blur) duoc build_spec kiem
  "tay cam" trong file nguon; thieu thi doi sang kieu cat (TRANSITION_FALLBACK). Timeline khong
  bi rut ngan boi transition.
- Dong goi: `npm run build` chay them `scripts/bundle-remotion.mjs`. electron-builder dua
  `out/remotion-bundle` ra `Resources/remotion-bundle`, `asarUnpack` compositor Remotion
  (worker tro `binariesDirectory` vao `app.asar.unpacked`). Chrome Headless Shell (~90MB) tai lan
  dau vao `~/.capcut-studio/remotion/node_modules/.remotion` (cwd cua worker).
- Project Remotion luu cung `projects.json` voi `mode: "remotion"`, con tro rieng
  `currentRemotion`; truong `rmPlan`, `rmSpec`, `rmSummary`, `rmRender`.
- Tang toc render CHI TREN MAC (2026-10-05): `chromiumOptions.gl='angle'` (Chrome ve bang GPU/Metal; mac dinh
  Chrome Headless tu ve bang phan mem SwiftShader) + `hardwareAcceleration='if-possible'` (h264_videotoolbox).
  Windows GIU CPU: tren win32 Remotion chon `h264_nvenc` (chi card NVIDIA) ma KHONG kiem tra may co card -> loi.
  Render tang toc loi -> worker tu render lai bang CPU. Tat: `STUDIO_REMOTION_ACCEL=0`. Do tren M3 (45s dau video
  1080x1920, 93 doan): CPU 388s -> GPU 273s (~30% nhanh hon), hinh nhu nhau (SSIM 0.985, do khac bo nen).
  VideoToolbox mac dinh (khong khung B, khung I moi 0.4s) cho file to hon ~30% -> `ffmpegOverride` chen
  `-q:v 70 -bf 2 -g 60` (Remotion cam CRF khi nen phan cung): 45s 81.6MB -> 50.5MB (x264 62.7MB), VMAF so x264
  95.5 -> 96.0. Phong to 100% thi ban chip nen min da hon x264 mot chut (co tu truoc khi chinh q70).
- Tuy chon `state.json`: `remotion_concurrency`, `remotion_license_key` (Remotion mien phi cho
  ca nhan / cong ty <= 3 nguoi; lon hon can license cua remotion.pro).
- Tu kiem:
  - `HOME=$(mktemp -d) <venv> tests/test_remotion_plan.py` (can ffmpeg).
  - `STUDIO_REMOTION_RENDER=<spec.json> STUDIO_REMOTION_OUT=<out.mp4> <app binary>` render qua
    chinh stack Electron (dev hoac ban dong goi).
  - `STUDIO_FAKE_READY=1 <electron> . --user-data-dir=<tam>`: mo khoa trang de soat giao dien
    ma khong doc Keychain.

## 13. Nhung Python + bao ve ma nguon (2026-09-30)

Muc tieu: (1) nguoi dung KHONG cai Python moi truong rieng; (2) bao ve ma Python sidecar;
(3) bao ve ma Electron phia BE (IPC). Chi ap dung o ban DONG GOI (`npm run dist`); `npm run dev`
va `npm run build` van chay source thuan (lap nhanh, khong bao ve). Nen tang: macOS arm64 truoc,
manifest chua san khoa cho Windows (python_embed[win-x64] = null, ext_suffix.win32 = ".pyd").

### 13a. Python NHUNG (thay uv/venv) — resources/python

- `scripts/bundle-python.mjs`: tai **python-build-standalone** (Astral, "install_only") CPython 3.12
  theo URL + SHA-256 GHIM o `sidecar/assets/toolchain.json` -> `python_embed`, giai nen vao
  `resources/python`, roi `pip install -r sidecar/requirements.lock` vao chinh no (ABI cp312 khop).
  Interpreter + .so/.dylib deu adhoc linker-signed san (arm64 chay duoc; electron-builder identity=null
  KHONG ky lai -> chu ky nôi bo con nguyen). Ket qua ship qua `extraResources` (-> Contents/Resources/python).
- `electron/services/paths.ts`: `embeddedPython()` (prod: <resources>/python/bin/python3.12; dev:
  <project>/resources/python/...). `sidecar.ts` + `doctor.ts` UU TIEN python nhung; chi fallback
  `state.json.venv_python` (may cu). Doctor: khi co python nhung -> KHONG auto-cai uv/venv
  (nam trong app read-only); Whisper model + Chrome VAN tai qua Doctor (trong so ML/trinh duyet,
  khong phai "moi truong Python").
- **Pham vi "khong cai Python"**: dung cho *runtime Python*; Whisper (~486MB) + Chrome (~90MB) van tai 1 lan.

### 13b. Sidecar bien dich Cython -> .so — resources/sidecar-dist

- `scripts/compile-sidecar.mjs`: bien dich MOI `sidecar/*.py` (tru `server_launch.py`) thanh
  `<mod>.cpython-312-darwin.so` (Cython, cai TAM roi go khoi python nhung -> ship sach), lap
  `resources/sidecar-dist/` = .so + `server_launch.py` + moi file top-level khong .py (requirements.lock,
  fx_runtime.mjs) + `scripts/*.py` (goi bang duong dan, giu source) + assets/ + references/. KY adhoc moi .so.
- **Launcher**: `server.py` -> `server.so`; khong the co `server.py` cung ten (loader uu tien .so) ->
  `server_launch.py` (`import server; server.main()`). `paths.sidecarServer()` tra launcher neu co, else server.py.
- Prod ship `resources/sidecar-dist` -> `sidecar` (thay source). Dev van chay `sidecar/*.py` (co ca
  server_launch.py, import server.py source). KHONG con "3 ban copy sidecar" cu — hot-fix = sua source .py
  roi `npm run dist` (khong sua truc tiep .so trong .app).

### 13c. Electron BE (main/preload/remotion-worker): obfuscate + bytenode

- `scripts/protect-electron.mjs` (sau `electron-vite build`): moi file trong `out/main/index.js`,
  `out/main/remotion-worker.js`, `out/preload/index.js` -> LAM ROI (`javascript-obfuscator`: stringArray
  base64 + doi ten + control-flow 0.5; TAT selfDefending/debugProtection/renameGlobals) -> BIEN DICH
  bytecode V8 `.jsc` (`bytenode`, chay duoi `ELECTRON_RUN_AS_NODE=1 <electron>` de khop V8 dang ship) ->
  thay .js bang STUB `require('bytenode'); module.exports=require('./<ten>.jsc')`. Helper: `scripts/bytenode-compile.cjs`.
- **BAT BUOC** (`electron.vite.config.ts`): `output.dynamicImportInCjs: false` cho main+preload — bytenode
  KHONG chay `import()` dong (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`); rollup doi sang require. `bytenode`
  o `dependencies` (co trong asar). `.jsc` khoa theo V8 -> nang Electron thi build lai.

### 13d. Pipeline & kiem chung

- `npm run dist` = electron-vite build -> bundle-remotion -> **bundle-python -> compile-sidecar ->
  protect-electron** -> electron-builder. Script rieng: `bundle:python`, `compile:sidecar`, `protect:electron`.
- Da kiem tren ban `dist:dir` DONG GOI: STUDIO_DOCTOR (python nhung 47/47, Vision, Whisper OK, khong can uv);
  STUDIO_REMOTION_RENDER = PASS (main.jsc + remotion-worker.jsc fork tu asar + bytenode + render MP4);
  mo GUI -> preload.jsc nap, sidecar (.so) spawn bang python nhung; may sach (env -i, khong python/uv he thong)
  van xanh nhom Python. 23 test Python + 3 test .mts + tsc + compileall PASS.
- Test: `tests/test_toolchain.py` [1] python_embed; `tests/test_toolchain.mts` [5] platformKey/pyEmbedTarget/pyExtSuffix.

### 13e. Dong bo kho SFX + Meme qua Cloudflare R2 (2026-09-30)

Muc tieu: tac gia them/gan nhan (Gemini) kho 1 lan -> may khac TU TAI ve ca media LAN nhan
(emotion/use_when/tags/summary) -> khong goi Gemini lai; them meme moi sau nay chi upload R2, khong
phai phat hanh app moi.

- **2026-10-04: KHONG con cong khai.** Bucket `agent-edit` chi tai qua may chu ban quyen (muc 13g): Electron
  `library:sync` -> `license.libraryManifest()` (op=library, ky khoa thiet bi) -> manifest kem `url` tai tam
  (2 gio, key bi khoa -> 403) -> sidecar `POST /library/sync {manifest}`. `library_sync.json` khong con `base_url`.
- **Pull (may nguoi dung)** `sidecar/library_sync.py` `pull(manifest)` -> route `POST /library/sync` (server.py):
  tai file THIEU / SAI SHA-256 theo `url` tung muc
  -> GOP theo `id` (muc R2 ghi de muc cung id; muc nguoi dung tu them GIU NGUYEN). An toan: sao luu
  `*_library.json.bak` truoc khi ghi; `file` viet lai duong dan tuyet doi theo may (manifest chi giu ten);
  manifest loi/rong -> khong xoa gi. Dung `engine._load_lib/_save_lib` + `meme_lib.load_lib/save_lib`
  (giu dung schema). Chi `requests` (da co trong sidecar).
- **Electron/UI**: IPC `library:sync` (ipc.ts) -> preload `syncLibrary` -> nut "Dong bo kho" o cac trang Tai nguyen;
  TU sync nen MOI LAN MO APP (`App.tsx`). 2026-10-06: KHONG con cho Doctor "san sang" (truoc do may khach con 1 muc
  Doctor loi -> khong bao gio tu dong bo), loi -> thu lai toi da 3 lan cach 45s. ipc.ts chi chay 1 luot tai 1 thoi diem
  (bam nut trong luc luot mo app dang chay -> nhan chung ket qua), su kien `library:syncState` {running, result, at} +
  `library:syncStatus` (ket qua luot gan nhat) -> `src/lib/useLibrarySync.ts`: trang Tai nguyen hien "Dang dong bo…" va
  tai lai danh sach khi xong; Doctor hien muc "Dong bo tai nguyen".
- **Publish (may tac gia)** `scripts/publish-library.mjs` (`npm run publish:library`; `--dry-run` de thu):
  doc `~/.capcut-studio/{sfx,memes}` + `*_library.json`, tinh SHA-256, tao manifest (file=ten co ban),
  upload file MOI/DOI (so voi manifest R2) + manifest. Token R2 o `~/.capcut-studio/r2-publish.json`
  (account_id/access_key_id/secret_access_key/bucket) hoac env `R2_*` — CHI o may tac gia (doc manifest cu bang S3),
  KHONG nhung vao app, `.gitignore` chan `r2-publish.json`. Dung `@aws-sdk/client-s3` (devDependency).
- **Da verify**: unit test merge (giu local-only, cap nhat nhan R2, viet lai path, kiem SHA, backup);
  test tich hop qua HTTP `/library/sync` voi mock R2 (HOME tam); `--dry-run` tren kho that (51 SFX + 18 meme).

### 13g. BAN QUYEN: 1 key = 1 may (2026-10-04)

May chu `license-server/` (Cloudflare Worker + D1, chi tiet + trien khai: `license-server/README.md`):
`agent-edit-license` (`src/api.js`, app goi) + `agent-edit-admin` (`src/admin.js` + `admin.html`, trang quan ly key
sau Cloudflare Access, email `dailongmedia.agency@gmail.com`). Bi mat o `~/.capcut-studio/license-secrets.json`
(`gen-keys.mjs`, KHONG len git).

- **Key**: 25 ky tu Crockford base32 (5 nhom, ky tu cuoi kiem tra go sai). D1 luu SHA-256 (tra cuu) + ban ma hoa
  AES-GCM (trang quan tri xem lai). Goi thang / nam / vinh vien, han tinh tu lan kich hoat dau.
- **Ma may** (`electron/services/license.ts` + `sidecar/server.py`, CUNG lenh / chuan hoa / HMAC
  `agent-edit/fp/v1`): macOS IOPlatformUUID + serial; Windows UUID bo mach + serial bo mach + MachineGuid (1 lenh
  PowerShell). Cung may = khop >= min(2, so thanh phan). Gia tri rac (O.E.M, toan 0/F...) bo qua.
- **Khoa thiet bi** Ed25519 sinh tren may, khoa bi mat trong `<userData>/license.enc` (safeStorage: Keychain / DPAPI)
  -> copy sang may khac khong giai ma duoc -> `need_key`. Moi yeu cau `{p: JSON, s: chu ky}`; gio lech > 10 phut ->
  server tra `server_time`, app bu roi gui lai.
- **Server**: chua gan -> `activate` gan; dung khoa thiet bi nhung khac phan cung -> `other_machine`; khoa thiet bi
  moi + phan cung khop (cai lai app / Windows) -> `rekey` (3 lan / 7 ngay -> TU KHOA); may khac -> `other_machine`
  + dem `conflicts`. Sai key 20 lan/gio/IP -> chan. Tra "ve" ky Ed25519 (`v1.<payload>.<sig>`, han 3 ngay, mang ma
  may da gan) — app kiem chu ky bang `PROD_PUB` truoc khi tin.
- **Khi nao hoi server (user chot)**: CHI mo app (`LicenseGate` -> `license:check`) + bam "Phan tich video"
  (`pipeline:understandSources` / `remotion:understandReference` / `understandMedia` -> `requireLicense()`, dung lai
  ket qua < 20s). KHONG hoi dinh ky, KHONG hoi o lap plan / render (render chi `assertLicensed()` tren trang thai gan
  nhat). Khong mang = khong dung. Ve het han (app mo > 3 ngay) -> sidecar 403 -> main tu lay ve moi 1 lan.
- **Sidecar** (`server.py`, phan BAN QUYEN — de ngay trong server.py de bien dich vao server.so): Ed25519 thuan Python
  (RFC 8032, khong them thu vien), `before_request` dau tien: thieu ve -> 403 `code=license` cho moi route tru
  `/health /config /license/ticket /cli_status /test_connection /providers`. `STUDIO_LICENSE_OFF` /
  `STUDIO_LICENSE_PUB` CHI co tac dung khi chay `server.py` nguon (ban .so bo qua) — test goi route dat
  `STUDIO_LICENSE_OFF=1`.
- **UI**: `src/components/LicenseGate.tsx` boc App (main.tsx): chua kich hoat / khoa / het han / may khac / mat mang
  -> man hinh rieng; bi khoa giua chung -> PHU LEN app (khong unmount). Nut tai khoan goc phai = thong tin key.
- **Dev**: `STUDIO_LICENSE=off` bo qua; `STUDIO_LICENSE_URL` + `STUDIO_LICENSE_PUB` tro may chu thu (wrangler dev) —
  chi ban chua dong goi; file rieng `license-dev.enc`. `STUDIO_LICENSE_PLAIN_STORE=1` = khong dung Keychain (tu kiem).
- **Dong goi**: `scripts/adhoc-sign.cjs` (afterPack, mac + win) lat Electron Fuses: tat NODE_OPTIONS + --inspect,
  GIU RunAsNode (hop cach ly FX `fx_flow.py` chay binary app voi ELECTRON_RUN_AS_NODE). selftest-packaged [5]: sidecar
  bien dich PHAI tra 403 du co `STUDIO_LICENSE_OFF=1`.
- **Test**: `license-server`: `npm test` (34 tinh huong, can `dev:api` + `dev:admin`); app: `tests/test_license.mts`
  (noi may chu thu; ma may Python == Electron; Python kiem ve), `tests/test_license_ticket.py` (vector RFC 8032 +
  cong chan route, khong can mang).

### 13h. Menu "Tai nguyen" + KHO TEXT (mau chu dong tu preset CapCut, 2026-10-04)
- Sidebar: "Kho am thanh" + "Kho meme" gop vao menu **Tai nguyen** (`src/pages/Resources.tsx`, 3 tab, tab nho
  trong localStorage) — tab moi **Kho Text** (`src/pages/TextTemplates.tsx`).
- LUAT: chu trong mau CHI LA CHU MAU (slot) — khi dung that, slot nhan loi noi that. Hien ro tren UI + prompt Gemini.
- Du lieu: `~/.capcut-studio/text_templates/<id>/` (`template.json` + `preview.mp4` + `fonts/ audio/ assets/`),
  chi muc `~/.capcut-studio/text_library.json` (`sidecar/text_lib.py`, `register_from_dir`). Route `/text/*`,
  IPC `text:*`. Gemini XEM preview -> nhan (summary/style/energy/use_when/avoid_when/slot_roles/tags) qua
  `_GEMINI_TEXT_TEMPLATE_PROMPT` (sua duoc o Prompt & quy tac).
- Chuyen preset (may tac gia): `python sidecar/capcut_preset_import.py "<thu muc preset>" <thu muc mau> --id ...`
  — doc `preset_draft/draft_content.json` (clip ghep long nhau) + goi Lumi (`LumiExportData.lua`: bang keyframe,
  thanh truot `ae_sliderInfos` tinh dung `LumiParamsSetter`) -> spec du lieu (`remotion-src/textTemplate/spec.ts`).
  Thanh phan chua ho tro -> BAO LOI, khong ve gan dung.
- Ve: composition `TextTemplate` (`remotion-src/textTemplate/`): Canvas 2D + hieu ung tinh bang JS (khong GPU):
  `deepGlow.ts` = port 1:1 shader LumiDeepGlow, `aeCurve.ts` = port AETools, `ae_trs_matte` = lop Lumi trs + luma
  matte. Quy uoc CapCut DO TREN VIDEO XUAT THAT (preset LE VIP5-06): co chu = chieu cao DONG (ascent+descent
  cua font) 6.21 px / 1 don vi font_size o khung rong 1080 (KHONG theo em — font viet tay dong cao -> chu nho);
  toa do transform + mask: x = nua rong, y = nua cao, truc y huong LEN; mask elip vien mem = smoothstep
  d=1-feather..1+feather. Ket qua: vi tri khop <1px, mask sai so 1.4%, glow dung cong thuc (quang sang +5-7%),
  am thanh trung moc 0.02ms / 0.13dB. Bong + vien chu CHUA do (den tren nen den) — `DEFAULT_TUNE` tam.
- Mo rong 2026-10-04 (8 preset LE VIP5 02/04/05/06/07/08/09/10 trong draft "1004", do tung khung voi video xuat that):
  keyframe cong (FreeCurveIn/Out = bezier (thoi gian, gia tri), tay nam tuong doi), keyframe tren clip ghep,
  chu nhieu kieu (runs) + chu nghieng (nghieng quanh TAM KHUNG NET MUC, italic_degree), letter_spacing (theo em),
  chu dung global_alpha (bo clip.alpha cua lop chu), am thanh khuech dai >1 + fade, hoat anh clip kieu Transform.lua
  ("Mo dan"), hieu ung "Mo" (2 luot 17 mau, blurSize = 4 x thanh truot) co keyframe, "Mo chrome" (nhoe huong tam +
  tach mau, truc v cua GPU huong LEN), mask "Tach" (line) / "Cuon phim" (mirror) chep tu shader (u_diff = feather^2
  — do), elip: nua do rong vien mem = 4.86 x feather^1.866 (do chung 2 preset). CapCut KHONG kern (bo kerning:
  preset 09 sai khac 1.96 -> 0.93). Hoat anh chu co script MA HOA (.jsdat, vd "Kich ban xuat hien") va chinh mau
  (brightness/contrast/highlight + duong cong) khong co cong thuc -> bang `KNOWN_CHAR_ANIMS` / `KNOWN_COLOR_ADJUST`
  trong `capcut_preset_import.py` DO tren video; to hop chua do -> bao loi.
  Kiem: `tests/test_capcut_preset_import.py`; khung thu so sanh + do o scratchpad (score.py / fit*.py) — chua dua vao repo.
- Mo rong 2026-10-05 (goi LE VIP2, mau `levip2-01` "thị trường đang / THAY ĐỔI / Rất nhanh", do voi video CapCut that
  `LE-VIP2-01.mov`, sai khac TB toan khung 0.71/255): (1) CLIP VIDEO THUONG trong preset -> importer trich KHUNG ANH
  (chi doan thuc su hien, `frames/vN/0000.jpg|png`, vua khung "contain", .mov alpha cat sat vung co hinh) -> spec
  `FramesNode` {type 'frames', seq: FrameSeq}; CapCut lay khung GAN NHAT (offset +0.5 — do tren net quet toc do 1.1);
  hieu ung clip (vd "Phat sang 2" = deep_glow) + keyframe (nhap nhay alpha) nam o group boc. (2) MASK "Van ban" (chu lam
  mask cho clip video) -> o chu THAT (slot) `TextNode.fillFrames` (chu to bang khung video, chu that thay vao van mang nen
  video) + `emPx` (co theo EM: em = 0.8655 x text_config.scale, do) + `bold` (bold_width 1 = vien cung mau 0.0105 em moi
  ben) + lech xuong 0.035 em; chu mau IN HOA -> `textCase: 'upper'`. (3) `border_color` RONG = KHONG vien (CapCut de
  width 0.08 mac dinh; ve vien den lam chu viet tay thanh khoi den — do: 18 -> 7.6). (4) am luong clip ghep BOC NGOAI
  nhan don vao tieng con (LE VIP2-01 boc 2.14 — khop tieng 0.988); tieng khong co file (path rong) -> bo + canh bao; tieng
  cua clip video im lang -> bo, co tieng -> bao loi. (5) computeFit buoc NET MUC tinh khe theo TUNG KY TU chong nhau
  theo chieu ngang (truoc: ca dong -> moc 'Ổ' nho len ngoai phan chu dong tren bi coi la "chong co chu dich", chu that
  'TĂNG' de dau len 'giá vàng'). Chu mau -> bo cuc y het truoc (9 mau cu: fit vs khong fit sai khac 0).
  Sidecar `text_tpl`: `_hits` / `missing_glyphs` chi lay node `text`; `_line_px` theo emPx. App cu: geometry loi ->
  catalog bo mau (an toan) — muon dung phai build + cai ban moi. So sanh: `work/capcut-presets-LEVIP2/`.
- Mo rong 2026-10-06 (goi LE VIP2 02-20, 19 mau `levip2-02..20`, doi chieu video CapCut that `1005.mov` = draft "1005"
  noi 01, 03..20 moi mau 2.433s — KHONG co 02; tool scratchpad: run.sh / score.py / expv.sh, ref cat theo khung i*73):
  (1) HINH CapCut (track sticker, vat lieu `shapes` rect_item / polycon_item) -> `VectorNode` (da giac bo goc, to dac /
  gradient tuyen tinh, vien). Toa do hinh theo khung RONG 720 (do: hop 318 don vi = 477 px @1080); check_flag 16 = to,
  32 = vien, 64 = bo goc; goc gradient tinh truc y XUONG (hinh thoi xoay 45 do LE VIP2-14). (2) CLIP GHEP CANVAS RIENG
  (vd 1920x1080 trong project doc): group `canvas` -> con ve theo canvas do (co chu theo BE NGANG canvas) roi "vua khung"
  vao cha (subCtx / fitMatrix; text_tpl._hits khop). Spec luon 1080x1920. (3) CapCut tinh chieu cao dong theo bang OS/2
  TYPO (khong hhea nhu trinh duyet): font viet tay hhea 2.26 / typo 1.28 em -> chu to gap 1.77 (LE VIP2-05). Importer ghi
  `fonts[].metrics`; renderer + text_tpl dung khi co (mau cu khong co -> y het truoc). Mask "Van ban": co chu = 1.0549
  x scale x font_size/40 / dong typo (01 Montserrat giu nguyen 0.8655 x scale; 03 Anton nho hon 0.815; 09 font_size 20).
  (4) CHINH MAU port 1:1 tu goi 7501974767453474064 (`remotion-src/textTemplate/colorAdjust.ts`, LUT 65^3): curves
  (bezier) -> primary wheels (kep [-1,1] + adjustLift/Gamma/Gain, **LumaMix 0** — do: vet do 18 -> vang, chu 06 trung vi
  khop) -> log wheels (chi offset) -> adjustColor (brightness / contrast / highlight / shadow / saturation / white / black /
  light_sensation LUT 17^3 nhung trong spec). Mask `category: "adjust"` = chi chon VUNG chinh mau, clip khong bi cat
  (05); `"video"` = cat clip (04, 14). Thanh truot = 0 -> bo qua. Mau da do o KNOWN_COLOR_ADJUST (LE VIP5-09) giu nguyen.
  (5) Hieu ung: "Player 3" xoay 3D quanh truc doc qua TAM KHUNG (`rotate3d`, space 'canvas', chieu -1, keyframe thanh
  truot xoay — 20); LumiDeepGlow BAN MOI (co GlowIter.lua) port rieng `deepGlow2` (8 vong, nhan exposure moi vong, hau xu
  ly lay vong le cuoi do Lua ghi de u_blurTex) — quang 12 vs CapCut 10; "Shockwave" = 2 chuoi PNG screen + overlay
  (`sprite_blend`, giu alpha lop); "Flipped" = LUT 8x8 + chuoi tim neon screen lap (mask nguoi bo qua tren chu); word-art
  text_effect "125" = anh kim loai gian theo net chu + bong (`fillImage`, bo vien). (6) Hoat anh chu: Lua doc duoc ->
  `SampledAnim` bang mau (Transform.lua tween: dich 2.66 lan be ngang / chieu cao chu, quadOut; Transform.lua actions:
  dich ca lop px khung; TextAnim.lua "Cham dan vao phai"; AnimScript.lua "Ha ngau nhien" -> charAnim shuffle + autoStep);
  ma hoa -> DO tren video (KNOWN_CHAR_ANIMS / KNOWN_TEXT_ANIMS: "Chu bat vao", "School Trip", "Truot len" 7510 (thu tu
  nguoc), "Truot vao", "Mo dan nhu bong ma" (thu tu rieng + nhoe), "Awkward Reunion" (halves + curve con lac), "Chu
  nhap nhay" (bac thang do hien), "Fisheye" (bang scale)). (7) Keyframe CapCut tinh theo thoi gian NGUON cua clip
  (tru source_timerange.start — 14); keyframe mask (KFTypeCommonMask*); bong chu = `diffuse` cua style (shadow_smoothing
  0.45 lam bong loang ~1 em, sai); BO DEM SO (track chu >= 4 doan so cung dinh dang) -> 1 o + `counter` (dem toi so that,
  giu tien to / phan nghin — 10); am thanh clip ghep long; clip video trong clip ghep tat tieng -> bo tieng; anh tinh.
  (8) PHIEN BAN: mau moi mang `minApp: "1.2.0"`; app 1.2.0 (`text_lib.TEXT_RENDERER_VERSION`) — license-server chi ky link
  mau cho app >= minApp, library_sync + text_tpl.usable bo mau app chua ve duoc (app 1.1.0 khong nhan -> khong loi render).
  Ket qua (sai khac TB toan khung /255, video CapCut that): 03 2.0, 04 1.6, 05 1.6, 06 1.9, 07 0.7, 08 2.0, 09 0.3, 10 2.5,
  11 1.6, 12 1.6, 13 2.3, 14 0.3, 15 0.7, 16 1.2, 17 1.2, 18 2.0, 19 1.0, 20 0.5 (02 chua co video doi chieu). Da cai kho that +
  nhan Gemini + publish R2 + deploy worker; app 1.2.0 (build 20261006-0408-full) cai /Applications. Xem
  `work/capcut-presets-LEVIP2/so_sanh_NN_capcut_vs_remotion.mp4` (trai CapCut, phai Remotion). Con lech: vi tri doc chu
  vai px o mot so font (3-4 px), meo fisheye chua ve (chi phong), thu tu ngau nhien "Ha ngau nhien" khac RNG Lua.
  Test: `tests/test_capcut_preset_import.py` [7].
- Dong bo: `library_sync.py` + `publish-library.mjs` them `texts` (1 muc = nhieu file, R2 `texts/<id>/<path>`);
  `license-server/src/api.js` ky link tam cho tung file (`/v1/lib/texts/<id>/<path>`, chan `..`). Smoke 40 ok.
- Bay: ffmpeg trich khung video CapCut phai `scale=in_color_matrix=bt709` (mac dinh BT.601 lech mau);
  Remotion ma hoa AAC lam tieng TRE ~43ms (WAV thi dung) — anh huong moi video app xuat, chua sua.

### 13i. KHO TEXT KHI LAP KE HOACH — kiem kho truoc, chu anh AI sau (2026-10-04, `sidecar/text_tpl.py`)
- User: moi cum chu noi bat (lop chu R4, caption hero / hook) phai KIEM KHO TEXT TRUOC; mau hop boi canh -> dung NGUYEN
  mau (hoat canh + font + hieu ung + am thanh), chi THAY CHU + xep cho khong vo bo cuc; khong mau nao hop moi tao chu
  anh AI. Buoc **TXT-lib** (Claude) chay sau R5, TRUOC TXT-art; cum dung mau bi loai khoi TXT-art (khong tao anh).
  Kho trong / chua gan nhan -> buoc khong chay (nhu cu). Brand Guideline ep font / ma mau -> khong dung mau (pha thuong hieu).
- AI de xuat, CODE QUYET (`text_tpl.check_choice`): cac o doc theo THU TU DOC cua mau (`geometry` + `reading_order`: tren
  -> duoi, trai -> phai, do o khung "day du nhat" = nhieu o cung hien nhat; chu cai lon drop cap (o mau <= 2 ky tu) doc
  cung tu ben phai; bo cuc bac thang = 2 dong) ghep lai = DUNG nguyen chu cua cum (giu dau tieng Viet, chi doi hoa/thuong +
  bo dau cau) + dung thu tu LOI NOI (so voi cau dang noi); moi o co chu; font cua o du ky tu (PIL so voi glyph .notdef);
  co chu sau khi vua o >= `MIN_FIT` 60%; moi mau <= `MAX_USES` 2 lan / video. Sai -> AI sua 1 luot (kem loi) -> van sai
  thi cum do di chu anh AI. Prompt `_TEXT_LIB_SYSTEM` (sua duoc, `own_key` -> khong doi van tay chung; khoa rieng
  `prompt_fp`). AI nhan nhan mau + vai tro / thu tu doc / so ky tu tung o (chu mau chi de minh hoa, KHONG gui duong dan).
- plan["text_lib"]["items"][key] = {template, texts {slot: chu}, tiers, src (lop R4 idx / caption / hook), ly_do, fit}.
  `text_art.lockups_from(meta=True)` tra kem `src`; meta=False giu NGUYEN dang cu (khoa cache TXT-art).
- Dung (build_spec): `MD.text_lib_layers` (trong layers_to_spec, truoc _avoid_faces): bo cac lop chu + nen chu (box cung
  group) cua cum -> 1 lop spec **`tpl`** {x, y = tam khoi chu mau tren khung; w, h = khoi chu; scale; tpl = template.json;
  tplDir; texts; tplBox (px mau)}, vao luc lop dau cua cum, dai = do dai mau. Chu cum doi so voi luc chon -> giu chu code.
  `MD.text_lib_captions`: caption hero / hook -> lop tpl o vi tri caption. protect_face / phu de ne theo w / h
  (`_GUARD_TYPES`, `_guard_box`, `_scale_layer`, `_layer_band`). Lop tpl KHONG ne duoc mat (ca than video, khong chi
  hook — mau 07 drop cap khoi 0.9 x 0.45 khung de len mat) -> protect_face BO -> `build_spec` dung lai voi cum do la chu
  thuong + report `tpl_lost` -> autoplan TAO BU CHU ANH AI cho dung cac cum do (step TXT-art khoa rieng) roi dung lai.
  `MD.separate_tpl_overlaps` (sau separate_group_overlaps): to hop chu khac hien cung luc de len mau -> trung chu thi
  bo, vao sau >= 0.3s thi mau tat, con lai dich ra ngoai khoi mau. Plan khong co text_lib -> spec giong het truoc.
- Sua sau khi xem bang mat (10-04 toi, build 20261004-2023-full): (1) khoi mau = NET CHU THAT cua chu thay vao da fit
  (`text_tpl.ink_box`, PIL getbbox) thay vi dong font — drop cap dong cao gap ~2 lan net (mau 07: 0.90x0.45 -> ~0.78x0.22);
  (2) `MD._face_rect` gioi han trong o A-roll (+ popout) o bo cuc split / card / circle — mat quay can cong tran lan len
  vung B-roll (loi cu, anh huong MOI loai chu); (3) lop tpl che mat toi da `FACE_TPL_MAX` 5% (khoi to + glow) -> doi cho /
  thu nho toi 42% -> khong duoc thi tao chu anh AI; (4) `dodge_subtitles` tinh ca tpl (phu de ne, caption hero trung gio
  bo); (5) `separate_tpl_overlaps`: to hop TRUNG CHU trung GIO voi mau -> bo du o cho khac tren khung.
- TIENG MAU: `text_tpl.premix` tron moi clip (gio, cat, khuech dai > 1, fade) thanh 1 WAV dinh -1 dBFS
  (`~/.capcut-studio/cache/texttpl/`) -> `layer_sfx` 1 muc `_tpl` (+ `_text`, `_from_layer`) -> `mix_sfx` can theo giong
  noi nhu tieng khi chu hien; KHONG bi luat "dung chung tieng" bo; spec audio `layer` = id lop (lop bo -> tieng bo theo).
- Renderer: `Layers.tsx` `TplLayer` (Sequence + premount nhu lop video) ve `TextTemplate` voi `fit muted fileUrl`
  (font / anh qua may chu media — them duoi .ttf/.otf/.woff). `TextTemplate.computeFit`: chu that <= be ngang chu mau
  cua o (co lai, phong toi da `FIT_GROW_MAX` 1.12); cac o CUNG DONG (cao tuong duong, sat nhau) chia chung be ngang dong
  + xep lai voi khe cu (cung dong = cao tuong duong, chong doc >= 50%, khe < 1.2 dong); o le NEO vao o ben canh (hang
  xom trai -> giu mep trai, duoi -> giu mep duoi...); NET MUC (dau chong ấ ầ cao hon dong font): 2 o chong ngang phai
  cach >= 6% dong (mau chong net co chu dich > 25% dong thi giu muc cua mau) -> day o nho hon CA DONG ra xa; ca to hop
  ve tam cu; dich man hinh -> khung group cua tung node (nghich dao ma tran). Python `text_tpl.fit_scales` KHOP.
- Do that (du an r_murux9ufhtuad4, phong van sẹo rỗ, lap lai plan 10-04 bang Claude ~27 phut): TXT-lib xet 13 cum, AI
  chon 4 (05 x2, 07 x2) + ly do bo 9 cum (1 tu 'HAY', co so '2-3 ngày', mau hop da dung du 2 lan...); 2 mau 07 de len
  mat -> tao bu chu anh AI -> ket qua 2 cum mau + 11 cum chu anh AI. Thu tu doc dung ca 8 mau. Han che: mau khong tu doi
  mau theo nen (khong qua ensure_legible); render khung co mau cham hon (glow / mask tinh bang JS tren khung 1080x1920).
- Test: `tests/test_text_tpl.py` (35 muc, AI gia). Kiem bang mat: render `TextTemplate` voi `texts` + `fit` (so voi
  `fit: false`) va render cua so spec AutoEdit.

### 13j. MAU CHU TU THIET KE (khong tu preset CapCut) — `capcut-ai-studio/text-designs/` (2026-10-04)
- User dua ANH bo cuc -> thiet ke mau moi cung chuan Kho Text: `design_<id>.py` (so do + chuyen dong + am thanh) ->
  `python text-designs/design_<id>.py [thu muc]` ghi `~/.capcut-studio/text_templates/<id>/` (template.json + fonts OFL +
  audio WAV tong hop numpy) -> render preview (`render.mjs ... --video`) -> `text_lib.register_from_dir` -> Gemini gan nhan
  (engine.text_label_with_ai) -> NGUOI DUYET nhan (energy / slot_roles sai thi sua bang text_update).
- KHONG DAT TAY: font / co / vi tri / gian chu lay bang DO TUONG QUAN tung thanh phan voi anh mau (scratch fit: dung
  thu tung font + co + lech + gian chu, chon tuong quan cao nhat). Bay da gap: chu nghieng trong anh co the la font THANG
  nghieng gia lap (TK-01 "TAM TRANG": Italic that tuong quan 0.67, Regular thang nghieng 11 do = 0.948) -> thu ca hai.
- SO SANH DOI CHIEU: `python text-designs/compare.py design_<id>` -> render khung nghi tren mau nen anh mau, cat dung vung,
  ha ve do phan giai anh mau -> `.compare/<id>/compare.png` (mau | ban dung | ha phan giai | chong do/xanh) + report.json
  (lech 4 canh tung thanh phan, tuong quan). TK-01: tuong quan toan khung 0.982, thanh phan lech <= 2 px anh mau.
- Renderer mo rong (spec.ts / TextTemplate.tsx), mau cu KHONG doi (truong moi deu tuy chon):
  `ShapeNode` (rect / sparkle) khung BAM o chu cung group qua `SlotRef` {slot, edge l|r|cx|t|b|cy|base|inkT|inkB, off}
  o VI TRI NGHI cua chu sau computeFit (hop sau chu, gach ke tu sau chu nay toi het chu kia — chu that dai / ngan thi
  hinh di theo; `minWidth` het cho thi an); `reveal` (lo dan trai / phai / giua, mep mem) cho chu + hinh; `colorSweep`
  (mau `from` -> fill theo vet quet nghieng + vet sang); `textCase: 'upper'`; spec `readingOrder` (thu tu doc khai bao —
  doan theo hinh sai voi so to canh 2 dong); slot `accept: 'number'` (code loai chu khong phai so) + `room` (chu that
  rong toi room x chu mau truoc khi co: "10" thay "3").
- Sidecar `text_tpl.py`: `_hits` chi lay node chu (hinh rieng), `_text_frame` / `_shape_box` -> khoi chu (geometry box,
  ink_box) GOM hinh; `_shown` in hoa khi do; check_choice kiem `accept`; catalog gui `chi_nhan: con so`. App cu gap mau
  co hinh: geometry loi -> catalog BO mau (AI khong thay) -> an toan, nhung muon dung phai cai ban moi.
- TK-01 (`tk-01-3buoc`, 3.6s): "3" dap nhu con dau (vut + thump), "bước" hien theo net but + gach ke keo dai (sot soat),
  "TẮM TRẮNG" truot vao mau da ram -> vet sang quet thanh trang + tia lap lanh (chuoi ting), hop trang bung tu giua (pop),
  "ngay tại nhà!" nay len (chuong cua ding-dong), 3.3s ca khoi mo. Test: `tests/test_text_tpl.py` muc [7].

### 13k. KHO HIEU UNG TU VIET — dong goi, dung lai, kho chung co duyet (2026-10-05, `sidecar/fx_lib.py`)

User: hieu ung Claude viet code (plan.fx, FX-code / Hook-FX-plan; KHONG gom anh AI / chu anh AI / mau Kho Text) chi dung 1
lan la lang phi -> tu dong goi vao kho, Gemini mo ta, day len kho chung R2; video sau kiem kho truoc, dung lai / sua nhe.
Rang buoc: KHONG lam cham tao video. User chon (10-05): MOI may gui len kho chung, may tac gia tu duyet, may khach CHO DUYET
(hop cach ly Node vm KHONG phai ranh gioi bao mat -> code tu may khach co the la code thoat vm, phai qua nguoi xem).

- DUNG LAI khi lap plan — KHONG them luot AI: FX-plan giu nguyen (ngu canh truoc, cache cu dung lai). `fx_lib.candidates_for`
  (code, ms): cung loai overlay/transform, khung dung duoc (`works`), do dai trong 0.5-2x, cosine tf-idf (tu + cap tu, bo dau)
  giua visual/goal/sync cua hieu ung moi va nhan Gemini + thiet ke goc; <= 3 ung vien / hieu ung, <= 6 / lo; bo muc sinh tu
  CHINH du an dang lap (autoplan nhan `project`), muc tat, chat luong 1, `needs_face` khi video khong co mat. Gop vao FX-code:
  hieu ung co ung vien nhan `kho_ung_vien` (mo ta + CODE) + prompt `_FX_REUSE_NOTE` (own_key); AI tra `reuse: lib_id` (khong
  code, mau / cuong do qua params) | `from: lib_id` + code sua nhe | code moi. Id la (khong nam trong ung vien) -> bo. Code kho
  van qua hop cach ly voi mat / vung chu cua video MOI + FX-fix (sua -> thanh `adapt`). plan.fx[i].lib = {id, mode, name}.
  KHO TRONG / KHONG UNG VIEN -> system prompt + payload + khoa cache FX-code Y HET truoc (test [3]). Co ung vien -> khoa them
  `kho` (id + bam code ung vien + van tay prompt).
- DONG GOI sau khi RENDER XONG (RemotionStudio runRender -> `harvestAfterRender`): `/fxlib/harvest` -> `fx_lib.harvest`
  (khong AI): id = "fx-" + sha1(kind + code chuan hoa)[:12] (KHOP license-server `fxIdOf`), trung code -> chi tang `uses`
  (moi du an 1 lan); reuse -> dem cho muc goc; adapt -> muc moi co `parent`. Kiem DI DONG trong hop cach ly (mat giua / mat
  lech + vung chu / khong mat; khung doc + ngang): hong o chinh khung video -> khong dong goi; chi hong khi khong mat ->
  `needs_face`. Luu `~/.capcut-studio/fx_library.json` + `fx_effects/<id>/code.js`. `design` (context / why_fit co trich loi
  noi) + `projects` CHI o may nay, khong bao gio gui di.
- VIEC NEN (`src/lib/fxHarvest.ts`, chay khi mo app + sau dong goi, moi lan 1 viec): (1) preview — lan render UU TIEN THAP
  (`jobQueue.acquireIdle`: video bam sau van chen truoc) -> IPC `fxlib:renderPreview` -> `fx_lib.preview_job` ve khung voi mat
  mau vao cache/fx -> composition `FxPreview` (remotion-src/FxPreview.tsx: nen trung tinh + bong nguoi gia, KHONG hinh video
  that) render 540x960 khong tieng (`startRender` opts compositionId/scale/muted) -> fx_effects/<id>/preview.mp4 (~2-10s);
  (2) Gemini (`_GEMINI_FX_PROMPT`, own_key, lan gemini uu tien thap, 4 / luot, step Gemini-fx) -> nhan tong quat (name,
  summary, visual, use_when, avoid_when, moods, moments, placement, energy, tags, quality 1-5). Gemini loi CHUNG (chua dang
  nhap / mat mang) -> khong danh dau muc, dung trong phien, lan mo app sau thu lai; (3) gui kho chung neu quality >= 3.
  Trang thai tung muc trong fx_library.json -> tat app giua chung lam tiep. Loi rieng muc -> nut "Thu lai".
- KHO CHUNG (license-server): `POST /v1/fx/upload` multipart (p ky khoa thiet bi, chu ky phu sha256 meta + code + preview;
  key dang dung + DUNG may da gan; id phai = bam code; meta loc bang `cleanMeta`; <= 60 muc / key / ngay; trung id -> tra
  trang thai, khong ghi de). R2 `fx/<id>/{code.js,preview.mp4}` + D1 `fx_items` (pending / approved / rejected) +
  `trusted_licenses` (may tin cay -> tu duyet). Manifest `op=library` them `fx` = muc approved tu D1 (KHONG nam trong
  library-manifest.json -> publish-library.mjs khong dung). Tai `/v1/lib/fx/<id>/<file>` chi muc approved. App:
  `license.fxUpload` (net.fetch FormData) qua IPC `fxlib:share`; loi tam (mat mang / gioi han) -> thu lai lan sau.
- Trang quan tri: tab "Kho hiệu ứng" (xem preview `/media/fx/<id>/preview.mp4`, xem code, Duyệt / Từ chối / Gỡ khỏi kho —
  tu choi xoa file R2, giu dong de gui lai van rejected); trong chi tiet key: "Đặt máy tin cậy (hiệu ứng tự duyệt)".
- Dong bo: `library_sync.pull` -> `fx_lib.merge_shared`: tai + kiem SHA-256, kiem lai id = bam code; muc cua chinh may nay ->
  chi danh dau approved; muc chung bi go khoi manifest -> xoa o may nay (muc local khong bao gio xoa).
- UI: Tai nguyen -> tab "Kho hiệu ứng" (src/pages/FxLibrary.tsx): preview, nhan, trang thai, so lan dung, Gemini xem lai, tat /
  bat, xoa, thu lai, dong bo.
- Test: `tests/test_fx_lib.py` (dong goi, ung vien, FX-code kho trong y het cu / reuse / adapt / id la / FX-fix, preview,
  Gemini, goi cong khai, merge, own_key), `tests/test_job_queue.mts` [6] acquireIdle, license-server `npm test` (muc "Kho hieu
  ung chung", 23 ca). Da kiem: render FxPreview that (overlay + transform), app that (HOME + user-data-dir tam) tu dung
  preview qua worker Remotion khi mo app, net.fetch multipart toi server local.
- DA TRIEN KHAI 2026-10-05: D1 remote them fx_items + trusted_licenses; deploy agent-edit-license + agent-edit-admin (admin
  co them R2 LIB); key L6b49b2c91490d05839 (…KFHEN, may Long-Macbook-Air cua tac gia) = may tin cay. Cai /Applications ban
  20261005-1100-full (selftest 21/21), ban truoc ~/.capcut-studio/app-backup-20261005-110422. App cu khong gui / nhan muc fx.
  BAY: selftest-packaged chay Python nhung -> GHI .pyc vao release/mac-arm64/*.app -> chu ky ad-hoc hong ("sealed resource
  is missing"); cai tu file .dmg (dong goi truoc selftest), kiem `codesign --verify --deep`.

### 13l. KHO NHAC NEN — nhac CC0 dong bo, Gemini nghe, B7 chon, dat SAU hook duoi giong noi (2026-10-05, `sidecar/music_lib.py`)

User: video du co SFX van nen co chut nhac nen nho de khong qua im; nhac KHONG dinh ban quyen tren TikTok / YouTube /
Reels; KHONG to lan giong nguoi noi (co cho chinh muc); Gemini phan tich de AI lap ke hoach chon dung; KHONG ap cho hook.

- GIAY PHEP (user chot 10-05): kho chung CHI nhac **CC0** (Freesound / OpenGameArt, kiem giay phep tung bai). Mixkit /
  Pixabay / YouTube Audio Library / Bensound cho dung trong video nhung CAM gom file thanh kho phat lai trong app -> khong
  dung. `publish-library.mjs` chi dua bai co `license` bat dau "CC0"; nhac user tu nhap ("Nhạc của bạn") chi o may do.
- Kho: `~/.capcut-studio/music/` + `music_library.json` {tracks, settings{auto, level_db}}. Muc: id = "m-<slug>-<sha1 file
  [:6]>", name, file, source, artist, license, source_url, duration + lufs_i (may do, ebur128), gain_db (chinh rieng
  -6..+6), disabled, nhan Gemini (summary, genre, moods, energy thap|vua|cao, tempo, bpm, instruments, has_vocals,
  speech_friendly tot|vua|kem, use_when, avoid_when, best_start (kep <= do dai - 30s), structure, tags).
- Gemini NGHE (`_GEMINI_MUSIC_PROMPT`, own_key, 3 bai / luot, ban nen mono 48 kbps o `cache/music-gemini`) qua
  `providers._gemini_analyze_videos` (step Gemini-music). Hieu nguon them `music_lib.GEMINI_NOTE` -> source.nhac_nen
  {co, muc, mo_ta} (video goc da co nhac -> AI khong chen them); `gemini_media.merge_parts` gop.
- LAP KE HOACH: KHONG them luot AI — B7 nhan them `_MUSIC_RULE` (own_key) + danh muc (`catalog_for_plan`: bai co file,
  khong tat, da co nhan, >= 20s; tat "Tu them nhac nen" -> rong) + payload `nhac_nen.nhac_nen_video_goc`; AI tra them
  `"music": {track_id, muc rat_nho|nho|vua, ly_do}` hoac track_id null + ly do. Kho rong -> system prompt + payload +
  khoa cache B7 Y HET truoc; co kho -> khoa them `music` {kho fp, prompt fp, nhac goc}. `music_lib.choose`: id hop le ->
  AI; null -> ton trong; thieu khoa / id la -> CODE chon (khop tu voi cau chuyen, uu tien speech_friendly tot, khong loi
  hat, dung nang luong theo tone). plan["music"] = {track_id, name, muc, ly_do, by ai|code}.
- DUNG (`build_spec` cuoi -> `music_lib.to_spec`): dong spec audio role "bgm" BAT DAU KHI HET HOOK (clip kind hook), fade
  in 1.2s, fade out 2s o het video; bat dau bai tu best_start; bai ngan hon -> noi lai tu best_start, cross-fade 2s.
  Muc = giong noi cua video (`_voice_lufs`, da tinh voice_boost) + min(CEIL_REL -9, level_db (thanh truot, mac dinh -15,
  -30..-8) + muc AI (-4/0/+3) + gain_db bai); do to bai = nang luong TB LUFS M doan dung (~I; giong = p90). Duong am luong
  `env` [[giay, volume]] (luoi 0.05s, rut gon sai so 0.008): dang noi = muc nen; khong loi >= 0.8s = +3 dB; meme CAT vao
  -12 dB; meme de len co tieng -6 dB; xuong nhanh 0.12s / len cham 0.5s. Khong do duoc giong -> -36 LUFS tuyet doi.
  Phan sau hook < 4s / bai mat / bai tat -> khong nhac + ghi nhat ky. `plan_rows` tinh cac doan + env, roi `premix` TRON
  SAN thanh 1 WAV 48 kHz (`cache/music-mix/bgm-<sha1>.wav`, khoa theo file + doan + env) -> spec 1 dong volume 1.0.
  LY DO (do tren render that): Remotion LAM TRON volume toi 0.01 -> nhac nen ~0.05 lech ~2 dB moi bac (sau khoang lang
  nhac nho hon truoc 2 dB du env phang); tron san: lech 0.2 dB. Tron loi -> phat tung doan voi `env` (Remotion
  `AutoEdit.envAt`, volume callback). Do render that (giong 300 Hz / nhac 2 kHz): hook im, nhac -23 dB duoi giong, khoang
  khong loi +2.6 dB, fade 2 dau.
  hook_rule / mix_sfx / speech_cut bo qua role bgm (co tu truoc); summarize: sfx khong dem bgm + `nhac_nen`.
- Dong bo: manifest `music` (1 muc = 1 file nhu SFX), `library_sync` giu gain_db / disabled cua may; license-server
  `withUrl(manifest.music, 'music')` + `/v1/lib/music/<file>`. Can deploy api + publish de may khach co kho.
- UI: Tai nguyen -> tab "Nhạc nền" (`src/pages/MusicLibrary.tsx`): bat / tat tu them nhac, thanh truot do to so voi
  giong noi, nghe thu (binh thuong + DUNG muc nen so voi giong mau -16 LUFS, `/music/preview_volume`), Gemini nghe hang
  loat / tung bai, sua "Dung khi", chinh to / nho tung bai, tat bai, nhap nhac cua ban (xoa duoc; bai CC0 chi tat).
  Route `/music/*`, IPC `music:*`, `dialog:pickMusic`; may chu media them .flac.
- 10-06 (user: video moi "khong thay co nhac nen"): plan CO nhac nhung qua nho — do: giong -15.1, nhac p90 -35.2 / trung vi
  -42.5 (bai beat thua nhip + do bai theo p90 + mac dinh -20) -> chim trong tap am quan cafe. Sua: do bai theo NANG LUONG
  TRUNG BINH LUFS M (~I), mac dinh level_db -15, tran CEIL_REL -9, khoang -30..-8; SPEC_MEDIA_VERSION 10 (du an mo lai tu
  dung lai spec, khong goi AI). Du an do: nhac +8.9 dB (p90 -26.3), SFX + clip giu nguyen.
- 10-06 (2) USER: KHONG chinh do to o kho — QUY TAC buoc lap ke hoach: nhac nen = 20% tieng nguoi (bien do = giong - 14
  dB). `plan_guard.MUSIC_VOICE_PCT` (20, sua o Prompt & quy tac nhom SFX, 5..60%) -> `music_lib.voice_pct()/rel_db()`;
  `_MUSIC_RULE` noi ro {pct}%; BO: thanh truot level_db, chinh tung bai gain_db, muc AI (rat_nho/nho/vua), tran CEIL_REL,
  nhich len o khoang khong loi (giu dung 20% suot video; chi ha khi meme co tieng + fade). UI chi con bat / tat + ghi chu
  quy tac. settings = {auto}.
- KHO DA PHAT HANH 10-05: 65 bai CC0 tai ve (agent kiem giay phep tung trang) -> Gemini nghe ca 65 -> user chon ~30 bai
  DA DUNG (bo co loi hat / de lan giong / Gemini khong nghe ro; 1 tac gia <= 8 bai) -> nen 128 kbps stereo: 30 bai 59 MB,
  danh muc B7 ~5.7k token. `npm run publish:library -- --only music` = chi day nhac, kho khac giu NGUYEN nhu R2 (luc do may
  tac gia co 10 mau Kho Text, R2 moi 8 — khong day kem). Ban 65 bai: `music_library.json.bak-65`.
- Test: `tests/test_music_lib.py` (90+ muc: kho, Gemini, danh muc, B7 kho rong y het, chon bai, dung nhac sau hook / muc /
  tran / meme / noi bai / thanh truot, dong bo, publish chi CC0, autoplan dau-cuoi); license-server smoke muc nhac nen.

### 13m. Bao ve mat XET THEO TUNG THOI DIEM (2026-10-06, `motion_design.protect_face`)
User: chu R4 ("CẮT TỪNG ĐOẠN / LÀM PHỤ ĐỀ / TÌM HÌNH ẢNH / HIỆU ỨNG ÂM THANH") qua nho, sat mep — "gan day sau nhieu lan update".
Do: R4 dat co 92 o giua nua tren (bo cuc chia doi, mat o nua duoi) -> build cuoi co 38.6, x 0.78-0.87. Nguyen nhan: protect_face
(11w, 10-03) GOP khung ca to hop x CA khoang thoi gian; 1 chu hien them 0.45s sau khi bo cuc chia doi het (video ve toan khung,
mat len cao) -> ca 4 chu bi doi + thu 42% suot 4s. Sua: (1) phan de len mat tinh TUNG thoi diem = TONG phan de cua tung phan tu
DANG HIEN (khong dung khung gop — 2 chu 2 ben mat khong con bi coi la de len mat); (2) chi de len mat o DAU / CUOI <= 0.6s
(hoac <= 25% thoi gian hien, `FACE_TRIM_MAX`) va khong o hook -> `_trim_edges` cat bot thoi gian hien CHI cua phan tu cham mat
(con >= 0.5s), giu co + vi tri; (3) con lai doi cho / thu nho nhu cu. Du an that r_muvgy9muf8ouiq: 9 lop tro lai dung co R4
(38.6 -> 92, 32 -> 62, 93.6 -> 180, 78 -> 150...). SPEC_MEDIA_VERSION 11 -> du an cu mo lai tu dung lai spec.
Test: `tests/test_face_cutout.py` test_face_guard_per_time.

### 13f. May moi: ffmpeg nhung + mac dinh AI = CLI subscription (2026-10-01)

- **ffmpeg nhung**: `scripts/bundle-ffmpeg.mjs` chep NGUYEN zip ghim (`toolchain.json -> ffmpeg`, kiem SHA)
  vao `resources/ffmpeg/` -> `Contents/Resources/ffmpeg/`. `toolchain.installFfmpeg`: may da co dung ban ->
  chep; else **ban nhung trong app** (`bundledFfmpeg()`, SHA zip khop) -> giai nen; chi khi thieu moi tai
  GitHub. Ly do: may khac tai GitHub bi "SHA-256 khong khop" (mang tra noi dung khac). Giu dang ZIP vi
  ad-hoc ky sau app co the ky lai Mach-O -> lech SHA ghim. Codex CLI (~95MB) CHUA nhung (van tai GitHub).
- **Mac dinh AI cho may moi** (khop cach tac gia dung): `plan_provider` thieu/la -> **claude**
  (`state.planProviderOf`, `config.DEFAULT_PLAN_PROVIDER`, Settings); `auth_mode` mac dinh **subscription**
  cho gemini/gpt/claude (`secrets.ts DEFAULTS`, `config.DEFAULT_PROVIDERS`) -> Doctor may moi hien
  "Gemini — Antigravity CLI", "Claude — Claude Code CLI (lap ke hoach)", "Codex CLI". Cau hinh da luu
  (secrets.enc / state.json) van thang mac dinh. Test: test_claude_planner [1], test_run_log chon RO gpt+api_key.
- **Ky + icon**: `afterPack: scripts/adhoc-sign.cjs` (ad-hoc ky sau -> het loi "bi hong" tren may tai ve);
  `afterAllArtifactBuild: scripts/dmg-seticon.cjs` (icon logo cho file .dmg). App chua notarize -> may tai
  ve lan dau: `xattr -dr com.apple.quarantine "/Applications/Agent Edit.app"` hoac System Settings > Open Anyway.

## 14. Ban WINDOWS x64 (2026-10-01)

Build TREN may Windows 10/11 x64 (`capcut-ai-studio/build-windows.ps1` -> `npm run dist:win`; huong dan nguoi dung:
`capcut-ai-studio/BUILD-WINDOWS.md`). Khong build cheo tu macOS: bytenode `.jsc` khoa theo V8 + CPU, Cython `.pyd` can MSVC.
macOS giu nguyen hanh vi (moi nhanh Windows deu co dieu kien nen tang); da kiem lai ban mac `dist:dir` = 19/19 PASS.

- Manifest `sidecar/assets/toolchain.json`: truong ngoai = macOS arm64; `platforms.win-x64` ghi de (os min build 17763,
  ffmpeg `zackees/ffmpeg_bins@df95abc v8.0/win32.zip` co zimg/vpx/x264, codex = GOI `codex-package-x86_64-pc-windows-msvc`
  (bin/codex.exe + codex-resources sandbox) -> `~/.capcut-studio/tools/codex`, trinh cai `install.ps1` cho claude / agy / uv);
  `python_embed.win-x64` = python-build-standalone 3.12.14 install_only (python.exe, co pip + include + libs/python312.lib);
  `vision_models` (5 model ONNX ghim SHA). Electron doc qua `toolchain.ts` ffSpec()/codexSpec()/installerOf()/osReq().
- `requirements.lock` co dieu kien PEP 508: pyobjc `; sys_platform == "darwin"`; Windows them colorama, pillow-heif, resvg-py
  (giai bang `uv pip compile --python-platform x86_64-pc-windows-msvc`, moi wheel cp312 win_amd64 da kiem tren PyPI).
  `scripts/toolchain.py _marker_ok` loc theo may.
- THI GIAC MAY KHONG CO VISION -> `sidecar/vision_onnx.py` (onnxruntime CPU, khong OpenCV): RVM tach nguoi (IoU 0.97-0.99
  so Vision tren video that), BiRefNet-lite tach nen anh (IoU trung vi 0.958; isnet 0.856), YuNet mat (hieu chinh khung ve
  quy uoc Vision: w/0.862, h/1.17, tam +0.093h), PP-OCR CTC 1 dong (chu = latin_PP-OCRv5, khung tung tu = PP-OCRv6_small;
  rapidocr co bo do bo sot chu Viet -> tu viet), resvg (SVG do hook), pillow-heif (HEIC thay sips). `media_vision` /
  `text_art._ocr` / `hook_rule._raster` tu chuyen khi khong import duoc Vision; `STUDIO_VISION=onnx` ep ONNX tren macOS
  (kiem thu). Khoa cache rieng (`|onnx-rvm`, `onnx-yunet`). Model nho NHUNG (`scripts/bundle-models.mjs` -> resources/models,
  win.extraResources; env STUDIO_MODELS_DIR), BiRefNet 224 MB Doctor tai (`fix: models`) -> ~/.capcut-studio/models.
- `sidecar/winsupport.py` (server.py goi install()): Windows -> subprocess CREATE_NO_WINDOW + UTF-8 (errors=replace), stdout
  UTF-8, pillow-heif; `ffbin` (ffmpeg.exe), `kill_tree` (taskkill /T thay os.killpg), `run` (het gio giet ca cay roi moi doc
  ong), `parent_alive` (Windows khong doi ppid), `node_env` (SYSTEMROOT/TEMP cho Electron-as-Node). Electron dat
  PYTHONUTF8=1 + PYTHONIOENCODING cho moi Python con (`env.augmentedEnv`).
- GIOI HAN DONG LENH 32K (Windows): Claude `--system-prompt-file` (R4 ~30K ky tu); agy prompt qua STDIN
  `--input-format stream-json --output-format stream-json -p=` voi dong `{"event":"user","message":{"content":...}}`, ket qua
  dong `{"event":"result","result":{...}}` (`_agy_argv`/`_agy_result`; da goi that 2026-10-01: video thu doc dung, viewed=1).
- Electron: `env.ts` (PATH dung `path.delimiter` + khoa `Path`, findIn/exeName theo PATHEXT, needsShell .cmd, killTree,
  systemTar), dang nhap agy / Claude = cua so PowerShell rieng chay .ps1 UTF-8 CO BOM (`cli-login.ts`), titleBarOverlay
  (3 nut cua so, header chua 150px), single-instance lock, Menu null, AppUserModelId, compositor `win32-x64-msvc`
  (`remotion-worker.ts` — sai ten = moi lan render loi), kill cay khi huy render / tat sidecar, so sanh duong dan khong
  phan biet hoa thuong (media-server, myinstants, `src/lib/projectMedia.ts`), NTFS khong clone (project-media), shell:openPath
  chi mo THU MUC, luu video vao `app.getPath('videos')`. UI: `src/lib/platform.ts` (Terminal->PowerShell, Finder, Keychain->DPAPI,
  fileUrl). Doctor: dong `os` (Windows), bo avconvert, dong Vision -> "Thi giac may (model ONNX)" + fix `models`.
- Build: `bundle-python.mjs` (tar System32, xoa __pycache__ bang JS, KEM vcruntime140*/msvcp140* tu VS Redist — ban PBS khong
  kem, may moi thieu -> python/onnxruntime khong nap), `compile-sidecar.mjs` (.pyd), `bundle-ffmpeg.mjs` theo nen tang,
  electron-builder `win` (NSIS cai cho RIENG user, tieng Viet 1066, icon `build/icon.ico` tu `make_icon.py`), `build-windows.ps1`
  giai nen truoc winCodeSign-2.6.0 bo thu muc darwin (loi "Cannot create symbolic link" khi chua bat Developer Mode).
- Tu kiem: `scripts/selftest-packaged.mjs` (HOME/USERPROFILE tam + --user-data-dir): Doctor tu cai ffmpeg + Chrome, sidecar
  .pyd, tach nguoi WebM, mat, OCR, SVG, hop cach ly FX, /health, render MP4 tieng Viet. Test: `tests/test_windows_port.py`
  (gia lap nhanh Windows; `STUDIO_MODELS_DIR=<model>` chay model that), test_toolchain.py/.mts [win-x64], test_project_media.mts [8].
- DANG NHAP agy / Claude NGAY TRONG APP (2026-10-01, ca macOS + Windows, user yeu cau "giong Codex"): `cli-login.ts`
  `startAgyLogin` = `agy -p "..." --output-format json` chay an (chua co phien -> agy tu bat dau OAuth, mo trinh duyet,
  cho ket qua qua localhost; KHONG dat SSH_* — bien do bat che do in link + dan ma), thay file phien -> dung agy ngay
  (`doneWhen`); `startClaudeLogin` = `claude auth login --claudeai` an (tu mo trinh duyet, nhan qua localhost). UI: o "Dan ma"
  (`settings:cliLoginInput` -> stdin) + nut mo link; cua so Terminal / PowerShell cu thanh du phong (mode 'device').
  Test `tests/test_cli_login.mts` (CLI gia).
  SUA 10-01 sau khi thu that tren Windows: (1) agy `-p` KHONG tu mo trinh duyet va tren Windows ghi link / doc ma qua
  CONSOLE cua no (khong qua ong dan) -> Windows chay `agy` giao dien day du trong cua so THU NHO (Start-Process
  -WindowStyle Minimized, tu mo trinh duyet), co file phien thi tu dong; macOS giu `-p` + app tu mo link agy in ra.
  (2) Claude bao "dang dung API key" du da dang nhap: may co bien router (ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL, vd
  9Router) -> `auth status` ra "oauth_token". App BO cac bien nay cho tien trinh claude (`_claude_env` / `claudeEnv`);
  router dat trong ~/.claude/settings.json -> nhan phien Claude.ai trong .credentials.json (`claudeAiOauth`).
- agy 1.2.16 (2026-10-03, may Mac khac bao "authentication required. Run 'agy' to log in"): `agy -p` chi bat dau dang nhap
  Google khi CO TTY; qua ong dan thi bao loi roi thoat ngay. macOS: `runTask({pty:true})` chay CLI qua
  `/bin/bash -c 'exec /usr/bin/script -q /dev/null /bin/sh -c "stty rows 40 cols 120; exec agy ..." < <(cat)'` — script doi
  stdin la pipe(2) THAT (ong 'pipe' cua Node = socket, FIFO deu bi tu choi "tcgetattr/ioctl"), pty 0x0 lam giao dien day
  du khong ve gi (-> stty), giet script KHONG giet agy (-> `pkill -P` truoc, `stopChild`). Giao dien day du `agy` (khong -p)
  tu 1.2.16 hoi "Select login method" (Enter = Google OAuth) -> Windows: cua so agy de HIEN (khong thu nho) + huong dan bam
  Enter; Terminal du phong cung them buoc nay.
- DANG XUAT agy TU 2026-10-06: KHONG chay `agy -i /logout` nua — may chua tung mo giao dien day du cua agy (app chi goi
  `agy -p`) thi agy hien man hinh chao lan dau ("Choose your color scheme" ...) thay vi "Are you sure...", app cho 90s roi
  bao "Da huy dang xuat" (su co that Mac + Windows may khach; do lai tren may dev bang pty, khong xac nhan). Nay
  `startAgyLogout` xoa thang muc phien go-keyring: macOS `security delete-generic-password -s gemini -a antigravity` (muc do
  /usr/bin/security tao -> khong hoi quyen, da thu bang muc gia), Windows `cmdkey /delete` muc `gemini:antigravity` (+ *jetski*),
  du phong CredDeleteW qua PowerShell (CHUA thu tren Windows that) + file phien cu. Chi xoa tren may, khong goi "sign out"
  len Google. Sidecar `/cli_status {fresh:true}` bo cache 2s Keychain / cmdkey de doc trang thai that ngay sau khi xoa.
  Phan duoi la cach cu (lich su):
- DANG XUAT (2026-10-03, user yeu cau de doi tai khoan): nut "Dang xuat" trong CliPanel khi da dang nhap ->
  `settings:cliLogout` -> `startCliLogout`: `codex logout`, `claude auth logout` (claudeEnv), agy `/logout`. agy CHAN
  `/logout` o `-p` ("clears stored credentials") -> `agy -i /logout` giao dien day du: macOS trong pty, app tu tra loi cac
  cau hoi nhan dang terminal (khong tra loi -> agy treo), hoi tin cay thu muc (Enter) va "Are you sure you want to sign
  out?" (y + Enter); Windows trong cua so agy, nguoi dung tu go y. Xong = muc Keychain / Credential Manager mat
  (`agyCredentialPresent`, khong cache) -> dung agy, xoa file `antigravity-oauth-token` cu + `keyring-marker*` con sot.
  Thanh cong chi khi sidecar `cli_status` xac nhan het phien. Test: `tests/test_cli_login.mts` [4].
  CHUA chay `/logout` that (may dev dang dang nhap that; /logout bao "Signed out from server" -> khong thu bang ban sao token).
- CHONG agy DOI CACH DANG NHAP KHI TU CAP NHAT (2026-10-03, user chon): (1) `AGY_CLI_DISABLE_AUTO_UPDATE=true` trong
  `env.augmentedEnv` (sidecar ke thua) + `cli_providers._augmented_env` + file Terminal / PowerShell du phong — agy CHI nhan
  dung "true" ("1"/"yes"/"on" van "Spawned background update process", da do log auto_updater). May cai moi van lay ban moi
  nhat; `agy` nguoi dung tu chay trong Terminal van tu cap nhat. (2) `toolchain.json cli.agy.tested` = ban da kiem dang nhap /
  dang xuat; loi dang nhap / dang xuat Gemini -> `agyFailureText` (ipc): cau de hieu thay JSON tho + neu ban agy may nay KHAC
  ban da kiem: noi ro 2 ban + chi cach Terminal (dang nhap) / `agy` -> `/logout` (dang xuat). Kiem ban agy moi (HOME tam +
  sandbox-exec chan /usr/bin/open + Keychain, xem bo nho) xong thi nang `tested`. Test `tests/test_cli_login.mts` [5].
- CHUA kiem tren may Windows that (khong co may): ten file phien dang nhap agy tren Windows (chap nhan *oauth*token*), sandbox
  Codex Windows khi tao anh (co du phong lay anh tu ~/.codex/generated_images), SmartScreen / Smart App Control (app chua ky so).

## 12. CodeGraph

CodeGraph `0.9.9` da duoc cai va index tai root workspace:

- Local index: `.codegraph/codegraph.db`.
- Project MCP config: `.mcp.json`.
- Codex MCP config: `~/.codex/config.toml`.
- Antigravity MCP config: `~/.gemini/config/mcp_config.json`.
- Persistent agent instructions: `AGENTS.md`.

Chat/agent moi nen dung `codegraph_explore` cho cau hoi kien truc va call flow,
`codegraph_impact` truoc thay doi co blast radius lon, va `codegraph_status` de
kiem tra index. Sidecar MCP tu dong sync khi source thay doi.

CLI fallback:

```bash
codegraph status
codegraph sync
codegraph index --force
```
