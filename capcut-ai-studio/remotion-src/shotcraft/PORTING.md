# Port mot mau shot (video-shotcraft) vao Agent Edit

Kho `remotion-src/shotcraft/` chua 150 mau chuyen dong (Remotion, Apache-2.0) cua video-shotcraft. Moi mau la mot
**canh toan man hinh** (B-roll / motion graphic) ma buoc lap ke hoach (R4) cua app chen vao giua video nguoi noi
(talking-head, tieng Viet, khung DOC 9:16 la mac dinh, co ca 16:9). Chu trong mau = **loi noi that cua video**; anh =
anh B-roll that (anh AI, khung hinh tu video, tu lieu nguoi dung). Port = bien code mau "cung" (chu tieng Anh/Trung,
anh chup man hinh mau, logo video-shotcraft, khung 1920x1080 co dinh) thanh mau **nhan noi dung that** va **dep o ca
khung doc lan ngang**.

Mau tham khao DA PORT: `shots/typography/blur-slide/BlurSlide.tsx` + `BlurSlide.meta.json` — doc ky truoc khi lam.

## Da co san (KHONG sua cac file nay — can them gi thi ghi vao bao cao)
- `runtime.tsx`: code mau da duoc tro `useCurrentFrame` / `useVideoConfig` / `staticFile` sang day (khung goc @30fps,
  san khau ao 1920 x `height`). Ham cho noi dung that:
  - `useText(id, sample)` -> chu cua o `id` (khong co -> `sample`). `useList(id, samples)` -> mang chu (so muc thay doi).
  - `useImage(id, sample?)` -> URL anh cua o `id`. `staticFile('textures/live/card4.png')` tu tra o anh `card4` neu co.
  - `useBrand()` -> `{name, logo?}` | null (thuong hieu cua video; co the KHONG co).
  - `useShotFonts()` -> `{sans, serif, display, mono}` (chuoi font-family day du) — dung de do chu.
  - `fitSize(text, {family, size, maxWidth, weight, minSize})` / `useFitSize(...)` -> co chu vua 1 dong.
  - `wrapLines(text, family, size, maxWidth, weight, maxLines)` -> tach dong theo be ngang that.
  - `measureText(...)`, `BrandLogo`.
- `fixtures/` (Look, Polish, Brand, Fixtures, Motion, PageCam2D, ClipCard): da sua san —
  `FONT.sans/serif/display/mono` doc font cua shot (Be Vietnam Pro / Playfair Display / Barlow Condensed, du dau tieng
  Viet, dong goi san); `SERIF` = Playfair Display; `BRAND.name` = ten thuong hieu cua VIDEO (co the ''), `BRAND.amber` =
  mau nhan cua video; `<ShotcraftMark>` / `<ShotcraftWordmark>` ve logo / ten thuong hieu cua video (khong co thi ve dau
  hieu trung tinh / an chu); `<Stage>` tu phu nen len phan tren-duoi khi khung doc o che do `band`.
- `ShotStage.tsx` dat mau vao khung that; `theme.ts` doi mau nhan (accent / accent2) cua LOOKS theo mau cua video.

## Cac buoc cho MOI mau
1. Doc the goc (tieng Trung) `<repo shotcraft>/references/shots/<category>/<card>.md` (y do, thong so, "已知坑" = cho
   khong duoc ha cap) va file .tsx. Repo goc (chi doc): `/private/tmp/claude-502/-Users-macbook-Documents-Antigravity-Agent-Edit/187d4af2-8962-49b0-a6a9-6ca7a39babef/scratchpad/src/shotcraft`
   (video mau: `gallery/` khong co mp4; dung the + code).
2. **Chu**: MOI chu nguoi xem se doc nhu mot thong diep (tieu de, cau phu, nhan the, muc danh sach, con so, trich dan,
   CTA, ten) -> o chu (`useText` / `useList`), co `sample` TIENG VIET hop vai tro. Bo het chu quang cao cua video-shotcraft
   (`PITCH`, "Shot recipes...", "video-shotcraft", "Shotcraft", "Ink Press"...). Chu "do dac" trong giao dien gia (menu,
   so lieu nho, nhan truc) giu duoc nhung doi sang tieng Viet trung tinh, khong mang thuong hieu khac. Chu nam o hang
   so cap module ma phu thuoc o chu -> chuyen vao trong component (hook chi goi trong component).
3. **Chu dai ngan bat ky**: khong bao gio tran khung / bi cat. Dung `fitSize` (1 dong) hoac `wrapLines` (nhieu dong) voi
   font that (`useShotFonts()`), dat lai toa do theo so dong that. Danh sach: bo cuc tinh tu so muc n trong [min,max]
   cua meta. Nhip vao (stagger) nen theo so tu / so muc de MOI thong tin hien du truoc khung `hold`. Giu nguyen do dai
   mau (`<TEN>_DURATION`).
