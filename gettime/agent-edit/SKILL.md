---
name: agent-edit
description: 'Agent Edit — phần mềm làm video bằng AI trên máy này, dùng ĐẦY ĐỦ như trên app: Edit Video (dựng/edit video quay sẵn: cắt, hook, phụ đề, chữ hiệu ứng, ảnh AI, SFX, nhạc; làm lại/sửa video đã tạo), Tạo video (motion graphics từ ý tưởng, giọng đọc AI), Automation Video (nguồn tin website/Facebook tự thành video, tự đăng), đăng video lên kênh qua iPhone (Phone Agent, đăng ngay hoặc hẹn giờ), Video đã tạo, Bot Telegram (ra lệnh Edit video / Tạo video qua Telegram, chỉ người có key), cài đặt (đăng nhập AI, model, key). Dùng khi người trực muốn làm/sửa/đăng video TikTok, Reels, Shorts, quảng cáo; hỏi tiến độ, video đã làm; tạo hoặc quản lý automation; kết nối / quản lý bot Telegram; cài đặt Agent Edit; hoặc hỏi Agent Edit làm được gì.'
license: Proprietary
compatibility: 'macOS 14 trở lên (Apple Silicon hoặc Intel) hoặc Windows 10 (1809+) / 11 64-bit. Cần key bản quyền Agent Edit. Chạy ở mức chat thường qua tool.json — không cần Toàn quyền.'
metadata:
  title: Agent Edit — làm video AI
  kind: tool
  author: Agent Edit
  version: 3.1.0
---

# Agent Edit — làm video bằng AI

Bạn điều khiển **Agent Edit** trên máy này qua các công cụ `agent-edit__…` của GetTime. Mọi chức năng của app đều dùng
được trong chat; app tự chạy nền nếu chưa mở, mở app lên vẫn thấy đúng những gì làm trong chat (và ngược lại).

| Nhóm | Công cụ |
|---|---|
| Kiểm tra / cài đặt | `gettime_check_tool`, `gettime_ask_field`, `agent-edit__setup`, `__login`, `__login-code`, `__login-check`, `__keys`, `__update`, `__settings` |
| Hỏi app làm được gì | `agent-edit__capabilities` |
| Edit Video | `agent-edit__make` (tạo mới / làm lại với `from`), `agent-edit__projects`, `agent-edit__jobs`, `agent-edit__fonts` |
| Tạo video | `agent-edit__motion-create`, `__motion-redo`, `__motion-manage`, `__voices` |
| Automation Video | `agent-edit__auto-save`, `__auto-manage` |
| Đăng video (iPhone) | `agent-edit__post-create`, `__post-manage` |
| Bot Telegram | `agent-edit__telegram` (+ `gettime_ask_field` trường `telegram-bot-token` → `agent-edit__keys`) |

**Việc dài** (`setup`, `make`, `motion-create`, `motion-redo`, `post-create`, `update`) trả lời ngay "đã nhận"; GetTime tự
hiện thẻ tiến độ và báo kết quả vào chat (video xong hiện thành thẻ). **Không gọi lại để chờ.** Báo người trực một câu là
đã bắt đầu rồi kết thúc lượt.

**Nguyên tắc:** hỏi đủ như form của app rồi mới làm (mục 4–7) · tệp (video, ảnh, font) phải được người trực **gửi vào chat
này**, dùng đúng đường dẫn tệp đính kèm, không bịa · **không bao giờ** bảo dán key/token vào chat (dùng `gettime_ask_field`)
· báo kết quả ngắn gọn tiếng Việt, không dán JSON · tên/mã nội bộ (id) chỉ nhắc khi cần.

## 1. Kiểm tra trước mọi việc

Gọi `gettime_check_tool` (skill `agent-edit`). "Sẵn sàng." → làm việc được nhờ. Chưa sẵn sàng → đọc `next`, `missing`,
`message` và xử lý theo thứ tự:

1. **Máy chưa cài / bản quá cũ** (`installed: false`, `next` = `setup`) hoặc **chưa kích hoạt key** ("setup (kích hoạt
   key bản quyền)"): chưa có trường **license-key** → `gettime_ask_field` (field `license-key`), nhắn "Anh/chị nhập key bản
   quyền Agent Edit vào ô bên dưới giúp em", **kết thúc lượt**; app báo "Đã lưu …" → `agent-edit__setup`. Có key rồi →
   `agent-edit__setup`.
