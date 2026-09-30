# NGÔN NGỮ DỰNG REMOTION — BỐ CỤC (scenes) + LỚP ĐỒ HOẠ (layers) + TÀI NGUYÊN (assets)

Bộ dựng vẽ ĐÚNG những gì mô tả ở đây. Trường/giá trị không có trong tài liệu sẽ bị bỏ.

## 1. HỆ TOẠ ĐỘ VÀ THỜI GIAN
- Khung 1080×1920 (dọc 9:16). `x`, `y` = 0..1 theo bề NGANG / bề CAO (0,0 = góc trên-trái).
  Lớp đặt theo ĐIỂM NEO `anchor` (mặc định `center`; còn `left|right|top|bottom`).
- `w` = phần bề ngang, `h` = phần bề cao. `size` (cỡ chữ) = px ở khung rộng 1080.
- VÙNG AN TOÀN: đặt nội dung trong y 0.07..0.80 — dải dưới y>0.82 bị giao diện TikTok/Reels che.
- MẶT NGƯỜI NÓI: `face` trong dữ liệu (0..1 của khung A-roll). Không đặt chữ/hình đè lên mặt; chữ nhấn thường
  đặt NGANG NGỰC (dưới cằm) hoặc TRÊN ĐẦU.
- THỜI GIAN: mọi scene/layer bám lời nói khai theo GIỜ NGUỒN: `"source_id"`, `"src_start"`, `"src_end"`
  (lấy từ transcript/start_cuc_bo). Engine tự đổi sang giờ timeline. Không tự tính giờ timeline.

## 2. SCENES — BỐ CỤC A-ROLL THEO THỜI GIAN
Mỗi scene phủ một khoảng; các scene nối tiếp, không chồng. Khoảng không có scene = `full`.
```json
{"layout": "split", "source_id": "source_1", "src_start": 12.0, "src_end": 15.2,
 "panel": {"asset": "office", "kenburns": "in"}, "morph": 0.25}
```
- `full`: A-roll toàn khung (mặc định).
- `split`: B-roll nửa TRÊN (`panel`), A-roll nửa DƯỚI (tự căn theo mặt). `panel_ratio` 0.4–0.55 (mặc định 0.5).
- `card`: NỀN (`bg`, màu do phong cách của video này quyết) + A-roll trong THẺ BO GÓC phía dưới (`card_y` = mép trên thẻ, 0.45–0.7,
  mặc định 0.6). `"popout": true` = đầu người TRỒI RA khỏi mép trên thẻ (hệ thống tự tách người khỏi nền) — chỉ
  bật khi hợp phong cách; `popout_ext` 0.08–0.25 = phần trồi (0.14 nếu không ghi). Khoảng trống phía trên
  (y 0.06 → card_y − popout_ext − 0.05) dành cho ảnh / lớp minh hoạ / tiêu đề.
- `circle`: A-roll trong KHUNG TRÒN (`circle_y` 0.2–0.5, `circle_d` 0.5–0.85 bề ngang) trên nền `bg`
  hoặc trên ảnh `panel` (vd ảnh chụp màn hình). `"popout": true` = đầu trồi ra khỏi vòng tròn.
- `broll`: B-roll TOÀN KHUNG; tiếng A-roll vẫn chạy bên dưới (L-cut/J-cut).
- `graphic`: chỉ NỀN + các lớp đồ hoạ (cảnh minh hoạ / cảnh tiêu đề); tiếng A-roll vẫn chạy.
- `bg`: `{"kind": "gradient", "colors": ["#F7C9A6", "#E0703A"], "angle": 165, "pattern": "curves|grid|dots|rays|none"}`
  hoặc `{"kind": "image", "asset": "<id>", "blur": 0, "grade": "bw"}`.