4. **Tieng Viet**: dau chong tang (ỗ ầ ắ ẫ Ự) cao hon chu hoa ~0.3em va sau chu thuong ~0.2em: tieu de nhieu dong
   gian dong >= 1.1; chua khoang phia tren dong dau; mat na "chu troi len" (overflow hidden) phai co padding tren >= 0.3em
   va duoi >= 0.25em — chu HOA dam co dau chong (Ắ Ấ) can ~0.5em tren (khong cat dau / chan chu g y). Khong `textTransform: uppercase` len chu dai (chu hoa tieng Viet rat
   rong) tru nhan ngan.
5. **Font**: thay MOI chuoi font cung ("SF Pro", "Avenir Next", "Iowan", "Futura", "Helvetica", "PingFang", "Menlo"...)
   bang `FONT.sans` / `SERIF` / `FONT.display` / `FONT.mono` (hoac `useShotFonts()`): may Windows khong co cac font do.
   Mau nao do san be ngang chu theo SF Pro (toa do cung theo chu) -> tinh lai bang `measureText`.
6. **Anh**: `staticFile('textures/live/x.png')` / anh chup man hinh mau -> `useImage('<o>', '<duong-dan-mau>')`. Anh that
   co TI LE BAT KY (doc 9:16, ngang, vuong, anh dien thoai...) -> `objectFit: 'cover'` (hoac contain + nen) va tam o giua;
   toa do lay tu `fixtures/live-layout.json` (vi tri cac the trong anh chup trang mau) KHONG con nghia voi anh that ->
   viet lai thanh logic chung (vd dich toi vung giua anh, chia anh thanh luoi, hoac bo). Mau "giao dien san pham"
   (dashboard gia, cua so trinh duyet, dien thoai, terminal, HUD) GIU NGUYEN hinh ve giao dien (de dung khi video noi
   ve app / dien thoai / phan mem), chi doi chu tren giao dien thanh o chu hoac tieng Viet trung tinh; neu giao dien
   co cho chua anh chup man hinh -> o anh `screen` (optional neu ve giao dien gia van dep).
7. **Thuong hieu**: ten / logo trong mau -> `BRAND.name` / `<ShotcraftMark>` / `useBrand()` (da tu doi). Mau ma thuong hieu
   la TRUNG TAM (logo reveal, outro logo) -> meta `brand: "required"` HOAC them o chu `name` de thay (vd ten san pham /
   ten kenh trong loi noi) va dat `brand: "optional"`. Kiem ca khi KHONG co thuong hieu (props `"brand": null`).
8. **Mau**: giu look cua mau (sang/toi). Hex nhan lap lai = vai tro accent -> `L.accent` (LOOKS da doi theo video);
   '#D3923C' (amber cua video-shotcraft) -> `BRAND.amber`. Khong dung Math.random / Date (render phai tat dinh).
9. **Khung doc 9:16** (quan trong nhat — 70% video la khung doc): `useVideoConfig().height` = 1080 khi khung ngang,
   ~3413 khi khung doc va meta `portrait.mode = "native"`. Chon:
   - `native` (UU TIEN cho chu / tieu de / so lieu / danh sach / the / outro / phan lon mau 2D): mau tu bo cuc lai theo
     chieu cao that — chu TO hon (tieu de khung doc ~200-260px san khau), xep doc, can giua khoi noi dung theo chieu doc,
     nen phu kin `height` (Stage tu phu; nen tu ve -> dung `height`). Khung ngang (height 1080) GIU dung bo cuc goc.
   - `band` (canh 3D / camera / khong gian rong): giu khoi 1920x1080, `zoom` 1.0-1.8 (cat bot 2 mep: chi thay be ngang
     1920/zoom o giua) + `focusY`; phan tren/duoi = nen Stage (hoac `bleed` [mau tren, mau duoi] neu mau khong dung
     Stage). Chi chon khi noi dung chinh nam gon giua va van to ro o khung doc.
   Chu chinh o khung doc phai DOC RO tren dien thoai: chieu cao chu hoa >= ~50px tren khung 1080x1920 that.
10. **Meta**: tao `<Component>.meta.json` canh file .tsx theo `meta.ts` (schema, kiem bang `scripts/shotcraft-sync.mjs`):
    `id` (style key, xem `styles.json`), `component`, `card`, `category`, `duration`, `kind` (`insert`; `overlay` chi cho
    lop trong suot de len canh cat nhu chop sang), `dark`, `portrait`, `bleed?`, `rate` (khoang toc do van dep, vd
    [0.8,1.3]), `hold` (khung tu do moi thong tin da hien du), `slots`, `images`, `brand`, `sfx` (khung + loai tieng tai cac
    nhip chinh: whoosh swoosh pop click boom riser ding typing), `vi` (TIENG VIET CO DAU): `ten` (ngan, goi ro hieu ung),
    `mo_ta` (nguoi xem THAY gi, chuyen dong ra sao — cu the), `hop_khi` (loi noi / khoanh khac nao trong video edit thi
    hop: vd "nhac toi so lieu tang truong", "gioi thieu tinh nang app tren dien thoai"), `tranh_khi`, `nang_luong`
    (thap|vua|cao), `chu_de` (tu khoa chu de: "dien thoai", "app", "dashboard", "AI", "so lieu", "so sanh", "danh sach",
    "ra mat", "logo", "trich dan", "code"...). AI lap ke hoach chon mau CHI dua vao meta nay -> viet dung, du, khong qua lien.