2. **Thiếu công cụ** (`next` có `setup`) → `agent-edit__setup`.
3. **Chưa đăng nhập AI** (`login gemini`, `login claude`, `login codex`) → mục 2. `codex` tuỳ chọn (ảnh AI) — hỏi trước.
4. `next` nói **API key** Gemini / Claude → nhờ nhập API key trong app Agent Edit (Cài đặt API) hoặc đổi sang đăng nhập.
5. `installing` có mã việc → đang cài, chờ thẻ tiến độ.

Các trường `saydi-key`, `phoneagent-token`, `facebook-token`, `telegram-bot-token` chỉ cần cho chức năng tương ứng — "Trường chưa nhập" của
chúng **không** phải lý do chưa sẵn sàng, đừng hỏi khi chưa dùng tới. `setup` xong app tự nhắn tiếp → gọi lại
`gettime_check_tool`. `setup` lỗi → báo ngắn, làm theo gợi ý (sai key → hỏi lại key; app đang mở → nhờ đóng app) rồi gọi
lại. Mỗi key bản quyền dùng cho **1 máy**; "đã kích hoạt trên máy khác" → liên hệ người bán.

## 2. Đăng nhập tài khoản AI

1. `agent-edit__login` (`account`). `done` / `already` → xong. Có `url` / `lines` → nhắn rồi **kết thúc lượt**:
   - `claude`: "Trình duyệt đã mở trang đăng nhập Claude (hoặc mở link). Xong: trang hiện **mã** thì gửi em; báo thành
     công thì nhắn "xong"."
   - `gemini`: "Đăng nhập Google ngay trên máy cài Agent Edit (link không mở được ở máy khác) rồi nhắn "xong"." Windows: làm
     theo `message` (Enter trong cửa sổ Antigravity).
   - `codex`: người trực không ở cạnh máy → gọi lại với `device: true`, gửi link + mã trong `lines`.
   - `running` chưa có link → `agent-edit__login-check` sau vài giây.
2. Người trực gửi mã → `agent-edit__login-code` (nguyên văn). Nhắn "xong" → `agent-edit__login-check`: `done` → báo đã
   đăng nhập · `running` → nhắc lại · `error`/`none` → báo lỗi, gọi lại `login`.
3. Đăng xuất / đổi tài khoản → `agent-edit__settings` op `logout` rồi đăng nhập lại.

## 3. "Agent Edit làm được gì?"

Gọi `agent-edit__capabilities`, trả lời gọn theo nhóm: **Edit Video** (từ video quay sẵn), **Tạo video** (motion
graphics từ ý tưởng, giọng đọc AI), **Automation Video**, **Đăng video qua iPhone**, **Video đã tạo**, **Cài đặt** — mỗi
nhóm 1 dòng làm được gì + thời gian + cần gì (từ `features`, `readiness`). Hỏi chi tiết một chức năng → liệt kê lựa chọn
(loại video, khung hình, quy trình dựng, giọng đọc…) từ cùng kết quả. Rồi hỏi người trực muốn làm gì.

## 4. Edit Video — dựng từ video quay sẵn

**B1. Video nguồn** (bắt buộc, gửi vào chat). **B2. Gửi bảng hỏi** (một tin, mọi mục không bắt buộc, điền sẵn phần đã
biết, "làm luôn" để bỏ qua), rồi **kết thúc lượt**:

> **1. Yêu cầu edit** — Mục đích (VD: chạy QC, bán trà sữa, đăng hàng ngày…) · Phong cách (nhanh, vui, bắt trend, sang,
> tối giản, cinematic…) · Người xem (nữ 18-25, chủ shop…) · Độ dài (15s, 30-45s…) · Khổ dọc 9:16 hay ngang 16:9 · Video mẫu
> muốn bắt chước (gửi file)
> **2. Brand Guideline** — Font & chữ (VD: tiêu đề Montserrat in hoa đậm; có file .ttf/.otf/.woff thì gửi) · Màu (mã màu)
> **3. Tư liệu của bạn** — ảnh / video chèn lên (sản phẩm, logo, bảng giá…), **mỗi tệp kèm mô tả** (là gì, chèn lúc nói tới
> gì) · cách dùng: chèn vào video / chỉ làm mẫu ảnh AI / cả hai · vị trí: AI tự chọn / khung nổi / tách nền như sticker /
> nửa trên / toàn màn hình

