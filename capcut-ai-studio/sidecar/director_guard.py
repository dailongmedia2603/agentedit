#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GIAM SAT DAO DIEN (2026-10-17, tai lieu Dao-dien-ai — giai doan 2 + 3).

Do that 9 ke hoach gan nhat (78 nhip): nhip CAO TRAO (nang luong 5) chi co 0.36 phan tu hinh / giay — thap hon ca nhip
nang luong 2 (0.56); video bong da: nhip 'VAOOOO!' 0 phan tu. Dao dien viet van xuoi, 6 bo phan tu dien giai, KHONG ai kiem
ban dung co lam dung lenh khong; buoc duyet chi duoc BO (tu cham 8/7/7 moi video). Module nay la lop KIEM BANG CODE:

1. GIAO VIEC (muc plan): moi quyet dinh cua bang quyet dinh (director.normalize) giao viec cho bo phan nao -> phan tu cua bo
   phan do co ghi "qd" (hoac, khi bo phan khong ghi, nam trong doan) chua. Thieu -> R4 (vong tu sua cua R4), FX (luot
   FX-bo-sung), B7 (code dat tieng bo the gioi dung tu neo).
2. KHUNG (giai doan 3, "dung nen"): co canh tung doan theo "khung" cua quyet dinh + luan phien + chong dung im (ho so nhip)
   — code lam, AI khong ve zoom.
3. DO TREN BAN DUNG (spec cuoi): nang luong THAT theo tung doan (nhip hinh — tai dung hook_rule.measure + doi bo cuc, chu
   nhan, zoom, meme), tuong quan voi nang luong dao dien dat, doan diem nhan khong co gi, khoang dung im, qua tai (nhieu
   phan tu chuyen dong cung luc) -> bo phan tu phu gay qua tai, ghi bao cao _pipeline.giam_sat.
