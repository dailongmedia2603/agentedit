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
import re
import shutil
import subprocess
import unicodedata

import canvas as CV
import creative
import prompt_store
import providers

HERE = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.path.join(HERE, "fx_runtime.mjs")
FX_CACHE = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "fx")
FX_VERSION = 2              # 2 = khoanh khac hook rieng + kiem net ve qua mat (2026-10-16)
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
  [x0, y0, x1, y1] phan khung — hieu ung KHONG ve de len vung nay tru khi CO Y), mat_nguoi (vi tri mat 0..1 — bo cuc
  card / circle / split thi chi co ghi chu: vi tri that do luc chay = ctx.face), khung_nguoi_noi, lop_hinh_dang_co (lop
  hinh buoc thiet ke da ve o khoanh khac nay), la_hook.
  Khoanh khac "h<n>" (anchor hook) = BAN SAO HOOK o DAU video: bo cuc / chu / vi tri nguoi noi CUA CHINH ban sao do
  (thuong khac han doan goc "m<n>" cung loi noi). Hieu ung cho ban sao hook PHAI chon khoanh khac h<n> va thiet ke theo
  boi canh cua no.
- mo_ta_nguon: boi canh / san pham / nguoi trong video nguon (Gemini xem video).
- da_co: cac hieu ung / lop do hoa khac da dat (de khong chong cheo).

# CACH LAM — BAT BUOC THEO THU TU CHO MOI HIEU UNG
1. BOI CANH ("context"): doc khoanh khac do — nguoi noi DANG NOI gi (trich loi), cam xuc gi, tren man hinh
   dang co gi (bo cuc, chu, mat nguoi o dau, san pham / vat the neu mo_ta_nguon co).
2. MUC TIEU ("goal"): nguoi xem can CAM THAY / CHU Y dieu gi ngay luc do (nhan manh cau chot, tao to mo, cam
   giac soc / bat ngo, dan mat toi san pham, the hien cam xuc cua nguoi noi, chuyen y, minh hoa mot y an du...).
   Khong tim duoc muc tieu ro -> KHONG dat hieu ung o khoanh khac do.
2b. Y NGHIA ("y_nghia", bat buoc): hieu ung nay lam ro / khuech dai Y NAO dang noi (trich loi noi), hoac dan mat toi
   tu / vat nao. Khong ghi duoc y cu the -> KHONG dat.
3. VI SAO HOP ("why_fit"): giai thich hieu ung nay phuc vu muc tieu tren NHU THE NAO, nhac CU THE toi loi noi /
   cam xuc / hinh anh cua chinh khoanh khac do. Cau chung chung ("tang tinh hap dan") = KHONG dat.
4. THIET KE ("visual"): mo ta hinh anh chi tiet de viet code: hinh khoi (vet, hat, vong, anh sang, khung,
   hinh vector minh hoa...), mau (theo phong_cach / tone), vi tri so voi MAT NGUOI va khung (khong che mat —
   tru khi hieu ung CO Y bao quanh mat va trong suot), chuyen dong theo thoi gian (vao / dinh / ra), cuong do,
   dong bo voi tu / nhip nao ("sync").
4b. VI TRI: mo ta vi tri THEO QUAN HE (quanh mat, canh khoi chu X, goc trong cua khung, trong khung A-roll...) — KHONG
   chep toa do so cua khoanh khac khac; code se tinh tu ctx.face / ctx.avoid luc chay. Net / vong / vet KHONG di qua mat
   nguoi noi (he thong do: net chay qua loi mat > 0.25s -> bo).
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
- MOT Y MOT LAN: lop_hinh_dang_co / da_co.lop_hinh da ve vong / mui ten / gach cho y do -> KHONG ve lai (he thong bo).
  Khoanh / gach mot TU trong chu la viec cua lop R4 (do khung chu that), khong lam bang hieu ung.

