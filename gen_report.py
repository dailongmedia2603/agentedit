# -*- coding: utf-8 -*-
"""Sinh báo cáo Markdown ĐẦY ĐỦ kho CapCut/JianYing + MÔ TẢ & KHI NÀO DÙNG cho từng mục.
Mô tả suy luận từ tên hiển thị + token trong key (heuristic, để AI đọc và chọn theo ngữ cảnh)."""
import os, sys, re, enum
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "CapCutAPI")); os.chdir(os.path.join(ROOT, "CapCutAPI"))
import pyJianYingDraft as d

OUT = os.path.join(ROOT, "BAO_CAO_KHO_CAPCUT.md")
L=[]; w=lambda s="": L.append(s)
def items(en): o=getattr(d,en,None); return list(o) if o else []
def vip(v): return " ⭐Pro" if getattr(v,"is_vip",False) else ""

# ---------- BỘ TỪ ĐIỂN NGHĨA HÌNH ẢNH (token -> mô tả tiếng Việt) ----------
KW = {
 "flash":"loé sáng chớp","white":"trắng","black":"tối/đen","bw":"đen trắng","mono":"đơn sắc",
 "shake":"rung lắc máy quay","camera":"máy quay","quake":"rung mạnh",
 "zoom":"phóng to (zoom)","mini":"nhẹ","lens":"ống kính","macro":"cận siêu",
 "glitch":"nhiễu/trục trặc số","rgb":"tách màu RGB","chromatic":"sai sắc viền màu","aberration":"viền màu lệch",
 "color":"màu","colour":"màu","blur":"làm mờ","motion":"mờ chuyển động","radial":"mờ toả tròn","gaussian":"mờ mịn",
 "horizontal":"theo chiều ngang","vertical":"theo chiều dọc","fade":"mờ dần","dissolve":"hoà tan","melt":"chảy tan",
 "wipe":"gạt/quét ngang","gradient":"chuyển sắc","sweep":"quét sáng",
 "heart":"trái tim","hearts":"nhiều trái tim","kiss":"nụ hôn","kisses":"nụ hôn","love":"tình yêu","romance":"lãng mạn",
 "star":"ngôi sao","stars":"sao lấp lánh","starry":"trời đầy sao","sparkle":"lấp lánh","twinkle":"lấp lánh nhấp nháy",
 "rain":"rơi như mưa","snow":"tuyết rơi","xmas":"Giáng sinh","petals":"cánh hoa rơi",
 "light":"ánh sáng","leak":"loé sáng lọt khung","glow":"phát sáng","beam":"luồng sáng","flare":"loé ống kính",
 "lightning":"tia chớp/sấm sét","thunder":"sấm","electric":"điện","electro":"điện",
 "fire":"lửa","flame":"ngọn lửa","hellfire":"lửa địa ngục","firework":"pháo hoa","fireworks":"pháo hoa",
 "smoke":"khói","cloud":"mây/khói","fog":"sương",
 "film":"phim nhựa/điện ảnh","cinema":"điện ảnh","cinematic":"điện ảnh","vhs":"băng VHS cũ","retro":"hoài cổ retro",
 "vintage":"cổ điển","old":"cũ kỹ","grain":"hạt phim","reel":"cuộn phim","projector":"máy chiếu",
 "noise":"nhiễu hạt","pixel":"vỡ điểm ảnh (pixel)","mosaic":"ô vuông mờ mặt",
 "spin":"xoay tròn","swirl":"xoáy","whirl":"cuộn xoáy","rotate":"xoay","rotation":"xoay","twist":"vặn xoắn",
 "slide":"trượt","roll":"lăn/cuộn","push":"đẩy","pull":"kéo","drag":"kéo lê",
 "bounce":"nảy","boing":"nảy bật lò xo","elastic":"co giãn đàn hồi","jelly":"rung như thạch","jiggle":"rung lắc nhẹ",
 "flip":"lật mặt","float":"trôi nổi","jump":"nhảy","drop":"rơi xuống","rise":"trồi lên","fall":"rơi",
 "mirror":"phản chiếu đối xứng","kaleidoscope":"vạn hoa","diamond":"hình kim cương lấp lánh",
 "disco":"disco nhấp nháy","strobe":"nhấp nháy mạnh","blink":"chớp tắt","flicker":"chập chờn",
 "heartbeat":"đập như nhịp tim","pulse":"đập theo nhịp","beat":"theo nhịp nhạc",
 "dream":"mơ màng","dreamy":"mơ màng huyền ảo","blurry":"nhoè mờ","soft":"dịu nhẹ",
 "chrome":"ánh kim loại","metal":"kim loại","gold":"vàng kim","neon":"đèn neon","cyber":"công nghệ/cyberpunk",
 "scan":"quét dòng","scanning":"quét dòng","scanlines":"vạch quét","bands":"dải sọc","blinds":"rèm sọc",
 "border":"viền khung","frame":"khung viền","split":"chia khung","grid":"lưới ô",
 "warp":"bẻ cong méo","crack":"nứt vỡ","shatter":"vỡ vụn","explosion":"nổ bung","boom":"nổ","crash":"đập vỡ",
 "magnifier":"kính lúp phóng to","focus":"lấy nét","blackout":"tối sầm","backlit":"ngược sáng",
 "typewriter":"đánh máy từng chữ","verbatim":"hiện từng chữ","caption":"phụ đề",
 "wave":"gợn sóng","ripple":"lăn tăn","water":"nước","liquid":"chất lỏng","ink":"loang mực",
 "fold":"gấp lại","unfold":"mở ra","open":"mở ra","close":"đóng lại","curtain":"màn kéo",
 "concentrate":"dồn tụ vào","converge":"hội tụ","expand":"giãn nở","enlarge":"phóng to chữ",
 "anime":"hoạt hình anime","cartoon":"hoạt hình","comic":"truyện tranh","emoji":"biểu tượng cảm xúc",
 "halftone":"chấm bi in báo","sketch":"phác hoạ chì","oil":"sơn dầu","watercolor":"màu nước",
 # mở rộng vốn từ
 "angel":"thiên thần/hào quang","aura":"hào quang phát sáng quanh người","halo":"vòng hào quang",
 "ghost":"bóng ma trong suốt","spirit":"linh hồn","ethereal":"huyền ảo","glow":"phát sáng",
 "butterfly":"bướm bay","butterflies":"đàn bướm bay","bird":"chim bay","bee":"ong bay",
 "binoculars":"khung ống nhòm","binocular":"ống nhòm","aperture":"khẩu độ ống kính","angle":"góc nhìn",
 "big":"phóng to (hài hước)","head":"đầu","mouth":"miệng","face":"khuôn mặt","eyes":"mắt",
 "burn":"cháy sém","bubbles":"bong bóng nổi","bubble":"bong bóng","balloon":"bóng bay",
 "camcorder":"khung máy quay cũ (REC)","camera":"máy quay","rec":"đang quay (REC)",
 "blocks":"khối vỡ ô vuông","brush":"nét cọ vẽ","blanch":"chớp trắng loá","ink":"loang mực",
 "bullet":"bình luận bay (bullet screen)","screen":"màn hình","danmaku":"bình luận bay",
 "bright":"sáng bừng","idea":"bóng đèn ý tưởng","blue":"xanh dương","red":"đỏ","green":"xanh lá","pink":"hồng",
 "lines":"đường kẻ","line":"đường kẻ","grid":"lưới ô","dots":"chấm bi","circle":"hình tròn",
 "apparate":"hiện ra bất chợt","appear":"xuất hiện","disappear":"biến mất","reveal":"hé lộ",
 "backlit":"ngược sáng viền","fireplace":"lò sưởi ấm áp","candle":"nến","lantern":"đèn lồng",
 "bisect":"chia đôi khung","domino":"đổ dây chuyền","split":"tách đôi","mirror":"phản chiếu đối xứng",
 "breathing":"phồng xẹp như thở","drift":"trôi dạt","wave":"gợn sóng","glow":"phát sáng",
 "rainbow":"cầu vồng","prism":"lăng kính tán sắc","crystal":"pha lê","glitter":"nhũ lấp lánh",
 "money":"tiền rơi","coin":"đồng xu","cash":"tiền","crown":"vương miện","trophy":"cúp",
 "tears":"nước mắt","cry":"khóc","laugh":"cười","angry":"tức giận","question":"dấu hỏi","exclaim":"dấu chấm than",
 "smoke":"khói","steam":"hơi nước","dust":"bụi bay","spark":"tia lửa","sparks":"tia lửa bắn",
 "horror":"kinh dị","scary":"đáng sợ","spooky":"rùng rợn","zombie":"xác sống","blood":"máu",
 "wedding":"đám cưới","birthday":"sinh nhật","party":"tiệc tùng","celebrate":"ăn mừng",
 "summer":"mùa hè","winter":"mùa đông","autumn":"mùa thu","spring":"mùa xuân","sun":"nắng","moon":"trăng",
 "city":"thành phố","street":"đường phố","road":"con đường","sky":"bầu trời","ocean":"biển","beach":"bãi biển",
 "tv":"màn hình tivi","static":"nhiễu sọc tivi","signal":"mất tín hiệu","error":"báo lỗi","loading":"đang tải",
 "freeze":"đóng băng dừng hình","frozen":"đóng băng","ice":"băng giá","glass":"kính vỡ","broken":"vỡ nứt",
 "neon":"đèn neon rực","cyberpunk":"cyberpunk tương lai","matrix":"mã số rơi (Matrix)","hacker":"kiểu hacker",
 "vignette":"tối 4 góc (vignette)","spotlight":"đèn rọi điểm","flashlight":"đèn pin quét",
}
# OVERRIDE: mô tả đã xác minh (web/kiến thức) cho tên cryptic/nổi tiếng
OVERRIDES = {
 "astral":"Bóng ma/phân thân — tạo vệt mờ ethereal như hồn lìa khỏi xác. Dùng cho khoảnh khắc siêu thực, ảo, chuyển cảnh huyền bí.",
 "bad_tv":"Nhiễu TIVI HỎNG — vạch quét, méo hình như tivi trục trặc. Hợp đoạn tiêu cực/hỗn loạn hoặc chuyển cảnh glitch.",
 "bw_vhs":"Băng VHS đen trắng cũ — nhiễu hạt, vạch băng từ. Tông HOÀI NIỆM/retro, kể chuyện quá khứ.",
 "chromozoom":"Zoom giật kèm TÁCH MÀU RGB ở rìa — nhấn cú punch năng lượng cao, hợp beat nhạc/câu gắt.",
 "big_head":"Bóp méo PHÓNG TO ĐẦU — hài hước, nhấn phản ứng bất ngờ/chế giễu.",
 "big_mouth":"Bóp méo PHÓNG TO MIỆNG — hài hước, nhấn lúc nói/hét.",
 "rgb_border":"Viền RGB tách màu quanh khung — nhấn căng thẳng/công nghệ, hợp đoạn 'thuật toán/AI'.",
 "level_glitch":"Trục trặc dữ liệu nhiều lớp — mạnh hơn glitch thường, hợp cao trào tiêu cực.",
 "snow_glitch":"Nhiễu hạt tuyết + glitch — lạnh lẽo, trục trặc.",
 "heart_disco":"Tim bay nhấp nháy kiểu disco — vui, tích cực, 'thả tim'.",
 "heart_magnifier":"Tim phóng to bằng kính lúp — đáng yêu, nhấn cảm xúc.",
 "electro_heart":"Tim điện neon — yêu thích/năng lượng.",
 "light_leak":"Loé sáng lọt khung kiểu film analog — ấm, điện ảnh, chuyển cảnh mượt/cảm xúc.",
 "diamond_zoom":"Zoom kèm lấp lánh kim cương — sang, nhấn thành công/đắt giá.",
 "mini_zoom":"Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá.",
 "zoom_lens":"Zoom kiểu ống kính máy ảnh — nhấn chủ thể, lấy nét.",
 "camera_shake":"Rung máy quay chân thực — nhấn cú sốc/mạnh, tăng năng lượng.",
 "retro_film":"Tông phim nhựa cũ — hạt, ngả màu. HOÀI NIỆM/kể chuyện.",
 "film_frame":"Khung viền cuộn phim — phong cách điện ảnh/máy chiếu.",
 "bullet_screen":"Bình luận bay ngang màn hình (danmaku) — kiểu livestream, tương tác đông vui.",
 "bright_idea":"Bóng đèn ý tưởng bật sáng — khoảnh khắc 'À ha!', nhấn mẹo/insight.",
 "by_the_fireplace":"Ánh lửa lò sưởi ấm áp — cozy, tâm sự nhẹ nhàng.",
 "blockbuster":"Phong cách bom tấn điện ảnh — hoành tráng, nhấn mở đầu.",
 "starry":"Bầu trời đầy sao lấp lánh — mơ mộng/tích cực.",
}
def toks(s):
    parts = re.sub(r'(?<!^)(?=[A-Z])',' ',s).replace('_',' ')
    parts = re.sub(r'\d+',' ',parts)
    return [p.lower() for p in parts.split() if p]

