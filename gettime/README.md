# Agent Edit cho GetTime

Thư mục `agent-edit/` là **kỹ năng (skill) loại Công cụ** cho GetTime Desktop. Cài nó vào GetTime thì AI trong GetTime
dựng video được bằng Agent Edit: bạn ra lệnh bằng lời, AI tự cài app, tự chạy và báo lại file video xong.

## Vì sao là kỹ năng, không phải tiện ích

Theo `tai-lieu-app-gettime/huong-dan-viet-tien-ich.md`, tiện ích của GetTime chỉ có một loại: `kind: "channel"`, dùng để
nối một nền tảng nhắn tin (Zalo, Telegram…) với 4 việc: đăng nhập, liệt kê hội thoại, nhận tin, gửi tin. Agent Edit
không phải nền tảng nhắn tin nên không làm tiện ích được. Việc "AI làm cho người trực" (tạo ảnh, xuất PDF, dựng video)
là **kỹ năng loại `cong-cu`**. Chỉ cần tải lên **một thư mục kỹ năng**, và ngay lần đầu dùng, kỹ năng tự tải toàn bộ phần
cần thiết.

## Cài vào GetTime

1. GetTime → **Cài đặt › Kỹ năng** → tab **Hệ thống** (không chọn Workspace: tầng Workspace bỏ mất thư mục `scripts/`
   khi đồng bộ lên web) → **Thêm** → chọn thư mục `gettime/agent-edit` → **Bật**.
2. Chat dùng để ra lệnh dựng video phải bật **Toàn quyền**, vì AI cần chạy script. Kỹ năng loại Công cụ chỉ dùng khi
   người trực chat với AI, không bao giờ dùng khi trả lời khách.
3. Sửa kỹ năng sau này: sửa thư mục gốc rồi bấm **Chép lại** trên thẻ kỹ năng.

## Dùng

- Lần đầu trên một máy, nhắn AI: *"Cài Agent Edit, key của tôi là XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"*. AI sẽ tải app đúng
  máy (Mac Apple Silicon / Mac Intel / Windows — Windows cài im lặng cho riêng tài khoản, không cần quyền admin), kích hoạt key, tự cài công cụ (Whisper, trình render, Codex, Claude Code, Antigravity CLI),
  rồi nhờ bạn đăng nhập Gemini / Claude trên trình duyệt nếu máy chưa đăng nhập.
- Ra lệnh: *"Dựng video TikTok từ file ~/Desktop/goc.mp4, giới thiệu sản phẩm, dưới 60 giây, lưu vào Desktop"*. Có thể
  thêm video mẫu, ảnh sản phẩm hoặc logo chèn lên, video ngang… AI trả lời ngay mã việc, rồi theo dõi cho tới khi xong
  (thường 10–40 phút) và báo đường dẫn file MP4.
- Hỏi lại sau: *"Video lúc nãy xong chưa?"*. Việc vẫn chạy nền kể cả khi lượt chat đã kết thúc.

## Điều kiện

- macOS 14 trở lên (Apple Silicon hoặc **Intel**) hoặc **Windows 10 (bản 1809+) / 11 64-bit**. Cùng một thư mục kỹ năng
  cho mọi máy: AI tự gọi `scripts/agent-edit` (macOS) hoặc `scripts/agent-edit.ps1` (Windows).
- Key bản quyền Agent Edit. Mỗi key dùng cho 1 máy, **dùng chung với app** Agent Edit trên cùng máy (CLI chính là app
  chạy không giao diện).
- Đăng nhập AI: Gemini (tài khoản Google, qua Antigravity CLI) + Claude (Claude Code). Codex (ChatGPT) không bắt buộc,
  dùng cho ảnh AI. Có thể dùng API key thay đăng nhập.
- Video làm qua kỹ năng cũng hiện trong app Agent Edit → **Video đã tạo** (mở ra xem lại / render lại được).

## Chạy tay

macOS (Terminal):

```bash
bash gettime/agent-edit/scripts/agent-edit help
bash gettime/agent-edit/scripts/agent-edit setup --key <KEY>
bash gettime/agent-edit/scripts/agent-edit make --video ~/Desktop/goc.mp4 --request "Giới thiệu sản phẩm" --wait
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File gettime\agent-edit\scripts\agent-edit.ps1 setup --key <KEY>
powershell -ExecutionPolicy Bypass -File gettime\agent-edit\scripts\agent-edit.ps1 make --video C:\Users\a\Desktop\goc.mp4 --request "Giới thiệu sản phẩm" --wait
```

Chi tiết kỹ thuật: `PROJECT_OVERVIEW.md` mục 16.