- `panel`: `{"asset": "<id>", "kenburns": "in|out|left|right|up|none", "grade": "bw|cinematic|...", "blur": 0}`
  hoặc lấy CẢNH KHÁC trong video nguồn làm B-roll: `{"source_id": "source_1", "src_time": 42.0}` (video chạy
  từ giây đó, tắt tiếng) — hợp khi nguồn có cảnh cận sản phẩm / thao tác minh hoạ đúng lời đang nói.
- `morph` (giây, 0–0.5): khung A-roll trượt/co giãn MƯỢT từ bố cục trước sang bố cục này. 0 = cắt thẳng.

## 3. ASSETS — TÀI NGUYÊN HÌNH (khai 1 lần, dùng bằng `asset` id)
```json
{"id": "post", "kind": "ai_image", "illustrates": "đăng bài lên Facebook, fanpage và nhóm",
 "prompt": "<(1) chủ thể cụ thể đúng câu nói> <(2) hành động> <(3) bối cảnh thật> <(4) góc máy + cỡ cảnh> <(5) ánh sáng> <(6) chất liệu / phong cách + bảng màu CỦA VIDEO NÀY> <(7) bố cục + khoảng trống cho chữ>", "aspect": "3:4", "cutout": false}
{"id": "sp", "kind": "source_frame", "source_id": "source_1", "src_time": 12.3, "cutout": false}
```
- `ai_image`: ảnh tạo bằng AI (~1 phút/ảnh, TỐI ĐA 6 ảnh/video). `illustrates` = CÂU NÓI (tiếng Việt, chép từ
  transcript) mà ảnh minh hoạ. `prompt` TIẾNG ANH ≥ 40 từ, đủ 7 phần: (1) chủ thể CỤ THỂ đúng câu nói (2) hành động
  (3) bối cảnh thật (4) góc máy + cỡ cảnh (5) ánh sáng (6) chất liệu/phong cách + bảng màu hợp video (7) bố cục: một
  chủ thể rõ + khoảng trống cho chữ. Không yêu cầu chữ/số/logo trong ảnh. Hệ thống tự gửi kèm BỐI CẢNH (câu đang
  nói lúc ảnh hiện, vị trí ảnh trên màn hình, chữ hiện cùng lúc, chủ đề video) cho AI tạo ảnh.
- `cutout: true` = tách nền → PNG trong suốt (nhân vật, sản phẩm, icon 3D đặt đè lên video/nền).
- `source_frame`: khung tĩnh lấy từ video nguồn (vd cận sản phẩm) — không tốn thời gian tạo.
- Dùng: scene `panel.asset`, `bg.asset`, layer `image.asset`.

## 4. LAYERS — LỚP ĐỒ HOẠ
Trường chung:
```json
{"id": "l1", "type": "text", "source_id": "source_1", "src_start": 3.2, "src_end": 5.0, "track": 20,
 "x": 0.5, "y": 0.62, "anchor": "center", "rotation": 0, "skewX": -8, "scale": 1, "opacity": 1,
 "enter": {"preset": "letters_blur", "duration": 0.35, "stagger": 0.03},
 "exit": {"preset": "fade", "duration": 0.2},
 "loop": {"preset": "float", "amount": 0.5},
 "keyframes": [{"t": 0, "scale": 0.8}, {"t": 0.35, "scale": 1.0, "easing": "back_out"}],
 "replaces_subtitle": true, "sfx": "whoosh"}
```
- `track`: thứ tự LỚP (số lớn đè số nhỏ). 10–60 = trên video, dưới phụ đề; ≥100 = trên cả phụ đề.
- `replaces_subtitle: true`: lớp chữ nhấn THAY phụ đề trong lúc hiện (phụ đề tạm ẩn) — dùng cho chữ nhấn lớn
  giữa khung để không hai khối chữ đánh nhau.
