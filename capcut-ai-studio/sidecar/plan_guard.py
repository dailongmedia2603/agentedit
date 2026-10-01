#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LOP BAO VE PLAN (deterministic, KHONG goi AI) — dung chung cho luong Video Remotion.

Ly do ton tai: AI lap ke hoach bang ngon ngu tham my ("nhan tu khoa", "dat o diem nhan"),
khong the tu quy ra rang buoc VAT LY (SFX/caption roi vao giay nao cua timeline, meme cat
vao cho nao de khong nuot loi noi). remotion_plan.build_spec goi cac ham o day:

  build_time_map / source_to_timeline  -> quy doi gio NGUON <-> gio TIMELINE
  prepare_inserts + apply_structure     -> hook len dau + meme CAT vao (timeline dai ra)
  strip_structure                       -> go cau truc cu de chay lai khong chong chat
  mix_sfx / clear_over_inserts          -> can cuong do SFX, chu khong de len doan meme
  chuan_hoa_segments / snap_segments_to_speech -> noi timeline lien tuc, cat o ranh gioi cau

Chay duoc bang stdlib thuan. Cac con so chinh duoc trong menu "Prompt & quy tac"
(xem EDITABLE_RULES o cuoi file).
"""
import os
import copy
import json
import unicodedata

# ---------------------------------------------------------------------------
# HANG SO
# ---------------------------------------------------------------------------
MIN_CAPTION_SEC = 0.6   # caption ngan hon se doc khong kip
MIN_VISUAL_SEC = 0.3    # effect/card ngan hon muc nay coi nhu khong hien gi
MIN_ELEMENT_SEC = 0.2
SFX_MIN_GAP = 0.4
INSERT_MIN_GAP = 1.5    # 2 meme qua gan nhau lam dut mach video chinh
INSERT_MAX_SEC = 4.0
INSERT_MIN_SEC = 0.5
MAX_SFX = 6
MAX_INSERTS = 4
EPS = 1e-4


def _base_char(ch):
    """Bo dau thanh/dau mu: 'ồ' -> 'o' (de doi chieu ten SFX viet co dau / khong dau)."""
    d = unicodedata.normalize("NFD", ch)
    for c in d:
        if not unicodedata.combining(c):
            return c
    return ch


# ---------------------------------------------------------------------------
# VAI CUA CHU (visual hierarchy)
# ---------------------------------------------------------------------------
#   hero    = thong tin chinh. Mat nguoi xem phai roi vao day TRUOC TIEN.
#   support = thong tin phu (ve/dan/bo nghia, phu de loi noi).
#   micro   = chu thich/lower third (ten, chuc danh, nguon, don vi).
ROLE_HERO = "hero"
ROLE_SUPPORT = "support"
ROLE_MICRO = "micro"

# AI hay goi ten khac nhau cho cung mot thu -> quy ve 1 moi.
_ROLE_ALIASES = {
    "hero": ROLE_HERO, "primary": ROLE_HERO, "main": ROLE_HERO, "title": ROLE_HERO,
    "headline": ROLE_HERO, "punch": ROLE_HERO, "punchline": ROLE_HERO, "key": ROLE_HERO,
    "chinh": ROLE_HERO, "chinh_yeu": ROLE_HERO, "nhan_manh": ROLE_HERO,
    "support": ROLE_SUPPORT, "secondary": ROLE_SUPPORT, "sub": ROLE_SUPPORT,
    "subtitle": ROLE_SUPPORT, "body": ROLE_SUPPORT, "context": ROLE_SUPPORT,
    "phu": ROLE_SUPPORT, "bo_tro": ROLE_SUPPORT,
    "micro": ROLE_MICRO, "label": ROLE_MICRO, "caption": ROLE_MICRO, "note": ROLE_MICRO,
    "credit": ROLE_MICRO, "source": ROLE_MICRO, "lower_third": ROLE_MICRO,
    "chu_thich": ROLE_MICRO, "ghi_chu": ROLE_MICRO,
}


def normalize_role(v):
    """Quy ten role ve hero / support / micro. None neu khong nhan ra / khong khai."""
    if not v:
        return None
    k = str(v).strip().lower().replace("-", "_").replace(" ", "_")
    return _ROLE_ALIASES.get(k)


# ---------------------------------------------------------------------------
# ANH XA THOI GIAN NGUON -> TIMELINE
# ---------------------------------------------------------------------------
def build_time_map(plan):
    """Danh sach (source_id, src_start, src_end, timeline_start, speed, kind) tu segments.
    speed != 1 lam doan co/gian tren timeline nen phai mang theo de quy doi cho dung.
    `kind`: None = doan body binh thuong | "hook" = ban sao dat o dau video |
    "insert" = clip meme cat vao (khong thuoc he quy chieu cua source nao)."""
    rows = []
    cursor = 0.0
    default_sid = None
    srcs = plan.get("source_videos") or []
    if srcs:
        default_sid = srcs[0].get("id", "source_1")
    for s in plan.get("segments") or []:
        st = float(s.get("start", 0) or 0)
        en = float(s.get("end", st) or st)
        sp = float(s.get("speed", 1.0) or 1.0)
        sid = s.get("source_id") or default_sid or "source_1"
        ts = s.get("target_start")
        ts = cursor if ts is None else float(ts)
        rows.append((sid, st, en, ts, sp, s.get("kind")))
        cursor = max(cursor, ts + (en - st) / sp)
    return rows


def source_to_timeline(plan, source_id, t_src, time_map=None, prefer="body"):
    """Doi giay TRONG FILE NGUON -> giay TREN TIMELINE. None neu doan do bi cat bo.

    Doan HOOK la BAN SAO cua mot doan khac trong video, nen mot giay nguon co the
    ung voi HAI cho tren timeline. Mac dinh tra ve cho trong THAN video (body) —
    day moi la cho caption/SFX thuoc ve. Muon neo vao ban sao o hook thi khai
    `"anchor": "hook"` (prefer="hook")."""
    rows = time_map if time_map is not None else build_time_map(plan)
    if t_src is None:
        return None
    t_src = float(t_src)
    thu_tu = ("hook", None) if prefer == "hook" else (None, "hook")
    for muon_kind in thu_tu:
        fallback, fb_en = None, None
        for sid, st, en, ts, sp, kind in rows:
            if kind == "insert":
                continue
            if kind != muon_kind:
                continue
            if source_id and sid != source_id:
                continue
            if st - EPS <= t_src <= en + EPS:
                return ts + (t_src - st) / sp
            # doan da bi cat -> neo vao cuoi doan GAN NHAT truoc no (truoc day lay doan dau tien tim
            # thay -> meme neo o giay 109 bi chen len dau video)
            if t_src > en and (fb_en is None or en > fb_en):
                fallback, fb_en = ts + (en - st) / sp, en
        if fallback is not None:
            return fallback
    return None


# ---------------------------------------------------------------------------
# CAU TRUC TIMELINE: HOOK + CHEN MEME KIEU CAT (cutaway)
# ---------------------------------------------------------------------------
# Hai thao tac nay deu LAM DAI TIMELINE ra, nen phai lam TRUOC khi quy doi
# gio nguon -> gio timeline cho caption/SFX. Lam sau la lech het.
#
# HOOK: lay 3-5s dat nhat trong video dat len DAU, roi transition, roi video
# chay tu dau. Nguoi xem quyet dinh o/luot trong ~3 giay — neu doan hay nhat
# nam o giay 40 thi khong ai song toi do de xem.
#
# CHEN MEME: mac dinh la CAT (cutaway) chu khong phai DE LEN (overlay).
# Su co that 2026-09-24: meme de len dung luc nguoi ta dang noi -> mat cau
# noi, nguoi xem vua khong nghe duoc vua khong hieu meme. Cat ra thi cau noi
# van con nguyen, chi bi HOAN lai 1.5s.
HOOK_MIN_SEC = 2.0
HOOK_MAX_SEC = 6.0
HOOK_IDEAL = (3.0, 5.0)
# Chuyen canh hook -> than video. Day chi la gia tri tam: remotion_plan.build_spec gan
# chuyen canh that (danh muc Remotion, `rm_transition`) ngay sau apply_structure.
HOOK_TRANSITION = "flash"
HOOK_TRANSITION_SEC = 0.3
# Hook lay ngay o dau body thi vua chieu xong da chieu lai -> vo duyen.
HOOK_REPEAT_GUARD_SEC = 3.0

# Cutaway an thoi gian cua video chinh nen phai ngan hon meme de-len.
CUTAWAY_MIN_SEC = 0.6
CUTAWAY_MAX_SEC = 2.5
# Keo diem cat ve khoang lang gan nhat trong ban kinh nay (khong cat giua tu).
CUT_SNAP_SEC = 0.8
# Tong thoi gian meme cat vao khong duoc vuot ti le nay cua video chinh.
CUTAWAY_TOTAL_RATIO = 0.18
# Meme duoc phep DE LEN (overlay) chi khi no nam gon trong khoang LANG,
# con du bien hai dau nay.
OVERLAY_SILENCE_MARGIN = 0.15

PLACEMENT_CUT = "cutaway"
PLACEMENT_OVER = "overlay"


def _cover_scale(w, h, W, H):
    """He so phong de clip PHU KIN khung (cat bot phan thua).

    Clip dat o che do "contain" duoc thu sao cho NAM GON trong khung, nghia la he so
    goc = min(W/w, H/h). Muon phu kin thi phai nhan them max/min cua hai he so do.
    """
    try:
        fw, fh = W / float(w), H / float(h)
    except (TypeError, ZeroDivisionError):
        return 1.0
    if fw <= 0 or fh <= 0:
        return 1.0
    return round(max(fw, fh) / min(fw, fh), 3)


def meme_layout(w, h, W, H, mode=None, placement=PLACEMENT_CUT):
    """QUY TAC KICH THUOC CLIP MEME. Tra (mode, scale, background_blur, x, y).

    Nguyen tac: clip CUNG CHIEU voi khung thi phong cho PHU KIN;
    clip KHAC CHIEU thi de nguyen be ngang (khong cat mat noi dung meme) —
    va neu dang CAT (cutaway, khong con A-roll o sau) thi lap day hai dai
    thua bang nen mo thay vi de vien den.

      khung doc 9:16 + clip doc   -> full man hinh doc
      khung doc 9:16 + clip ngang -> dai ngang giua khung (banner), nen mo
      khung ngang + clip ngang    -> full khung ngang
      khung ngang + clip doc      -> dai doc giua khung, nen mo
    """
    mode = mode or "auto"
    if mode == "pip":
        return "pip", 0.42, None, 0.32, -0.55
    if not w or not h:
        # Khong biet kich thuoc (kho meme cu chua luu width/height) -> giu nguyen
        # be ngang. An toan hon phong bua: phong sai thi meme bi cat mat dau.
        return ("fullscreen" if mode == "fullscreen" else "banner"), 1.0, \
               (2 if placement == PLACEMENT_CUT else None), 0.0, 0.0
    clip_dung = h > w * 1.02
    khung_dung = H > W * 1.02
    cung_chieu = clip_dung == khung_dung
    if mode == "banner":
        cung_chieu = False          # user ep banner -> khong phong
    elif mode == "fullscreen":
        cung_chieu = True           # user ep full khung -> phong phu kin
    if cung_chieu:
        return "fullscreen", _cover_scale(w, h, W, H), None, 0.0, 0.0
    # Khac chieu: giu tron khung hinh meme, lap day phan thua bang nen mo.
    # Overlay thi KHONG lam mo vi phan thua la A-roll dang chay, khong phai vien den.
    return "banner", 1.0, (2 if placement == PLACEMENT_CUT else None), 0.0, 0.0


# ---------------------------------------------------------------------------
# LOI NOI: biet luc nao dang co tieng nguoi de khong cat/de len bua
# ---------------------------------------------------------------------------
# Hai cum tu cach nhau duoi ngan nay khong phai "khoang lang" — chi la nhip lay
# hoi giua hai cum trong CUNG MOT CAU. Gop lai de khong tuong nham la cho trong.
SPEECH_GAP_SEC = 0.35


def plan_speech(plan, gop=None):
    """[(source_id, start, end)] theo gio NGUON — tu plan['speech'] (pipeline lay
    tu transcript). Rong = khong biet -> cac quy tac chon phuong an an toan.

    `gop` > 0: noi cac cum tu sat nhau thanh mot cau (dung de biet "co dang noi
    khong"). `gop` = 0: giu nguyen tung cum (dung de tim CHO NGAT CAU ma cat).
    `gop` = None: dung SPEECH_GAP_SEC dang co hieu luc (doc luc chay de nguoi dung
    chinh duoc trong menu "Prompt & quy tac")."""
    if gop is None:
        gop = SPEECH_GAP_SEC
    rows = []
    for r in plan.get("speech") or []:
        try:
            st, en = float(r.get("start")), float(r.get("end"))
        except (TypeError, ValueError):
            continue
        if en > st:
            rows.append((r.get("source_id"), st, en))
    rows.sort(key=lambda r: (r[0] or "", r[1]))
    if not gop:
        return rows
    out = []
    for sid, st, en in rows:
        if out and out[-1][0] == sid and st - out[-1][2] <= gop:
            out[-1] = (sid, out[-1][1], max(out[-1][2], en))
        else:
            out.append((sid, st, en))
    return out


def _speaking_at(speech, sid, t_src, margin=0.0):
    for s_sid, st, en in speech:
        if sid and s_sid and s_sid != sid:
            continue
        if st - margin <= t_src <= en + margin:
            return True
    return False


def _silence_window(speech, sid, t_src):
    """(dau_khoang_lang, cuoi_khoang_lang) chua t_src. None neu dang co tieng."""
    if not speech:
        return None
    rows = [r for r in speech if not sid or not r[0] or r[0] == sid]
    if not rows:
        return None
    lo = 0.0
    for _, st, en in rows:
        if t_src < st:
            return (lo, st)
        lo = max(lo, en)
    return (lo, lo + 999.0)


def snap_to_pause(speech, sid, t_src, radius=None):
    """Keo diem cat ve CUOI CAU gan nhat. Cat giua chung mot tu nghe nhu video loi."""
    if radius is None:
        radius = CUT_SNAP_SEC
    if not speech:
        return t_src
    best = None
    for s_sid, st, en in speech:
        if sid and s_sid and s_sid != sid:
            continue
        for moc in (en, st):
            d = abs(moc - t_src)
            if d <= radius and (best is None or d < best[0]):
                best = (d, moc)
    return best[1] if best else t_src


def snap_segments_to_speech(segs, speech, changes=None, radius=None, min_len=0.5):
    """Keo dau/cuoi moi segment ve RANH GIOI CAU NOI neu no dang roi GIUA mot cum tu.

    Luoi an toan sau B2: GPT chon diem cat theo giay, de cat giua tu. `speech` la
    [(source_id, start, end)] tung cum tu (plan_speech(gop=0)). Diem cat da nam trong
    khoang lang thi giu nguyen (idempotent). Doi xong phai _relayout lai target_start."""
    if not speech:
        return segs
    for i, s in enumerate(segs or []):
        sid = s.get("source_id")
        try:
            st, en = float(s.get("start", 0)), float(s.get("end", 0))
        except (TypeError, ValueError):
            continue
        st2 = snap_to_pause(speech, sid, st, radius) if _speaking_at(speech, sid, st) else st
        en2 = snap_to_pause(speech, sid, en, radius) if _speaking_at(speech, sid, en) else en
        if en2 - st2 < min_len:
            continue            # keo xong ngan qua -> giu nguyen, de guard sau xu ly
        if abs(st2 - st) > 0.01 or abs(en2 - en) > 0.01:
            s["start"], s["end"] = round(st2, 3), round(en2, 3)
            if changes is not None:
                changes.append("segment%d: keo ve ranh gioi cau %.2f-%.2f -> %.2f-%.2f"
                               % (i, st, en, st2, en2))
    return segs


def _span_of(s):
    return (float(s.get("end", 0)) - float(s.get("start", 0))) / float(s.get("speed", 1.0) or 1.0)


def _relayout(segs):
    """Xep lai target_start lien tuc. Tra tong do dai."""
    cursor = 0.0
    for s in segs:
        s["target_start"] = round(cursor, 3)
        cursor += _span_of(s)
    return round(cursor, 3)


def _shift_fn(hook_len, cuts):
    """Ham doi gio timeline CU (chi co body) -> gio timeline MOI (co hook + meme)."""
    if not hook_len and not cuts:
        return lambda t: t

    def f(t):
        t = float(t)
        out = t + hook_len
        for anchor, span in cuts:
            if anchor < t - EPS:
                out += span
        return round(out, 3)
    return f


def _unshift_fn(hook_len, cuts):
    """Nguoc lai cua _shift_fn. Diem nam TRONG meme thi keo ve dung diem cat."""
    if not hook_len and not cuts:
        return lambda t: t

    def f(t):
        out = float(t) - hook_len
        for anchor, span in cuts:
            if out >= anchor + span - EPS:
                out -= span
            elif out > anchor:
                out = anchor      # roi vao giua doan meme -> ve diem cat
        return round(max(0.0, out), 3)
    return f


def _timeline_items(plan):
    """Cac muc khai theo gio TIMELINE (khong co neo src) — phai dich khi timeline dai ra."""
    for key, has_end in (("captions", True), ("cards", True),
                         ("scene_effects", True), ("char_effects", True), ("filters", True)):
        for it in plan.get(key) or []:
            # filter "scope": "all" duoc guard dat lai 0 -> het video moi lan, khong dich
            if isinstance(it, dict) and it.get("src_start") is None and it.get("scope") != "all":
                yield it, has_end
    for a in plan.get("audio") or []:
        if isinstance(a, dict) and a.get("src_time") is None:
            yield a, False


def _move_timeline_items(plan, fn):
    for it, has_end in _timeline_items(plan):
        st = float(it.get("start", 0) or 0)
        new_st = fn(st)
        if has_end:
            en = float(it.get("end", st) or st)
            it["end"] = round(new_st + (en - st), 3)
        it["start"] = new_st
    for k in plan.get("keyframes") or []:
        if isinstance(k, dict) and k.get("times"):
            k["times"] = [fn(t) for t in k["times"]]


def read_structure(plan):
    """Doc lai cau truc DA DUNG tu chinh segments[] (khong tin metadata — vong
    sua cua AI hay lam roi metadata nhung van giu nguyen segments)."""
    segs = plan.get("segments") or []
    hook_len = 0.0
    cuts = []
    cursor = 0.0
    for s in segs:
        kind = s.get("kind")
        span = _span_of(s)
        if kind == "hook":
            hook_len += span
        elif kind == "insert":
            cuts.append((round(cursor, 3), round(span, 3)))
        else:
            cursor += span
    return hook_len, cuts


def strip_structure(plan, changes=None):
    """Go HOOK + meme-cat ra khoi segments, noi lai cac doan da bi cat doi, va
    keo cac muc khai theo gio timeline ve he quy chieu BODY.

    Nho co buoc nay ma guard chay lai duoc nhieu lan (vong sua cua AI) ma khong
    chong chat hook len hook."""
    segs = plan.get("segments") or []
    if not any(s.get("kind") in ("hook", "insert") or s.get("_cut_head") for s in segs):
        return False
    hook_len, cuts = read_structure(plan)
    _move_timeline_items(plan, _unshift_fn(hook_len, cuts))
    body = [s for s in segs if s.get("kind") not in ("hook", "insert")]
    # noi lai cap A/B da bi cat doi de chen meme
    merged = []
    for s in body:
        truoc = merged[-1] if merged else None
        if (truoc is not None and truoc.get("_cut_head") and s.get("_cut_tail")
                and truoc.get("source_id") == s.get("source_id")
                and abs(float(truoc.get("end", 0)) - float(s.get("start", 0))) < 0.01):
            truoc["end"] = s["end"]
            # chi chep lai khoa nao THUC SU co, de noi lai dung y nguyen ban goc
            for khoa in ("transition", "transition_duration", "transition_kho"):
                if khoa in s:
                    truoc[khoa] = s[khoa]
            continue
        merged.append(s)
    for s in merged:            # xoa dau sau khi da noi xong, khong xoa truoc
        s.pop("_cut_head", None)
        s.pop("_cut_tail", None)
    plan["segments"] = merged
    _relayout(merged)
    plan.pop("_structure", None)
    return True


def _hook_segment(plan, speech, changes):
    """Dung doan HOOK tu plan['hook']. None neu khong co/khong dung duoc."""
    hook = plan.get("hook")
    if not isinstance(hook, dict):
        return None
    if hook.get("src_start") is None and hook.get("start") is None:
        return None
    sid = hook.get("source_id") or (plan.get("source_videos") or [{}])[0].get("id") or "source_1"
    st = float(hook.get("src_start", hook.get("start", 0)) or 0)
    en = hook.get("src_end", hook.get("end"))
    en = float(en) if en is not None else st + HOOK_IDEAL[0]
    src_len = None
    for row in plan.get("source_videos") or []:
        if row.get("id") == sid and row.get("duration"):
            src_len = float(row["duration"])
    # Khong cat giua chung mot cau: keo hai dau ve ranh gioi loi noi gan nhat.
    moc = plan_speech(plan, gop=0) or speech
    if moc:
        st2, en2 = snap_to_pause(moc, sid, st), snap_to_pause(moc, sid, en)
        if abs(st2 - st) > 0.01 or abs(en2 - en) > 0.01:
            changes.append("hook: keo ve ranh gioi cau noi %.2f-%.2f -> %.2f-%.2f"
                           % (st, en, st2, en2))
        st, en = st2, en2
    span = en - st
    if span > HOOK_MAX_SEC + EPS:
        en = st + HOOK_MAX_SEC
        changes.append("hook: %.1fs qua dai -> cat con %.1fs (hook dai la mat nguoi xem)"
                       % (span, HOOK_MAX_SEC))
    elif span < HOOK_MIN_SEC - EPS:
        en = st + HOOK_MIN_SEC
        changes.append("hook: %.1fs qua ngan -> keo len %.1fs (chua kip hieu gi da chuyen canh)"
                       % (span, HOOK_MIN_SEC))
    if src_len and en > src_len:
        en = src_len
        st = max(0.0, en - HOOK_IDEAL[0])
    # Hook phat xong la NHAY sang than video -> vao/ra o cho ngat cau, chua duoi am theo do to that
    # (cat cung o HOOK_MAX_SEC / keo cung len HOOK_MIN_SEC truoc day hay roi giua cau / giua chu).
    try:
        import speech_cut
        st2, en2 = speech_cut.fix_range(plan, sid, st, en, min_len=HOOK_MIN_SEC, max_len=HOOK_MAX_SEC + 1.0)
        if abs(st2 - st) > 0.01 or abs(en2 - en) > 0.01:
            changes.append("hook: cat an toan theo tieng noi %.2f-%.2f -> %.2f-%.2f" % (st, en, st2, en2))
            st, en = st2, en2
    except Exception as ex:  # khong duoc lam hong hook vi loi do am thanh
        changes.append("hook: bo qua cat an toan theo tieng noi (%s)" % str(ex)[:120])
    if en - st < HOOK_MIN_SEC - EPS:
        changes.append("hook: khong du %.1fs chat lieu -> bo hook" % HOOK_MIN_SEC)
        return None
    # Hook lay dung cho video sap chieu ngay sau do -> chieu hai lan lien tiep.
    body0 = next((s for s in plan.get("segments") or []
                  if s.get("kind") not in ("hook", "insert")), None)
    if body0 is not None and (body0.get("source_id") or sid) == sid \
            and abs(float(body0.get("start", 0)) - st) < HOOK_REPEAT_GUARD_SEC:
        changes.append("hook: trung voi dau video (%.1fs vs %.1fs) -> bo, vi se chieu "
                       "hai lan lien tiep" % (st, float(body0.get("start", 0))))
        return None
    tr = hook.get("transition") or HOOK_TRANSITION
    tr_sec = float(hook.get("transition_duration", HOOK_TRANSITION_SEC) or HOOK_TRANSITION_SEC)
    tr_sec = max(0.2, min(0.6, tr_sec))
    hook["src_start"], hook["src_end"] = round(st, 3), round(en, 3)
    hook["source_id"] = sid
    return {"source_id": sid, "start": round(st, 3), "end": round(en, 3),
            "target_start": 0.0, "kind": "hook",
            "scale": float(hook.get("scale", 1.0) or 1.0),
            "transition": tr, "transition_duration": tr_sec,
            "volume": float(hook.get("volume", 1.0) or 1.0)}


def _cut_at(segs, t_body, tag):
    """Cat day segment o giay t_body (gio timeline BODY). Tra vi tri chen.
    Khong cat neu diem cat qua sat dau/duoi mot doan (tranh de lai manh vun)."""
    cursor = 0.0
    for i, s in enumerate(segs):
        span = _span_of(s)
        if t_body <= cursor + EPS:
            return i
        if t_body >= cursor + span - EPS:
            cursor += span
            continue
        truoc = t_body - cursor
        if truoc < MIN_ELEMENT_SEC:
            # manh dau ngan nhung NOI LIEN voi doan truoc trong nguon (khong phai manh nhay) -> van cat dung cho: diem
            # cat da duoc chot vao khoang lang that (speech_cut.quiet_point), lui ve dau doan se cat mat duoi am
            prv = segs[i - 1] if i > 0 else None
            lien = (prv is not None and prv.get("kind") not in ("insert", "hook") and prv.get("source_id") == s.get("source_id")
                    and abs(float(prv.get("end", 0)) - float(s.get("start", 0))) < 0.05)
            if not lien or truoc < 0.04:
                return i
        if span - truoc < MIN_ELEMENT_SEC:
            return i + 1
        sp = float(s.get("speed", 1.0) or 1.0)
        cut_src = float(s["start"]) + truoc * sp
        duoi = json.loads(json.dumps(s))
        s["end"] = round(cut_src, 3)
        s["_cut_head"] = tag
        # transition cua doan goc nam o CUOI no -> thuoc ve nua sau, khong phai
        # nua truoc (nua truoc gio cat thang sang meme).
        s.pop("transition", None)
        s.pop("transition_duration", None)
        duoi["start"] = round(cut_src, 3)
        duoi["_cut_tail"] = tag
        segs.insert(i + 1, duoi)
        return i + 1
    return len(segs)


def apply_structure(plan, changes):
    """Dung HOOK len dau + CAT video chinh de chen meme. Tra ham doi gio
    timeline BODY -> timeline MOI (dung cho cac muc khai theo gio timeline)."""
    segs = plan.get("segments") or []
    if not segs:
        return _shift_fn(0.0, [])
    speech = plan_speech(plan)

    cuts = []
    for it in plan.get("inserts") or []:
        if it.get("placement") != PLACEMENT_CUT:
            continue
        anchor = it.get("_anchor")
        if anchor is None:
            continue
        cuts.append((round(float(anchor), 3), round(float(it.get("duration") or 0), 3), it))
    cuts.sort(key=lambda r: r[0])

    # Chen tu CUOI len DAU de vi tri cac diem cat phia truoc khong bi xe dich.
    for anchor, span, it in reversed(cuts):
        idx = _cut_at(segs, anchor, it.get("meme_id") or "meme")
        seg = {"source_id": "meme:%s" % (it.get("meme_id") or "x"),
               "file": it.get("file"), "kind": "insert",
               "start": float(it.get("src_start", 0) or 0),
               "end": float(it.get("src_end", 0) or 0),
               "scale": it.get("scale", 1.0), "volume": it.get("volume", 0.0),
               "x": it.get("x", 0.0), "y": it.get("y", 0.0),
               "transition": it.get("transition"), "_name": it.get("_name"),
               "meme_id": it.get("meme_id")}
        if it.get("background_blur"):
            seg["background_blur"] = int(it["background_blur"])
        segs.insert(idx, seg)
        changes.append("insert(%s): CAT video chinh o %.2fs, chen meme %.1fs roi noi tiep"
                       % (it.get("meme_id") or "meme", anchor, span))

    hook_seg = _hook_segment(plan, speech, changes)
    hook_len = 0.0
    if hook_seg:
        # khoang lang that ben trong ban sao hook cung bi cat (luat cung 2026-10-01) -> nhieu manh kind "hook"
        # lien tiep; chuyen canh sang than video chi o manh CUOI
        pieces = [hook_seg]
        try:
            import speech_cut
            pieces = speech_cut.split_quiet(plan, hook_seg, speech_cut.plan_pause_limit(plan), changes) or [hook_seg]
            # kiem lai mep cat cua hook: duoi am chu cuoi bi cup -> keo toi khi tieng tat han
            speech_cut.audit_cuts(plan, pieces, speech_cut.plan_pause_limit(plan), changes, label="hook")
        except Exception as ex:  # loi do am thanh khong duoc lam hong hook
            changes.append("hook: bo qua siet khoang nghi (%s)" % str(ex)[:120])
        for k, pc in enumerate(pieces):
            if k < len(pieces) - 1:
                pc["transition"] = None
            pc.pop("quiet_start", None)
            pc.pop("quiet_end", None)
        segs[0:0] = pieces
        hook_len = sum(_span_of(pc) for pc in pieces)
        changes.append("hook: dua doan nguon %.2f-%.2f len dau video (%.1fs) + transition %s"
                       % (hook_seg["start"], hook_seg["end"], hook_len, hook_seg["transition"]))
    plan["segments"] = segs
    plan["duration"] = _relayout(segs)
    fn = _shift_fn(hook_len, [(a, s) for a, s, _ in cuts])
    _move_timeline_items(plan, fn)
    # Meme DE LEN cung phai dich theo: gio cua no dang tinh tren timeline "than
    # video", ma timeline that gio da dai ra vi hook + cac doan meme cat vao.
    for it in plan.get("inserts") or []:
        if it.get("_anchor") is not None:
            it["start"] = round(fn(it["_anchor"]), 3)
    plan["_structure"] = {"hook_len": round(hook_len, 3),
                          "cuts": [[a, s] for a, s, _ in cuts]}
    return fn


def prepare_inserts(plan, tmap, duration, changes):
    """Chuan hoa inserts[] TRUOC khi dung cau truc: neo gio, chon kieu chen
    (cat hay de len), do dai, kich thuoc khung.

    `_anchor` tra ve la gio tren timeline BODY (chua co hook/meme), vi cau truc
    duoc dung sau do moi biet moi thu dich di bao nhieu."""
    speech = plan_speech(plan)
    cum_tu = plan_speech(plan, gop=0)
    W = int((plan.get("canvas") or {}).get("w") or 1080)
    H = int((plan.get("canvas") or {}).get("h") or 1920)
    out = []
    last_anchor = -999.0
    tong_cat = 0.0
    for i, it in enumerate(plan.get("inserts") or []):
        if not it.get("file") and not it.get("meme_id"):
            continue
        sid = it.get("source_id")
        t_src = it.get("src_time")
        anchor = None
        if t_src is not None:
            anchor = source_to_timeline(plan, sid, t_src, tmap)
            if anchor is None:
                changes.append("insert%d: gio nguon %.2f da bi cat khoi timeline -> bo"
                               % (i, float(t_src)))
                continue
        else:
            anchor = float(it.get("start", 0) or 0)
            if duration and anchor > duration + EPS:
                doi = source_to_timeline(plan, sid, anchor, tmap)
                if doi is None:
                    changes.append("insert%d: start %.2f ngoai timeline -> bo" % (i, anchor))
                    continue
                changes.append("insert%d: start %.2f vuot timeline -> doi tu gio nguon sang %.2f"
                               % (i, anchor, doi))
                anchor = doi
        anchor = max(0.0, min(anchor, max(0.0, duration - MIN_ELEMENT_SEC)))

        # --- kieu chen: CAT hay DE LEN -------------------------------------
        placement = (it.get("placement") or "auto").lower()
        if placement not in (PLACEMENT_CUT, PLACEMENT_OVER, "auto"):
            placement = "auto"
        span = float(it.get("duration") or 0)
        if not span:
            src_en = it.get("src_end")
            span = (float(src_en) - float(it.get("src_start", 0) or 0)) if src_en else 1.6
        dang_noi = True
        if speech and t_src is not None:
            dang_noi = _speaking_at(speech, sid, float(t_src))
            if not dang_noi:
                lang = _silence_window(speech, sid, float(t_src))
                du_cho = lang and (float(t_src) - lang[0] >= OVERLAY_SILENCE_MARGIN) and \
                    (lang[1] - float(t_src) >= span + OVERLAY_SILENCE_MARGIN)
                dang_noi = not du_cho
        if placement == "auto":
            placement = PLACEMENT_CUT if dang_noi else PLACEMENT_OVER
            if placement == PLACEMENT_CUT:
                changes.append("insert%d: dat vao doan DANG NOI -> chuyen sang kieu CAT "
                               "(de len se nuot mat cau noi)" % i)
        elif placement == PLACEMENT_OVER and dang_noi and speech:
            placement = PLACEMENT_CUT
            changes.append("insert%d: xin de len nhung cho do dang noi -> ep ve kieu CAT" % i)

        # --- do dai --------------------------------------------------------
        lo, hi = (CUTAWAY_MIN_SEC, CUTAWAY_MAX_SEC) if placement == PLACEMENT_CUT \
            else (INSERT_MIN_SEC, INSERT_MAX_SEC)
        if span > hi + EPS or span < lo - EPS:
            changes.append("insert%d: %.1fs ngoai [%.1f,%.1f]s cho kieu %s -> %.1fs"
                           % (i, span, lo, hi, placement, max(lo, min(hi, span))))
        span = max(lo, min(hi, span))
        src_st = float(it.get("src_start", 0) or 0)
        src_len = it.get("_src_duration")
        if src_len:
            src_len = float(src_len)
            if src_st + span > src_len + EPS:
                moi = max(0.0, src_len - span)
                if abs(moi - src_st) > 0.01:
                    changes.append("insert%d: tu giay %.2f khong du %.1fs -> lui diem cat ve %.2f"
                                   % (i, src_st, span, moi))
                src_st = moi
            span = min(span, src_len - src_st)
        if span < lo - EPS:
            changes.append("insert%d: clip meme qua ngan (%.1fs) -> bo" % (i, span))
            continue

        # --- gian cach + tran tong thoi gian cat --------------------------
        if out and abs(anchor - last_anchor) < INSERT_MIN_GAP:
            changes.append("insert%d: cach meme truoc < %.1fs -> bo (dut mach video chinh)"
                           % (i, INSERT_MIN_GAP))
            continue
        if placement == PLACEMENT_CUT and duration:
            # Luon cho phep it nhat MOT meme, du video co ngan den may.
            tran_cat = max(duration * CUTAWAY_TOTAL_RATIO, CUTAWAY_MAX_SEC)
            if tong_cat + span > tran_cat + EPS:
                changes.append("insert%d: tong meme cat vao vuot %.1fs (%d%% do dai video) -> bo"
                               % (i, tran_cat, int(CUTAWAY_TOTAL_RATIO * 100)))
                continue
            tong_cat += span

        # --- cat theo ranh gioi cau noi ------------------------------------
        if placement == PLACEMENT_CUT and cum_tu and t_src is not None:
            moc = snap_to_pause(cum_tu, sid, float(t_src))
            if abs(moc - float(t_src)) > 0.01:
                doi = source_to_timeline(plan, sid, moc, tmap)
                if doi is not None:
                    changes.append("insert%d: keo diem cat %.2f -> %.2f (cat o cho ngat cau, "
                                   "khong cat giua chung mot tu)" % (i, float(t_src), moc))
                    anchor = max(0.0, min(doi, max(0.0, duration - MIN_ELEMENT_SEC)))
                    it["src_time"] = round(moc, 3)   # chot lai de lan sau khong keo nua
        if placement == PLACEMENT_CUT and t_src is not None:
            # ranh gioi cum tu Gemini co the nam GIUA tieng (do that 2026-10-01: meme cat o 40.52s khi dang noi)
            # -> chot diem cat vao khoang lang THAT do bang am thanh: chu dang noi duoc noi het roi moi cat sang meme
            cur = float(it.get("src_time", t_src))
            try:
                import speech_cut
                q = speech_cut.quiet_point(plan, sid, cur)
            except Exception:
                q = None
            if q is not None and abs(q - cur) > 0.01:
                doi = source_to_timeline(plan, sid, q, tmap)
                if doi is not None:
                    changes.append("insert%d: diem cat %.2f dang co tieng -> %.2f (khoang lang that, khong cat mat tieng)"
                                   % (i, cur, q))
                    anchor = max(0.0, min(doi, max(0.0, duration - MIN_ELEMENT_SEC)))
                    it["src_time"] = round(q, 3)

        # --- kich thuoc khung ----------------------------------------------
        mode, scale, blur, x, y = meme_layout(it.get("_w"), it.get("_h"), W, H,
                                              it.get("mode"), placement)
        if it.get("mode") and it.get("mode") != mode and it.get("mode") != "auto":
            changes.append("insert%d: mode %r -> %r theo ti le clip (%sx%s) va khung %dx%d"
                           % (i, it.get("mode"), mode, it.get("_w"), it.get("_h"), W, H))
        it["mode"], it["placement"] = mode, placement
        if it.get("scale") is None:
            it["scale"] = scale
        if blur and not it.get("background_blur"):
            it["background_blur"] = blur
        it.setdefault("x", x)
        it.setdefault("y", y)
        vol = it.get("volume")
        if vol is None:
            vol = 0.7 if it.get("_keep_audio") else 0.0
        vol = max(0.0, min(1.0, float(vol)))
        if placement == PLACEMENT_CUT and vol < 0.25:
            # Cat han video chinh ra ma meme lai cam -> 1.5s im lang, tut nhip.
            vol = 0.5
            changes.append("insert%d: kieu CAT ma meme cam tieng -> mo volume 0.5 "
                           "(cat ra ma im lang thi video bi hut hoi)" % i)
        it["volume"] = round(vol, 3)
        it["src_start"] = round(src_st, 3)
        it["src_end"] = round(src_st + span, 3)
        it["duration"] = round(span, 3)
        it["_anchor"] = round(anchor, 3)
        it["start"] = round(anchor, 3)
        last_anchor = anchor
        out.append(it)
        if len(out) >= MAX_INSERTS:
            changes.append("chi giu %d meme dau (chen nhieu qua lam loang noi dung)" % MAX_INSERTS)
            break
    plan["inserts"] = out
    return out


# ---------------------------------------------------------------------------
# CUONG DO SFX — to nho theo LOAI va theo NGU CANH
# ---------------------------------------------------------------------------
# Ly do ton tai: AI KHONG NGHE duoc file SFX (giong nhu no khong xem duoc clip
# meme). No de 0.8 cho moi thu, trong khi mot file vine-boom master rat to va
# mot file "ding" thu am nho co the lech nhau 15 dB — cung volume 0.8 nhung mot
# cai dinh tai, mot cai khong nghe thay.
#
# Hai tang:
#   1. CHUAN HOA theo do to DO DUOC (LUFS, do bang ffmpeg khi nhap kho).
#      volume = 10^((muc_tieu - lufs_file)/20). Day la tang lam cho "khong qua
#      to cung khong qua nho" dung nghia den.
#   2. NGU CANH: dang co tieng nguoi noi -> ha xuong de khong dam vao giong;
#      roi vao khoang lang / diem cat -> de nguyen; lap lai cung mot tieng ->
#      nho dan; hai SFX sat nhau -> cai sau nho hon.
SFX_FAMILY_RULES = [
    ("impact", ["boom", "bass", "explos", "blast", "hit", "punch", "slam", "gun", "shot",
                "dam", "no tung", "bump", "thud", "deep"]),
    ("comedy", ["vine", "bruh", "anime", "wow", "meme", "laugh", "cuoi", "hai", "funny",
                "troll", "fail", "sad violin", "cricket", "khoc", "huh", "wtf", "oh no"]),
    ("whoosh", ["whoosh", "swoosh", "swish", "transition", "chuyen canh", "vut", "veo",
                "woosh", "air"]),
    ("crowd", ["applause", "clap", "vo tay", "cheer", "crowd", "audience", "yay", "tada"]),
    ("ui", ["ding", "pop", "click", "notif", "message", "tin nhan", "coin", "cash", "tien",
            "ka-ching", "kaching", "correct", "bell", "chuong", "bubble", "type", "camera"]),
    ("riser", ["riser", "build", "suspense", "drone", "ambience", "heartbeat", "tick",
               "dong ho", "clock", "wind", "rain"]),
]

# vol   = muc dung khi CHUA do duoc do to file (khong co ffmpeg / kho cu)
# lufs  = muc to muc tieu khi DA do duoc. Tieng dam manh duoc phep to hon tieng UI.
# `lufs` la muc MOMENTARY MAX muc tieu (xem engine.measure_loudness), khong phai
# integrated. Giong nguoi noi trong video talking-head thuong o quanh -14..-10 M,
# nen tieng dam nhan phai nhinh hon mot chut, con tieng UI phai nam duoi.
SFX_MIX = {
    "impact":  {"vol": 0.70, "lufs": -9.0},
    "comedy":  {"vol": 0.65, "lufs": -10.0},
    "whoosh":  {"vol": 0.55, "lufs": -13.0},
    "crowd":   {"vol": 0.50, "lufs": -13.0},
    "ui":      {"vol": 0.45, "lufs": -15.0},
    "riser":   {"vol": 0.35, "lufs": -18.0},
    "neutral": {"vol": 0.60, "lufs": -12.0},
}

SFX_VOL_MIN = 0.20
# File thu am nho can duoc keo len that, neu khong thi "dat dung cho" ma khong ai
# nghe thay. (remotion_plan._audio_to_spec kep lai ve toi da 1.0 khi xuat spec.)
SFX_VOL_MAX = 1.20
SFX_DUCK_OVER_SPEECH = 0.75   # roi dung luc dang noi -> lui ve sau giong noi
SFX_HOOK_BOOST = 1.10         # SFX dau tien o hook duoc phep noi hon mot chut
SFX_REPEAT_DECAY = 0.85       # cung mot tieng lap lai -> nho dan, do nham tai
SFX_CROWD_DECAY = 0.85        # hai SFX sat nhau -> cai sau nhuong cai truoc
SFX_CROWD_SEC = 1.5
SFX_LOUD_MARK = 0.85          # tren muc nay coi la "tieng to"
SFX_LOUD_EVERY_SEC = 10.0     # moi ~10s chi mot tieng to

# CAN THEO GIONG NOI CUA CHINH VIDEO (2026-10-01, user: "video tieng nho ma SFX lai qua to — am thanh khi chu
# hien phai dong bo voi tang am thanh ca video"). Do do to giong (speech_cut.voice_level) + do to SFX khi phat
# (speech_cut.playback_lufs) bang CUNG mot thuoc -> muc SFX = giong + chenh lech theo loai (dB), khong vuot muc
# tuyet doi SFX_MIX cu. Khong con san volume 0.2 (san do lam SFX to hon giong 15-20 dB o video thu am nho).
SFX_REL = {"impact": 2.0, "comedy": 1.0, "whoosh": -2.0, "crowd": -2.0, "ui": -4.0, "riser": -7.0, "neutral": -1.0}
SFX_ACCENT_REL = -3.0         # SFX tu gan khi CHU / HINH hien (lop do hoa, hieu ung tu viet): <= giong - 3 dB
SFX_REL_MIN_VOL = 0.01
MEME_REL = 0.0                # tieng meme cat vao: khong to hon giong noi cua video


def sfx_family(item):
    """Xep loai SFX tu ten/nhan trong kho. Khong doan duoc -> 'neutral'."""
    blob = " ".join(str(item.get(k) or "")
                    for k in ("_name", "name", "sfx_id", "use_when", "_use_when"))
    blob += " " + " ".join(item.get("tags") or [])
    # Bo dau tieng Viet: ten file trong kho viet ca hai kieu ("vo tay" / "vỗ tay")
    blob = "".join(_base_char(c) for c in blob.lower())
    for fam, keys in SFX_FAMILY_RULES:
        if any(k in blob for k in keys):
            return fam
    emo = (item.get("_emotion") or item.get("emotion") or "").lower()
    if emo == "punch":
        return "impact"
    if emo == "positive":
        return "ui"
    return "neutral"


def sfx_base_volume(fam, lufs=None):
    spec = SFX_MIX.get(fam) or SFX_MIX["neutral"]
    if lufs is None:
        return spec["vol"]
    try:
        gain = 10 ** ((spec["lufs"] - float(lufs)) / 20.0)
    except (TypeError, ValueError, OverflowError):
        return spec["vol"]
    return max(SFX_VOL_MIN, min(SFX_VOL_MAX, gain))


def speech_on_timeline(plan):
    """Cac khoang CO TIENG NGUOI, quy ve gio TIMELINE (gom ca doan hook)."""
    speech = plan_speech(plan)
    if not speech:
        return []
    rows = []
    for s in plan.get("segments") or []:
        if s.get("kind") == "insert":
            continue
        sid = s.get("source_id")
        sp = float(s.get("speed", 1.0) or 1.0)
        ts = float(s.get("target_start", 0) or 0)
        s_st, s_en = float(s.get("start", 0) or 0), float(s.get("end", 0) or 0)
        for v_sid, st, en in speech:
            if sid and v_sid and v_sid != sid:
                continue
            a, b = max(st, s_st), min(en, s_en)
            if b > a:
                rows.append((ts + (a - s_st) / sp, ts + (b - s_st) / sp))
    rows.sort()
    gop = []
    for a, b in rows:
        if gop and a <= gop[-1][1] + 0.05:
            gop[-1][1] = max(gop[-1][1], b)
        else:
            gop.append([a, b])
    return gop


def mix_sfx(plan, changes):
    """Dat CUONG DO cho tung SFX: theo loai tieng, theo do to do duoc cua file,
    va theo ngu canh (dang noi / khoang lang / lap lai / sat nhau).

    Guard tu tinh lai moi lan chay (khong dua vao volume cu) nen ket qua on dinh.
    Muon giu tay thi dat "volume_fixed": true."""
    audio = plan.get("audio") or []
    if not audio:
        return
    import math
    import speech_cut
    voice = plan.get("_voice_lufs")
    if voice is None:
        try:
            voice = speech_cut.voice_level(plan)
        except Exception:
            voice = None
        plan["_voice_lufs"] = voice
    noi = speech_on_timeline(plan)
    hook_len, _ = read_structure(plan)
    dem_lap = {}
    truoc_t = None
    to_gan_day = []
    for i, a in enumerate(audio):
        if (a.get("role") or "sfx") == "bgm":
            continue
        if a.get("volume_fixed"):
            continue
        st = float(a.get("start", 0) or 0)
        fam = sfx_family(a)
        lufs = a.get("_play_lufs")
        if lufs is None and a.get("file"):
            try:
                s0 = float(a.get("src_start") or 0)
                lufs = speech_cut.playback_lufs(a["file"], s0, s0 + 3.0)
            except Exception:
                lufs = None
            a["_play_lufs"] = lufs
        accent = bool(a.get("_from_layer"))
        if voice is not None and lufs is not None:
            rel = SFX_ACCENT_REL if accent else SFX_REL.get(fam, SFX_REL["neutral"])
            muc = min((SFX_MIX.get(fam) or SFX_MIX["neutral"])["lufs"], voice + rel)
            if accent:
                muc = min(muc, voice + SFX_REL.get(fam, SFX_REL["neutral"]))
            vol, vmin = 10 ** ((muc - float(lufs)) / 20.0), SFX_REL_MIN_VOL
            ly_do = ["%s%s %.1f LUFS -> muc %.1f (giong video %.1f)" % (fam, ", khi chu/hinh hien" if accent else "",
                                                                        float(lufs), muc, voice)]
        else:
            lufs = a.get("_lufs") if lufs is None else lufs
            vol, vmin = sfx_base_volume(fam, lufs), SFX_VOL_MIN
            ly_do = [fam if lufs is None else "%s, do duoc %.1f LUFS" % (fam, float(lufs))]
        dang_noi = any(x <= st <= y for x, y in noi)
        if dang_noi:
            vol *= SFX_DUCK_OVER_SPEECH
            ly_do.append("roi dung luc dang noi -> lui sau giong")
        if hook_len and st < hook_len + EPS:
            vol *= SFX_HOOK_BOOST
            ly_do.append("nam trong hook -> cho noi hon")
        khoa = a.get("sfx_id") or a.get("file") or ""
        n = dem_lap.get(khoa, 0)
        if n:
            vol *= SFX_REPEAT_DECAY ** n
            ly_do.append("tieng nay lap lan %d -> nho dan" % (n + 1))
        dem_lap[khoa] = n + 1
        if truoc_t is not None and st - truoc_t < SFX_CROWD_SEC:
            vol *= SFX_CROWD_DECAY
            ly_do.append("sat SFX truoc (%.1fs) -> nhuong" % (st - truoc_t))
        vol = max(vmin, min(SFX_VOL_MAX, vol))
        if voice is not None and lufs is not None:
            # KIEM LAI: muc to THAT khi phat (Remotion khong khuech dai qua 1.0) khong vuot tran theo giong noi
            tran = voice + (SFX_ACCENT_REL if accent else SFX_REL.get(fam, SFX_REL["neutral"]))
            if hook_len and st < hook_len + EPS:
                tran += 20 * math.log10(SFX_HOOK_BOOST)
            that = float(lufs) + 20 * math.log10(max(1e-4, min(1.0, vol)))
            if that > tran + 0.3:
                vol = 10 ** ((tran - float(lufs)) / 20.0)
                ly_do.append("kiem lai: %.1f > tran %.1f LUFS -> ha" % (that, tran))
            a["_rel_db"] = round(float(lufs) + 20 * math.log10(max(1e-4, min(1.0, vol))) - voice, 1)
        to = (a.get("_rel_db") >= -0.5) if a.get("_rel_db") is not None else vol >= SFX_LOUD_MARK
        if to:
            gan = [t for t in to_gan_day if st - t < SFX_LOUD_EVERY_SEC]
            if gan:
                vol = round(vol * SFX_CROWD_DECAY, 3)
                ly_do.append("da co tieng to trong %.0fs truoc -> ha bot" % SFX_LOUD_EVERY_SEC)
            else:
                to_gan_day.append(st)
        truoc_t = st
        cu = a.get("volume")
        vol = round(vol, 3)
        if voice is not None and lufs is not None:
            a["_rel_db"] = round(float(lufs) + 20 * math.log10(max(1e-4, min(1.0, vol))) - voice, 1)
        if cu is None or abs(float(cu) - vol) > 0.02:
            changes.append("audio%d(%s) %.2fs: volume %s -> %.2f (%s)"
                           % (i, a.get("sfx_id") or "sfx", st,
                              ("%.2f" % float(cu)) if cu is not None else "-", vol,
                              "; ".join(ly_do)))
        a["volume"] = vol


# ---------------------------------------------------------------------------
# SEGMENTS + CHU TRANH DOAN MEME
# ---------------------------------------------------------------------------
def chuan_hoa_segments(segments, changes=None):
    """Bo doan rong, kep scale/speed, sap theo target_start, noi target_start LIEN TUC.
    Tra (segs, tong_do_dai). Dung chung cho build_spec va pipeline ngay sau B2 — de
    gio timeline ma B3..B7 nhin thay TRUNG voi gio timeline luc dung that."""
    if changes is None:
        changes = []
    segs = []
    for i, s in enumerate(segments or []):
        st = float(s.get("start", 0) or 0)
        en = float(s.get("end", st) or st)
        if en - st < MIN_ELEMENT_SEC:
            changes.append("seg%d: do dai < %.1fs -> bo" % (i, MIN_ELEMENT_SEC))
            continue
        s["start"], s["end"] = round(st, 3), round(en, 3)
        sc = float(s.get("scale", 1.0) or 1.0)
        if not 0.5 <= sc <= 1.6:
            s["scale"] = max(0.5, min(1.6, sc))
            changes.append("seg%d: scale %.2f ngoai [0.5,1.6] -> %.2f" % (i, sc, s["scale"]))
        sp = float(s.get("speed", 1.0) or 1.0)
        if not 0.25 <= sp <= 4.0:
            s["speed"] = max(0.25, min(4.0, sp))
            changes.append("seg%d: speed %.2f ngoai [0.25,4] -> %.2f" % (i, sp, s["speed"]))
        segs.append(s)
    segs.sort(key=lambda s: float(s.get("target_start") if s.get("target_start") is not None else s.get("start", 0)))
    cursor = 0.0
    for i, s in enumerate(segs):
        ts = s.get("target_start")
        ts = cursor if ts is None else float(ts)
        span = (s["end"] - s["start"]) / float(s.get("speed", 1.0) or 1.0)
        if abs(ts - cursor) > 0.05:
            changes.append("seg%d: target_start %.2f -> %.2f (noi lien tuc, bo khoang trong/chong lan)" % (i, ts, cursor))
            ts = cursor
        s["target_start"] = round(ts, 3)
        cursor = ts + span
    return segs, cursor


def clear_over_inserts(plan, changes):
    """Caption/hieu ung cua video chinh bi keo dai vat qua doan meme thi cat lai.

    Ly do: doan meme la mot nhip RIENG. De chu cua cau truoc chay de len no thi
    vua che meme, vua khien nguoi xem tuong chu thuoc ve meme.

    ⚠️ Cat duoi co the lam phan tu ngan bang 0 — khi no bat dau DUNG luc meme bat
    dau (st == a) thi `end = a = start`. Truoc day guard van cat nhu the roi
    validate bao lai "capN: chi hien 0.00s -> doc khong kip", tuc guard tu tao ra
    viec cho nguoi dung lam. Gio: cat xong con qua ngan thi DAY ca khoi ra sau
    meme (nhanh elif ben duoi von da biet lam vic nay); van khong du cho thi BO han.
    """
    khung = [(float(s.get("target_start", 0) or 0),
              float(s.get("target_start", 0) or 0) + _span_of(s))
             for s in plan.get("segments") or [] if s.get("kind") == "insert"]
    if not khung:
        return
    try:
        het_video = float(plan.get("duration") or 0)
    except (TypeError, ValueError):
        het_video = 0.0
    for key in ("captions", "cards", "scene_effects", "char_effects"):
        muc = plan.get(key) or []
        nguong = MIN_CAPTION_SEC if key in ("captions", "cards") else MIN_VISUAL_SEC
        bo = set()
        for i, it in enumerate(muc):
            st = float(it.get("start", 0) or 0)
            en = float(it.get("end", st) or st)
            da_dong = False
            for a, b in khung:
                if st <= a + EPS and en > a + EPS:
                    if a - st < nguong - EPS:
                        dai = en - st
                        it["start"] = round(b, 3)
                        it["end"] = round(b + dai, 3)
                        changes.append("%s%d: cat duoi thi chi con %.2fs (qua ngan) -> day ca khoi "
                                       "ve sau doan meme (%.2fs)" % (key, i, max(a - st, 0.0), b))
                    else:
                        it["end"] = round(a, 3)
                        changes.append("%s%d: cat duoi o %.2fs cho khong de len doan meme"
                                       % (key, i, a))
                    da_dong = True
                elif a - EPS < st < b - EPS:
                    dai = en - st
                    it["start"] = round(b, 3)
                    it["end"] = round(b + dai, 3)
                    changes.append("%s%d: roi vao giua doan meme -> day ve sau meme (%.2fs)"
                                   % (key, i, b))
                    da_dong = True
                st = float(it.get("start", 0) or 0)
                en = float(it.get("end", st) or st)
            if not da_dong:
                continue
            if het_video and en > het_video + EPS:   # bi day lo ra ngoai duoi video
                en = het_video
                it["end"] = round(en, 3)
            if en - st < nguong - EPS or (het_video and st >= het_video - EPS):
                bo.add(i)
                ten = " ".join((it.get("text") or "").split())[:20]
                changes.append("%s%d%s: khong con cho hien (%.2fs) sau khi tranh doan meme -> bo han"
                               % (key, i, " %r" % ten if ten else "", max(en - st, 0.0)))
        if bo:
            plan[key] = [x for j, x in enumerate(muc) if j not in bo]


# ---------------------------------------------------------------------------
# THONG SO NGUOI DUNG CHINH (menu "Prompt & quy tac")
# ---------------------------------------------------------------------------
# Chung file voi prompt_store.py cua sidecar. Doc lai moi lan guard chay (theo mtime).
# id = duong dan toi hang so: "TEN", "TEN.khoa", "TEN.khoa.chi_so".
# Id co trong file ma khong con o day (vd quy tac chu cua luong CapCut cu) bi bo qua.
OVERRIDES_PATH = os.path.join(os.path.expanduser("~"), ".capcut-studio", "prompt_overrides.json")

EDITABLE_RULES = (
    "MIN_CAPTION_SEC",
    "HOOK_MIN_SEC", "HOOK_MAX_SEC", "HOOK_IDEAL.0", "HOOK_IDEAL.1",
    "HOOK_REPEAT_GUARD_SEC",
    "MAX_INSERTS", "INSERT_MIN_GAP", "INSERT_MIN_SEC", "INSERT_MAX_SEC",
    "CUTAWAY_MIN_SEC", "CUTAWAY_MAX_SEC", "CUT_SNAP_SEC", "CUTAWAY_TOTAL_RATIO",
    "OVERLAY_SILENCE_MARGIN", "SPEECH_GAP_SEC",
    "MAX_SFX", "SFX_MIN_GAP", "SFX_VOL_MIN", "SFX_VOL_MAX", "SFX_DUCK_OVER_SPEECH",
    "SFX_HOOK_BOOST", "SFX_REPEAT_DECAY", "SFX_CROWD_DECAY", "SFX_CROWD_SEC",
    "SFX_LOUD_MARK", "SFX_LOUD_EVERY_SEC",
) + tuple("SFX_MIX.%s.%s" % (f, k) for f in
          ("impact", "comedy", "whoosh", "crowd", "ui", "riser", "neutral")
          for k in ("lufs", "vol"))

# Ban goc cua moi hang so goc (chup MOT lan luc import, truoc khi ghi de).
_RULE_DEFAULTS = {name: copy.deepcopy(globals()[name])
                  for name in sorted({r.split(".")[0] for r in EDITABLE_RULES})}
_OV_STAMP = ["unset"]


def _path_keys(rid):
    return [int(k) if k.isdigit() else k for k in rid.split(".")[1:]]


def rule_default(rid):
    v = _RULE_DEFAULTS[rid.split(".")[0]]
    for k in _path_keys(rid):
        v = v[k]
    return v


def _with_value(obj, keys, value):
    """Tra ve BAN SAO cua obj voi obj[keys...] = value (tuple giu nguyen la tuple)."""
    if not keys:
        return value
    k = keys[0]
    if isinstance(obj, tuple):
        lst = list(obj)
        lst[k] = _with_value(lst[k], keys[1:], value)
        return tuple(lst)
    new = dict(obj) if isinstance(obj, dict) else list(obj)
    new[k] = _with_value(new[k], keys[1:], value)
    return new


def _coerce_like(dflt, v):
    if isinstance(v, bool):
        raise ValueError
    if isinstance(dflt, int) and not isinstance(dflt, bool):
        f = float(v)
        if f != f or abs(f - round(f)) > 1e-9:
            raise ValueError
        return int(round(f))
    f = float(v)
    if f != f or f in (float("inf"), float("-inf")):
        raise ValueError
    return f


def apply_overrides(force=False):
    """Nap thong so da sua vao cac hang so cua module. Khong co file / file hong ->
    ve dung ban goc. Gia tri sai kieu bi bo qua (khong bao gio lam guard crash)."""
    try:
        st = os.stat(OVERRIDES_PATH)
        stamp = (st.st_mtime_ns, st.st_size)
    except OSError:
        stamp = None
    if not force and stamp == _OV_STAMP[0]:
        return
    _OV_STAMP[0] = stamp
    rules = {}
    if stamp is not None:
        try:
            with open(OVERRIDES_PATH, encoding="utf-8") as f:
                data = json.load(f)
            rules = (data or {}).get("rules") or {}
            if not isinstance(rules, dict):
                rules = {}
        except Exception:
            rules = {}
    g = globals()
    vals = {name: copy.deepcopy(v) for name, v in _RULE_DEFAULTS.items()}
    for rid in EDITABLE_RULES:
        if rid not in rules:
            continue
        try:
            v = _coerce_like(rule_default(rid), rules[rid])
        except (TypeError, ValueError, OverflowError):
            continue
        name = rid.split(".")[0]
        vals[name] = _with_value(vals[name], _path_keys(rid), v)
    g.update(vals)


apply_overrides()
