#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO HIEU UNG TU VIET (user 2026-10-05): hieu ung AI da viet code o 1 video -> dong goi -> dung lai o video khac.

Truoc day moi video Claude viet code moi cho moi hieu ung (FX-code ~20s / hieu ung) roi bo. Gio:

  DONG GOI (sau khi RENDER XONG — video da dung = hieu ung da qua dung that, KHONG lam cham tao video):
    harvest(plan.fx)  -> kho may nay ~/.capcut-studio/fx_library.json + fx_effects/<id>/code.js (ms, khong goi AI).
                         id = bam code (trung code -> chi tang so lan dung). Kiem DI DONG trong hop cach ly
                         (khong mat, mat lech, khung doc / ngang) -> `works` = khung nao dung duoc.
    preview_job(id)   -> khung ve san cho composition FxPreview (nen trung tinh + bong nguoi gia — KHONG dung hinh
                         video cua khach) -> Electron render preview.mp4 khi khong co video nao cho render.
    label(ids)        -> Gemini XEM preview + mo ta thiet ke -> nhan TONG QUAT (khong ten san pham / loi noi).
    share_payload(id) -> phan CONG KHAI (code + preview + nhan Gemini) gui kho chung qua may chu ban quyen;
                         may tac gia tu duyet, may khach cho duyet (user chon 2026-10-05: hop cach ly Node vm KHONG
                         phai ranh gioi bao mat -> code tu may khac phai qua nguoi duyet moi phat cho moi may).
  DUNG LAI (lap plan, KHONG them luot AI): FX-plan giu nguyen (ngu canh truoc) -> candidates_for() loc bang CODE
    (cung loai, khung dung duoc, do dai gan, giong mo ta) -> FX-code nhan kem 1-3 ung vien / hieu ung: AI chon
    `reuse` (chi tra id), `adapt` (sua nhe code ung vien) hoac viet moi. Code dung lai van qua hop cach ly voi
    mat / vung chu cua video MOI + fit_check nhu cu. Kho trong / khong ung vien -> payload + khoa cache y het truoc.

Rieng tu: `design` (context / why_fit co trich loi noi video goc) va `projects` CHI o may nay, khong bao gio gui di.
"""
import hashlib
import json
import math
import os
import re
import shutil
import threading
import time
import unicodedata

import canvas as CV
import prompt_store

HOME = os.path.expanduser("~")
ENGINE_HOME = os.path.join(HOME, ".capcut-studio")
FX_DIR = os.path.join(ENGINE_HOME, "fx_effects")
FX_LIB = os.path.join(ENGINE_HOME, "fx_library.json")
CODE_FILE = "code.js"
PREVIEW_FILE = "preview.mp4"
LIB_VERSION = 1
RT_VERSION = 1                  # khop fx_runtime.mjs FX_RUNTIME_VERSION

MAX_CANDS = 3                   # ung vien / hieu ung
MAX_BATCH_CANDS = 6             # ung vien KHAC NHAU / lo FX-code (gioi han do dai dau vao)
MIN_SCORE = 0.14                # do giong mo ta toi thieu (cosine tf-idf)
DUR_RATIO = (0.5, 2.0)          # do dai hieu ung moi / do dai goc — ngoai khoang: nhip code khong con khop
PREVIEW_PAD = 0.3               # giay trong truoc / sau hieu ung trong preview
LABEL_BATCH = 4                 # so preview / luot Gemini
FACE_SAMPLE = {CV.PORTRAIT: {"x": 540, "y": 700, "w": 330, "h": 420},
               CV.LANDSCAPE: {"x": 960, "y": 430, "w": 300, "h": 380}}

_lock = threading.RLock()


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------
_FX_REUSE_NOTE = """# KHO HIEU UNG DA CO (dung lai thay vi viet moi)
Mot so hieu ung co "kho_ung_vien": hieu ung da viet + da chay that o video khac, he thong loc san vi giong mo ta.
Voi MOI hieu ung co ung vien, TRUOC KHI viet code hay doi chieu "visual" + context / goal cua hieu ung nay voi
"mo_ta" / "hinh_anh" va CODE cua tung ung vien:
- Ung vien ve DUNG hinh anh + chuyen dong ma "visual" mo ta, hop boi canh -> {"id", "fit_check", "reuse": "<lib_id>",
  "params": {"colors": [...], "intensity": 0..1}} — KHONG tra code. Mau / cuong do lay tu params (code doc
  ctx.params), vi tri tu ctx.face / ctx.avoid, nhip theo ctx.d -> khong can sua code de doi mau / do dai.
