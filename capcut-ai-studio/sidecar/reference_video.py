#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phan tich VIDEO MAU bang GEMINI — luong Video Remotion (2026-09-28; truoc do la GPT qua Codex CLI xem anh luoi).

Chia viec:
  - MAY DO (ffmpeg, chinh xac): do dai, kich thuoc, moc CAT CANH, giay/shot, duong do to.
  - Luot 1: Gemini XEM + NGHE chinh video mau (ban nen 720p, SDR) kem so do -> phan tich phong cach.
  - Luot 2: DAI KHUNG DAY (~6 khung/s o hook, cac cho cat, cuoi video) — Gemini chi lay ~1 khung/s khi xem
    video nen chuyen dong chu / camera phai xem bang anh -> style_kit + recipes.
Gemini duoc dan tin so do hon uoc luong gio cua minh. Ket noi (API goc / proxy / tai khoan Google qua agy)
theo Cai dat API — providers.gemini_media.

Ket qua theo schema phan tich video mau chung (summary/format/pacing/structure/captions/audio...)
+ "remotion_hints" + style_kit, nen phong_cach_cho_buoc() va moi buoc lap plan doc duoc.
"""
import os
import re
import json
import shutil
import tempfile
import subprocess

import providers
import prompt_store
import remotion_plan
from debug_log import log_step_note

SCENE_THRESHOLD = 0.3


def _run(argv, timeout=180):
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout or "", r.stderr or ""
    except subprocess.TimeoutExpired:
        return -9, "", "timeout"
    except OSError as e:
        return -1, "", str(e)



def detect_cuts(path, duration):
    """Moc cat canh (giay) bang bo loc scene cua ffmpeg (tren ban thu nho cho nhanh)."""
    ff = remotion_plan._ffbin("ffmpeg")
    rc, _, err = _run([ff, "-hide_banner", "-nostats", "-i", path, "-an", "-vf",
                       "scale=240:-2,select='gt(scene,%s)',showinfo" % SCENE_THRESHOLD,
                       "-f", "null", "-"], timeout=max(120, int((duration or 60) * 4)))
    cuts = []
    for m in re.finditer(r"pts_time:([0-9.]+)", err):
        t = round(float(m.group(1)), 2)
        if t > 0.2 and (not cuts or t - cuts[-1] > 0.25):
            cuts.append(t)
    return cuts


def loudness_curve(path):
    """Do to (dB RMS) moi 0.5s. [] neu video khong co tieng."""
    ff = remotion_plan._ffbin("ffmpeg")
    rc, _, err = _run([ff, "-hide_banner", "-nostats", "-i", path, "-vn", "-af",
                       "aresample=16000,asetnsamples=n=8000:p=0,astats=metadata=1:reset=1,"
                       "ametadata=print:key=lavfi.astats.Overall.RMS_level",
                       "-f", "null", "-"], timeout=180)
    vals = []
    for m in re.finditer(r"lavfi\.astats\.Overall\.RMS_level=(-?[0-9.]+|-inf)", err):
        v = m.group(1)
        vals.append(-90.0 if v == "-inf" else max(-90.0, float(v)))
    return vals


def _tom_tat_do_to(vals):
    if not vals:
        return {"co_am_thanh": False}
    n = len(vals)
    nghe_thay = [v for v in vals if v > -45]
    tb = sum(nghe_thay) / len(nghe_thay) if nghe_thay else -90.0
    lech = (sum((v - tb) ** 2 for v in nghe_thay) / len(nghe_thay)) ** 0.5 if nghe_thay else 0.0
    dinh = sorted(((v, i * 0.5) for i, v in enumerate(vals) if v > tb + 7), reverse=True)[:8]
    theo_giay = []
    for i in range(0, n, 2):
        chunk = vals[i:i + 2]
        theo_giay.append(round(max(chunk)))
    return {
        "co_am_thanh": True,
        "db_trung_binh": round(tb, 1),
        "do_dao_dong_db": round(lech, 1),
        "ti_le_gan_im_lang": round(1 - len(nghe_thay) / float(n), 2),
        "dinh_to_dot_ngot_giay": sorted(round(t, 1) for _, t in dinh),
        "db_moi_giay": theo_giay[:180],
    }



# ---------------------------------------------------------------------------
# LUOT 2 — DAI KHUNG DAY -> BO PHONG CACH (style_kit) + cong thuc lop
# ---------------------------------------------------------------------------
STRIP_FRAMES = 12          # moi dai: 12 khung (6 cot x 2 hang) ~ 2 giay
STRIP_TILE = (216, 384)
STRIP_COLS = 6
STYLE_KEYS = ("name", "palette", "fonts", "subtitle", "layouts", "text_system", "motion", "camera",
              "transitions", "broll_style", "sfx", "pacing", "recipes")

_RM_STYLE_KIT_PROMPT = """Ban la MOTION DESIGNER reverse-engineer phong cach dung cua mot video short-form de dung lai bang REMOTION.
Ban nhan:
 (1) CAC DAI KHUNG DAY: moi anh la MOT doan ngan (~2 giay) cat ~6 khung/giay, doc trai->phai, tren->duoi, gio ghi
     o goc moi o. Nhin chuoi khung de hieu CHUYEN DONG: chu vao the nao (mo->ro, truot co nhoe, phong/co, go phim,
     viet tay dan...), cac TANG chu vao lech nhau ra sao, camera (mat ca, rung, zoom, nhoe vien), bo cuc A-roll /
     B-roll doi the nao, chu nam TRUOC hay SAU nguoi, dau nguoi co troi ra khoi khung the khong.
 (2) phan_tich_luot_1: tom tat phong cach da phan tich tu CA video (xem hinh + nghe tieng: mau, nhip, caption...).
 (3) TAI LIEU NGON NGU DUNG (cuoi prompt): cac truong / gia tri DUOC PHEP. Moi id font / preset / layout ban ghi
     PHAI co trong tai lieu (chon cai GAN NHAT voi cai ban thay).

