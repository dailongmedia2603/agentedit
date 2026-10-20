# -*- coding: utf-8 -*-
"""LUAT NHIP THAN VIDEO (user 2026-10-20: "video phai co nhip va thu hut, noi binh binh de chan"; hook da co luat nhip
rieng — hook_rule — than video truoc day khong co: nhip phu thuoc so lop do hoa R4 tu chon).

DO tren spec that: moi lan HINH thay doi o than video (doi bo cuc, lop do hoa / chu nhan vao, hieu ung tu viet, hieu ung
kho, meme cat vao, jump-cut doi khung). Khoang DUNG IM (khong co thay doi nao) dai hon nguong (theo muc: nhe 9s, con lai
6s) -> AI (buoc "Nhip-than", theo hook_fx.LUAT_Y_NGHIA) chon cho TUNG khoang: them CHU NHAN dung tu khoa dang noi (co muc
dich) HOAC giu lang CO CHU DICH (ghi ly do). KHONG nhoi hinh vo nghia de lap cho trong.
"""
import json

import hook_fx
import providers

VERSION = 2                  # 2 = biet chu gan day (khong lap) + cum phai tu dung duoc nghia (do that 10-20)
GAP = {"nhe": 9.0, "vua": 6.0, "manh": 6.0}
NEAR = 10.0                  # chu do hoa trong +-10s quanh khoang: khong duoc lap
MIN_SCALE_JUMP = 0.03

_PROMPT = """Ban la BIEN TAP VIEN NHIP. Video short de bi luot khi hinh DUNG IM lau. Duoi day la cac KHOANG DUNG IM trong than
video (khong doi bo cuc, khong chu nhan, khong hieu ung) kem loi noi trong khoang do.
""" + hook_fx.LUAT_Y_NGHIA + """
Voi MOI khoang, chon MOT:
- "chu_nhan": dua TU KHOA / con so / cum chot DANG NOI trong khoang (1-4 tu, chep dung tu nguoi noi, tieng Viet co dau) len
  man hinh dung luc noi — CHI khi cum do mang thong tin / cam xuc chinh cua doan (nguoi xem nho y hon). "tu_luc" / "den_luc"
  = gio NGUON cua cum (lay tu tu_trong_khoang), dai 1-2.5s.
  Cum phai TU DUNG DUOC NGHIA khi doc mot minh (danh tu / con so / ket qua / tinh trang ro rang: "MẤT KHÁCH", "24/24",
  "HOÀN TIỀN") — KHONG cat nua cau ("áp dụng con người", "không được ok lắm" = sai). KHONG lap tu / Y cua "chu_gan_day"
  (chu do hoa da hien +-10s); da co roi -> "giu_lang".
- "giu_lang": giu nguyen CO CHU DICH (doan tam su / xuc dong can khoang lang, hoac khong co cum nao dang nhan) — ghi ly do.
Khong tao chu cho co: cum chung chung / tu dem -> "giu_lang".
SCHEMA (CHI JSON): {"khoang": [{"id": 0, "lam": "chu_nhan", "chu": "...", "tu_luc": 61.2, "den_luc": 62.8,
"muc_dich": "...", "ly_do": "..."}]}
⚠️ TRA VE CHI JSON GOC."""


def _src_at(spec, t, sid_by_path=None):
    """Gio timeline -> (source_id, gio nguon) theo clip A-roll dang chay (clip spec chi co path). None neu meme / khong co."""
    for c in spec.get("clips") or []:
        if c.get("kind") in ("hook", "body") and c["start"] <= t < c["end"]:
            sid = c.get("sourceId") or c.get("source_id") or (sid_by_path or {}).get(c.get("path"))
            return sid, float(c.get("srcStart") or 0) + (t - c["start"]) * float(c.get("speed") or 1.0)
    return None


def events(spec):
    """Gio timeline cac lan HINH thay doi (khong tinh phu de)."""
    ev = []
    for s in spec.get("scenes") or []:
        ev += [float(s["start"]), float(s["end"])]
    for L in spec.get("layers") or []:
        ev.append(float(L.get("start", 0)))
    for k in ("fx", "fxTransforms", "effects"):
        for e in spec.get(k) or []:
            ev.append(float(e.get("start", 0)))
    clips = [c for c in spec.get("clips") or []]
    for a, b in zip(clips, clips[1:]):
        if b.get("kind") == "insert" or a.get("kind") == "insert" or abs(
                float(b.get("scale") or 1) - float(a.get("scale") or 1)) >= MIN_SCALE_JUMP:
            ev.append(float(b["start"]))
    return sorted(set(round(x, 2) for x in ev))


COVER_LAYOUTS = ("split", "broll", "graphic", "card", "circle")