CAT_BASE = {
 "transition":"Dùng để CHUYỂN giữa 2 cảnh khi cắt.",
 "scene":"Phủ TOÀN khung — nhấn không khí/cao trào.",
 "character":"BÁM theo người — nhấn vào nhân vật.",
 "intro":"Cách ảnh/clip overlay XUẤT HIỆN.",
 "outro":"Cách ảnh/clip overlay BIẾN MẤT.",
 "combo":"Animation chạy LẶP/tổ hợp cho ảnh.",
 "tintro":"Cách CHỮ XUẤT HIỆN (pop theo nhịp nói).",
 "toutro":"Cách CHỮ BIẾN MẤT.",
 "tloop":"CHỮ chuyển động LẶP suốt lúc hiện.",
 "mask":"Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask.",
 "filter":"Chỉnh TÔNG MÀU cả khung tạo mood.",
 "font":"Kiểu chữ cho caption/tiêu đề.",
}
# ngữ cảnh cảm xúc theo nhóm token (ưu tiên trên xuống)
EMO = [
 ({"glitch","rgb","noise","bw","black","bad","vhs","crack","shatter","blackout","static","distort","mosaic","pixel","aberration"},
  "Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại)."),
 ({"shake","flash","explosion","lightning","boom","strobe","crash","quake","impact","thunder"},
  "Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng."),
 ({"heart","hearts","kiss","kisses","love","star","stars","starry","sparkle","twinkle","firework","fireworks","gold","diamond","disco","glow","bling"},
  "Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc."),
 ({"film","retro","vintage","old","grain","vhs","reel","projector","sketch"},
  "Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại."),
 ({"fade","dissolve","blur","dream","dreamy","float","smoke","cloud","soft","water","ripple"},
  "Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng."),
]
def describe(key, display, cat):
    # 1) override đã xác minh (khớp cả biến thể _1/_2 và bỏ dấu _ cuối)
    kl = key.lower().rstrip("_")
    base_kl = re.sub(r'_\d+$','',kl)
    if kl in OVERRIDES: return OVERRIDES[kl]
    if base_kl in OVERRIDES: return OVERRIDES[base_kl] + " (biến thể)"
    tk = toks(key)+toks(display)
    seen=set(); vis=[]
    for t in tk:
        if t in KW and KW[t] not in seen:
            seen.add(KW[t]); vis.append(KW[t])
    emo=""
    tset=set(tk)
    for group,hint in EMO:
        if tset & group: emo=" "+hint; break
    base=CAT_BASE.get(cat,"")
    if vis:
        what=", ".join(vis[:3]); what=what[0].upper()+what[1:]
        return f"{what}. {base}{emo}"
    # fallback honest khi tên mơ hồ
    return f"(Suy từ tên '{display}') {base}{emo} — nên xem Bảng thử để chắc."