- Ung vien GAN DUNG (khac it: hinh khoi phu, huong, so luong, nhip, vi tri) -> {"id", "fit_check", "from": "<lib_id>",
  "code": "<code ung vien DA SUA NHE>"} — giu khung code cua ung vien, chi sua phan can.
- Khong ung vien nao hop -> viet code moi nhu binh thuong (bo qua kho).
Uu tien van la DUNG NGU CANH: KHONG ep dung lai mot hieu ung lech y do chi vi da co san. "lib_id" phai dung id
trong kho_ung_vien cua CHINH hieu ung do."""

_GEMINI_FX_PROMPT = """Ban la MOTION DESIGNER dang PHAN LOAI HIEU UNG HINH (motion graphics viet bang code) de dua vao KHO DUNG
LAI cho video short-form (TikTok / Reels / Shorts).

Moi file dinh kem la PREVIEW cua 1 hieu ung tren NEN TRUNG TINH: hinh nguoi gia (bong xam) dat dung vi tri mat
nguoi noi. Trong video that, hieu ung nam tren video nguoi that — nen va bong nguoi KHONG thuoc hieu ung.
Hieu ung loai "transform" tac dong len CA KHUNG (zoom, rung, nghieng, nhoe, doi mau) -> nhin chuyen dong cua nen +
bong nguoi. Moi file kem: id, loai, lop (front = tren nguoi, behind = sau nguoi), do dai, mo ta thiet ke goc
(chi de tham khao — CHI TIN nhung gi THAY trong preview).

Viet nhan TONG QUAT de AI lap ke hoach o NHUNG VIDEO KHAC tim va dung lai: KHONG nhac ten san pham, ten nguoi,
thuong hieu, loi noi hay chu de cu the cua video goc. AI lap ke hoach KHONG xem duoc preview — chi doc nhan nay.

