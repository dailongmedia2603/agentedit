#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""THIET KE CHUYEN DONG cho luong Video Remotion: BO CUC (scenes) + LOP DO HOA (layers)
+ TAI NGUYEN HINH (assets) + hieu ung camera, theo BO PHONG CACH (style kit).

- Bo phong cach: CHI co khi dung VIDEO MAU (buoc "Video mau", Gemini xem video + dai khung day boc ra
  style_kit, luu kem phan tich video mau do trong thu vien). KHONG co phong cach mac dinh / luu chung
  (user 2026-09-27: app edit nhieu loai video — moi video tu co phong cach). Khong video mau -> R4 tu thiet
  ke phong cach cho RIENG video nay tu noi dung + yeu cau, ghi vao "style" cua plan, het phien la het.
- R4 (_RM_DESIGN_SYSTEM): GPT thiet ke theo bo phong cach + tai lieu ngon ngu dung
  (references/remotion-dsl.md) + thuat ngu edit (references/edit-glossary.md).
- scenes_to_spec / layers_to_spec: lop BAO VE bang code — kiem moi truong, kep so, quy doi
  gio nguon -> timeline, tranh de chu len mat, tu gan SFX theo lop. AI viet sai thi bo
  phan tu sai, video van dung duoc.
"""
import os
import copy
import json

import plan_guard
import creative
import prompt_store
import providers
import remotion_plan as RP
import speech_align
import media_vision

HERE = os.path.dirname(os.path.abspath(__file__))

LAYOUTS = ("full", "split", "card", "circle", "broll", "graphic")
LAYER_TYPES = ("text", "box", "circle", "ring", "line", "arrow", "image", "emoji", "badge", "counter", "progress", "speedlines",
               "video")   # video: CHI tu lieu video cua nguoi dung (user_media.py)
ENTER = {"fade", "pop", "scale_in", "zoom_out", "blur_in", "slide", "slide_left", "slide_right", "slide_up", "slide_down",
         "rise", "drop", "expand_y", "stretch_x", "wipe", "write_on", "spin_in", "flip", "draw", "glitch_in",
         "letters_blur", "words_blur", "typewriter", "words_pop", "letters_drop", "words_rise", "letters_fade"}
EXIT = {"fade", "pop_out", "blur_out", "shrink", "wipe_out", "slide_left", "slide_right", "slide_up", "slide_down"}
LOOP = {"float", "bob", "pulse", "wiggle", "shake", "spin", "kenburns"}
EASING = {"linear", "ease_in", "ease_out", "ease_in_out", "expo_out", "back_out", "back_in", "elastic_out", "bounce_out"}
KENBURNS = {"in", "out", "left", "right", "up", "none"}
PATTERNS = {"curves", "grid", "dots", "rays", "none"}
MAX_AI_IMAGES = 6
MAX_LAYERS_PER_10S = 8
# LUAT CHU CO TIENG (user 2026-10-01): moi chu hien ra deu co tieng; KHONG con tran so SFX (tran 16 cu lam chu sau
# giay ~56 mat tieng). Mot tieng bat dau trong [t - EARLY, t + LATE] cua luc chu hien = chu do da co tieng (hep: tieng
# cua chu ke ben vao sau 0.3s khong duoc tinh cho chu nay — loi that 'TOÁN' an ke tieng cua 'THI ĐUA').
TEXT_SFX_TYPES = ("text", "counter", "badge")
TEXT_SFX_EARLY, TEXT_SFX_LATE = 0.15, 0.15
TEXT_SFX_SAME = 0.12     # hai chu hien cach nhau < 0.12s = cung mot nhip -> dung chung mot tieng
DESIGN_VERSION = 4      # doi cach thiet ke / tu kiem -> tang de khong dung lai ket qua R4 cu trong cache
                        # 4 = quy tac chu 2026-09-27 (khong emoji, thu tu doc, phan cap, ro net, lop tach, anh dung boi canh)


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


# ---------------------------------------------------------------------------
# BO PHONG CACH
# ---------------------------------------------------------------------------
def style_kit_for(reference_analysis):
    """Bo phong cach cua PHIEN nay = bo boc tu VIDEO MAU (neu co). Khong video mau -> None: KHONG co ban
    mac dinh nao (truoc 2026-09-27 moi video khong video mau deu bi dung theo phong cach mau1, va bo cua
    video mau con bi tron them phan thieu tu mau1)."""
    ref = (reference_analysis or {}).get("style_kit") if isinstance(reference_analysis, dict) else None
    if not isinstance(ref, dict) or not ref:
        return None
    kit = copy.deepcopy(ref)
    kit["_nguon"] = "video_mau"
    return kit


def session_style(design):
    """Khong video mau: phong cach R4 tu dat cho RIENG video nay ("style" trong ket qua R4) -> kiem id
    font / ma mau. Chi nam trong plan cua du an nay, khong luu chung. None neu R4 khong ghi."""
    st = (design or {}).get("style") if isinstance(design, dict) else None
    if not isinstance(st, dict) or not st:
        return None
    fonts_ok = _fonts()
    out = {"_nguon": "phien_nay"}
    if st.get("mood"):
        out["mood"] = str(st["mood"])[:200]
    pal = st.get("palette") if isinstance(st.get("palette"), dict) else {}
    pal_ok = {}
    for k, v in pal.items():
        if isinstance(v, list):
            vs = [c for c in (_color(x) for x in v) if c][:4]
            if len(vs) >= 2:
                pal_ok[k] = vs
        elif _color(v):
            pal_ok[k] = _color(v)
    if pal_ok:
        out["palette"] = pal_ok
    fonts = st.get("fonts") if isinstance(st.get("fonts"), dict) else {}
    fonts = {r: f for r, f in fonts.items() if f in fonts_ok}
    if fonts:
        out["fonts"] = fonts
    for k in ("image_style", "density", "motion", "layouts_note"):
        if st.get(k):
            out[k] = st[k] if isinstance(st[k], (dict, list)) else str(st[k])[:300]
    if st.get("image_style"):
        out["broll_style"] = str(st["image_style"])[:300]
    return out


def dsl_doc():
    return prompt_store.get_ref("remotion-dsl.md") or ""


def glossary_doc():
    return prompt_store.get_ref("edit-glossary.md") or ""


# ---------------------------------------------------------------------------
# PROMPT R4 — THIET KE
# ---------------------------------------------------------------------------
_RM_DESIGN_SYSTEM = """Ban la MOTION DESIGNER + EDITOR short-form (TikTok/Reels) dung video bang REMOTION.
Nhiem vu: thiet ke TOAN BO lop hinh cua video — BO CUC A-roll theo thoi gian (scenes), TAI NGUYEN hinh (assets),
LOP DO HOA (layers: chu nhan, to hop chu, huy hieu, mui ten, vong, anh, the trich dan...), hieu ung camera
(effects), chuyen canh (transitions) va tong mau (grade). PHU DE loi noi do buoc sau viet — KHONG tao lop phu de.

# DU LIEU DAU VAO
- cau_chuyen: story_arc, tone, nhip_truyen, edit_request (muc dich, khan gia, do dai).
- segments[]: tung doan A-roll tren timeline — source_id, target_start (gio timeline), nguon_tu/nguon_den (gio NGUON),
  beat/purpose, transcript (cau + start_cuc_bo/end_cuc_bo gio NGUON), emotions, key_moments.
- hook (neu co): ban sao doan dat LEN DAU video; muon dat lop/hieu ung len ban sao nay thi them "anchor": "hook".
- faces: vi tri mat nguoi noi trong khung nguon (0..1). KHONG dat chu/hinh de len mat.
- style_kit: CHI CO khi phien nay dung VIDEO MAU — bo phong cach boc tu chinh video mau do (bang mau, font theo
  vai, phu de, bo cuc + ti le, he thong chu, chuyen dong, camera, SFX, phong cach anh, "recipes"). Co style_kit
  -> PHAI theo no; recipes: CHEP CAU TRUC, THAY NOI DUNG.
  style_kit = null -> KHONG co phong cach dinh san nao. Ban TU THIET KE phong cach RIENG cho video nay tu
  NOI DUNG (chu de, san pham, nguoi noi, boi canh trong mo_ta_nguon), cau_chuyen.tone va edit_request (style,
  khan gia, muc dich): mau, font, cach nhan chu, mat do do hoa, bo cuc, chuyen dong, camera, SFX, kieu anh.
  Hai video khac noi dung phai ra hai phong cach khac nhau. KHONG ap mot "khuon" quen thuoc cho moi video
  (vd khong mac dinh chu do phat sang sau dau, the nen cam, vong tron + Follow cuoi video) — chi dung khi
  NOI DUNG / yeu cau that su hop. Ghi quyet dinh phong cach vao "style" (xem schema).

# CACH LAM (theo thu tu)
1. Doc het loi noi, danh dau: cau HOOK (3s dau), CAU CHOT / tu khoa / con so, cho NHAC VAT CU THE (minh hoa duoc
   bang B-roll), cho LIET KE / CAP DO / SO SANH (hop canh graphic), va CTA cuoi.
2. BO CUC: co style_kit -> theo ti le + "when" trong style_kit.layouts. Khong co -> chon bo cuc HOP noi dung:
   video tam su / review can mat nguoi thi phan lon full, chi chen B-roll khi that su minh hoa; video giai thich /
   liet ke nhieu y thi dung them split / card / graphic. Doi bo cuc o RANH GIOI CAU. Moi scene split/broll/card/
   circle PHAI co hinh (panel/bg) that su minh hoa dung loi noi luc do. Khoang khong khai scene = full.
3. TAI NGUYEN: moi hinh can dung khai 1 asset. ai_image TOI DA 6, theo style_kit.broll_style (khong co video mau
   -> kieu anh HOP noi dung, ghi vao style.image_style). San pham / nguoi co
   san trong video nguon -> uu tien source_frame (lay tu chinh video). Vat the / nhan vat dat de len video ->
   "cutout": true. Moi ai_image co "illustrates" = CAU NOI (tieng Viet, chep tu transcript) ma anh minh hoa.
   "prompt" TIENG ANH, >= 40 tu, du 7 phan theo thu tu:
   (1) CHU THE cu the dung noi dung cau noi (khong chung chung: noi "dang bai len Facebook, fanpage, nhom" ->
       "a laptop screen showing a social-media feed with a new post being published to a page and a group";
       KHONG phai "a cute robot"); (2) HANH DONG / trang thai; (3) BOI CANH that (noi chon, do vat, nguoi Viet neu
       co nguoi); (4) GOC MAY + co canh; (5) ANH SANG; (6) CHAT LIEU / phong cach (photoreal cinematic / 3D render /
       ...) + bang mau hop video; (7) BO CUC: 1 chu the ro, chua khoang trong cho chu (vd "empty space in upper third").
   Ve SAN PHAM / nhan vat co trong video -> mo ta DUNG theo mo_ta_nguon (mau, hinh dang, chat lieu). KHONG yeu cau
   chu / so / logo trong anh.
4. LOP DO HOA: cau chot / tu khoa / con so / ten rieng dang nhan -> lop chu nhan theo he thong chu cua style_kit
   (khong co -> he thong chu ban tu dat trong "style", hop tone). Chu nhan 1-4 tu, dung chinh ta tieng Viet co dau. Dat src_start
   DUNG luc tu do duoc noi (start_cuc_bo cua tu), src_end khi het y (1-3s). To hop lon giua khung ->
   "replaces_subtitle": true. Them hinh ho tro dung luc: huy hieu cap do, mui ten chi vat, vong tron, bo dem so,
   anh cutout 3D chat luong cao (ai_image "cutout": true). KHONG dung emoji / icon emoji (xem QUY TAC CHU).
   Mat do theo style_kit.motion.density (khong co -> theo tone: nhe nhang / tam su it lop, nang dong / hai nhieu hon);
   KHONG qua 8 NHIP xuat hien moi 10 giay (cac lop vao cach nhau <0.6s tinh 1 nhip).
   Moi lop chu PHAI theo QUY TAC THIET KE CHU ben duoi.
5. CHUYEN DONG: moi lop co enter (+ exit neu can) theo style_kit.motion (khong co -> hop tone); to hop nhieu tang thi cac tang vao
   LECH NHAU 0.1-0.3s (src_start khac nhau hoac stagger) de tao nhip. Dung keyframes khi can chuyen dong rieng
   (vd lop truot qua khung, phong to dan). Easing mem (ease_out / back_out), khong chay deu cung.
6. CAMERA: theo style_kit.camera (khong co -> chon theo noi dung; hieu ung manh chi khi tone can). Hieu ung manh
   cach nhau >= 2.5s.
7. SFX: MOI lop CHU / bo dem / huy hieu PHAI co "sfx" (whoosh / swoosh / pop / click / boom / riser / ding / typing)
   HOP voi chinh chu do: cach no hien (truot -> swoosh, bat ra -> pop, go chu -> typing, dap manh -> boom), y nghia
   (con so -> ding, cau chot soc -> boom) va cam xuc / tone (nhe nhang -> tieng nhe: click / swoosh). Theo
   style_kit.sfx neu co. Lop hinh khac (anh, vong, mui ten) xuat hien dang ke cung nen co tieng. Cac tang cua CUNG
   mot to hop vao cung luc dung chung 1 tieng; to hop vao lech nhip thi moi nhip mot tieng. Thieu -> he thong tu gan.
8. KET THUC: CTA cuoi video neu edit_request / noi dung can; hinh thuc CTA hop phong cach video nay.

# CHI TIEU — CHI KHI CO style_kit (video mau): he thong DEM theo CHINH style_kit (ti le bo cuc, mat do
  motion.density, recipes, anh B-roll) va tra lai de bo sung neu thieu. Khong co video mau -> khong co chi tieu
  co dinh: mat do, so bo cuc, so anh la do ban quyet theo noi dung.
- style_kit.recipes (neu co): dung >= 3 cong thuc KHAC nhau, ghi "recipe": "<ten>" vao lop dung no; chep
  CAU TRUC (so tang, font tung tang, co, mau, glow, nghieng, sau/truoc nguoi, box), THAY chu cho dung loi noi.
- Moi scene split / broll / card-co-panel PHAI co hinh (ca hai che do).

# QUY TAC THIET KE CHU (BAT BUOC — he thong kiem bang code, sai se bi sua / bo)
1. KHONG ICON THO: cam loai lop "emoji", cam emoji / ky hieu unicode trong chu (🔒 🔥 ✅ ❌ ⭐ ...), cam hieu ung
   emoji_pop. Can minh hoa bang hinh -> anh 3D render / anh that cat nen chat luong cao (ai_image "cutout": true)
   hoac hinh hoc sach (ring, arrow, line, badge, box).
2. THU TU DOC = THU TU LOI NOI: nguoi xem doc TREN -> DUOI, TRAI -> PHAI. Trong mot to hop, tang nao duoc NOI
   TRUOC phai nam TREN (hoac ben TRAI). Vd loi noi "rat de bi khoa nick" -> "rat de bi" (nho, viet tay) nam TREN,
   "KHOA NICK" (to) nam DUOI. SAI: "KHOA NICK" o tren roi "rat de bi" o duoi. Spans trong 1 lop cung vay: span dau
   = cum noi truoc; "newline" xuong dong theo dung thu tu cau.
3. CHU RO NET, DE DOC: chu chinh to DAC (khong chu chi co vien rong, khong mau mo/trong suot); mau chu tuong phan
   manh voi nen phia sau (chu sang tren nen toi, hoac co vien toi mong 2-6px / bong do sat chu). Glow chi la quang
   NHE (size <= 0.3 x co chu), khong dung glow CUNG MAU chu tren nen sang (vd chu do glow do tren tuong go sang ->
   phai co vien toi). Khong de chu nam tren vung nen nhieu chi tiet ma khong co vien / bong / hop nen.
4. ANH AI DUNG BOI CANH: xem buoc 3 — prompt 7 phan, "illustrates" la cau noi ma anh minh hoa.
5. CHU SAU NGUOI: chi dung khi chu RONG (>= 0.8 be ngang) va dau nguoi CHE TOI DA ~20% khoi chu — nua tren cua
   chu phai lo ra gan het de van doc duoc TRON TU. Chu hep / ngan -> dat truoc nguoi (tren dau hoac duoi cam).
   Tang phu cung to hop (dat truoc nguoi) KHONG duoc nam de len mat.
6. CHU DE LEN NHAU: duoc cho cac tang cua lockup de len nhau mot chut (toi da ~0.3em, "dy" >= -0.3) NHUNG tang nam
   tren PHAI co lop tach ro: KHAC MAU ro rang voi tang duoi (vd duoi trang -> tren vang / do) + vien tach day
   ("stroke" 4-10px mau toi) hoac bong dam — khong de hai tang cung mau chong len nhau (kho doc).
7. PHAN CAP THI GIAC: moi to hop CO DUNG 1 tang chinh (chu in dam, to nhat khi NHIN, mang y chinh); tang phu
   nho ro va nhe hon (viet tay / serif nghieng / chu thuong): khac font thi co nhin thay <= 60-75% tang chinh
   (chu viet tay nhin chi ~0.6 lan co khai bao); toi da 3 tang, toi da 2 font / to hop; cac tang can thang hang
   (cung align), khoang cach deu; co chu toi thieu: tang chinh >= 90px, tang phu >= 40px. Moi thoi diem chi
   MOT khoi chu nhan noi bat tren man hinh.

# RANG BUOC
- Chi dung truong / gia tri co trong TAI LIEU NGON NGU DUNG ben duoi. Font chi cac id trong tai lieu.
- Moi phan tu neo GIO NGUON ("source_id" + "src_start" + "src_end"). Khong tu tinh gio timeline.
- Vung an toan y 0.07..0.80. Chu nhan thuong dat ngang nguc (duoi cam) hoac tren dau — xem faces.
- Scene khong chong nhau. Moi asset khai ra phai duoc dung.

# SCHEMA DAU RA (CHI JSON)
{
  "concept": "1-2 cau: phong cach ap dung cho video NAY va vi sao hop noi dung / yeu cau",
  "style": {"mood": "<cam giac thi giac>", "palette": {"primary": "#..", "accent": "#..", "highlight": "#..",
            "text": "#..", "bg_gradient": ["#..", "#.."]},
            "fonts": {"impact": "<id>", "support": "<id>", "body": "<id>"},
            "image_style": "<kieu anh minh hoa, tieng Anh>", "density": "<so nhip do hoa / 10s>"},
  "assets": [{"id": "<id>", "kind": "ai_image", "illustrates": "<cau noi anh minh hoa>", "prompt": "<7 phan, tieng Anh>",
              "aspect": "<ti le>", "cutout": false}],
  "scenes": [{"layout": "<layout>", "source_id": "source_1", "src_start": 12.0, "src_end": 15.2,
              "panel": {"asset": "<id>"}, "why": "..."}],
  "layers": [{"id": "l1", "type": "text", "source_id": "source_1", "src_start": 3.2, "src_end": 5.0, "track": 30,
              "x": 0.5, "y": 0.6, "spans": [...], "enter": {...}, "exit": {...}, "why": "..."}],
  "effects": [{"type": "<id>", "source_id": "source_1", "src_start": 0.0, "src_end": 1.2, "intensity": 0.6}],
  "transitions": [{"segment_index": 3, "type": "<id>", "duration": 0.3}],
  "hook_transition": {"type": "<id>", "duration": 0.3},
  "grade": {"preset": "<id>", "intensity": 0.5}
}
"style": BAT BUOC khi style_kit = null (phong cach ban tu dat cho video nay). Co style_kit thi bo qua.
Gia tri trong schema chi la CHO TRONG (placeholder) — khong phai goi y phong cach.
CHI tra ve JSON."""


# Noi vao cuoi prompt R4 (luong duy nhat tu 2026-09-28). Giu NGUYEN chu: day la ban user da test + duyet.
_NEW_FLOW_NOTE = """