# ---------- bộ sinh bảng ----------
def tbl(en, cat, kind="effect"):
    its=items(en); w(f"> Tổng **{len(its)}** mục.\n")
    w("| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |")
    w("|---|---|---|---|---|")
    for i,m in enumerate(its,1):
        v=m.value
        disp=getattr(v,"name",None) or getattr(v,"title","") or m.name
        desc=describe(m.name, disp, cat)
        extra=""
        if kind=="effect":
            ps=getattr(v,"params",None) or []
            extra="; ".join(f"{p.name}={p.default_value:g}[{p.min_value:g}~{p.max_value:g}]" for p in ps) or "—"
        elif kind=="anim":
            du=getattr(v,"duration",None); extra=f"{du/1e6:.2f}s" if du else "—"
        elif kind=="trans":
            du=getattr(v,"default_duration",None); extra=(f"{du/1e6:.2f}s" if du else "—")+("/chồng" if getattr(v,"is_overlap",False) else "")
        w(f"| {i} | `{m.name}`{vip(v)} | {disp} | {desc} | {extra} |")
    w()

# =================== BÁO CÁO ===================
w("# BÁO CÁO KHO TÀI NGUYÊN CAPCUT — kèm MÔ TẢ & KHI NÀO DÙNG\n")
w("Trích trực tiếp từ metadata repo CapCutAPI. **Mục tiêu:** để AI đọc + phân tích video gốc rồi CHỌN hiệu ứng đúng ngữ cảnh.\n")
w("> ⚠️ **Về cột Mô tả:** suy luận từ TÊN + tham số (chưa xem tận mắt từng cái). Rất đáng tin với tên rõ "
  "(`Fade_Out`, `Shake`, `White_Flash`...); cái nào ghi *'(Suy từ tên...)'* là tên mơ hồ → nên xác minh bằng `build_swatch.py`.\n")
