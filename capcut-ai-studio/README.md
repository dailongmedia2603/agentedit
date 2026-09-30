# Agent Edit (macOS) — dựng video bằng Remotion

Ứng dụng desktop: thả video nguồn vào, AI đọc hiểu và lập kế hoạch dựng, app dựng video hoàn toàn
bằng code (Remotion), xem trước và xuất MP4 1080×1920 ngay trong app — không cần cài CapCut.

> Tên hiển thị đổi thành **Agent Edit** (2026-09-26, trước đó là "Auto CapCut"). Tên NỘI BỘ vẫn giữ:
> `name: "auto-capcut"` trong package.json (Electron dùng cho thư mục `~/Library/Application Support/auto-capcut`
> chứa khoá API đã mã hoá + mục Keychain "auto-capcut Safe Storage"), `appId`, thư mục dữ liệu
> `~/.capcut-studio` — đổi các thứ này là mất khoá API / dự án. Icon: `build/make_icon.py` từ
> `build/logo-agent-edit.png`. Luồng dựng draft CapCut đã được gỡ ngày 2026-09-26; bản mã nguồn trước
> khi gỡ nằm ở `~/.capcut-studio/source-backup-20260926-before-remove-capcut/`.

## Kiến trúc
- **Shell**: Electron + React + TypeScript + Tailwind (tông cam). Bản đóng gói `.dmg` arm64.
- **Sidecar**: Python (Flask) chạy bằng venv trong `~/.capcut-studio/state.json` → `venv_python`.
  Gọi AI (Gemini hiểu video, GPT lập kế hoạch), quản lý kho SFX / meme / thư viện phân tích, dựng
  `RenderSpec` từ plan (`remotion_plan.build_spec`).
- **Render**: `@remotion/renderer` trong utilityProcess của Electron (`electron/remotion-worker.ts`),
  xem trước bằng `@remotion/player`. Composition nằm ở `remotion-src/`.
- **Bảo mật khoá**: Electron `safeStorage` (mã hoá qua Keychain), không lưu plaintext.
- **Hai cách kết nối Gemini và GPT**: API key, **hoặc** tài khoản đăng nhập trên máy qua CLI chính chủ
  (Antigravity CLI `agy` – tài khoản Google, kể cả AI Pro/Ultra; Codex CLI – ChatGPT Plus/Pro) — xem mục dưới.
- **Video gửi Gemini**: luôn nén 720p (giữ tiếng); bản nén vẫn > 20 MB thì cắt nhiều phần **theo dung
  lượng** rồi ghép lại (`sidecar/gemini_media.py`).
- **Video HDR (iPhone)**: tự tạo một bản làm việc SDR (màu như trong Ảnh / QuickTime, qua `avconvert`) và
  mọi khâu — xem trước, render, tách người, gửi Gemini — dùng chung bản đó (`sidecar/media_sdr.py`).
- **Video nằm trong dự án**: video nguồn / video mẫu thêm vào được chép vào thư mục riêng của dự án
  (clone APFS — tức thì, không tốn thêm dung lượng); chuyển hay xoá file gốc dự án vẫn còn nguyên. Dự án
  cũ tự chuyển khi mở; file đã mất thì báo và cho chọn lại.
- **Cắt đúng lúc hết lời**: chỗ nhảy cảnh không cắt giữa chữ / giữa câu, điểm cắt đặt sau khi tiếng thật
  đã tắt (đo độ to âm thanh, không tin mốc Whisper); chữ / hình nhảy ra (và SFX của nó) hiện ngay trước
  khi từ đó được nói (`sidecar/speech_cut.py`).

## Luồng người dùng
1. **Doctor** (tự chạy khi mở app): dò & cài uv/Python 3.12 và venv của sidecar (flask, requests,
   numpy, Pillow, Vision), trạng thái kết nối Gemini + GPT.
2. **Cài đặt API**: Gemini (API key hoặc tài khoản Google qua Antigravity CLI) và GPT (API key hoặc gói
   subscription qua Codex CLI). Cài CLI và đăng nhập được ngay trong app.
