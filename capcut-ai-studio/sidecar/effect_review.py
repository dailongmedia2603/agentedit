# -*- coding: utf-8 -*-
"""CONG KIEM DUYET Y NGHIA CHO TOAN BO PLAN (THU NGHIEM, CHUA NOI VAO APP — user 2026-10-20: "moi hieu ung khi chen tren
video deu phai co muc dich va y nghia, phu hop boi canh + chu de video, dam bao ngay khi lap plan; bao gom TOAN BO video").

Sau khi cac buoc thiet ke da tao plan (FX tu viet, lop do hoa / chu nhan R4, SFX B7, meme B6, hinh minh hoa), MOT bien tap
vien AI duyet TUNG muc chen len video theo LUAT Y NGHIA (hook_fx.LUAT_Y_NGHIA): muc dich, dung nghia, thuoc the gioi cau
chuyen, khop sac thai, khong thua. Muc KHONG dat -> bo khoi plan (ghi ly do). KHONG sua / doi muc nao (khong "chua chay").
Hook (anchor hook / luat hook) va phu de / chu tu gan tieng khong xet o day (da co luat rieng).
"""
import json

import hook_fx
import providers

TIEU_CHI = ("muc_dich", "dung_nghia", "phu_hop_chu_de", "khop_sac_thai", "khong_thua")
DIEM_DAT = 3                  # tieu chi < 3/5 -> bo (nghiem nhung khong cat tran lan chu nhan / tieng can thiet)

_PROMPT = """Ban la BIEN TAP VIEN TRUONG duyet ban ke hoach edit truoc khi render. Moi muc trong "muc" la mot thu se CHEN len
video (hieu ung hinh, lop do hoa, chu nhan, am thanh SFX, meme). Ban KHONG thiet ke lai, chi quyet dinh GIU hay BO.
""" + hook_fx.LUAT_Y_NGHIA + """
Cach duyet: doc cau_chuyen (chu de, mach truyen) truoc. Voi MOI muc, doc loi_noi luc do + mo ta muc + ly do nguoi lap ke
hoach ghi, cham 1-5:
- "muc_dich": co muc dich ro (lam ro thong tin / nhan buoc ngoat / cam xuc o dinh / minh hoa hanh dong; voi SFX: lam ro
  hanh dong / nhip / cam xuc dang dien ra); bo di thi MAT dieu do.
- "dung_nghia": khop Y cua cau dang noi (khong choi chu 1 tu, khong lac y).
- "phu_hop_chu_de": thuoc the gioi cau chuyen / tone video; khong ky cuc, khong lac de.
- "khop_sac_thai": cam xuc / mau / chuyen dong / tieng khop sac thai cau (khong vui nhon o cau buon, khong dap manh o cau
  tam su...).
- "khong_thua": khong trung y voi muc khac gan do, khong chen vao cau dem / chao hoi / chuyen y nho, khong day dac lam roi.
Chu nhan (text) nhac lai TU KHOA dang noi de nguoi xem nam y = co muc dich (lam ro thong tin) neu dung tu quan trong.
SFX di kem chuyen dong / chu hien = co muc dich neu khop hanh dong do. "giu": false khi bat ky tieu chi < 3.
SCHEMA (CHI JSON): {"danh_gia": [{"id": "<id muc>", "diem": {"muc_dich": 1, "dung_nghia": 1, "phu_hop_chu_de": 1,
"khop_sac_thai": 1, "khong_thua": 1}, "giu": true, "ly_do": "<ngan, cu the>"}]}
⚠️ TRA VE CHI JSON GOC, du MOI id."""


def _speech(td, sid, t0, t1):
    try:
        return " ".join(x.get("text", "") for x in providers._gon_loi_thoai((td or {}).get(sid), t0, t1) or [])[:200]
    except Exception:
        return ""


