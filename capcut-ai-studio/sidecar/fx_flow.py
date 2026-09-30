#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HIEU UNG TU VIET (user 2026-09-27; tu 2026-09-28 la luong edit DUY NHAT — nut "Luong Edit moi" / luong cu da go).

Hieu ung KHONG lay tu kho mau: AI lap ke hoach TU DE XUAT hieu ung cho TUNG khoanh khac dua tren boi
canh (loi noi, cam xuc, khoanh khac, bo cuc + chu dang tren man hinh, vi tri mat, tone, yeu cau edit),
roi TU VIET CODE ve hieu ung theo bo quy tac; code chay trong HOP CACH LY (fx_runtime.mjs) de kiem +
ve san tung khung. Remotion chi hien khung da ve -> xem truoc = render.

  FX-plan  : de xuat hieu ung (context -> goal -> why_fit -> visual). Uu tien cao nhat: DUNG NGU CANH.
  FX-code  : viet code + tu kiem lai lan 2 "hieu ung nay co hop boi canh khong" (fit_check).
  kiem     : fx_runtime.mjs (tinh + chay thu + tat dinh + toc do) -> loi thi FX-fix (1 luot) -> van loi thi bo.
  dung     : fx_to_spec (build_spec) -> ve khung (cache theo code + do dai + vi tri mat) -> spec.fx / fxTransforms.
"""
import hashlib
import json
import os
import shutil
import subprocess

import prompt_store
import providers

HERE = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.path.join(HERE, "fx_runtime.mjs")
FX_CACHE = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "fx")
FX_VERSION = 1
MAX_FX = 12
MIN_FX_SEC, MAX_FX_SEC = 0.3, 6.0
CODE_BATCH = 4
KINDS = ("overlay", "transform")


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------
_FX_PLAN_SYSTEM = """Ban la MOTION DESIGNER + EDITOR short-form. Nhiem vu: DE XUAT HIEU UNG HINH TU THIET KE (khong
lay tu kho mau nao) cho video nay. Moi hieu ung se duoc viet thanh code rieng o buoc sau.

UU TIEN CAO NHAT: HIEU UNG PHAI DUNG NGU CANH. Mot hieu ung chi co gia tri khi no phuc vu DUNG muc tieu cua
DUNG khoanh khac do trong video. Tha KHONG co hieu ung con hon hieu ung sai ngu canh / cho co.

# DU LIEU DAU VAO
- cau_chuyen: story_arc, tone, nhip_truyen, edit_request (muc dich, phong cach, khan gia).
- phong_cach: bo phong cach cua PHIEN nay (tu video mau, hoac R4 tu dat cho video nay) — mau, font, mood.
- khoanh_khac[]: TUNG doan cua video theo thu tu: id, source_id, src_start/src_end (gio NGUON), beat/purpose,
  loi_noi (cau dang noi, gio nguon), cam_xuc, su_kien (khoanh khac dat: hook/climax/twist/reveal... + mo ta),
  bo_cuc (layout dang dung luc do: full / split / card ...), chu_tren_man_hinh (lop chu dang hien + "vung"
  [x0, y0, x1, y1] phan khung — hieu ung KHONG ve de len vung nay tru khi CO Y), mat_nguoi (vi tri mat 0..1),
  la_hook (doan duoc sao chep len dau video).
- mo_ta_nguon: boi canh / san pham / nguoi trong video nguon (Gemini xem video).
- da_co: cac hieu ung / lop do hoa khac da dat (de khong chong cheo).

# CACH LAM — BAT BUOC THEO THU TU CHO MOI HIEU UNG
1. BOI CANH ("context"): doc khoanh khac do — nguoi noi DANG NOI gi (trich loi), cam xuc gi, tren man hinh
   dang co gi (bo cuc, chu, mat nguoi o dau, san pham / vat the neu mo_ta_nguon co).
2. MUC TIEU ("goal"): nguoi xem can CAM THAY / CHU Y dieu gi ngay luc do (nhan manh cau chot, tao to mo, cam
   giac soc / bat ngo, dan mat toi san pham, the hien cam xuc cua nguoi noi, chuyen y, minh hoa mot y an du...).
   Khong tim duoc muc tieu ro -> KHONG dat hieu ung o khoanh khac do.
3. VI SAO HOP ("why_fit"): giai thich hieu ung nay phuc vu muc tieu tren NHU THE NAO, nhac CU THE toi loi noi /
   cam xuc / hinh anh cua chinh khoanh khac do. Cau chung chung ("tang tinh hap dan") = KHONG dat.
4. THIET KE ("visual"): mo ta hinh anh chi tiet de viet code: hinh khoi (vet, hat, vong, anh sang, khung,
   hinh vector minh hoa...), mau (theo phong_cach / tone), vi tri so voi MAT NGUOI va khung (khong che mat —
   tru khi hieu ung CO Y bao quanh mat va trong suot), chuyen dong theo thoi gian (vao / dinh / ra), cuong do,
   dong bo voi tu / nhip nao ("sync").
