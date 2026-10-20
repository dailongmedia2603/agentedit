---
name: agent-edit
description: 'Dựng và edit video bằng AI với Agent Edit (cắt khoảng lặng, hook mạnh, phụ đề karaoke, chữ hiệu ứng, ảnh AI, SFX, nhạc nền) rồi xuất MP4 dọc 9:16 hoặc ngang 16:9. Dùng khi người trực muốn làm video TikTok, Reels, Shorts hay video quảng cáo từ file video có sẵn, edit lại một video, thêm phụ đề hoặc hiệu ứng, làm theo phong cách một video mẫu, chèn ảnh sản phẩm hay logo lên video, cài đặt / đăng nhập Agent Edit, hoặc hỏi tiến độ và kết quả của video đang dựng.'
license: Proprietary
compatibility: 'macOS 14 trở lên (Apple Silicon hoặc Intel) hoặc Windows 10 (1809+) / 11 64-bit. Cần key bản quyền Agent Edit. Chạy ở mức chat thường qua tool.json — không cần Toàn quyền.'
metadata:
  title: Dựng video AI (Agent Edit)
  kind: tool
  author: Agent Edit
  version: 2.0.0
---

# Dựng video AI — Agent Edit

Bạn điều khiển **Agent Edit** (phần mềm dựng video bằng AI trên máy này) qua các công cụ `agent-edit__…` của app GetTime.
AI của Agent Edit tự phân tích video, lên kịch bản dựng và xuất MP4. Việc của bạn: gom yêu cầu của người trực, gọi đúng
công cụ, báo kết quả. Bạn không có shell — chỉ gọi các công cụ dưới đây.

| Công cụ | Dùng khi |
|---|---|
| `gettime_check_tool` (skill `agent-edit`) | Luôn gọi **đầu tiên**: máy đã sẵn sàng tạo video chưa |
| `gettime_ask_field` (skill `agent-edit`, field `license-key`) | Cần key bản quyền mà chưa có — hiện ô nhập trong chat |
| `agent-edit__setup` | Cài / cập nhật app, kích hoạt key, cài công cụ còn thiếu (việc dài 5–20 phút) |
| `agent-edit__login` · `agent-edit__login-code` · `agent-edit__login-check` | Đăng nhập tài khoản AI (`gemini`, `claude`; `codex` tuỳ chọn) |
| `agent-edit__make` | Dựng video (việc dài 10–40 phút; xong thì video hiện thành thẻ trong chat) |
| `agent-edit__jobs` | Xem các việc gần đây (mã, trạng thái, file video, lỗi) |
| `agent-edit__update` | Cập nhật Agent Edit lên bản mới nhất |

Việc dài (`setup`, `make`, `update`) trả lời ngay "đã nhận". App GetTime tự theo dõi, hiện thẻ tiến độ và báo kết quả vào
chat. **Không gọi lại để chờ, không hỏi tiến độ liên tục.** Báo người trực một câu là đã bắt đầu, rồi kết thúc lượt.

## 1. Kiểm tra trước mọi việc

Gọi `gettime_check_tool` (skill `agent-edit`). Trả lời "Sẵn sàng." → sang mục 3. Chưa sẵn sàng → đọc kết quả (`next`,
`missing`, `message`) rồi xử lý theo thứ tự:

1. **Máy chưa cài / bản quá cũ** (`installed: false` hoặc `next` chỉ có `setup`):
   - Thiếu trường **license-key** ("Trường chưa nhập: Key bản quyền…") → gọi `gettime_ask_field` (skill `agent-edit`,
     field `license-key`), nhắn "Anh/chị nhập key bản quyền Agent Edit vào ô bên dưới giúp em" rồi **kết thúc lượt**. Khi
     app báo "Đã lưu …" → gọi `agent-edit__setup`.
   - Đã có key → gọi `agent-edit__setup`.
2. **Chưa kích hoạt key** (`next` có "setup (kích hoạt key bản quyền)") → như trên: thiếu key thì hỏi bằng
   `gettime_ask_field`, có rồi thì `agent-edit__setup`.
3. **Thiếu công cụ** (`next` có `setup`, `missing` liệt kê công cụ) → `agent-edit__setup`.
4. **Chưa đăng nhập AI** (`next` có `login gemini`, `login claude`, `login codex`) → mục 2, lần lượt từng tài khoản.
   `login codex` là tuỳ chọn (cho ảnh AI): hỏi người trực có muốn không, không thì bỏ qua.
5. `next` nói **API key** Gemini / Claude → bảo người trực nhập API key trong app Agent Edit (Cài đặt API), hoặc đổi
   sang đăng nhập tài khoản ở đó.
6. `installing` có mã việc → đang cài dở, chỉ báo người trực là đang cài và chờ thẻ tiến độ.

`setup` xong, app tự gửi tiếp vào chat → gọi lại `gettime_check_tool` để làm bước kế (thường là đăng nhập).
`setup` lỗi → báo ngắn lỗi, làm theo gợi ý (sai key → hỏi lại key bằng `gettime_ask_field`; app đang mở → nhờ người
trực đóng app Agent Edit) rồi gọi lại `setup`.

**Không bao giờ** bảo người trực dán key vào chat, không nhắc lại key. Mỗi key dùng cho **1 máy** (dùng chung với app
Agent Edit trên máy này). Báo "đã kích hoạt trên máy khác" → người trực liên hệ người bán.

