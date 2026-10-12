---
name: agent-edit
description: 'Dựng và edit video bằng AI với Agent Edit (cắt khoảng lặng, hook mạnh, phụ đề karaoke, chữ hiệu ứng, ảnh AI, SFX, nhạc nền) rồi xuất MP4 dọc 9:16 hoặc ngang 16:9. Dùng khi người trực muốn làm video TikTok, Reels, Shorts hay video quảng cáo từ file video có sẵn, edit lại một video, thêm phụ đề hoặc hiệu ứng, làm theo phong cách một video mẫu, chèn ảnh sản phẩm hay logo lên video, hoặc hỏi tiến độ và kết quả của việc tạo video đang chạy.'
license: Proprietary
compatibility: 'macOS 14 trở lên (Apple Silicon hoặc Intel) hoặc Windows 10 (1809+) / 11 64-bit. Cần key bản quyền Agent Edit và chat bật Toàn quyền.'
allowed-tools: Bash Read
metadata:
  ten: Dựng video AI (Agent Edit)
  loai: cong-cu
  tac-gia: Agent Edit
---

# Dựng video AI — Agent Edit

Bạn điều khiển **Agent Edit** (phần mềm dựng video bằng AI trên máy này) qua dòng lệnh `agent-edit`. Không có giao
diện: AI phân tích video, lập kế hoạch dựng, render ra MP4 — giống hệt bấm trong app Agent Edit. Bạn chỉ cần gom yêu cầu
của người trực, chạy lệnh, theo dõi và báo kết quả.

## 1. Điều kiện

- Chat phải bật **Toàn quyền** (để chạy script). Lệnh không chạy được do thiếu quyền → nhắn người trực bật Toàn quyền
  cho chat này rồi thử lại.
- Máy **macOS 14 trở lên** (script tự chọn bản Apple Silicon / Intel) hoặc **Windows 10 (1809+) / 11 64-bit**. Script tự
  cài đúng bản cho máy đang chạy.

## 2. Gọi lệnh

Script nằm trong thư mục `scripts/` của kỹ năng này (Claude Code báo đường dẫn ở dòng "Base directory for this skill";
không rõ thì là `~/.gettime/skills/agent-edit` — Windows: `%USERPROFILE%\.gettime\skills\agent-edit`). **Chọn theo hệ điều
hành** (xem `uname -s` hoặc biến `OS`):

| Máy | Lệnh gọi (gọi tắt là `AE` trong tài liệu này) |
|---|---|
| macOS | `bash "<thư mục kỹ năng>/scripts/agent-edit"` |
| Windows | `powershell -NoProfile -ExecutionPolicy Bypass -File "<thư mục kỹ năng>\scripts\agent-edit.ps1"` |

Ví dụ: macOS `bash "$DIR/scripts/agent-edit" status --json` · Windows (trong Git Bash / PowerShell)
`powershell -NoProfile -ExecutionPolicy Bypass -File "$DIR\scripts\agent-edit.ps1" status --json`. Mọi lệnh và tham số bên
dưới giống hệt nhau trên 2 hệ điều hành; đường dẫn file trên Windows dạng `C:\Users\...\video.mp4`.

- Luôn thêm `--json` rồi đọc kết quả JSON (thông báo phụ in ra stderr, bỏ qua được).
- Đặt thời gian chờ của lệnh Bash là **600000 ms** (10 phút).
- Mã thoát: `0` xong · `1` lỗi · `2` sai lệnh / máy chưa đủ điều kiện · `3` việc còn đang chạy · `130` đã huỷ.

## 3. Lần đầu trên máy (cài đặt)