# SCHEMA DAU RA (CHI JSON)
{
  "effects": [
    {"id": "fx1", "moment": "<id khoanh khac>", "kind": "overlay|transform", "layer": "front|behind",
     "source_id": "source_1", "src_start": 12.3, "src_end": 13.6, "anchor": null,
     "context": "<boi canh: dang noi gi (trich), cam xuc, tren man hinh co gi>",
     "goal": "<nguoi xem can cam thay / chu y gi>",
     "y_nghia": "<lam ro / khuech dai Y nao: trich loi noi>",
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
  ZOOM PHAI LA CHUYEN DONG MUOT: scale bat dau tu 1 (t = 0), ve lai 1 khi het hieu ung, doi <= 0.03 moi khung
  (vd day vao 15% can >= 0.2s, dung easing) — KHONG nhay scale trong 1 khung. Engine tu cham toc do neu vuot.
- ctx: t (giay tu luc hieu ung bat dau), d (do dai giay), p = t/d (0..1), frame, fps, W = 1080, H = 1920,
  face = {x, y, w, h} (TAM mat nguoi va kich thuoc, px tren khung; co the null), avoid = [{x, y, w, h, text}]
  (khung CHU dang hien — goc tren-trai + kich thuoc, px; vi tri THAT luc dung), params = {colors: [...],
  intensity: 0..1}, palette = mau cua phong cach (co the rong), seed = id hieu ung.
- KHONG ve de len ctx.avoid (vung chu) va mat nguoi, TRU KHI mo ta CO Y lam vay (vd gach cheo dung cum chu do):
  tinh vi tri tu ctx.avoid / ctx.face luc chay (vd dat hieu ung vao goc trong, ne cac khung chu), khong co dinh toa do.
  KHONG chep so toa do (vd "y 0.605", "x 0.96") tu mo ta vao code lam vi tri chinh: so trong mo ta la uoc luong luc
  lap ke hoach, vi tri THAT la ctx.avoid / ctx.face. Khong co ctx.avoid / ctx.face phu hop -> ve o cho trong an toan
  (goc khung, mep) hoac tra null; KHONG BAO GIO de net / vong / vet chay qua loi mat (60% giua khung ctx.face).
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
    import winsupport
    env = winsupport.node_env()        # Windows: them SYSTEMROOT / TEMP... (Node khoi dong can)
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
def _is_hook(x):
    return isinstance(x, dict) and x.get("anchor") == "hook"


def fx_moments(segments, transcript_data, emotion_map_data, key_moments_data, design=None, captions=None,
               faces=None, hook=None, user_media=None):
    """Moi segment timeline = 1 khoanh khac voi DU boi canh cua no (loi noi, cam xuc, su kien, bo cuc, chu tren
    man hinh, mat nguoi, co la hook khong) — FX-plan chon hieu ung TU boi canh nay.

    BAN SAO HOOK la khoanh khac RIENG (id "h<n>", anchor hook) voi bo cuc / chu / mat cua CHINH ban sao (2026-10-16, do
    that video Yen Phan: hieu ung hook duoc thiet ke theo boi canh than video — chu o y 0.62-0.74, video toan khung —
    trong khi ban sao hook dat chu o tren va thu video vao the o duoi -> vong ve cat ngang mat nguoi noi)."""
    f = providers._f
    scenes = [s for s in (design or {}).get("scenes") or [] if isinstance(s, dict)]
    layers = [L for L in (design or {}).get("layers") or [] if isinstance(L, dict)]
    caps = [c for c in captions or [] if isinstance(c, dict)]
    hk = hook if isinstance(hook, dict) and hook.get("src_start") is not None else None

    def row_for(rid, sid, st, en, seg, in_hook):
        row = {"id": rid, "source_id": sid, "src_start": round(st, 2), "src_end": round(en, 2)}
        if in_hook:
            row["anchor"] = "hook"
            row["vi_tri"] = "BAN SAO HOOK o DAU video (0-%.1fs) — bo cuc / chu rieng, khac doan goc trong than video" % (
                max(0.5, f(hk.get("src_end")) - f(hk.get("src_start"))))
        else:
            row["timeline_start"] = round(f(seg.get("target_start")), 2)
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
        # chi lay bo cuc / lop / chu CUA DUNG phan (hook hoac than video) — hai phan trung gio nguon
        mine = (lambda x: _is_hook(x)) if in_hook else (lambda x: not _is_hook(x))
        sc_here = [s for s in scenes if mine(s) and s.get("source_id") in (None, sid)
                   and providers._overlap(f(s.get("src_start")), f(s.get("src_end")), st, en)]
        lays = sorted({s.get("layout") for s in sc_here} - {None})
        row["bo_cuc"] = lays or ["full"]
        aroll = [{"layout": s.get("layout"), "card_y": s.get("card_y")} for s in sc_here
                 if s.get("layout") in ("card", "circle", "split") and s.get("card_y") is not None]
        if aroll:
            row["khung_nguoi_noi"] = aroll
        chu = []
        for L in layers:
            if not (mine(L) and L.get("source_id") in (None, sid) and L.get("type") in ("text", "counter", "badge")
                    and providers._overlap(f(L.get("src_start")), f(L.get("src_end"), 0), st, en)):
                continue
            try:
                b = MD._bbox(dict(L, x=f(L.get("x"), 0.5), y=f(L.get("y"), 0.5),
                                  spans=[x for x in L.get("spans") or [] if isinstance(x, dict)]))
                chu.append({"text": MD._raw_text(L)[:60], "vung": [round(max(0.0, v), 3) for v in b]})
            except Exception:
                chu.append({"text": MD._raw_text(L)[:60]})
        chu += [{"text": str(c.get("text") or "")[:60]} for c in caps if c.get("role") == "hero" and mine(c)
                and c.get("source_id") in (None, sid) and providers._overlap(f(c.get("src_start")), f(c.get("src_end"), 0), st, en)]
        if in_hook and hk.get("caption") and not any(_is_hook(L) for L in layers):
            chu.append({"text": str(hk["caption"])[:60]})
        if chu:
            row["chu_tren_man_hinh"] = chu
        hinh = [{k: L.get(k) for k in ("type", "why") if L.get(k)} for L in layers
                if mine(L) and L.get("type") not in ("text", "counter", "badge") and L.get("source_id") in (None, sid)
                and providers._overlap(f(L.get("src_start")), f(L.get("src_end"), 0), st, en)]
        if hinh:
            row["lop_hinh_dang_co"] = hinh[:6]
        if user_media:
            tl = []
            ids = {it["id"]: it for it in user_media}
            for L in layers:
                if L.get("asset") in ids and L.get("type") in ("image", "video") and L.get("source_id") in (None, sid) \
                        and mine(L) and providers._overlap(f(L.get("src_start")), f(L.get("src_end"), 0), st, en):
                    w_ = f(L.get("w"), 0.6)
                    tl.append({"id": L["asset"], "noi_dung": ids[L["asset"]]["name"], "cach": "lop noi",
                               "vung_gan_dung": [round(f(L.get("x"), 0.5) - w_ / 2, 3), round(f(L.get("y"), 0.5), 3), round(w_, 3)]})
            for s_ in sc_here:
                ref = s_.get("panel") if isinstance(s_.get("panel"), dict) else {}
                if ref.get("asset") in ids:
                    tl.append({"id": ref["asset"], "noi_dung": ids[ref["asset"]]["name"], "cach": s_.get("layout")})
            if tl:
                row["tu_lieu_dang_hien"] = tl
        fc = (faces or {}).get(sid)
        if fc and row["bo_cuc"] == ["full"]:
            row["mat_nguoi"] = {k: round(float(fc[k]), 3) for k in ("cx", "cy", "w", "h") if fc.get(k) is not None}
        elif fc:
            # mat o khung NGUON khong con dung khi A-roll thu vao the / khung tron / nua khung -> chi bao do luc chay
            row["mat_nguoi"] = "bo cuc %s: nguoi noi nam TRONG khung A-roll, KHONG o toa do nguon — vi tri that = ctx.face " \
                               "luc chay (code bat buoc dung ctx.face, khong dat toa do co dinh)" % "/".join(row["bo_cuc"])
        if in_hook or (hk and hk.get("source_id") in (None, sid) and providers._overlap(
                f(hk.get("src_start")), f(hk.get("src_end")), st, en)):
            row["la_hook"] = True
        return row

    out = []
    import motion_design as MD
    for i, seg in enumerate(segments or []):
        sid = seg.get("source_id", "")
        st, en = f(seg.get("start")), f(seg.get("end"))
        out.append(row_for("m%d" % (i + 1), sid, st, en, seg, False))
    if hk:
        sid_h = hk.get("source_id") or (segments[0].get("source_id") if segments else "")
        a, b = f(hk.get("src_start")), f(hk.get("src_end"))
        n = 0
        for seg in segments or []:
            if seg.get("source_id", "") != sid_h:
                continue
            st, en = max(a, f(seg.get("start"))), min(b, f(seg.get("end")))
            if en - st > 0.05:
                n += 1
                out.append(row_for("h%d" % n, sid_h, st, en, seg, True))
    return out


# Y HINH trung giua hieu ung tu viet va lop hinh R4 (cung khoanh khac): vong / mui ten / gach
_MOTIF = {
    "ring": r"\bvong\b|khoanh|om (lay|quanh)|\bloop\b|circle|ellipse|bau duc|hat dau|vong khep",
    "arrow": r"mui ten|\barrow",
    "line": r"gach chan|gach duoi|underline|net gach|duong ke duoi",
}


def _plain(s):
    """Bo dau tieng Viet + thuong hoa (so khop tu khoa tren mo ta co dau / khong dau)."""
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


# Cum PHU DINH ("khong phai vong", "thay vi gach chan") khong tinh la ve mo tip do
_NEG_RE = re.compile(r"(chu khong phai|khong phai|khong co|khong|thay vi|tranh|chu khong|not|no|without|instead of)"
                     r"\s+[^.,;:()\n]{0,40}")


def drop_dup_motifs(fx_list, layers, changes):
    """MOT Y CHI MOT LAN (2026-10-16, do that video Yen Phan: y 'vong khep quanh others' xuat hien 3 lan cung luc — vong R4
    o hook, vong hieu ung tu viet o hook, vong R4 o than video): hieu ung LOP PHU ve lai DUNG loai hinh ma lop thiet ke R4
    da ve trong CUNG khoanh khac (cung phan hook / than, gio nguon chong nhau) -> bo hieu ung (lop R4 dat theo chu that,
    con hieu ung ve toa do doan). Tra danh sach con lai."""
    f = providers._f
    keep = []
    for e in fx_list or []:
        if e.get("kind") != "overlay":
            keep.append(e)
            continue
        txt = _plain(" ".join(str(e.get(k) or "") for k in ("visual", "goal", "why_fit")))
        txt = _NEG_RE.sub(" ", txt)
        hook = e.get("anchor") == "hook"
        dup = None
        for typ, rx in _MOTIF.items():
            if not re.search(rx, txt):
                continue
            for L in layers or []:
                if not isinstance(L, dict) or L.get("type") != typ or (L.get("anchor") == "hook") != hook:
                    continue
                if L.get("source_id") not in (None, e.get("source_id")):
                    continue
                if providers._overlap(f(L.get("src_start")), f(L.get("src_end"), f(L.get("src_start")) + 1),
                                      f(e.get("src_start")), f(e.get("src_end"))):
                    dup = (typ, L.get("id"))
                    break
            if dup:
                break
        if dup:
            changes.append("%s: ve lai '%s' trung y voi lop %s cua buoc thiet ke cung khoanh khac -> bo (mot y mot lan)" % (
                e.get("id"), dup[0], dup[1]))
            continue
        keep.append(e)
    return keep


def moment_anchor(e, moments):
    """Neo cua hieu ung theo KHOANH KHAC no chon: khoanh khac hook (h<n>) -> 'hook'. AI ghi anchor hook nhung chon
    khoanh khac than video -> doi sang khoanh khac hook trung gio (boi canh ve dung ban sao hook)."""
    mid = str(e.get("moment") or "")
    by = {m["id"]: m for m in moments or []}
    m = by.get(mid)
    if m and m.get("anchor") == "hook":
        return "hook", mid
    if e.get("anchor") == "hook":
        f = providers._f
        h = next((x for x in moments or [] if x.get("anchor") == "hook" and x.get("source_id") == e.get("source_id")
                  and providers._overlap(x["src_start"], x["src_end"], f(e.get("src_start")), f(e.get("src_end")))), None)
        return "hook", (h["id"] if h else mid)
    return "body", mid


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
        miss = [k for k in ("context", "goal", "why_fit", "visual", "y_nghia") if len(_txt(e.get(k))) < 12]
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
        anc, mid = moment_anchor(dict(e, source_id=sid, src_start=a, src_end=b), moments)
        # ban sao hook o DAU video va doan goc trong than video trung GIO NGUON nhung khac cho tren timeline
        if kind == "transform" and any(providers._overlap(a, b, x, y) and z == anc for x, y, z in last_tr):
            changes.append("%s: chong len mot transform khac -> bo" % fid)
            continue
        cols = [c for c in (e.get("colors") or []) if isinstance(c, str) and c.strip().startswith(("#", "rgb", "hsl"))][:4]
        item = {"id": fid, "kind": kind, "layer": "behind" if (kind == "overlay" and e.get("layer") == "behind") else "front",
                "source_id": sid, "src_start": round(a, 3), "src_end": round(b, 3),
                "moment": _txt(mid, 12), "context": _txt(e.get("context")), "goal": _txt(e.get("goal")),
                "why_fit": _txt(e.get("why_fit")), "visual": _txt(e.get("visual"), 1200), "sync": _txt(e.get("sync"), 200),
                "params": {"colors": cols, "intensity": round(max(0.1, min(1.0, f(e.get("intensity"), 0.7))), 2)}}
        if anc == "hook":
            item["anchor"] = "hook"
        if len(_txt(e.get("y_nghia"))) >= 12:
            item["y_nghia"] = _txt(e.get("y_nghia"), 300)
        import ref_pack
        pk = ref_pack.current()
        if pk and e.get("theo_mau") in {x["id"] for x in pk.get("hieu_ung") or []}:
            item["theo_mau"] = e["theo_mau"]      # tai hien hieu ung video mau -> FX-code xem dung anh do
        if e.get("sfx") in ("whoosh", "swoosh", "pop", "click", "ding", "boom", "riser", "typing"):
            item["sfx"] = e["sfx"]
        if kind == "transform":
            last_tr.append((a, b, anc))
        out.append(item)
        if len(out) >= MAX_FX:
            changes.append("chi giu %d hieu ung dau" % MAX_FX)
            break
    return out


def _avoid_from_moments(e, moments, W=None, H=None):
    """Vung chu (px) trong khoanh khac cua hieu ung — de luot kiem chay voi ctx.avoid giong luc dung."""
    W, H = W or CV.size()[0], H or CV.size()[1]
    out = []
    hook = e.get("anchor") == "hook"
    for m in moments or []:
        if m.get("source_id") != e.get("source_id") or not providers._overlap(m["src_start"], m["src_end"], e["src_start"], e["src_end"]):
            continue
        if (m.get("anchor") == "hook") != hook:
            continue                      # ban sao hook va doan goc trung gio nguon nhung khac bo cuc / chu
        for c in m.get("chu_tren_man_hinh") or []:
            v = c.get("vung") if isinstance(c, dict) else None
            if v:
                out.append({"x": round(v[0] * W, 1), "y": round(v[1] * H, 1), "w": round((v[2] - v[0]) * W, 1),
                            "h": round((v[3] - v[1]) * H, 1), "text": c.get("text", "")[:30]})
    return out[:12]


def _check_payload(e, faces, palette, W=None, H=None, fps=30, moments=None):
    W, H = W or CV.size()[0], H or CV.size()[1]
    fc = (faces or {}).get(e.get("source_id")) or next(iter((faces or {}).values()), None)
    face = {"x": round(fc["cx"] * W, 1), "y": round(fc["cy"] * H, 1), "w": round(fc.get("w", 0.35) * W, 1),
            "h": round(fc.get("h", 0.25) * H, 1)} if fc else None
    return {"id": e["id"], "kind": e["kind"], "code": e.get("code", ""), "duration": round(e["src_end"] - e["src_start"], 3),
            "fps": fps, "W": W, "H": H, "face": face, "params": e.get("params") or {}, "palette": palette or {},
            "avoid": _avoid_from_moments(e, moments, W, H)}


def gpt_fx_plan(moments, story=None, style=None, sources=None, existing=None, log=None, hook=None, note=None,
                step_label="FX-plan", brand=None):
    """`note`: yeu cau them cho luot goi rieng (vd hook chua co hieu ung -> chi xet khoanh khac hook).
    `brand`: Brand Guideline (ngon ngu chuyen dong + mau + do hoa) — khong co thi prompt / payload y nhu truoc."""
    import brand_guide
    import hook_rule
    payload = {"cau_chuyen": story or {}, "phong_cach": style or {}, "khoanh_khac": moments,
               "mo_ta_nguon": sources or [], "da_co": existing or {}}
    if hook:
        payload["hook"] = hook
    if brand_guide.view(brand, "fx"):
        payload["brand_guideline"] = brand_guide.view(brand, "fx")
        note = ((note + "\n") if note else "") + brand_guide.rule_text(brand, "fx")
    import ref_pack
    ref_imgs = ref_pack.step_images("FX-plan")
    if ref_imgs:
        payload["anh_tham_chieu"] = ref_pack.step_view("FX-plan")
    if log:
        log("FX-plan: %s de xuat hieu ung tu boi canh %d khoanh khac%s..." % (
            providers.plan_ai_name(), len(moments), " (xem %d anh hieu ung video mau)" % len(ref_imgs) if ref_imgs else ""))
    text = providers.plan_chat([
        {"role": "system", "content": _p("_FX_PLAN_SYSTEM") + hook_rule.luat("FX") + creative.luat("FX")
         + CV.note("fx") + ref_pack.rule("FX-plan") * bool(ref_imgs) + (("\n\n" + note) if note else "")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=12000, temperature=0.5, req_timeout=300, max_attempts=2, step_label=step_label,
        images=ref_imgs or None)
    return providers._safe_json(text)


def gpt_fx_code(effects, fix=None, log=None, brand=None, cands=None):
    """effects: hieu ung da loc (khong code). fix: {id: {"code", "errors"}} -> luot sua. Tra {id: {code, fit_check}}.
    cands (Kho hieu ung, fx_lib.candidates_for): {id: [muc kho]} -> hieu ung co ung vien nhan kem "kho_ung_vien";
    AI tra {"reuse": lib_id} (dung nguyen, khong code) / {"from": lib_id, "code"} (sua nhe) / code moi.
    Lo khong co ung vien nao -> system prompt + payload y nhu truoc."""
    import fx_lib
    out = {}
    for i in range(0, len(effects), CODE_BATCH):
        part = effects[i:i + CODE_BATCH]
        part_cands = fx_lib.limit_batch(cands, [e["id"] for e in part]) if (cands and not fix) else {}
        rows = []
        for e in part:
            r = {k: e.get(k) for k in ("id", "kind", "layer", "context", "goal", "why_fit", "visual", "sync", "params")}
            if e.get("theo_mau"):
                r["theo_mau"] = e["theo_mau"]
            r["do_dai_giay"] = round(e["src_end"] - e["src_start"], 2)
            if fix and e["id"] in fix:
                r["code_truoc"] = fix[e["id"]].get("code")
                r["loi_can_sua"] = fix[e["id"]].get("errors")
            if part_cands.get(e["id"]):
                r["kho_ung_vien"] = [fx_lib.prompt_view(c) for c in part_cands[e["id"]]]
            rows.append(r)
        if log:
            log("%s: %s viet code %d hieu ung%s..." % (
                "FX-fix" if fix else "FX-code", providers.plan_ai_name(), len(part),
                " (%d co ung vien trong Kho hieu ung)" % len(part_cands) if part_cands else ""))
        import brand_guide
        user = {"effects": rows}
        if brand_guide.view(brand, "fx"):
            user["brand_guideline"] = brand_guide.view(brand, "fx")
        system = _p("_FX_CODE_SYSTEM") + brand_guide.rule_text(brand, "fx") + CV.note("fx")
        if part_cands:
            system += "\n\n" + fx_lib._p("_FX_REUSE_NOTE")
        # CHI anh hieu ung goc cua cac hieu ung TRONG LO NAY co "theo_mau" (ref_pack)
        import ref_pack
        ref_imgs = ref_pack.step_images("FX-code", [e.get("theo_mau") for e in part if e.get("theo_mau")])
        if ref_imgs:
            system += ref_pack.rule("FX-code")
        text = providers.plan_chat([
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ], json_mode=True, max_tokens=16000, temperature=0.3, req_timeout=300, max_attempts=2,
            step_label="FX-fix" if fix else "FX-code", images=ref_imgs or None)
        res = providers._safe_json(text)
        got = [x for x in (res or {}).get("effects") or [] if isinstance(x, dict)]
        for j, x in enumerate(got):
            fid = x.get("id") if x.get("id") in {e["id"] for e in part} else (part[j]["id"] if j < len(part) else None)
            if not fid:
                continue
            row = {"code": str(x.get("code") or ""), "fit_check": x.get("fit_check") or {}}
            ok_ids = {c["id"] for c in part_cands.get(fid) or []}
            if x.get("reuse") in ok_ids and not row["code"]:
                row["reuse"] = x["reuse"]
                if isinstance(x.get("params"), dict):
                    row["params"] = x["params"]
            elif x.get("from") in ok_ids and row["code"]:
                row["from"] = x["from"]
            elif x.get("reuse") and not row["code"]:
                row["reuse_bad"] = str(x.get("reuse"))[:40]
            out[fid] = row
    return out


def _lib_params(base, got):
    """params AI tra khi dung nguyen hieu ung kho (mau / cuong do cho video nay) — loc nhu sanitize_plan."""
    f = providers._f
    out = dict(base or {})
    if not isinstance(got, dict):
        return out
    cols = [c for c in (got.get("colors") or []) if isinstance(c, str) and c.strip().startswith(("#", "rgb", "hsl"))][:4]
    if cols:
        out["colors"] = cols
    if got.get("intensity") is not None:
        out["intensity"] = round(max(0.1, min(1.0, f(got.get("intensity"), out.get("intensity", 0.7)))), 2)
    return out


def _lib_candidates(effects, project, changes, faces=None):
    """Ung vien Kho hieu ung cho tung hieu ung (loc bang code). Loi doc kho -> khong co ung vien (nhu truoc)."""
    try:
        import fx_lib
        return fx_lib.candidates_for(effects, exclude_project=project, has_face=bool(faces))
    except Exception as ex:          # kho hong khong duoc lam hong lap plan
        changes.append("Kho hieu ung: khong doc duoc (%s) -> viet code moi nhu thuong" % str(ex)[:120])
        return {}


def build_effects(plan_res, moments, faces, palette, step, changes, log=None, emit=None, brand=None, project=None):
    """plan_res (FX-plan) -> hieu ung co code DA KIEM. `step(name, payload, fn)` = cache tung buoc (server._step).
    emit(msg, level, output) -> nhat ky xu ly. project: du an dang lap plan (khong lay ung vien kho sinh tu chinh no)."""
    effects = sanitize_plan(plan_res, moments, changes)
    if not effects:
        return []
    import brand_guide
    bv = brand_guide.view(brand, "fx")
    k_code = {"fx": effects, "v": FX_VERSION}
    if any(e.get("theo_mau") for e in effects):
        import ref_pack
        k_code["pack"] = ref_pack.step_fp()      # anh hieu ung goc doi -> code lai (chi khi co hieu ung theo mau)
    if bv:
        k_code["brand"] = bv          # chi them khi co Brand Guideline -> du an khong co giu khoa cache cu
    cands = _lib_candidates(effects, project, changes, faces)
    if cands:
        import fx_lib
        k_code["kho"] = fx_lib.cache_key(cands)    # chi khi co ung vien -> kho trong giu nguyen khoa cache cu
    k_code = CV.keyed(k_code)         # khung ngang: code ve theo 1920x1080 (khung doc giu khoa cu)
    codes = step("FX-code", k_code, lambda: gpt_fx_code(effects, log=log, brand=brand, cands=cands)) or {}
    kept = []
    for e in effects:
        c = codes.get(e["id"]) or {}
        fit = c.get("fit_check") or {}
        if fit.get("ok") is False:
            changes.append("%s: AI tu kiem lan 2 thay KHONG hop boi canh (%s) -> bo" % (e["id"], _txt(fit.get("reason"), 200)))
            continue
        extra = {}
        if c.get("reuse"):
            import fx_lib
            code = fx_lib.load_code(c["reuse"])
            if not code:
                changes.append("%s: hieu ung kho %s khong con code -> bo" % (e["id"], c["reuse"]))
                continue
            x = next((y for y in cands.get(e["id"]) or [] if y["id"] == c["reuse"]), {})
            extra = {"code": code, "params": _lib_params(e.get("params"), c.get("params")),
                     "lib": {"id": c["reuse"], "mode": "reuse", "name": ((x.get("label") or {}).get("name") or "")[:80]}}
        elif c.get("from") and c.get("code"):
            x = next((y for y in cands.get(e["id"]) or [] if y["id"] == c["from"]), {})
            extra = {"code": c["code"], "lib": {"id": c["from"], "mode": "adapt",
                                                "name": ((x.get("label") or {}).get("name") or "")[:80]}}
        elif c.get("code"):
            extra = {"code": c["code"]}
        else:
            changes.append("%s: khong co code%s -> bo" % (
                e["id"], " (AI chon hieu ung kho '%s' khong nam trong ung vien)" % c["reuse_bad"] if c.get("reuse_bad") else ""))
            continue
        kept.append(dict(e, fit_reason=_txt(fit.get("reason"), 300), **extra))
    if emit and any(k.get("lib") for k in kept):
        emit("Kho hiệu ứng: %s" % "; ".join(
            "%s %s '%s'" % (k["id"], "dùng lại nguyên" if k["lib"]["mode"] == "reuse" else "sửa nhẹ từ",
                            k["lib"].get("name") or k["lib"]["id"]) for k in kept if k.get("lib")),
             "ok", [{"id": k["id"], "lib": k["lib"]} for k in kept if k.get("lib")])
    res = run_runtime("check", [_check_payload(e, faces, palette, moments=moments) for e in kept])
    bad = {e["id"]: {"code": e["code"], "errors": (res.get(e["id"]) or {}).get("errors") or ["khong ro"]}
           for e in kept if not (res.get(e["id"]) or {}).get("ok")}
    if bad:
        if emit:
            emit("Hộp cách ly bắt lỗi %d hiệu ứng -> nhờ AI sửa: %s" % (
                len(bad), "; ".join("%s: %s" % (k, v["errors"][0]) for k, v in bad.items())[:400]), "warn", bad)
        k_fix = {"bad": bad, "fx": [e for e in kept if e["id"] in bad], "v": FX_VERSION}
        if bv:
            k_fix["brand"] = bv
        fixes = step("FX-fix", CV.keyed(k_fix),
                     lambda: gpt_fx_code([e for e in kept if e["id"] in bad], fix=bad, log=log, brand=brand)) or {}
        for e in kept:
            if e["id"] in bad and (fixes.get(e["id"]) or {}).get("code"):
                e["code"] = fixes[e["id"]]["code"]
                if (e.get("lib") or {}).get("mode") == "reuse":
                    e["lib"] = dict(e["lib"], mode="adapt")     # code kho da bi sua -> la bien the moi
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
COVER_FACE_ALPHA, COVER_FACE_SEC = 0.55, 0.3     # mat bi phu duc trung binh >= 55% qua 0.3s -> che mat
COVER_FULL_ALPHA, COVER_FULL_FRAC, COVER_FULL_SEC = 0.8, 0.45, 0.4   # >= 45% khung phu duc (>= 0.8) qua 0.4s -> che khung
# NET VE CAT QUA MAT (2026-10-16, do that video Yen Phan: vong 'hat dau' 3.5px chay ngang mat trong hook — phu trung binh
# chi ~3% nen luat 55% khong bat): LOI mat (60% giua khung mat) co net >= 0.3 alpha chiem 1.5% - 55% qua 0.25s -> vi pham.
# Tren 55% = lop PHU DEU (loe sang / phu mau toan khung) — luat che mat / phu khung o tren lo, khong phai net ve (do lai
# 26 du an: 2 loe sang 0.3s bi bat nham khi khong co tran). Hieu ung CO Y bao quanh mat (vong ngoai mat) van duoc.
COVER_LINE_ALPHA, COVER_LINE_FRAC, COVER_LINE_MAX, COVER_LINE_SEC, COVER_CORE = 0.3, 0.015, 0.55, 0.25, 0.6
_COVER_CACHE = {}


def cover_check(path, face, W, H):
    """KIEM DO CHE PHU cua lop phu tu viet (layer front) — do that 2026-10-15: FX ve 'luoi o Zoom' bang lop xam DUC toan
    khung -> nguoi noi bi che kin trong hook va 2 doan 9s. Raster cac khung (hook_rule._raster), do: mat nguoi (vung mat
    px) bi phu duc trung binh >= COVER_FACE_ALPHA lien tuc > COVER_FACE_SEC, hoac >= COVER_FULL_FRAC khung phu duc lien
    tuc > COVER_FULL_SEC (loe sang ngan khi chuyen canh van duoc). Tra ly do (chuoi) neu vi pham, None neu dat / khong do
    duoc (khong raster duoc -> khong chan)."""
    key = (path, json.dumps(face, sort_keys=True), W, H)
    if key in _COVER_CACHE:
        return _COVER_CACHE[key]
    res = None
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        frames, idx, fps = d["frames"], d["idx"], float(d.get("fps") or 30)
        import numpy as np
        import hook_rule
        n = len(idx)
        rw = 432                                              # du net de thay vet ve 3-4px (khung 1080)
        rh = max(64, int(round(rw * float(H) / float(W))))
        step = max(1, int(round(fps / 10.0)))                 # ~10 mau / giay
        dt = step / fps
        run_face = run_full = run_line = 0.0
        worst_face = worst_full = worst_line = 0.0
        for i in range(0, n, step):
            j = idx[i]
            fr = frames[j] if 0 <= j < len(frames) else ""
            a = hook_rule._raster(fr, rw, rh) if fr and "<" in fr else None
            if a is None:
                run_face = run_full = run_line = 0.0
                continue
            al = a[..., 3]
            full = float((al >= COVER_FULL_ALPHA).mean())
            fa = fl = 0.0
            if face:
                x0 = int(max(0, (face["x"] - face["w"] / 2) / W * rw)); x1 = int(min(rw, (face["x"] + face["w"] / 2) / W * rw))
                y0 = int(max(0, (face["y"] - face["h"] / 2) / H * rh)); y1 = int(min(rh, (face["y"] + face["h"] / 2) / H * rh))
                if x1 > x0 and y1 > y0:
                    fa = float(al[y0:y1, x0:x1].mean())
                cw_, ch_ = face["w"] * COVER_CORE / 2, face["h"] * COVER_CORE / 2
                cx0 = int(max(0, (face["x"] - cw_) / W * rw)); cx1 = int(min(rw, (face["x"] + cw_) / W * rw))
                cy0 = int(max(0, (face["y"] - ch_) / H * rh)); cy1 = int(min(rh, (face["y"] + ch_) / H * rh))
                if cx1 > cx0 and cy1 > cy0:
                    fl = float((al[cy0:cy1, cx0:cx1] >= COVER_LINE_ALPHA).mean())
            run_face = run_face + dt if fa >= COVER_FACE_ALPHA else 0.0
            run_full = run_full + dt if full >= COVER_FULL_FRAC else 0.0
            run_line = run_line + dt if COVER_LINE_FRAC <= fl <= COVER_LINE_MAX else 0.0
            worst_face, worst_full = max(worst_face, run_face), max(worst_full, run_full)
            worst_line = max(worst_line, run_line)
        if worst_face > COVER_FACE_SEC:
            res = "che mat nguoi noi %.1fs" % worst_face
        elif worst_line > COVER_LINE_SEC:
            res = "net ve chay qua mat nguoi noi %.1fs" % worst_line
        elif worst_full > COVER_FULL_SEC:
            res = "phu duc >= %d%% khung %.1fs" % (int(COVER_FULL_FRAC * 100), worst_full)
    except Exception:
        res = None
    _COVER_CACHE[key] = res
    return res


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
    s0 = MD.fit_scale(clip, W, H)
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


ZOOM_MAX_STEP = 0.03        # scale doi toi da moi khung (30fps) — GIU KHOP remotion_plan.ZOOM_MAX_STEP


_NEUTRAL = {"scale": 1.0, "x": 0.0, "y": 0.0, "rotate": 0.0, "blur": 0.0, "brightness": 1.0, "contrast": 1.0,
            "saturate": 1.0, "hueRotate": 0.0}
_BOOST_CAP = {"scale": (0.6, 1.6), "rotate": (-25.0, 25.0), "blur": (0.0, 30.0), "brightness": (0.3, 2.2),
              "contrast": (0.4, 2.2), "saturate": (0.0, 3.0)}


def boost_values(values, gain):
    """KHUECH DAI chuyen dong khung da tinh (luat hook, 2026-10-15): do lech so voi khung goc x gain cho moi kenh
    (scale, x, y, xoay, nhoe, sang...). Dung khi hieu ung hook AI tu viet con YEU -> manh len
    ma van giu dung hinh dang chuyen dong, thay vi chen zoom_punch / flash / shake trong kho. Doc lap voi code AI (code
    co the tu kep params.intensity). Tren / duoi gioi han an toan; zoom muot (smooth_scale) van ap sau do."""
    try:
        g = float(gain or 1.0)
    except (TypeError, ValueError):
        return values
    if abs(g - 1.0) < 1e-6 or not isinstance(values, dict):
        return values
    out = dict(values)
    for k, arr in values.items():
        if k not in _NEUTRAL or not isinstance(arr, list):
            continue
        base = _NEUTRAL[k]
        lo, hi = _BOOST_CAP.get(k, (-1e9, 1e9))
        out[k] = [round(min(hi, max(lo, base + (float(v) - base) * g)), 4) for v in arr]
    # dich x / y lon hon phan phong to thi lo mep khung -> phong them cho vua (giu khung luon kin)
    if isinstance(out.get("scale"), list) and (isinstance(out.get("x"), list) or isinstance(out.get("y"), list)):
        n = len(out["scale"])
        xs = out.get("x") if isinstance(out.get("x"), list) else [0.0] * n
        ys = out.get("y") if isinstance(out.get("y"), list) else [0.0] * n
        sc = []
        for i, s0 in enumerate(out["scale"]):
            x = abs(float(xs[min(i, len(xs) - 1)])) if xs else 0.0
            y = abs(float(ys[min(i, len(ys) - 1)])) if ys else 0.0
            need = 1.0 + 2.0 * max(x / 1080.0, y / 1920.0)
            sc.append(round(min(1.6, max(float(s0), need)), 4))
        out["scale"] = sc
    return out


def smooth_scale(values, fps=30):
    """Luat ZOOM MUOT (2026-10-01) cho hieu ung bien doi khung TU VIET: code AI co the nhay scale trong 1 khung
    (vd 1 -> 1.2 ngay khung dau, hoac tat hieu ung khi khung dang phong) = 'zoom giat'. Gioi han toc do doi scale
    moi khung (<= ZOOM_MAX_STEP @30fps) theo CA HAI chieu, truoc hieu ung va sau hieu ung la 1.0 (khung goc)
    -> zoom vao / ra luon la chuyen dong. Tra (values_moi, so_khung_da_sua). Khong dung x / y / rotate (rung)."""
    arr = (values or {}).get("scale")
    if not isinstance(arr, list) or not arr:
        return values, 0
    r = ZOOM_MAX_STEP * 30.0 / float(fps or 30)
    x = [float(v) for v in arr]
    y, prev = [], 1.0
    for v in x:                                    # xuoi: bat dau tu khung goc
        prev = min(prev + r, max(prev - r, v))
        y.append(prev)
    nxt = 1.0
    for i in range(len(y) - 1, -1, -1):            # nguoc: ket thuc ve khung goc
        nxt = min(nxt + r, max(nxt - r, y[i]))
        y[i] = nxt
    n = sum(1 for a_, b_ in zip(x, y) if abs(a_ - b_) > 1e-4)
    if not n:
        return values, 0
    out = dict(values)
    out["scale"] = [round(v, 4) for v in y]
    return out, n


def _brand_frames(path, brand_hex):
    """Brand Guideline co ma mau -> ban sao khung ve san da dua mau NOI ve he mau thuong hieu (file goc trong cache
    giu nguyen; ban sao cung thu muc cache/fx de may chu media phuc vu). Loi doc / ghi -> dung file goc."""
    if not brand_hex or not path or not os.path.isfile(path):
        return path
    import brand_guide
    out = path[:-5] + "-b" + hashlib.sha1("|".join(brand_hex).encode("utf-8")).hexdigest()[:10] + ".json"
    if os.path.isfile(out):
        return out
    try:
        with open(path, encoding="utf-8") as fh:
            d = json.load(fh)
        d["frames"] = [brand_guide.snap_svg(f, brand_hex) for f in d.get("frames") or []]
        tmp = out + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
        os.replace(tmp, out)
        return out
    except (OSError, ValueError, TypeError):
        return path


def fx_to_spec(p, spec, changes):
    """p['fx'] (code da kiem) -> spec['fx'] (lop phu, file khung) + spec['fxTransforms'] (so tung khung).
    Khung ve san trong hop cach ly, luu cache theo (code, do dai, fps, khung, vi tri mat, tham so)."""
    import remotion_plan as RP
    items = [e for e in p.get("fx") or [] if isinstance(e, dict) and e.get("code")]
    if not items:
        return
    W, H, fps = spec["width"], spec["height"], spec["fps"]
    palette = ((p.get("style_kit") or {}).get("palette") or {}) if isinstance(p.get("style_kit"), dict) else {}
    import brand_guide
    brand_hex = brand_guide.hexes(p.get("brand_guide"))
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
            vals = boost_values(r.get("values") or {}, e.get("_boost"))
            if e.get("_boost"):
                changes.append("%s: luat hook — khuech dai chuyen dong x%.1f (giu y tuong cua hieu ung)" % (e["id"], float(e["_boost"])))
            vals, n_fix = smooth_scale(vals, fps)
            if n_fix:
                changes.append("%s: zoom muot — gioi han toc do doi scale (%d khung)" % (e["id"], n_fix))
            spec.setdefault("fxTransforms", []).append({"id": e["id"], "start": round(st, 3), "end": round(st + job["duration"], 3),
                                                         "n": r.get("n"), "values": vals})
        else:
            if (e.get("layer") or "front") != "behind":
                bad = cover_check(job["out"], job.get("face"), W, H)
                if bad:
                    changes.append("%s: %s -> bo hieu ung (lop phu khong duoc che nguoi noi / ca khung)" % (e["id"], bad))
                    continue
            spec.setdefault("fx", []).append({"id": e["id"], "start": round(st, 3), "end": round(st + job["duration"], 3),
                                               "layer": e.get("layer") or "front", "file": _brand_frames(job["out"], brand_hex)})
    n = len(spec.get("fx") or []) + len(spec.get("fxTransforms") or [])
    if n:
        changes.append("%d hieu ung tu viet da ve khung" % n)