5. Doi chieu lai: co hop TONE + phong cach khong? Co tranh voi chu dang hien khong (chu to dang hien -> hieu ung
   phai nhe / nam sau / hoac bo)? Co lap lai y het hieu ung khac khong (moi hieu ung phai RIENG cho khoanh khac
   cua no)? Khong dat -> bo.

# LOAI HIEU UNG
- "overlay": ve DE LEN video (vet sang, hat, tia, khung, gach nhan, hinh vector minh hoa, lop mau, nhieu hat...).
  "layer": "front" (tren nguoi) | "behind" (SAU nguoi, tren nen — chi khi bo_cuc full; nguoi van noi ro).
  KHONG ve chu / so / emoji (chu di qua lop chu rieng co quy tac).
- "transform": tac dong len KHUNG VIDEO: rung, punch-in / zoom nhip, nghieng, lac, nhoe, doi sang / tuong phan /
  bao hoa / tong mau. Khong 2 transform cung luc.

# RANG BUOC
- Moi hieu ung 0.4-4 giay (toi da 6), neo GIO NGUON cua dung khoanh khac (src_start/src_end nam trong doan do).
  Doan la_hook muon dat vao ban sao o dau video thi them "anchor": "hook".
- Mat do: toi da ~1 hieu ung / 5 giay, hieu ung manh cach nhau >= 3 giay, tong <= 12. Video nhe nhang / tam
  su -> it va tinh te; nang dong / hai / drama -> co the nhieu hon nhung van phai dung ngu canh.
- Khong can dung het — chi dat o khoanh khac that su can.

# SCHEMA DAU RA (CHI JSON)
{
  "effects": [
    {"id": "fx1", "moment": "<id khoanh khac>", "kind": "overlay|transform", "layer": "front|behind",
     "source_id": "source_1", "src_start": 12.3, "src_end": 13.6, "anchor": null,
     "context": "<boi canh: dang noi gi (trich), cam xuc, tren man hinh co gi>",
     "goal": "<nguoi xem can cam thay / chu y gi>",
     "why_fit": "<vi sao hieu ung nay phuc vu dung muc tieu trong boi canh nay>",
     "visual": "<mo ta hinh anh chi tiet: hinh khoi, mau, vi tri so voi mat / khung, chuyen dong vao-dinh-ra, cuong do>",
     "sync": "<bam vao tu / nhip nao>", "colors": ["#..."], "intensity": 0.6, "sfx": null}
  ],
  "bo_qua": [{"moment": "<id>", "ly_do": "<vi sao KHONG dat hieu ung o khoanh khac dang ke nay>"}]
}
"sfx" (tuy chon): whoosh | swoosh | pop | click | ding | boom | riser | typing — chi khi hop.
⚠️ TRA VE CHI JSON GOC."""

_FX_CODE_SYSTEM = """Ban la LAP TRINH VIEN MOTION GRAPHICS. Viet code cho tung hieu ung da duoc de xuat, theo DUNG mo ta
"visual" va DUNG boi canh. Code chay trong HOP CACH LY bang JavaScript thuan (KHONG JSX, KHONG import) va duoc
ve san TUNG KHUNG (30 khung / giay) roi hien de len video 1080x1920.

# TRUOC KHI VIET — TU KIEM LAN 2 ("fit_check")
Doc lai context / goal / why_fit / visual cua hieu ung. Neu hieu ung KHONG hop boi canh (lac de voi loi noi,
sai cam xuc, che mat nguoi, tranh voi chu dang hien, khong phuc vu muc tieu) -> "fit_check": {"ok": false,
"reason": "..."} va KHONG viet code. Hop thi {"ok": true, "reason": "..."}.

# HOP DONG CODE
- "overlay": dinh nghia `function render(ctx) { ... return h(...) }` — tra ve cay phan tu (hoac null khi khong ve).
- "transform": dinh nghia `function transform(ctx) { ... return {scale, x, y, rotate, blur, brightness, contrast,
  saturate, hueRotate} }` — chi ghi khoa can doi; x/y = px, rotate/hueRotate = do, blur = px; mac dinh scale 1,
  x 0, y 0, rotate 0, blur 0, brightness 1, contrast 1, saturate 1, hueRotate 0. Gioi han: scale 0.5-2.5,
  |rotate| <= 30, blur <= 30.
- ctx: t (giay tu luc hieu ung bat dau), d (do dai giay), p = t/d (0..1), frame, fps, W = 1080, H = 1920,
  face = {x, y, w, h} (TAM mat nguoi va kich thuoc, px tren khung; co the null), avoid = [{x, y, w, h, text}]
  (khung CHU dang hien — goc tren-trai + kich thuoc, px; vi tri THAT luc dung), params = {colors: [...],
  intensity: 0..1}, palette = mau cua phong cach (co the rong), seed = id hieu ung.