1. `AE status --json`
   - Báo **"Máy chưa cài Agent Edit"** hoặc bản quá cũ → hỏi người trực **key bản quyền Agent Edit**, rồi chạy
     `AE setup --key <KEY> --json`. Lệnh này tự tải + cài app đúng máy (~300 MB; Windows cài im lặng cho riêng tài khoản,
     không cần quyền admin), kích hoạt key, cài toàn bộ công cụ
     (Whisper, trình render, Codex, Claude Code, Antigravity CLI… ~1 GB) và đồng bộ kho SFX / nhạc / mẫu chữ.
     Lần đầu có thể mất 5–20 phút. Lệnh Bash bị cắt vì quá giờ → **chạy lại đúng lệnh đó**, nó tải tiếp chỗ dở.
   - `ready: true` → sẵn sàng, sang mục 4.
2. `next` có `agent-edit login gemini` / `login claude` / `login codex` → chạy `AE login gemini --json` (lần lượt
   từng cái). Trình duyệt mở **trên máy này**: nhắn người trực đăng nhập tài khoản trong trình duyệt rồi đợi lệnh xong.
   Gemini = tài khoản Google (hiểu video), Claude = tài khoản Claude (lập kế hoạch), Codex = ChatGPT (ảnh AI, không bắt
   buộc). Dùng API key thay đăng nhập: `AE config --gemini-key <KEY>` / `--claude-key <KEY>`.
3. `next` có `agent-edit activate <KEY>` → hỏi key rồi `AE activate <KEY> --json`. Mỗi key dùng cho **1 máy**
   (dùng chung với app Agent Edit trên cùng máy). Báo "đã kích hoạt trên máy khác" → người trực liên hệ người bán.

Không bao giờ nhắc lại nguyên văn key trong câu trả lời.

## 4. Tạo video

1. **Gom yêu cầu** (hỏi lại phần thiếu quan trọng, phần không bắt buộc thì để trống):
   - **Video nguồn** (bắt buộc, 1 hoặc nhiều file): đường dẫn tuyệt đối. File người trực gửi trong chat → dùng đường dẫn
     thật của file đó. Không bịa đường dẫn — kiểm bằng `ls -la "<đường dẫn>"` trước.
   - **Mục đích / nội dung** (`--request`), **phong cách** (`--style`), **người xem** (`--audience`), **độ dài mong muốn**
     (`--duration`, vd "45-60 giây").
   - **Video mẫu** để bắt chước phong cách (`--reference`), **ảnh / video chèn lên** (`--insert`), **video ngang**
     (`--landscape`, mặc định dọc 9:16), **thư mục lưu** (`--out`).
2. **Chạy** (trả mã việc ngay, video dựng nền 10–40 phút):

   ```bash
   AE make --video "/Users/a/Desktop/goc.mp4" --request "Giới thiệu sản phẩm, hook mạnh, giọng vui" \
     --duration "dưới 60 giây" --out "/Users/a/Desktop/Video xong" --json
   ```

   → `{"ok": true, "id": "r_…"}`. Báo người trực ngay: **đã nhận video, bắt đầu dựng** (thường 10–40 phút) + mã việc.
3. **Báo tiến độ từng bước**: gọi `AE wait <id> --until-change --json`. Lệnh trả về **ngay khi việc sang bước mới**
   (hoặc xuất thêm 25%, hoặc tối đa 9 phút). Mỗi lần trả về mà còn chạy (`status` = `running` / `queued`, mã thoát 3)
   → nhắn người trực **1 dòng ngắn** theo bảng dưới (bỏ qua nếu trùng dòng vừa báo), rồi gọi lại **đúng lệnh đó** ngay.
   Lặp tới khi `status` là `done` / `error` / `cancelled`.

   | `step` | Báo người trực |
   |---|---|
   | `prepare` | Đang chuẩn bị (kiểm tra bản quyền, công cụ) |
   | `import` | Đã nhận video, đang chép vào dự án |
   | `analyze` | Đang phân tích video (AI xem và nghe video) |
   | `plan` | Đang lên kịch bản và dựng video |
   | `render` | Đang xuất video MP4 — `progress` × 100 % |
   | `finish` | Sắp xong, đang hoàn tất |

   `waiting` khác `null` → "Đang chờ lượt (có video khác đang chạy)". Kết quả **không có trường `changed`** → app trên
   máy là bản cũ chưa hỗ trợ: vẫn làm như trên (mỗi lần chờ tối đa 9 phút), xong video thì chạy `AE update --json`.
   Lượt chat kết thúc trước khi xong cũng không sao: việc vẫn chạy nền, lần sau xem bằng `wait` / `job` / `jobs`.