11. **Kiem bang mat** (bat buoc, moi mau): `node scripts/shot-still.mjs <file.tsx> [--props <json>] --out <thu-muc>`
    -> `sheet-portrait.png` (4 khung doc) + `sheet-landscape.png`; xem them tung `portrait-f<N>.png` khi can. Chay it nhat 2 lan:
    chu mau (khong --props) va chu DAI (props voi chu tieng Viet dai gan `max`, danh sach so muc max, `"brand": null`).
    Anh mau dung duoc trong props: `samples/photo1.jpg` `samples/photo2.jpg` (khung doc), `samples/wide1.jpg` (16:9),
    `samples/square1.jpg`, `samples/clip1.mp4` (video), `textures/live/*.png` (anh chup giao dien). Props mau:
    `{"texts": {"title": "...", "items": ["..",".."]}, "images": {"screen": "samples/wide1.jpg"}, "brand": null, "theme": {"accent": "#2BD4FF"}}`.
    Dat: khong tran / cat chu, dau tieng Viet nguyen ven, khong chu Anh/Trung/video-shotcraft sot lai, khung doc lap day
    dep (khong mot dai nho giua man hinh trang), anh lap dung khung, chuyen dong goc van con (khong ha cap).
    `--video` render them portrait.mp4 neu can xem chuyen dong.
12. Kiem kieu: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep '<thu muc cua ban>'` phai rong. Kiem meta:
    `node scripts/shotcraft-sync.mjs --check` (chi quan tam dong loi cua file cua ban).

## Khong lam
- Khong sua file ngoai cac thu muc mau duoc giao (runtime / fixtures / ShotStage / registry / script: ghi vao bao cao).
- Khong chay `scripts/shotcraft-sync.mjs` khong co `--check` (registry do nguoi dieu phoi sinh).
- Khong xoa mau / bo mau vi "kho": mau nao thuc su khong the dung cho video edit thi van port, ghi ro trong `tranh_khi`.

## Bao cao cuoi (ngan)
Moi mau: id, portrait mode, so o chu / o anh, van de con lai (neu co), file runtime/fixture can sua (neu co).

## DOT 2 (2026-10-18): NEN ANH AI + KHONG LUOI KE O + KHONG DAU GACH
User: canh Full-screen B-roll KHONG dung nen do code ve (gradient toi + quang sang, LUOI KE O / luoi cham) — "nhin rat AI".
App se tao ANH NEN AI hop chu de cho tung canh shot va ve no DUOI mau (ShotStage: anh cover, mo nhe + lop toi khi
meta.dark, lop sang khi nen sang -> chu luon noi). Mau phai DE TRONG SUOT cho anh hien ra:
- `useBackdrop()` (runtime) tra `{src, dark}` khi canh co nen anh, null khi khong. `<Stage>` tu bo gradient/quang sang,
  `<GridFloor>` tu an. MOI lop nen PHU KIN man hinh khac do mau tu ve (div / AbsoluteFill co background dac, gradient,
  luoi ke o, luoi cham, hoa van, giay, nhieu hat day, anh mau trang tri) -> khi co backdrop: KHONG ve (hoac trong suot).
  Giu nguyen NOI DUNG (the, panel, giao dien, chu, bieu do, dien thoai...) — do la chu the, khong phai nen.
- Chu nam TRUC TIEP tren nen (khong co the/panel lot) phai DOC RO tren anh that: dung mau theo meta.dark (nen toi ->
  chu sang; nen sang -> chu toi) va them bong do nhe (`textShadow: 0 2px 18px rgba(0,0,0,0.55)` khi toi;
  `0 1px 12px rgba(255,255,255,0.7)` khi sang) CHI khi co backdrop.
- Nen la CHINH hieu ung cua mau (doi theme sang/toi, nen chop sang, nen la vat lieu dang bien doi, overlay chop sang)
  -> meta `"backdrop": false` (giu nen goc). Con lai `"backdrop": true` (mau dung Stage da duoc dat san true — van
  phai kiem: lop dac phu kin nao khac thi xu ly nhu tren, hoac dat false neu nen dac la hieu ung).
- KHONG LUOI KE O: ke ca khi KHONG co backdrop, bo moi luoi ke o / luoi cham trang tri phu nen (giu luoi neu no la
  NOI DUNG: truc bieu do, o lich, ban phim...).
- KHONG DAU GACH: chu mau (sample) va chu co dinh trong code KHONG dung "—" "–" hay " - " lam dau noi / trang tri
  (vd 'SỐ 07 — THÁNG 10' -> 'SỐ 07 · THÁNG 10' hoac tach 2 dong). Dau gach noi trong khoang so ("3-4") giu duoc.
- Kiem: `node scripts/shot-still.mjs <file.tsx> --props p.json` voi `"backdrop": "samples/bg_dark.png"` (anh toi) va
  `"samples/bg_tech.png"`, `"preview": false`, khung doc + ngang: thay ro ANH NEN, chu ro, khong con nen code / luoi.
  Them 1 lan KHONG backdrop: mau van dep nhu cu (khong luoi ke o).