- KHONG ve de len ctx.avoid (vung chu) va mat nguoi, TRU KHI mo ta CO Y lam vay (vd gach cheo dung cum chu do):
  tinh vi tri tu ctx.avoid / ctx.face luc chay (vd dat hieu ung vao goc trong, ne cac khung chu), khong co dinh toa do.
- HAM PURE THEO THOI GIAN: cung ctx.t phai ra cung ket qua. CAM Math.random, Date, timer, bien luu trang thai
  giua cac lan goi. Ngau nhien -> random(seed) (0..1, tat dinh), noise(x, y) (-1..1, muot).
- API co san (goi truc tiep): h(the, thuoc_tinh, ...con), interpolate(v, [vao], [ra], {easing, extrapolate:
  'clamp'|'extend'}) (mac dinh clamp), spring(t, {damping, stiffness, mass}) (0 -> 1 theo giay), Easing.linear /
  quad / cubic / sin / circle / exp / bounce / back(s) / elastic(b) / in(f) / out(f) / inOut(f),
  random(seed), noise(x, y), clamp, lerp, range(n), env(t, d, vao, ra) (0..1 cho fade vao / ra),
  polar(cx, cy, r, goc) -> [x, y], alpha(mau, a), mix(mau1, mau2, t), hsl(h, s, l, a), Math (khong random).
- The duoc dung: svg g path circle ellipse rect line polyline polygon defs linearGradient radialGradient stop
  filter feGaussianBlur feColorMatrix feOffset feMerge feMergeNode feBlend feTurbulence feDisplacementMap
  feComposite feFlood feMorphology mask clipPath pattern use div. KHONG co the text / image / video / foreignObject.
