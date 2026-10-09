# Máy chủ bản quyền Agent Edit

1 key = 1 máy. Hai Cloudflare Worker dùng chung 1 cơ sở dữ liệu D1:

| Worker | File | Ai gọi | Bảo vệ |
|---|---|---|---|
| `agent-edit-license` | `src/api.js` | App trên máy khách | Chữ ký khoá thiết bị (Ed25519) |
| `agent-edit-admin` | `src/admin.js` + `src/admin.html` | Chủ app (trang quản lý key) | Cloudflare Access (email `dailongmedia.agency@gmail.com`) + Worker tự kiểm JWT |

Kho SFX + Meme ở R2 bucket `agent-edit` (**tắt truy cập công khai**). App chỉ tải được qua `api.js`
(`op=library` → link tải tạm 2 giờ, key bị khoá thì link chết ngay).

**Tự cập nhật app (2026-10-09):** lần kiểm key lúc mở app (`op=check`) + nút "Kiểm tra cập nhật" (`op=update`) gửi kèm
`p.upd {arch, build, channel}` → Worker đọc phiếu `updates/<stable|test>/<darwin|win32>-<arm64|x64>.json` trên R2 và trả
`update: {m, sig, url}` nếu mới hơn (không thì `null`). File tải ở `/v1/update/<tên>?t=<token 24h>` (hỗ trợ Range, key
khoá → 403). Worker **không** giữ khoá ký phiếu — app tự kiểm chữ ký. Phiếu + file do `capcut-ai-studio/scripts/
publish-update.mjs` (GitHub Actions) đẩy lên. Chi tiết: PROJECT_OVERVIEW.md mục 15.

## Đang chạy (2026-10-04)

- API: `https://agent-edit-license.agent-edit-license-server.workers.dev` (đã điền vào `PROD_API`)
- Quản trị: `https://agent-edit-admin.agent-edit-license-server.workers.dev` (chờ bật Cloudflare Access)
- D1 `agent-edit-license` = `ead20a13-5d68-429e-afda-79603495ec9b`

## Bí mật

`node scripts/gen-keys.mjs` sinh 1 lần vào `~/.capcut-studio/license-secrets.json` (chmod 600, **không đưa lên git**):

- `TICKET_SK`: khoá bí mật ký "vé". Khoá công khai tương ứng (`TICKET_PUB`) nằm cứng trong app:
  `electron/services/license.ts` (`PROD_PUB`) và `sidecar/server.py` (`_LICENSE_PUB`). Đổi khoá thì phải build lại app.
- `DL_SECRET`: HMAC cho link tải kho.
- `KEY_ENC_SECRET`: mã hoá key trong D1 để trang quản trị xem lại được.

**Mất file này** thì sinh bộ mới, đẩy lên Worker và build lại app. **Lộ file này** thì cũng làm như vậy.

## Triển khai lần đầu

```bash
cd license-server
npm install
npx wrangler login                                   # tài khoản Cloudflare có bucket agent-edit
npx wrangler d1 create agent-edit-license            # chép database_id vào wrangler.toml + wrangler.admin.toml
npm run db:remote                                    # tạo bảng
node scripts/gen-keys.mjs --push                     # đẩy TICKET_SK, DL_SECRET, KEY_ENC_SECRET
npm run deploy:api                                   # -> https://agent-edit-license.<subdomain>.workers.dev
npm run deploy:admin                                 # -> https://agent-edit-admin.<subdomain>.workers.dev
```

Sau đó:

1. **Cloudflare Access cho trang quản trị**: Dashboard → Workers & Pages → `agent-edit-admin` → Settings →
   Domains & Routes → workers.dev → bật **Cloudflare Access**. Trong Zero Trust → Access → Applications →
   ứng dụng vừa tạo → Policy: Allow, Include **Emails** = `dailongmedia.agency@gmail.com`.
   Chép **Application Audience (AUD) Tag** và team domain (`<team>.cloudflareaccess.com`) vào
   `wrangler.admin.toml` (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`) rồi `npm run deploy:admin` lại.
   Thiếu 2 giá trị này thì trang quản trị **từ chối mọi người** (an toàn mặc định).
2. **App**: điền URL của `agent-edit-license` vào `PROD_API` trong `capcut-ai-studio/electron/services/license.ts`,
   build lại app (`STUDIO_FULL_UI=1 npm run dist` cho máy chủ app, `npm run dist` / `dist:win` cho khách).
3. **Tắt công khai R2** (sau khi bản app mới đã phát hành): Dashboard → R2 → `agent-edit` → Settings →
   Public access → tắt `r2.dev`. Bản app cũ sẽ không đồng bộ kho được nữa.

## Chạy thử trên máy (không cần Cloudflare)

```bash
node scripts/gen-keys.mjs --dev      # .dev.vars (bộ khoá THỬ, DEV_NO_AUTH=1)
npm run db:local
npm run dev:api                      # http://localhost:8787
npm run dev:admin                    # http://localhost:8788  (mở trình duyệt = trang quản lý key)
npm test                             # 34 tình huống: kích hoạt, máy khác, cài lại, khoá, hết hạn, kho, dò key
```

App bản dev trỏ vào máy chủ thử:
`STUDIO_LICENSE_URL=http://localhost:8787 STUDIO_LICENSE_PUB=<TICKET_PUB trong .dev.vars> npm run dev`
(hoặc `STUDIO_LICENSE=off npm run dev` để bỏ qua bản quyền khi làm việc khác). Các biến này **chỉ có tác dụng ở bản
chưa đóng gói**; app đóng gói luôn dùng `PROD_API` / `PROD_PUB`.

## Luật

- Kích hoạt: key chưa gắn máy → gắn máy này (mã phần cứng + khoá thiết bị). Hạn dùng tính từ lần kích hoạt đầu
  (tháng / năm / vĩnh viễn).
- App hỏi server **chỉ 2 lúc**: mở app + bấm "Phân tích video" (đồng bộ kho tự đi qua server). Không có mạng thì
  không dùng được. Khoá key trên trang quản trị → bị chặn ở lần mở app / phân tích kế tiếp.
- Máy khác dùng key đã gắn → từ chối (`other_machine`) + đếm "Máy khác thử dùng".
- Cùng máy cài lại (mất khoá thiết bị, mã phần cứng khớp ≥ 2) → nhận khoá thiết bị mới (`rekey`).
  3 lần trong 7 ngày → **tự khoá** (nghi chia sẻ). Mở khoá trên trang quản trị.
- Khách **không tự chuyển máy**: chủ app bấm "Reset máy", rồi khách nhập key trên máy mới.
- Nhập sai key 20 lần / giờ / IP → chặn IP đó 1 giờ.