# LUONG EDIT MOI (dang bat)
Hieu ung hinh (camera / vet / anh sang / rung...) do BUOC RIENG tu de xuat + tu viet code theo tung khoanh khac.
O buoc nay: KHONG khai "effects" (de mang rong []) va KHONG dung lop "speedlines". Van thiet ke day du bo cuc,
tai nguyen anh, lop chu / hinh ho tro, chuyen canh, tong mau."""


def gpt_rm_design(segments, transcript_data, emotion_map_data, key_moments_data, story=None,
                  reference_analysis=None, hook=None, faces=None, log=None, sources=None, user_media=None,
                  brand=None):
    """user_media: tu lieu cua nguoi dung (user_media.normalize + ensure_analyzed) -> R4 thay muc dich + phan tich
    Gemini + so do, dat vao dung luc noi toi. Khong co tu lieu -> prompt + payload y nhu truoc (cache cu dung lai)."""
    kit = style_kit_for(reference_analysis)
    seg_context = []
    for i, seg in enumerate(segments or []):
        sid = seg.get("source_id", "")
        st, en = providers._f(seg.get("start")), providers._f(seg.get("end"))
        trans = []
        for t in (transcript_data or {}).get(sid, []) or []:
            if not isinstance(t, dict) or not (t.get("text") or "").strip():
                continue
            a, b = providers._f(t.get("start")), providers._f(t.get("end"))
            if a < en and b > st:
                row_t = {"text": t.get("text", ""), "start_cuc_bo": round(a, 2), "end_cuc_bo": round(b, 2)}
                if t.get("emphasis"):
                    row_t["emphasis"] = t["emphasis"]
                if t.get("is_punchline"):
                    row_t["is_punchline"] = True
                trans.append(row_t)
        row = {"segment_index": i, "source_id": sid, "target_start": seg.get("target_start", 0),
               "nguon_tu": st, "nguon_den": en, "transcript": trans,
               "emotions": [{"emotion": e.get("emotion"), "intensity": e.get("intensity")}
                            for e in (emotion_map_data or {}).get(sid, []) or []
                            if providers._overlap(providers._f(e.get("start")), providers._f(e.get("end")), st, en)],
               "key_moments": [k for k in (key_moments_data or {}).get(sid, []) or []
                               if providers._overlap(providers._f(k.get("start")), providers._f(k.get("end")), st, en)]}
        row.update(providers._nhip_cua_segment(seg))
        seg_context.append(row)
    kit_public = {k: v for k, v in kit.items() if not k.startswith("_")} if kit else None
    payload = {"cau_chuyen": story or {}, "hook": hook, "segments": seg_context, "faces": faces or {},
               # mo ta hinh anh nguon (Gemini) -> anh AI ve DUNG san pham / boi canh that
               "mo_ta_nguon": [{k: sv.get(k) for k in ("id", "summary", "on_screen_text") if sv.get(k)}
                               for sv in sources or [] if isinstance(sv, dict)],
               "style_kit": kit_public,
               "tong_do_dai_giay": round(sum(providers._f(s.get("end")) - providers._f(s.get("start")) for s in segments or []), 1)}
    ref = providers.phong_cach_cho_buoc(reference_analysis, "effects")
    if ref:
        payload["phong_cach_mau"] = ref
    sys_prompt = (_p("_RM_DESIGN_SYSTEM")
                  + "\n\n# TAI LIEU NGON NGU DUNG (chi dung dung cac truong nay)\n" + dsl_doc()
                  + "\n\n# THUAT NGU EDIT (ap dung dung cho)\n" + glossary_doc()
                  + "\n\n# DANH MUC REMOTION (transition / effect / grade):\n" + RP._catalog_block()
                  + _NEW_FLOW_NOTE + creative.luat("R4"))
    if user_media:
        import user_media as UM
        payload["tu_lieu_nguoi_dung"] = UM.planner_view(user_media)
        sys_prompt += UM.r4_note()
    import brand_guide
    if brand_guide.view(brand, "plan"):
        # Brand Guideline (ca 5 mat) -> thiet ke bo cuc / lop chu / anh AI / chuyen dong theo thuong hieu; khong co
        # thi prompt + payload y nhu truoc (cache cu dung lai)
        payload["brand_guideline"] = brand_guide.view(brand, "plan")
        sys_prompt += brand_guide.rule_text(brand, "plan")
    if log:
        log("R4: %s thiet ke bo cuc + lop do hoa (%s)..." % (
            providers.plan_ai_name(), "theo bo phong cach video mau" if kit else "khong video mau: tu thiet ke theo noi dung"))
    text = providers.plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=24000, temperature=0.5, req_timeout=300, max_attempts=2,
        step_label="R4-design")
    res = _as_design(providers._safe_json(text))
    thieu = audit_design(res, kit, payload["tong_do_dai_giay"], has_hook=bool(hook), user_media=user_media)
    if thieu and (res.get("scenes") or res.get("layers")):
        # 1 vong tu sua: code dem chi tieu -> GPT bo sung (giu phan da tot)
        if log:
            log("R4: thiet ke con thieu %d chi tieu -> %s bo sung: %s" % (len(thieu), providers.plan_ai_name(), "; ".join(thieu)[:300]))
        fix_user = dict(payload)
        fix_user["ban_thiet_ke_truoc"] = res
        fix_user["thieu_can_bo_sung"] = thieu
        fix_user["yeu_cau"] = ("Sua ban_thiet_ke_truoc cho DAT moi muc trong thieu_can_bo_sung, giu cac phan da tot, "
                               "tra lai TOAN BO JSON theo schema.")
        text2 = providers.plan_chat([
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": json.dumps(fix_user, ensure_ascii=False)},
        ], json_mode=True, max_tokens=24000, temperature=0.4, req_timeout=300, max_attempts=2,
            step_label="R4-design-fix")
        res2 = _as_design(providers._safe_json(text2))
        thieu2 = audit_design(res2, kit, payload["tong_do_dai_giay"], has_hook=bool(hook), user_media=user_media)
        if (res2.get("scenes") or res2.get("layers")) and len(thieu2) <= len(thieu):
            res, thieu = res2, thieu2
    # hieu ung KHONG lay tu kho mau — buoc FX tu thiet ke + viet code theo boi canh (luat hook o prompt FX)
    res["effects"] = []
    res["layers"] = [L for L in res.get("layers") or [] if not (isinstance(L, dict) and L.get("type") == "speedlines")]
    res["_audit"] = thieu
    res.setdefault("grade", ((kit or {}).get("camera") or {}).get("grade") or {"preset": "none", "intensity": 0})
    return res


def _as_design(res):
    if not isinstance(res, dict):
        res = {}
    for k in ("assets", "scenes", "layers", "effects", "transitions"):
        if not isinstance(res.get(k), list):
            res[k] = []
    return res


def _density_min(kit):
    """So nhip do hoa toi thieu / 10s doc tu style_kit.motion.density ('2-4 lop / 10 giay', 3, ...). None neu khong ro."""
    import re as _r
    d = ((kit or {}).get("motion") or {}).get("density") if isinstance((kit or {}).get("motion"), dict) else None
    if isinstance(d, (int, float)):
        return float(d)
    m = _r.search(r"(\d+(?:[.,]\d+)?)", str(d or ""))
    return float(m.group(1).replace(",", ".")) if m else None


def audit_design(d, kit, duration, has_hook=True, user_media=None):
    """Dem chi tieu thiet ke (khong goi AI). Tra danh sach muc con thieu (tieng Viet khong dau).

    - Luon kiem: scene split/broll phai co hinh (loi cau truc, khong phai phong cach).
    - Chi khi CO style_kit (video mau): dem theo CHINH style_kit do — ti le bo cuc khac full, cac loai bo cuc
      no dung, mat do motion.density, recipes, anh B-roll. Khong video mau -> khong ep phong cach nao
      (truoc 2026-09-27 moi video deu bi ep >= 3 bo cuc, to hop nhieu tang moi 12s... theo mau1)."""
    D = max(1.0, float(duration or 0))
    out = []
    scenes = [x for x in d.get("scenes") or [] if isinstance(x, dict) and x.get("layout") in LAYOUTS]
    nonfull = [x for x in scenes if x.get("layout") != "full"]
    assets = {a.get("id"): a for a in d.get("assets") or [] if isinstance(a, dict)}
    # tu lieu cua nguoi dung = tai nguyen dang ky san (R4 dung thang id, khong khai lai)
    known = set(assets) | {it["id"] for it in user_media or [] if it.get("kind") == "image" or it.get("kind") == "video"}
    for x in nonfull:
        if x["layout"] in ("split", "broll") and not ((x.get("panel") or {}).get("asset") in known or (x.get("panel") or {}).get("source_id")):
            out.append("scene %s %.1f-%.1fs chua co hinh panel" % (x["layout"], float(x.get("src_start") or 0), float(x.get("src_end") or 0)))
    if user_media:
        import user_media as UM
        out += UM.audit(d, user_media)
    if not kit:
        return out
    lays = [r for r in kit.get("layouts") or [] if isinstance(r, dict) and r.get("layout") in LAYOUTS]
    share_nonfull = sum(providers._f(r.get("share"), 0) for r in lays if r.get("layout") != "full")
    kit_lay = {r["layout"] for r in lays if r.get("layout") != "full" and providers._f(r.get("share"), 0) > 0}
    if share_nonfull > 0.05:
        need = max(1, int(D * min(share_nonfull, 0.8) / 5.0))     # ~5s / scene
        if len(nonfull) < need:
            out.append("bo cuc: video mau dung ~%.0f%% thoi gian bo cuc khac full, moi co %d scene, can >= %d"
                       % (share_nonfull * 100, len(nonfull), need))
        kinds = {x["layout"] for x in nonfull}
        want = min(3, len(kit_lay)) if D >= 20 else min(1, len(kit_lay))
        if len(kinds & kit_lay) < want:
            out.append("bo cuc: video mau dung %s, moi dung %s" % (sorted(kit_lay), sorted(kinds) or "0"))
    n_ai = sum(1 for a in assets.values() if a.get("kind") == "ai_image")
    if kit.get("broll_style") and kit_lay & {"split", "broll", "card"} and D >= 20 and n_ai < 1:
        out.append("tai nguyen: video mau co B-roll minh hoa (%s) nhung chua co ai_image nao" % str(kit.get("broll_style"))[:60])
    layers = [L for L in d.get("layers") or [] if isinstance(L, dict)]
    dens = _density_min(kit)
    if dens:
        starts = sorted(float(L.get("src_start") or 0) for L in layers)
        beats, last = 0, None
        for t in starts:
            if last is None or abs(t - last) >= 0.6:
                beats, last = beats + 1, t
        need_b = max(1, int(D / 10.0 * dens))
        if beats < need_b:
            out.append("lop do hoa: video mau ~%s nhip / 10s, moi %d nhip, can >= %d" % (dens, beats, need_b))
    recipes = [r.get("name") for r in kit.get("recipes") or [] if isinstance(r, dict) and r.get("name")]
    if recipes:
        used = {L.get("recipe") for L in layers if L.get("recipe")}
        if len(used) < min(3, len(recipes)):
            out.append("cong thuc: moi dung %d recipe (%s), can >= %d trong %s" % (
                len(used), ", ".join(sorted(str(u) for u in used)) or "-", min(3, len(recipes)), recipes))
    return out


def _raw_text(L):
    if not isinstance(L, dict):
        return ""
    if L.get("type") == "counter":
        return "%s%s%s" % (L.get("prefix") or "", L.get("to") if L.get("to") is not None else "", L.get("suffix") or "")
    if L.get("type") == "badge":
        return " ".join(str(L.get(k) or "") for k in ("label", "value")).strip()
    return " ".join(str(sp.get("text") or "") for sp in L.get("spans") or [] if isinstance(sp, dict)) or str(L.get("text") or "")


def layer_texts(layers):
    """Cac lop CHU cua R4 (gio nguon) — cho R5/B7 biet de khong viet trung / dat SFX trung."""
    out = []
    for L in layers or []:
        t = _raw_text(L).strip()
        if not t or L.get("type") not in ("text", "counter", "badge"):
            continue
        row = {k: L.get(k) for k in ("source_id", "src_start", "src_end", "anchor", "sfx") if L.get(k) is not None}
        row["text"] = t[:80]
        if L.get("replaces_subtitle"):
            row["thay_phu_de"] = True
        out.append(row)
    return out


def layers_as_heroes(layers):
    """Lop chu do hoa dang 'chu hero' cho B7: B7 thay chung (va SFX rieng cua chung) de khong dat trung."""
    out = []
    for r in layer_texts(layers):
        h = {k: r[k] for k in ("source_id", "src_start", "src_end", "anchor") if k in r}
        h["role"] = "hero"
        h["text"] = r["text"] + (" [lop do hoa - DA CO SFX '%s' tu dong]" % r["sfx"] if r.get("sfx") else " [lop do hoa]")
        out.append(h)
    return out


# ---------------------------------------------------------------------------
# TAI NGUYEN
# ---------------------------------------------------------------------------
def normalize_assets(assets, source_videos, user_assets=None):
    """Loc + gioi han: ai_image <= 6, id duy nhat, source_frame phai co source that.
    user_assets (user_media.as_assets): tu lieu cua nguoi dung — dang ky TRUOC, R4 khong ghi de duoc; ai_image
    "ref_media" chi giu id anh cua nguoi dung (anh mau gui kem cho AI tao anh)."""
    srcs = {s.get("id"): s for s in source_videos or []}
    out, seen, n_ai = [dict(u) for u in user_assets or []], {u["id"] for u in user_assets or []}, 0
    user_imgs = {u["id"] for u in user_assets or [] if u.get("kind") == "user_image"}
    for a in assets or []:
        if not isinstance(a, dict) or not a.get("id") or a["id"] in seen:
            continue
        kind = a.get("kind")
        if kind == "ai_image":
            if n_ai >= MAX_AI_IMAGES or not (a.get("prompt") or "").strip():
                continue
            n_ai += 1
            asp = a.get("aspect") if a.get("aspect") in ("9:16", "1:1", "3:4", "4:3", "16:9", "2:3", "3:2") else "9:16"
            row = {"id": a["id"], "kind": kind, "prompt": a["prompt"].strip(), "aspect": asp, "cutout": bool(a.get("cutout"))}
            refs = [m for m in a.get("ref_media") or [] if m in user_imgs][:3] if isinstance(a.get("ref_media"), list) else []
            if refs:
                row["ref_media"] = refs
            out.append(row)
        elif kind == "source_frame":
            sid = a.get("source_id") or (next(iter(srcs)) if len(srcs) == 1 else None)
            if sid not in srcs:
                continue
            out.append({"id": a["id"], "kind": kind, "source_id": sid, "src_time": providers._f(a.get("src_time")),
                        "cutout": bool(a.get("cutout"))})
        else:
            continue
        seen.add(a["id"])
    return out


def asset_contexts(design, transcript_data=None, story=None, sources=None, user_media=None, brand=None):
    """BOI CANH cua tung anh AI (yeu cau user 2026-09-27: anh tao ra phai DUNG boi canh noi dung no
    hien thi): cau nguoi noi dang noi luc anh hien, vi tri anh tren man hinh (panel nua tren / nen /
    sticker tach nen...), chu hien cung luc, chu de + giong video, mo ta nguon. {asset_id: ctx}."""
    design = design if isinstance(design, dict) else {}
    uses = {}
    for sc in design.get("scenes") or []:
        if not isinstance(sc, dict):
            continue
        for key, role in (("panel", sc.get("layout") if sc.get("layout") in ("split", "broll", "card", "circle") else "card"),
                          ("bg", "bg")):
            ref = sc.get(key)
            if isinstance(ref, dict) and ref.get("asset"):
                uses.setdefault(ref["asset"], []).append((role, sc))
    for L in design.get("layers") or []:
        if isinstance(L, dict) and L.get("type") == "image" and L.get("asset"):
            uses.setdefault(L["asset"], []).append(("layer_cutout" if L.get("cutout", True) else "layer", L))
    import asset_gen
    texts = [L for L in design.get("layers") or [] if isinstance(L, dict) and L.get("type") in ("text", "counter", "badge")]
    story = story if isinstance(story, dict) else {}
    import brand_guide
    brand_view = brand_guide.view(brand, "image")
    src_desc = "; ".join(str(s.get("summary"))[:200] for s in sources or [] if isinstance(s, dict) and s.get("summary"))
    out = {}
    for a in design.get("assets") or []:
        if not isinstance(a, dict) or a.get("kind") != "ai_image" or not a.get("id"):
            continue
        us = uses.get(a["id"]) or []
        role = us[0][0] if us else ("layer_cutout" if a.get("cutout") else "card")
        if role == "layer_cutout" and not a.get("cutout"):
            role = "layer"
        vai, vung = asset_gen._VAI_TRO.get(role, asset_gen._VAI_TRO["card"])
        loi, chu = [], []
        for _r, el in us:
            sid = el.get("source_id")
            st = providers._f(el.get("src_start"))
            en = providers._f(el.get("src_end"), st + 3.0)
            for t in providers._gon_loi_thoai((transcript_data or {}).get(sid), st - 0.4, en + 0.4):
                if t["text"] not in loi:
                    loi.append(t["text"])
            for L in texts:
                if L.get("source_id") in (None, sid) and providers._overlap(
                        providers._f(L.get("src_start")), providers._f(L.get("src_end"), 0), st, en):
                    t_ = _raw_text(L).strip()
                    if t_ and t_ not in chu:
                        chu.append(t_)
        mau = []
        for m in a.get("ref_media") or []:
            it = next((x for x in user_media or [] if x.get("id") == m), None)
            if it:
                an = it.get("analysis") or {}
                mau.append("; ".join(v for v in (an.get("chu_the"), an.get("dac_diem_nhan_dien"), it.get("note")) if v)
                           or it.get("name") or m)
        ctx = {"vai_tro": vai, "vung_trong": vung,
               "anh_mau": " | ".join(mau)[:600],
               "loi_noi": " … ".join(loi)[:600],
               "minh_hoa": str(a.get("illustrates") or a.get("why") or "")[:300],
               "chu_de": str(story.get("story_arc") or "")[:400],
               "tone": str(story.get("tone") or "")[:120],
               "chu_tren_anh": " / ".join(chu)[:200],
               "boi_canh_nguon": src_desc[:400]}
        bv = brand_view
        if bv:
            # Brand Guideline: mau / ngon ngu do hoa / phong cach hinh anh (nam trong khoa cache cua anh)
            ctx["thuong_hieu"] = bv
        out[a["id"]] = {k: v for k, v in ctx.items() if v}
    return out


def resolve_assets(assets, source_videos, style="", log=None, contexts=None):
    """Tao / cat anh cho moi asset -> gan "path" (+ "cutout"). Asset hong -> "error".
    contexts: {asset_id: boi canh} (asset_contexts) -> prompt tao anh day du."""
    import asset_gen
    srcs = {s.get("id"): s for s in source_videos or []}
    by_id = {a["id"]: a for a in assets}
    ai = [a for a in assets if a["kind"] == "ai_image" and not a.get("path")]
    if ai:
        # anh mau = ban lam viec cua anh nguoi dung (dung chieu, <= 2400px) -> Codex nhan qua -i
        res = asset_gen.gen_many([{"id": a["id"], "prompt": a["prompt"], "aspect": a["aspect"], "cutout": a["cutout"],
                                   "context": (contexts or {}).get(a["id"]),
                                   "refs": [by_id[m]["path"] for m in a.get("ref_media") or []
                                            if m in by_id and os.path.isfile(by_id[m].get("path") or "")]} for a in ai],
                                 style=style, log=log)
        for a in ai:
            r = res.get(a["id"]) or {}
            if r.get("path"):
                a["path"] = r["path"]
                if r.get("cutout"):
                    a["cutout_path"] = r["cutout"]
            else:
                a["error"] = r.get("error") or "khong tao duoc"
    for a in assets:
        if a["kind"] == "source_frame" and not a.get("path"):
            sv = srcs.get(a["source_id"]) or {}
            r = asset_gen.source_still(sv.get("path"), a["src_time"], a["cutout"]) if sv.get("path") else None
            if r and r.get("path"):
                a["path"] = r["path"]
                if r.get("cutout"):
                    a["cutout_path"] = r["cutout"]
            else:
                a["error"] = "khong cat duoc khung nguon"
    return assets


def _asset_path(assets_by_id, aid, want_cutout=None):
    a = assets_by_id.get(aid)
    if not a or not a.get("path") or not os.path.isfile(a["path"]):
        return None
    if (want_cutout if want_cutout is not None else a.get("cutout")) and a.get("cutout_path"):
        # ban tach cua plan cu (truoc khi lam sach bong / lop mo) -> tach lai dung cho do (co bo nho dem)
        cut = media_vision.lift_subject(a["path"], a["cutout_path"])
        if cut and os.path.isfile(cut):
            return cut
        if os.path.isfile(a["cutout_path"]):
            return a["cutout_path"]          # may khong tach lai duoc -> giu ban cu
    return a["path"]


def is_cutout(assets_by_id, aid, path):
    """Lop anh dang dung ban TACH NEN (PNG trong suot) -> bong theo VIEN vat the, khong theo khung chu nhat."""
    a = assets_by_id.get(aid) or {}
    return bool(path) and (path == a.get("cutout_path") or bool(a.get("alpha")))


# ---------------------------------------------------------------------------
# BO CUC -> SPEC
# ---------------------------------------------------------------------------
def _num(v, dflt, lo, hi):
    return RP._clamp(providers._f(v, dflt), lo, hi)


def _video_colors(p, sc_raw):
    """Mau nen LAY TU CHINH VIDEO (khung nguon luc scene bat dau): mau trung binh -> gradient toi dan.
    Dung khi khong co bo phong cach nao ghi mau nen — khong cai san mau nao."""
    import subprocess
    try:
        import numpy as np
        sid = sc_raw.get("source_id")
        sv = next((v for v in p.get("source_videos") or [] if v.get("id") == sid), None) or \
            next(iter(p.get("source_videos") or []), None)
        if not sv or not os.path.isfile(sv.get("path") or ""):
            return None
        r = subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-ss", "%.2f" % providers._f(sc_raw.get("src_start")),
                            "-i", sv["path"], "-frames:v", "1", "-vf", "scale=16:28", "-f", "rawvideo",
                            "-pix_fmt", "rgb24", "-"], capture_output=True, timeout=60)
        a = np.frombuffer(r.stdout, dtype=np.uint8)
        if a.size != 16 * 28 * 3:
            return None
        m = a.reshape(-1, 3).astype(float).mean(axis=0)
        def hx(k):
            return "#%02X%02X%02X" % tuple(int(max(0, min(255, c * k))) for c in m)
        return [hx(0.85), hx(0.45)]
    except Exception:
        return None


def _bg(raw, kit, assets_by_id, video_cols=None):
    pal = (kit or {}).get("palette") or {}
    if isinstance(raw, dict) and raw.get("kind") == "image" and raw.get("asset") and \
            (assets_by_id.get(raw["asset"]) or {}).get("kind") != "user_video":
        path = _asset_path(assets_by_id, raw["asset"], False)
        if path:
            out = {"kind": "image", "path": path, "blur": _num(raw.get("blur"), 0, 0, 40),
                   "grade": raw.get("grade") if raw.get("grade") in RP._by_id("grades") else None,
                   "pattern": raw.get("pattern") if raw.get("pattern") in PATTERNS else "none"}
            if (assets_by_id.get(raw["asset"]) or {}).get("user_media"):
                out["um"] = raw["asset"]
            return out
    cols = raw.get("colors") if isinstance(raw, dict) else None
    cols = [c for c in (cols or []) if isinstance(c, str) and c.strip().startswith(("#", "rgb"))][:4]
    if not cols:
        # khong cai san mau nao: bo phong cach cua PHIEN (video mau / R4 tu dat) -> mau lay tu chinh video
        cols = pal.get("bg_gradient") or video_cols or ["#2A2A2E", "#121214"]
    pat = (raw or {}).get("pattern") if isinstance(raw, dict) else None
    return {"kind": "gradient", "colors": cols, "angle": _num((raw or {}).get("angle") if isinstance(raw, dict) else None, 165, 0, 360),
            "pattern": pat if pat in PATTERNS else "none", "patternColor": "rgba(255,255,255,0.3)"}


def scenes_to_spec(p, duration, kit, assets_by_id, changes):
    raw = [s for s in p.get("scenes") or [] if isinstance(s, dict)]
    rows = []
    for i, s in enumerate(raw):
        lay = s.get("layout")
        if lay not in LAYOUTS:
            changes.append("scene%d: bo cuc '%s' khong co -> bo" % (i, lay))
            continue
        it = dict(s)
        it["_n"] = i
        if not RP._neo_thoi_gian(p, it, None, "scene%d" % i, changes, 3.0):
            continue
        rows.append(it)
    rows.sort(key=lambda r: r["start"])
    out = []
    for r in rows:
        st, en = max(0.0, r["start"]), min(duration, r["end"])
        if out and st < out[-1]["end"]:
            if st - out[-1]["start"] >= 0.4:
                out[-1]["end"] = st          # scene sau thang: cat duoi scene truoc
            else:
                st = out[-1]["end"]
        if en - st < 0.4:
            changes.append("scene%d(%s): con %.2fs -> bo" % (r["_n"], r["layout"], max(0, en - st)))
            continue
        lay = r["layout"]
        sc = {"id": "scene%d" % r["_n"], "start": round(st, 3), "end": round(en, 3), "layout": lay,
              "morph": round(_num(r.get("morph"), 0.25, 0, 0.6), 2)}
        panel = r.get("panel") if isinstance(r.get("panel"), dict) else None
        media = None
        ua = assets_by_id.get(panel.get("asset")) if panel else None
        if ua and ua.get("user_media"):
            # tu lieu cua nguoi dung (anh / video): fit theo noi dung + khung (tinh sau khi biet khung panel)
            media = {"_um": ua, "_panel": panel}
        elif panel and panel.get("asset"):
            path = _asset_path(assets_by_id, panel["asset"], False)
            if path:
                media = {"kind": "image", "path": path,
                         "kenburns": panel.get("kenburns") if panel.get("kenburns") in KENBURNS else "in",
                         "grade": panel.get("grade") if panel.get("grade") in RP._by_id("grades") else None,
                         "blur": _num(panel.get("blur"), 0, 0, 30)}
        elif panel and panel.get("source_id") and panel.get("src_time") is not None:
            sv = next((v for v in p.get("source_videos") or [] if v.get("id") == panel.get("source_id")), None)
            if sv and os.path.isfile(sv.get("path") or ""):
                t_ = providers._f(panel.get("src_time"))
                if _is_talking_head(sv["path"], t_):
                    changes.append("%s: B-roll lay tu nguon luc %.1fs chi la mat nguoi dang noi (2 mat cung khung) -> bo"
                                   % ("scene%d" % r["_n"], t_))
                else:
                    media = {"kind": "source", "path": sv["path"], "srcStart": t_, "kenburns": "none"}
        if lay in ("split", "broll") and not media:
            changes.append("%s(%s): khong co hinh B-roll (tai nguyen hong/thieu) -> doi ve full" % (sc["id"], lay))
            lay = sc["layout"] = "full"
        if lay == "split":
            r_ = _num(r.get("panel_ratio"), 0.5, 0.35, 0.6)
            sc["panel"], sc["panelRect"] = media, {"x": 0, "y": 0, "w": 1, "h": r_, "radius": 0}
            sc["aroll"] = {"x": 0, "y": r_, "w": 1, "h": 1 - r_, "radius": 0}
        elif lay == "broll":
            sc["panel"], sc["panelRect"] = media, {"x": 0, "y": 0, "w": 1, "h": 1, "radius": 0}
        elif lay == "card":
            cy = _num(r.get("card_y"), 0.6, 0.35, 0.75)
            sc["bg"] = _bg(r.get("bg"), kit, assets_by_id, _video_colors(p, r) if not (r.get("bg") or {}).get("colors") else None)
            sc["aroll"] = {"x": 0.07, "y": cy, "w": 0.86, "h": 1.08 - cy, "radius": 0.05, "shadow": True}
            if media:
                sc["panel"], sc["panelRect"] = media, {"x": 0.08, "y": 0.06, "w": 0.84, "h": cy - 0.1, "radius": 0.04}
        elif lay == "circle":
            d = _num(r.get("circle_d"), 0.64, 0.4, 0.9)
            cy = _num(r.get("circle_y"), 0.32, 0.18, 0.62)
            h = d * 1080 / 1920
            sc["aroll"] = {"x": 0.5 - d / 2, "y": cy - h / 2, "w": d, "h": h, "radius": d / 2,
                           "border": "6px solid rgba(255,255,255,0.92)", "shadow": True}
            if media:
                sc["panel"], sc["panelRect"] = media, {"x": 0, "y": 0, "w": 1, "h": 1, "radius": 0}
            else:
                sc["bg"] = _bg(r.get("bg"), kit, assets_by_id, _video_colors(p, r) if not (r.get("bg") or {}).get("colors") else None)
        elif lay == "graphic":
            sc["bg"] = _bg(r.get("bg"), kit, assets_by_id, _video_colors(p, r) if not (r.get("bg") or {}).get("colors") else None)
        if isinstance(sc.get("panel"), dict) and sc["panel"].get("_um"):
            import user_media as UM
            m_ = UM.panel_media(sc["panel"]["_um"], sc["panel"]["_panel"], sc.get("panelRect"))
            avail = m_.pop("_avail", None) if m_ else None
            if not m_:
                changes.append("%s: tu lieu '%s' khong con file -> bo panel" % (sc["id"], sc["panel"]["_um"].get("id")))
                sc.pop("panel", None)
                sc.pop("panelRect", None)
                if lay in ("split", "broll"):
                    changes.append("%s(%s): khong co hinh -> bo scene" % (sc["id"], lay))
                    continue
            else:
                sc["panel"] = m_
                if avail is not None and sc["end"] - sc["start"] > avail:
                    changes.append("%s: video tu lieu chi con %.1fs -> scene ngan lai" % (sc["id"], avail))
                    sc["end"] = round(sc["start"] + max(0.4, avail), 3)
        # POP-OUT: nguoi (ban tach nen) troi ra khoi mep tren cua the / khung tron — mac dinh bat cho card
        # pop-out (dau troi khoi the) chi khi scene / bo phong cach video mau yeu cau — khong mac dinh
        kit_pop = any(isinstance(x, dict) and x.get("layout") == lay and x.get("popout")
                      for x in (kit or {}).get("layouts") or [])
        if lay in ("card", "circle") and r.get("popout", kit_pop) and media_vision.available():
            ext = _num(r.get("popout_ext"), 0.14, 0.04, 0.3)
            need = _popout_need(p, r.get("source_id"), sc["aroll"])
            if need:
                # du cho CA dau + toc troi ra (mat dat ngay duoi mep the), khong bi cat phang dinh dau
                ext = max(ext, need)
            sc["popout"] = round(min(0.3, ext), 3)
        out.append(sc)
    return out


def _popout_need(p, sid, rect, W=1080, H=1920):
    """Khoang troi (phan canvas) du chua nua tren mat + toc khi mat dat 5% duoi mep the."""
    faces = p.get("faces") if isinstance(p.get("faces"), dict) else {}
    fc = faces.get(sid) or next(iter(faces.values()), None)
    sv = next((v for v in p.get("source_videos") or [] if v.get("id") == sid), None) or \
        next(iter(p.get("source_videos") or []), None)
    if not fc or not sv:
        return None
    info = RP.probe(sv.get("path"))
    sw, sh = info.get("width") or 0, info.get("height") or 0
    if not sw or not sh:
        return None
    ext = 0.14
    for _ in range(3):   # ti le cover phu thuoc chieu cao khung (co ca phan troi)
        s_ = max(rect["w"] * W / float(sw), (rect["h"] + ext) * H / float(sh))
        fh = fc["h"] * sh * s_ / H
        ext = min(0.3, max(0.08, fh * 0.5 + fh * 0.55 - 0.05 + 0.015))
    return ext


def _is_talking_head(video_path, t):
    """Khung nguon tai t co mat nguoi CO LON (>= 12% chieu cao) -> la canh nguoi noi, khong phai B-roll."""
    if not media_vision.available():
        return False
    try:
        import asset_gen
        st = asset_gen.source_still(video_path, t)
        faces_ = media_vision._faces_in_image(st["path"]) if st else []
        return any(f_["h"] >= 0.12 for f_ in faces_)
    except Exception:
        return False


def scene_at(scenes, t):
    for s in scenes or []:
        if s["start"] <= t < s["end"]:
            return s
    return None


def subtitle_y_for(scene, kit):
    """Vi tri phu de (he -1..1 cua caption) theo bo cuc tai thoi diem do."""
    sub = (kit or {}).get("subtitle") or {}
    y_full = providers._f(sub.get("y_full"), 0.77)
    frac = y_full
    if scene:
        lay = scene["layout"]
        if lay == "split":
            frac = scene["aroll"]["y"] - 0.035
        elif lay == "card":
            frac = scene["aroll"]["y"] - (scene.get("popout") or 0) - 0.045
        elif lay == "circle":
            a = scene["aroll"]
            frac = min(0.8, a["y"] + a["h"] + 0.05)
    return round(RP._clamp(2 * frac - 1, *RP.SAFE_Y), 3)


# ---------------------------------------------------------------------------
# LOP DO HOA -> SPEC
# ---------------------------------------------------------------------------
_FONT_IDS = None


def _fonts():
    global _FONT_IDS
    _FONT_IDS = {f["id"] for f in RP.load_catalog().get("fonts") or []}
    return _FONT_IDS


def _color(v, dflt=None):
    if isinstance(v, str) and v.strip() and (v.strip().startswith("#") or v.strip().startswith("rgb")):
        return v.strip()
    return dflt


def _motion(m, allowed):
    if not isinstance(m, dict) or m.get("preset") not in allowed:
        return None
    out = {"preset": m["preset"], "duration": _num(m.get("duration"), 0.35, 0.05, 2.0)}
    if m.get("stagger") is not None:
        out["stagger"] = _num(m.get("stagger"), 0.035, 0.0, 0.3)
    if m.get("easing") in EASING:
        out["easing"] = m["easing"]
    if m.get("from") in ("left", "right", "top", "bottom"):
        out["from"] = m["from"]
    if m.get("amount") is not None:
        out["amount"] = _num(m.get("amount"), 1, 0, 3)
    if m.get("speed") is not None:
        out["speed"] = _num(m.get("speed"), 1, 0.1, 5)
    return out


def _span(sp, fonts):
    if not isinstance(sp, dict) or not str(sp.get("text") or "").strip():
        return None
    o = {"text": str(sp["text"])}
    if sp.get("font") in fonts:
        o["font"] = sp["font"]
    for k, lo, hi in (("size", 16, 420), ("weight", 100, 900), ("dy", -1.5, 1.5), ("opacity", 0, 1)):
        if sp.get(k) is not None:
            o[k] = round(_num(sp.get(k), 0, lo, hi), 3)
    for k in ("italic", "uppercase", "newline"):
        if sp.get(k) is not None:
            o[k] = bool(sp[k])
    if _color(sp.get("color")):
        o["color"] = _color(sp["color"])
    if isinstance(sp.get("gradient"), list):
        g = [c for c in (_color(x) for x in sp["gradient"]) if c][:4]
        if len(g) >= 2:
            o["gradient"] = g
    if isinstance(sp.get("glow"), dict) and _color(sp["glow"].get("color")):
        o["glow"] = {"color": _color(sp["glow"]["color"]), "size": _num(sp["glow"].get("size"), 30, 2, 120)}
    if isinstance(sp.get("stroke"), dict) and _color(sp["stroke"].get("color")):
        o["stroke"] = {"color": _color(sp["stroke"]["color"]), "width": _num(sp["stroke"].get("width"), 4, 0, 30)}
    return o


_NARROW = {"anton": 0.46, "barlow_condensed": 0.42, "oswald": 0.46, "roboto_condensed": 0.47, "bungee": 0.7,
           "great_vibes": 0.42, "dancing_script": 0.45}


def _text_width(L):
    """Uoc luong be ngang dong chu dai nhat (phan be ngang canvas). Chu anh AI: be ngang anh that."""
    if L.get("art"):
        return max(float(t.get("w") or 0) for t in L["art"]) / 1080.0
    lines, cur = [], 0.0
    for sp in L.get("spans") or [{"text": "%s%s%s" % (L.get("prefix") or "", int(L.get("to") or 0), L.get("suffix") or "")}]:
        if sp.get("newline") and cur:
            lines.append(cur)
            cur = 0.0
        sz = sp.get("size") or L.get("size") or 80
        k = _NARROW.get(sp.get("font") or L.get("font"), 0.58)
        cur += len(sp.get("text") or "") * sz * k / 1080
    lines.append(cur)
    return max(lines)


def _text_height(L):
    """Uoc luong chieu cao khoi chu (phan chieu cao canvas) de tranh mat / vung an toan.
    Dong = theo "newline" cua span; co maxWidth thi tinh them dong tu xuong khi chu dai hon khung.
    Chu anh AI: tong chieu cao cac tang anh (tru phan chong mep)."""
    if L.get("art"):
        return sum(float(t.get("h") or 0) + float(t.get("mt") or 0) for t in L["art"]) / 1920.0
    lines, cur, cur_w = [], 0.0, 0.0
    mw = float(L.get("maxWidth") or 0)
    def close():
        if cur:
            n = max(1, int(cur_w / mw + 0.999)) if mw else 1
            lines.extend([cur] * n)
    for sp in L.get("spans") or []:
        sz = sp.get("size") or L.get("size") or 80
        if sp.get("newline") and cur:
            close()
            cur, cur_w = 0.0, 0.0
        cur = max(cur, sz)
        k = _NARROW.get(sp.get("font") or L.get("font"), 0.58)
        cur_w += len(sp.get("text") or "") * sz * k / 1080
    close()
    if not lines:
        lines = [L.get("size") or 80]
    pad = 0.05 if L.get("box") else 0.0
    return sum(lines) * float(L.get("lineHeight") or 1.1) / 1920 + pad


def layers_to_spec(p, duration, scenes, assets_by_id, faces, changes, kit=None):
    fonts = _fonts()
    art_lookup = art_index(p)
    import graphic_art
    gfx_lookup = graphic_art.lookup(p)
    asr = p.get("asr_words") if isinstance(p.get("asr_words"), dict) else {}
    out = []
    # to hop co tang "sau nguoi" chu dong: ca to hop neo theo tang do (khong ne mat rieng le)
    behind_groups = {str(x.get("group"))[:40] for x in p.get("layers") or []
                     if isinstance(x, dict) and x.get("group") and (x.get("behind_subject") or x.get("behind"))}
    for i, L0 in enumerate(p.get("layers") or []):
        if not isinstance(L0, dict):
            continue
        typ = L0.get("type")
        if typ not in LAYER_TYPES:
            changes.append("layer%d: loai '%s' khong co -> bo" % (i, typ))
            continue
        if typ == "emoji":
            # user 2026-09-27: icon emoji tho (o khoa, lua...) xau -> khong dung; can icon thi anh 3D cat nen
            changes.append("layer%d: icon emoji '%s' tho -> bo (dung anh 3D cat nen / hinh hoc)" % (i, L0.get("emoji") or ""))
            continue
        it = dict(L0)
        it["_n"] = i
        if not RP._neo_thoi_gian(p, it, None, "layer%d" % i, changes, 2.0):
            continue
        st, en = it["start"], min(duration, it["end"])
        if st >= duration - 0.1 or en - st < 0.2:
            changes.append("layer%d: nam ngoai video / qua ngan -> bo" % i)
            continue
        L = {"id": str(L0.get("id") or "layer%d" % i)[:40] + "_%d" % i, "type": typ,
             "start": round(st, 3), "end": round(en, 3),
             "track": int(_num(L0.get("track"), 20, 0, 200)),
             "x": round(_num(L0.get("x"), 0.5, -0.3, 1.3), 4), "y": round(_num(L0.get("y"), 0.5, -0.3, 1.3), 4)}
        if L0.get("anchor") in ("center", "left", "right", "top", "bottom"):
            L["anchor"] = L0["anchor"]
        if L0.get("group"):
            L["group"] = str(L0["group"])[:40]
        for k, lo, hi in (("w", 0.02, 1.6), ("h", 0.005, 1.6), ("rotation", -180, 180), ("skewX", -30, 30),
                          ("scale", 0.1, 4), ("opacity", 0, 1), ("size", 12, 420), ("weight", 100, 900),
                          ("letterSpacing", -0.1, 0.5), ("lineHeight", 0.7, 2), ("maxWidth", 0.1, 1.0),
                          ("radius", 0, 0.5), ("strokeWidth", 0, 40), ("curve", -0.9, 0.9), ("from", -1e12, 1e12),
                          ("to", -1e12, 1e12), ("decimals", 0, 3)):
            if L0.get(k) is not None:
                L[k] = round(_num(L0.get(k), 0, lo, hi), 4)
        for k in ("italic", "uppercase", "active"):
            if L0.get(k) is not None:
                L[k] = bool(L0[k])
        for k in ("label", "value", "prefix", "suffix", "border"):
            if L0.get(k) is not None:
                L[k] = str(L0[k])[:60] if k == "border" else strip_emoji(L0[k])[:60]
        if L0.get("font") in fonts:
            L["font"] = L0["font"]
        for k in ("color", "fill", "strokeColor"):
            if _color(L0.get(k)):
                L[k] = _color(L0[k])
        for k in ("gradient", "fillGradient"):
            if isinstance(L0.get(k), list):
                g = [c for c in (_color(x) for x in L0[k]) if c][:4]
                if len(g) >= 2:
                    L[k] = g
        if L0.get("align") in ("left", "center", "right"):
            L["align"] = L0["align"]
        if L0.get("mask") in ("none", "round", "circle"):
            L["mask"] = L0["mask"]
        if L0.get("fit") in ("cover", "contain"):
            L["fit"] = L0["fit"]
        if isinstance(L0.get("stroke"), dict) and _color(L0["stroke"].get("color")):
            L["stroke"] = {"color": _color(L0["stroke"]["color"]), "width": _num(L0["stroke"].get("width"), 4, 0, 30)}
        if isinstance(L0.get("glow"), dict) and _color(L0["glow"].get("color")):
            L["glow"] = {"color": _color(L0["glow"]["color"]), "size": _num(L0["glow"].get("size"), 30, 2, 120)}
        if isinstance(L0.get("shadow"), list):
            L["shadow"] = [{"x": _num(s.get("x"), 0, -60, 60), "y": _num(s.get("y"), 6, -60, 60),
                            "blur": _num(s.get("blur"), 16, 0, 120), "color": _color(s.get("color"), "rgba(0,0,0,.5)")}
                           for s in L0["shadow"][:3] if isinstance(s, dict)]
        if isinstance(L0.get("box"), dict) and _color(L0["box"].get("color")):
            b = L0["box"]
            L["box"] = {"color": _color(b["color"]), "radius": _num(b.get("radius"), 0.02, 0, 0.3),
                        "padX": _num(b.get("padX"), 0.03, 0, 0.2), "padY": _num(b.get("padY"), 0.012, 0, 0.2),
                        "blur": _num(b.get("blur"), 0, 0, 30)}
            if b.get("border"):
                L["box"]["border"] = str(b["border"])[:60]
        if isinstance(L0.get("points"), list):
            pts = [[_num(q[0], 0.5, -0.2, 1.2), _num(q[1], 0.5, -0.2, 1.2)] for q in L0["points"][:6]
                   if isinstance(q, (list, tuple)) and len(q) >= 2]
            if len(pts) >= 2:
                L["points"] = pts
        L["enter"] = _motion(L0.get("enter"), ENTER)
        L["exit"] = _motion(L0.get("exit"), EXIT)
        L["loop"] = _motion(L0.get("loop"), LOOP)
        if isinstance(L0.get("keyframes"), list):
            kfs = []
            for k in L0["keyframes"][:12]:
                if not isinstance(k, dict) or k.get("t") is None:
                    continue
                kk = {"t": _num(k.get("t"), 0, 0, 60)}
                for f, lo, hi in (("x", -0.5, 1.5), ("y", -0.5, 1.5), ("scale", 0.05, 6), ("scaleX", 0.02, 6),
                                  ("rotation", -720, 720), ("skewX", -40, 40), ("opacity", 0, 1), ("blur", 0, 60)):
                    if k.get(f) is not None:
                        kk[f] = round(_num(k.get(f), 0, lo, hi), 4)
                if k.get("easing") in EASING:
                    kk["easing"] = k["easing"]
                kfs.append(kk)
            if kfs:
                L["keyframes"] = kfs
        if L0.get("replaces_subtitle") or L0.get("replacesSubtitle"):
            L["replacesSubtitle"] = True
        if typ == "text":
            spans = [s for s in (_span(x, fonts) for x in (L0.get("spans") or [])) if s]
            if not spans and str(L0.get("text") or "").strip():
                spans = [{"text": str(L0["text"])}]
            if not spans:
                changes.append("layer%d: lop chu khong co chu -> bo" % i)
                continue
            L["spans"] = spans
            if not text_rules(L, kit, changes, "layer%d" % i):
                changes.append("layer%d: chi co emoji, khong con chu -> bo" % i)
                continue
            if art_lookup:
                _attach_art(L, art_lookup, changes, "layer%d" % i)
            if L0.get("reveal") == "dim_to_bright":
                L["reveal"] = "dim_to_bright"
                L["words"] = _reveal_words(p, it, asr)
        elif typ == "counter":
            L["spans"] = []
        elif typ == "badge":
            # do hoa co chu: anh AI ca phan tu (graphic_art); khong co -> ve bang code voi MAU CUA VIDEO (khong co dinh)
            if not (gfx_lookup and _attach_graphic(L, gfx_lookup, changes, "layer%d" % i)):
                badge_colors(L, kit)
        elif typ in ("image", "video") and (assets_by_id.get(L0.get("asset")) or {}).get("user_media"):
            import user_media as UM
            if not UM.layer_spec(L, L0, assets_by_id[L0["asset"]], duration, changes, "layer%d" % i):
                continue
            typ = L["type"]
        elif typ == "video":
            changes.append("layer%d: lop video chi dung tu lieu video cua nguoi dung ('%s' khong phai) -> bo" % (i, L0.get("asset")))
            continue
        elif typ == "image":
            path = _asset_path(assets_by_id, L0.get("asset"))
            if not path:
                changes.append("layer%d: anh '%s' khong co (tai nguyen hong/thieu) -> bo" % (i, L0.get("asset")))
                continue
            L["path"] = path
            if is_cutout(assets_by_id, L0.get("asset"), path):
                L["cutout"] = True
        # chu "sau nguoi" (behind_subject): nam giua nen video va nguoi -> DUOC dat ngang dau/mat
        if L0.get("behind_subject") or L0.get("behind"):
            if media_vision.available() and typ in ("text", "counter", "image", "box", "circle", "ring", "speedlines"):
                L["behind"] = True
            else:
                changes.append("layer%d: may khong tach duoc nguoi (thieu Vision) -> chu de len tren" % i)
        L["_src"] = it.get("source_id")
        # vung an toan (duoi 0.82 bi giao dien che)
        if typ in ("text", "counter", "badge", "image") and L["y"] > 0.8 and not L.get("keyframes") and not L.get("um"):
            changes.append("layer%d: y %.2f roi vao vung TikTok che -> 0.78" % (i, L["y"]))
            L["y"] = 0.78
        L["_sfx"] = L0.get("sfx")
        out.append(L)
    dims = {}
    for sv in p.get("source_videos") or []:
        info = RP.probe(sv.get("path"))
        dims[sv.get("id")] = (info.get("width") or 0, info.get("height") or 0)
    _avoid_faces(out, scenes, faces, behind_groups, changes, src_dims=dims, kit=kit, zoom=lambda t: _zoom_at(p, t))
    if any(L.get("um") for L in out):
        import user_media as UM
        # tu lieu cua nguoi dung: trong vung an toan + khong de len mat (theo KHUNG anh that)
        UM.place_layers(out, scenes, faces, dims, lambda t: _zoom_at(p, t), changes)
    for L in out:
        L.pop("_src", None)
    # mat do: toi da MAX_LAYERS_PER_10S NHIP moi 10 giay. Cac lop vao cach nhau < 0.6s (hang huy
    # hieu, chu + icon cua cung mot bo) tinh la MOT nhip -> canh do hoa/lockup nhieu lop van giu du.
    out.sort(key=lambda L: L["start"])
    kept = []
    for L in out:
        win = [k for k in kept if L["start"] - k["start"] < 10] + [L]
        if _beats(win) > MAX_LAYERS_PER_10S and not L.get("um"):   # tu lieu nguoi dung: khong bo vi mat do
            changes.append("%s: qua %d nhip do hoa trong 10s -> bo (roi mat)" % (L["id"], MAX_LAYERS_PER_10S))
            continue
        kept.append(L)
    return kept


# ---------------------------------------------------------------------------
# CHU ANH AI — text_art.py tao + cat; o day DAT vao lop chu
# ---------------------------------------------------------------------------
ART_CAP_RATIO = 0.74     # loi chu (chu in hoa) cao ~0.74 co chu -> quy doi anh ve dung co chu da tinh


def art_index(p):
    """plan['text_art'] -> {chu chuan hoa cua TANG: tang} (moi tang tra rieng: mot lop chu co the chi la 1 tang
    cua to hop nhieu lop cung group). {} neu khong co."""
    import text_art
    items = ((p.get("text_art") or {}).get("items") or {}) if isinstance(p.get("text_art"), dict) else {}
    out = {}
    for v in items.values():
        tiers = [t for t in (v or {}).get("tiers") or [] if isinstance(t, dict) and t.get("file") and os.path.isfile(t["file"])]
        if not tiers or len(tiers) != len((v or {}).get("tiers") or []):
            continue
        for t in tiers:
            out.setdefault(text_art.norm(t["text"]), t)
    return out


def _attach_art(L, lookup, changes, label, W=1080):
    """Lop chu -> cac tang ANH (theo dung thu tu dong hien tai + co chu da qua quy tac chu). Dong nao khong co
    anh -> giu CA lop la chu code (khong tron chu anh voi chu code trong mot lop)."""
    import text_art
    lines = _lines(L.get("spans") or [])
    texts = [" ".join(strip_emoji(sp.get("text")) for sp in ln).strip() for ln in lines]
    if not texts or not all(text_art.norm(t) in lookup for t in texts if t):
        return False
    art = []
    for ln, t in zip(lines, texts):
        if not t:
            continue
        tier = lookup[text_art.norm(t)]
        size = max(float(sp.get("size") or L.get("size") or 80) for sp in ln)
        # CO CHU: khop BE NGANG phan chu dac voi be ngang chu thiet ke (dau mu / bong 3D lam chieu cao anh
        # khong on dinh — tinh theo chieu cao thi chu nho han thiet ke ~40%); chieu cao chi de chan lech qua
        target_w = _text_width({"spans": ln, "font": L.get("font"), "size": L.get("size")}) * W
        core_w = float(tier.get("core_w") or tier.get("w") or 1) * (1.0 if tier.get("core_w") else 0.92)
        core_h = max(1.0, float(tier.get("core_h") or tier.get("h") or 1))
        s = target_w / max(1.0, core_w)
        s = min(max(s, 0.75 * size / core_h), 1.9 * size / core_h)
        art.append({"src": tier["file"], "w": round(tier["w"] * s, 1), "h": round(tier["h"] * s, 1),
                    "_pad": float(tier.get("core_top") or 0) * s, "words": tier.get("words")})
    widest = max(a["w"] for a in art)
    if widest > 0.94 * W:
        k = 0.94 * W / widest
        for a in art:
            a["w"], a["h"], a["_pad"] = round(a["w"] * k, 1), round(a["h"] * k, 1), a["_pad"] * k
    for j, a in enumerate(art):
        # tang sau chong nhe len phan dem trong suot (quang sang) cua tang truoc -> to hop gon nhu thiet ke
        pad = a.pop("_pad", 0.0)
        a["mt"] = round(-min(pad, 0.3 * a["h"]) * 0.8, 1) if j else 0.0
        if not a.get("words"):
            a.pop("words", None)
    L["art"] = art
    # chuyen dong TUNG CHU (user 2026-09-27): co vi tri tu ma kieu vao chi la ca khoi -> cac tu vao lech nhau
    unit = {"letters_blur", "words_blur", "typewriter", "words_pop", "letters_drop", "words_rise", "letters_fade"}
    if any(a.get("words") for a in art) and (L.get("enter") or {}).get("preset") not in unit:
        d = float((L.get("enter") or {}).get("duration") or 0.35)
        L["enter"] = {"preset": "words_rise", "duration": round(min(0.45, max(0.25, d)), 2), "stagger": 0.07,
                      "easing": "ease_out"}
    changes.append("%s: chu noi bat -> chu anh AI (%d tang)" % (label, len(art)))
    return True


def _attach_graphic(L, lookup, changes, label, W=1080):
    """Lop badge -> anh phan tu do hoa AI (graphic_art). Than phan tu (phan dac) rong = be ngang thiet ke cua lop."""
    import graphic_art
    it = lookup.get(graphic_art.item_key(L.get("type"), L.get("label"), L.get("value")))
    if not it:
        return False
    d = float(L.get("w") or 0.2) * W
    s = d / max(1.0, float(it.get("core_w") or it.get("w") or 1))
    L["art"] = [{"src": it["file"], "w": round(float(it["w"]) * s, 1), "h": round(float(it["h"]) * s, 1)}]
    changes.append("%s: huy hieu '%s' -> do hoa anh AI" % (label, graphic_art._words(L.get("label"), L.get("value"))))
    return True


def _hexc(rgb):
    return "#%02X%02X%02X" % tuple(int(round(max(0.0, min(1.0, v)) * 255)) for v in rgb[:3])


def _mixc(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def badge_colors(L, kit):
    """Huy hieu ve bang code (khi khong co anh AI): mau lay tu BANG MAU CUA VIDEO nay (style_kit / Brand Guideline ep
    sau) — user 2026-10-01 bo mau cam co dinh. Chu luon tuong phan voi nen huy hieu. Mau AI da khai thi giu."""
    pal = (kit or {}).get("palette") if isinstance((kit or {}).get("palette"), dict) else {}
    cols = [c for c in (_rgba(_color(pal.get(k))) for k in ("primary", "accent", "highlight")) if c]
    bg = [c for c in (_rgba(_color(x)) for x in (pal.get("bg_gradient") or [])) if c] if isinstance(pal.get("bg_gradient"), list) else []
    white, ink = (1.0, 1.0, 1.0), (0.07, 0.07, 0.08)
    main = cols[0] if cols else None
    if not L.get("fillGradient") and not L.get("fill"):
        if len(bg) >= 2:
            L["fillGradient"] = [_hexc(bg[0]), _hexc(bg[-1])]
        elif main:
            L["fillGradient"] = [_hexc(_mixc(main, white, 0.7)), _hexc(main)]
        else:
            L["fillGradient"] = ["#FFFFFF", "#E9E9EC"]
    if not L.get("strokeColor"):
        edge = cols[1] if len(cols) > 1 else (main and _mixc(main, ink, 0.25))
        L["strokeColor"] = _hexc(edge) if edge else "#2A2A2E"
    if not L.get("color"):
        fills = [c for c in (_rgba(x) for x in (L.get("fillGradient") or [L.get("fill")])) if c]
        lum = sum(_lum(c) for c in fills) / len(fills) if fills else 1.0
        if lum < 0.4:
            L["color"] = "#FFFFFF"
        else:
            # chu toi: mau vien keo toi dan toi khi du tuong phan voi nen (>= 4.5)
            base = _rgba(L["strokeColor"]) or ink
            c = base
            for t in (0.0, 0.3, 0.5, 0.7, 0.85, 1.0):
                c = _mixc(base, ink, t)
                if _contrast(_lum(c), lum) >= 4.5:
                    break
            L["color"] = _hexc(c)


def hero_captions_to_art(spec, p, changes):
    """Chu HERO (R5 / hook) co chu anh -> lop chu anh (vi tri + gio cua caption), bo caption do.
    Phu de karaoke (support) KHONG dong vao."""
    lookup = art_index(p)
    if not lookup:
        return
    keep = []
    for n, c in enumerate(spec.get("captions") or []):
        if c.get("role") != "hero":
            keep.append(c)
            continue
        L = {"id": "art_cap%d" % n, "type": "text", "start": c["start"], "end": c["end"], "track": 40,
             "x": 0.5, "y": round((float(c.get("y") or 0) + 1) / 2, 4),
             "spans": [{"text": strip_emoji(c.get("text")), "size": float(c.get("size") or 120)}],
             "enter": {"preset": "words_pop", "duration": 0.35, "stagger": 0.08},
             "exit": {"preset": "fade", "duration": 0.2}}
        if _attach_art(L, lookup, changes, "caption hero '%s'" % (c.get("text") or "")[:24]):
            spec.setdefault("layers", []).append(L)
            continue
        keep.append(c)
    spec["captions"] = keep


def attach_subject_mattes(spec, changes, log=None):
    """Lop 'behind' (chu nam SAU nguoi): tach nguoi o cac clip A-roll chong gio voi lop do
    -> clip["subject"] (WebM alpha). Tach khong duoc -> bo co behind, chu de len tren nhu thuong."""
    behind = [L for L in spec.get("layers") or [] if L.get("behind")]
    # hieu ung tu viet lop "behind": cung can ban tach nguoi (ve giua nen va nguoi)
    behind += [f for f in spec.get("fx") or [] if f.get("layer") == "behind"]
    pops = [sc for sc in spec.get("scenes") or [] if sc.get("popout")]
    if not behind and not pops:
        return
    ok_ids = set()
    for c in spec.get("clips") or []:
        if c.get("kind") == "insert" or c.get("freeze"):
            continue
        hits = [L for L in behind if L["start"] < c["end"] and L["end"] > c["start"]]
        phits = [sc for sc in pops if sc["start"] < c["end"] and sc["end"] > c["start"]]
        if not hits and not phits:
            continue
        sp = c.get("speed") or 1.0
        # chi tach doan clip can dung (+0.5s dem cho chuyen canh) — tach nguoi ton ~4s/giay video
        wins = [(x["start"], x["end"]) for x in hits + phits]
        t0 = max(c["start"], min(w[0] for w in wins)) - 0.5
        t1 = min(c["end"], max(w[1] for w in wins)) + 0.5
        a = max(0.0, c["srcStart"] + (t0 - c["start"]) * sp)
        b = c["srcStart"] + (t1 - c["start"]) * sp
        if log:
            log("Tach nguoi khoi nen (%s %.1f-%.1fs) cho chu nam sau nguoi..." % (os.path.basename(c["path"]), a, b))
        m = media_vision.subject_matte(c["path"], a, b)
        if m:
            c["subject"] = m
            ok_ids.update(L["id"] for L in hits)
            ok_ids.update(sc["id"] for sc in phits)
            _anchor_to_head(hits, c, m, spec, changes)
            _behind_clear(hits, c, m, spec, changes)
        else:
            changes.append("%s: khong tach duoc nguoi khoi nen" % c["id"])
    for sc in pops:
        if sc["id"] not in ok_ids:
            sc.pop("popout", None)
            changes.append("%s: khong co ban tach nguoi -> tat pop-out" % sc["id"])
    for L in behind:
        if L["id"] not in ok_ids and L.get("layer") == "behind":
            L["layer"] = "front"
            changes.append("%s: khong co ban tach nguoi -> hieu ung ve len tren" % L["id"])
        elif L["id"] not in ok_ids and L.get("behind"):
            L.pop("behind", None)
            changes.append("%s: khong co ban tach nguoi -> chu de len tren" % L["id"])


def clip_map(clip, W=1080, H=1920, fy=0.42):
    """Quy doi toa do (0..1) giua KHUNG HINH (canvas, A-roll full) va KHUNG NGUON cua clip — GIU KHOP
    remotion-src/AutoEdit.tsx: video cover + object-position theo mat (facePosition) roi
    translate(x*50%, y*50%) scale(scale) quanh tam. Truoc 2026-09-27 bo qua jump-cut zoom (scale 1.3)
    -> dau nguoi tren man hinh to/cao hon cho code tinh -> 'CHET NICK' sau dau bi che gan het.
    Tra (to_canvas, to_src, k_w): k_w = he so doi be ngang nguon -> canvas."""
    sw, sh = float(clip.get("srcW") or W), float(clip.get("srcH") or H)
    s0 = max(W / sw, H / sh)
    iw, ih = sw * s0, sh * s0
    face = clip.get("face") if isinstance(clip.get("face"), dict) else None
    if face:
        left = min(0.0, max(W - iw, W * 0.5 - float(face.get("cx", 0.5)) * iw))
        top = min(0.0, max(H - ih, H * fy - float(face.get("cy", 0.5)) * ih))
    else:
        left, top = (W - iw) / 2, (H - ih) / 2
    k = float(clip.get("scale") or 1.0)
    tx, ty = float(clip.get("x") or 0) * 0.5 * W, float(clip.get("y") or 0) * 0.5 * H

    def to_canvas(sx, sy):
        ex, ey = left + sx * iw, top + sy * ih
        return (W / 2 + (ex - W / 2) * k + tx) / W, (H / 2 + (ey - H / 2) * k + ty) / H

    def to_src(cx, cy):
        ex = W / 2 + (cx * W - W / 2 - tx) / k
        ey = H / 2 + (cy * H - H / 2 - ty) / k
        return (ex - left) / iw, (ey - top) / ih

    return to_canvas, to_src, iw * k / W


def _head_on_canvas(head, clip, spec):
    """Dau nguoi do tren file tach nen (toa do NGUON) -> toa do KHUNG HINH."""
    if not head:
        return head
    to_c, _to_s, kw = clip_map(clip, spec.get("width") or 1080, spec.get("height") or 1920)
    cx, top = to_c(head["cx"], head["top"])
    return {"top": round(top, 4), "cx": round(cx, 4), "w": round((head.get("w") or 0.3) * kw, 4)}


def _anchor_to_head(hits, clip, matte, spec, changes):
    """Chu 'sau nguoi' dat NGANG DINH DAU: dau chi che phan giua-duoi cua chu, hai ben chu lo ra
    (kieu 'LAM ON' sau dau trong video mau). Do dinh dau that tu file tach nen, luc chu xuat hien.
    Chi khi A-roll dang full khung va khung nguon cung ti le canvas (toa do trung nhau)."""
    sw, sh = clip.get("srcW") or 0, clip.get("srcH") or 0
    if not sw or not sh or abs(sw / float(sh) - spec["width"] / float(spec["height"])) > 0.03:
        return
    sp = clip.get("speed") or 1.0
    for L in hits:
        if L.get("type") not in ("text", "counter") or L.get("keyframes"):
            continue
        sc = scene_at(spec.get("scenes") or [], L["start"])
        if sc is not None and sc["layout"] != "full":
            continue
        t_src = clip["srcStart"] + (max(L["start"], clip["start"]) + 0.15 - clip["start"]) * sp
        head = _head_on_canvas(media_vision.matte_head(matte["path"], t_src - matte["srcStart"]), clip, spec)
        if not head:
            continue
        top = head["top"]
        th = _text_height(L) if L["type"] == "text" else (L.get("size") or 120) * 1.1 / 1920
        # chu RONG hon dau nhieu: dau che phan giua-duoi (tam chu ngang dinh dau). Chu HEP: nang len
        # de dau chi cham mep duoi — khong thi dau che gan het chu.
        rong = _text_width(L) >= (head.get("w") or 0.4) * 1.5
        y = RP._clamp(top + th * (0.12 if rong else -0.3), 0.07 + th / 2, 0.8 - th / 2)
        # chu dat giua -> canh theo TAM DAU de hai ben chu lo deu (nguoi dung lech van dung)
        if L.get("anchor", "center") == "center" and abs(L["x"] - 0.5) < 0.15:
            tw = min(0.96, _text_width(L))
            x = round(RP._clamp(head["cx"], tw / 2 + 0.02, 1 - tw / 2 - 0.02), 4)
            if abs(x - L["x"]) > 0.02:
                dx = x - L["x"]
                L["x"] = x
                for M in spec.get("layers") or []:
                    if M is not L and L.get("group") and M.get("group") == L["group"] and not M.get("keyframes"):
                        M["x"] = round(RP._clamp(M["x"] + dx, 0.05, 0.95), 4)
        if abs(y - L["y"]) > 0.01:
            changes.append("%s: chu sau nguoi -> ngang dinh dau (y %.2f -> %.2f)" % (L["id"], L["y"], y))
            dy = y - L["y"]
            L["y"] = round(y, 4)
            for M in spec.get("layers") or []:  # tang khac cua to hop di theo
                if M is not L and L.get("group") and M.get("group") == L["group"] and not M.get("behind") and not M.get("keyframes"):
                    M["y"] = round(RP._clamp(M["y"] + dy, 0.07, 0.8), 4)


def face_in_canvas(sc, fc, sw, sh, W=1080, H=1920):
    """Khuon mat (toa do 0..1 cua khung NGUON) -> vi tri tren CANVAS theo bo cuc luc do.
    Giu KHOP voi facePosition trong remotion-src/AutoEdit.tsx. broll/graphic (khong thay A-roll) -> None."""
    if not fc:
        return None
    lay = sc["layout"] if sc else "full"
    if lay in ("broll", "graphic"):
        return None
    if lay == "full" or not sc.get("aroll") or not sw or not sh:
        return dict(fc)
    r = sc["aroll"]
    ext = sc.get("popout") or 0
    cw, ch = r["w"] * W, (r["h"] + ext) * H
    s_ = max(cw / float(sw), ch / float(sh))
    iw, ih = sw * s_, sh * s_
    fy = (ext + 0.05) * H / ch if ext else 0.42
    left = min(0.0, max(cw - iw, cw * 0.5 - fc["cx"] * iw))
    top = min(0.0, max(ch - ih, ch * fy - fc["cy"] * ih))
    return {"cx": (r["x"] * W + left + fc["cx"] * iw) / W, "cy": ((r["y"] - ext) * H + top + fc["cy"] * ih) / H,
            "h": fc["h"] * ih / H, "w": fc.get("w", 0.4) * iw / W}


def _zoom_at(p, t):
    """Jump-cut zoom (scale cua segment) tai gio timeline t — mat nguoi tren man hinh to theo."""
    for sg in p.get("segments") or []:
        try:
            ts = float(sg.get("target_start") or 0)
            span = (float(sg.get("end", 0)) - float(sg.get("start", 0))) / float(sg.get("speed") or 1.0)
        except (TypeError, ValueError):
            continue
        if ts <= t < ts + span:
            return float(sg.get("scale") or 1.0)
    return 1.0


def _avoid_faces(layers, scenes, faces, behind_groups, changes, src_dims=None, kit=None, zoom=None):
    """Chu KHONG de len mat nguoi noi khi A-roll full. Tinh theo KHOI: cac tang cung group dich
    chung mot khoang (giu nguyen to hop). Thu lan luot: duoi cam -> duoi cam thu nho -> tren dau
    -> (chu to + rong) sau nguoi -> tren dau thu nho -> sat tren mat."""
    if not faces:
        return
    units = {}
    for L in layers:
        if L["type"] not in ("text", "counter") or L.get("keyframes") or L.get("behind"):
            continue
        g = L.get("group")
        if g and g in behind_groups:
            continue      # to hop co tang sau nguoi: neo theo dinh dau (attach_subject_mattes)
        units.setdefault(("g", g) if g else ("l", L["id"]), []).append(L)
    for key, mem in units.items():
        first = min(mem, key=lambda x: x["start"])
        sc = scene_at(scenes, first["start"])
        sid = first.get("_src") if first.get("_src") in faces else next(iter(faces), None)
        sw, sh = (src_dims or {}).get(sid, (0, 0))
        fc = face_in_canvas(sc, faces.get(sid), sw, sh)
        if not fc:
            continue
        k_z = zoom(first["start"]) if zoom and (sc is None or sc["layout"] == "full") else 1.0
        if abs(k_z - 1.0) > 0.01:     # A-roll full dang phong to (jump-cut) -> mat to + lech khoi tam theo
            fc = {"cx": 0.5 + (fc["cx"] - 0.5) * k_z, "cy": 0.5 + (fc["cy"] - 0.5) * k_z,
                  "h": fc["h"] * k_z, "w": fc.get("w", 0.4) * k_z}
        ths = {id(L): _text_height(L) if L["type"] == "text" else (L.get("size") or 120) * 1.1 / 1920 for L in mem}
        y0 = min(L["y"] - ths[id(L)] / 2 for L in mem)
        y1 = max(L["y"] + ths[id(L)] / 2 for L in mem)
        th, cyb = y1 - y0, (y0 + y1) / 2
        top, bot = fc["cy"] - fc["h"] * 0.6, fc["cy"] + fc["h"] * 0.6
        if not (y1 > top and y0 < bot):
            continue
        hair = fc["cy"] - fc["h"] * 1.2       # dinh dau (toc) uoc tu khung mat
        below = bot + th / 2 + 0.02
        wide = max(_text_width(L) for L in mem) >= fc.get("w", 0.4) * 1.25
        k_below = (0.8 - bot - 0.02) / th if th else 1
        k = 1.0
        if below + th / 2 <= 0.8:
            moi, note = below, "duoi cam"
        elif k_below >= 0.7:
            k = k_below
            moi, note = bot + th * k / 2 + 0.02, "duoi cam, thu nho %.0f%%" % (k * 100)
        elif th <= hair - 0.07:
            moi, note = hair - th / 2 - 0.01, "tren dau"
        elif wide and th >= 0.06 and media_vision.available() and (sc is None or sc["layout"] == "full"):
            big = max(mem, key=lambda x: ths[id(x)])
            big["behind"] = True
            if big.get("group"):
                behind_groups.add(big["group"])
            changes.append("%s: chu to khong ne duoc mat -> dat sau nguoi, ngang dinh dau" % big["id"])
            continue
        elif hair - 0.07 > 0.03:
            k = min(1.0, max(0.55, (hair - 0.075) / th))
            moi, note = 0.07 + th * k / 2, "tren dau, thu nho %.0f%%" % (k * 100)
        else:
            moi, note = max(0.08 + th / 2, top - th / 2 - 0.02), "tren mat"
        for L in mem:
            if k < 0.999:
                _scale_text(L, k)
            L["y"] = round(moi + (L["y"] - cyb) * k, 4)
        changes.append("%s: de len mat nguoi noi (y %.2f) -> %.2f (%s)" % (
            ",".join(L["id"] for L in mem), cyb, moi, note))
        # roi vao vung phu de -> chu nhan thay phu de trong luc hien (nhu video mau: an phu de khi co chu to)
        if kit is not None:
            sub_y = (subtitle_y_for(sc, kit) + 1) / 2
            b0, b1 = moi - th * k / 2, moi + th * k / 2
            if b1 > sub_y - 0.035 and b0 < sub_y + 0.035 and not any(L.get("replacesSubtitle") for L in mem):
                for L in mem:
                    L["replacesSubtitle"] = True
                changes.append("%s: nam dung vung phu de -> tam an phu de khi hien" % ",".join(L["id"] for L in mem))


def _scale_text(L, k):
    if L.get("size"):
        L["size"] = round(L["size"] * k, 1)
    for sp in L.get("spans") or []:
        if sp.get("size"):
            sp["size"] = round(sp["size"] * k, 1)


# ---------------------------------------------------------------------------
# QUY TAC CHU (user 2026-09-27) — code tu ep, khong tin AI:
#  1 khong icon/emoji tho · 2 thu tu doc = thu tu loi noi (tren->duoi, trai->phai) · 3 chu dac, ro net,
#  tuong phan voi nen · 5 chu sau nguoi khong bi che nhieu · 6 chu de len nhau phai co lop tach ro ·
#  7 phan cap thi giac: 1 tang chinh, tang phu nho han ro, <= 2 font / to hop
# ---------------------------------------------------------------------------
import re as _re

EMOJI_RE = _re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF"
                       "\U00002300-\U000023FF\U0000FE0F\U0000200D\U000020E3\U0001F1E6-\U0001F1FF]")
SCRIPT_FONTS = {"great_vibes", "dancing_script"}
SUPPORT_VIS_RATIO = 0.75       # tang phu (khac font) <= 75% co NHIN THAY cua tang chinh
SCRIPT_VIS = 0.62              # chu viet tay: net manh, x-height thap -> nhin nho hon ~38% co khai bao
MIN_HERO_PX = 84               # to hop nhieu tang: tang chinh >= 84px (khung 1080)
MIN_SUPPORT_PX = 40
MIN_VIS_PX = 40                # moi chu: co NHIN THAY >= 40px (chu viet tay 'rat de bi' 60px trong nho, kho doc)
GLOW_MAX_RATIO = 0.3           # glow <= 30% co chu — glow to lam nhoe canh chu (vd 'KHOA NICK' do tren nen go sang)
OVERLAP_MAX_DY = 0.3           # tang de len tang tren toi da 0.3em
MIN_CONTRAST = 4.5             # ti le tuong phan chu / nen (WCAG) — duoi muc nay them vien + bong
BUSY_BG_STD = 0.16             # nen nhieu chi tiet (do lech do sang) -> luon them vien + bong
BEHIND_MAX_COVER = 0.22        # chu sau nguoi: nguoi che toi da 22% khoi chu
BEHIND_MAX_COVER_TOP = 0.10    # ... va toi da 10% NUA TREN khoi chu (nua tren con thi van doc duoc)
DARK_SEP = "rgba(14,10,10,0.9)"
LIGHT_SEP = "rgba(255,255,255,0.95)"


def strip_emoji(s):
    return _re.sub(r"\s{2,}", " ", EMOJI_RE.sub("", str(s or ""))).strip()


def _rgba(c):
    """Mau CSS -> (r, g, b, a) 0..1. Khong doc duoc -> None."""
    if not isinstance(c, str):
        return None
    c = c.strip()
    m = _re.match(r"^#([0-9a-fA-F]{3,8})$", c)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h)
        if len(h) not in (6, 8):
            return None
        v = [int(h[i:i + 2], 16) / 255.0 for i in range(0, len(h), 2)]
        return (v[0], v[1], v[2], v[3] if len(v) == 4 else 1.0)
    m = _re.match(r"^rgba?\(([^)]*)\)$", c)
    if m:
        parts = [x.strip() for x in m.group(1).replace("/", ",").split(",") if x.strip()]
        try:
            rgb = [float(x.rstrip("%")) * (2.55 if x.endswith("%") else 1) / 255.0 for x in parts[:3]]
            a = float(parts[3].rstrip("%")) / (100 if parts[3].endswith("%") else 1) if len(parts) > 3 else 1.0
            return (rgb[0], rgb[1], rgb[2], a)
        except (ValueError, IndexError):
            return None
    if c.lower() in ("transparent", "none"):
        return (0, 0, 0, 0)
    return None


def _lum(rgb):
    """Do sang tuong doi (WCAG) cua mau 0..1."""
    def ch(v):
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2])


def _contrast(l1, l2):
    a, b = max(l1, l2), min(l1, l2)
    return (a + 0.05) / (b + 0.05)


def _fill_of(sp, L):
    """Mau to cua span (gradient -> trung binh) va do trong suot."""
    grad = sp.get("gradient") or L.get("gradient")
    if isinstance(grad, list) and grad:
        cs = [x for x in (_rgba(g) for g in grad) if x]
        if cs:
            return tuple(sum(c[i] for c in cs) / len(cs) for i in range(4))
    return _rgba(sp.get("color") or L.get("color") or "#FFFFFF") or (1, 1, 1, 1)


def _sz(sp, L):
    return float(sp.get("size") or L.get("size") or 80)


def _lines(spans):
    out = [[]]
    for sp in spans:
        if sp.get("newline") and out[-1]:
            out.append([])
        out[-1].append(sp)
    return out


def text_rules(L, kit, changes, label=None):
    """Ep quy tac chu len MOT lop text da chuan hoa (spans). Tra False neu lop khong con chu."""
    label = label or L.get("id")
    pal = (kit or {}).get("palette") or {}
    spans = L.get("spans") or []
    # 1. khong emoji / ky hieu tho trong chu
    for sp in spans:
        t = strip_emoji(sp.get("text"))
        if t != sp.get("text"):
            changes.append("%s: bo emoji/ky hieu trong chu '%s'" % (label, sp.get("text")))
            sp["text"] = t
    spans = [sp for sp in spans if (sp.get("text") or "").strip()]
    L["spans"] = spans
    if not spans:
        return False
    # 7. <= 2 font moi to hop: font thu 3 tro di -> font cua tang phu
    fonts = []
    for sp in spans:
        f = sp.get("font") or L.get("font")
        if f not in fonts:
            fonts.append(f)
    if len(fonts) > 2:
        hero_f = (max(spans, key=lambda s: _sz(s, L)).get("font") or L.get("font"))
        other = next((f for f in fonts if f != hero_f), None)
        keep = {hero_f, other}
        for sp in spans:
            if (sp.get("font") or L.get("font")) not in keep:
                sp["font"] = other
        changes.append("%s: %d font trong 1 to hop -> con 2 (%s, %s)" % (label, len(fonts), hero_f, other))
    # 7. phan cap: MOT tang chinh (co NHIN THAY lon nhat, uu tien chu in dam); tang KHAC FONT phai nho
    #    ro (<= 75% co nhin thay). Cung font = cung he chu (vd 'VAN HANH' cam + 'KINH DOANH' trang cung co
    #    = mot tang nhan mau) -> khong dong vao. Chu viet tay: co nhin thay ~0.62 x co khai bao.
    if len(spans) >= 2:
        def vis(sp):
            return _sz(sp, L) * (SCRIPT_VIS if (sp.get("font") or L.get("font")) in SCRIPT_FONTS else 1.0)
        hero = max(spans, key=lambda s_: (vis(s_), bool(s_.get("uppercase") or L.get("uppercase") or s_["text"].isupper())))
        hf = hero.get("font") or L.get("font")
        lockup = (len({sp.get("font") or L.get("font") for sp in spans}) >= 2 and not L.get("box")
                  and not L.get("maxWidth") and not L.get("reveal"))
        H = _sz(hero, L)
        if lockup and H < MIN_HERO_PX:
            k = MIN_HERO_PX / H
            for sp in spans:
                sp["size"] = round(_sz(sp, L) * k, 1)
            changes.append("%s: tang chinh '%s' %.0fpx qua nho cho to hop -> %dpx" % (label, hero["text"][:20], H, MIN_HERO_PX))
        hv = vis(hero)
        for sp in spans:
            if sp is hero or (sp.get("font") or L.get("font")) == hf:
                continue
            if vis(sp) > hv * SUPPORT_VIS_RATIO:
                old = _sz(sp, L)
                f = SCRIPT_VIS if (sp.get("font") or L.get("font")) in SCRIPT_FONTS else 1.0
                sp["size"] = round(hv * 0.65 / f, 1)
                changes.append("%s: tang phu '%s' %.0fpx canh tranh voi tang chinh '%s' -> %.0fpx (phan cap ro)"
                               % (label, sp["text"][:20], old, hero["text"][:20], sp["size"]))
            if _sz(sp, L) < MIN_SUPPORT_PX:
                sp["size"] = MIN_SUPPORT_PX
    for sp in spans:
        if _vis(sp, L) < MIN_VIS_PX:
            f = SCRIPT_VIS if (sp.get("font") or L.get("font")) in SCRIPT_FONTS else 1.0
            old = _sz(sp, L)
            sp["size"] = round(MIN_VIS_PX / f, 1)
            changes.append("%s: chu '%s' %.0fpx nhin qua nho -> %.0fpx" % (label, sp["text"][:20], old, sp["size"]))
    # 3. chu DAC: chu vien rong / mo (fill trong suot) kho doc -> to dac
    for sp in spans:
        if sp.get("gradient"):
            continue
        rgba = _fill_of(sp, L)
        if rgba[3] < 0.75 and _sz(sp, L) >= 40:
            st = sp.get("stroke") or L.get("stroke") or {}
            sc = _rgba(st.get("color")) if isinstance(st, dict) else None
            new = "#FFFFFF" if not sc or _lum(sc) < 0.35 else st["color"]
            sp["color"] = new
            if sc and new == st.get("color"):
                sp["stroke"] = {"color": DARK_SEP, "width": max(2.0, round(_sz(sp, L) * 0.025, 1))}
            changes.append("%s: chu '%s' vien rong/mo -> to dac %s" % (label, sp["text"][:20], new))
    # 3. glow vua phai: glow to lam nhoe canh chu
    for sp in spans:
        g = sp.get("glow") if sp.get("glow") is not None else L.get("glow")
        if isinstance(g, dict) and g.get("size"):
            cap = round(_sz(sp, L) * GLOW_MAX_RATIO, 1)
            if g["size"] > cap:
                sp["glow"] = {"color": g["color"], "size": cap}
                changes.append("%s: glow %.0f qua day cho chu %.0fpx -> %.0f (giu canh chu sac)"
                               % (label, g["size"], _sz(sp, L), cap))
    # 6. tang de len tang tren (dy am) -> gioi han do chong + lop tach ro
    lines = _lines(spans)
    for li in range(1, len(lines)):
        for sp in lines[li]:
            dy = float(sp.get("dy") or 0)
            if dy >= -0.06:
                continue
            if dy < -OVERLAP_MAX_DY:
                sp["dy"] = -OVERLAP_MAX_DY
                changes.append("%s: '%s' chong len dong tren %.2fem -> %.2fem" % (label, sp["text"][:20], dy, -OVERLAP_MAX_DY))
            _separate(sp, lines[li - 1], L, pal, changes, label)
    # chu tran khung -> thu nho vua 94% be ngang (chu bi cat mep thi khong doc duoc)
    if not L.get("maxWidth"):
        w = _text_width(L)
        if w > 0.94:
            _scale_text(L, 0.94 / w)
            changes.append("%s: chu rong %.0f%% khung -> thu nho vua 94%%" % (label, w * 100))
    return True


def _vis(sp, L):
    return _sz(sp, L) * (SCRIPT_VIS if (sp.get("font") or L.get("font")) in SCRIPT_FONTS else 1.0)


def _separate(up, below, L, pal, changes, label, L_below=None, done=None):
    """`up` (ve sau -> nam TREN) de len cac span `below`: hai tang phai KHAC MAU ro (doi mau TANG PHU —
    tang nho hon — sang trang / vang highlight / accent, khong dong vao mau tang chinh) + tang tren co vien
    tach day."""
    Lb = L_below or L
    lu = _lum(_fill_of(up, L))
    lb = [_lum(_fill_of(b, Lb)) for b in below] or [lu]
    lbm = sum(lb) / len(lb)
    if abs(lu - lbm) < 0.25:
        up_small = _vis(up, L) <= max([_vis(b, Lb) for b in below] or [0])
        targets = [(up, L, lbm)] if up_small else [(b, Lb, lu) for b in below]
        for sp, Ls, other in targets:
            if sp.get("gradient") or Ls.get("gradient") or (done is not None and id(sp) in done):
                continue
            new = None
            for c in ("#FFFFFF", pal.get("highlight") or "#FFD23F", "#FFD23F", pal.get("accent") or "#FF2A2A"):
                rc = _rgba(c)
                if rc and abs(_lum(rc) - other) >= 0.3:
                    new = c
                    break
            if new:
                sp["color"] = new
                if done is not None:
                    done.add(id(sp))
                changes.append("%s: '%s' chong len chu cung tong mau -> doi mau tang phu %s cho tach lop"
                               % (label, sp["text"][:20], new))
        lu = _lum(_fill_of(up, L))
    w = round(max(3.0, min(10.0, _sz(up, L) * 0.06)), 1)
    col = DARK_SEP if lu >= 0.3 else LIGHT_SEP
    st = up.get("stroke") or {}
    if not isinstance(st, dict) or float(st.get("width") or 0) < w * 0.8:
        up["stroke"] = {"color": col, "width": w}
        changes.append("%s: '%s' de len chu khac -> vien tach %.0fpx" % (label, up["text"][:20], w))


def _bbox(L):
    """Khung chu (x0, y0, x1, y1) phan canvas, theo diem neo."""
    w = min(1.2, _text_width(L)) if L.get("type") == "text" else min(1.2, _text_width(L))
    h = _text_height(L) if L.get("type") == "text" else (L.get("size") or 120) * 1.1 / 1920
    if L.get("maxWidth"):
        w = min(w, L["maxWidth"])
    x, y, a = L["x"], L["y"], L.get("anchor") or "center"
    x0 = x if a == "left" else (x - w if a == "right" else x - w / 2)
    y0 = y if a == "top" else (y - h if a == "bottom" else y - h / 2)
    return (x0, y0, x0 + w, y0 + h)


# --- 2. THU TU DOC = THU TU LOI NOI -----------------------------------------
def _cands(ws, text, a, b):
    """MOI moc gio nguon ma CA CUM `text` duoc noi trong [a, b] cua MOT nguon moc chu `ws`. Cum ngan
    (<= 4 tu) phai khop DU moi tu theo thu tu — 'Dang bai tren X' khong duoc khop vao 'dang bai tren
    fanpage'; cum dai khop >= 80%. Cho chen toi da 1 tu dem giua cac tu."""
    import speech_cut
    toks = speech_cut._norm(text)
    if not toks:
        return []
    need = len(toks) if len(toks) <= 4 else int(len(toks) * 0.8 + 0.999)
    out = []
    for j, w in enumerate(ws or []):
        if not (a <= w[1] <= b):
            continue
        flat = []
        for x in ws[j:j + len(toks) * 2 + 2]:
            flat += speech_cut._norm(x[0])
        if not flat or not speech_cut._tok_eq(flat[0], toks[0]):
            continue
        pos, hit, skip = 0, 0, 0
        for t in toks:
            k = next((i for i in range(pos, min(len(flat), pos + 2)) if speech_cut._tok_eq(flat[i], t)), None)
            if k is None:
                skip += 1
                continue
            skip += k - pos
            pos, hit = k + 1, hit + 1
        if hit >= need and skip <= max(1, len(toks) // 3):
            out.append(round(w[1], 3))
    return sorted(set(out))[:8]


def _times_for(words, capw, sid, texts, a, b, anchor):
    """Moc noi cua tung tang, TAT CA lay tu CUNG mot nguon moc (Whisper hoac chu phu de) — tron hai
    nguon thi lech nhau (Whisper nghe 'Browser Skill' -> 'Brow Skew' 20.57s, phu de 'Skill' 20.29s ->
    dao nham). Chon nguon khop duoc NHIEU tang hon; bang nhau -> Whisper (moc chinh xac)."""
    best = None
    for ws in (words.get(sid) or [], capw.get(sid) or []):
        c = [_cands(ws, t, a, b) for t in texts]
        n = sum(1 for x in c if x)
        if best is None or n > best[0]:
            best = (n, c)
    if not best or best[0] < 2:
        return [None] * len(texts)
    return _joint_times(best[1], anchor)


def _joint_times(cands, anchor):
    """Chon cho moi tang MOT moc sao cho cac tang GAN NHAU nhat (cung mot lan noi cau do) + gan
    src_start cua lop. Tang khong khop -> None. Nhieu to hop ngang nhau / qua xa nhau -> None het."""
    import itertools
    idx = [i for i, c in enumerate(cands) if c]
    if len(idx) < 2:
        return [None] * len(cands)
    best, second = None, None
    for combo in itertools.product(*[cands[i] for i in idx]):
        cost = (max(combo) - min(combo)) + 0.15 * abs(min(combo) - anchor)
        if best is None or cost < best[0] - 1e-9:
            best, second = (cost, combo), best
        elif second is None or cost < second[0]:
            second = (cost, combo)
    if max(best[1]) - min(best[1]) > 6.0:
        return [None] * len(cands)
    out = [None] * len(cands)
    for i, t in zip(idx, best[1]):
        out[i] = t
    return out


def _needs_swap(ordered_times):
    """Chi xep lai khi co tang dung sau nhung duoc noi TRUOC ro rang (>= 0.15s)."""
    ts = [t for t in ordered_times if t is not None]
    return any(later < earlier - 0.15 for i, earlier in enumerate(ts) for later in ts[i + 1:])


def _fill_times(times):
    """Tang khong khop loi noi (chu trang tri '&', dien giai) -> di lien voi tang ngay truoc no."""
    out = list(times)
    last = None
    for i, t in enumerate(out):
        if t is None:
            out[i] = (last + 1e-3 * (i + 1)) if last is not None else None
        else:
            last = t
    nxt = next((t for t in out if t is not None), 0.0)
    return [nxt - 1e-3 * (len(out) - i) if t is None else t for i, t in enumerate(out)]


def reading_order(p, changes):
    """Nguoi xem doc TREN->DUOI, TRAI->PHAI -> tang nao NOI TRUOC phai nam tren / ben trai.
    Vd noi 'rat de bi khoa nick': 'rat de bi' phai nam TREN 'KHOA NICK' (truoc day AI dat duoi).
    Ap cho (a) cac dong/span trong 1 lop chu va (b) cac lop cung group. Gio NGUON (plan)."""
    import speech_cut
    words = speech_cut.words_by_source(p)
    if not words:
        return
    raw = p.get("asr_words") or {}
    capw = {sid: speech_cut._caption_words(p, sid, raw.get(sid) or []) for sid in words}
    first_src = next(iter(words)) if len(words) == 1 else None
    layers = [L for L in p.get("layers") or [] if isinstance(L, dict)]

    def win(L):
        a = providers._f(L.get("src_start"))
        return a - 2.5, providers._f(L.get("src_end"), a + 2.0) + 1.5

    # (a) trong 1 lop: dong noi truoc len tren, trong dong span noi truoc sang trai
    for n, L in enumerate(layers):
        spans = [s for s in L.get("spans") or [] if isinstance(s, dict) and str(s.get("text") or "").strip()]
        if L.get("type") != "text" or len(spans) < 2 or L.get("src_start") is None:
            continue
        sid = L.get("source_id") or first_src
        a, b = win(L)
        raw_t = _times_for(words, capw, sid, [s["text"] for s in spans], a, b, providers._f(L.get("src_start")))
        if sum(1 for t in raw_t if t is not None) < 2 or not _needs_swap(raw_t):
            continue
        ts = _fill_times(raw_t)
        tid = {id(s): t for s, t in zip(spans, ts)}
        lines = _lines(spans)
        pos_dy = [float(ln[0].get("dy") or 0) for ln in lines]
        new_lines = sorted(lines, key=lambda ln: min(tid[id(s)] for s in ln))
        new_lines = [sorted(ln, key=lambda s: tid[id(s)]) for ln in new_lines]
        if [id(s) for ln in new_lines for s in ln] == [id(s) for s in spans]:
            continue
        out = []
        for li, ln in enumerate(new_lines):
            for si, s in enumerate(ln):
                s = dict(s)
                s["newline"] = li > 0 and si == 0
                if si == 0:
                    if pos_dy[li]:
                        s["dy"] = pos_dy[li]
                    else:
                        s.pop("dy", None)
                out.append(s)
        changes.append("layer%d: xep lai thu tu doc theo loi noi: %s -> %s" % (
            n, " / ".join(s["text"] for s in spans), " / ".join(s["text"] for s in out)))
        L["spans"] = out

    # (b) cac lop cung group (to hop nhieu lop)
    groups = {}
    for L in layers:
        if L.get("group") and L.get("type") in ("text", "counter") and L.get("src_start") is not None:
            groups.setdefault(L["group"], []).append(L)
    for g, mem in groups.items():
        if len(mem) < 2:
            continue
        sid = mem[0].get("source_id") or first_src
        a = min(win(L)[0] for L in mem)
        b = max(win(L)[1] for L in mem)
        raw_t = _times_for(words, capw, sid, [_raw_text(L) for L in mem], a, b,
                           min(providers._f(L.get("src_start")) for L in mem))
        if sum(1 for t in raw_t if t is not None) < 2:
            continue
        geo = []
        for L in mem:
            L.setdefault("x", 0.5)
            L.setdefault("y", 0.5)
            h = _text_height({"spans": [s for s in L.get("spans") or [] if isinstance(s, dict)],
                              "size": L.get("size"), "box": L.get("box")}) if L.get("type") == "text" \
                else (L.get("size") or 120) * 1.1 / 1920
            geo.append((L, providers._f(L["x"], 0.5), providers._f(L["y"], 0.5), h))
        by_y = sorted(geo, key=lambda r: r[2])
        order_vis = [r[0] for r in by_y]
        tmap = dict(zip([id(L) for L in mem], _fill_times(raw_t)))
        rawmap = dict(zip([id(L) for L in mem], raw_t))
        same_row = all(abs(r1[2] - r2[2]) < 0.5 * min(r1[3], r2[3]) for r1, r2 in zip(by_y, by_y[1:]))
        if same_row:
            by_x = sorted(geo, key=lambda r: r[1])
            want = sorted(mem, key=lambda L: tmap[id(L)])
            if not _needs_swap([rawmap[id(r[0])] for r in by_x]) or [id(r[0]) for r in by_x] == [id(L) for L in want]:
                continue
            xs = [r[1] for r in by_x]
            for L, x in zip(want, xs):
                L["x"] = x
            changes.append("group %s: xep trai->phai theo loi noi: %s" % (g, " | ".join(_raw_text(L)[:16] for L in want)))
            continue
        want = sorted(order_vis, key=lambda L: tmap[id(L)])
        if not _needs_swap([rawmap[id(L)] for L in order_vis]) or [id(L) for L in want] == [id(L) for L in order_vis]:
            continue
        hmap = {id(r[0]): r[3] for r in geo}
        gaps = [(r2[2] - r2[3] / 2) - (r1[2] + r1[3] / 2) for r1, r2 in zip(by_y, by_y[1:])]
        top = by_y[0][2] - by_y[0][3] / 2
        for i, L in enumerate(want):
            h = hmap[id(L)]
            L["y"] = round(top + h / 2, 4)
            top = top + h + (gaps[i] if i < len(gaps) else 0)
        changes.append("group %s: xep tren->duoi theo loi noi: %s" % (g, " / ".join(_raw_text(L)[:16] for L in want)))


# --- 3. CHU RO NET TREN NEN THAT ---------------------------------------------
_bg_cache = {}


def _sample_region(path, t, crop):
    """Mau (do sang tb, do lech) cua vung crop (x0,y0,x1,y1 phan khung) trong video (t giay) / anh (t None)."""
    import subprocess
    try:
        import numpy as np
    except ImportError:
        return None
    if not path or not os.path.isfile(path):
        return None
    key = (path, None if t is None else round(t, 1), tuple(round(v, 3) for v in crop))
    if key in _bg_cache:
        return _bg_cache[key]
    info = RP.probe(path)
    W, H = int(info.get("width") or 0), int(info.get("height") or 0)
    if not W or not H:
        return None
    x0, y0, x1, y1 = [RP._clamp(v, 0.0, 1.0) for v in crop]
    cw, ch = max(4, int((x1 - x0) * W)), max(4, int((y1 - y0) * H))
    if x1 - x0 < 0.01 or y1 - y0 < 0.005:
        return None
    ow = 48
    oh = max(2, int(round(ow * ch / float(cw) / 2) * 2))
    argv = [RP._ffbin("ffmpeg"), "-v", "error"]
    if t is not None:
        argv += ["-ss", "%.3f" % max(0.0, t)]
    argv += ["-i", path, "-frames:v", "1", "-vf", "crop=%d:%d:%d:%d,scale=%d:%d" % (cw, ch, int(x0 * W), int(y0 * H), ow, oh),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    try:
        r = subprocess.run(argv, capture_output=True, timeout=60)
        a = np.frombuffer(r.stdout, dtype=np.uint8)
        if a.size != ow * oh * 3:
            return None
        px = a.reshape(-1, 3).astype(np.float32) / 255.0
        lin = np.where(px <= 0.03928, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
        lum = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        res = {"lum": float(lum.mean()), "std": float(np.sqrt(np.clip(lum, 0, 1)).std())}
    except Exception:
        res = None
    _bg_cache[key] = res
    return res


def _bg_under(spec, L):
    """Nen THAT phia sau khoi chu luc no hien: khung video nguon / anh B-roll / nen gradient.
    Tra {"lum", "std"} hoac None (khong biet)."""
    x0, y0, x1, y1 = _bbox(L)
    t = L["start"] + min(0.3, (L["end"] - L["start"]) / 2)
    sc = scene_at(spec.get("scenes") or [], t)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    def inside(r):
        return r and r["x"] <= cx <= r["x"] + r["w"] and r["y"] <= cy <= r["y"] + r["h"]

    if sc:
        pr = sc.get("panelRect")
        panel = sc.get("panel")
        if panel and inside(pr):
            rel = ((x0 - pr["x"]) / pr["w"], (y0 - pr["y"]) / pr["h"], (x1 - pr["x"]) / pr["w"], (y1 - pr["y"]) / pr["h"])
            if panel.get("kind") == "image":
                return _sample_region(panel.get("path"), None, rel)
            if panel.get("kind") == "source":
                return _sample_region(panel.get("path"), providers._f(panel.get("srcStart")) + (t - sc["start"]), rel)
        ar = sc.get("aroll")
        if sc["layout"] in ("card", "graphic", "circle") and not inside(ar):
            bg = sc.get("bg") or {}
            if bg.get("kind") == "image":
                return _sample_region(bg.get("path"), None, (x0, y0, x1, y1))
            cols = [c for c in (_rgba(c) for c in bg.get("colors") or []) if c]
            if cols:
                ls = [_lum(c) for c in cols]
                return {"lum": sum(ls) / len(ls), "std": 0.05}
            return None
        if sc["layout"] in ("broll", "graphic"):
            return None
        if ar and sc["layout"] != "full":
            x0, y0, x1, y1 = ((x0 - ar["x"]) / ar["w"], (y0 - ar["y"]) / ar["h"],
                              (x1 - ar["x"]) / ar["w"], (y1 - ar["y"]) / ar["h"])
    clip = next((c for c in spec.get("clips") or [] if c["start"] <= t < c["end"] and not c.get("freeze")), None)
    if not clip or not clip.get("path"):
        return None
    ts = clip["srcStart"] + (t - clip["start"]) * (clip.get("speed") or 1.0)
    if not sc or sc["layout"] == "full":
        # khung chu tren man hinh -> vung tuong ung trong khung nguon (cover + mat + jump-cut zoom)
        _c, to_s, _k = clip_map(clip, spec.get("width") or 1080, spec.get("height") or 1920)
        x0, y0 = to_s(x0, y0)
        x1, y1 = to_s(x1, y1)
    return _sample_region(clip["path"], ts, (x0, y0, x1, y1))


def ensure_legible(spec, kit, changes):
    """Chu phai RO tren NEN THAT: do do sang nen sau khoi chu (khung video / anh / gradient). Tuong
    phan < 4.5 hoac nen nhieu chi tiet -> them vien mong + bong sat chu (mau vien nguoc nen).
    Chu trong hop nen (box) -> doi mau chu cho tuong phan voi hop."""
    for L in spec.get("layers") or []:
        if L.get("type") not in ("text", "counter") or L.get("art"):
            continue
        spans = L.get("spans") or []
        box = L.get("box") if isinstance(L.get("box"), dict) else None
        bc = _rgba(box.get("color")) if box else None
        if bc and bc[3] >= 0.6:
            lb = _lum(bc)
            for sp in spans or [L]:
                lf = _lum(_fill_of(sp, L))
                if _contrast(lf, lb) < MIN_CONTRAST and not sp.get("gradient"):
                    new = "#FFFFFF" if _contrast(1.0, lb) >= _contrast(_lum((0.1, 0.08, 0.07)), lb) else "#1B1412"
                    sp["color"] = new
                    changes.append("%s: chu tren hop nen tuong phan thap -> %s" % (L["id"], new))
            continue
        bg = _bg_under(spec, L)
        need_shadow = False
        for sp in spans or [L]:
            lf = _lum(_fill_of(sp, L))
            size = _sz(sp, L) if spans else float(L.get("size") or 120)
            cr = _contrast(lf, bg["lum"]) if bg else None
            if bg and cr >= MIN_CONTRAST and bg["std"] <= BUSY_BG_STD:
                continue
            need_shadow = True
            st = sp.get("stroke") if sp.get("stroke") is not None else L.get("stroke")
            if isinstance(st, dict) and float(st.get("width") or 0) >= 2:
                continue
            light_bg = bg is None or bg["lum"] > 0.3
            col = LIGHT_SEP if (lf < 0.3 and not light_bg) else DARK_SEP
            w = round(max(2.0, min(8.0, size * (0.035 if (sp.get("font") or L.get("font")) in SCRIPT_FONTS else 0.03))), 1)
            sp["stroke"] = {"color": col, "width": w}
            changes.append("%s: chu '%s' kho doc tren nen (%s) -> vien %.0fpx" % (
                L["id"], str(sp.get("text") or "")[:20],
                "tuong phan %.1f, nen %s" % (cr, "nhieu chi tiet" if bg["std"] > BUSY_BG_STD else "don") if bg else "khong do duoc nen",
                w))
        if need_shadow and not L.get("shadow"):
            L["shadow"] = [{"x": 0, "y": 3, "blur": 8, "color": "rgba(0,0,0,0.55)"},
                           {"x": 0, "y": 0, "blur": 22, "color": "rgba(0,0,0,0.35)"}]


def separate_group_overlaps(spec, kit, changes):
    """6 + 7. Hai lop chu CUNG luc de len nhau:
    - KHAC to hop (khac group / khong group) -> 'moi luc mot khoi chu noi bat': khoi truoc TAT khi khoi sau
      xuat hien (khong de hai khoi tranh nhau); con qua it thoi gian thi tach vi tri.
    - CUNG to hop -> lop tren (track cao / ve sau) co lop tach ro; chong qua 35% chieu cao lop nho -> tach bot."""
    pal = (kit or {}).get("palette") or {}
    texts = [L for L in spec.get("layers") or [] if L.get("type") == "text" and not L.get("keyframes")]
    done = set()                 # moi span chi doi mau 1 lan (khong lat qua lat lai giua cac cap)
    for i, A in enumerate(texts):
        for B in texts[i + 1:]:
            if min(A["end"], B["end"]) - max(A["start"], B["start"]) <= 0.1:
                continue
            a, b = _bbox(A), _bbox(B)
            ix = min(a[2], b[2]) - max(a[0], b[0])
            iy = min(a[3], b[3]) - max(a[1], b[1])
            if ix <= 0 or iy <= 0:
                continue
            same = A.get("group") and A.get("group") == B.get("group")
            if not same:
                first, later = (A, B) if A["start"] <= B["start"] else (B, A)
                if later["start"] - first["start"] >= 0.3:
                    old = first["end"]
                    first["end"] = round(later["start"] + 0.05, 3)
                    for M in spec.get("layers") or []:      # ca to hop cua khoi truoc tat cung luc
                        if first.get("group") and M.get("group") == first["group"] and M["end"] > first["end"]:
                            M["end"] = first["end"]
                    changes.append("%s: dang hien thi %s xuat hien de len -> tat luc %.2fs (moi luc mot khoi chu, "
                                   "truoc la %.2fs)" % (first["id"], later["id"], first["end"], old))
                    continue
            up, lo = (B, A) if (B.get("track", 20), 1) >= (A.get("track", 20), 0) else (A, B)
            hu, hl = _bbox(up)[3] - _bbox(up)[1], _bbox(lo)[3] - _bbox(lo)[1]
            lim = 0.35 * min(hu, hl)
            if iy > lim and not up.get("behind") and not lo.get("behind"):
                d = iy - lim
                if up["y"] >= lo["y"]:
                    up["y"] = round(min(0.8, up["y"] + d), 4)
                else:
                    up["y"] = round(max(0.07, up["y"] - d), 4)
                changes.append("%s: de len %s qua nhieu -> tach %.3f" % (up["id"], lo["id"], d))
            if up.get("art") or lo.get("art"):
                continue                 # chu anh: vien / bong da ve san trong anh
            for sp in up.get("spans") or []:
                _separate(sp, lo.get("spans") or [], up, pal, changes, up["id"], L_below=lo, done=done)


# --- 5. CHU SAU NGUOI KHONG BI CHE NHIEU -------------------------------------
def _cover(mask, box):
    """Phan khoi chu (x0,y0,x1,y1) bi nguoi che, toan khoi va nua tren."""
    h, w = mask.shape
    x0, y0, x1, y1 = [RP._clamp(v, 0.0, 1.0) for v in box]
    if x1 - x0 < 0.005 or y1 - y0 < 0.005:
        return 0.0, 0.0
    c0, c1 = int(x0 * w), max(int(x0 * w) + 1, int(x1 * w))
    r0, r1 = int(y0 * h), max(int(y0 * h) + 1, int(y1 * h))
    sub = mask[r0:r1, c0:c1]
    top = sub[:max(1, (r1 - r0) // 2)]
    return float(sub.mean()) if sub.size else 0.0, float(top.mean()) if top.size else 0.0


def _behind_clear(hits, clip, matte, spec, changes):
    """Chu 'sau nguoi': nguoi che <= 22% khoi chu va <= 10% nua tren chu (van doc duoc ca tu); tang
    phia truoc cung to hop khong de len mat. Do bang mat na tach nguoi that o 5 thoi diem. Khong dat
    duoc -> nang ca to hop len / thu nho; van khong duoc -> chu ra TRUOC nguoi, dat tren dau."""
    sp_ = clip.get("speed") or 1.0
    for L in hits:
        if L.get("type") not in ("text", "counter") or L.get("keyframes") or not L.get("behind"):
            continue
        d_ = L["end"] - L["start"]
        ts = [L["start"] + 0.15] + [L["start"] + d_ * f for f in (0.3, 0.5, 0.7)] + [L["end"] - 0.1]
        masks = []
        for t in ts:
            if not clip["start"] <= t < clip["end"]:
                continue
            m = media_vision.matte_mask(matte["path"], clip["srcStart"] + (t - clip["start"]) * sp_ - matte["srcStart"])
            if m is not None:
                masks.append(m)
        if not masks:
            continue
        head = _head_on_canvas(media_vision.matte_head(
            matte["path"], clip["srcStart"] + (ts[1] - clip["start"]) * sp_ - matte["srcStart"]), clip, spec)
        _to_c, to_s, _kw = clip_map(clip, spec.get("width") or 1080, spec.get("height") or 1920)
        mem = [M for M in spec.get("layers") or [] if M is not L and L.get("group") and M.get("group") == L["group"]
               and not M.get("keyframes")]
        front = [M for M in mem if not M.get("behind") and M.get("type") in ("text", "counter", "badge")]
        face = None
        if head:
            hh = (head.get("w") or 0.3) * 1.35 * spec["width"] / float(spec["height"])
            face = (head["cx"] - head["w"] * 0.6, head["top"] + 0.01, head["cx"] + head["w"] * 0.6, head["top"] + hh)

        def ok(dy, k):
            b = _bbox(dict(L, y=L["y"] + dy))
            if k != 1.0:
                cx_, cy_ = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                b = (cx_ - (cx_ - b[0]) * k, cy_ - (cy_ - b[1]) * k, cx_ + (b[2] - cx_) * k, cy_ + (b[3] - cy_) * k)
            if b[1] < 0.06:
                return False
            bs = to_s(b[0], b[1]) + to_s(b[2], b[3])       # khung chu -> toa do mat na (nguon)
            for m in masks:
                allc, topc = _cover(m, bs)
                if allc > BEHIND_MAX_COVER or topc > BEHIND_MAX_COVER_TOP:
                    return False
            if face:
                for M in front:
                    mb = _bbox(dict(M, y=L["y"] + dy + (M["y"] - L["y"]) * k))
                    if mb[0] < face[2] and mb[2] > face[0] and mb[1] < face[3] and mb[3] > face[1]:
                        return False
            return True

        found = None
        for k in (1.0, 0.85, 0.72):
            for step in range(0, 41):
                dy = -0.012 * step
                if ok(dy, k):
                    found = (dy, k)
                    break
            if found:
                break
        b0 = _bbox(L)
        before = _cover(masks[0], to_s(b0[0], b0[1]) + to_s(b0[2], b0[3]))[0]
        if found:
            dy, k = found
            if abs(dy) < 1e-6 and k == 1.0:
                continue
            ly = L["y"]
            for M in [L] + mem:
                if k != 1.0:
                    _scale_text(M, k)
                M["y"] = round(ly + dy + (M["y"] - ly) * k, 4)
            changes.append("%s: chu sau nguoi bi che %.0f%% -> nang %.3f%s de doc duoc" % (
                L["id"], before * 100, -dy, (", thu nho %.0f%%" % (k * 100)) if k != 1.0 else ""))
            continue
        # khong the de sau nguoi ma van doc duoc -> dua ra TRUOC, dat tren dau (hoac giu, bao lai)
        L.pop("behind", None)
        if head:
            grp = [L] + mem
            y0 = min(_bbox(M)[1] for M in grp)
            y1 = max(_bbox(M)[3] for M in grp)
            room = head["top"] - 0.075
            k = min(1.0, room / (y1 - y0)) if y1 > y0 else 1.0
            if k >= 0.55:
                shift = (0.07 - y0 * k)
                for M in grp:
                    if k < 0.999:
                        _scale_text(M, k)
                    M["y"] = round(M["y"] * k + shift, 4)
                changes.append("%s: chu sau nguoi bi che %.0f%%, khong cho nao doc duoc -> dua ra TRUOC nguoi, "
                               "dat tren dau%s" % (L["id"], before * 100, (", thu nho %.0f%%" % (k * 100)) if k < 0.999 else ""))
                continue
        changes.append("%s: chu sau nguoi bi che %.0f%% -> dua ra TRUOC nguoi" % (L["id"], before * 100))


def _layer_band(L):
    """Dai doc (tu y1 den y2, 0..1) ma lop CHU chiem — de phu de ne ra. Hinh/vong/mui ten: None."""
    typ = L.get("type")
    if typ == "text":
        h = _text_height(L)
    elif typ == "counter":
        h = (L.get("size") or 120) * 1.1 / 1920
    elif typ == "badge":
        h = (L.get("w") or 0.2) * 1080 / 1920 * 1.15
    elif L.get("um") and L.get("h"):
        h = L["h"]          # tu lieu cua nguoi dung (anh / video) — chieu cao that theo ti le
    else:
        return None
    return L["y"] - h / 2, L["y"] + h / 2


SUB_GAP = 0.04          # phu de loi noi va chu noi bat: cach nhau TOI THIEU 4% chieu cao khung (~77px)
SUB_Y_RANGE = (0.10, 0.80)
SUB_MAX_MOVE = 0.22     # doi phu de toi da 22% chieu cao khung — xa hon thi phu de nhay lung tung, kho theo doi


def _caption_half(c, W=1080, H=1920):
    """Nua chieu cao THAT cua khoi phu de (phan canvas): so dong theo co chu + be ngang 86% khung
    (Captions.tsx), dong cao ~1.3 co chu, cong le hop nen / vien. Uoc hoi RONG de chac chan khong cham."""
    size = float(c.get("size") or 48)
    text = str(c.get("text") or "")
    per_line = max(1, int(0.86 * W / (size * 0.56)))
    lines = max(1, -(-len(text) // per_line))
    return (lines * size * 1.3 + size * 0.45) / H / 2


def _hero_box(x):
    """Khung (y0, y1) cua mot khoi chu noi bat (lop chu R4 / caption hero)."""
    if x.get("_cap"):
        c = x["_cap"]
        cy, h2 = (float(c.get("y") or 0) + 1) / 2, _caption_half(c)
        return cy - h2, cy + h2
    b = _layer_band(x)
    return b


def dodge_subtitles(spec, changes):
    """Phu de loi noi (karaoke) va CHU NOI BAT (lop chu do hoa + caption hero) TUYET DOI khong chong hay
    sat nhau (user 2026-09-27: 'bang chinh tai khoan cua minh' de len 'TAI KHOAN CUA MINH'):
    - caption hero trung gio lop chu do hoa -> bo (lop do hoa da lam chu nhan);
    - phu de: tinh DUNG chieu cao ca hai khoi, doi ra vi tri TRONG gan nhat (cach >= SUB_GAP, khong de
      len mat nguoi); khong con cho -> AN phu de trong luc chu noi bat hien (chu noi bat thuong noi
      cung y) — chi giu phan phu de ngoai khoang do."""
    import fx_flow
    layers = [L for L in spec.get("layers") or [] if L.get("type") in ("text", "counter", "badge") or L.get("um")]
    caps = spec.get("captions") or []
    heroes_cap = [c for c in caps if c.get("role") == "hero"]
    keep_hero = []
    for c in heroes_cap:
        if any(min(c["end"], L["end"]) - max(c["start"], L["start"]) > 0.05 and L.get("type") in ("text", "counter")
               for L in layers):
            changes.append("caption hero '%s': trung gio lop chu do hoa -> bo" % (c.get("text") or "")[:30])
            continue
        keep_hero.append(c)
    obstacles = [L for L in layers if not L.get("replacesSubtitle")] + [
        {"_cap": c, "start": c["start"], "end": c["end"], "id": "hero:" + str(c.get("text") or "")[:16]} for c in keep_hero]
    W, H = spec.get("width") or 1080, spec.get("height") or 1920
    out = []
    for c in caps:
        if c.get("role") == "hero":
            if c in keep_hero:
                out.append(c)
            continue
        hits = [o for o in obstacles if min(c["end"], o["end"]) - max(c["start"], o["start"]) > 0.02]
        if not hits:
            out.append(c)
            continue
        h2 = _caption_half(c, W, H)
        bands = [b for b in (_hero_box(o) for o in hits) if b]
        # mat nguoi luc phu de hien (khong dat phu de len mat)
        face = None
        try:
            fp = fx_flow._face_px(spec, (c["start"] + c["end"]) / 2, W, H)
            if fp:
                face = (fp["y"] / H - fp["h"] / H * 0.55, fp["y"] / H + fp["h"] / H * 0.55)
        except Exception:
            face = None

        def ok(y):
            a, b = y - h2, y + h2
            if a < SUB_Y_RANGE[0] - 0.02 or b > SUB_Y_RANGE[1] + 0.02:
                return False
            if face and a < face[1] and b > face[0]:
                return False
            return all(b + SUB_GAP <= y0 or a - SUB_GAP >= y1 for y0, y1 in bands)

        y_now = (float(c.get("y") or 0) + 1) / 2
        if ok(y_now):
            out.append(c)
            continue
        cand = [SUB_Y_RANGE[0] + 0.005 * i for i in range(int((SUB_Y_RANGE[1] - SUB_Y_RANGE[0]) / 0.005) + 1)]
        good = sorted((abs(y - y_now), y) for y in cand if ok(y) and abs(y - y_now) <= SUB_MAX_MOVE)
        if good:
            ny = round(RP._clamp(2 * good[0][1] - 1, *RP.SAFE_Y), 3)
            changes.append("phu de '%s': cach chu noi bat >= %.0f%% khung (y %.2f -> %.2f)"
                           % ((c.get("text") or "")[:24], SUB_GAP * 100, c["y"], ny))
            c["y"] = ny
            out.append(c)
            continue
        # khong con cho trong: an phu de trong luc chu noi bat hien, giu phan ngoai khoang do
        busy = sorted((max(c["start"], o["start"]), min(c["end"], o["end"])) for o in hits)
        free, cur = [], c["start"]
        for a, b in busy:
            if a - cur >= 0.4:
                free.append((cur, a))
            cur = max(cur, b)
        if c["end"] - cur >= 0.4:
            free.append((cur, c["end"]))
        if not free:
            changes.append("phu de '%s': khong con cho trong canh chu noi bat -> an trong luc chu noi bat hien"
                           % (c.get("text") or "")[:24])
            continue
        for k, (a, b) in enumerate(free):
            part = dict(c, start=round(a, 3), end=round(b, 3))
            if isinstance(c.get("words"), list):
                part["words"] = [w for w in c["words"] if isinstance(w, dict) and a - 0.05 <= float(w.get("start", a)) < b]
            out.append(part)
        changes.append("phu de '%s': khong con cho trong -> chi hien ngoai luc chu noi bat hien" % (c.get("text") or "")[:24])
    out.sort(key=lambda c: c["start"])
    spec["captions"] = out


# ---------------------------------------------------------------------------
# BAO VE MAT NGUOI NOI (user 2026-10-03: o HOOK chu '1 NUT LA XONG' de ngang mat — caption hero / chu anh AI cua
# hook sinh SAU buoc ne mat cu (_avoid_faces chi xet lop chu cua R4), anh / huy hieu thi khong buoc nao xet).
# Chay tren SPEC CUOI: moi thu hien len (lop chu, chu anh AI, huy hieu, bo dem, anh, hinh, tu lieu, caption hero,
# phu de) — khung THAT theo co chu / kich thuoc anh / keyframe phong to — doi chieu voi mat o TUNG thoi diem lop
# hien (bo cuc + jump-cut zoom + camera rung / phong cua hieu ung). HOOK: khong gi duoc de len mat. Than video:
# toi da FACE_BODY_MAX dien tich mat. Thu: tren dau -> duoi cam -> canh ben -> thu nho dan. Lop 'sau nguoi'
# (behind: nguoi ve de len chu) va lop toan khung (anh B-roll phu kin) khong tinh.
# ---------------------------------------------------------------------------
FACE_HOOK_MAX = 0.02        # hook: cham vien mat toi da 2% (sai so uoc luong khung chu)
FACE_BODY_MAX = 0.15        # than video: che toi da 15% khung mat (nhu tu lieu nguoi dung)
FACE_SAFE = (0.06, 0.82)    # vung dat duoc (tren 6% / duoi 82% bi giao dien TikTok che)
FACE_FULL_AREA = 0.55       # lop phu > 55% khung = canh phu toan man hinh, khong phai vat de len mat
_GUARD_TYPES = ("text", "counter", "badge", "image", "video", "box", "circle")   # vong (ring) khoanh mat: co y


def _img_ratio(path, _cache={}):
    """cao / rong cua anh (doc header)."""
    if path not in _cache:
        r = None
        try:
            from PIL import Image
            with Image.open(path) as im:
                r = im.size[1] / float(max(1, im.size[0]))
        except Exception:
            r = None
        _cache[path] = r
    return _cache[path]


def _kf_scale(L):
    s = float(L.get("scale") or 1.0)
    ks = [float(k.get("scale")) for k in L.get("keyframes") or [] if isinstance(k, dict) and k.get("scale") is not None]
    return s * max([1.0] + ks)


def _guard_box(L, W=1080, H=1920):
    """Khung (x0, y0, x1, y1) 0..1 lop chiem khi to nhat (keyframe phong to), theo diem neo. Khong uoc duoc -> None."""
    typ = L.get("type")
    if typ in ("text", "counter"):
        w, h = _text_width(L), _text_height(L) if typ == "text" else (L.get("size") or 120) * 1.1 / 1920
        if typ == "counter":
            w = max(w, (L.get("size") or 120) * 0.6 * 4 / 1080)
        if L.get("maxWidth") and not L.get("art"):
            w = min(w, float(L["maxWidth"]))
    elif typ == "badge" and L.get("art"):
        w, h = float(L["art"][0].get("w") or 0) / W, float(L["art"][0].get("h") or 0) / H
    elif typ in ("badge", "box", "circle", "ring", "image", "video"):
        w = float(L.get("w") or 0.3)
        if L.get("h") is not None:
            h = float(L["h"])
        elif typ == "image" and L.get("path"):
            r = _img_ratio(L["path"])
            if not r:
                return None
            h = w * W * r / H
        else:
            h = w * W / H
    else:
        return None
    k = _kf_scale(L)
    w, h = w * k, h * k
    x, y = float(L.get("x", 0.5)), float(L.get("y", 0.5))
    a = L.get("anchor") or "center"
    x0 = x if a == "left" else x - w if a == "right" else x - w / 2
    y0 = y if a == "top" else y - h if a == "bottom" else y - h / 2
    return (x0, y0, x0 + w, y0 + h)


def _cap_box(c, W=1080, H=1920):
    """Caption (hero / phu de) — khoi chu giua khung, rong theo noi dung (toi da 86%)."""
    size = float(c.get("size") or 48)
    tw = min(0.86, len(str(c.get("text") or "")) * size * 0.56 / W)
    cy, h2 = (float(c.get("y") or 0) + 1) / 2, _caption_half(c, W, H)
    return (0.5 - tw / 2, cy - h2, 0.5 + tw / 2, cy + h2)


def _cam_at(spec, t, fps=30):
    """(phong, dich x, dich y px) cua video luc t: hieu ung camera (look.ts cameraAt — lay DINH) x khung tu viet."""
    s, tx, ty = 1.0, 0.0, 0.0
    peak = {"zoom_punch": 0.2, "ken_burns": 0.13, "zoom_out_reveal": 0.32, "shake": 0.04, "pulse": 0.045,
            "fisheye": 0.06, "pan_left": 0.12, "pan_right": 0.12}
    for e in spec.get("effects") or []:
        if e.get("type") in peak and e["start"] <= t <= e["end"]:
            I = RP._clamp(float(e.get("intensity") if e.get("intensity") is not None else 0.7), 0, 1)
            s *= 1 + (peak[e["type"]] if e["type"] == "shake" else peak[e["type"]] * I)
            if e["type"] == "shake":
                tx, ty = tx + 26 * I, ty + 26 * I
            elif e["type"] in ("pan_left", "pan_right"):
                tx += 0.045 * 1080 * I
    for f in spec.get("fxTransforms") or []:
        if not (f["start"] <= t <= f["end"]) or not f.get("values"):
            continue
        i = max(0, int(round((t - f["start"]) * fps)))
        v = lambda k, d: (f["values"].get(k) or [d])[min(i, len(f["values"].get(k) or [d]) - 1)]  # noqa: E731
        s *= float(v("scale", 1.0))
        tx += abs(float(v("x", 0.0)))
        ty += abs(float(v("y", 0.0)))
    return s, tx, ty


def _face_rect(spec, t, W, H):
    """Khung mat (tran -> cam) 0..1 luc t tren man hinh, gom camera phong / rung. Khong co mat -> None."""
    import fx_flow
    fp = fx_flow._face_px(spec, t, W, H)
    if not fp:
        return None
    s, tx, ty = _cam_at(spec, t, int(spec.get("fps") or 30))
    cx, cy = W / 2 + (fp["x"] - W / 2) * s, H / 2 + (fp["y"] - H / 2) * s
    fw, fh = fp["w"] * s, fp["h"] * s
    # Vision: khung mat tu long may toi cam -> them tran (0.75) va 2 ben (0.55)
    return ((cx - fw * 0.55 - tx) / W, (cy - fh * 0.75 - ty) / H, (cx + fw * 0.55 + tx) / W, (cy + fh * 0.62 + ty) / H)


def _hook_end(spec):
    return max([c["end"] for c in spec.get("clips") or [] if c.get("kind") == "hook"] or [0.0])


def protect_face(spec, changes):
    """Khong chu / anh / do hoa nao de len mat nguoi noi — tuyet doi o HOOK, toi da FACE_BODY_MAX o than video."""
    import user_media as UM
    W, H = int(spec.get("width") or 1080), int(spec.get("height") or 1920)
    if not any(c.get("face") for c in spec.get("clips") or []):
        return
    hook_end = _hook_end(spec)
    behind_groups = {L.get("group") for L in spec.get("layers") or [] if L.get("behind") and L.get("group")}
    units = {}
    for L in spec.get("layers") or []:
        if L.get("group") and L["group"] in behind_groups:
            continue          # to hop co tang sau nguoi: da neo theo dinh dau (attach_subject_mattes)
        if L.get("type") not in _GUARD_TYPES or L.get("behind") or float(L.get("opacity") if L.get("opacity") is not None else 1) < 0.3:
            continue
        if L["type"] in ("box", "circle") and not L.get("group"):
            continue          # khung / hinh rieng le (vd nen mo, khoanh vung) — chi xet khi la nen cua to hop chu
        units.setdefault(("g", L["group"]) if L.get("group") else ("l", L["id"]), []).append(("L", L))
    for i, c in enumerate(spec.get("captions") or []):
        # phu de chi xet o hook (than video: dodge_subtitles da tranh mat khi doi cho)
        if c.get("role") == "hero" or c["start"] < hook_end:
            units[("c", i)] = [("C", c)]
    for key, mem in units.items():
        boxes = [(_guard_box(x, W, H) if kind == "L" else _cap_box(x, W, H)) for kind, x in mem]
        if any(b is None for b in boxes):
            continue
        st, en = min(x["start"] for _, x in mem), max(x["end"] for _, x in mem)
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        if (box[2] - box[0]) * (box[3] - box[1]) > FACE_FULL_AREA:
            continue
        in_hook = st < hook_end - 0.05
        lim = FACE_HOOK_MAX if in_hook else FACE_BODY_MAX
        ts = [st + 0.05 + 0.2 * j for j in range(max(1, int((en - st - 0.1) / 0.2) + 1))] + [max(st, en - 0.05)]
        faces = [f for f in (_face_rect(spec, t, W, H) for t in ts) if f]
        if not faces:
            continue

        def cover(b):
            return max(UM._inter(b, f) / max(1e-6, (f[2] - f[0]) * (f[3] - f[1])) for f in faces)

        if cover(box) <= lim:
            continue
        F = (min(f[0] for f in faces), min(f[1] for f in faces), max(f[2] for f in faces), max(f[3] for f in faces))
        fh = F[3] - F[1]
        hair = F[1] - fh * 0.3                 # dinh toc (khong de chu len toc cho de doc)
        bw, bh = box[2] - box[0], box[3] - box[1]
        cx0, cy0 = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        m = 0.015
        moved = None
        for k in (1.0, 0.88, 0.76, 0.64, 0.52, 0.42):
            ww, hh = bw * k, bh * k
            cands = []
            for top in (hair, F[1]):
                if top - m - hh >= FACE_SAFE[0]:
                    cands.append(("tren dau" if top == hair else "tren tran", cx0, top - m - hh / 2))
            if F[3] + m + hh <= FACE_SAFE[1]:
                cands.append(("duoi cam", cx0, F[3] + m + hh / 2))
            if F[0] - m - ww >= 0.02:
                cands.append(("ben trai", F[0] - m - ww / 2, cy0))
            if F[2] + m + ww <= 0.98:
                cands.append(("ben phai", F[2] + m + ww / 2, cy0))
            best = None
            for note, cx, cy in cands:
                cx = RP._clamp(cx, 0.02 + ww / 2, 0.98 - ww / 2) if ww < 0.96 else 0.5
                cy = RP._clamp(cy, FACE_SAFE[0] + hh / 2, FACE_SAFE[1] - hh / 2)
                b = (cx - ww / 2, cy - hh / 2, cx + ww / 2, cy + hh / 2)
                if cover(b) <= lim:
                    d = abs(cx - cx0) + abs(cy - cy0)
                    if best is None or d < best[0]:
                        best = (d, note, cx, cy)
            if best:
                moved = (best[1], best[2], best[3], k)
                break
        if not moved:
            if in_hook:
                # khong con cho nao (mat chiem gan het khung): bo lop khoi hook con hon che mat
                for kind, x in mem:
                    if kind == "L":
                        spec["layers"] = [y for y in spec["layers"] if y is not x]
                    else:
                        spec["captions"] = [y for y in spec["captions"] if y is not x]
                changes.append("%s: hook — khong con cho trong ngoai mat nguoi noi -> bo" % _guard_name(mem))
            else:
                changes.append("%s: de len mat nguoi noi, khong con cho ne — giu vi tri" % _guard_name(mem))
            continue
        note, cx, cy, k = moved
        # doi ca khoi quanh tam (to hop nhieu tang giu nguyen bo cuc tuong doi), thu nho quanh tam khoi
        for kind, x in mem:
            if kind == "L":
                ox, oy = float(x.get("x", 0.5)), float(x.get("y", 0.5))
                x["x"] = round(cx + (ox - cx0) * k, 4)
                x["y"] = round(cy + (oy - cy0) * k, 4)
                for kf in x.get("keyframes") or []:
                    if isinstance(kf, dict) and kf.get("x") is not None:
                        kf["x"] = round(cx + (float(kf["x"]) - cx0) * k, 4)
                    if isinstance(kf, dict) and kf.get("y") is not None:
                        kf["y"] = round(cy + (float(kf["y"]) - cy0) * k, 4)
                if k < 0.999:
                    _scale_layer(x, k)
            else:
                oy = (float(x.get("y") or 0) + 1) / 2
                x["y"] = round(2 * (cy + (oy - cy0) * k) - 1, 3)
                if k < 0.999 and x.get("size"):
                    x["size"] = round(float(x["size"]) * k, 1)
        changes.append("%s: %s de len mat nguoi noi -> %s%s" % (
            _guard_name(mem), "hook —" if in_hook else "", note, ", thu nho %.0f%%" % (k * 100) if k < 0.999 else ""))


def _guard_name(mem):
    return ",".join(("caption '%s'" % (x.get("text") or "")[:20]) if kind == "C" else x["id"] for kind, x in mem)


def _scale_layer(L, k):
    """Thu nho mot lop k lan (chu: co chu; chu anh / huy hieu anh: kich thuoc anh; hinh / anh: be ngang)."""
    if L.get("type") in ("text", "counter"):
        _scale_text(L, k)
    for a in L.get("art") or []:
        for key in ("w", "h", "mt"):
            if a.get(key):
                a[key] = round(float(a[key]) * k, 1)
    if L.get("type") in ("badge", "box", "circle", "ring", "image", "video"):
        if L.get("w"):
            L["w"] = round(float(L["w"]) * k, 4)
        if L.get("h") is not None:
            L["h"] = round(float(L["h"]) * k, 4)


def _beats(items, gap=0.6):
    n, last = 0, None
    for t in sorted(k["start"] for k in items):
        if last is None or t - last >= gap:
            n, last = n + 1, t
    return n


def _reveal_words(p, it, asr):
    """Moc tung tu cho the 'sang dan theo loi noi' — lay tu Whisper trong khoang nguon cua lop."""
    sid = it.get("source_id") or (next(iter(asr)) if len(asr) == 1 else None)
    rows = asr.get(sid) if sid else None
    if not rows or it.get("src_start") is None:
        return None
    a, b = providers._f(it.get("src_start")), providers._f(it.get("src_end"))
    ws = []
    for w, s, e in rows:
        if a - 0.05 <= float(s) <= b:
            hit = RP.map_range(p, sid, float(s), float(s), "hook" if it.get("anchor") == "hook" else "body")
            if hit:
                ws.append({"text": w, "start": hit[0], "end": round(hit[0] + (float(e) - float(s)), 3)})
    return ws or None


def layer_sfx(layers, changes):
    """Goi y "sfx" cua lop -> muc audio (gio timeline) dung bo tieng motion tu tong hop."""
    import engine
    import sfx_kit
    lib = {e["id"]: e for e in engine.sfx_list()}
    out = []
    for L in layers:
        fam = L.pop("_sfx", None)
        if not fam:
            continue
        sid, path = sfx_kit.family_file(fam)
        if not sid:
            continue
        if sid not in lib:          # bo tieng vua duoc tao + dang ky (lan dau tren may) -> doc lai kho
            lib = {e["id"]: e for e in engine.sfx_list()}
        e = lib.get(sid) or {}
        item = {"sfx_id": sid, "file": path, "start": L["start"], "purpose": _sfx_purpose(fam),
                "_name": e.get("name"), "tags": e.get("tags") or [], "_lufs": e.get("lufs_m"), "_from_layer": L["id"]}
        if L.get("type") in TEXT_SFX_TYPES:
            item["_text"] = True
        out.append(item)
    if out:
        changes.append("tu gan %d SFX theo lop do hoa" % len(out))
    return out


def _sfx_purpose(fam):
    return ("ui" if fam in ("click", "pop", "typing") else "transition" if fam in ("whoosh", "swoosh")
            else "punch" if fam in ("boom", "impact", "punch") else "reveal")


def is_text_sfx(a):
    """Tieng gan voi luc CHU hien (lop chu R4, chu hero B7 'reveal', tieng code tu gan) — khong bi bo vi gian cach."""
    return bool(a.get("_text") or a.get("_auto_text") or a.get("purpose") == "reveal")


_SOFT_ENTER = {"fade", "blur_in", "letters_blur", "words_blur", "letters_fade", "rise", "words_rise"}
_SLIDE_ENTER = {"slide", "slide_left", "slide_right", "slide_up", "slide_down", "wipe", "stretch_x", "expand_y",
                "write_on", "draw"}
_SWING_ENTER = {"drop", "zoom_out", "spin_in", "flip", "glitch_in", "letters_drop"}


def text_sfx_family(L):
    """Tieng hop voi CHU nay theo cach no hien ra (kieu vao) + vai (bo dem so / huy hieu / chu to / chu nho)."""
    typ = L.get("type")
    pre = str((L.get("enter") or {}).get("preset") or "")
    size = max([float(sp.get("size") or 0) for sp in L.get("spans") or [] if isinstance(sp, dict)]
               + [float(L.get("size") or 0)])
    if typ == "counter":
        return "ding"
    if typ == "badge":
        return "pop"
    if pre == "typewriter":
        return "typing"
    if pre in _SLIDE_ENTER:
        return "swoosh"
    if pre in _SWING_ENTER:
        return "whoosh"
    if 0 < size < 75:
        return "click"          # chu nho / tang dan: tieng nhe
    if pre in _SOFT_ENTER:
        return "swoosh"
    return "pop"


def ensure_text_sfx(layers, captions, audio, duration, changes):
    """MOI chu hien ra (lop chu / bo dem / huy hieu R4, chu hero / micro R5, chu hook) deu co tieng luc hien. Chu chua
    co tieng nao bat dau trong [t - TEXT_SFX_EARLY, t + TEXT_SFX_LATE] -> gan tieng hop chu do (bo tieng motion).
    Chu hien cung nhip (<= TEXT_SFX_LATE sau chu vua gan) dung chung tieng. Tra cac muc audio them (gio timeline)."""
    import engine
    import sfx_kit
    need = []
    for L in layers or []:
        if L.get("type") in TEXT_SFX_TYPES and not L.get("um") and L.get("start") is not None:
            need.append((float(L["start"]), text_sfx_family(L), str(L.get("id"))))
    for n, c in enumerate(captions or []):
        if not isinstance(c, dict) or c.get("start") is None or not str(c.get("text") or "").strip():
            continue
        role = plan_guard.normalize_role(c.get("role"))
        if role == "micro":
            need.append((providers._f(c.get("start")), "click", "cap%s" % c.get("_n", n)))
        elif role == "hero":
            fam = "typing" if "type" in str(c.get("style") or "") else "pop"
            need.append((providers._f(c.get("start")), fam, "cap%s" % c.get("_n", n)))
    if not need:
        return []
    starts = [providers._f(a.get("start")) for a in audio or [] if (a.get("role") or "sfx") != "bgm"]
    lib = {e["id"]: e for e in engine.sfx_list()}
    out, names = [], []
    for t, fam, ref in sorted(need):
        if t >= duration - 0.05 or any(t - TEXT_SFX_EARLY <= s <= t + TEXT_SFX_LATE for s in starts):
            continue
        sid, path = sfx_kit.family_file(fam)
        if not sid:
            continue
        if sid not in lib:
            lib = {e["id"]: e for e in engine.sfx_list()}
        e = lib.get(sid) or {}
        out.append({"sfx_id": sid, "file": path, "start": round(t, 3), "purpose": _sfx_purpose(fam),
                    "_name": e.get("name"), "tags": e.get("tags") or [], "_lufs": e.get("lufs_m"),
                    "_from_layer": ref, "_auto_text": True})
        starts.append(t)
        names.append("%s@%.1fs=%s" % (ref, t, fam))
    if out:
        changes.append("luat chu co tieng: tu gan %d SFX cho chu chua co tieng (%s)" % (len(out), ", ".join(names)[:400]))
    return out