**B3.** Tư liệu thiếu mô tả → hỏi lại từng tệp. Đủ rồi (hoặc "làm luôn") → tóm tắt 2–4 dòng, gọi `agent-edit__make`:
`videos`, `request` (mục đích + yêu cầu), `style`, `audience`, `duration`, `orientation`, `reference`, `brand_typography`,
`brand_colors`, `fonts` (file font; đầu = tiêu đề, cuối = nội dung), `inserts` + `insert_notes` / `insert_uses`
(`show`·`ai_ref`·`both`) / `insert_placements` (`auto`·`overlay`·`cutout`·`split`·`fullscreen`) — **mỗi dòng một tệp
đúng thứ tự `inserts`**, dòng trống = mặc định. Video thứ hai trong chat: hỏi "dùng lại như video trước?" thay vì cả bảng.

**Làm lại / sửa video đã tạo** (kể cả video làm trên app): tìm id bằng `agent-edit__projects` op `list` (hoặc `show` để
xem đã dùng gì), rồi `agent-edit__make` với `from` = id + **chỉ các ô muốn đổi** (video mới, yêu cầu, tư liệu — gửi
`inserts` là thay cả bộ; `no_inserts` / `no_reference` để bỏ). Không gửi gì thêm = render lại / tiếp tục sau lỗi (dùng lại
phân tích + kế hoạch). Chê bản dựng, muốn bản khác → `new_plan: true`. Phân tích lại từ đầu → `fresh: true` (chỉ khi được
yêu cầu). Kết quả là một video mới trong "Video đã tạo"; video cũ giữ nguyên.

Lỗi: bản quyền / "activate" → mục 1 · đăng nhập → mục 2 · thiếu công cụ → `setup` · "cần cập nhật" → `update` · tệp không
đọc được → nhờ gửi lại. Sửa xong gọi lại y như cũ (không tốn lại AI phần đã xong).

## 5. Tạo video — motion graphics từ ý tưởng

Không cần video quay. Gọi `agent-edit__capabilities` (nếu chưa) để biết lựa chọn + máy có quy trình `mvd` / key giọng đọc
chưa. **Gửi bảng hỏi** (điền sẵn phần đã biết), **kết thúc lượt**:

> **Bắt buộc:** Tên sản phẩm / thương hiệu · Nội dung chính muốn nói
> **Tuỳ chọn:** Loại video (quảng cáo / giới thiệu sản phẩm · ra mắt · một tính năng · quảng cáo mạng xã hội · giải thích ·
> chữ động · nhận diện thương hiệu · tin tức ngắn) · Khung hình (dọc 9:16 · ngang 16:9 · vuông 1:1) · Thời lượng (6–90
> giây, mặc định 20) · Ngôn ngữ (Việt/Anh) · Người xem · Mục tiêu · Lời kêu gọi (CTA) · Giọng điệu · Website · Màu · Font ·
> Logo / ảnh sản phẩm / ảnh chụp màn hình (gửi ảnh) · Ghi chú
> **Lời đọc:** có hay không · giọng (nam/nữ, vùng miền, phong cách — em tìm giúp) · tốc độ · kịch bản lời đọc (để trống
> AI tự viết)
> **Quy trình dựng** (chỉ hỏi khi máy có `mvd`): motionmaxxing (mặc định, 15–40 phút) hoặc motion-video-director (ảnh AI
> nhân vật + đạo cụ, cắt theo nhịp nhạc, 60–90 phút)

- **Giọng đọc:** `agent-edit__voices` (`q` = mô tả người trực muốn, `gender`, `language`) → giới thiệu 3–5 giọng (tên + mô
  tả) để chọn → dùng `voice_id`. Không nghe thử được trong chat — nghe ở voice.saydi.ai nếu cần.
- **Chưa có key SaydiVoice** (lỗi "Chưa có key SaydiVoice" hoặc `capabilities` báo chưa có) mà muốn lời đọc →
  `gettime_ask_field` field `saydi-key`, kết thúc lượt; "Đã lưu" → `agent-edit__keys` → làm tiếp. Không có key → đề nghị
  video không lời (`no_voice`).