3. **Video Remotion**: kéo-thả video nguồn → Gemini hiểu (+ Whisper căn giờ lời nói) → video mẫu
   (tuỳ chọn, GPT qua Codex CLI) → GPT lập kế hoạch (B1 chất liệu → B2 timeline → B3 hook →
   R4 thiết kế → R5 phụ đề → B6 meme → B7 SFX) → xem trước → Render MP4.
4. **Kho âm thanh / Kho meme**: SFX và clip meme để AI chèn vào đúng lúc.
5. **Prompt & quy tắc**: sửa prompt từng bước và các thông số của lớp bảo vệ plan.
6. **Video đã tạo**: xem lại / mở lại các dự án Video Remotion.

## Chạy bằng tài khoản đăng nhập trên máy (không tốn tiền API)
Sidecar gọi **CLI chính chủ đã đăng nhập sẵn trên máy** ở chế độ headless — phiên đăng nhập nằm
trong CLI, app không đọc / ghi file đăng nhập.

| Provider | CLI | Cài | Đăng nhập |
|---|---|---|---|
| GPT | Codex | `npm i -g @openai/codex` | `codex login` (chọn *Sign in with ChatGPT*) |
| Gemini | Antigravity CLI (`agy`) | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | chạy `agy` trong Terminal, đăng nhập Google |

Trong app: **Cài đặt API → Gemini/GPT → chọn chế độ CLI** → nút **Cài … tự động** (npm) → nút
**Đăng nhập Google (mở Terminal) / Đăng nhập bằng ChatGPT** → **Kiểm tra kết nối**. Đăng nhập trong app
= đăng nhập của CLI trên máy (dùng chung với Terminal). Phân tích video mẫu và tạo ảnh AI luôn đi qua Codex CLI.

Lưu ý:
- **Gemini CLI không còn nhận tài khoản cá nhân từ 18/06/2026** (kể cả AI Pro) → app dùng Antigravity CLI.
  agy là agent: Gemini xem video qua công cụ `view_file` (≤ 100 MB/file); app luôn nén + cắt trước, và
  báo lỗi nếu model không thật sự mở video. Mỗi lượt chậm hơn API (prompt Hiểu nguồn: ~2–3 phút/lượt với
  Gemini 3.1 Pro High). Chạy tối đa 2 lượt cùng lúc để tránh chạm giới hạn của tài khoản cá nhân.
- Hết hạn mức thì app báo rõ là hết hạn mức; tạm chuyển provider đó về API Key rồi chạy tiếp.

## Build từ source
```bash
export PATH="$HOME/.local/node/bin:$PATH"   # Node 20 LTS
npm install
npm run build            # electron-vite build + đóng gói composition Remotion (out/remotion-bundle)
npm run dist             # đóng gói .dmg (release/)
```
Yêu cầu: Node 20 (npm 10). Chạy electron từ terminal của IDE thì `unset ELECTRON_RUN_AS_NODE` trước.

## Tự kiểm
```bash
# Test Python (HOME tạm để không đọc/ghi dữ liệu thật)
HOME=$(mktemp -d) <venv_python> tests/test_remotion_plan.py     # (tương tự các tests/test_*.py khác)

# Render thử qua chính stack Electron (dev hoặc bản đóng gói)
STUDIO_REMOTION_RENDER=spec.json STUDIO_REMOTION_OUT=out.mp4 <app binary>

# Doctor không mở UI
STUDIO_DOCTOR=1 <app binary>
```

## Giới hạn (trung thực)
- **AI** cần kết nối của bạn (Gemini: API key hoặc tài khoản Google; GPT: API key hoặc gói ChatGPT).
- **Code signing**: build unsigned. Lần đầu mở: chuột phải → Open, hoặc
  `xattr -dr com.apple.quarantine "/Applications/Agent Edit.app"`.
- **Remotion license**: miễn phí cho cá nhân / công ty ≤ 3 người.