def gaps(spec, limit):
    """Khoang dung im > limit trong than video: [(t0, t1)]. Thoi gian dang co canh chia doi / B-roll / do hoa KHONG tinh la
    dung im (dang co hinh minh hoa — do that 10-20: chu nhan nhip dat de len anh nua tren canh chia doi)."""
    hook_end = max([float(c["end"]) for c in spec.get("clips") or [] if c.get("kind") == "hook"] or [0.0])
    end = float(spec.get("duration") or 0) - 1.0
    pts = [hook_end] + [t for t in events(spec) if hook_end < t < end] + [end]
    cover = [(float(s["start"]), float(s["end"])) for s in spec.get("scenes") or [] if s.get("layout") in COVER_LAYOUTS]
    out = []
    for a, b in zip(pts, pts[1:]):
        segs = [(a, b)]
        for c0, c1 in cover:                      # tru phan dang co canh minh hoa
            nxt = []
            for x, y in segs:
                if c1 <= x or c0 >= y:
                    nxt.append((x, y))
                    continue
                if x < c0:
                    nxt.append((x, c0))
                if c1 < y:
                    nxt.append((c1, y))
            segs = nxt
        out += [(round(x, 2), round(y, 2)) for x, y in segs if y - x > limit]
    return out


def design(spec, plan, gs, story, log=None):
    asr = plan.get("asr_words") if isinstance(plan.get("asr_words"), dict) else {}
    by_path = {sv.get("path"): sv.get("id") for sv in plan.get("source_videos") or [] if isinstance(sv, dict)}
    rows = []
    for i, (a, b) in enumerate(gs):
        s0, s1 = _src_at(spec, a + 0.2, by_path), _src_at(spec, b - 0.2, by_path)
        if not s0 or not s1 or s0[0] != s1[0]:
            continue
        sid, x0, x1 = s0[0], s0[1], s1[1]
        words = [[w[0], round(float(w[1]), 2)] for w in asr.get(sid) or [] if x0 <= float(w[1]) <= x1]
        near = [" ".join(str(sp.get("text") or "") for sp in L.get("spans") or [] if isinstance(sp, dict)).strip()
                for L in spec.get("layers") or [] if L.get("type") == "text" and a - NEAR <= float(L.get("start", 0)) <= b + NEAR]
        rows.append({"id": i, "source_id": sid, "gio_nguon": [round(x0, 2), round(x1, 2)], "dai_giay": round(b - a, 1),
                     "tu_trong_khoang": words[:120], "chu_gan_day": [t for t in near if t][:12]})
    if not rows:
        return {}, rows
    if log:
        log("Nhip than video: %s xet %d khoang dung im..." % (providers.plan_ai_name(), len(rows)))
    text = providers.plan_chat([{"role": "system", "content": _PROMPT},
                                {"role": "user", "content": json.dumps({"cau_chuyen": story or {}, "khoang_dung_im": rows},
                                                                       ensure_ascii=False)}],
                               json_mode=True, max_tokens=4000, temperature=0.3, req_timeout=300, max_attempts=2,
                               step_label="Nhip-than")
    return providers._safe_json(text) or {}, rows


def apply(plan, res, rows, log=None):
    """Them chu nhan da chon (theo mau / font cua video). Tra so chu da them."""
    say = log or (lambda m: None)
    by = {r["id"]: r for r in rows}
    kit = plan.get("style_kit") if isinstance(plan.get("style_kit"), dict) else {}
    pal, fonts = kit.get("palette") or {}, kit.get("fonts") or {}
    n = 0
    for d in (res or {}).get("khoang") or []:
        if not isinstance(d, dict) or d.get("id") not in by:
            continue
        r = by[d["id"]]
        if d.get("lam") != "chu_nhan":
            say("Nhip: khoang %.1fs giu lang co chu dich — %s" % (r["dai_giay"], str(d.get("ly_do"))[:140]))
            continue
        chu = str(d.get("chu") or "").strip()
        if not chu or len(chu.split()) > 5 or len(str(d.get("muc_dich") or "")) < 8:
            say("Nhip: bo chu nhan khong ro muc dich '%s'" % chu)
            continue
        import body_visual
        if body_visual._dup_text(chu, r.get("chu_gan_day") or []):
            say("Nhip: bo chu nhan '%s' — lap chu do hoa gan day" % chu)
            continue
        a = min(max(providers._f(d.get("tu_luc"), r["gio_nguon"][0]), r["gio_nguon"][0]), r["gio_nguon"][1] - 0.8)
        b = min(max(providers._f(d.get("den_luc"), a + 1.6), a + 1.0), a + 2.5)
        L = {"id": "nh%d" % d["id"], "type": "text", "source_id": r["source_id"], "src_start": round(a, 3),
             "src_end": round(b, 3), "x": 0.5, "y": 0.72, "track": 40, "replaces_subtitle": True, "uppercase": True,
             "sfx": "pop", "why": "nhip than video: %s" % str(d.get("muc_dich"))[:160],
             "spans": [{"text": chu, "size": 112, "color": pal.get("text") or "#FFFFFF",
                        "stroke": {"color": pal.get("primary") or "#0B1220", "width": 7}}],
             "enter": {"preset": "pop", "duration": 0.3}, "exit": {"preset": "fade", "duration": 0.2}}
        if fonts.get("impact"):
            L["font"] = fonts["impact"]
        plan["layers"] = [x for x in plan.get("layers") or [] if x.get("id") != L["id"]] + [L]
        say("Nhip: them chu nhan '%s' (khoang %.1fs dung im) — %s" % (chu, r["dai_giay"], str(d.get("muc_dich"))[:120]))
        n += 1
    return n