def collect(plan, td):
    """Moi muc chen len THAN video (khong hook, khong phu de): [{id, loai, gio, mo_ta, ly_do, loi_noi}]."""
    out = []
    f = providers._f

    def hook(x):
        return x.get("anchor") == "hook" or x.get("_hook_rule") or x.get("_hook_visual")
    for i, e in enumerate(plan.get("fx") or []):
        if isinstance(e, dict) and not hook(e):
            out.append({"id": "fx:%s" % e.get("id"), "loai": "hieu_ung_" + str(e.get("kind")),
                        "gio_nguon": [f(e.get("src_start")), f(e.get("src_end"))],
                        "mo_ta": str(e.get("visual") or "")[:260], "ly_do": str(e.get("why_fit") or e.get("y_nghia") or "")[:200],
                        "_k": ("fx", e.get("id"))})
    for i, L in enumerate(plan.get("layers") or []):
        if not isinstance(L, dict) or hook(L) or L.get("hook_visual"):
            continue          # hinh minh hoa (hook_visual / body_visual) da qua 2 luot thiet ke + kiem duyet rieng
        txt = " ".join(str(s.get("text") or "") for s in L.get("spans") or [] if isinstance(s, dict)) or L.get("text") or ""
        out.append({"id": "lop:%d" % i, "loai": "lop_" + str(L.get("type")),
                    "gio_nguon": [f(L.get("src_start")), f(L.get("src_end"))],
                    "mo_ta": ("chu '%s'" % txt[:60] if txt else "hinh %s %s" % (L.get("type"), L.get("asset") or ""))[:200],
                    "ly_do": str(L.get("why") or "")[:200], "_k": ("layer", i)})
    for i, a in enumerate(plan.get("audio") or []):
        if not isinstance(a, dict) or hook(a) or (a.get("role") or "sfx") == "bgm" or a.get("_auto_text") or a.get("_split"):
            continue
        out.append({"id": "sfx:%d" % i, "loai": "am_thanh",
                    "gio_nguon": [f(a.get("src_time")), f(a.get("src_time"))],
                    "mo_ta": "tieng %s (%s)" % (a.get("_name") or a.get("sfx_id"), a.get("purpose") or ""),
                    "ly_do": str(a.get("why") or "")[:200], "_k": ("audio", i)})
    for i, m in enumerate(plan.get("inserts") or []):
        if isinstance(m, dict):
            out.append({"id": "meme:%d" % i, "loai": "meme_chen", "gio_nguon": [f(m.get("src_time") or m.get("at")), 0],
                        "mo_ta": "meme '%s'" % (m.get("_name") or m.get("meme_id")), "ly_do": str(m.get("why") or "")[:200],
                        "_k": ("inserts", i)})
    for it in out:
        it["loi_noi"] = _speech(td, (plan.get("source_videos") or [{}])[0].get("id"), it["gio_nguon"][0] - 0.3,
                                max(it["gio_nguon"][1], it["gio_nguon"][0]) + 0.5)
    return out


def review(items, story=None, log=None, batch=60):
    res = {}
    for i in range(0, len(items), batch):
        part = [{k: v for k, v in it.items() if k != "_k"} for it in items[i:i + batch]]
        if log:
            log("Kiem duyet y nghia: %s duyet %d muc (%d/%d)..." % (providers.plan_ai_name(), len(part), i + len(part),
                                                                    len(items)))
        text = providers.plan_chat([{"role": "system", "content": _PROMPT},
                                    {"role": "user", "content": json.dumps({"cau_chuyen": story or {}, "muc": part},
                                                                           ensure_ascii=False)}],
                                   json_mode=True, max_tokens=12000, temperature=0.2, req_timeout=400, max_attempts=2,
                                   step_label="Kiem-duyet-y-nghia")
        for r in (providers._safe_json(text) or {}).get("danh_gia") or []:
            if isinstance(r, dict) and r.get("id"):
                res[r["id"]] = r
    return res


def apply(plan, items, res):
    """Bo cac muc KHONG dat. Muc AI khong cham -> giu (khong bo vi thieu danh gia). Tra (giu, bo) [(muc, danh_gia)]."""
    drop = {"fx": set(), "layer": set(), "audio": set(), "inserts": set()}
    kept, dropped = [], []
    for it in items:
        r = res.get(it["id"])
        if not r:
            kept.append((it, None))
            continue
        sc = r.get("diem") or {}
        low = [k for k in TIEU_CHI if providers._f(sc.get(k), 5) < DIEM_DAT]
        if r.get("giu") is False or low:
            drop[it["_k"][0]].add(it["_k"][1])
            dropped.append((it, r))
        else:
            kept.append((it, r))
    plan["fx"] = [e for e in plan.get("fx") or [] if e.get("id") not in drop["fx"]]
    plan["layers"] = [L for i, L in enumerate(plan.get("layers") or []) if i not in drop["layer"]]
    plan["audio"] = [a for i, a in enumerate(plan.get("audio") or []) if i not in drop["audio"]]
    plan["inserts"] = [m for i, m in enumerate(plan.get("inserts") or []) if i not in drop["inserts"]]
    return kept, dropped