w("> **CapCut vs JianYing:** máy đặt `is_capcut_env=true` → bộ **CapCut** (PHẦN A) là bộ chạy thật. JianYing ở PHẦN C.\n")

# ----- PHẦN 0: BẢNG TRA THEO TÌNH HUỐNG (cho AI chọn nhanh) -----
w("\n---\n# PHẦN 0 — BẢNG TRA THEO TÌNH HUỐNG (AI dùng để chọn nhanh)\n")
w("| Tình huống trong video | Scene/Char effect gợi ý | Transition | Text animation |")
w("|---|---|---|---|")
rows=[
 ("Hook mở đầu, gây chú ý","`Zoom_Lens`, `Star_Rain`, `Mini_Stars`","`White_Flash`, `Twinkle_Zoom`","`Bounce_In`, `Blow_In`"),
 ("Số liệu tiền/thành công/tăng","`Star_Rain`, `Heart_Disco`, `Mini_Stars`","`Light_Beam`","`Bounce_In`"),
 ("View tụt / thuật toán / tiêu cực","`Color_Glitch`, `RGB_Border`, `Glitch`, `Noise`","`RGB_Glitch`, `Color_Glitch`","`Faulty_text`, `Flicker`"),
 ("Cú đấm / nói thẳng / tức giận","`Shake`, `Camera_Shake`, `Black_Flash`","`BW_Flash`, `Shake_3`","`Boing`, `Flip_Verbatim`"),
 ("Cảnh báo / mất mát (mất trắng)","`Black_Flash`, `Lightning`, `Blackout`","`Black_Fade`","`Flicker`"),
 ("Chuyển mạch / đổi chủ đề","`Motion_Blur`","`White_Flash`, `Pull_in`, `Dissolve`","—"),
 ("Tâm sự / cảm xúc lắng","`Light_leak`, `Heartbeat`","`Dissolve`, `Black_Fade`","`Fade_In`, `Float_Down`"),
 ("Hoài niệm / kể chuyện cũ","`Retro_Film`, `Film_Frame`","`Black_smoke`","`Typewriter`-like"),
 ("Câu chốt / kết video","`Heartbeat`, `Light_leak`","`White_Flash`","`Bounce_In`"),
]
for a,b,c,e in rows: w(f"| {a} | {b} | {c} | {e} |")
w("\n> Bảng trên là gợi ý chính; danh sách đầy đủ + mô tả từng cái ở dưới.\n")

