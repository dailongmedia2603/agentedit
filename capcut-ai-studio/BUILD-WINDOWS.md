# Build bản cài Agent Edit cho Windows

Bản Windows phải build **trên chính máy Windows 10/11 64-bit**. Hai lớp bảo vệ mã chỉ biên dịch được trên Windows x64:

- bytecode Electron `.jsc` (bytenode) gắn với V8 và loại CPU;
- sidecar Python biên dịch Cython thành `.pyd`, việc này cần trình biên dịch MSVC.

Vì vậy không build chéo từ macOS được.

## 1. Chuẩn bị máy build (làm 1 lần)

| Cần | Cách cài |
|---|---|
| Windows 10 1809+ / 11, **64-bit** | — |
| **Node.js 22+ bản x64** (LTS) | https://nodejs.org, hoặc để script tự cài (`-InstallPrereqs`, cần `winget`) |
| **Visual Studio 2022 Build Tools**, workload **"Desktop development with C++"** | https://visualstudio.microsoft.com/visual-cpp-build-tools/, hoặc `-InstallPrereqs` |
| Git (để lấy mã nguồn) | https://git-scm.com |
| ~15 GB trống, mạng ổn định | — |

**Không cần cài Python.** App dùng Python nhúng, script tự tải đúng bản đã ghim.

### Long paths

Nên đặt mã nguồn ở **thư mục ngắn, không dấu**, ví dụ `C:\ae`. Windows giới hạn đường dẫn 260 ký tự, và cây `node_modules` / thư viện Python khá sâu.

Nếu muốn bật hỗ trợ đường dẫn dài (không bắt buộc khi thư mục ngắn), mở PowerShell **Run as administrator** và chạy:

```powershell
New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

## 2. Build

```powershell
git clone https://github.com/dailongmedia2603/agentedit.git C:\ae
cd C:\ae\capcut-ai-studio
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

Tuỳ chọn:

- `-InstallPrereqs`: tự cài Node.js LTS và VS Build Tools (C++) bằng `winget` nếu máy chưa có.
- `-Dir`: chỉ đóng gói thư mục `release\win-unpacked` để chạy thử, không tạo file Setup.
- `-SkipSelfTest`: bỏ bước tự kiểm. Không khuyến khích.

Script làm lần lượt:

1. Kiểm máy (Windows 64-bit, Node x64, MSVC).
2. Cài thư viện Node bằng `npm ci`, đúng `package-lock.json`.
3. Chuẩn bị `winCodeSign` (rcedit gắn icon vào `.exe`), tránh lỗi *"Cannot create symbolic link"* khi chưa bật Developer Mode.
4. `npm run dist:win` (`scripts/dist.mjs --win`), mở đầu bằng việc đặt **mã build** = ngày-giờ lúc build:
   1. `electron-vite build`;
   2. bundle trang Remotion;
   3. nhúng ffmpeg (zip ghim SHA-256);
   4. nhúng model ONNX nhỏ (tách người, dò mặt, OCR);
   5. Python nhúng (`python-build-standalone` 3.12.14, kèm thư viện chạy Visual C++), rồi `pip install requirements.lock`;
   6. biên dịch sidecar thành `.pyd` (Cython + MSVC);
   7. obfuscate + bytenode `.jsc` cho main / preload / worker;
   8. `electron-builder` tạo bộ cài NSIS.
5. **Tự kiểm bản đóng gói** (`scripts/selftest-packaged.mjs`). Bước này dùng thư mục người dùng tạm, không đụng dữ liệu thật:
   - Doctor tự cài ffmpeg + Chrome Headless;
   - nạp sidecar `.pyd`;
   - tách người ra WebM alpha, dò mặt, OCR, vẽ SVG;
   - hộp cách ly hiệu ứng;
   - sidecar `/health`;
   - **render MP4 thật** có phụ đề tiếng Việt.
6. In đường dẫn bộ cài và SHA-256.

Kết quả:

- `release\Agent Edit-Setup-<phiên bản>-b<mã build>-x64.exe`, ví dụ `Agent Edit-Setup-1.1.0-b20261003-2250-x64.exe`:
  file gửi cho người dùng. Mã build (ngày-giờ lúc build) cũng hiện trên thanh tiêu đề của app
  (`Agent Edit · v1.1.0 · build 20261003-2250`), nên nhìn là biết máy khách đang chạy bản nào.
  Số phiên bản nằm ở `package.json` → `"version"`; mã build tự sinh mỗi lần build.
- `release\win-unpacked\Agent Edit.exe`: chạy thử không cần cài.

Nếu bước nào báo **[LỖI]**, gửi lại toàn bộ nội dung cửa sổ PowerShell để xử lý.

### Cập nhật lên bản mới (máy đã build trước đó)