4. **Xong** (`status: done`) → báo `result.copy` (nếu có `--out`) hoặc `result.output`, kèm thời lượng (`result.duration`
   giây), khổ hình, dung lượng, và từng dòng trong `result.warnings`. Video cũng hiện trong app Agent Edit → "Video đã tạo".
5. **Lỗi** (`status: error`) → nói ngắn gọn `error.message` và làm theo `error.hint` (đăng nhập AI, kích hoạt key, kiểm
   tra file…), rồi chạy lại `make` y như cũ — phần phân tích đã xong được dùng lại, không tốn lại AI.

### Tuỳ chọn của `make`

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--video <file>` | Video nguồn (lặp lại cho nhiều video, ghép theo nội dung) |
| `--request "<text>"` | Mục đích / nội dung / yêu cầu edit (quan trọng nhất) |
| `--style`, `--audience`, `--duration` | Phong cách, người xem, độ dài mong muốn |
| `--reference <file>` | Video mẫu: bắt chước nhịp cắt, chữ, hiệu ứng |
| `--insert <ảnh/video>` | Tư liệu chèn lên video (sản phẩm, logo, bảng giá…), lặp lại được |
| `--insert-note "<text>"` | Ghi chú cho tư liệu cùng thứ tự: là gì, chèn lúc nói tới gì |
| `--insert-use show\|ai_ref\|both` | `show` chèn thẳng (mặc định) · `ai_ref` chỉ làm mẫu cho ảnh AI · `both` |
| `--insert-placement auto\|overlay\|cutout\|split\|fullscreen` | Cách hiện tư liệu (mặc định `auto`) |
| `--landscape` | Video ngang 16:9 (mặc định dọc 9:16) |
| `--brand-colors "#hex…"`, `--brand-typography "<font>"` | Màu / font thương hiệu (tuỳ chọn) |
| `--out <thư mục>`, `--name "<tên>"` | Chép video xong ra thư mục, đặt tên file |
| `--fresh` | Phân tích lại video (bỏ phân tích đã lưu) — chỉ khi người trực muốn làm lại từ đầu |
| `--new-plan` | Lập kế hoạch mới (ra bản dựng khác) — khi người trực chê bản trước, muốn làm lại |

Nhiều tư liệu: ghép theo thứ tự, vd
`--insert a.png --insert-note "logo, hiện cuối video" --insert b.jpg --insert-note "chai serum, khi nói tới sản phẩm"`.

## 5. Lệnh khác

| Lệnh | Dùng khi |
|---|---|
| `AE jobs --json` | Liệt kê việc gần đây (mã, trạng thái, file kết quả) |
| `AE job <id> --json` | Xem 1 việc |
| `AE cancel <id> --json` | Huỷ việc đang chạy |
| `AE status --json` | Kiểm tra bản quyền, công cụ, đăng nhập AI |
| `AE doctor --fix --json` | Tự cài lại công cụ bị thiếu / hỏng |
| `AE sync --json` | Đồng bộ kho SFX / nhạc nền / mẫu chữ / hiệu ứng |
| `AE update --json` | Cập nhật Agent Edit (đóng app Agent Edit trước; đợi ~30 giây rồi chạy `version`) |

## 6. Lưu ý

- Chỉ chạy `make` khi người trực thật sự muốn tạo video. Nhiều video cùng lúc vẫn được: việc sau tự chờ lượt.
- Không tự thêm `--fresh` / `--new-plan`, không sửa hay xoá file trong `~/.capcut-studio`.
- Báo kết quả ngắn gọn bằng tiếng Việt: đường dẫn file video, thời lượng, ghi chú nếu có. Không dán JSON thô cho người trực.