# ----- PHẦN A: CAPCUT -----
w("\n---\n# PHẦN A — BỘ CAPCUT (chạy thật)\n")
w("## A1. Transition — Chuyển cảnh\n**Áp dụng:** `add_video/add_image(transition=\"<key>\", transition_duration=...)`\n")
tbl("CapCut_Transition_type","transition","trans")
w("## A2. Scene effect — Hiệu ứng cảnh (toàn khung)\n**Áp dụng:** `add_effect(effect_type=\"<key>\", effect_category=\"scene\")`\n")
tbl("CapCut_Video_scene_effect_type","scene","effect")
w("## A3. Character effect — Hiệu ứng bám người\n**Áp dụng:** `add_effect(effect_type=\"<key>\", effect_category=\"character\")`\n")
tbl("CapCut_Video_character_effect_type","character","effect")
w("## A4. Intro animation (ảnh/video)\n**Áp dụng:** `add_image(intro_animation=\"<key>\")`\n")
tbl("CapCut_Intro_type","intro","anim")
w("## A5. Outro animation (ảnh/video)\n**Áp dụng:** `add_image(outro_animation=\"<key>\")`\n")
tbl("CapCut_Outro_type","outro","anim")
w("## A6. Group/Combo animation (ảnh)\n**Áp dụng:** `add_image(combo_animation=\"<key>\")`\n")
tbl("CapCut_Group_animation_type","combo","anim")
w("## A7. Text intro — Chữ vào\n**Áp dụng:** `add_text(intro_animation=\"<key>\")`\n")
tbl("CapCut_Text_intro","tintro","anim")
w("## A8. Text outro — Chữ ra\n**Áp dụng:** `add_text(outro_animation=\"<key>\")`\n")
tbl("CapCut_Text_outro","toutro","anim")
w("## A9. Text loop — Chữ chuyển động lặp\n")
tbl("CapCut_Text_loop_anim","tloop","anim")
w("## A10. Mask — Mặt nạ/khuôn hình\n**Áp dụng:** `add_video/add_image(mask_type=\"<key>\")`\n")
its=items("CapCut_Mask_type"); w(f"> Tổng **{len(its)}** mục.\n")
w("| # | key | Tên | Mô tả & khi nào dùng |"); w("|---|---|---|---|")
for i,m in enumerate(its,1):
    disp=getattr(m.value,'name',m.name); w(f"| {i} | `{m.name}` | {disp} | {describe(m.name,disp,'mask')} |")