- `behind_subject: true`: lớp nằm SAU NGƯỜI (giữa nền video và người nói) — chữ to đặt ngang đầu, đầu che
  một phần chữ, hai bên chữ lộ ra. Chỉ khi A-roll `full`. Hệ thống tự tách
  người, tự đo ĐỈNH ĐẦU và đặt chữ ngang đó, canh giữa theo đầu → chữ phải RỘNG (≥ 0.8 bề ngang, 1–2 từ
  in hoa cỡ 170–240). Chữ phụ (viết tay / nghiêng) của cùng tổ hợp để lớp RIÊNG, KHÔNG behind, cùng `group`.
  Người chỉ được che TỐI ĐA ~20% khối chữ và gần như không che NỬA TRÊN chữ (đo bằng mặt nạ tách người thật);
  che nhiều hơn thì hệ thống nâng cả tổ hợp lên / thu nhỏ, vẫn không được thì đưa chữ ra TRƯỚC người, trên đầu.
- `group`: tên tổ hợp. Các lớp cùng group đi CÙNG NHAU khi hệ thống phải dời một lớp (né mặt, neo đỉnh đầu)
  → giữ nguyên khoảng cách giữa các tầng chữ. Luôn đặt group cho các tầng của một lockup.
- Né mặt tự động (A-roll full): chữ đè lên mặt sẽ bị dời xuống dưới cằm / lên trên đầu / thu nhỏ; chữ to
  rộng không còn chỗ thì tự chuyển thành `behind_subject`. Muốn chủ động thì tự đặt `behind_subject`.
- `sfx`: gợi ý tiếng khi lớp xuất hiện: `whoosh | swoosh | pop | click | ding | boom | riser | typing`
  (bộ tiếng motion graphics có sẵn, âm lượng tự cân theo giọng).
- `keyframes`: `t` tính từ lúc lớp bắt đầu; thuộc tính `x y scale scaleX rotation skewX opacity blur`;
  `easing` của đoạn DẪN TỚI keyframe đó.

### Loại lớp
- `text` — chữ, nhiều SPAN (mỗi span 1 font/màu/cỡ riêng) → tổ hợp chữ (lockup):
  `spans`: `[{"text", "font", "size", "weight", "italic", "uppercase", "color", "gradient": ["#FFF3C4", "#E3A33B"],
  "glow": {"color": "#FF1E1E", "size": 40}, "stroke": {"width": 6, "color": "#000"}, "newline": true, "dy": -0.1, "opacity"}]`
  Cấp lớp: `font size weight italic uppercase color gradient letterSpacing lineHeight align maxWidth`,
  `stroke`, `shadow: [{"x":0,"y":6,"blur":18,"color":"rgba(0,0,0,.55)"}]`, `glow`,
  `box: {"color": "rgba(35,26,24,.85)", "radius": 0.02, "padX": 0.03, "padY": 0.012, "blur": 8}` (hộp nền sau chữ),
  `reveal: "dim_to_bright"` (chữ hiện mờ rồi SÁNG DẦN từng từ theo lời nói — thẻ trích dẫn / prompt).
- `box` (w, h, `fill` / `fillGradient`, `radius`, `border`, `shadow`) · `circle` (w, fill) · `ring` (w, `strokeColor`,
  `strokeWidth`; enter `draw` = vòng tự vẽ) · `line` / `arrow` (`points`: [[x,y],[x,y]], `curve` -0.6..0.6,
  `strokeColor`, `strokeWidth`; enter `draw`) · `image` (`asset`, w, h?, `fit`, `mask`: none|round|circle,
  `radius`, `border`, `shadow`; loop `kenburns`) ·
  `badge` (huy hiệu tròn: w, `label`, `value`, `active`) · `counter` (số chạy: `from`, `to`, `prefix`, `suffix`,
  `decimals` + kiểu chữ như text) · `progress` (thanh: w, h, `to` 0–100) ·
  `speedlines` (vệt tốc độ toả ra từ x,y — nhấn mạnh / tập trung).
  KHÔNG có loại `emoji`: icon emoji / ký hiệu unicode (🔒 🔥 ✅ ⭐…) trông thô → bị bỏ. Cần icon thì dùng `image` với
  ảnh AI 3D cắt nền (`cutout: true`) hoặc hình học (`ring`, `arrow`, `badge`, `box`).

