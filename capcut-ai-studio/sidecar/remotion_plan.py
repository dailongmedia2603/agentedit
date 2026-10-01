#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LUONG VIDEO REMOTION — lap ke hoach + chuyen plan thanh RenderSpec.

  - Transition / hieu ung / mau / kieu chu / font chi lay trong DANH MUC REMOTION
    (assets/remotion_catalog.json) — cung file ma bo dung remotion-src/*.tsx doc, nen AI
    khong the chon thu bo dung khong ve duoc.
  - Kho SFX + kho meme la file ngoai (engine.py, meme_lib.py).
  - B1 chon chat lieu, B2 timeline, B3 hook, B6 meme, B7 SFX la cac buoc chung trong
    providers.py. R4 (hinh, motion_design.py) va R5 (chu) la prompt rieng cua Remotion.

build_spec() dung lai lop CAU TRUC cua plan_guard (hook cold-open, meme CAT vao,
quy doi gio nguon -> timeline, can cuong do SFX) — nhung logic nay da duoc kiem
chung tren video that, viet lai la de sai.
"""
import os
import re
import copy
import json
import functools
import subprocess

import config
import plan_guard
import creative
import prompt_store
import providers
import speech_align
from debug_log import log_step_note

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG_PATH = os.path.join(HERE, "assets", "remotion_catalog.json")

FPS = 30
CANVAS = {"w": 1080, "h": 1920}


def _p(name):
    """Prompt dang co hieu luc (ban nguoi dung sua trong "Prompt & quy tac" neu co)."""
    return prompt_store.get_prompt(name, globals()[name])


# ---------------------------------------------------------------------------
# DANH MUC
# ---------------------------------------------------------------------------
_CAT = {"mtime": None, "data": None}


def load_catalog():
    try:
        mt = os.path.getmtime(CATALOG_PATH)
    except OSError:
        mt = None
    if _CAT["data"] is None or _CAT["mtime"] != mt:
        with open(CATALOG_PATH, encoding="utf-8") as f:
            _CAT["data"] = json.load(f)
        _CAT["mtime"] = mt
    return _CAT["data"]


def _by_id(kind):
    return {it["id"]: it for it in load_catalog().get(kind) or []}


def catalog_for_prompt(kind):
    """Ban gon cho GPT: bo cac truong chi bo dung can (overlap...)."""
    keep = {
        "transitions": ("id", "label", "look", "energy", "use_when", "avoid_when", "duration"),
        "effects": ("id", "label", "look", "covers_face", "use_when", "avoid_when", "duration", "params"),
        "grades": ("id", "label", "look", "use_when"),
        "caption_styles": ("id", "label", "look", "roles", "use_when"),
        "fonts": ("id", "label", "look", "roles"),
    }[kind]
    return [{k: it[k] for k in keep if it.get(k) not in (None, "", [])}
            for it in load_catalog().get(kind) or []]


def _catalog_block():
    cat = load_catalog()
    return json.dumps({
        "transitions": catalog_for_prompt("transitions"),
        "effects": catalog_for_prompt("effects"),
        "grades": catalog_for_prompt("grades"),
        "caption_styles": catalog_for_prompt("caption_styles"),
        "fonts": catalog_for_prompt("fonts"),
        "accent_colors": cat.get("accent_colors") or [],
    }, ensure_ascii=False)


def transition_goi_y_hook():
    """Transition hop cho hook -> than video (B3 chon bang id)."""
    return [{"id": t["id"], "label": t["label"], "look": t["look"]}
            for t in load_catalog().get("transitions") or []
            if t.get("energy") == "high" or t["id"] in ("zoom_out", "iris")]


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------
_RM_REFERENCE_PROMPT = """Ban la Creative Director chuyen reverse-engineer phong cach video short-form (TikTok/Reels/Shorts).
Ban nhan:
 (1) VIDEO MAU dinh kem: XEM hinh chay va NGHE tieng (giong noi, nhac nen, SFX).
 (2) DU_LIEU_DO (do bang may — CHINH XAC, tin hon uoc luong cua ban): do dai, kich thuoc, cac moc cat canh,
     so giay trung binh moi shot, duong do to am thanh theo tung giay.

Nhiem vu: phan tich RIENG he thong phong cach dung (nhip, cach cat, caption, hieu ung, mau, bo cuc, am thanh)
de mot video KHAC ap dung lai. Khong phan tich no nhu video nguon, khong chep noi dung.

# CACH DOC
- Nhip cat: dung "moc_cat_canh" + "giay_moi_shot_tb" trong DU_LIEU_DO, khong tu dem. Gio ban tu uoc (structure,
  evidence) de lech 0.5-2s — bam vao moc cat canh / dinh to trong DU_LIEU_DO khi ghi gio.
- Caption: doc tren khung — chu hoa/thuong, do dam, vien, hop nen, mau chu + mau nhan, vi tri (tren/giua/duoi),
  so tu moi cum, co to mau tung chu dang noi (karaoke) hay hien ca cum, chu to (hero) xuat hien khi nao.
- Canh doi han tai moc cat = cat canh. Cung canh nhung khung to / nho khac = zoom / jump-cut.
- Hieu ung: loe trang, rung, nhoe, tach mau, emoji/sticker, khung den tren duoi... chi ghi cai THAY duoc.
- Am thanh: NGHE truc tiep — nhac nen (the loai, cam xuc, to / nho so voi giong), SFX (loai tieng, dat o dau:
  chuyen canh / chu bat / con so...), co bam nhip (beat sync) khong. Doi chieu duong do to de ghi dung gio.
- Moi nhan dinh quan trong nen kem gio (giay) lam bang chung trong "evidence".

# DANH MUC REMOTION
Cuoi prompt co DANH MUC nhung gi bo dung lam duoc (transition, hieu ung, mau, kieu chu, font). Trong
"remotion_hints" hay chon id GAN NHAT voi video mau — de buoc sau dung lai phong cach nay.

Tra ve CHI JSON dung schema (GIU NGUYEN TEN TRUONG — cac buoc sau doc theo ten nay):
{
  "summary": "phong cach tong quan",
  "duration": <giay>,
  "format": "talking_head|montage|story|review|tutorial|mixed",
  "pacing": {
    "energy": "low|medium|high",
    "average_shot_seconds": <so, lay tu DU_LIEU_DO>,
    "cut_density": "mo ta",
    "rhythm_pattern": "nhip nhanh/cham va diem doi nhip (kem giay)",
    "pause_handling": "cat het khoang lang | giu khoang nghi"
  },
  "structure": [{"start": 0.0, "end": 3.0, "role": "hook|setup|body|proof|cta|other", "description": "..."}],
  "editing_language": {
    "cuts": ["jump cut, match cut..."],
    "transitions": [{"type": "mo ta hinh anh", "when": "luc nao", "frequency": "low|medium|high"}],
    "camera_motion": ["zoom punch, pan, ken burns..."],
    "effects": [{"look": "mo ta", "purpose": "muc dich", "intensity": "low|medium|high"}]
  },
  "captions": {
    "density": "low|medium|high",
    "words_per_chunk": "vd 3-6",
    "position": "vi tri",
    "colors": ["#FFFFFF", "#FFD600"],
    "animation": "cach chu vao/ra, co karaoke khong",
    "keyword_emphasis": "cach nhan tu",
    "hierarchy": {"levels": 1, "hero": "...", "support": "...", "size_contrast": "...", "layout": "..."}
  },
  "audio": {"music_mood": "...", "music_level": "...", "sfx_pattern": ["..."], "beat_sync": "..."},
  "visual_identity": {"color_tone": "...", "composition": "...", "overlays": ["..."]},
  "transfer_rules": ["nguyen tac nen ap dung vao video moi"],
  "avoid_copying": ["noi dung/chi tiet khong nen sao che"],
  "warnings": ["thu kho tai tao, hoac nhan dinh chi la suy doan"],
  "remotion_hints": {
    "caption_style_body": "<id caption_styles cho phu de loi noi>",
    "caption_style_hero": "<id caption_styles cho chu nhan>",
    "font_body": "<id fonts>", "font_hero": "<id fonts>",
    "accent_colors": ["#..."],
    "uppercase_hero": true,
    "grade": "<id grades>",
    "transitions": ["<id transitions, xep theo muc do video mau hay dung>"],
    "effects": ["<id effects>"],
    "notes": "cach ap dung tong the"
  },
  "evidence": [{"time": 3.2, "observation": "..."}]
}
CHI tra ve JSON."""

_RM_VISUAL_SYSTEM = """Ban la EDITOR chon CHUYEN CANH + HIEU UNG + TONG MAU cho video duoc dung bang REMOTION
(code React ve tung khung), KHONG phai CapCut. Moi id ban chon PHAI co trong DANH MUC REMOTION o cuoi.
Id khong co trong danh muc se bi bo. KHONG bia.

# DU LIEU DAU VAO
- cau_chuyen: story_arc, tone, nhip_truyen, edit_request. Tone nghiem tuc -> tiet che; hai/hype -> manh tay.
- segments[]: segment_index, target_start (gio timeline), nguon_tu/nguon_den (gio NGUON), beat/purpose,
  emotions, key_moments, cau_nhan_manh (cau chot / tu duoc nhan — gio NGUON).
- hook (neu co): doan da chon dat len DAU video (ban sao). Engine tu noi hook -> than video bang
  "hook_transition" ban chon ben duoi.
- phong_cach_mau / goi_y_remotion (neu co): phong cach video mau + id da duoc chon san cho gan video mau.
  Hoc TAN SUAT va DIEU KIEN dung, khong rai deu cho co.

# 1) TRANSITIONS (diem noi segment i -> i+1)
- Mac dinh la CAT THANG: KHONG ghi gi. Jump-cut trong cung mot mach noi KHONG can transition.
- Chi dat o cho DOI NHIP TRUYEN (setup -> twist, body -> payoff, sang y/muc moi) hoac doi cam xuc manh.
  Nhieu nhat khoang 1 transition moi 8-10 giay video.
- "segment_index": i = chuyen canh o CUOI segment i sang segment i+1. Khong dat cho segment cuoi.
- "duration" nam trong khoang "duration" cua muc do.
# 2) EFFECTS (hieu ung tren mot khoang)
- Neo theo GIO NGUON: "source_id" + "src_start" + "src_end" (lay tu cau_nhan_manh / key_moments /
  nguon_tu..nguon_den). Engine tu doi sang timeline — KHONG tu tinh gio timeline.
- zoom_punch: dung cau chot / tu khoa / con so (0.5-1.5s). ken_burns: doan noi dai 3s+ de hinh khong dung.
- Muc co "covers_face": true -> khong dat dung luc dang noi cau quan trong.
- Hieu ung MANH (shake, rgb_split, flash): cach nhau >= 3 giay. shake <= 2 ca video.
- KHONG dung emoji / icon emoji (xau, re tien) — he thong tu bo.
- Muon hieu ung nam tren BAN SAO hook o dau video: them "anchor": "hook" (src trong khoang hook).
- "why" ngan: hieu ung minh hoa cau nao.
# 3) GRADE — tong mau CA video (1 lua chon). "intensity" 0.3-0.9. Khong chac -> "none" hoac nhe (0.4).
# 4) HOOK_TRANSITION — chuyen hook -> than video (chi khi co hook). Thuong: flash, zoom_in, glitch, whip_*.

# SCHEMA DAU RA (CHI JSON)
{
  "transitions": [{"segment_index": 3, "type": "whip_left", "duration": 0.3, "why": "sang y thu hai"}],
  "effects": [
    {"type": "zoom_punch", "source_id": "source_1", "src_start": 12.4, "src_end": 13.3, "intensity": 0.8, "why": "con so 3 trieu"}
  ],
  "grade": {"preset": "warm", "intensity": 0.6},
  "hook_transition": {"type": "flash", "duration": 0.3}
}
⚠️ TRA VE CHI JSON GOC."""

_RM_CAPTION_SYSTEM = """Ban la COPYWRITER + DIRECTOR chu cho video short-form dung bang REMOTION.
Chu duoc trinh duyet ve: TU XUONG DONG trong khung rong 86% man hinh, KHONG bi tran khung nhu CapCut —
nen dung ha co chu hay cat cau vi so ky tu. Tap trung vao NOI DUNG + PHAN CAP + KIEU CHU.

Nguyen tac: dung lam MOI chu deu noi. Nguoi xem phai BIET NHIN CHU NAO TRUOC.

# HAI LOP CHU
A. PHU DE LOI NOI (role "support") — lop chinh, chay lien mach suot video nhu phu de TikTok:
   - Moi cum 3-7 tu, bam dung mot cau/cum trong transcript. Cac cum NOI TIEP nhau, KHONG chong gio.
   - Viet lai cho gon + dung chinh ta tieng Viet co dau, giu giong nguoi noi; bo tu dem (a, a, thi la...).
   - Gio: "src_start"/"src_end" = gio NGUON cua cum do (start_cuc_bo/end_cuc_bo trong transcript).
   - "emphasis": 0-2 tu khoa trong cum de to mau nhan (con so, ten, tu cam xuc).
B. CHU NHAN (role "hero") — 1-4 tu, CHI o khoanh khac dat: con so, tu khoa, twist, payoff, cau chot.
   - Toi da ~1 hero moi 6-8 giay. Doan binh thuong khong can hero.
   - Hero hien cung luc voi phu de -> dat KHAC VUNG: hero "upper", phu de "lower".
C. "micro" (tuy chon, hiem): ten / chuc danh / nguon / ten san pham — kieu lower_third.

# TU LIEU DA CO
- cau_chuyen (story_arc, tone, edit_request): chu phai ke cung cau chuyen, dung giong do.
  2-3 giay cuoi nen co 1 hero CTA bam muc dich trong edit_request.
- segments[].beat: hero uu tien o beat hook / twist / proof / payoff.
- hook (neu co): ban sao doan hook o DAU video DA CO chu hero rieng (hook.caption). KHONG viet caption
  "anchor": "hook". Phu de cho CHINH doan do o than video van viet binh thuong.
- faces_region: vung mat nguoi — chu khong duoc che mat.
- phong_cach_mau / goi_y_remotion (neu co): kieu chu, font, mau, mat do cua video mau. Hoc nguyen tac,
  khong chep noi dung.

# CAI DAT CHUNG ("caption_theme") — chon tu DANH MUC REMOTION o cuoi, HOP phong cach cua VIDEO NAY: co video mau
# (phong_cach_mau / goi_y_remotion) thi theo video mau; khong co thi tu chon theo noi dung + tone + edit_request.
# Gia tri trong schema duoi day la CHO TRONG, khong phai goi y.
- style_body: kieu phu de (karaoke | pop_words | outline_bold | tiktok_box | minimal)
- style_hero: kieu chu nhan (hero_title | neon | tiktok_box | highlight_marker)
- font_body, font_hero: id font (ca video TOI DA 2 font). accent: 1 mau nhan. uppercase_hero: true/false.
Tung caption co the ghi de "style" / "font" / "accent" neu that su can, con lai de trong.

# QUY TAC CHU (bat buoc)
- KHONG emoji / ky hieu emoji (🔒 🔥 ✅ ...) trong bat ky caption nao — he thong tu xoa.
- Moi luc chi MOT khoi chu noi bat: hero to, dam, ngan; phu de nho, nhe — khong de hai khoi ngang nhau tranh nhau.
- Hero va phu de hien cung luc: hero nam TREN neu cum do duoc NOI TRUOC (nguoi xem doc tren -> duoi).
- PHU DE va CHU NOI BAT (hero / lop chu do hoa) KHONG BAO GIO chong hay sat nhau: he thong tu doi phu de ra
  cho trong cach >= 4% khung, khong con cho thi AN phu de trong luc chu noi bat hien.
- Chu phai doc duoc tren nen video: khong chon mau chu gan mau nen; can nhan thi dung mau accent co vien/bong.

# VI TRI — "position": "top" | "upper" | "center" | "lower" | "bottom"
Mac dinh: phu de "lower", hero "upper". Mat nguoi o giua-tren -> tranh "center"/"upper" cho khoi chu dai.

# SCHEMA DAU RA (CHI JSON)
{
  "caption_theme": {"style_body": "<id>", "style_hero": "<id>", "font_body": "<id>",
                    "font_hero": "<id>", "accent": "<#mau>", "uppercase_hero": <true|false>},
  "captions": [
    {"text": "Hôm qua có bạn hỏi tui", "role": "support", "source_id": "source_1",
     "src_start": 0.0, "src_end": 2.4, "position": "lower", "emphasis": ["hỏi"]},
    {"text": "3 TRIỆU", "role": "hero", "source_id": "source_1", "src_start": 12.4, "src_end": 13.8,
     "position": "upper"}
  ]
}
⚠️ TRA VE CHI JSON GOC."""


# ---------------------------------------------------------------------------
# B4 (Remotion): chuyen canh + hieu ung + tong mau
# ---------------------------------------------------------------------------
def _hints(reference_analysis):
    h = (reference_analysis or {}).get("remotion_hints") if isinstance(reference_analysis, dict) else None
    return h if isinstance(h, dict) and h else None


def gpt_rm_visual(segments, emotion_map_data, transcript_data=None, key_moments_data=None,
                  story=None, reference_analysis=None, hook=None, log=None, brand=None):
    seg_context = []
    for i, seg in enumerate(segments or []):
        sid = seg.get("source_id", "")
        st, en = providers._f(seg.get("start")), providers._f(seg.get("end"))
        row = {
            "segment_index": i, "source_id": sid,
            "target_start": seg.get("target_start", 0), "duration": round(en - st, 2),
            "nguon_tu": st, "nguon_den": en,
            "emotions": [{"emotion": e.get("emotion"), "intensity": e.get("intensity"),
                          "evidence": e.get("evidence", "")}
                         for e in (emotion_map_data or {}).get(sid, []) or []
                         if providers._overlap(providers._f(e.get("start")), providers._f(e.get("end")), st, en)],
        }
        row.update(providers._nhip_cua_segment(seg))
        kms = [k for k in (key_moments_data or {}).get(sid, []) or []
               if providers._overlap(providers._f(k.get("start")), providers._f(k.get("end")), st, en)]
        if kms:
            row["key_moments"] = kms
        nhan = [t for t in providers._gon_loi_thoai((transcript_data or {}).get(sid), st, en)
                if t.get("is_punchline") or t.get("emphasis")]
        if nhan:
            row["cau_nhan_manh"] = nhan
        seg_context.append(row)
    payload = {"cau_chuyen": story or {}, "hook": hook, "segments": seg_context}
    ref = providers.phong_cach_cho_buoc(reference_analysis, "effects")
    if ref:
        payload["phong_cach_mau"] = ref
    if _hints(reference_analysis):
        payload["goi_y_remotion"] = _hints(reference_analysis)
    import hook_rule
    sys_prompt = (_p("_RM_VISUAL_SYSTEM") + "\n\n# DANH MUC REMOTION (chi dung id trong nay):\n" + _catalog_block()
                  + hook_rule.luat("R4") + creative.luat("R4"))
    import brand_guide
    if brand_guide.view(brand, "plan"):
        payload["brand_guideline"] = brand_guide.view(brand, "plan")
        sys_prompt += brand_guide.rule_text(brand, "plan")
    if log:
        log("R4: %s chon chuyen canh / hieu ung / tong mau Remotion..." % providers.plan_ai_name())
    text = providers.plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=8000, temperature=0.5, req_timeout=120, max_attempts=2,
        step_label="R4-visual")
    res = providers._safe_json(text)
    if not isinstance(res, dict):
        res = {}
    res.setdefault("transitions", [])
    res.setdefault("effects", [])
    res.setdefault("grade", {"preset": "none", "intensity": 0})
    return res


# ---------------------------------------------------------------------------
# B5 (Remotion): caption
# ---------------------------------------------------------------------------
_RM_CAPTION_MOTION_NOTE = """

# CHE DO LOP DO HOA (buoc R4 da thiet ke chu nhan / to hop chu)
- lop_do_hoa_da_co: cac chu nhan DA CO tren video (gio nguon). KHONG viet caption hero trung gio hoac trung noi
  dung voi chung. Hero chi dung o khoanh khac dat CON TRONG (toi da 1 moi 10 giay) — thuong la KHONG CAN hero.
- phong_cach_phu_de: phu de PHAI theo: so tu moi cum (words_per_chunk), chu hoa/thuong ("case"), kieu ("style"
  -> dung lam caption_theme.style_body), font ("font" -> caption_theme.font_body). Cum phu de NGAN, noi tiep nhau.
- Vi tri phu de do he thong tu dat theo bo cuc (ngang nguc / mep chia doi / tren the) — khong can "position".
- Doan co lop thay_phu_de: van viet phu de binh thuong (he thong tu an phu de trong luc chu nhan hien)."""


def gpt_rm_captions(segments, transcript_data, emotion_map_data, faces_regions, key_moments_data,
                    reference_analysis=None, story=None, hook=None, log=None, layers=None, subtitle_style=None,
                    brand=None):
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
                row_t = {"text": t.get("text", ""), "start_cuc_bo": a, "end_cuc_bo": b}
                if t.get("emphasis"):
                    row_t["emphasis"] = t["emphasis"]
                if t.get("is_punchline"):
                    row_t["is_punchline"] = True
                trans.append(row_t)
        row = {
            "segment_index": i, "source_id": sid, "target_start": seg.get("target_start", 0),
            "nguon_tu": st, "nguon_den": en, "transcript": trans,
            "key_moments": [k for k in (key_moments_data or {}).get(sid, []) or []
                            if providers._overlap(providers._f(k.get("start")), providers._f(k.get("end")), st, en)],
            "faces_region": (faces_regions or {}).get(sid, "giua-tren"),
        }
        row.update(providers._nhip_cua_segment(seg))
        seg_context.append(row)
    payload = {"cau_chuyen": story or {}, "hook": hook, "segments": seg_context, "language": "vi"}
    ref = providers.phong_cach_cho_buoc(reference_analysis, "captions")
    if ref:
        payload["phong_cach_mau"] = ref
    if _hints(reference_analysis):
        payload["goi_y_remotion"] = _hints(reference_analysis)
    motion = bool(layers or subtitle_style)
    if layers:
        payload["lop_do_hoa_da_co"] = layers
    if subtitle_style:
        payload["phong_cach_phu_de"] = {k: v for k, v in subtitle_style.items() if k in (
            "font", "weight", "size", "case", "style", "words_per_chunk", "rule")}
    sys_prompt = (_p("_RM_CAPTION_SYSTEM") + (_RM_CAPTION_MOTION_NOTE if motion else "")
                  + "\n\n# DANH MUC REMOTION (chi dung id trong nay):\n" + _catalog_block() + creative.luat("R5"))
    import brand_guide
    if brand_guide.view(brand, "captions"):
        # Brand Guideline: font + mau thuong hieu cho phu de / chu hero theo loi noi (code ep lai o build_spec)
        payload["brand_guideline"] = brand_guide.view(brand, "captions")
        sys_prompt += brand_guide.rule_text(brand, "captions")
    if log:
        log("R5: %s viet caption Remotion..." % providers.plan_ai_name())
    text = providers.plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=14000, temperature=0.5, req_timeout=120, max_attempts=2,
        step_label="R5-captions")
    res = providers._safe_json(text)
    if not isinstance(res, dict):
        res = {}
    res.setdefault("captions", [])
    res.setdefault("caption_theme", {})
    return res


def apply_visual(segments, visual):
    """Gan transition cua R4 vao CUOI segment tuong ung (rm_transition). Tra so da gan."""
    n = len(segments)
    ids = _by_id("transitions")
    applied = 0
    for s in segments:
        # transition ten tu do ma B2 (hoac plan cu) co the ghi -> khong co nghia voi Remotion
        for k in ("transition", "transition_duration", "transition_kho"):
            s.pop(k, None)
    for t in (visual or {}).get("transitions") or []:
        if not isinstance(t, dict):
            continue
        try:
            i = int(t.get("segment_index", -1))
        except (TypeError, ValueError):
            continue
        typ = str(t.get("type") or "").strip()
        if not (0 <= i < n - 1) or typ not in ids or typ == "cut":
            continue
        segments[i]["rm_transition"] = {"type": typ, "duration": providers._f(t.get("duration"), ids[typ]["default"])}
        applied += 1
    return applied


# ---------------------------------------------------------------------------
# DO FILE MEDIA (ffprobe)
# ---------------------------------------------------------------------------
def _ffbin(name):
    # ban ffmpeg GHIM cua app (Doctor cai + kiem SHA-256, sidecar/assets/toolchain.json) truoc, roi moi toi may
    # (Windows: ffmpeg.exe — xem winsupport.ffbin)
    import winsupport
    return winsupport.ffbin(name)


@functools.lru_cache(maxsize=512)
def _probe_cached(path, mtime):
    try:
        r = subprocess.run([_ffbin("ffprobe"), "-v", "error", "-show_entries",
                            "format=duration:stream=codec_type,width,height:stream_tags=rotate"
                            ":stream_side_data=rotation", "-of", "json", path],
                           capture_output=True, text=True, timeout=30)
        j = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    out = {"duration": None, "width": None, "height": None, "has_audio": False}
    try:
        out["duration"] = float((j.get("format") or {}).get("duration") or 0) or None
    except (TypeError, ValueError):
        pass
    for st in j.get("streams") or []:
        if st.get("codec_type") == "audio":
            out["has_audio"] = True
        if st.get("codec_type") == "video" and out["width"] is None:
            w, h = st.get("width"), st.get("height")
            rot = 0
            try:
                rot = int(float((st.get("tags") or {}).get("rotate") or 0))
            except (TypeError, ValueError):
                rot = 0
            for sd in st.get("side_data_list") or []:
                if "rotation" in sd:
                    try:
                        rot = int(float(sd["rotation"]))
                    except (TypeError, ValueError):
                        pass
            if abs(rot) % 180 == 90:
                w, h = h, w
            out["width"], out["height"] = w, h
    return out


def probe(path):
    if not path or not os.path.isfile(path):
        return {}
    return _probe_cached(path, os.path.getmtime(path))


# ---------------------------------------------------------------------------
# PLAN -> RENDER SPEC
# ---------------------------------------------------------------------------
POS_Y = {"top": -0.62, "upper": -0.38, "center": 0.0, "lower": 0.36, "bottom": 0.52}
SAFE_Y = (-0.72, 0.56)          # mep duoi ~20% bi giao dien TikTok/Reels che
ROLE_SIZE = {"hero": 116, "support": 66, "micro": 44}
STYLE_SIZE = {"hero_title": 150, "neon": 118, "lower_third": 42}
CAPTION_MIN_SEC = 0.5
CAPTION_LINGER_SEC = 0.4        # phu de o lai sau khi noi xong chu cuoi
CAPTION_BRIDGE_SEC = 0.6        # ho giua 2 phu de ngan hon -> noi lien, khong de man hinh trong
CAPTION_MAX_SEC = {"hero": 4.5, "support": 5.5, "micro": 4.0}
SFX_MAX_LEN = 4.0               # SFX dai (bai hat, meme am thanh) chi lay 4s dau
MIN_HANDLE = 0.12               # chat lieu toi thieu moi ben de hoa tan/day co y nghia
STRONG_FX = ("shake", "rgb_split", "emoji_pop", "flash")
STRONG_FX_GAP = 2.5
FX_LIMIT = {"emoji_pop": 3, "shake": 2, "flash": 4, "rgb_split": 3}
# Chuyen canh can chat lieu hai ben ma khong co -> doi sang kieu cat gan nhat
TRANSITION_FALLBACK = {"crossfade": "fade_black", "blur": "fade_black", "slide_up": "whip_left",
                       "slide_left": "whip_left", "wipe": "whip_right", "iris": "zoom_in"}
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _color(v, dflt):
    return v if isinstance(v, str) and _HEX.match(v.strip()) else dflt


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _tl_rows(p, sid, prefer):
    """Cac doan (khong phai meme) cua 1 source theo THU TU TIMELINE:
    (src_st, src_en, ts, speed). prefer="hook" -> chi ban sao hook; neu plan KHONG co
    hook (B3 bo, hoac hook trung dau video) thi lui ve than video thay vi vut phan tu."""
    rows = []
    for s in p.get("segments") or []:
        if s.get("kind") == "insert":
            continue
        if sid and s.get("source_id") and s.get("source_id") != sid:
            continue
        rows.append((float(s.get("start", 0)), float(s.get("end", 0)),
                     float(s.get("target_start", 0) or 0), float(s.get("speed", 1.0) or 1.0), s.get("kind")))
    rows.sort(key=lambda r: r[2])
    hook = [r for r in rows if r[4] == "hook"]
    body = [r for r in rows if r[4] != "hook"]
    if prefer == "hook" and hook:
        return hook
    return body


def map_range(p, sid, a, b, prefer="body", min_overlap=0.05):
    """Khoang gio NGUON [a,b] -> (start, end) tren timeline. None neu da bi cat bo.

    Khong dung source_to_timeline cho tung dau mut: giay nguon nam DUNG ranh gioi hai
    doan (vd 17.0 vua la cuoi doan 15.8-17.0 dat o dau video, vua la dau doan 17.0-22.0)
    se bi quy vao doan dau tien tim thay -> caption dai 18 giay (loi that 2026-09-25).
    Cach dung: lay CHUOI DOAN LIEN TIEP tren timeline chua phan loi nhieu nhat, bat dau o
    doan dau cua chuoi, ket thuc o doan cuoi cua chuoi (caption vat qua jump-cut van lien)."""
    rows = _tl_rows(p, sid, prefer)
    if b < a:
        a, b = b, a
    point = b - a < 1e-6

    def ov(r):
        if point:
            return 1.0 if r[0] - 1e-4 <= a < r[1] - 1e-4 else (0.5 if abs(a - r[1]) < 1e-4 else 0.0)
        return min(b, r[1]) - max(a, r[0])

    best, best_ov = None, (0.0 if point else min_overlap)
    for i, r in enumerate(rows):
        o = ov(r)
        if o > best_ov:
            best, best_ov = i, o
    if best is None:
        # khai "anchor": "hook" nhung khong khop ban sao hook -> tim trong than video
        return map_range(p, sid, a, b, "body", min_overlap) if prefer == "hook" else None
    lo = hi = best
    if not point:
        # noi them doan lien ke TREN TIMELINE neu caption con chay tiep sang do (jump-cut)
        while lo - 1 >= 0 and ov(rows[lo - 1]) > min_overlap and \
                abs(rows[lo - 1][2] + (rows[lo - 1][1] - rows[lo - 1][0]) / rows[lo - 1][3] - rows[lo][2]) < 0.02 \
                and rows[lo - 1][1] <= rows[lo][0] + 1e-3:
            lo -= 1
        while hi + 1 < len(rows) and ov(rows[hi + 1]) > min_overlap and \
                abs(rows[hi][2] + (rows[hi][1] - rows[hi][0]) / rows[hi][3] - rows[hi + 1][2]) < 0.02 \
                and rows[hi + 1][0] >= rows[hi][1] - 1e-3:
            hi += 1
    r0, r1 = rows[lo], rows[hi]
    st = r0[2] + (max(a, r0[0]) - r0[0]) / r0[3]
    en = r1[2] + (min(b, r1[1]) - r1[0]) / r1[3]
    return round(st, 3), round(max(en, st), 3)


def _neo_thoi_gian(p, it, tmap, label, changes, dflt_len):
    """Doi src_start/src_end -> start/end timeline. False neu doan nguon da bi cat bo."""
    if it.get("src_start") is None:
        # da khai theo gio timeline (apply_structure da dich roi); khong co ca start -> bo
        if it.get("start") is None:
            changes.append("%s: khong co gio (src_start/start) -> bo" % label)
            return False
        it["start"] = providers._f(it.get("start"))
        it["end"] = providers._f(it.get("end"), it["start"] + dflt_len)
        return True
    pref = "hook" if it.get("anchor") == "hook" else "body"
    sid = it.get("source_id")
    a = providers._f(it.get("src_start"))
    b = providers._f(it.get("src_end"), a + dflt_len)
    hit = map_range(p, sid, a, max(b, a + 0.01), pref)
    if hit is None:
        changes.append("%s: gio nguon %.2f-%.2fs khong con tren timeline -> bo" % (label, a, b))
        return False
    st, en = hit
    it["start"] = st
    it["end"] = en if en > st + 0.05 else round(st + max(0.3, b - a), 3)
    return True


def _bam_chu_whisper(c, asr, i, changes):
    """Keo src_start/src_end cua caption ve DUNG chu Whisper nghe duoc (GPT hay lay tron theo
    cau transcript). Tra [(chu, s, e)] gio NGUON tung chu, hoac None neu khong khop du."""
    if not asr or c.get("src_start") is None:
        return None
    sid = c.get("source_id") or (next(iter(asr)) if len(asr) == 1 else None)
    rows = asr.get(sid)
    if not rows:
        return None
    a = providers._f(c.get("src_start"))
    b = providers._f(c.get("src_end"), a + 1.5)
    wt = speech_align.caption_word_times(c.get("text") or "", rows, a, b)
    if not wt:
        return None
    na, nb = wt[0][1], max(wt[-1][2], wt[0][1] + 0.3)
    if abs(na - a) > 0.8 or abs(nb - b) > 1.2:
        return None          # khop sang cau ben canh -> khong tin
    if abs(na - a) > 0.08 or abs(nb - b) > 0.08:
        changes.append("cap%d: bam chu Whisper %.2f-%.2f -> %.2f-%.2f (gio nguon)" % (i, a, b, na, nb))
    c["src_start"], c["src_end"] = round(na, 3), round(nb, 3)
    return wt


def _chu_len_timeline(p, c, wt):
    """[(chu, s, e)] gio nguon -> [{text, start, end}] gio timeline (karaoke tung chu)."""
    pref = "hook" if c.get("anchor") == "hook" else "body"
    out = []
    for text, s, e in wt:
        hit = map_range(p, c.get("source_id"), s, s, pref)
        if hit is None:
            return None
        out.append({"text": text, "start": hit[0], "end": round(hit[0] + max(0.05, e - s), 3)})
    for a, b in zip(out, out[1:]):
        if a["end"] > b["start"]:
            a["end"] = b["start"]
    return out


def _norm_word(w):
    return re.sub(r"[^\w]", "", (w or "").lower(), flags=re.UNICODE)


def _captions_to_spec(p, theme, duration, changes, issues):
    cat = load_catalog()
    styles = _by_id("caption_styles")
    fonts = _by_id("fonts")
    accents = cat.get("accent_colors") or ["#FFD600"]
    accent = _color(theme.get("accent"), accents[0])
    body_style = theme.get("style_body") if theme.get("style_body") in styles else "karaoke"
    hero_style = theme.get("style_hero") if theme.get("style_hero") in styles else "hero_title"
    font_body = theme.get("font_body") if theme.get("font_body") in fonts else "be_vietnam_pro"
    font_hero = theme.get("font_hero") if theme.get("font_hero") in fonts else "anton"
    up_hero = theme.get("uppercase_hero")
    up_hero = True if up_hero is None else bool(up_hero)

    rows = []
    import motion_design as _MD
    for c in p.get("captions") or []:
        i = c.get("_n", 0)
        text = " ".join(str(c.get("text") or "").split())
        clean = _MD.strip_emoji(text)
        if clean != text:
            changes.append("cap%d %r: bo emoji/ky hieu tho trong chu" % (i, text[:20]))
            text = clean
        if not text:
            continue
        role = plan_guard.normalize_role(c.get("role")) or "support"
        st, en = providers._f(c.get("start")), providers._f(c.get("end"))
        if en <= st:
            en = st + 1.5
        if st >= duration - 0.05:
            changes.append("cap%d %r: nam ngoai video -> bo" % (i, text[:20]))
            continue
        en = min(en, duration)
        mx = CAPTION_MAX_SEC.get(role, 5.0)
        if en - st > mx + 1e-3:
            changes.append("cap%d %r: hien %.1fs -> cat con %.1fs" % (i, text[:20], en - st, mx))
            en = st + mx
        style = c.get("style") if c.get("style") in styles else (
            hero_style if role == "hero" else "lower_third" if role == "micro" else body_style)
        if role not in (styles[style].get("roles") or [role]):
            doi = hero_style if role == "hero" else "lower_third" if role == "micro" else body_style
            changes.append("cap%d: kieu '%s' khong hop vai %s -> '%s'" % (i, style, role, doi))
            style = doi
        font = c.get("font") if c.get("font") in fonts else (font_hero if role == "hero" else font_body)
        if c.get("y") is not None:
            y = providers._f(c.get("y"), 0.36)
        else:
            y = POS_Y.get(str(c.get("position") or "").lower(),
                          POS_Y["upper"] if role == "hero" else POS_Y["lower"] if role == "support" else 0.46)
        y2 = _clamp(y, *SAFE_Y)
        if abs(y2 - y) > 1e-3:
            changes.append("cap%d: y %.2f nam trong vung giao dien TikTok che -> %.2f" % (i, y, y2))
        size = providers._f(c.get("size"), 0) or STYLE_SIZE.get(style) or ROLE_SIZE[role]
        size = _clamp(size, 28, 190)
        words = {_norm_word(w) for w in text.split()}
        emph = [e for e in (c.get("emphasis") or []) if isinstance(e, str)
                and all(_norm_word(x) in words for x in e.split() if _norm_word(x))]
        rows.append({
            "id": "cap%d" % i, "text": text, "start": round(st, 3), "end": round(en, 3), "role": role,
            "style": style, "font": font,
            "color": _color(c.get("color"), "#FFFFFF"),
            "accent": _color(c.get("accent"), accent),
            "y": round(y2, 3), "size": round(size, 1), "emphasis": emph[:4],
            "uppercase": bool(c.get("uppercase")) if c.get("uppercase") is not None else (
                role == "hero" and up_hero),
            "words": [dict(w) for w in c["_words"]] if c.get("_words") else None,
            "_anchor": c.get("anchor"),
        })
    rows.sort(key=lambda r: (r["start"], 0 if r["role"] == "hero" else 1))

    # --- khong chong gio trong CUNG mot lop (phu de voi phu de, hero voi hero) ---
    # Chu bam LOI NOI: KHONG BAO GIO doi caption sang gio khac (doi 1 cai la day day
    # chuyen lech ca doan sau — loi that 2026-09-25). Chi cat duoi cai truoc, hoac bo
    # cai sau neu hai cai bat dau gan nhu cung luc (trung lap).
    out = []
    for r in rows:
        bo = False
        for o in out:
            if o["role"] != r["role"] or o["end"] <= r["start"] + 1e-3:
                continue
            if r["start"] - o["start"] >= CAPTION_MIN_SEC - 1e-3:
                changes.append("%s: chong gio voi %s cung vai %s -> cat duoi %s o %.2fs"
                               % (o["id"], r["id"], r["role"], o["id"], r["start"]))
                o["end"] = r["start"]
            else:
                changes.append("%s %r: trung gio voi %s (bat dau cach %.2fs) -> bo"
                               % (r["id"], r["text"][:20], o["id"], r["start"] - o["start"]))
                bo = True
                break
        if not bo and r["end"] - r["start"] >= CAPTION_MIN_SEC - 1e-3:
            out.append(r)
        elif not bo:
            changes.append("%s %r: chi hien %.2fs -> bo" % (r["id"], r["text"][:20], r["end"] - r["start"]))
    out = [o for o in out if o["end"] - o["start"] >= CAPTION_MIN_SEC - 1e-3]

    # --- phu de o lai them chut sau khi noi xong; ho ngan thi noi lien (do nhap nhay) ---
    subs = sorted((o for o in out if o["role"] == "support"), key=lambda o: o["start"])
    for a, nxt in zip(subs, subs[1:] + [None]):
        lim = nxt["start"] if nxt else duration
        if lim - a["end"] <= CAPTION_BRIDGE_SEC:
            a["end"] = round(max(a["end"], lim), 3)
        else:
            a["end"] = round(min(lim, a["end"] + CAPTION_LINGER_SEC), 3)

    # --- moc tung chu phai nam trong caption (caption co the bi day ra sau meme) ---
    for o in out:
        ws = o.get("words")
        if not ws:
            continue
        lech = o["start"] - ws[0]["start"]
        if lech > 0.3:
            for w in ws:
                w["start"] = round(w["start"] + lech, 3)
                w["end"] = round(w["end"] + lech, 3)

    # --- hai khoi chu cung luc thi phai tach vung ---
    for a in out:
        for b in out:
            if a is b or a["role"] == b["role"]:
                continue
            if min(a["end"], b["end"]) - max(a["start"], b["start"]) <= 0.05:
                continue
            if abs(a["y"] - b["y"]) < 0.24:
                hero = a if a["role"] == "hero" else b if b["role"] == "hero" else None
                other = b if hero is a else a
                if hero is not None:
                    new_y = POS_Y["upper"] if other["y"] >= 0 else POS_Y["lower"]
                    changes.append("%s: dinh vao %s -> dua len/xuong %.2f" % (hero["id"], other["id"], new_y))
                    hero["y"] = new_y
                else:
                    new_y = -0.55 if a["y"] >= 0 else 0.46
                    changes.append("%s: dinh vao %s -> doi vi tri %.2f" % (b["id"], a["id"], new_y))
                    b["y"] = new_y

    n_hero = sum(1 for o in out if o["role"] == "hero")
    if out and n_hero > max(3, len(out) * 0.5):
        issues.append({"severity": "low", "area": "caption",
                       "problem": "%d/%d caption la hero — chu nao cung noi thi khong con gi noi" % (n_hero, len(out))})
    if not out:
        issues.append({"severity": "low", "area": "caption", "problem": "Video khong co caption nao"})
    for o in out:
        o.pop("_anchor", None)
    return out


def _effects_to_spec(p, duration, changes):
    ids = _by_id("effects")
    rows = []
    for e in p.get("scene_effects") or []:
        i = e.get("_n", 0)
        typ = str(e.get("type") or "").strip()
        if typ == "emoji_pop":
            # user 2026-09-27: icon emoji tho khong dep -> khong dung (du AI / video mau / plan cu co khai)
            changes.append("fx%d: emoji bat len (icon tho) -> bo" % i)
            continue
        if typ not in ids:
            changes.append("fx%d: '%s' khong co trong danh muc Remotion -> bo" % (i, typ))
            continue
        meta = ids[typ]
        st, en = providers._f(e.get("start")), providers._f(e.get("end"))
        lo, hi = (meta.get("duration") or [0.3, 6.0])
        if en - st < lo:
            en = st + lo
        if en - st > hi:
            changes.append("fx%d(%s): %.1fs -> %.1fs (toi da cua hieu ung)" % (i, typ, en - st, hi))
            en = st + hi
        if st >= duration - 0.1:
            changes.append("fx%d(%s): nam ngoai video -> bo" % (i, typ))
            continue
        en = min(en, duration)
        ilo, ihi = (meta.get("intensity") or [0.2, 1.0])
        inten = _clamp(providers._f(e.get("intensity"), 0.7), ilo, ihi)
        row = {"id": "fx%d" % i, "type": typ, "start": round(st, 3), "end": round(en, 3),
               "intensity": round(inten, 2)}
        if typ == "emoji_pop":
            emo = str(((e.get("params") or {}).get("emoji") or "")).strip().split()
            emo = emo[0][:8] if emo else "😱"
            row["params"] = {"emoji": emo}
        rows.append(row)
    rows.sort(key=lambda r: r["start"])
    out, dem, last_strong = [], {}, -99.0
    for r in rows:
        typ = r["type"]
        if any(o["type"] == typ and o["start"] < r["end"] and r["start"] < o["end"] for o in out):
            changes.append("%s(%s): chong len hieu ung cung loai -> bo" % (r["id"], typ))
            continue
        if dem.get(typ, 0) >= FX_LIMIT.get(typ, 99):
            changes.append("%s(%s): da du %d lan trong video -> bo" % (r["id"], typ, FX_LIMIT[typ]))
            continue
        if typ in STRONG_FX:
            if r["start"] - last_strong < STRONG_FX_GAP:
                changes.append("%s(%s): cach hieu ung manh truoc %.1fs < %.1fs -> bo"
                               % (r["id"], typ, r["start"] - last_strong, STRONG_FX_GAP))
                continue
            last_strong = r["start"]
        dem[typ] = dem.get(typ, 0) + 1
        out.append(r)
    return out


def _fit_for(w, h, W, H):
    """cover neu cung chieu va ti le gan nhau; nguoc lai giu tron khung + nen mo."""
    if not w or not h:
        return "cover"
    ar, AR = w / float(h), W / float(H)
    if (ar > 1) != (AR > 1):
        return "blur"
    return "cover" if abs(ar - AR) / AR < 0.2 else "blur"


def _clips_to_spec(p, W, H, changes):
    srcs = {sv.get("id"): sv for sv in p.get("source_videos") or []}
    trs = _by_id("transitions")
    clips = []
    segs = p.get("segments") or []
    for i, s in enumerate(segs):
        kind = s.get("kind") or "body"
        if kind == "insert":
            import media_sdr
            path = media_sdr.working_path(s.get("file"))
            info = probe(path)
            fit = "blur" if (s.get("mode") == "banner" or s.get("background_blur")) else "cover"
            scale = 1.0
            vol = _clamp(providers._f(s.get("volume"), 0.5), 0.0, 1.0)
        else:
            sv = srcs.get(s.get("source_id")) or {}
            path = sv.get("path")
            info = probe(path)
            fit = _fit_for(info.get("width"), info.get("height"), W, H)
            scale = _clamp(providers._f(s.get("scale"), 1.0), 1.0, 1.35)
            vol = _clamp(providers._f(s.get("volume"), 1.0), 0.0, 1.0)
        if not path or not os.path.isfile(path):
            changes.append("seg%d: khong thay file %s -> bo doan" % (i, path))
            continue
        sp = _clamp(providers._f(s.get("speed"), 1.0), 0.25, 4.0)
        ts = providers._f(s.get("target_start"))
        span = (providers._f(s.get("end")) - providers._f(s.get("start"))) / sp
        face = None
        if kind != "insert":
            fb = (p.get("faces") or {}).get(s.get("source_id")) if isinstance(p.get("faces"), dict) else None
            if isinstance(fb, dict) and fb.get("cx") is not None:
                face = {"cx": providers._f(fb.get("cx"), 0.5), "cy": providers._f(fb.get("cy"), 0.4), "h": providers._f(fb.get("h"), 0.3)}
        clips.append({
            "face": face, "srcW": info.get("width"), "srcH": info.get("height"),
            "id": "clip%d" % i, "kind": kind, "path": path,
            "start": round(ts, 3), "end": round(ts + span, 3),
            "srcStart": round(providers._f(s.get("start")), 3), "speed": sp,
            "volume": round(vol, 3), "fit": fit, "scale": round(scale, 3), "x": 0.0, "y": 0.0,
            "transitionOut": None,
            "_srcEnd": providers._f(s.get("end")),
            "_srcDur": (info.get("duration") or providers._f(
                (srcs.get(s.get("source_id")) or {}).get("duration"), 0) or None),
            "_tr": s.get("rm_transition"),
        })
    # chuyen canh (sau khi biet chat lieu hai ben)
    for i, c in enumerate(clips):
        tr = c.pop("_tr", None)
        if i == len(clips) - 1 or not isinstance(tr, dict):
            continue
        nxt = clips[i + 1]
        typ = tr.get("type")
        if typ not in trs or typ == "cut":
            continue
        if c["kind"] == "insert" or nxt["kind"] == "insert":
            continue      # meme la cu CAT — cat thang moi dung nhip
        meta = trs[typ]
        lo, hi = meta.get("duration") or [0.2, 0.8]
        d = _clamp(providers._f(tr.get("duration"), meta.get("default", 0.3)), lo, hi)
        overlap = bool(meta.get("overlap"))
        if overlap:
            sau = ((c["_srcDur"] or c["_srcEnd"]) - c["_srcEnd"]) / c["speed"]
            truoc = nxt["srcStart"] / nxt["speed"]
            half = min(d / 2, sau, truoc)
            if half < MIN_HANDLE:
                moi = TRANSITION_FALLBACK.get(typ, "flash")
                changes.append("%s -> %s: '%s' can chat lieu hai ben diem cat (con %.2fs/%.2fs) -> doi '%s'"
                               % (c["id"], nxt["id"], typ, max(sau, 0), truoc, moi))
                typ, meta = moi, trs[moi]
                lo, hi = meta.get("duration") or [0.2, 0.8]
                d = _clamp(d, lo, hi)
                overlap = False
            elif half < d / 2 - 1e-3:
                changes.append("%s -> %s: '%s' rut con %.2fs cho vua chat lieu" % (c["id"], nxt["id"], typ, 2 * half))
                d = 2 * half
        # clip qua ngan so voi chuyen canh -> rut chuyen canh
        d = min(d, (c["end"] - c["start"]) * 0.8, (nxt["end"] - nxt["start"]) * 0.8)
        if d < 0.1:
            continue
        c["transitionOut"] = {"type": typ, "duration": round(d, 3), "overlap": overlap}
    for c in clips:
        c.pop("_srcEnd", None)
        c.pop("_srcDur", None)
    _meme_volume(p, clips, changes)
    _smooth_zoom(clips, changes)
    return clips


# ZOOM MUOT (2026-10-01, user: "zoom in / zoom out dang bi CAT hinh roi thay khung zoom -> giat; zoom phai la
# chuyen dong muot"). Truoc day moi doan mang 1 muc `scale` co dinh (B2 xen ke 1.0 / 1.3, siet khoang nghi +0.08)
# -> o diem cat khung NHAY sang muc zoom moi trong 1 khung hinh. Gio: doan sau BAT DAU dung muc zoom doan truoc
# dang giu roi CHUYEN DONG (ease in-out) toi muc cua no trong ZOOM_RAMP giay -> khong bao gio nhay zoom.
# Renderer (AutoEdit.tsx clipZoomAt) doc zoomFrom / zoomDur; test_remotion_plan kiem buoc nhay moi khung.
ZOOM_RAMP_MIN, ZOOM_RAMP_MAX, ZOOM_RAMP_PER = 0.45, 0.9, 2.0     # giay: 0.45 + 2.0 x |chenh lech|, toi da 0.9
ZOOM_MAX_STEP = 0.03                                              # chenh lech scale toi da giua 2 khung (30fps)
_EASE_PEAK = 3.0                                                  # do doc lon nhat cua easeInOutCubic (giua duong)


def clip_zoom_at(clip, t):
    """Muc zoom cua clip tai gio timeline t — GIU KHOP clipZoomAt trong remotion-src/AutoEdit.tsx."""
    k1 = float(clip.get("scale") or 1.0)
    z0, zd = clip.get("zoomFrom"), float(clip.get("zoomDur") or 0)
    if z0 is None or zd <= 0:
        return k1
    p = max(0.0, min(1.0, (t - float(clip["start"])) / zd))
    e = 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2     # easeInOutCubic (= Easing.inOut(Easing.cubic))
    return float(z0) + (k1 - float(z0)) * e


def _smooth_zoom(clips, changes=None):
    """Gan zoomFrom / zoomDur cho clip co muc zoom KHAC clip lien truoc (tru meme cat vao: noi dung khac han)."""
    n = 0
    for prev, c in zip(clips, clips[1:]):
        c.pop("zoomFrom", None)
        c.pop("zoomDur", None)
        if prev.get("kind") == "insert" or c.get("kind") == "insert":
            continue
        k0 = float(prev.get("scale") or 1.0)
        d = float(c.get("scale") or 1.0) - k0
        if abs(d) < 0.005:
            continue
        span = float(c["end"]) - float(c["start"])
        # moi khung doi <= ZOOM_MAX_STEP (o giua duong cong ease doc gap _EASE_PEAK lan trung binh)
        need = _EASE_PEAK * abs(d) / ZOOM_MAX_STEP / 30.0
        if need > span:
            # clip qua ngan de zoom het muc -> zoom it hon (van muot), clip sau tinh tu muc nay
            d = (1 if d > 0 else -1) * span * ZOOM_MAX_STEP * 30.0 / _EASE_PEAK
            c["scale"] = round(k0 + d, 3)
            need = span
        dur = min(span, max(need, min(ZOOM_RAMP_MAX, ZOOM_RAMP_MIN + ZOOM_RAMP_PER * abs(d))))
        c["zoomFrom"] = round(k0, 3)
        c["zoomDur"] = round(max(0.05, dur), 3)
        n += 1
    if n and changes is not None:
        changes.append("zoom muot: %d cho doi muc zoom -> chuyen dong ease in-out thay vi nhay khung" % n)


def _meme_volume(p, clips, changes=None):
    """Tieng meme CAT vao khong to hon giong noi cua video (cung thuoc do speech_cut.playback_lufs)."""
    voice = p.get("_voice_lufs")
    if voice is None:
        return
    import math
    import speech_cut
    for c in clips:
        if c.get("kind") != "insert" or c.get("volume", 0) <= 0:
            continue
        try:
            lufs = speech_cut.playback_lufs(c["path"], c["srcStart"], c["srcStart"] + (c["end"] - c["start"]) * c["speed"])
        except Exception:
            lufs = None
        if lufs is None:
            continue
        that = lufs + 20 * math.log10(c["volume"])
        tran = voice + plan_guard.MEME_REL
        if that > tran + 0.3:
            v = round(max(0.01, 10 ** ((tran - lufs) / 20.0)), 3)
            if changes is not None:
                changes.append("%s: tieng meme %.1f LUFS > giong video %.1f -> volume %.2f -> %.2f"
                               % (c["id"], that, voice, c["volume"], v))
            c["volume"] = v


def _audio_to_spec(p, duration):
    out = []
    for i, a in enumerate(p.get("audio") or []):
        path = a.get("file")
        if not path or not os.path.isfile(path):
            continue
        st = providers._f(a.get("start"))
        if st >= duration:
            continue
        info = probe(path)
        dur = info.get("duration") or SFX_MAX_LEN
        role = "bgm" if (a.get("role") == "bgm") else "sfx"
        src_st = providers._f(a.get("src_start"), 0.0)
        if role == "bgm":
            src_en = src_st + (duration - st)
        else:
            src_en = src_st + min(dur - src_st, SFX_MAX_LEN, duration - st)
        row = {"id": "aud%d" % i, "path": path, "start": round(st, 3),
               "volume": round(_clamp(providers._f(a.get("volume"), 0.8), 0.0, 1.0), 3),
               "srcStart": round(src_st, 3), "srcEnd": round(src_en, 3), "role": role,
               "name": a.get("_name") or a.get("sfx_id"),
               # do to khi phat so voi giong noi cua video (dB) — luat hook dung de biet SFX co nghe ro khong
               "rel": a.get("_rel_db")}
        if a.get("_auto_text"):
            # tieng code tu gan cho chu (luat chu co tieng) — luat hook KHONG tinh la tieng gay chu y cua hook
            row["textAuto"] = True
        out.append(row)
    return out


def _overlays_to_spec(p, duration):
    out = []
    for i, it in enumerate(p.get("inserts") or []):
        if it.get("placement") != plan_guard.PLACEMENT_OVER or not it.get("file"):
            continue
        st = providers._f(it.get("start"))
        dur = providers._f(it.get("duration"), 1.5)
        if st >= duration:
            continue
        import media_sdr
        out.append({"id": "ov%d" % i, "path": media_sdr.working_path(it["file"]), "start": round(st, 3),
                    "end": round(min(duration, st + dur), 3),
                    "srcStart": round(providers._f(it.get("src_start")), 3),
                    "volume": round(_clamp(providers._f(it.get("volume"), 0.0), 0.0, 1.0), 3),
                    "scale": 1.0, "x": 0.0, "y": -0.22})
    return out


# 2 = video HDR -> ban SDR + lop tach nguoi khop khung; 3 = cat an toan theo tieng noi + lop chu
# khop loi (2026-09-26). UI dung lai spec cu hon tu plan khi mo du an.
SPEC_MEDIA_VERSION = 8     # 4 = quy tac chu 2026-09-27; 5 = phu de cach chu noi bat + chu khong tu xuong dong;
                           # 6 = chu khop loi theo cau phu de + SFX hook khong roi khoi hook;
                           # 7 = tach nguoi tung khung (tach chu the + loc vung nguoi + trung vi 3 khung)
                           # 8 = zoom muot (zoomFrom/zoomDur), luat cung khoang lang + kiem lai diem cat,
                           #     SFX / meme can theo giong noi cua video (2026-10-01)


def build_spec(plan, log=None):
    """Plan Remotion (ban THO, gio than video) -> (spec, report). Ham thuan, chay lai bao nhieu
    lan cung ra mot ket qua, khong sua `plan` truyen vao."""
    plan_guard.apply_overrides()
    p = copy.deepcopy(plan or {})
    changes, issues = [], []
    # Video HDR (iPhone) -> ban lam viec SDR: xem truoc, render, tach nguoi, anh chup deu cung mau
    # (media_sdr.py). Plan cu (truoc 2026-09-26) chua co orig_path -> tu doi o day.
    import media_sdr
    p["source_videos"] = media_sdr.working_sources(p.get("source_videos"), log=log)
    if p["source_videos"]:
        p["source_video"] = p["source_videos"][0].get("path") or p.get("source_video")
    if p.get("voice_boost"):
        # GIONG NOI NHO (user 2026-10-01): ban lam viec giong da nang thay cho video o khau phat tieng; do dac de cat
        # van tren file goc (orig_path) -> diem cat khong doi
        import voice_boost
        voice_boost.apply(p, changes, log=log)
    # File video nguon bi chuyen / xoa -> KHONG dung spec (truoc day ra spec khong co clip nao ma van
    # "ok" -> UI thay ban dung dang xem duoc bang ban rong). Bao ro de giu ban cu + nguoi dung biet.
    dung = {s.get("source_id") for s in p.get("segments") or [] if isinstance(s, dict) and s.get("kind") != "insert"}
    mat = [sv for sv in p["source_videos"] or [] if isinstance(sv, dict) and (not dung or sv.get("id") in dung)
           and not os.path.isfile(sv.get("path") or "")]
    if mat:
        ten = ", ".join(str(sv.get("orig_path") or sv.get("path") or sv.get("name")) for sv in mat)
        issues.append({"severity": "high", "area": "source",
                       "problem": "Không tìm thấy file video nguồn: %s — trả file về chỗ cũ rồi mở lại dự án." % ten})
        return None, {"fixed": changes, "issues": issues, "ok": False}
    canvas = p.get("canvas") or {}
    W, H = int(canvas.get("w") or CANVAS["w"]), int(canvas.get("h") or CANVAS["h"])
    p["canvas"] = {"w": W, "h": H}
    fps = int(p.get("fps") or FPS)
    if p.get("brand_guide"):
        # BRAND GUIDELINE: ep font + ma mau thuong hieu len lop chu / phu de / nen / bo phong cach TRUOC khi dung (do
        # vi tri, ne mat, do tuong phan deu tinh tren font / mau that) — AI quen van ra dung thuong hieu
        import brand_guide
        if isinstance(p.get("style_kit"), dict):
            p["style_kit"] = brand_guide.apply_kit(p["style_kit"], p["brand_guide"])
        brand_guide.enforce_plan(p, changes)

    segs = p.get("segments") or []
    if any(s.get("kind") in ("hook", "insert") or s.get("_cut_head") for s in segs):
        plan_guard.strip_structure(p, changes)       # plan cu da tung dung cau truc -> go ra
    for s in p.get("segments") or []:
        for k in ("transition", "transition_duration", "transition_kho"):
            s.pop(k, None)
    segs, dur = plan_guard.chuan_hoa_segments(p.get("segments"), changes)
    # Cat AN TOAN theo tieng noi o cho nhay doan (khong cat giua chu / giua cau, chua duoi am theo do
    # to that) + lop chu hien DUNG luc noi tu cua no (speech_cut.py). Ham on dinh: chay lai khong doi.
    import speech_cut
    if segs:
        bak, moves = copy.deepcopy(segs), []
        try:
            speech_cut.fix_segment_cuts(p, segs, changes, moves=moves)
        except Exception as ex:  # loi do am thanh khong duoc lam hong ban dung
            segs, moves = bak, []
            changes.append("bo qua cat an toan theo tieng noi (%s)" % str(ex)[:120])
        segs, dur = plan_guard.chuan_hoa_segments(segs, changes)
        # LUAT CUNG khoang lang (2026-10-01): moi khoang lang nguoi xem nghe thay > gioi han deu bi cat (ke ca cho
        # buoc cat an toan vua noi lai), noi vap lap lai -> bo lan dau; roi KIEM LAI tren timeline (mep cat roi
        # vao tieng -> sua). Chay lai tren plan da siet thi khong doi gi (on dinh).
        removed = []
        bak2 = copy.deepcopy(segs)
        try:
            lim = speech_cut.plan_pause_limit(p)
            segs = speech_cut.tighten_pauses(p, segs, lim, changes, removed=removed)
            segs = speech_cut.cut_restarts(p, segs, changes, removed=removed)
            segs, dur = plan_guard.chuan_hoa_segments(segs, changes)
            speech_cut.audit_cuts(p, segs, lim, changes)          # mep cat roi vao duoi am -> sua
            segs, dur = plan_guard.chuan_hoa_segments(segs, changes)
        except Exception as ex:
            segs, removed = bak2, []
            segs, dur = plan_guard.chuan_hoa_segments(segs, changes)
            changes.append("bo qua siet khoang nghi (%s)" % str(ex)[:120])
        p["segments"] = segs
        # meme / SFX neo DUNG mep doan vua bi cat bot -> theo mep moi (khong roi ra ngoai timeline)
        speech_cut.follow_anchors(p, moves, changes)
        speech_cut.follow_removed(p, removed, changes)
    try:
        speech_cut.snap_layers(p, changes)
    except Exception as ex:
        changes.append("bo qua can lop chu theo loi noi (%s)" % str(ex)[:120])
    try:
        # thu tu doc (tren->duoi, trai->phai) = thu tu loi noi
        import motion_design as _MD
        _MD.reading_order(p, changes)
    except Exception as ex:
        changes.append("bo qua xep thu tu doc theo loi noi (%s)" % str(ex)[:120])
    p["segments"] = segs
    p["duration"] = round(dur, 3)
    if not segs:
        issues.append({"severity": "high", "area": "structure", "problem": "Plan khong co doan video nao"})
        return None, {"fixed": changes, "issues": issues, "ok": False}

    # --- CAU TRUC: hook len dau + meme CAT vao (lam timeline dai ra -> truoc moi quy doi) ---
    tmap = plan_guard.build_time_map(p)
    plan_guard.prepare_inserts(p, tmap, p["duration"], changes)
    hook = p.get("hook") if isinstance(p.get("hook"), dict) else None
    trs = _by_id("transitions")
    hook_tr = None
    if hook:
        h = hook.get("rm_transition") or {}
        typ = h.get("type") if isinstance(h, dict) else None
        typ = typ if typ in trs and typ != "cut" else (hook.get("transition") if hook.get("transition") in trs else "flash")
        meta = trs[typ]
        lo, hi = meta.get("duration") or [0.2, 0.5]
        hook_tr = {"type": typ, "duration": _clamp(providers._f((h or {}).get("duration"), meta.get("default", 0.3)), lo, hi)}
        # _hook_segment chi ghi chuyen canh tam (plan_guard.HOOK_TRANSITION) -> de trong cho no dung
        # mac dinh, chuyen canh that cua Remotion (rm_transition) gan lai ngay sau.
        hook["transition"] = None
    plan_guard.apply_structure(p, changes)
    changes[:] = [c.replace("+ transition %s" % plan_guard.HOOK_TRANSITION,
                            "+ chuyen canh %s" % (hook_tr or {}).get("type", "flash"))
                  for c in changes]
    hook_last = max([i for i, s in enumerate(p["segments"]) if s.get("kind") == "hook"] or [-1])
    for i, s in enumerate(p["segments"]):
        for k in ("transition", "transition_duration", "transition_kho"):
            s.pop(k, None)
        if s.get("kind") == "hook":
            # hook co the la nhieu manh (da cat khoang lang ben trong) -> chuyen canh chi o manh CUOI
            s.pop("rm_transition", None)
            if hook_tr and i == hook_last:
                s["rm_transition"] = dict(hook_tr)
        if s.get("_cut_head") or s.get("kind") == "insert":
            s.pop("rm_transition", None)
    duration = float(p.get("duration") or dur)
    tmap = plan_guard.build_time_map(p)
    # KIEM LAI tren timeline CUOI (hook + than video + meme cat vao): con lang dai / mep cat roi vao tieng -> bao
    try:
        import speech_cut
        kiem = speech_cut.audit_cuts(p, p["segments"], speech_cut.plan_pause_limit(p), fix=False)
        p["_kiem_cat"] = kiem
        for k, ten in (("im_lang", "khoảng lặng còn sót"), ("cat_vao_tieng", "điểm cắt rơi vào tiếng")):
            if kiem.get(k):
                issues.append({"severity": "low", "area": "pacing",
                               "problem": "Kiểm tra cắt: %d %s — %s" % (len(kiem[k]), ten, "; ".join(kiem[k][:6]))})
    except Exception as ex:
        changes.append("bo qua kiem lai diem cat (%s)" % str(ex)[:120])

    # --- quy doi gio nguon -> timeline ---
    # _n = so thu tu GOC (nhan trong nhat ky khong doi khi phan tu truoc bi bo)
    asr = p.get("asr_words") if isinstance(p.get("asr_words"), dict) else {}
    caps = []
    for i, c in enumerate(p.get("captions") or []):
        c["_n"] = i
        wt = _bam_chu_whisper(c, asr, i, changes)
        if _neo_thoi_gian(p, c, tmap, "cap%d" % i, changes, 1.5):
            if wt:
                c["_words"] = _chu_len_timeline(p, c, wt)
            caps.append(c)
    p["captions"] = caps
    fx = []
    for i, e in enumerate(p.get("scene_effects") or []):
        e["_n"] = i
        if _neo_thoi_gian(p, e, tmap, "fx%d" % i, changes, 0.8):
            fx.append(e)
    p["scene_effects"] = fx

    # --- THIET KE CHUYEN DONG: tai nguyen -> bo cuc -> lop do hoa -> SFX theo lop ---
    import motion_design as MD
    if any(isinstance(a, dict) and a.get("user_media") for a in p.get("assets") or []):
        # tu lieu cua nguoi dung: ban lam viec (cache) bi xoa -> tao lai tu file trong thu muc du an
        import user_media as UM
        UM.refresh_assets(p.get("assets"))
    # bo phong cach cua PHIEN nay (video mau / R4 tu dat khi khong co video mau); khong co thi {} — khong mac dinh
    kit = p.get("style_kit") if isinstance(p.get("style_kit"), dict) else {}
    assets_by_id = {a["id"]: a for a in p.get("assets") or [] if isinstance(a, dict) and a.get("id")}
    faces = p.get("faces") if isinstance(p.get("faces"), dict) else {}
    scenes = MD.scenes_to_spec(p, duration, kit, assets_by_id, changes) if p.get("scenes") else []
    layers = MD.layers_to_spec(p, duration, scenes, assets_by_id, faces, changes, kit=kit) if p.get("layers") else []
    motion = bool(scenes or layers)
    if layers:
        p["audio"] = list(p.get("audio") or []) + MD.layer_sfx(layers, changes)
    if p.get("fx"):
        import fx_flow as FX
        p["audio"] = list(p.get("audio") or []) + FX.fx_sfx(p, changes)
    # KHONG con tran so SFX ca video (user 2026-10-01: tran 16 lam moi chu sau giay ~56 mat tieng). Chi con gian
    # cach cho SFX KHONG gan voi chu; tieng cua chu khong bao gio bi bo vi gian cach (MD.is_text_sfx)
    sfx_gap = min(plan_guard.SFX_MIN_GAP, 0.3) if motion else plan_guard.SFX_MIN_GAP
    # chu / hieu ung cua video chinh khong chay de len doan meme cat vao (TRUOC khi gan tieng cho chu: chu bi day ra
    # sau meme thi tieng cua no theo gio moi)
    plan_guard.clear_over_inserts(p, changes)

    auds = []
    for i, a in enumerate(p.get("audio") or []):
        if a.get("src_time") is not None:
            pref = "hook" if a.get("anchor") == "hook" else "body"
            t = providers._f(a.get("src_time"))
            hit = map_range(p, a.get("source_id"), t, t, pref)
            if hit is None:
                changes.append("audio%d: gio nguon %.2fs da bi cat khoi timeline -> bo" % (i, t))
                continue
            a["start"] = hit[0]
        if providers._f(a.get("start")) >= duration:
            changes.append("audio%d: ngoai video -> bo" % i)
            continue
        auds.append(a)
    # cung giay: tieng tu chon (AI) dung truoc tieng code tu gan
    auds.sort(key=lambda a: (providers._f(a.get("start")), 1 if a.get("_auto_text") else 0))
    kept, last = [], -99.0
    for a in auds:
        st = providers._f(a.get("start"))
        if (a.get("role") or "sfx") != "bgm":
            if MD.is_text_sfx(a):
                # chu hien CUNG LUC voi mot tieng khac (< TEXT_SFX_SAME) -> dung chung tieng do, khong chong 2 tieng
                if any(abs(st - providers._f(x.get("start"))) < MD.TEXT_SFX_SAME
                       for x in kept if (x.get("role") or "sfx") != "bgm"):
                    changes.append("audio %s %.2fs: chu hien cung luc voi tieng khac -> dung chung tieng do"
                                   % (a.get("sfx_id"), st))
                    continue
            elif st - last < sfx_gap:
                changes.append("audio %s: sat SFX truoc (<%.2fs) -> bo" % (a.get("sfx_id"), sfx_gap))
                continue
            last = max(last, st)
        kept.append(a)
    # LUAT (user 2026-10-01): MOI chu hien ra deu co tieng — chu AI chua gan / B7 chua dat -> code tu gan tieng hop chu
    kept += MD.ensure_text_sfx(layers, p.get("captions"), kept, duration, changes)
    kept.sort(key=lambda a: providers._f(a.get("start")))
    p["audio"] = kept
    # muc to giong noi cua CHINH video nay -> SFX / meme can theo no (khong theo muc tuyet doi)
    try:
        import speech_cut
        p["_voice_lufs"] = speech_cut.voice_level(p)
    except Exception as ex:
        p["_voice_lufs"] = None
        changes.append("khong do duoc muc to giong noi (%s) -> SFX theo muc tuyet doi" % str(ex)[:120])
    plan_guard.mix_sfx(p, changes)

    theme = p.get("caption_theme") if isinstance(p.get("caption_theme"), dict) else {}
    grade = p.get("grade") if isinstance(p.get("grade"), dict) else {}
    preset = grade.get("preset") if grade.get("preset") in _by_id("grades") else "none"
    spec = {
        "version": 1, "fps": fps, "width": W, "height": H,
        # 2 = video HDR da doi sang ban SDR + lop tach nguoi khop khung (2026-09-26). UI dung lai spec
        # cu (media < 2) tu plan khi mo du an.
        "media": SPEC_MEDIA_VERSION,
        "duration": round(duration, 3),
        "title": p.get("title") or "",
        "grade": {"preset": preset,
                  "intensity": round(_clamp(providers._f(grade.get("intensity"), 0.6), 0.0, 1.0), 2)
                  if preset != "none" else 0},
        "clips": _clips_to_spec(p, W, H, changes),
        "captions": _captions_to_spec(p, theme, duration, changes, issues),
        "effects": _effects_to_spec(p, duration, changes),
        "audio": _audio_to_spec(p, duration),
        "overlays": _overlays_to_spec(p, duration),
        "scenes": scenes,
        "layers": layers,
    }
    if p.get("brand_guide"):
        # mau code tu sinh khi dung (nen the lay tu khung video, mau tang phu...) -> he mau thuong hieu; trung tinh giu
        import brand_guide
        brand_guide.enforce_spec(spec, p["brand_guide"], changes)
    if p.get("text_art"):
        # chu hero / hook co chu anh AI -> lop chu anh (truoc ne phu de: phu de phai tranh ca chu nay)
        MD.hero_captions_to_art(spec, p, changes)
    if p.get("fx"):
        # hieu ung tu viet -> khung ve san trong hop cach ly (truoc tach nguoi: lop 'behind' can matte)
        import fx_flow as FX
        try:
            FX.fx_to_spec(p, spec, changes)
        except Exception as ex:
            changes.append("bo qua hieu ung tu viet (%s)" % str(ex)[:160])
    if motion or spec.get("fx") or spec.get("layers"):
        MD.attach_subject_mattes(spec, changes, log=log)
        # chu de len nhau -> lop tach ro; chu phai ro tren NEN THAT (do do sang khung video / anh)
        MD.separate_group_overlaps(spec, kit, changes)
        try:
            MD.ensure_legible(spec, kit, changes)
        except Exception as ex:
            changes.append("bo qua do tuong phan chu / nen (%s)" % str(ex)[:120])
        # phu de theo BO PHONG CACH: vi tri doi theo bo cuc (ngang nguc / mep chia doi / tren the...)
        sub = kit.get("subtitle") or {}
        fonts_ok = _by_id("fonts")
        styles_ok = _by_id("caption_styles")
        for c in spec["captions"]:
            if c["role"] != "support":
                continue
            c["y"] = MD.subtitle_y_for(MD.scene_at(scenes, c["start"]), kit)
            if not theme.get("font_body") and sub.get("font") in fonts_ok:
                c["font"] = sub["font"]
            if not theme.get("style_body") and sub.get("style") in styles_ok:
                c["style"] = sub["style"]
            if sub.get("size"):
                c["size"] = round(_clamp(providers._f(sub.get("size"), 44), 28, 90), 1)
            if sub.get("case") in ("lower", "upper"):
                f_ = (lambda x: x.lower()) if sub["case"] == "lower" else (lambda x: x.upper())
                c["text"] = f_(c.get("text") or "")
                for w in c.get("words") or []:
                    if isinstance(w, dict) and w.get("text"):
                        w["text"] = f_(w["text"])
        MD.dodge_subtitles(spec, changes)
    if not spec["clips"]:
        issues.append({"severity": "high", "area": "structure", "problem": "Khong con doan video nao dung duoc"})
    elif abs(spec["clips"][-1]["end"] - spec["duration"]) > 0.1:
        spec["duration"] = spec["clips"][-1]["end"]
    if spec["duration"] < 3:
        issues.append({"severity": "medium", "area": "pacing",
                       "problem": "Video chi dai %.1fs" % spec["duration"]})
    report = {
        "fixed": changes,
        "issues": issues,
        "issues_before": [],
        "ok": not [i for i in issues if i["severity"] == "high"],
        "counts": {k: len(spec[k]) for k in ("clips", "captions", "effects", "audio", "overlays", "scenes", "layers")},
        # kiem lai diem cat (khoang lang con sot / mep cat roi vao tieng) + muc to giong noi da dung de can SFX
        "kiem_cat": p.get("_kiem_cat"),
        "giong_lufs": p.get("_voice_lufs"),
    }
    return spec, report


def hook_caption(plan):
    """Chu hero cho BAN SAO hook o dau video (B3 tra ve hook.caption)."""
    hook = plan.get("hook")
    if not isinstance(hook, dict) or not (hook.get("caption") or "").strip():
        return plan
    theme = plan.get("caption_theme") if isinstance(plan.get("caption_theme"), dict) else {}
    caps = [c for c in plan.get("captions") or [] if c.get("anchor") != "hook"]
    caps.append({
        "text": hook["caption"].strip(), "role": "hero", "anchor": "hook",
        "style": theme.get("style_hero") or "hero_title",
        "source_id": hook.get("source_id"),
        "src_start": hook.get("src_start"), "src_end": hook.get("src_end"),
        "position": "upper",
    })
    plan["captions"] = caps
    return plan


def fingerprint():
    """Doi danh muc -> khoa cache R4/R5 doi theo."""
    try:
        return "%s:%s" % (os.path.getmtime(CATALOG_PATH), load_catalog().get("version"))
    except OSError:
        return "?"


def summarize(plan, spec):
    """Vai con so cho nhat ky / UI."""
    if not spec:
        return {}
    return {
        "do_dai": spec.get("duration"), "clip": len(spec.get("clips") or []),
        "caption": len(spec.get("captions") or []), "hieu_ung": len(spec.get("effects") or []),
        "sfx": len(spec.get("audio") or []), "meme_de_len": len(spec.get("overlays") or []),
        "tong_mau": (spec.get("grade") or {}).get("preset"),
        "chuyen_canh": [c["transitionOut"]["type"] for c in spec.get("clips") or [] if c.get("transitionOut")],
        "bo_cuc": [s["layout"] for s in spec.get("scenes") or []],
        "lop_do_hoa": len(spec.get("layers") or []),
        # tu lieu cua nguoi dung dang hien (lop + panel / nen scene)
        "tu_lieu": len({x.get("um") for x in spec.get("layers") or [] if x.get("um")}
                       | {(s.get("panel") or {}).get("um") for s in spec.get("scenes") or [] if (s.get("panel") or {}).get("um")}
                       | {(s.get("bg") or {}).get("um") for s in spec.get("scenes") or [] if (s.get("bg") or {}).get("um")}),
    }


def log_note(msg):
    try:
        log_step_note("remotion", msg)
    except Exception:
        pass


__all__ = ["load_catalog", "gpt_rm_visual", "gpt_rm_captions", "apply_visual", "build_spec",
           "hook_caption", "transition_goi_y_hook", "probe", "summarize", "fingerprint", "config"]