w()

# ----- PHẦN B: CHUNG -----
w("\n---\n# PHẦN B — DÙNG CHUNG\n")
w("## B1. Filter — Bộ lọc màu / tông\n**Lưu ý:** API hiện chưa có tool add_filter trực tiếp; kho có sẵn để mở rộng.\n")
tbl("Filter_type","filter","effect")
w("## B2. Font — Phông chữ\n**Áp dụng:** `add_text(font=\"<key>\")`. (Mô tả font dựa trên độ đậm trong tên; cần thử dấu tiếng Việt.)\n")
its=items("Font_type"); w(f"> Tổng **{len(its)}** mục.\n")
w("| # | key | Tên | Gợi ý |"); w("|---|---|---|---|")
def font_hint(name):
    n=name.lower()
    if any(x in n for x in["black","heavy","ultra","extrabold","bold"]): return "Rất đậm — hợp TIÊU ĐỀ/keyword to"
    if any(x in n for x in["semibold","medium"]): return "Đậm vừa — tiêu đề phụ"
    if any(x in n for x in["light","thin","hairline"]): return "Mảnh — chữ trang trí/nền"
    if "italic" in n: return "Nghiêng — nhấn/trích dẫn"
    return "Thường — thân chữ/phụ đề"
for i,m in enumerate(its,1):
    disp=getattr(m.value,'name',m.name); w(f"| {i} | `{m.name}` | {disp} | {font_hint(m.name)} |")
w()
w("## B3. ÂM THANH — Voice filter & Voice changer (XỬ LÝ GIỌNG)\n")
w("> ⚠️ Đây là hiệu ứng **xử lý giọng nói** (vọng âm, méo, đổi chất giọng), KHÔNG phải SFX hay nhạc nền. "
  "**Kho KHÔNG có sẵn SFX (whoosh/ding/boom) và nhạc nền** — muốn dùng phải đưa **file audio** rồi gắn qua `add_audio(audio_url=...)`.\n")
AUDIO_DESC = {
 # Voice filters (lọc/biến đổi âm)
 "echo":"Vọng âm vang — như trong hang/phòng lớn. Nhấn câu kết, kịch tính, hù dọa.",
 "megaphone":"Loa phóng thanh méo tiếng — hô hào, châm biếm, kiểu 'thông báo'.",
 "vinyl":"Đĩa than cũ, ấm + nhiễu lo-fi — tông hoài niệm.",
 "lofi":"Lo-fi trầm đục, chill — nền thư giãn.",
 "synth":"Tổng hợp điện tử — tương lai/công nghệ.",
 "deep":"Giọng TRẦM hơn — nghiêm trọng hoặc hài.",
 "low":"Giọng thấp/trầm.","high":"Giọng CAO the thé — hài hước.",
 "energetic":"Giọng phấn khích, bật năng lượng.","sweet":"Giọng ngọt ngào, dễ thương.",
 "big_house":"Vang vọng phòng lớn/sảnh.","low_battery":"Méo rè như sắp hết pin — hài.",
 "tremble":"Run rẩy, rung giọng — sợ hãi/hồi hộp.","electronic":"Điện tử robot.",
 "mic_hog":"Ồm như giành mic karaoke.",
 # Voice characters (đổi nhân vật giọng)
 "robot":"Giọng NGƯỜI MÁY — công nghệ/AI, hài.","chipmunk":"Giọng sóc chít cao the thé — hài hước.",
 "squirrel":"Giọng sóc nhanh cao — hài.","elf":"Giọng yêu tinh Giáng sinh.","elfy":"Giọng yêu tinh.",
 "santa":"Giọng ông già Noel trầm ấm — dịp lễ.","queen":"Giọng nữ hoàng kiêu sa.",
 "bestie":"Giọng bạn thân trẻ trung.","jessie":"Giọng nhân vật nữ.","good_guy":"Giọng 'người tốt' ấm áp.",
 "distorted":"Méo loạn — kinh dị/hỗn loạn.","trickster":"Giọng tinh nghịch/lừa lọc.","fussy_male":"Giọng nam khó tính/càu nhàu.",
 "folk":"Hát hoá lời nói theo điệu dân ca (speech-to-song).",
}
def tbl_audio(en):
    its=items(en); w(f"> Tổng **{len(its)}** mục.\n")
    w("| # | key (API) | Mô tả & khi nào dùng |"); w("|---|---|---|")
    for i,m in enumerate(its,1):
        k=m.name.lower().lstrip("_")
        desc=AUDIO_DESC.get(k, f"Biến đổi/lọc giọng '{getattr(m.value,'name',m.name)}' — đổi chất giọng theo persona/môi trường.")
        w(f"| {i} | `{m.name}`{vip(m.value)} | {desc} |")
    w()