Nhiem vu: tra ve BO PHONG CACH (style_kit) de he thong dung mot video MOI (noi dung khac, nguoi khac) nhung
CUNG phong cach. Chi ghi cai THAY DUOC trong CHINH video mau nay; khong chac thi bo trong truong do. He thong
KHONG co bo phong cach mac dinh nao de bu vao — truong ban bo trong thi buoc thiet ke tu quyet theo noi dung video
moi. Vi vay moi thu dac trung cua video mau (mau, font, chu, bo cuc, chuyen dong, camera, SFX) phai ghi DAY DU.

Boc tach:
- palette: mau chu dao, mau nhan, nen gradient, the toi, gold... (ma hex).
- fonts theo VAI: subtitle / impact / condensed / script / serif_italic / body (id font trong tai lieu).
- subtitle: font, weight, size (px tren khung 1080x1920; phu de TikTok thuong 38-56), case (lower | upper | normal),
  style (minimal | karaoke | pop_words | outline_bold | tiktok_box), words_per_chunk, y_full (0..1 khi A-roll full),
  rule (vi tri theo tung bo cuc, luc nao an).
- layouts: CAC BO CUC THAY TRONG VIDEO (full / split / card / circle / broll / graphic) + share (ti le thoi gian) +
  when (dung khi nao) + tham so (panel_ratio, card_y, popout, circle_y, circle_d, bg {kind, colors, pattern}).
- text_system: cac VAI chu (impact, script, number, label, card, cta...): font, co, mau, glow / bong, do nghieng
  (italic / skewX / rotation), vi tri, nam SAU nguoi (behind_subject) hay truoc, kieu vao.