## 2. Đăng nhập tài khoản AI

1. Gọi `agent-edit__login` với `account` (`gemini` | `claude` | `codex`). Kết quả:
   - `status: "done"` hoặc `already: true` → đã đăng nhập, sang tài khoản kế.
   - Có `url` / `lines` → nhắn người trực theo bảng dưới rồi **kết thúc lượt** để chờ họ:

     | Tài khoản | Nhắn người trực |
     |---|---|
     | `claude` | Trình duyệt đã mở trang đăng nhập Claude trên máy này (hoặc mở link `url`). Đăng nhập xong: trang hiện **mã** thì gửi mã cho em; trang báo thành công thì nhắn "xong". |
     | `gemini` | Trình duyệt đã mở trang đăng nhập Google trên máy cài Agent Edit — đăng nhập ngay trên máy đó rồi nhắn "xong". Windows: làm đúng `message` (bấm Enter trong cửa sổ Antigravity). |
     | `codex` | Nếu người trực không ngồi ở máy cài Agent Edit: gọi lại với `device: true`, gửi link + mã thiết bị trong `lines`. Đăng nhập xong nhắn "xong". |

   - `status: "running"` mà chưa có link → gọi `agent-edit__login-check` sau vài giây để lấy link.
2. Người trực gửi **mã** → `agent-edit__login-code` (`account`, `code` nguyên văn). Nhắn "xong" →
   `agent-edit__login-check`. `done` → báo đã đăng nhập · `running` → còn chờ, nhắc lại bước trên · `error` / `none` →
   báo lỗi rồi gọi lại `agent-edit__login`.
3. Hết tài khoản cần đăng nhập → `gettime_check_tool` lần nữa → "Sẵn sàng." → báo "Sẵn sàng tạo video".

## 3. Dựng video

1. **Gom yêu cầu** (hỏi lại phần thiếu quan trọng; phần không bắt buộc thì bỏ trống):
   - **Video nguồn** (bắt buộc): tệp người trực **gửi vào chat này**. Công cụ chỉ nhận tệp nằm trong thư mục của chat — tệp
     ở chỗ khác trên máy thì nhờ người trực kéo / đính kèm tệp vào chat. Dùng đúng đường dẫn tuyệt đối của tệp đính kèm,
     không bịa đường dẫn.
   - `request`: mục đích / nội dung / yêu cầu edit (quan trọng nhất). `style`, `audience`, `duration` (vd "45-60 giây").
   - `reference`: video mẫu để bắt chước phong cách. `inserts`: ảnh / video chèn lên (sản phẩm, logo, bảng giá…) kèm
     `insert_notes` — **mỗi dòng ghi chú cho một tệp, đúng thứ tự `inserts`** (là gì, chèn lúc nói tới gì), vd
     `"logo, hiện cuối video\nchai serum, khi nói tới sản phẩm"`.
   - `landscape: true` cho video ngang 16:9 (mặc định dọc 9:16). `brand_colors`, `brand_typography`, `name` tuỳ chọn.
2. Gọi `agent-edit__make`. Báo người trực: **đã nhận video, bắt đầu dựng (thường 10–40 phút)** — thẻ tiến độ hiện trong
   chat, xong thì video hiện ở đây. Kết thúc lượt.
3. **Xong**: app tự đưa video vào chat. Nếu người trực hỏi chi tiết → `agent-edit__jobs` (thời lượng, file). Video cũng có
   trong app Agent Edit → "Video đã tạo".
4. **Lỗi**: báo ngắn lỗi và làm theo gợi ý: bản quyền / "activate" → mục 1 (`setup`); "login" / đăng nhập → mục 2; thiếu
   công cụ → `setup`; tệp không đọc được → nhờ gửi lại tệp. Sửa xong gọi lại `make` y như cũ — phần phân tích đã xong được
   dùng lại, không tốn lại AI.
5. Người trực chê bản vừa dựng, muốn bản khác → gọi lại `make` với `new_plan: true`. Muốn phân tích lại video từ đầu →
   `fresh: true`. **Không tự thêm** hai cờ này.

Nhiều video cùng lúc vẫn được: việc sau tự chờ lượt. Chỉ gọi `make` khi người trực thật sự muốn tạo video.

## 4. Lưu ý

- Hỏi "video đang tới đâu" → xem thẻ tiến độ trong chat, hoặc gọi `agent-edit__jobs` (gồm cả video tạo từ app / chat khác).
- `agent-edit__update` khi người trực muốn cập nhật hoặc lỗi báo bản quá cũ (app Agent Edit phải đang đóng, không có video
  đang dựng).
- Báo kết quả ngắn gọn bằng tiếng Việt; không dán JSON thô cho người trực.

## 5. Ngoài GetTime (Claude Code / Codex có shell)

Không có công cụ `agent-edit__…` nhưng chạy được lệnh: dùng script trong thư mục `scripts/` của kỹ năng này — macOS
`bash scripts/agent-edit <lệnh>`, Windows `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\agent-edit.ps1 <lệnh>`.
Cùng các việc trên: `tool status | setup | login <tk> | login-code <tk> <mã> | login-check <tk> | make … | job <mã> |
jobs | update` (key bản quyền qua biến môi trường `AGENT_EDIT_KEY`), hoặc lệnh đầy đủ của Agent Edit: `help` để xem.