# TRA VE CHI JSON
{"effects": [
  {"id": "<dung id da cho>",
   "name": "ten ngan 2-6 tu tieng Viet (vd: Tia sang toa quanh mat)",
   "summary": "1-2 cau: hieu ung trong nhu the nao, chuyen dong ra sao",
   "visual": "mo ta hinh anh chi tiet, tong quat: hinh khoi, mau, vi tri so voi mat / khung, nhip vao - dinh - ra",
   "use_when": "khi nao nen dung: muc tieu / cam xuc / loai khoanh khac (vd: 'khi nguoi noi tiet lo ket qua bat ngo')",
   "avoid_when": ["tinh huong KHONG nen dung"],
   "moods": ["cam xuc hop: vui, soc, sang trong, hai huoc, cang thang..."],
   "moments": ["loai khoanh khac: hook, nhan manh, bat ngo, tiet lo, chuyen y, minh hoa, so sanh, CTA, ket..."],
   "placement": "quanh mat | sau nguoi | goc khung | vien khung | toan khung | nua tren | nua duoi",
   "energy": "nhe|vua|manh",
   "tags": ["4-8 tu khoa tieng Viet de tim kiem"],
   "quality": 1,
   "quality_note": "danh gia ngan: ro rang / dep / co loi hien thi khong"}
]}
"quality": 1 (hong / gan nhu khong thay gi / xau) .. 5 (dep, ro, chuyen nghiep). Preview trong / loi -> 1.
⚠️ TRA VE CHI JSON GOC. Ky tu dau la {, ky tu cuoi la }."""


def prompt_fp():
    return hashlib.sha1(_p("_FX_REUSE_NOTE").encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# KHO
# ---------------------------------------------------------------------------
def load_lib():
    with _lock:
        if os.path.isfile(FX_LIB):
            try:
                with open(FX_LIB, encoding="utf-8") as fh:
                    d = json.load(fh)
                if isinstance(d, dict) and isinstance(d.get("effects"), list):
                    return d
            except (OSError, ValueError):
                pass
        return {"v": LIB_VERSION, "effects": []}


def save_lib(lib):
    with _lock:
        os.makedirs(ENGINE_HOME, exist_ok=True)
        lib["v"] = LIB_VERSION
        tmp = FX_LIB + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(lib, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, FX_LIB)


def effect_dir(fid):
    return os.path.join(FX_DIR, fid)


def code_path(fid):
    return os.path.join(effect_dir(fid), CODE_FILE)


def preview_path(fid):
    return os.path.join(effect_dir(fid), PREVIEW_FILE)


def load_code(fid):
    try:
        with open(code_path(fid), encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def _norm_code(code):
    lines = [ln.rstrip() for ln in str(code or "").replace("\r\n", "\n").split("\n")]
    return "\n".join(ln for ln in lines if ln.strip())


def code_id(kind, code):
    h = hashlib.sha1(("%s\n%s" % (kind, _norm_code(code))).encode("utf-8")).hexdigest()
    return "fx-" + h[:12]


def _sha256(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def get(fid):
    return next((e for e in load_lib()["effects"] if e.get("id") == fid), None)


def _update(fid, fn):
    """Sua 1 muc trong lock (doc - sua - ghi). fn(entry) -> None. Tra muc da sua (None neu khong co)."""
    with _lock:
        lib = load_lib()
        for e in lib["effects"]:
            if e.get("id") == fid:
                fn(e)
                save_lib(lib)
                return e
    return None


def _state(e):
    st = e.get("state")
    if not isinstance(st, dict):
        st = e["state"] = {}
    return st


def portability(items):
    """items: [{id, kind, code, duration, params}] -> {id: {"portrait": bool, "landscape": bool, "errors": [...]}}.
    Chay code trong hop cach ly voi NHIEU ctx (co mat / khong mat / mat lech + vung chu, khung doc / ngang): code
    cung toa do theo video goc hoac doc ctx.face khong kiem null -> lo ra o day, khong lo o video sau."""
    import fx_flow
    jobs, owner = [], []
    for it in items:
        dur = max(0.4, min(6.0, float(it.get("duration") or 1.5)))
        for orient in (CV.PORTRAIT, CV.LANDSCAPE):
            W, H = CV.SIZES[orient]
            f = FACE_SAMPLE[orient]
            variants = [
                {"face": dict(f), "avoid": []},
                {"face": None, "avoid": []},
                {"face": {"x": round(W * 0.3, 1), "y": round(H * 0.32, 1), "w": f["w"] * 1.3, "h": f["h"] * 1.3},
                 "avoid": [{"x": round(W * 0.08, 1), "y": round(H * 0.62, 1), "w": round(W * 0.84, 1),
                            "h": round(H * 0.12, 1), "text": "chu mau"}]},
            ]
            for j, v in enumerate(variants):
                jid = "%s__%s%d" % (it["id"], orient[0], j)
                jobs.append({"id": jid, "kind": it.get("kind") or "overlay", "code": it.get("code") or "",
                             "duration": dur, "fps": 30, "W": W, "H": H, "face": v["face"], "avoid": v["avoid"],
                             "params": it.get("params") or {}, "palette": {}})
                owner.append((jid, it["id"], orient))
    res = fx_flow.run_runtime("check", jobs) if jobs else {}
    out = {it["id"]: {CV.PORTRAIT: True, CV.LANDSCAPE: True, "needs_face": False, "errors": []} for it in items}
    for jid, fid, orient in owner:
        r = res.get(jid) or {"ok": False, "errors": ["khong co ket qua"]}
        if r.get("ok"):
            continue
        if jid.endswith("1"):
            # chi hong khi KHONG co mat (code doc ctx.face khong kiem null) -> van dung lai duoc cho video co mat
            out[fid]["needs_face"] = True
            continue
        out[fid][orient] = False
        for m in (r.get("errors") or [])[:1]:
            msg = "%s: %s" % (orient, m)
            if msg not in out[fid]["errors"]:
                out[fid]["errors"].append(msg[:200])
    return out


def harvest(fx_items, project=None, orientation=None, log=None):
    """Dong goi hieu ung tu viet cua 1 video DA RENDER vao kho may nay. Khong goi AI.
    fx_items = plan["fx"] (code da qua hop cach ly). Tra {"added", "reused", "skipped"}.
    Dung nguyen tu kho (lib.mode = reuse) -> chi dem 1 lan dung cho muc goc; ban sua (adapt) -> muc moi co `parent`.
    Moi du an chi dem 1 lan / muc (render lai cung du an khong tang so lan dung)."""
    orient = CV.normalize(orientation)
    rows = []
    for e in fx_items or []:
        if not isinstance(e, dict) or not str(e.get("code") or "").strip():
            continue
        kind = e.get("kind") if e.get("kind") in ("overlay", "transform") else "overlay"
        lib_ref = e.get("lib") if isinstance(e.get("lib"), dict) else {}
        fid = lib_ref["id"] if lib_ref.get("mode") == "reuse" and lib_ref.get("id") else code_id(kind, e["code"])
        rows.append((fid, kind, e, lib_ref))
    added, reused, skipped = [], [], []
    with _lock:
        lib = load_lib()
        have = {x["id"]: x for x in lib["effects"] if isinstance(x, dict) and x.get("id")}
        new = []
        for fid, kind, e, lib_ref in rows:
            if fid in have:
                x = have[fid]
                prj = x.setdefault("projects", [])
                if not project or project not in prj:
                    x["uses"] = int(x.get("uses") or 0) + 1
                    if project:
                        prj.append(project)
                        del prj[:-50]
                if fid not in reused:
                    reused.append(fid)
            elif not any(n[0] == fid for n in new):
                new.append((fid, kind, e, lib_ref))
        port = portability([{"id": fid, "kind": kind, "code": e["code"],
                             "duration": float(e.get("src_end") or 0) - float(e.get("src_start") or 0),
                             "params": e.get("params")} for fid, kind, e, _ in new]) if new else {}
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        for fid, kind, e, lib_ref in new:
            pr = port.get(fid) or {}
            works = {CV.PORTRAIT: bool(pr.get(CV.PORTRAIT)), CV.LANDSCAPE: bool(pr.get(CV.LANDSCAPE))}
            if not works[orient]:
                # chinh khung cua video nay cung khong qua kiem di dong -> code dinh chat vao video goc, khong dung lai duoc
                skipped.append({"id": fid, "src": e.get("id"), "ly_do": "; ".join(pr.get("errors") or [])[:300]})
                continue
            os.makedirs(effect_dir(fid), exist_ok=True)
            tmp = code_path(fid) + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(e["code"])
            os.replace(tmp, code_path(fid))
            params = e.get("params") if isinstance(e.get("params"), dict) else {}
            ent = {
                "id": fid, "kind": kind, "layer": e.get("layer") if e.get("layer") in ("front", "behind") else "front",
                "code_sha": _sha256(e["code"]),
                "duration": round(float(e.get("src_end") or 0) - float(e.get("src_start") or 0), 3),
                "params": {"colors": list(params.get("colors") or [])[:4], "intensity": params.get("intensity", 0.7)},
                "canvas": orient, "works": works, "needs_face": bool(pr.get("needs_face")), "rt": RT_VERSION,
                "origin": "local",
                "design": {k: str(e.get(k) or "")[:1200] for k in ("visual", "goal", "sync", "context", "why_fit")},
                "label": None, "uses": 1, "projects": [project] if project else [], "created": now,
                "state": {"preview": None, "label": None, "share": None},
            }
            if e.get("sfx"):
                ent["sfx"] = e["sfx"]
            if lib_ref.get("id") and lib_ref.get("mode") == "adapt":
                ent["parent"] = lib_ref["id"]
            lib["effects"].append(ent)
            added.append(fid)
        if added or reused:
            save_lib(lib)
    if log and (added or skipped):
        log("Kho hieu ung: +%d moi, %d da co, %d bo (khong di dong duoc)" % (len(added), len(reused), len(skipped)))
    return {"added": added, "reused": reused, "skipped": skipped}


def delete(fid):
    with _lock:
        lib = load_lib()
        n = len(lib["effects"])
        lib["effects"] = [e for e in lib["effects"] if e.get("id") != fid]
        if len(lib["effects"]) == n:
            return False
        save_lib(lib)
    d = effect_dir(fid)
    if os.path.isdir(d) and os.path.realpath(d).startswith(os.path.realpath(FX_DIR) + os.sep):
        shutil.rmtree(d, ignore_errors=True)
    return True


def list_view():
    """Danh sach cho UI (khong kem code)."""
    out = []
    for e in load_lib()["effects"]:
        if not isinstance(e, dict) or not e.get("id"):
            continue
        v = {k: e.get(k) for k in ("id", "kind", "layer", "duration", "params", "canvas", "works", "origin", "label",
                                   "uses", "created", "state", "parent", "sfx", "disabled")}
        v["design"] = {k: (e.get("design") or {}).get(k) for k in ("visual", "goal")} if e.get("design") else None
        v["preview"] = preview_path(e["id"]) if os.path.isfile(preview_path(e["id"])) else None
        v["has_code"] = os.path.isfile(code_path(e["id"]))
        out.append(v)
    out.sort(key=lambda x: str(x.get("created") or ""), reverse=True)
    return out


# ---------------------------------------------------------------------------
# TIM UNG VIEN (code, khong AI)
# ---------------------------------------------------------------------------
_STOP = set("""va la cua cho voi cac mot nhung trong tren duoi khi de thi co khong duoc nay do ra vao theo tu nhu hon rat
nhe nen se dang da roi lai cung moi ma hay hoac neu vi bi tai o den sau truoc giua ngay luc nao gi ai the nay kia day
cai con chi van tung nguoi video hieu ung khung nao""".split())


def _fold(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")


def _tokens(text):
    words = [w for w in re.findall(r"[a-z0-9]+", _fold(text)) if len(w) >= 2 and w not in _STOP]
    return words + ["%s_%s" % (a, b) for a, b in zip(words, words[1:])]


def _doc_text(e):
    lb = e.get("label") if isinstance(e.get("label"), dict) else {}
    ds = e.get("design") if isinstance(e.get("design"), dict) else {}
    parts = [lb.get("name"), lb.get("summary"), lb.get("visual"), lb.get("use_when"), lb.get("placement"),
             " ".join(lb.get("tags") or []), " ".join(lb.get("moods") or []), " ".join(lb.get("moments") or []),
             ds.get("visual"), ds.get("goal"), ds.get("sync")]
    return " ".join(str(p) for p in parts if p)


def _query_text(e):
    return " ".join(str(e.get(k) or "") for k in ("visual", "visual", "goal", "sync"))   # visual nang gap doi


def usable(orientation=None, exclude_project=None, has_face=True):
    """Muc dung lai duoc o khung nay: co code, chay dung khung, khong bi tat, khong sinh tu chinh du an dang lam
    (giu khoa cache cua du an do on dinh khi lap lai plan)."""
    orient = CV.normalize(orientation) if orientation else (CV.LANDSCAPE if CV.landscape() else CV.PORTRAIT)
    out = []
    for e in load_lib()["effects"]:
        if not isinstance(e, dict) or e.get("disabled") or e.get("kind") not in ("overlay", "transform"):
            continue
        if not (e.get("works") or {}).get(orient):
            continue
        if exclude_project and exclude_project in (e.get("projects") or []):
            continue
        if e.get("needs_face") and not has_face:
            continue
        lb = e.get("label") if isinstance(e.get("label"), dict) else {}
        if lb and int(lb.get("quality") or 3) <= 1:
            continue
        if not os.path.isfile(code_path(e["id"])):
            continue
        out.append(e)
    return out


def candidates_for(effects, orientation=None, exclude_project=None, has_face=True):
    """effects (FX-plan da loc) -> {fx_id: [muc kho, ...]} toi da MAX_CANDS / hieu ung, sap theo do giong.
    Do giong = cosine tf-idf (tu + cap tu, bo dau) giua visual / goal / sync cua hieu ung moi va nhan Gemini +
    thiet ke goc cua muc kho. Cung loai (overlay / transform), do dai trong DUR_RATIO."""
    lib = usable(orientation, exclude_project, has_face)
    if not lib or not effects:
        return {}
    docs = [_tokens(_doc_text(x)) for x in lib]
    qs = [_tokens(_query_text(e)) for e in effects]
    df = {}
    for toks in docs + qs:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1
    n = len(docs) + len(qs)

    def vec(toks):
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        v = {t: (1 + math.log(c)) * math.log(1 + n / df[t]) for t, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / norm for t, x in v.items()}

    dv = [vec(t) for t in docs]
    out = {}
    for e, q in zip(effects, qs):
        qv = vec(q)
        dur = float(e.get("src_end") or 0) - float(e.get("src_start") or 0)
        scored = []
        for x, v in zip(lib, dv):
            if x.get("kind") != e.get("kind"):
                continue
            d0 = float(x.get("duration") or 0)
            if d0 > 0 and dur > 0 and not (DUR_RATIO[0] <= dur / d0 <= DUR_RATIO[1]):
                continue
            s = sum(w * v.get(t, 0.0) for t, w in qv.items())
            if s >= MIN_SCORE:
                scored.append((s, x))
        scored.sort(key=lambda p: (-p[0], -int(p[1].get("uses") or 0)))
        if scored:
            out[e["id"]] = [dict(x, _score=round(s, 3)) for s, x in scored[:MAX_CANDS]]
    return out


def limit_batch(cands, ids):
    """Gioi han so ung vien KHAC NHAU trong 1 lo FX-code (dau vao khong phinh): uu tien diem cao."""
    pool = sorted({(c["id"], c["_score"]) for fid in ids for c in cands.get(fid) or []}, key=lambda p: -p[1])
    keep = {cid for cid, _ in pool[:MAX_BATCH_CANDS]}
    return {fid: [c for c in cands.get(fid) or [] if c["id"] in keep] for fid in ids if cands.get(fid)}


def prompt_view(x):
    """1 ung vien gui AI (FX-code): mo ta + code. Khong gui duong dan / du an."""
    lb = x.get("label") if isinstance(x.get("label"), dict) else {}
    ds = x.get("design") if isinstance(x.get("design"), dict) else {}
    return {"lib_id": x["id"], "ten": lb.get("name"), "mo_ta": lb.get("summary") or ds.get("goal"),
            "hinh_anh": lb.get("visual") or ds.get("visual"), "dung_khi": lb.get("use_when"),
            "do_dai_goc": x.get("duration"), "tham_so_goc": x.get("params"), "code": load_code(x["id"])}


def cache_key(cands):
    """Phan khoa cache FX-code khi co ung vien (id + bam code) — kho doi -> chi lo co ung vien doi moi chay lai."""
    return {"ung_vien": {fid: [[c["id"], c.get("code_sha")] for c in cs] for fid, cs in sorted(cands.items())},
            "p": prompt_fp()}


# ---------------------------------------------------------------------------
# PREVIEW (Electron render composition FxPreview)
# ---------------------------------------------------------------------------
def preview_job(fid):
    """Ve khung hieu ung tren ctx mau (mat giua khung, khong vung chu) -> spec cho composition FxPreview.
    Khung ve vao cache/fx (may chu media chi cho .json o day). Tra {"ok", "spec", "out"} hoac {"ok": False, "error"}."""
    import fx_flow
    e = get(fid)
    if not e:
        return {"ok": False, "error": "khong co hieu ung %s" % fid}
    code = load_code(fid)
    if not code:
        return {"ok": False, "error": "thieu code"}
    orient = e.get("canvas") if (e.get("works") or {}).get(e.get("canvas")) else \
        (CV.PORTRAIT if (e.get("works") or {}).get(CV.PORTRAIT) else CV.LANDSCAPE)
    W, H = CV.SIZES[orient]
    fps = 30
    dur = round(max(0.6, min(6.0, float(e.get("duration") or 1.5))), 3)
    face = dict(FACE_SAMPLE[orient])
    job = {"id": "pv" + fid.replace("-", ""), "kind": e.get("kind") or "overlay", "code": code, "duration": dur,
           "fps": fps, "W": W, "H": H, "face": face, "params": e.get("params") or {}, "palette": {}, "avoid": []}
    key = hashlib.sha1(json.dumps({k: job[k] for k in job if k != "id"}, sort_keys=True, ensure_ascii=False)
                       .encode("utf-8") + b"|preview").hexdigest()[:24]
    job["out"] = os.path.join(fx_flow.FX_CACHE, "pv-" + key + ".json")
    r = fx_flow.run_runtime("frames", [job]).get(job["id"]) or {}
    if not r.get("ok"):
        return {"ok": False, "error": "; ".join(r.get("errors") or ["ve khung loi"])[:300]}
    st, en = PREVIEW_PAD, round(PREVIEW_PAD + dur, 3)
    spec = {"width": W, "height": H, "fps": fps, "duration": round(dur + 2 * PREVIEW_PAD, 3),
            "face": {"cx": face["x"] / W, "cy": face["y"] / H, "w": face["w"] / W, "h": face["h"] / H},
            "fx": [], "fxTransforms": []}
    if job["kind"] == "transform":
        vals, _n = fx_flow.smooth_scale(r.get("values") or {}, fps)
        spec["fxTransforms"].append({"id": job["id"], "start": st, "end": en, "n": r.get("n"), "values": vals})
    else:
        spec["fx"].append({"id": job["id"], "start": st, "end": en, "layer": e.get("layer") or "front",
                           "file": job["out"]})
    os.makedirs(effect_dir(fid), exist_ok=True)
    return {"ok": True, "spec": spec, "out": preview_path(fid)}


def set_preview(fid, ok, error=None):
    def fn(e):
        st = _state(e)
        st["preview"] = "ok" if ok and os.path.isfile(preview_path(fid)) else "error"
        st["preview_err"] = None if ok else str(error or "")[:300]
    return _update(fid, fn)


# ---------------------------------------------------------------------------
# GEMINI GAN NHAN
# ---------------------------------------------------------------------------
_LABEL_KEYS = ("name", "summary", "visual", "use_when", "avoid_when", "moods", "moments", "placement", "energy",
               "tags", "quality", "quality_note")


def _clean_label(r):
    out = {}
    for k in _LABEL_KEYS:
        v = r.get(k)
        if k in ("avoid_when", "moods", "moments", "tags"):
            out[k] = [str(x)[:80] for x in (v if isinstance(v, list) else [v] if v else []) if str(x).strip()][:8]
        elif k == "quality":
            try:
                out[k] = max(1, min(5, int(v)))
            except (TypeError, ValueError):
                out[k] = 3
        elif k == "energy":
            out[k] = v if v in ("nhe", "vua", "manh") else "vua"
        else:
            out[k] = " ".join(str(v or "").split())[:600]
    return out


def label(ids, log=None):
    """Gemini XEM preview (nhom LABEL_BATCH) -> nhan tong quat. Tra {"labeled", "errors": {id: msg}, "stop"}.
    Goi Gemini NEM LOI (chua dang nhap / mat mang / het han muc — loi chung, khong rieng muc nao) -> KHONG danh dau
    loi tung muc, tra stop=True de bo dieu phoi dung gan nhan trong phien nay (lan mo app sau tu thu lai).
    Chi muc Gemini tra ve nhung bo sot moi bi danh dau loi (nut "Thu lai")."""
    import providers
    rows = []
    for fid in ids or []:
        e = get(fid)
        if e and os.path.isfile(preview_path(fid)):
            rows.append(e)
    labeled, errors = [], {}
    for i in range(0, len(rows), LABEL_BATCH):
        part = rows[i:i + LABEL_BATCH]
        items = []
        for e in part:
            ds = e.get("design") or {}
            items.append({"path": preview_path(e["id"]), "label": "id=%s | loai=%s | lop=%s | dai %.1fs | thiet ke goc: %s" % (
                e["id"], e.get("kind"), e.get("layer"), float(e.get("duration") or 0),
                " ".join(str(ds.get("visual") or "").split())[:500])})
        try:
            res = providers.gemini_files(items, _p("_GEMINI_FX_PROMPT"), step_label="Gemini-fx", log=log)
        except Exception as ex:
            msg = str(ex).split("\n")[0][:200]
            for e in rows[i:]:
                errors[e["id"]] = msg
            return {"labeled": labeled, "errors": errors, "stop": True}
        got = res.get("effects") if isinstance(res, dict) else None
        if not isinstance(got, list) and isinstance(res, dict) and res.get("id"):
            got = [res]
        ids_part = [e["id"] for e in part]
        seen = set()
        for j, r in enumerate(got or []):
            if not isinstance(r, dict):
                continue
            rid = r.get("id") if r.get("id") in ids_part else (ids_part[j] if j < len(ids_part) else None)
            if not rid or rid in seen:
                continue
            seen.add(rid)
            lb = _clean_label(r)

            def fn(x, lb=lb):
                x["label"] = lb
                _state(x).update(label="ok", label_err=None)
            _update(rid, fn)
            labeled.append(rid)
        for rid in ids_part:
            if rid not in seen:
                errors[rid] = "Gemini khong tra nhan cho muc nay"
                _update(rid, lambda x: _state(x).update(label="error", label_err="Gemini bo sot"))
    return {"labeled": labeled, "errors": errors, "stop": False}


# ---------------------------------------------------------------------------
# KHO CHUNG (qua may chu ban quyen)
# ---------------------------------------------------------------------------
PUBLIC_KEYS = ("id", "kind", "layer", "duration", "params", "works", "needs_face", "rt", "label", "parent", "sfx",
               "code_sha")
SHARE_MIN_QUALITY = 3


def pending_work():
    """Viec nen con lai cho UI / bo dieu phoi: can preview / can nhan / can gui kho chung."""
    need_preview, need_label, need_share = [], [], []
    for e in load_lib()["effects"]:
        if not isinstance(e, dict) or e.get("origin") != "local" or e.get("disabled"):
            continue
        st = e.get("state") or {}
        if not os.path.isfile(preview_path(e["id"])):
            if st.get("preview") != "error":
                need_preview.append(e["id"])
            continue
        if not e.get("label"):
            if st.get("label") != "error":
                need_label.append(e["id"])
            continue
        if st.get("share") in (None, "") and int((e.get("label") or {}).get("quality") or 0) >= SHARE_MIN_QUALITY:
            need_share.append(e["id"])
    return {"preview": need_preview, "label": need_label, "share": need_share}


def share_payload(fid):
    """Phan CONG KHAI gui kho chung: nhan Gemini (tong quat) + code + preview. KHONG co design / projects."""
    e = get(fid)
    if not e or e.get("origin") != "local":
        return None
    if not e.get("label") or not os.path.isfile(preview_path(fid)) or not os.path.isfile(code_path(fid)):
        return None
    meta = {k: e.get(k) for k in PUBLIC_KEYS if e.get(k) is not None}
    meta["created"] = e.get("created")
    return {"meta": meta, "code": code_path(fid), "preview": preview_path(fid)}


def set_share(fid, status, error=None):
    def fn(e):
        st = _state(e)
        st["share"] = status
        st["share_err"] = str(error or "")[:300] if error else None
    return _update(fid, fn)


def reset_errors(fid):
    """Nut "Thu lai": xoa trang thai loi de bo dieu phoi lam lai preview / nhan / gui."""
    def fn(e):
        st = _state(e)
        for k in ("preview", "label", "share"):
            if st.get(k) == "error":
                st[k] = None
    return _update(fid, fn)


_ID_RE = re.compile(r"^fx-[0-9a-f]{12}$")
_SHARED_FILES = (CODE_FILE, PREVIEW_FILE)


def merge_shared(entries, download, log=None):
    """Kho chung -> kho may nay (library_sync.pull). entries = manifest["fx"]: muc DA DUYET kem link tai tam
    (`files` = [{path, sha256, url}]). download(url, dest, sha) tai + kiem SHA-256 (nem loi khi sai).
    - Muc cua CHINH may nay (origin local, cung id = cung code) -> chi ghi nhan "da duyet", khong tai de.
    - Kiem lai id = bam code sau khi tai (may chu bi can thiep cung khong nhet duoc code khac vao id cu).
    - Muc chung khong con trong manifest (quan tri go) -> xoa khoi may nay. Muc local khong bao gio bi xoa.
    Tra {"added", "updated", "removed", "total", "errors"}."""
    errors, got = [], {}
    added = updated = removed = 0
    for m in entries or []:
        fid = str((m or {}).get("id") or "")
        kind = m.get("kind") if m.get("kind") in ("overlay", "transform") else None
        files = {f.get("path"): f for f in m.get("files") or [] if isinstance(f, dict)}
        if not _ID_RE.match(fid) or not kind or set(files) != set(_SHARED_FILES):
            errors.append("%s: muc khong hop le" % fid)
            continue
        got[fid] = (m, kind, files)
    with _lock:
        lib = load_lib()
        by = {e["id"]: e for e in lib["effects"] if isinstance(e, dict) and e.get("id")}
    for fid, (m, kind, files) in got.items():
        cur = by.get(fid)
        if cur and cur.get("origin") == "local":
            if (cur.get("state") or {}).get("share") != "approved":
                _update(fid, lambda e: _state(e).update(share="approved", share_err=None))
            continue
        d = effect_dir(fid)
        try:
            for name in _SHARED_FILES:
                f = files[name]
                dest = os.path.join(d, name)
                sha = f.get("sha256")
                if not os.path.isfile(dest) or (sha and hashlib.sha256(open(dest, "rb").read()).hexdigest() != sha):
                    download(f.get("url"), dest, sha)
            if code_id(kind, load_code(fid)) != fid:
                raise RuntimeError("code khong khop id")
        except Exception as ex:
            errors.append("%s: %s" % (fid, str(ex)[:120]))
            if not cur:
                shutil.rmtree(d, ignore_errors=True)
            continue
        row = {k: m.get(k) for k in ("kind", "layer", "duration", "params", "works", "needs_face", "rt", "label",
                                      "parent", "sfx", "code_sha")}
        row.update(id=fid, kind=kind, origin="shared", state={"preview": "ok", "label": "ok", "share": "approved"})
        if not isinstance(row.get("works"), dict):
            row["works"] = {CV.PORTRAIT: True, CV.LANDSCAPE: False}

        def fn(e, row=row):
            keep = {k: e.get(k) for k in ("uses", "projects", "created", "disabled") if e.get(k) is not None}
            e.clear()
            e.update(row, **keep)
        if cur:
            _update(fid, fn)
            updated += 1
        else:
            row.update(uses=0, projects=[], created=m.get("created") or time.strftime("%Y-%m-%dT%H:%M:%S"))
            with _lock:
                lib = load_lib()
                if not any(e.get("id") == fid for e in lib["effects"]):
                    lib["effects"].append(row)
                    save_lib(lib)
            added += 1
        if log:
            log("  hieu ung %s" % fid)
    for fid, e in by.items():
        if e.get("origin") == "shared" and fid not in got and delete(fid):
            removed += 1
    total = sum(1 for e in load_lib()["effects"] if e.get("origin") == "shared")
    return {"added": added, "updated": updated, "removed": removed, "total": total, "errors": errors}