"""
import math

import director
import providers

_f = providers._f

# tieng nhan code dat khi B7 bo sot lenh cua dao dien (ho trong bo the gioi): theo y do
SFX_FAM = {"BUNG_NO": "boom", "CHOT_TIEU_CUC": "boom", "MO_BE_LAI": "boom", "MO_DINH_DANH": "whoosh",
           "MO_KET_QUA": "ding", "MO_CAU_HOI": "riser", "NHAN_TU_KHOA": "pop", "SO_LIEU": "ding", "TIENG_LONG": "click",
           "DAN_MAT": "swoosh", "MINH_HOA_Y": "swoosh", "TRUOC_SAU": "whoosh", "DOI_KHONG_KHI": "whoosh",
           "CTA_KHEP": "pop", "PHAN_UNG_HAI": "pop"}
RISER_LEAD = 0.9            # riser bat dau truoc tu neo
MIN_NL_CHECK = 3            # chi doi giao viec cua quyet dinh nang luong >= 3 (nhip nen khong bat buoc)
BG_FOCUS = {"lam_toi": {"dim": 0.45, "blur": 0.0, "desat": 0.0}, "lam_mo": {"dim": 0.18, "blur": 9.0, "desat": 0.0},
            "giam_mau": {"dim": 0.12, "blur": 0.0, "desat": 0.85}}
FREEZE_SEC = 0.8
STROKE_PX = 9


# ---------------------------------------------------------------------------
# 1. GIAO VIEC
# ---------------------------------------------------------------------------
def decisions(cd):
    """[(khoa, quyet_dinh)] — khoa = so doan | "hook"."""
    if not isinstance(cd, dict):
        return []
    out = [(q["segment"], q) for q in cd.get("quyet_dinh") or [] if isinstance(q, dict) and "segment" in q]
    if isinstance(cd.get("hook_qd"), dict):
        out.append(("hook", cd["hook_qd"]))
    return out


def _is_hook(x):
    return isinstance(x, dict) and x.get("anchor") == "hook"


def _near(q, sid, t0, t1):
    """Phan tu (gio nguon) nam trong doan cua quyet dinh."""
    if sid not in (None, q.get("source_id")):
        return False
    a, b = _f(q.get("nguon_tu")), _f(q.get("nguon_den"))
    return t0 < b + 0.05 and max(t0, t1) > a - 0.05


def _match(x, key, q, t0, t1):
    """x (phan tu) thuc hien quyet dinh `key`: co qd -> so khop qd; khong co qd -> dung doan (va dung phan hook / than)."""
    qi = director.qd_index(x.get("qd"))
    if qi is not None:
        return qi == key
    if (key == "hook") != _is_hook(x):
        return False
    return _near(q, x.get("source_id"), t0, t1)


def deliveries(cd, design=None, captions=None, fx_list=None, inserts=None, audio=None):
    """{khoa: {bo_phan: True/False}} cho moi quyet dinh co giao viec."""
    layers = [L for L in (design or {}).get("layers") or [] if isinstance(L, dict) and not L.get("um")
              and not L.get("user_media")]
    scenes = [s for s in (design or {}).get("scenes") or [] if isinstance(s, dict) and s.get("layout") not in (None, "full")]
    caps = [c for c in (captions or {}).get("captions") or [] if isinstance(c, dict) and c.get("role") in ("hero", "micro")]
    fxs = [e for e in fx_list or [] if isinstance(e, dict)]
    ins = [m for m in (inserts or {}).get("inserts") or [] if isinstance(m, dict)]
    auds = [a for a in (audio or {}).get("audio") or [] if isinstance(a, dict) and not a.get("_auto_text")]
    out = {}
    for key, q in decisions(cd):
        gv = q.get("giao_viec") or {}
        if not gv:
            continue
        d = {}
        for bp in gv:
            if bp == "R4":
                ok = any(_match(L, key, q, _f(L.get("src_start")), _f(L.get("src_end"), _f(L.get("src_start"))))
                         for L in layers) or any(
                    _match(s, key, q, _f(s.get("src_start")), _f(s.get("src_end"))) for s in scenes)
            elif bp == "R5":
                ok = any(_match(c, key, q, _f(c.get("src_start")), _f(c.get("src_end"), _f(c.get("src_start"))))
                         for c in caps)
            elif bp == "FX":
                ok = False
                for e in fxs:
                    if director.qd_index(e.get("qd")) is not None:
                        ok = director.qd_index(e.get("qd")) == key
                    elif key == "hook":
                        ok = _is_hook(e)
                    else:
                        ok = (str(e.get("moment") or "") == "m%d" % (key + 1)) or (
                            not _is_hook(e) and _near(q, e.get("source_id"), _f(e.get("src_start")), _f(e.get("src_end"))))
                    if ok:
                        break
            elif bp == "B6":
                ok = any(_match(m, key, q, _f(m.get("src_time")), _f(m.get("src_time"))) for m in ins)
            else:
                # tieng cua lenh: SFX B7 mang qd, HOAC tieng gan tren chinh lop R4 thuc hien lenh do (lop co "sfx")
                ok = any(_match(a, key, q, _f(a.get("src_time")), _f(a.get("src_time"))) for a in auds) or any(
                    L.get("sfx") and director.qd_index(L.get("qd")) == key for L in layers)
            d[bp] = bool(ok)
        out[key] = d
    return out


def missing(cd, deliv, bo_phan=None, min_nl=MIN_NL_CHECK):
    """Viec dao dien giao ma CHUA lam: [{qd, bo_phan, viec, y_do, ten, nang_luong, neo, source_id, nguon_tu, nguon_den,
    anchor}] — chi quyet dinh nang luong >= min_nl (nhip nen khong bat buoc)."""
    out = []
    for key, q in decisions(cd):
        if q.get("y_do") in director.NHE_Y_DO or q.get("nang_luong", 0) < min_nl:
            continue
        for bp, done in (deliv.get(key) or {}).items():
            if done or (bo_phan and bp not in bo_phan):
                continue
            out.append({"qd": key, "bo_phan": bp, "viec": (q.get("giao_viec") or {}).get(bp), "y_do": q.get("y_do"),
                        "ten": q.get("ten"), "nang_luong": q.get("nang_luong"), "neo": q.get("neo"),
                        "source_id": q.get("source_id"), "nguon_tu": q.get("nguon_tu"), "nguon_den": q.get("nguon_den"),
                        "anchor": "hook" if key == "hook" else None})
    return out


def r4_audit(design, cd_view):
    """Vong tu sua cua R4 (motion_design.gpt_rm_design): lenh R4 cua dao dien (chi_dao.viec_cua_ban) chua co lop / scene
    nao ghi "qd" -> danh sach muc can bo sung (cung dang voi audit_design). Khong co ban chi dao -> []."""
    if not isinstance(cd_view, dict) or not cd_view.get("viec_cua_ban"):
        return []
    out = []
    layers = [L for L in (design or {}).get("layers") or [] if isinstance(L, dict)]
    scenes = [s for s in (design or {}).get("scenes") or [] if isinstance(s, dict) and s.get("layout") not in (None, "full")]
    for v in cd_view["viec_cua_ban"]:
        if v.get("y_do") in director.NHE_Y_DO or (v.get("nang_luong") or 0) < MIN_NL_CHECK:
            continue
        key = v.get("qd")
        q = {"source_id": v.get("source_id"), "nguon_tu": v.get("nguon_tu"), "nguon_den": v.get("nguon_den")}
        ok = any(_match(L, key, q, _f(L.get("src_start")), _f(L.get("src_end"), _f(L.get("src_start")))) for L in layers) \
            or any(_match(s, key, q, _f(s.get("src_start")), _f(s.get("src_end"))) for s in scenes)
        if ok:
            continue
        neo = v.get("neo") or {}
        out.append("lenh dao dien %s (%s %s, nang luong %s%s): \"%s\" — chua co lop / scene nao ghi \"qd\": %s%s" % (
            "hook" if key == "hook" else "doan %s" % key, v.get("y_do"), v.get("ten") or "", v.get("nang_luong"),
            (", neo '%s' gio nguon %.2f" % (neo.get("tu"), _f(neo.get("src_start")))) if neo.get("src_start") is not None
            else "", str(v.get("viec") or "")[:220], '"hook"' if key == "hook" else key,
            ' (anchor "hook")' if key == "hook" else ""))
    return out


def sfx_supplement(cd, audio, catalog, deliv):
    """Lenh B7 cua dao dien (nang luong >= 3) ma B7 bo sot -> code dat 1 tieng BO THE GIOI dung tu neo (ho tieng theo y do).
    Tra [muc audio moi] (dang muc B7: sfx_id + source_id + src_time + qd)."""
    world = ((cd or {}).get("am_thanh") or {}).get("the_gioi")
    if not world:
        return []
    by_id = {x.get("id"): x for x in catalog or [] if isinstance(x, dict)}
    out = []
    for m in missing(cd, deliv, bo_phan=("B7",)):
        fam = SFX_FAM.get(m["y_do"], "pop")
        sid = "kw-%s-%s" % (world, fam)
        if sid not in by_id:
            sid = "kw-%s-%s" % (world, "pop" if fam != "pop" else "click")
            if sid not in by_id:
                continue
        neo = m.get("neo") or {}
        t = _f(neo.get("src_start"), _f(m.get("nguon_tu")))
        t = t - RISER_LEAD if fam == "riser" else t - _f(by_id[sid].get("peak_time"), 0.0)
        # khong lui ra truoc doan (hook: truoc dau ban sao -> map_range lui ve than video, hook van im)
        t = max(_f(m.get("nguon_tu")), t)
        it = {"sfx_id": sid, "source_id": m.get("source_id"), "src_time": round(max(0.0, t), 3),
              "purpose": "accent", "qd": m["qd"], "_dd": True,
              "why": "lệnh đạo diễn %s (%s) — B7 chưa đặt" % (m.get("ten"), m.get("viec") or "")[:160]}
        if m.get("anchor") == "hook":
            it["anchor"] = "hook"
        out.append(it)
    return out


def fx_note(miss):
    """Ghi chu cho luot FX-bo-sung (fx_flow.gpt_fx_plan note=...)."""
    rows = ["- %s (khoanh khac %s): %s %s, nang luong %s, neo '%s' (gio nguon %s) — VIEC: %s" % (
        "hook" if m["qd"] == "hook" else "doan %s" % m["qd"], "h<n>" if m["qd"] == "hook" else "m%d" % (m["qd"] + 1),
        m["y_do"], m.get("ten") or "", m["nang_luong"], (m.get("neo") or {}).get("tu") or "",
        (m.get("neo") or {}).get("src_start"), m.get("viec")) for m in miss]
    return ("# LUOT BO SUNG LENH DAO DIEN\nCac lenh FX duoi day cua dao dien CHUA co hieu ung nao (buoc FX truoc bo sot / bi "
            "loai). Thiet ke DUNG 1 hieu ung cho MOI lenh, o dung khoanh khac, cham dung neo, ghi \"qd\" — KHONG dua vao "
            "bo_qua, khong lap lai hieu ung da co (da_co):\n" + "\n".join(rows))


# ---------------------------------------------------------------------------
# 2. KHUNG — lop dung nen (giai doan 3)
# ---------------------------------------------------------------------------
def body_events(segs, design=None, captions=None, fx_list=None):
    """Gio TIMELINE THAN VIDEO (chua tinh hook) cua cac nhip hinh do bo phan khac dat (lop vao, doi bo cuc, hieu ung, chu
    hero) — de lop dung khung biet doan nao da co thay doi, doan nao dung im."""
    rows = providers._ban_do_timeline(segs)

    def tl(sid, t):
        for r in rows:
            if r["source_id"] == sid and r["nguon_tu"] - 1e-3 <= t < r["nguon_den"] + 1e-3:
                return r["timeline_tu"] + (t - r["nguon_tu"])
        return None
    out = []
    for L in (design or {}).get("layers") or []:
        if isinstance(L, dict) and not _is_hook(L) and L.get("type") not in ("line",):
            out.append(tl(L.get("source_id") or (rows[0]["source_id"] if rows else None), _f(L.get("src_start"))))
    for s in (design or {}).get("scenes") or []:
        if isinstance(s, dict) and not _is_hook(s):
            out.append(tl(s.get("source_id"), _f(s.get("src_start"))))
    for c in (captions or {}).get("captions") or []:
        if isinstance(c, dict) and c.get("role") == "hero" and not _is_hook(c):
            out.append(tl(c.get("source_id"), _f(c.get("src_start"))))
    for e in fx_list or []:
        if isinstance(e, dict) and not _is_hook(e):
            out.append(tl(e.get("source_id"), _f(e.get("src_start"))))
    return sorted(t for t in out if t is not None)


_CAN_YDO = ("BUNG_NO", "MO_BE_LAI", "CHOT_TIEU_CUC")
_TRUNG_YDO = ("NHAN_TU_KHOA", "TIENG_LONG", "SO_LIEU", "MO_CAU_HOI", "DAN_MAT")
_RONG_YDO = ("DOI_KHONG_KHI", "CTA_KHEP", "MINH_HOA_Y", "TRUOC_SAU")


def apply_framing(segs, cd, events=None, hook=None):
    """Dat co canh (scale) + kieu zoom (zoom_ramp) + dong bang cho tung doan THAN VIDEO theo "khung" cua quyet dinh;
    doan khong ghi -> theo y do + LUAN PHIEN co canh; chong DUNG IM qua ho_so_nhip.dung_im_toi_da (doan khong co nhip hinh
    nao khac -> day cham). hook (plan["hook"]) -> khung cua hook_qd. Sua tai cho; tra [ghi chu]."""
    qds = (cd or {}).get("quyet_dinh") or []
    if not qds or not segs:
        return []
    prof = (cd or {}).get("ho_so_nhip") or director.profile_for(cd)
    zmax = float(prof.get("zoom_max") or 1.15)
    push = float(prof.get("day_cham") or 0.05)
    still = float(prof.get("dung_im_toi_da") or 4.0)
    shot = float(prof.get("cat_toi_thieu") or 2.0)
    trung = round(1.0 + 0.45 * (zmax - 1.0), 3)
    rows = providers._ban_do_timeline(segs)
    evs = sorted(list(events)) if events else []      # (Cython: sorted(x or []) trong ham co closure -> crash)
    notes, prev, since, prev_nl = [], 1.0, 0.0, None
    for i, s in enumerate(segs):
        if s.get("kind") in ("hook", "insert"):
            continue
        q = qds[i] if i < len(qds) and qds[i].get("segment") == i else next((x for x in qds if x.get("segment") == i), None)
        if not q:
            continue
        t0, t1 = _f(rows[i]["timeline_tu"]), _f(rows[i]["timeline_den"])
        kh, y = q.get("khung") or "", q.get("y_do")
        auto = not kh
        if auto:
            if y == "KHOANG_LANG":
                kh = "giu"
            elif y in _CAN_YDO:
                kh = "can"
            elif y in _RONG_YDO:
                kh = "rong"
            elif y in _TRUNG_YDO:
                kh = "trung" if prev < trung - 0.005 else "rong"
            else:                                   # NHIP_NEN: luan phien theo cau, khong doi qua nhanh
                kh = "giu" if t0 - since < shot else ("trung" if prev < trung - 0.005 else "rong")
        if prev_nl is not None and prev_nl >= 5 and kh in ("can", "day_cham"):
            kh = "nha"                              # bat buoc ha nhiet sau cao trao: khung sach, rong
        ramp = None
        if kh in ("rong", "nha"):
            target = 1.0
        elif kh == "trung":
            target = trung
        elif kh == "can":
            target = zmax
        elif kh == "day_cham":
            target, ramp = round(min(zmax, prev + push), 3), "slow"
        else:                                       # giu / dong_bang
            target = prev
        # CHONG DUNG IM: khung khong doi + khong co nhip hinh nao cua bo phan khac qua dung_im_toi_da -> day cham (hoac
        # lui cham neu da sat zoom_max). Khoang lang co chu dich duoc tho lau hon (x1.5)
        last_ev = max([e for e in evs if e <= t1] or [-1e9])
        lim = still * (1.5 if y == "KHOANG_LANG" else 1.0)
        if abs(target - prev) < 0.005 and t1 - max(since, last_ev) > lim:
            if prev + push <= zmax + 1e-6:
                target, ramp = round(prev + push, 3), "slow"
            else:
                target, ramp = round(max(1.0, prev - push), 3), "slow"
            notes.append("đoạn %d: khung đứng im %.1fs > %.1fs -> %s chậm" % (
                i, t1 - max(since, last_ev), lim, "đẩy vào" if target > prev else "lùi ra"))
        s["scale"] = round(target, 3)
        s.pop("zoom_ramp", None)
        if ramp:
            s["zoom_ramp"] = ramp
        if kh == "dong_bang":
            s["freeze"] = {"src": round(_f(s.get("start")), 3), "dur": FREEZE_SEC}
        else:
            s.pop("freeze", None)
        if abs(target - prev) >= 0.005:
            since = t0
        prev, prev_nl = target, q.get("nang_luong")
        if auto and kh != "giu":
            q["_khung_code"] = kh
    hq = (cd or {}).get("hook_qd")
    if isinstance(hook, dict) and isinstance(hq, dict):
        kh = hq.get("khung") or "can"
        hook["scale"] = {"rong": 1.0, "nha": 1.0, "trung": trung, "can": zmax}.get(kh, 1.0)
        hook.pop("zoom_ramp", None)
        hook.pop("freeze", None)
        if kh == "day_cham":
            hook["scale"], hook["zoom_ramp"] = round(1.0 + 2 * push, 3), "slow"
        if kh == "dong_bang":
            hook["freeze"] = {"src": round(_f(hook.get("src_start")), 3), "dur": FREEZE_SEC}
    return notes


def focus_items(cd, accent=None):
    """Lenh "nen" (lam_toi / lam_mo / giam_mau) + vien quanh nguoi (dong bang / MO_DINH_DANH) cua quyet dinh -> muc plan
    gio NGUON: (bg_focus[], subject_fx[]). build_spec quy ra gio timeline."""
    bg, sub = [], []
    col = accent or "#FFD54A"
    for key, q in decisions(cd):
        a, b = _f(q.get("nguon_tu")), _f(q.get("nguon_den"))
        neo = q.get("neo") or {}
        t0 = _f(neo.get("src_start"), a) if neo.get("src_start") is not None else a
        t1 = max(_f(neo.get("src_end"), t0) + 1.2, t0 + 1.6)
        row = {"source_id": q.get("source_id"), "src_start": round(max(a, t0 - 0.15), 3), "src_end": round(min(b, t1), 3),
               "qd": key}
        if key == "hook":
            row["anchor"] = "hook"
        if q.get("nen") in BG_FOCUS and row["src_end"] - row["src_start"] >= 0.5 and q.get("y_do") != "KHOANG_LANG":
            bg.append(dict(row, kieu=q["nen"]))
        if q.get("khung") == "dong_bang" or (q.get("y_do") == "MO_DINH_DANH" and q.get("nang_luong", 0) >= 3):
            s0 = a if q.get("khung") == "dong_bang" else row["src_start"]
            sub.append(dict(row, src_start=round(s0, 3), src_end=round(min(b, s0 + 1.6), 3), color=col))
    return bg, sub


def accent_hex(cd):
    """Ma mau nhan dao dien ghi trong mau_nhan ('vang sap #FFC93C ...') -> '#FFC93C' | None."""
    import re
    m = re.search(r"#[0-9A-Fa-f]{6}\b", str((cd or {}).get("mau_nhan") or ""))
    return m.group(0).upper() if m else None


# ---------------------------------------------------------------------------
# 3. DO TREN BAN DUNG
# ---------------------------------------------------------------------------
def energy_windows(plan, map_range):
    """[(t0, t1, nang_luong)] gio TIMELINE: ban sao hook (nang luong hook_qd) + tung doan than video (quyet dinh; ban chi dao
    cu khong co bang quyet dinh -> theo nhip). Dung cho muc tieng chu theo nang luong (plan_guard.mix_sfx)."""
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    out = []
    # CHI ban chi dao co bang quyet dinh (v5): du an cu mo lai giu nguyen muc tieng da duyet
    items = [(q.get("source_id"), q.get("nguon_tu"), q.get("nguon_den"), q.get("nang_luong"))
             for q in cd.get("quyet_dinh") or [] if isinstance(q, dict)]
    for sid, a, b, nl in items:
        try:
            hit = map_range(plan, sid, float(a), float(b), "body")
        except Exception:
            hit = None
        if hit and nl:
            out.append((float(hit[0]), float(hit[1]), int(nl)))
    hq = cd.get("hook_qd") if isinstance(cd.get("hook_qd"), dict) else None
    hk = plan.get("hook") if isinstance(plan.get("hook"), dict) else None
    if hq and hk and hk.get("src_start") is not None:
        try:
            hit = map_range(plan, hk.get("source_id"), float(hk["src_start"]), float(hk["src_end"]), "hook")
        except Exception:
            hit = None
        if hit:
            out.append((float(hit[0]), float(hit[1]), int(hq.get("nang_luong") or 4)))
    return sorted(out)


def energy_at(windows, t):
    for a, b, nl in windows or []:
        if a - 1e-3 <= t < b + 1e-3:
            return nl
    return None


def micro_db(nl, prof):
    """Chenh muc (dB) tieng chu / tieng phu o doan nang luong `nl` (tai lieu: am thanh vi mo o nhip thap)."""
    m = float((prof or {}).get("tieng_vi_mo_db") or -10.0)
    return {1: m, 2: 0.75 * m, 3: 0.35 * m}.get(int(nl or 4), 0.0)


def _events(spec, plan):
    import hook_rule
    ev = [e for e in hook_rule.measure(spec, plan) if e.get("kind") != "cut"]
    clips = [c for c in spec.get("clips") or [] if isinstance(c, dict)]
    for c0, c1 in zip(clips, clips[1:]):     # cat chi tinh khi co canh / chat lieu doi ro (jump-cut cung co ~ khong thay)
        if c1.get("kind") == "insert" or c0.get("kind") == "insert" or abs(_f(c1.get("scale"), 1) - _f(c0.get("scale"), 1)) >= 0.04:
            ev.append({"id": c1.get("id"), "kind": "cut", "t0": _f(c1.get("start")), "t1": _f(c1.get("start")) + 0.1,
                       "s": 0.8, "full": True})
    for c in clips:
        if c.get("zoomFrom") is not None and abs(_f(c.get("scale"), 1) - _f(c.get("zoomFrom"), 1)) >= 0.03:
            d = abs(_f(c.get("scale"), 1) - _f(c.get("zoomFrom"), 1))
            dur = max(0.1, _f(c.get("zoomDur"), 0.5))
            ev.append({"id": c.get("id"), "kind": "zoom", "t0": _f(c.get("start")), "t1": _f(c.get("start")) + dur,
                       "s": round(min(1.2, d * 6.0 * min(1.0, 1.2 / dur) + 0.3), 2), "full": True})
        for w in c.get("freezes") or []:
            ev.append({"id": c.get("id"), "kind": "dong_bang", "t0": _f(w.get("start")), "t1": _f(w.get("end")),
                       "s": 0.9, "full": True})
    prev = None
    for sc in spec.get("scenes") or []:
        if sc.get("layout") != prev:
            ev.append({"id": sc.get("id"), "kind": "bo_cuc", "t0": _f(sc.get("start")), "t1": _f(sc.get("start")) + 0.4,
                       "s": 0.7, "full": True})
        prev = sc.get("layout")
    for c in spec.get("captions") or []:
        if c.get("role") in ("hero", "micro"):
            ev.append({"id": c.get("id"), "kind": "chu_nhan", "t0": _f(c.get("start")), "t1": _f(c.get("start")) + 0.4,
                       "s": 0.5, "full": False})
    for o in spec.get("overlays") or []:
        ev.append({"id": o.get("id"), "kind": "meme", "t0": _f(o.get("start")), "t1": _f(o.get("end")), "s": 0.8,
                   "full": False})
    for w in spec.get("bgFocus") or []:
        ev.append({"id": "bg", "kind": "nen", "t0": _f(w.get("start")), "t1": _f(w.get("start")) + 0.4, "s": 0.5,
                   "full": True})
    return sorted(ev, key=lambda e: e["t0"])


def spec_range(spec, sid, a, b, kind="body"):
    """Khoang gio NGUON [a, b] cua source sid -> (dau, cuoi) tren timeline BAN DUNG CUOI (clip spec co sourceId: da gom
    hook + meme cat vao + cat khoang lang). Khong co phan nao con tren timeline -> None."""
    lo, hi = None, None
    for c in spec.get("clips") or []:
        if c.get("kind") != kind or (sid and c.get("sourceId") not in (None, sid)):
            continue
        sp = _f(c.get("speed"), 1.0) or 1.0
        s0 = _f(c.get("srcStart"))
        s1 = s0 + (_f(c.get("end")) - _f(c.get("start"))) * sp
        x0, x1 = max(a, s0), min(b, s1)
        if x1 - x0 <= 0.02:
            continue
        t0 = _f(c.get("start")) + (x0 - s0) / sp
        t1 = _f(c.get("start")) + (x1 - s0) / sp
        lo = t0 if lo is None else min(lo, t0)
        hi = t1 if hi is None else max(hi, t1)
    return (round(lo, 3), round(hi, 3)) if lo is not None else None


def _corr(xs, ys):
    if len(xs) < 3:
        return None
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not sx or not sy:
        return None
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy), 2)


def _active(spec, t):
    """Phan tu dang CHUYEN DONG / moi vao tai giay t (khong tinh phu de, lop dang dung yen)."""
    out = []
    for L in spec.get("layers") or []:
        st = _f(L.get("start"))
        dur = _f((L.get("enter") or {}).get("duration"), 0.4) if isinstance(L.get("enter"), dict) else 0.4
        moving = bool(L.get("keyframes")) and st <= t <= _f(L.get("end"), st)
        if st - 0.05 <= t <= st + dur + 0.25 or moving:
            out.append(("layer", L.get("id")))
    for e in spec.get("fx") or []:
        if _f(e.get("start")) <= t <= _f(e.get("end")):
            out.append(("fx", e.get("id")))
    for e in spec.get("fxTransforms") or []:
        if _f(e.get("start")) <= t <= _f(e.get("end")):
            out.append(("fxt", e.get("id")))
    for o in spec.get("overlays") or []:
        if _f(o.get("start")) <= t <= _f(o.get("end")):
            out.append(("meme", o.get("id")))
    for c in spec.get("captions") or []:
        if c.get("role") == "hero" and _f(c.get("start")) - 0.05 <= t <= _f(c.get("start")) + 0.6:
            out.append(("hero", c.get("id")))
    return out


def measure(spec, plan, map_range=None):
    """Bao cao giam sat tren BAN DUNG cuoi: nang luong that theo doan vs nang luong dao dien dat, doan diem nhan khong co
    nhip hinh nao, khoang dung im, qua tai. Gio quy doi tren CLIP cua spec (spec_range) — plan cua autoplan chi co than
    video (hook / meme cat vao chi dung trong build_spec). Tra dict (rong neu khong co bang quyet dinh)."""
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    qds = [q for q in cd.get("quyet_dinh") or [] if isinstance(q, dict)]
    if not qds or not isinstance(spec, dict):
        return {}
    prof = cd.get("ho_so_nhip") or director.profile_for(cd)
    ev = _events(spec, plan)
    rows, xs, ys = [], [], []
    for q in qds:
        hit = spec_range(spec, q.get("source_id"), _f(q.get("nguon_tu")), _f(q.get("nguon_den")))
        if not hit:
            continue
        a, b = hit
        dur = max(0.5, b - a)
        inside = [e for e in ev if a - 0.05 <= e["t0"] < b]
        dens = round(sum(e["s"] for e in inside) / dur, 2)
        peak = max([e["s"] for e in inside] or [0.0])
        rows.append({"qd": q["segment"], "y_do": q["y_do"], "nang_luong": q["nang_luong"], "tu": round(a, 2),
                     "den": round(b, 2), "mat_do": dens, "manh_nhat": round(peak, 2), "so_nhip": len(inside)})
        if b - a >= 0.8:
            xs.append(q["nang_luong"])
            ys.append(dens)
    low = sorted(r["mat_do"] for r in rows if r["nang_luong"] <= 2)
    med_low = low[len(low) // 2] if low else 0.0
    yeu = [r for r in rows if r["nang_luong"] >= 4 and r["y_do"] not in director.NHE_Y_DO
           and (r["manh_nhat"] < 0.5 or r["mat_do"] < med_low)]
    # dung im (than video, ngoai khoang lang cua dao dien)
    hook_end = max([_f(c.get("end")) for c in spec.get("clips") or [] if c.get("kind") == "hook"] or [0.0])
    dur_all = _f(spec.get("duration"))
    quiet = [w for w in (spec_range(spec, k.get("source_id"), _f(k.get("src_start")) - 0.1, _f(k.get("src_end")) + 0.25)
                         for k in cd.get("khoang_lang") or [] if isinstance(k, dict)) if w]
    still = float(prof.get("dung_im_toi_da") or 4.0)
    iv = sorted((max(hook_end, e["t0"] - 0.1), e["t1"] + 0.1) for e in ev if e["s"] >= 0.45 and e["t1"] > hook_end)
    gaps, cur = [], hook_end
    for x0, x1 in iv + [(dur_all, dur_all)]:
        if x0 - cur > still:
            inq = sum(max(0.0, min(x0, w1) - max(cur, w0)) for w0, w1 in quiet)
            if inq < 0.5 * (x0 - cur):
                gaps.append([round(cur, 2), round(x0, 2)])
        cur = max(cur, x1)
    # qua tai
    cap = int(prof.get("tai_toi_da") or 2) + 1
    over, t = [], hook_end          # hook: luat hook rieng (phai day nhip) -> khong xet qua tai
    while t < dur_all:
        act = _active(spec, t)
        if len(act) > cap:
            over.append((round(t, 2), act))
        t += 0.25
    return {"tuong_quan": _corr(xs, ys), "doan": rows,
            "diem_nhan_yeu": [{k: r[k] for k in ("qd", "y_do", "nang_luong", "mat_do", "manh_nhat")} for r in yeu],
            "dung_im": gaps, "dung_im_toi_da": still,
            "qua_tai": [{"t": t_, "so": len(a_), "phan_tu": [x[1] for x in a_][:8]} for t_, a_ in over],
            "tai_toi_da": cap}


def fix_static(plan, spec, rep):
    """Khoang DUNG IM con lai tren ban dung cuoi (> dung_im_toi_da, ngoai khoang lang) -> doan than video chua giua khoang
    do day cham (hoac lui cham khi da sat zoom_max) suot doan. Sua plan["segments"] tai cho; tra [ghi chu]."""
    notes = []
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    if not rep or not rep.get("dung_im") or not cd:
        return notes
    prof = cd.get("ho_so_nhip") or director.profile_for(cd)
    zmax, push = float(prof.get("zoom_max") or 1.15), float(prof.get("day_cham") or 0.05)
    segs = plan.get("segments") or []
    for a, b in rep["dung_im"]:
        mid = (a + b) / 2.0
        c = next((c for c in spec.get("clips") or [] if c.get("kind") == "body" and _f(c.get("start")) <= mid < _f(c.get("end"))),
                 None)
        if not c:
            continue
        t_src = _f(c.get("srcStart")) + (mid - _f(c.get("start"))) * (_f(c.get("speed"), 1.0) or 1.0)
        j = next((i for i, s in enumerate(segs) if s.get("source_id") in (None, c.get("sourceId"))
                  and _f(s.get("start")) - 0.02 <= t_src <= _f(s.get("end")) + 0.02), None)
        if j is None or segs[j].get("zoom_ramp") == "slow":
            continue
        prev = _f(segs[j - 1].get("scale"), 1.0) if j > 0 else 1.0
        tgt = prev + push if prev + push <= zmax + 1e-6 else max(1.0, prev - push)
        segs[j]["scale"], segs[j]["zoom_ramp"] = round(tgt, 3), "slow"
        notes.append("đứng im %.1f-%.1fs -> đoạn %d %s chậm (%.2f -> %.2f)" % (
            a, b, j, "đẩy vào" if tgt > prev else "lùi ra", prev, tgt))
    return notes


_DROP_ORDER = ("box", "line", "circle", "arrow", "ring", "progress", "image", "badge", "counter", "text")


def relieve_overload(plan, spec, rep, max_drop=3):
    """Qua tai (> tai_toi_da + 1 phan tu chuyen dong cung luc) keo dai >= 0.5s -> bo lop PHU nhat gay qua tai (khong bo
    lop thuc hien quyet dinh (qd), lop hook, tu lieu, mau Kho Text). Sua plan tai cho; tra [ghi chu]."""
    notes = []
    if not rep or not rep.get("qua_tai"):
        return notes
    by_spec = {L.get("id"): L for L in spec.get("layers") or []}
    counts = {}
    for row in rep["qua_tai"]:
        for lid in row["phan_tu"]:
            counts[lid] = counts.get(lid, 0) + 1
    plan_layers = {str(L.get("id")): L for L in plan.get("layers") or [] if isinstance(L, dict)}
    um_ids = {str(it.get("id")) for it in plan.get("user_media") or [] if isinstance(it, dict)} \
        if isinstance(plan.get("user_media"), list) else set()
    cand = []
    for lid, n in counts.items():
        if n < 2:                                   # < 0.5s qua tai thi bo qua
            continue
        # id lop spec = "<id plan>_<so thu tu>" (motion_design.layers_to_spec)
        L = plan_layers.get(str(lid)) or plan_layers.get(str(lid).rsplit("_", 1)[0])
        if not L or L.get("qd") is not None or _is_hook(L) or L.get("um") or L.get("user_media") \
                or str(L.get("asset")) in um_ids or L.get("type") == "tpl":
            continue
        typ = (by_spec.get(lid) or L).get("type") or "text"
        rank = _DROP_ORDER.index(typ) if typ in _DROP_ORDER else len(_DROP_ORDER)
        cand.append((rank, -n, L.get("id")))
    drop = [c[2] for c in sorted(cand)[:max_drop]]
    if drop:
        plan["layers"] = [L for L in plan.get("layers") or [] if not (isinstance(L, dict) and L.get("id") in drop)]
        notes.append("quá tải (> %d phần tử chuyển động cùng lúc) -> bỏ lớp phụ %s" % (rep.get("tai_toi_da", 3) - 1,
                                                                                    ", ".join(map(str, drop))))
    return notes


def summary(rep, deliv_before=None, deliv_after=None):
    """1 dong tom tat cho nhat ky / UI."""
    if not rep:
        return ""
    parts = []
    if rep.get("tuong_quan") is not None:
        parts.append("tương quan năng lượng chỉ đạo ↔ bản dựng %+.2f" % rep["tuong_quan"])
    parts.append("%d điểm nhấn còn yếu" % len(rep.get("diem_nhan_yeu") or []))
    parts.append("%d khoảng đứng im > %.1fs" % (len(rep.get("dung_im") or []), rep.get("dung_im_toi_da") or 0))
    parts.append("quá tải %.1fs" % (0.25 * len(rep.get("qua_tai") or [])))
    if deliv_after is not None:
        tot = sum(len(v) for v in deliv_after.values())
        ok = sum(1 for v in deliv_after.values() for x in v.values() if x)
        parts.append("việc đạo diễn giao đã làm %d/%d" % (ok, tot))
    return ", ".join(parts)