- motion: text_enter, graphic_enter, exit (preset trong tai lieu), stagger, easing, density (so nhip do hoa / 10s).
- camera: hook (fisheye / focus / shake ...), punch_in, jump_cut_zoom, grade {preset, intensity}.
- transitions: default, accent (id trong danh muc), between_layouts (morph, giay).
- broll_style: phong cach anh minh hoa (3D render / anh that dien anh / icon / anh cat nen...) — TIENG ANH, ngan.
- sfx: tieng cho tung su kien (text_impact, text_enter, graphic_pop, scene_change, reveal_number, ui_click).
- pacing: avg_shot_seconds, jump_cut, scene_change_every.
- recipes: 4-8 CONG THUC dac trung nhat — QUAN TRONG NHAT. Moi cai: {"name", "when", "scene"?: {...},
  "layers": [cac lop viet DUNG ngon ngu dung, noi dung chu la VI DU]}. Chep dung CAU TRUC to hop: bao nhieu tang,
  font / co / mau / glow / nghieng tung tang, tang nao vao truoc (lech src_start / stagger), sau hay truoc nguoi
  (behind_subject), co box / vien / bong khong, "group" chung. Gio trong recipe tinh tu 0 (vi du).
  Recipe PHAI dat quy tac chu cua bo dung (khong dat se bi sua): KHONG emoji / icon emoji; tang chinh to DAC
  (co vien toi mong hoac bong neu nen sang), glow <= 0.3 co chu; tang phu <= 60% co tang chinh; tang de len nhau
  thi khac mau + co vien tach; chu sau nguoi chi bi dau che it (nua tren chu lo ra). Thu tu doc tren->duoi =
  thu tu loi noi (ghi "when" ro cum nao noi truoc).

# SCHEMA (CHI JSON)
{"name": "...", "palette": {...}, "fonts": {...}, "subtitle": {...}, "layouts": [...], "text_system": [...],
 "motion": {...}, "camera": {...}, "transitions": {...}, "broll_style": "...", "sfx": {...}, "pacing": {...},
 "recipes": [{"name": "...", "when": "...", "scene": {...}, "layers": [{...}]}]}