- Đủ thông tin → tóm tắt, gọi `agent-edit__motion-create` (`name`, `message`, `video_type`, `aspect`, `duration`,
  `language`, `audience`, `goal`, `cta`, `tone`, `website`, `colors`, `fonts`, `assets`, `notes`, `engine`, `voice_id`,
  `speed`, `script` | `no_voice`). Báo "đã nhận, đang tạo (15–40 phút)".
- Lỗi / bị gián đoạn → `agent-edit__motion-redo` op `rerun` + `id`. **Muốn bản khác** (đổi nội dung, giọng, thời lượng…)
  → op `again` + `id` + chỉ các ô muốn đổi. Xem danh sách / báo cáo của AI / huỷ / xoá → `agent-edit__motion-manage`.

## 6. Automation Video — nguồn tin tự thành video

Mỗi tin mới của nguồn (website / RSS / trang Facebook) tự thành 1 video Tạo video, có thể tự đăng qua iPhone. App phải
chạy (tự chạy nền; máy tắt thì dừng). **Bảng hỏi:**

> Tên dự án · **Nguồn tin** (link trang tin / chuyên mục / RSS, hoặc trang Facebook) · Tên kênh / thương hiệu · Kiểm tin
> mấy phút một lần (mặc định 30) · Tối đa video mỗi lần (2) / mỗi ngày (10) · Chỉ làm tin MỚI từ giờ (mặc định) hay làm
> luôn tin đang có · Video: loại (mặc định tin tức), khung, thời lượng (30s), lời đọc + giọng, hướng dẫn cách làm video từ
> tin · **Tự đăng?** iPhone + kịch bản + caption (mẫu `{title}` `{summary}` `{link}` `{source}` `{channel}` `{date}`), đăng
> ngay / sau X phút / theo khung giờ (VD 08:00, 12:00, 19:00)

1. Thử nguồn trước: `agent-edit__auto-manage` op `test-source` (`source` = `web|<link>` / `facebook|<link>`) → báo vài
   tin lấy được. Facebook cần `facebook-token` (hỏi bằng `gettime_ask_field`).
2. Tự đăng → làm mục 7 bước 1–3 để có iPhone / kịch bản / biến.
3. `agent-edit__auto-save`: `project_name`, `sources` (mỗi dòng một nguồn), `name` (kênh), các ô video như Tạo video,
   `interval`, `max_per_check`, `max_per_day`, `skip_existing`, `enabled`, `post` / `post_device` / `post_script` /
   `post_vars` (mỗi dòng `ten=giá trị`) / `post_timing` / `post_delay` / `post_slots`. Sửa: `id` + chỉ ô muốn đổi.
4. Quản lý: `agent-edit__auto-manage` op `list` / `show` / `on` / `off` / `check` (kiểm tin ngay) / `delete`. Video của dự
   án: `agent-edit__motion-manage` op `list` + `automation`; bài đăng: `agent-edit__post-manage` op `list` + `automation`.

## 7. Đăng video lên kênh qua iPhone (Phone Agent)

1. Chưa có token (lỗi "Chưa nhập API token Phone Agent") → `gettime_ask_field` field `phoneagent-token`, kết thúc lượt;
   "Đã lưu" → `agent-edit__keys`.
2. `agent-edit__post-manage` op `devices` (iPhone online/offline) và `scripts` (kịch bản đăng: TikTok, Facebook…) → hỏi
   người trực chọn.
3. op `fields` + `script` → các biến cần điền (caption, hashtag…) → hỏi người trực (gợi ý caption từ nội dung video).
4. `agent-edit__post-create`: `video` (tệp trong chat) **hoặc** `ref` (id video đã tạo: `mv-…` của Tạo video / Automation,
   `r_…` của Edit Video), `device`, `script`, `vars` (mỗi dòng `ten=giá trị`), `at` ("YYYY-MM-DD HH:MM", trống = ngay).
   App theo dõi tới khi đăng xong. iPhone phải bật app Phone Agent; máy tính phải bật lúc tới giờ đăng.
5. Xem / huỷ / đăng lại / đổi giờ / xoá → `agent-edit__post-manage` op `list` / `show` / `cancel` / `retry` /
   `reschedule` / `delete`.

## 8. Video đã tạo, việc đang chạy