### Font (chỉ các id này — đều đủ dấu tiếng Việt)
`gilroy` (sans đậm tròn, phụ đề) · `be_vietnam_pro` · `montserrat` (có nghiêng 800/900) ·
`anton` (đậm HẸP cực mạnh, chữ nhấn) · `barlow_condensed` (đậm hẹp, có NGHIÊNG 800/900) · `oswald` ·
`roboto_condensed` · `bungee` (chữ biển hiệu) · `baloo_2` (tròn vui) · `lexend` ·
`great_vibes` (VIẾT TAY bay bướm) · `dancing_script` (viết tay) · `playfair_display` (serif, có NGHIÊNG — số to sang).
Nghiêng: `"italic": true` (font không có bản nghiêng thật thì tự xiên). Độ nghiêng mạnh hơn: `skewX` -6..-14.

### Hiệu ứng VÀO (`enter.preset`)
Cả khối: `fade` · `pop` (nảy) · `scale_in` · `zoom_out` (từ to về + mờ) · `blur_in` · `slide_left|slide_right|slide_up|slide_down`
(có motion blur) · `rise` · `drop` (rơi nảy) · `expand_y` (mở ra từ một VẠCH ngang — chữ nhấn) ·
`stretch_x` (kéo giãn ngang) · `wipe` / `write_on` (lộ dần trái→phải — chữ viết tay) · `spin_in` · `flip` ·
`draw` (vòng / đường / mũi tên tự vẽ) · `glitch_in`.
Theo từng CHỮ CÁI / TỪ (chỉ lớp text, có `stagger` giây): `letters_blur` (từng chữ cái mờ→rõ) · `words_blur` ·
`typewriter` (gõ phím) · `words_pop` · `letters_drop` · `words_rise` · `letters_fade`.
### Hiệu ứng RA (`exit.preset`): `fade` · `pop_out` · `blur_out` · `shrink` · `wipe_out` · `slide_left|right|up|down`.
### Lặp (`loop.preset`, `amount`, `speed`): `float` · `bob` · `pulse` · `wiggle` · `shake` · `spin` · `kenburns`.
### Easing: `linear` · `ease_in` · `ease_out` · `ease_in_out` · `expo_out` · `back_out` · `back_in` · `elastic_out` · `bounce_out`.

## 5. HIỆU ỨNG CAMERA (effects[]) — trên khung A-roll, neo giờ nguồn
`zoom_punch` (punch-in câu chốt) · `ken_burns` · `zoom_out_reveal` · `shake` · `flash` · `rgb_split` · `bw` ·
`vignette` · `blur_focus` · `light_leak` · `letterbox` · `pulse` · `film_grain` ·
`fisheye` (ống kính mắt cá — hook) · `focus` (mờ + tối viền, rõ giữa — "tập trung") · `pan_left` · `pan_right`.
Jump-cut zoom (mỗi đoạn một cỡ khung) do engine lấy từ `scale` của segment.

## 6. QUY TẮC CHỮ (hệ thống kiểm bằng code — sai sẽ bị sửa / bỏ)
1. Không icon thô: không `emoji`, không ký hiệu emoji trong chữ, không `emoji_pop`.
2. THỨ TỰ ĐỌC = THỨ TỰ LỜI NÓI: đọc trên → dưới, trái → phải. Cụm NÓI TRƯỚC nằm TRÊN / bên TRÁI.
   Lời "rất dễ bị khoá nick" → `rất dễ bị` (nhỏ) ở TRÊN, `KHOÁ NICK` (to) ở DƯỚI. Hệ thống tự xếp lại theo mốc
   lời nói (Whisper) nếu đặt ngược — cả span trong một lớp lẫn các lớp cùng `group`.