CHI tra ve JSON."""



def strip_windows(duration, cuts):
    """Cac doan can xem DAY: hook, 4 cho cat canh rai deu giua video, doan cuoi (CTA)."""
    duration = float(duration or 0)
    wins = [(0.0, min(duration, 2.2))]
    for frac in (0.18, 0.36, 0.54, 0.72):
        target = duration * frac
        c = min(cuts, key=lambda x: abs(x - target)) if cuts else target
        a = max(0.0, c - 0.2)
        if all(abs(a - w[0]) > 2.2 for w in wins):
            wins.append((a, min(duration, a + 2.0)))
    end_a = max(0.0, duration - 2.6)
    if all(abs(end_a - w[0]) > 2.2 for w in wins):
        wins.append((end_a, min(duration, end_a + 2.4)))
    return [(a, b) for a, b in wins if b - a > 0.5]


def make_strips(path, windows, work):
    """Moi doan -> 1 anh 6x2 o (12 khung deu trong doan), moi o ghi gio."""
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.load_default(size=22)
    except TypeError:
        font = ImageFont.load_default()
    ff = remotion_plan._ffbin("ffmpeg")
    tw, th = STRIP_TILE
    rows = (STRIP_FRAMES + STRIP_COLS - 1) // STRIP_COLS
    out = []
    for k, (a, b) in enumerate(windows):
        step = (b - a) / STRIP_FRAMES
        sheet = Image.new("RGB", (STRIP_COLS * tw, rows * th), (18, 18, 18))
        draw = ImageDraw.Draw(sheet)
        for i in range(STRIP_FRAMES):
            t = a + step * (i + 0.5)
            fp = os.path.join(work, "s%02d_%02d.jpg" % (k, i))
            rc, _, _ = _run([ff, "-hide_banner", "-loglevel", "error", "-ss", "%.3f" % t, "-i", path, "-frames:v", "1",
                             "-vf", "scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:black"
                             % (tw, th, tw, th), "-q:v", "3", "-y", fp], timeout=60)
            if rc != 0 or not os.path.isfile(fp):
                continue
            x, y = (i % STRIP_COLS) * tw, (i // STRIP_COLS) * th
            with Image.open(fp) as im:
                sheet.paste(im.convert("RGB").resize((tw, th)), (x, y))
            nhan = "%.2fs" % t
            draw.rectangle([x, y, x + 10 + 13 * len(nhan), y + 30], fill=(0, 0, 0))
            draw.text((x + 5, y + 4), nhan, fill=(255, 214, 0), font=font)
            draw.rectangle([x, y, x + tw - 1, y + th - 1], outline=(70, 70, 70), width=1)
        sp = os.path.join(work, "strip_%02d.jpg" % (k + 1))
        sheet.save(sp, quality=86)
        out.append((a, b, sp))
    return out


def _sanitize_kit(kit):
    """Chi giu truong biet; font id la khong co -> bo (khong co ban mac dinh bu vao)."""
    if not isinstance(kit, dict):
        return None
    fonts_ok = {f.get("id") for f in remotion_plan.load_catalog().get("fonts") or []}
    out = {k: kit[k] for k in STYLE_KEYS if kit.get(k) not in (None, "", [], {})}
    if isinstance(out.get("fonts"), dict):
        out["fonts"] = {r: f for r, f in out["fonts"].items() if f in fonts_ok}
    sub = out.get("subtitle")
    if isinstance(sub, dict) and sub.get("font") not in fonts_ok:
        sub.pop("font", None)
    if isinstance(out.get("recipes"), list):
        out["recipes"] = [r for r in out["recipes"] if isinstance(r, dict) and r.get("layers")][:8]
    out = {k: v for k, v in out.items() if v not in (None, "", [], {})}
    return out or None



def style_kit_pass(path, duration, cuts, first_pass, log=None, keep_dir=None):
    """Luot 2: dai khung day -> style_kit. Tra (kit | None, so dai khung)."""
    work = tempfile.mkdtemp(prefix="rm-kit-")
    try:
        wins = strip_windows(duration, cuts)
        strips = make_strips(path, wins, work)
        if not strips:
            return None, 0
        tom_tat = {k: first_pass.get(k) for k in ("summary", "format", "pacing", "structure", "editing_language",
                                                  "captions", "audio", "visual_identity", "transfer_rules",
                                                  "remotion_hints", "evidence")
                   if first_pass.get(k) not in (None, "", [], {})}
        user = {"phan_tich_luot_1": tom_tat,
                "dai_khung": [{"anh_so": i + 1, "tu_giay": round(a, 2), "den_giay": round(b, 2)}
                              for i, (a, b, _) in enumerate(strips)],
                "ghi_chu": "Anh dinh kem theo dung thu tu anh_so; moi anh %d khung deu trong doan." % STRIP_FRAMES}
        import motion_design
        prompt = (prompt_store.get_prompt("_RM_STYLE_KIT_PROMPT", _RM_STYLE_KIT_PROMPT)
                  + "\n\n# TAI LIEU NGON NGU DUNG\n" + motion_design.dsl_doc()
                  + "\n\n# DANH MUC REMOTION (transition / effect / grade / font):\n" + remotion_plan._catalog_block()
                  + "\n\n# DU LIEU\n" + json.dumps(user, ensure_ascii=False))
        if log:
            log("Luot 2: gui %d dai khung day cho Gemini boc bo phong cach..." % len(strips))
        res = providers.gemini_files(
            [{"path": sp, "label": "anh_so=%d: dai khung %.2f-%.2f giay" % (i + 1, a, b)}
             for i, (a, b, sp) in enumerate(strips)], prompt, step_label="RM-style-kit", log=log)
        if isinstance(res, dict):
            res.pop("_source", None)
        kit = _sanitize_kit(res)
        if keep_dir:
            os.makedirs(keep_dir, exist_ok=True)
            for _, _, sp in strips:
                shutil.copy2(sp, os.path.join(keep_dir, os.path.basename(sp)))
        if kit:
            kit["_windows"] = [[round(a, 2), round(b, 2)] for a, b, _ in strips]
        return kit, len(strips)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def analyze_reference(video, log=None, keep_dir=None):
    """video = {path, name, duration}. Tra dict phan tich phong cach (schema chung + remotion_hints + style_kit)."""
    path = video.get("path")
    if not path or not os.path.isfile(path):
        raise RuntimeError("Khong tim thay video mau: %s" % path)
    import gemini_media
    import media_sdr
    work_path = media_sdr.working_path(path, log=log)   # video mau HDR -> khung anh dung mau
    info = remotion_plan.probe(work_path)
    duration = float(video.get("duration") or info.get("duration") or 0)
    name = video.get("name") or os.path.basename(path)
    if log:
        log("Do moc cat canh + do to am thanh bang ffmpeg...")
    cuts = detect_cuts(work_path, duration)
    loud = loudness_curve(work_path) if info.get("has_audio") else []
    shots = [b - a for a, b in zip([0.0] + cuts, cuts + [duration]) if b - a > 0.05]
    measured = {
        "do_dai_giay": round(duration, 2),
        "kich_thuoc": "%sx%s" % (info.get("width"), info.get("height")),
        "so_lan_cat_canh": len(cuts),
        "moc_cat_canh": cuts[:120],
        "giay_moi_shot_tb": round(sum(shots) / len(shots), 2) if shots else round(duration, 2),
        "shot_ngan_nhat": round(min(shots), 2) if shots else None,
        "shot_dai_nhat": round(max(shots), 2) if shots else None,
        "am_thanh": _tom_tat_do_to(loud),
    }
    # 1 file duy nhat (nen 720p, giu tieng; video HDR -> nen tu ban SDR) — video mau short-form it khi qua 20 MB
    prep = gemini_media.prepare(path, allow_split=False, log=log)
    if prep.get("error") and log:
        log("Nen video mau loi (%s) — gui file goc" % prep["error"])
    piece = prep["pieces"][0]
    user = {"video_mau": {"ten": name, "do_dai": round(duration, 2)}, "du_lieu_do": measured}
    prompt = (remotion_plan._p("_RM_REFERENCE_PROMPT")
              + "\n\n# DANH MUC REMOTION (id dung cho remotion_hints):\n" + remotion_plan._catalog_block()
              + "\n\n# DU LIEU\n" + json.dumps(user, ensure_ascii=False))
    if log:
        log("Gui video mau (%.1f MB) cho Gemini xem + nghe..." % (piece["bytes"] / 1e6))
    res = providers.gemini_files([{"path": piece["path"], "label": "VIDEO MAU: %s, dai %.1f giay" % (name, duration)}],
                                 prompt, step_label="RM-reference", log=log)
    if not isinstance(res, dict):
        raise RuntimeError("Gemini tra ve khong phai JSON object")
    via = res.pop("_source", None) or "gemini"
    res.setdefault("duration", round(duration, 2))
    pac = res.get("pacing") if isinstance(res.get("pacing"), dict) else {}
    # so do cua may la su that — khong de model uoc luong lai
    pac["average_shot_seconds"] = measured["giay_moi_shot_tb"]
    res["pacing"] = pac
    # "gemini-ref:" -> thu vien xep vao muc ref_video (analysis_library.import_projects_once)
    res["_source"] = "gemini-ref:%s" % via
    res["_measured"] = measured
    res["_media"] = {"video_mb": round(piece["bytes"] / 1e6, 1), "strips": 0}
    # Luot 2: dai khung day -> bo phong cach + cong thuc lop (hong thi van tra luot 1)
    try:
        kit, n_strips = style_kit_pass(work_path, duration, cuts, res, log=log, keep_dir=keep_dir)
        res["_media"]["strips"] = n_strips
        if kit:
            res["style_kit"] = kit
    except Exception as e:  # noqa: BLE001
        res["_style_kit_error"] = str(e).split("\n")[0][:300]
        if log:
            log("Luot 2 (bo phong cach) loi: %s — R4 chi dung phan tich luot 1 cua video mau" % res["_style_kit_error"])
    try:
        log_step_note("RM-reference", "Phan tich xong: video %.1f MB, %d cho cat, %d dai khung"
                      % (res["_media"]["video_mb"], len(cuts), res["_media"]["strips"]))
    except Exception:
        pass
    return res