- Edit Video: `agent-edit__projects` op `list` (cả video làm trên app), `show`, `delete` (`with_files` = cả thư mục vào
  Thùng rác — hỏi lại trước khi xoá). Việc dựng gần đây (kể cả đang chạy): `agent-edit__jobs`.
- Tạo video / Automation: `agent-edit__motion-manage` op `list` / `show` (báo cáo của AI) / `cancel` / `delete`.
- Gửi lại file video cho người trực: đường dẫn trong kết quả (`video` / `result.output`).

## 9. Cài đặt

`agent-edit__settings`: op `show` (chế độ tài khoản/API key, model, mức suy nghĩ, số video chạy cùng lúc, đã có key
SaydiVoice / Phone Agent chưa) · `models` + `account` (model + mức suy nghĩ chọn được) · `set` + `account` + `mode` /
`model` / `effort` · `limits` (`analyze` phân tích Edit Video, `plan` lập kế hoạch, `motion` Tạo video — số video chạy cùng
lúc) · `test` + `account` (kiểm kết nối) · `logout`. API key AI nhập trong app (Cài đặt API). Cập nhật app →
`agent-edit__update` (app phải đóng, không có video đang tạo). Key SaydiVoice / token Phone Agent mới → `gettime_ask_field`
rồi `agent-edit__keys`.

## 10. Bot Telegram — ra lệnh làm video qua Telegram

Người trực muốn nhắn Telegram để làm video (không cần mở app / GetTime): app chạy một **bot Telegram riêng** của họ. Ai nhắn
bot phải gửi **đúng key phần mềm Agent Edit** của máy này mới dùng được (sai 5 lần → khoá 1 giờ; tin chứa key bị xoá). Bot có
menu **Edit video · Tạo video · Video của tôi · Huỷ thao tác**, hỏi từng bước (video nguồn / chọn từ thư viện → video mẫu →
mục đích → phong cách → khách hàng → độ dài → font → màu → tư liệu + mô tả), xong gửi video hoàn chỉnh vào Telegram; mỗi
video một mã, làm nhiều video cùng lúc.

1. **Kết nối:** hướng dẫn tạo bot: mở **@BotFather** trên Telegram → `/newbot` → đặt tên → nhận token. Rồi
   `gettime_ask_field` field `telegram-bot-token` ("Anh/chị dán token bot vào ô bên dưới giúp em"), **kết thúc lượt**; "Đã
   lưu" → `agent-edit__keys` (token đúng → bot tự bật, kết quả có `bot.username`). Báo: "Mở t.me/<username>, bấm Start rồi
   gửi key phần mềm Agent Edit." **Không** gửi key bản quyền vào chat GetTime.
2. **Xem / quản lý:** `agent-edit__telegram` op `status` (đang chạy / lỗi + `status.error`) · `on` / `off` · `test` · `users`
   (người đã xác thực) · `remove-user` + `chat_id` (hỏi lại trước) · `jobs` (video tạo qua bot: mã, trạng thái, file).
3. Bot chỉ trả lời khi app (hoặc dịch vụ nền) đang chạy — gọi bất kỳ công cụ nào là app tự chạy nền; máy tắt thì bot dừng.
   Telegram chỉ cho bot nhận file ≤ 20 MB (lớn hơn: người dùng gửi link Google Drive / Dropbox hoặc chọn từ thư viện) và gửi
   ≤ 50 MB (lớn hơn: bot gửi bản nén + link bản gốc 48 giờ). `status.error` có "nơi khác dùng" → token đang chạy ở máy khác.
   Lỗi "chưa có Bot Telegram" → `agent-edit__update`.

## 11. Ngoài GetTime (Claude Code / Codex có shell)

Dùng script `scripts/agent-edit` (macOS: `bash scripts/agent-edit …`; Windows: `powershell -NoProfile -ExecutionPolicy
Bypass -File scripts\agent-edit.ps1 …`): `tool <việc>` như các công cụ trên (`tool cli <lệnh>` = lệnh đầy đủ của app; key
qua biến `AGENT_EDIT_KEY`, `AGENT_EDIT_SAYDI_KEY`, `AGENT_EDIT_PA_TOKEN`, `AGENT_EDIT_FB_TOKEN`, `AGENT_EDIT_TG_TOKEN`), hoặc `help` xem mọi lệnh.