3. Chữ RÕ NÉT: chữ chính tô ĐẶC (không chữ viền rỗng / mờ); tương phản ≥ 4.5 với nền thật phía sau (hệ thống
   đo độ sáng khung video / ảnh sau khối chữ) — thiếu thì tự thêm viền tối mảnh + bóng sát chữ. `glow.size`
   ≤ 0.3 × cỡ chữ (glow dày làm nhoè cạnh chữ). Chữ đỏ phát sáng trên nền sáng → phải có viền tối.
4. Chữ đè lên nhau (`dy` âm / hai lớp chồng): chồng tối đa 0.3em; tầng NẰM TRÊN phải KHÁC MÀU rõ với tầng dưới
   và có viền tách (`stroke` 4–10px màu tối). Hai tầng cùng màu chồng lên nhau → hệ thống đổi màu tầng trên.
5. PHÂN CẤP: mỗi tổ hợp đúng 1 tầng chính (chữ in đậm, to nhất khi NHÌN); tầng phụ khác font nhỏ rõ
   (cỡ nhìn thấy ≤ 75% tầng chính — chữ viết tay great_vibes/dancing_script nhìn chỉ ~0.6 lần cỡ khai báo);
   cùng font khác màu cùng cỡ = một tầng nhấn màu (được). ≤ 3 tầng, ≤ 2 font / tổ hợp; tổ hợp nhiều font:
   tầng chính ≥ 84px, tầng phụ ≥ 40px; chữ rộng quá 94% khung bị thu nhỏ.

## 7. VÍ DỤ CÚ PHÁP (KHÔNG phải phong cách — màu / font / cỡ là CHỖ TRỐNG `<...>`)
Chỉ để thấy cách viết trường. Phong cách thật lấy từ `style_kit` (video mẫu) hoặc do bạn tự thiết kế cho
video này — KHÔNG chép màu, font, kiểu chữ của ví dụ, KHÔNG dùng cùng một khuôn cho mọi video.
Tổ hợp 2 lớp cùng `group` (lời "<cụm nói trước> <cụm nói sau>" → cụm nói trước ở TRÊN):
```json
{"id": "a1", "group": "g1", "type": "text", "source_id": "source_1", "src_start": 3.2, "src_end": 4.8, "x": 0.5, "y": 0.30,
 "spans": [{"text": "<cụm nói trước>", "font": "<id font phụ>", "size": <cỡ>, "color": "<màu>"}], "enter": {"preset": "<preset>"}}
{"id": "a2", "group": "g1", "type": "text", "source_id": "source_1", "src_start": 3.4, "src_end": 4.8, "x": 0.5, "y": 0.38,
 "spans": [{"text": "<CỤM CHÍNH>", "font": "<id font chính>", "size": <cỡ lớn>, "color": "<màu nhấn>",
            "stroke": {"width": <px>, "color": "<màu viền tương phản nền>"}}], "enter": {"preset": "<preset>"}}
```
Một lớp nhiều span (tầng dưới chồng nhẹ lên tầng trên bằng `dy` âm, có viền tách):
```json
{"type": "text", "x": 0.5, "y": 0.6, "replaces_subtitle": true,
 "spans": [{"text": "<cụm 1>", "font": "<id>", "size": <cỡ>, "color": "<màu>"},
           {"text": "<cụm 2>", "font": "<id>", "size": <cỡ>, "color": "<màu khác hẳn>", "newline": true, "dy": -0.12,
            "stroke": {"width": <px>, "color": "<màu tách>"}}],
 "shadow": [{"x": 0, "y": <px>, "blur": <px>, "color": "<màu bóng>"}], "enter": {"preset": "<preset>"}}
```
Cơ chế có sẵn (dùng khi HỢP nội dung, không bắt buộc): chữ sau người (`behind_subject`), số chạy (`counter`),
thẻ trích dẫn sáng dần theo lời (`reveal: "dim_to_bright"` + `box`), hàng huy hiệu (`badge` + `active`),
vòng tự vẽ (`ring` + enter `draw`), mũi tên chỉ vật (`arrow` + `points`), vệt tốc độ (`speedlines`).