- Thuoc tinh: ten SVG binh thuong ('stroke-width', 'stop-color', viewBox, gradientUnits...), gia tri chuoi / so.
  style = object (camelCase). url() chi duoc url(#id) noi bo; href chi '#id' tren use. KHONG on*, KHONG class.
- Goc ve: tra ve MOT the svg phu ca khung: h('svg', {width: ctx.W, height: ctx.H, viewBox: `0 0 ${ctx.W} ${ctx.H}`}, ...)
  (nen trong suot). Hoac div co style position:absolute.
- CAM tuyet doi: chu / so / emoji (khong con chuoi van ban nao trong cay), window, document, fetch, import,
  require, eval, Function, constructor, prototype, this, async/await, Date, setTimeout. Vi pham -> hieu ung bi bo.
- Nhe: <= ~600 phan tu / khung, moi khung chay < 30ms. Dung filter blur vua phai (nang khi ve).
- Vao / ra mem: dung env() hoac interpolate de hieu ung hien dan va tat dan (khong bat / tat cut ngang tru khi
  mo ta muon cu giat).
- Theo DUNG mo ta: vi tri theo ctx.face (vd tia toa tu mat, anh sang sau dau...), mau theo params.colors /
  palette, cuong do theo params.intensity, nhip theo "sync".

# VI DU CU PHAP (khong phai phong cach)
function render(ctx) {
  const k = env(ctx.t, ctx.d, 0.15, 0.3) * (ctx.params.intensity || 1);
  const c = (ctx.params.colors || [])[0] || '#ffffff';
  const f = ctx.face || { x: ctx.W / 2, y: ctx.H * 0.42, w: 300, h: 380 };
  return h('svg', { width: ctx.W, height: ctx.H, viewBox: `0 0 ${ctx.W} ${ctx.H}` },
    ...range(12).map((i) => {
      const a = (i / 12) * Math.PI * 2 + noise(i, ctx.t * 2) * 0.2;
      const [x1, y1] = polar(f.x, f.y, f.w * 0.9, a);
      const [x2, y2] = polar(f.x, f.y, f.w * (1.1 + 0.4 * spring(ctx.t, { damping: 14 })), a);
      return h('line', { x1, y1, x2, y2, stroke: alpha(c, 0.8 * k), 'stroke-width': 5, 'stroke-linecap': 'round' });
    }));
}

# SCHEMA DAU RA (CHI JSON)
{"effects": [{"id": "fx1", "fit_check": {"ok": true, "reason": "..."}, "code": "function render(ctx) { ... }"}]}
Neu nhan "loi_can_sua": sua DUNG loi do, giu y do thiet ke, tra lai code moi.
⚠️ TRA VE CHI JSON GOC."""


# ---------------------------------------------------------------------------
# HOP CACH LY (Node)
# ---------------------------------------------------------------------------
def node_bin():
    """(duong dan, env) de chay fx_runtime.mjs. App dong goi: chinh binary Electron (STUDIO_NODE_BIN, main
    truyen vao) chay o che do Node; dev / test: node trong PATH."""
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": os.path.expanduser("~")}
    b = os.environ.get("STUDIO_NODE_BIN")
    if b and os.path.isfile(b):
        env["ELECTRON_RUN_AS_NODE"] = "1"
        return b, env
    for c in (shutil.which("node"), "/opt/homebrew/bin/node", "/usr/local/bin/node"):
        if c and os.path.isfile(c):
            return c, env
    return None, env


def run_runtime(mode, effects, timeout=180):
    """Goi hop cach ly. Tra {id: ket_qua}. Khong co Node -> moi hieu ung loi (hieu ung tu viet can Node)."""
    exe, env = node_bin()
    if not exe:
        return {e["id"]: {"ok": False, "errors": ["khong tim thay Node / Electron de chay hop cach ly"]} for e in effects}
    job = json.dumps({"mode": mode, "effects": effects}, ensure_ascii=False)
    try:
        r = subprocess.run([exe, RUNTIME], input=job, capture_output=True, text=True, timeout=timeout,
                           env=env, cwd=os.path.dirname(RUNTIME))
        data = json.loads(r.stdout or "{}")
    except Exception as ex:
        msg = "hop cach ly loi: %s" % str(ex)[:200]
        return {e["id"]: {"ok": False, "errors": [msg]} for e in effects}
    return {x.get("id"): x for x in data.get("results") or []}


# ---------------------------------------------------------------------------
# BOI CANH TUNG KHOANH KHAC
# ---------------------------------------------------------------------------
def fx_moments(segments, transcript_data, emotion_map_data, key_moments_data, design=None, captions=None,
               faces=None, hook=None, user_media=None):
    """Moi segment timeline = 1 khoanh khac voi DU boi canh cua no (loi noi, cam xuc, su kien, bo cuc, chu tren
    man hinh, mat nguoi, co la hook khong) — FX-plan chon hieu ung TU boi canh nay."""
    import motion_design as MD
    f = providers._f
    scenes = [s for s in (design or {}).get("scenes") or [] if isinstance(s, dict)]
    layers = [L for L in (design or {}).get("layers") or [] if isinstance(L, dict)]
    out = []
    for i, seg in enumerate(segments or []):
        sid = seg.get("source_id", "")
        st, en = f(seg.get("start")), f(seg.get("end"))
        row = {"id": "m%d" % (i + 1), "source_id": sid, "src_start": round(st, 2), "src_end": round(en, 2),
               "timeline_start": round(f(seg.get("target_start")), 2)}
        for k in ("beat", "purpose"):
            if seg.get(k):
                row[k] = seg[k]
        row["loi_noi"] = providers._gon_loi_thoai((transcript_data or {}).get(sid), st, en)
        row["cam_xuc"] = [{"emotion": e.get("emotion"), "intensity": e.get("intensity"), "evidence": e.get("evidence", "")}
                          for e in (emotion_map_data or {}).get(sid, []) or []
                          if providers._overlap(f(e.get("start")), f(e.get("end")), st, en)]
        row["su_kien"] = [{k: m.get(k) for k in ("type", "description", "start", "end") if m.get(k) is not None}
                          for m in (key_moments_data or {}).get(sid, []) or []
                          if providers._overlap(f(m.get("start")), f(m.get("end")), st, en)]
        lays = sorted({s.get("layout") for s in scenes if s.get("source_id") in (None, sid)
                       and providers._overlap(f(s.get("src_start")), f(s.get("src_end")), st, en)} - {None})
        row["bo_cuc"] = lays or ["full"]
        chu = []
        for L in layers:
            if not (L.get("source_id") in (None, sid) and L.get("type") in ("text", "counter", "badge")
                    and providers._overlap(f(L.get("src_start")), f(L.get("src_end"), 0), st, en)):
                continue
            try:
                b = MD._bbox(dict(L, x=f(L.get("x"), 0.5), y=f(L.get("y"), 0.5),
                                  spans=[x for x in L.get("spans") or [] if isinstance(x, dict)]))
                chu.append({"text": MD._raw_text(L)[:60], "vung": [round(max(0.0, v), 3) for v in b]})
            except Exception:
                chu.append({"text": MD._raw_text(L)[:60]})
        chu += [{"text": str(c.get("text") or "")[:60]} for c in captions or [] if isinstance(c, dict) and c.get("role") == "hero"
                and c.get("source_id") in (None, sid) and providers._overlap(f(c.get("src_start")), f(c.get("src_end"), 0), st, en)]
        if chu:
            row["chu_tren_man_hinh"] = chu
        if user_media:
            # tu lieu cua nguoi dung dang hien (anh / video san pham...) -> hieu ung khong ve de len / lam roi mat
            tl = []
            ids = {it["id"]: it for it in user_media}
            for L in layers:
                if L.get("asset") in ids and L.get("type") in ("image", "video") and L.get("source_id") in (None, sid) \
                        and providers._overlap(f(L.get("src_start")), f(L.get("src_end"), 0), st, en):
                    w_ = f(L.get("w"), 0.6)
                    tl.append({"id": L["asset"], "noi_dung": ids[L["asset"]]["name"], "cach": "lop noi",
                               "vung_gan_dung": [round(f(L.get("x"), 0.5) - w_ / 2, 3), round(f(L.get("y"), 0.5), 3), round(w_, 3)]})
            for s_ in scenes:
                ref = s_.get("panel") if isinstance(s_.get("panel"), dict) else {}
                if ref.get("asset") in ids and s_.get("source_id") in (None, sid) and providers._overlap(
                        f(s_.get("src_start")), f(s_.get("src_end")), st, en):
                    tl.append({"id": ref["asset"], "noi_dung": ids[ref["asset"]]["name"], "cach": s_.get("layout")})
            if tl:
                row["tu_lieu_dang_hien"] = tl
        fc = (faces or {}).get(sid)
        if fc:
            row["mat_nguoi"] = {k: round(float(fc[k]), 3) for k in ("cx", "cy", "w", "h") if fc.get(k) is not None}
        if hook and hook.get("source_id") in (None, sid) and providers._overlap(
                f(hook.get("src_start")), f(hook.get("src_end")), st, en):
            row["la_hook"] = True
        out.append(row)
    return out


# ---------------------------------------------------------------------------
# FX-plan / FX-code / kiem / sua
# ---------------------------------------------------------------------------
def _txt(v, n=600):
    return " ".join(str(v or "").split())[:n]


def sanitize_plan(res, moments, changes):
    """Giu hieu ung CO du boi canh + muc tieu + ly do + mo ta, neo trong 1 khoanh khac, do dai / mat do hop le."""
    f = providers._f
    by_src = {}
    for m in moments:
        by_src.setdefault(m["source_id"], []).append((m["src_start"], m["src_end"]))
    out, last_tr = [], []
    raw = [e for e in (res or {}).get("effects") or [] if isinstance(e, dict)]
    for i, e in enumerate(raw):
        fid = "".join(ch for ch in str(e.get("id") or "fx%d" % (i + 1)) if ch.isalnum() or ch in "_-")[:24] or "fx%d" % (i + 1)
        if any(x["id"] == fid for x in out):
            fid = "%s_%d" % (fid, i)
        miss = [k for k in ("context", "goal", "why_fit", "visual") if len(_txt(e.get(k))) < 12]
        if miss:
            changes.append("%s: thieu %s (hieu ung phai co boi canh + muc tieu + ly do) -> bo" % (fid, ", ".join(miss)))
            continue
        kind = e.get("kind") if e.get("kind") in KINDS else "overlay"
        sid = e.get("source_id") or (moments[0]["source_id"] if moments else "source_1")
        a, b = f(e.get("src_start")), f(e.get("src_end"))
        if b - a < MIN_FX_SEC:
            b = a + MIN_FX_SEC
        if b - a > MAX_FX_SEC:
            changes.append("%s: dai %.1fs -> %.1fs" % (fid, b - a, MAX_FX_SEC))
            b = a + MAX_FX_SEC
        if not any(providers._overlap(a, b, x, y) for x, y in by_src.get(sid, [])):
            changes.append("%s: gio %.2f-%.2f khong nam trong khoanh khac nao con tren timeline -> bo" % (fid, a, b))
            continue
        anc = "hook" if e.get("anchor") == "hook" else "body"
        # ban sao hook o DAU video va doan goc trong than video trung GIO NGUON nhung khac cho tren timeline
        if kind == "transform" and any(providers._overlap(a, b, x, y) and z == anc for x, y, z in last_tr):
            changes.append("%s: chong len mot transform khac -> bo" % fid)
            continue
        cols = [c for c in (e.get("colors") or []) if isinstance(c, str) and c.strip().startswith(("#", "rgb", "hsl"))][:4]
        item = {"id": fid, "kind": kind, "layer": "behind" if (kind == "overlay" and e.get("layer") == "behind") else "front",
                "source_id": sid, "src_start": round(a, 3), "src_end": round(b, 3),
                "moment": _txt(e.get("moment"), 12), "context": _txt(e.get("context")), "goal": _txt(e.get("goal")),
                "why_fit": _txt(e.get("why_fit")), "visual": _txt(e.get("visual"), 1200), "sync": _txt(e.get("sync"), 200),
                "params": {"colors": cols, "intensity": round(max(0.1, min(1.0, f(e.get("intensity"), 0.7))), 2)}}
        if e.get("anchor") == "hook":
            item["anchor"] = "hook"
        if e.get("sfx") in ("whoosh", "swoosh", "pop", "click", "ding", "boom", "riser", "typing"):
            item["sfx"] = e["sfx"]
        if kind == "transform":
            last_tr.append((a, b, anc))
        out.append(item)
        if len(out) >= MAX_FX:
            changes.append("chi giu %d hieu ung dau" % MAX_FX)
            break
    return out


def _avoid_from_moments(e, moments, W=1080, H=1920):
    """Vung chu (px) trong khoanh khac cua hieu ung — de luot kiem chay voi ctx.avoid giong luc dung."""
    out = []
    for m in moments or []:
        if m.get("source_id") != e.get("source_id") or not providers._overlap(m["src_start"], m["src_end"], e["src_start"], e["src_end"]):
            continue
        for c in m.get("chu_tren_man_hinh") or []:
            v = c.get("vung") if isinstance(c, dict) else None
            if v:
                out.append({"x": round(v[0] * W, 1), "y": round(v[1] * H, 1), "w": round((v[2] - v[0]) * W, 1),
                            "h": round((v[3] - v[1]) * H, 1), "text": c.get("text", "")[:30]})
    return out[:12]


def _check_payload(e, faces, palette, W=1080, H=1920, fps=30, moments=None):
    fc = (faces or {}).get(e.get("source_id")) or next(iter((faces or {}).values()), None)
    face = {"x": round(fc["cx"] * W, 1), "y": round(fc["cy"] * H, 1), "w": round(fc.get("w", 0.35) * W, 1),
            "h": round(fc.get("h", 0.25) * H, 1)} if fc else None
    return {"id": e["id"], "kind": e["kind"], "code": e.get("code", ""), "duration": round(e["src_end"] - e["src_start"], 3),
            "fps": fps, "W": W, "H": H, "face": face, "params": e.get("params") or {}, "palette": palette or {},
            "avoid": _avoid_from_moments(e, moments, W, H)}


def gpt_fx_plan(moments, story=None, style=None, sources=None, existing=None, log=None, hook=None, note=None,
                step_label="FX-plan"):
    """`note`: yeu cau them cho luot goi rieng (vd hook chua co hieu ung -> chi xet khoanh khac hook)."""
    import hook_rule
    payload = {"cau_chuyen": story or {}, "phong_cach": style or {}, "khoanh_khac": moments,
               "mo_ta_nguon": sources or [], "da_co": existing or {}}
    if hook:
        payload["hook"] = hook
    if log:
        log("FX-plan: %s de xuat hieu ung tu boi canh %d khoanh khac..." % (providers.plan_ai_name(), len(moments)))
    text = providers.plan_chat([
        {"role": "system", "content": _p("_FX_PLAN_SYSTEM") + hook_rule.luat("FX") + (("\n\n" + note) if note else "")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=12000, temperature=0.5, req_timeout=300, max_attempts=2, step_label=step_label)
    return providers._safe_json(text)


def gpt_fx_code(effects, fix=None, log=None):
    """effects: hieu ung da loc (khong code). fix: {id: {"code", "errors"}} -> luot sua. Tra {id: {code, fit_check}}."""
    out = {}
    for i in range(0, len(effects), CODE_BATCH):
        part = effects[i:i + CODE_BATCH]
        rows = []
        for e in part:
            r = {k: e.get(k) for k in ("id", "kind", "layer", "context", "goal", "why_fit", "visual", "sync", "params")}
            r["do_dai_giay"] = round(e["src_end"] - e["src_start"], 2)
            if fix and e["id"] in fix:
                r["code_truoc"] = fix[e["id"]].get("code")
                r["loi_can_sua"] = fix[e["id"]].get("errors")
            rows.append(r)
        if log:
            log("%s: %s viet code %d hieu ung..." % ("FX-fix" if fix else "FX-code", providers.plan_ai_name(), len(part)))
        text = providers.plan_chat([
            {"role": "system", "content": _p("_FX_CODE_SYSTEM")},
            {"role": "user", "content": json.dumps({"effects": rows}, ensure_ascii=False)},
        ], json_mode=True, max_tokens=16000, temperature=0.3, req_timeout=300, max_attempts=2,
            step_label="FX-fix" if fix else "FX-code")
        res = providers._safe_json(text)
        got = [x for x in (res or {}).get("effects") or [] if isinstance(x, dict)]
        for j, x in enumerate(got):
            fid = x.get("id") if x.get("id") in {e["id"] for e in part} else (part[j]["id"] if j < len(part) else None)
            if fid:
                out[fid] = {"code": str(x.get("code") or ""), "fit_check": x.get("fit_check") or {}}
    return out


def build_effects(plan_res, moments, faces, palette, step, changes, log=None, emit=None):
    """plan_res (FX-plan) -> hieu ung co code DA KIEM. `step(name, payload, fn)` = cache tung buoc (server._step).
    emit(msg, level, output) -> nhat ky xu ly."""
    effects = sanitize_plan(plan_res, moments, changes)
    if not effects:
        return []
    codes = step("FX-code", {"fx": effects, "v": FX_VERSION}, lambda: gpt_fx_code(effects, log=log)) or {}
    kept = []
    for e in effects:
        c = codes.get(e["id"]) or {}
        fit = c.get("fit_check") or {}
        if fit.get("ok") is False:
            changes.append("%s: AI tu kiem lan 2 thay KHONG hop boi canh (%s) -> bo" % (e["id"], _txt(fit.get("reason"), 200)))
            continue
        if not c.get("code"):
            changes.append("%s: khong co code -> bo" % e["id"])
            continue
        kept.append(dict(e, code=c["code"], fit_reason=_txt(fit.get("reason"), 300)))
    res = run_runtime("check", [_check_payload(e, faces, palette, moments=moments) for e in kept])
    bad = {e["id"]: {"code": e["code"], "errors": (res.get(e["id"]) or {}).get("errors") or ["khong ro"]}
           for e in kept if not (res.get(e["id"]) or {}).get("ok")}
    if bad:
        if emit:
            emit("Hộp cách ly bắt lỗi %d hiệu ứng -> nhờ AI sửa: %s" % (
                len(bad), "; ".join("%s: %s" % (k, v["errors"][0]) for k, v in bad.items())[:400]), "warn", bad)
        fixes = step("FX-fix", {"bad": bad, "fx": [e for e in kept if e["id"] in bad], "v": FX_VERSION},
                     lambda: gpt_fx_code([e for e in kept if e["id"] in bad], fix=bad, log=log)) or {}
        for e in kept:
            if e["id"] in bad and (fixes.get(e["id"]) or {}).get("code"):
                e["code"] = fixes[e["id"]]["code"]
        res2 = run_runtime("check", [_check_payload(e, faces, palette, moments=moments) for e in kept if e["id"] in bad])
        for fid in list(bad):
            if (res2.get(fid) or {}).get("ok"):
                bad.pop(fid)
    out = []
    for e in kept:
        if e["id"] in bad:
            changes.append("%s: code van loi sau khi sua (%s) -> bo, video van dung duoc" % (
                e["id"], "; ".join((res2.get(e["id"]) or {}).get("errors") or bad[e["id"]]["errors"])[:200]))
            continue
        out.append(e)
    return out


# ---------------------------------------------------------------------------
# DUNG (build_spec): ve khung cho tung hieu ung
# ---------------------------------------------------------------------------
def _face_px(spec, t, W, H):
    """Tam + kich thuoc mat nguoi (px khung hinh) luc t — theo bo cuc + jump-cut zoom (clip_map)."""
    import motion_design as MD
    clip = next((c for c in spec.get("clips") or [] if c["start"] <= t < c["end"] and c.get("face")), None)
    if not clip:
        return None
    sc = MD.scene_at(spec.get("scenes") or [], t)
    fc = clip["face"]
    if sc and sc["layout"] != "full":
        fcv = MD.face_in_canvas(sc, fc, clip.get("srcW"), clip.get("srcH"), W, H)
        if not fcv:
            return None
        return {"x": round(fcv["cx"] * W, 1), "y": round(fcv["cy"] * H, 1), "w": round(fcv.get("w", 0.35) * W, 1),
                "h": round(fcv["h"] * H, 1)}
    to_c, _to_s, _kw = MD.clip_map(clip, W, H)
    sw, sh = float(clip.get("srcW") or W), float(clip.get("srcH") or H)
    s0 = max(W / sw, H / sh)
    k = float(clip.get("scale") or 1.0)
    cx, cy = to_c(float(fc.get("cx", 0.5)), float(fc.get("cy", 0.42)))
    fh = float(fc.get("h", 0.25)) * sh * s0 * k                       # px
    fw = float(fc["w"]) * sw * s0 * k if fc.get("w") else fh * 0.8
    return {"x": round(cx * W, 1), "y": round(cy * H, 1), "w": round(fw, 1), "h": round(fh, 1)}


def fx_sfx(p, changes):
    """Goi y "sfx" cua hieu ung -> muc audio (gio timeline) bang bo tieng motion."""
    import engine
    import sfx_kit
    import remotion_plan as RP
    lib = {e["id"]: e for e in engine.sfx_list()}
    out = []
    for e in p.get("fx") or []:
        if not isinstance(e, dict) or not e.get("sfx"):
            continue
        hit = RP.map_range(p, e.get("source_id"), providers._f(e.get("src_start")), providers._f(e.get("src_end")),
                           "hook" if e.get("anchor") == "hook" else "body")
        sid, path = sfx_kit.family_file(e["sfx"])
        if not hit or not sid:
            continue
        m = lib.get(sid) or {}
        out.append({"sfx_id": sid, "file": path, "start": hit[0], "purpose": "punch" if e["sfx"] in ("boom",) else "transition",
                    "_name": m.get("name"), "tags": m.get("tags") or [], "_lufs": m.get("lufs_m"), "_from_layer": e.get("id")})
    if out:
        changes.append("tu gan %d SFX theo hieu ung tu viet" % len(out))
    return out


def _avoid_in_spec(spec, st, en, W, H):
    """Vung CHU THAT (vi tri cuoi cung sau moi quy tac chu) dang hien trong [st, en] -> px."""
    import motion_design as MD
    out = []
    for L in spec.get("layers") or []:
        if L.get("type") not in ("text", "counter", "badge") or L["end"] <= st or L["start"] >= en:
            continue
        try:
            x0, y0, x1, y1 = MD._bbox(L)
        except Exception:
            continue
        out.append({"x": round(x0 * W, 1), "y": round(y0 * H, 1), "w": round((x1 - x0) * W, 1), "h": round((y1 - y0) * H, 1),
                    "text": MD._raw_text(L)[:30]})
    for c in spec.get("captions") or []:
        if c.get("role") == "hero" and c["start"] < en and c["end"] > st:
            cy = (float(c.get("y") or 0) + 1) / 2
            out.append({"x": round(0.07 * W, 1), "y": round((cy - 0.05) * H, 1), "w": round(0.86 * W, 1), "h": round(0.1 * H, 1),
                        "text": str(c.get("text") or "")[:30]})
    return out[:12]


def fx_to_spec(p, spec, changes):
    """p['fx'] (code da kiem) -> spec['fx'] (lop phu, file khung) + spec['fxTransforms'] (so tung khung).
    Khung ve san trong hop cach ly, luu cache theo (code, do dai, fps, khung, vi tri mat, tham so)."""
    import remotion_plan as RP
    items = [e for e in p.get("fx") or [] if isinstance(e, dict) and e.get("code")]
    if not items:
        return
    W, H, fps = spec["width"], spec["height"], spec["fps"]
    palette = ((p.get("style_kit") or {}).get("palette") or {}) if isinstance(p.get("style_kit"), dict) else {}
    jobs, rows = [], []
    for e in items:
        hit = RP.map_range(p, e.get("source_id"), providers._f(e.get("src_start")), providers._f(e.get("src_end")),
                           "hook" if e.get("anchor") == "hook" else "body")
        if not hit:
            changes.append("%s: gio nguon da bi cat khoi timeline -> bo hieu ung" % e.get("id"))
            continue
        st, en = hit[0], min(spec["duration"], hit[1])
        if en - st < 0.2:
            changes.append("%s: con %.2fs tren timeline -> bo" % (e.get("id"), en - st))
            continue
        dur = round(min(MAX_FX_SEC + 2, en - st), 3)
        face = _face_px(spec, st + min(0.2, dur / 2), W, H)
        job = {"id": e["id"], "kind": e.get("kind", "overlay"), "code": e["code"], "duration": dur, "fps": fps,
               "W": W, "H": H, "face": face, "params": e.get("params") or {}, "palette": palette,
               "avoid": _avoid_in_spec(spec, st, st + dur, W, H)}
        key = hashlib.sha1(json.dumps({k: job[k] for k in job if k != "id"}, sort_keys=True, ensure_ascii=False)
                           .encode("utf-8") + (b"|v%d" % FX_VERSION)).hexdigest()[:24]
        job["out"] = os.path.join(FX_CACHE, key + ".json")
        rows.append((e, job, st, key))
        if not os.path.isfile(job["out"]):
            jobs.append(job)
    res = run_runtime("frames", jobs) if jobs else {}
    for e, job, st, key in rows:
        r = res.get(job["id"]) if job in jobs else None
        if r is not None and not r.get("ok"):
            changes.append("%s: ve khung loi (%s) -> bo" % (e["id"], "; ".join(r.get("errors") or [])[:200]))
            continue
        if job["kind"] == "transform":
            if r is None:        # cache: doc lai so tu file
                try:
                    with open(job["out"], encoding="utf-8") as fh:
                        r = json.load(fh)
                except Exception:
                    changes.append("%s: cache hong -> bo" % e["id"])
                    continue
            elif not os.path.isfile(job["out"]):
                os.makedirs(FX_CACHE, exist_ok=True)
                with open(job["out"], "w", encoding="utf-8") as fh:
                    json.dump({"n": r.get("n"), "values": r.get("values") or {}}, fh)
            spec.setdefault("fxTransforms", []).append({"id": e["id"], "start": round(st, 3), "end": round(st + job["duration"], 3),
                                                         "n": r.get("n"), "values": r.get("values") or {}})
        else:
            spec.setdefault("fx", []).append({"id": e["id"], "start": round(st, 3), "end": round(st + job["duration"], 3),
                                               "layer": e.get("layer") or "front", "file": job["out"]})
    n = len(spec.get("fx") or []) + len(spec.get("fxTransforms") or [])
    if n:
        changes.append("%d hieu ung tu viet da ve khung" % n)