w("### B3a. CapCut Voice filters (lọc âm — 15)\n**Áp dụng:** xử lý track audio/giọng.\n"); tbl_audio("CapCut_Voice_filters_effect_type")
w("### B3b. CapCut Voice characters (đổi giọng nhân vật — 13)\n"); tbl_audio("CapCut_Voice_characters_effect_type")
w("### B3c. CapCut Speech-to-song (hát hoá lời nói)\n"); tbl_audio("CapCut_Speech_to_song_effect_type")
w("### B3d. (JianYing) Audio scene effect — 43 & Tone/voice — 57 (tên tiếng Trung)\n")
w("> Chỉ dùng khi is_capcut_env=false. Liệt kê key để đầy đủ:\n")
w("**Audio scene (JianYing):** "+", ".join(f"`{m.name}`" for m in items("Audio_scene_effect_type"))+"\n")
w("**Tone/voice (JianYing):** "+", ".join(f"`{m.name}`" for m in items("Tone_effect_type"))+"\n")

# Keyframe
w("## B5. Keyframe property — thuộc tính tạo chuyển động\n**Áp dụng:** `add_video_keyframe(property_type=\"<key>\", time, value)`\n")
KF={"position_x":"Vị trí ngang [-1..1] — di chuyển trái/phải; dùng làm hiệu ứng trượt.",
 "position_y":"Vị trí dọc [-1..1] — lên/xuống.","rotation":"Xoay ('45deg') — nghiêng/quay.",
 "scale_x":"Phóng ngang.","scale_y":"Phóng dọc.","uniform_scale":"Zoom đều — punch-in nhấn.",
 "alpha":"Độ mờ ('50%') — hiện/ẩn dần.","saturation":"Bão hoà [-1..1] — rực/nhạt màu.",
 "contrast":"Tương phản [-1..1].","brightness":"Độ sáng [-1..1] — tối/sáng dần.","volume":"Âm lượng."}
w("| # | key | Mô tả & khi nào dùng |"); w("|---|---|---|")
for i,m in enumerate(items("Keyframe_property"),1): w(f"| {i} | `{m.name}` | {KF.get(m.name,'')} |")
w()

# ----- PHẦN C: JIANYING (key only) -----
w("\n---\n# PHẦN C — BỘ JIANYING (chỉ khi is_capcut_env=false)\n")
w("Tên hiển thị tiếng Trung; liệt kê key cho đầy đủ (không mô tả từng cái).\n")
for title,en in [("C1 Transition","Transition_type"),("C2 Scene","Video_scene_effect_type"),
 ("C3 Character","Video_character_effect_type"),("C4 Intro","Intro_type"),("C5 Outro","Outro_type"),
 ("C6 Group","Group_animation_type"),("C7 Text intro","Text_intro"),("C8 Text outro","Text_outro"),
 ("C9 Text loop","Text_loop_anim"),("C10 Mask","Mask_type")]:
    its=items(en); w(f"**{title}** ({len(its)}): "+", ".join(f"`{m.name}`" for m in its)+"\n")

open(OUT,"w",encoding="utf-8").write("\n".join(L))
print("Đã ghi:",OUT,"|",len(L),"dòng |",os.path.getsize(OUT),"bytes")