```powershell
cd C:\ae
git pull
cd capcut-ai-studio
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

Cài file `release\Agent Edit-Setup-<phiên bản>-b<mã build>-x64.exe` mới đè lên bản cũ (lấy file có mã build mới nhất). Dự án, kho SFX / meme, đăng nhập AI (trong
`%USERPROFILE%\.capcut-studio`) được giữ nguyên.

### Giao diện bản cài (ẩn quy trình)

Bản build mặc định là **bản cài cho máy khác**. Bản này ẩn:

- Nhật ký xử lý;
- menu Prompt & quy tắc;
- thanh các bước và khung kết quả từng bước ở Tạo video;
- nhật ký cài đặt ở Doctor;
- tên bước và tên AI trong các lời nhắn: khi chạy chỉ hiện "Đang phân tích", rồi "Đang tạo video";
- DevTools.

Mọi chức năng giữ nguyên.

- Cửa bí mật: `Ctrl + Shift + Alt + D` bật hoặc tắt giao diện đầy đủ. Lựa chọn chỉ lưu trên máy đó.
- Cần build bản đầy đủ thì đặt `$env:STUDIO_FULL_UI = '1'` trước khi chạy script.

## 3. Cài và chạy trên máy người dùng

- Bộ cài **cài cho riêng người dùng**, không cần quyền admin. App nằm tại `%LOCALAPPDATA%\Programs\Agent Edit`, có shortcut Desktop và Start menu. Trình cài hiển thị tiếng Việt và cho chọn thư mục.
- **SmartScreen:** app chưa ký số (chưa có chứng chỉ Authenticode), nên lần đầu Windows có thể báo *"Windows protected your PC"*. Bấm **More info**, rồi **Run anyway**.
  - Muốn hết cảnh báo thì cần chứng chỉ ký mã (OV/EV, hoặc Azure Trusted Signing) và khai báo `win.signtoolOptions` / `win.azureSignOptions` trong `electron-builder.yml`.
- Máy bật **Smart App Control** (Windows 11 cài mới) có thể chặn file `.exe` / `.dll` chưa ký. Trường hợp này cần tắt Smart App Control (Windows Security, App & browser control) hoặc ký số app.
- **Lần đầu mở app**, Doctor tự kiểm và tự cài các thành phần còn thiếu vào `%USERPROFILE%\.capcut-studio`:
  - ffmpeg: giải nén từ bản kèm app, không cần mạng;
  - Chrome Headless Shell (~90 MB);
  - model Whisper (~486 MB);
  - model tách nền ảnh BiRefNet (~224 MB);
  - Codex CLI;
  - Claude Code (`install.ps1` chính chủ);
  - Antigravity CLI `agy` (`install.ps1` chính chủ).
- **Đăng nhập tài khoản AI** trong *Cài đặt API*:
  - Gemini (agy) và Claude mở một cửa sổ **PowerShell** riêng để đăng nhập. Để dán trong cửa sổ PowerShell: **chuột phải**.
  - Codex (ChatGPT) đăng nhập ngay trong app.
- Gỡ cài đặt **không xoá** dữ liệu người dùng: khoá API đã mã hoá, dự án, kho SFX/meme, `%USERPROFILE%\.capcut-studio`.

## 4. Khác biệt so với bản macOS

| Việc | macOS | Windows |
|---|---|---|
| Tách người (chữ sau người) | Apple Vision | **RobustVideoMatting** (ONNX, nhúng sẵn). Đo trên video thật: IoU 0.97–0.99 so với Vision |
| Tách nền ảnh (sticker, ảnh AI) | Apple Vision | **BiRefNet-lite** (ONNX, Doctor tải). IoU trung vị 0.958 so với Vision |
| Dò mặt | Apple Vision | **YuNet** (ONNX, nhúng sẵn), khung hiệu chỉnh về quy ước Vision |
| Kiểm chính tả chữ ảnh AI (OCR) | Vision vi-VT | **PP-OCR** (ONNX, nhúng sẵn): chữ từ model Latin, khung từng từ từ PP-OCRv6 |
| Vẽ khung SVG đo hook | NSImage | **resvg** |
| Ảnh HEIC | `sips` | **pillow-heif** |
| HDR iPhone → SDR | `avconvert` (Apple) | ffmpeg `zscale` + `tonemap` hable (đã là phương án dự phòng trên Mac) |
| Lưu khoá API | Keychain | Windows DPAPI (Electron `safeStorage`) |
| Đăng nhập agy / Claude | Terminal | cửa sổ PowerShell |
| Prompt dài cho Claude / agy | tham số dòng lệnh | qua file (`--system-prompt-file`) / stdin (agy `stream-json`), vì Windows giới hạn dòng lệnh 32K ký tự |

Giấy phép thành phần bên thứ ba:

- ffmpeg (bản GPL, có x264);
- RobustVideoMatting: GPL-3.0;
- BiRefNet: MIT;
- YuNet: MIT;
- PP-OCR: Apache-2.0.

Toàn bộ nguồn tải và SHA-256 nằm trong `sidecar/assets/toolchain.json`.

## 5. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `npm ci` lỗi `EPERM` / file bị khoá | Tắt app / VS Code đang mở thư mục, tạm tắt quét realtime của Defender cho thư mục dự án rồi chạy lại |
| `Chi ra x/y .pyd` (compile-sidecar) | Thiếu workload C++ của VS Build Tools. Cài *"Desktop development with C++"* |
| `Khong tim thay thu vien chay Visual C++` | Như trên: cần VS Build Tools có C++ |
| `Cannot create symbolic link` khi electron-builder chạy | Xoá `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` rồi chạy lại script (bước 3 tự giải nén đúng cách) |
| Tự kiểm báo lỗi `Render MP4` | Xem dòng `[RMR]` phía trên. Thường do Defender chặn `chrome-headless-shell.exe` / `remotion.exe`: cho phép rồi chạy lại |
| App mở rồi tắt ngay khi chạy từ terminal VS Code | VS Code đặt `ELECTRON_RUN_AS_NODE=1`. Chạy bằng `Remove-Item Env:ELECTRON_RUN_AS_NODE` trước, hoặc mở từ Explorer |
| Đã đăng nhập agy nhưng app vẫn báo chưa | Gửi danh sách file trong `%USERPROFILE%\.gemini\antigravity-cli` (tên file phiên đăng nhập của agy trên Windows chưa được kiểm trên máy thật) |
