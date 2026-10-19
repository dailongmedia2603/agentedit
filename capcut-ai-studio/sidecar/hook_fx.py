# -*- coding: utf-8 -*-
"""HIEU UNG DAC BIET CHO HOOK (user 2026-10-19: "khong chi am thanh, zoom in / out — can hieu ung dac biet hop cau hook:
set danh, mua, rung toan man hinh... de gay chu y"; video mau mau-hook.mp4 / mau-hook-2.mp4 trong goc repo).

Mau xem duoc (DE HIEU Y, khong chep):
- mau-hook: dong bang + tach nguoi vien vang (sticker), nen sau nguoi doi thanh giay trang / anh photocopy halftone xe manh
  nhap nhay, sao lap lanh, net ve tay, the ten truot vao; roi chu "KHONG" do khong lo dap vao kem vet nhoe chuyen dong.
  Moi lan hinh doi deu co mot tieng (whoosh / dap / tach) — 2.6s dau day tieng.
- mau-hook-2: ong kinh mat ca (fisheye) vien tron den + nhoe zoom xuyen tam + chu neon do phat sang dap xuong.

Module nay:
1. GUIDE: tu dien hieu ung dac biet theo CAM XUC / Y cua cau hook + cach ghep 3 lop (camera / lop dac biet / tieng)
   — noi vao luat hook (hook_rule.luat) cho B3 / FX-plan / B7.
2. CODE_RECIPES: cong thuc ve cho FX-code (hop cach ly fx_runtime.mjs) — noi vao prompt FX-code khi lo co hieu ung hook.
3. PRESETS: hieu ung dac biet VIET SAN (da chay thu trong hop cach ly) — du phong khi AI van khong dat (hook_rule.ensure).
"""
import re

# ---------------------------------------------------------------------------
# 1. TU DIEN + LUAT (noi vao prompt qua hook_rule.luat)
# ---------------------------------------------------------------------------
GUIDE = """
# HIEU UNG DAC BIET CUA HOOK — DI TU NOI DUNG CAU HOOK (BAT BUOC, ngoai zoom / am thanh)
Zoom, doi mau, vignette CHUA du. Hook PHAI co hinh anh lam nguoi xem THAY dieu cau hook dang noi:
1. Tim CHU THE cu the trong cau hook (hop dong, tien, khach hang, dien thoai, don hang...) va BIEN CO xay ra voi no (rot,
   mat, huy, bi tu choi, tang vot, ra mat...). Y tru tuong -> vat an du ai cung hieu.
2. Hieu ung = MINH HOA chu the + bien co do (vd "bi rot hop dong" -> to hop dong that bi xe doi / roi khoi khung + dau HUY;
   "doanh thu x2" -> xap tien / bieu do phong vut len; "khach bo di" -> tien / gio hang bay mat). He thong co buoc
   "Hook-visual" tao ANH THAT cua vat + dong tac (hook.minh_hoa) — cac buoc khac PHAI dong bo voi no.
3. CAM XUC chi quyet dinh DO MANH / NHIP, KHONG quyet dinh hinh. KHONG dung hieu ung khong lien quan noi dung (set, mua,
   kinh vo, glitch, tia sang, phao hoa...) tru khi chinh cau hook noi ve chung (vd noi ve "bao", "mua", "loi he thong").
GHEP 3 LOP CUNG NHIP voi tu nhan cua cau hook: (1) CAMERA (transform): dap / rung / chop sang dung luc vat vao + bien co;
(2) HINH MINH HOA (vat + dong tac, ro, to, ne mat); (3) TIENG CUA CHINH HANH DONG: giay xe -> tieng xe / quet; roi ->
tieng roi + dap; dau -> tieng dap manh; tien bay -> whoosh + leng keng; tang -> riser... (khong lay tieng chung chung).
Hieu ung phai LON, ro tren dien thoai (trai >= 1/3 khung, giu >= 0.2s); ne mat = dat canh / cat net qua mat, KHONG thu
nho vao goc. KHONG che mat nguoi noi qua 0.3s (chop toan khung chi 2-4 khung). Mat do / "1 hieu ung manh moi 3s" / "zoom
chi khi can" KHONG ap cho hook. Video "nhe" (tam su): van minh hoa noi dung nhung chuyen dong em, tieng mem.
"""

FX_NOTE = """
O BUOC NAY (hook): neu hook.minh_hoa CO (hinh minh hoa noi dung da dung bang anh that): CHI lam CAMERA — 1 transform dap /
rung / chop sang TRUNG hook.minh_hoa.nhip_giay_tu_dau_hook — + toi da 1 lop phu NHE ho tro; KHONG ve hieu ung dac biet
khac (set, kinh vo, glitch...) va khong ve de len vat (phia hook.minh_hoa.ben). Neu KHONG co hook.minh_hoa: PHAI co >= 1
overlay khai "dac_biet": "<hinh minh hoa CHU THE + BIEN CO cua cau hook>" (ve vector vat / bien co do, phu ca khung, LON)
+ 1 transform cung nhip; toi da 3 hieu ung cho hook."""

B7_NOTE = """
TIENG cua hook phai la tieng CUA HANH DONG dang dien ra tren hinh (hook.minh_hoa / hieu_ung_hook): vat dap vao -> whoosh +
dap; giay xe -> swipe; roi -> pro_zip/down / downlifter; dau -> impact/punch; tien bay -> whoosh_big + shimmer; tang ->
riser. Tieng cua hinh minh hoa da duoc dat san (anchor hook, _hook_visual) — KHONG dat tieng khac trung luc do."""

# ---------------------------------------------------------------------------
# 2. CONG THUC VE (noi vao prompt FX-code)
# ---------------------------------------------------------------------------
CODE_RECIPES = """

# CONG THUC HIEU UNG DAC BIET CHO HOOK (khi hieu ung co "dac_biet" / anchor hook)
Hieu ung hook phai MINH HOA NOI DUNG cau hook (vat + bien co), khong phai hieu ung chung chung.
Hieu ung hook phai NHIN RO tren dien thoai: net day (set >= 6px loi + quang sang 20-30px), alpha cao (0.8-1), tuong
phan manh, chuyen dong gat. Doc ky "visual" + "sync" (giay cham).
HIEU UNG DAC BIET PHAI LON: net / hat / vet trai rong >= 1/3 khung (he thong DO: net phai co o >= 20% o luoi khung va giu
>= 0.2s, khong tinh lop phu deu / chop trang) — NE MAT bang cach BO doan net / hat roi vao hinh chu nhat mat (ctx.face),
KHONG thu nho ca hieu ung vao mot goc (do that: 'kinh vo' AI ve thanh chum nut nho goc tren -> nguoi xem khong thay).
Ky thuat:
- SET DANH: duong zic-zac tu mep tren xuong canh nguoi (ne mat: x lech khoi ctx.face >= 0.8*face.w), diem gay tao bang
  chia doi doan + lech ngang random(seed+i) (5-6 lan chia), 2-3 nhanh phu ngan; ve 3 lop cung duong (rong 28 alpha .25
  mau xanh nhat, 12 alpha .55, 4 trang) lam quang; hien 3-6 khung roi tat, danh LAI 1 lan sau ~0.25s o phia kia;
  CHOP trang toan khung (rect W x H alpha .85 -> 0 trong 3 khung) dung luc danh; phu xanh toi nhe ca khung trong luc co set.
- MUA: 80-140 vet xien (line dai 40-90px, alpha .35-.6, mau xanh xam), vi tri = random(seed+i), roi theo thoi gian
  y = (y0 + t*1800) % (H+200); BO vet nam trong loi mat; phu xanh toi .2-.3 ca khung de "u am".
- TIA TAP TRUNG (manga focus lines): 60-90 tam giac mong tu mep khung huong ve mat, dau trong cach mat >= 1.2*face.h,
  do dai / goc doi moi 2 khung (seed theo Math.floor(ctx.frame/2)) -> nhap nhay; bung vao trong 0.12s dau.
- NO TIA SANG: 20-40 tia tu mot diem canh nguoi (polar), chieu dai spring(), + vong sang no ra + hat bay ra (circle
  nho, vi tri polar theo t), mau vang / trang.
- KINH VO: tu 1 diem goc (khong phai mat), 8-14 vet nut gay khuc toa ra + vong nut noi, net trang .9 + bong den mo.
- GLITCH: 6-12 thanh ngang (rect) lech mau cyan / magenta alpha .5, vi tri doi moi 2 khung, + scanline; ne loi mat.
- NEN TRUYEN TRANH ("layer": "behind", sau nguoi): rect nen giay sang (#f4f1ea) phu ca khung + pattern halftone (cham
  tron, pattern id) + tia toa xam tu nguoi ra + 5-8 ngoi sao vang (polygon) nhap nhay + manh xe (polygon trang) truot vao.
- CHOP / RUNG khung la transform rieng (brightness 1.8-2.5 trong 2 khung; x/y doi chieu 12-30px giam dan trong 0.4s).
"""

# ---------------------------------------------------------------------------
# 3. HIEU UNG VIET SAN (du phong)
# ---------------------------------------------------------------------------
LIGHTNING = r"""
function render(ctx) {
  const W = ctx.W, H = ctx.H, t = ctx.t;
  const f = ctx.face || { x: W / 2, y: H * 0.38, w: W * 0.3, h: H * 0.18 };
  const k = clamp(ctx.params.intensity == null ? 1 : ctx.params.intensity, 0.4, 1);
  const glow = (ctx.params.colors || [])[0] || '#8fd3ff';
  const sA = f.x < W / 2 ? 1 : -1;
  const strikes = [{ at: 0.03, side: sA, s: 1 }, { at: 0.30, side: -sA, s: 2 }, { at: 0.56, side: sA, s: 3 }];
  const kids = [];
  const tint = interpolate(t, [0, 0.05, ctx.d - 0.25, ctx.d], [0, 0.32, 0.32, 0]) * k;
  kids.push(h('rect', { x: 0, y: 0, width: W, height: H, fill: alpha('#0b1a3a', tint) }));
  function bolt(sd, side, x0) {
    let pts = [[x0, -20], [clamp(f.x + side * (f.w * 1.05 + random(sd + 1) * 120), 40, W - 40), f.y + f.h * (0.9 + random(sd + 2) * 0.6)]];
    for (let lv = 0; lv < 5; lv++) {
      const nxt = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const off = (random(sd + lv * 31 + i * 7) - 0.5) * (260 / (lv + 1));
        nxt.push([(a[0] + b[0]) / 2 + off, (a[1] + b[1]) / 2], b);
      }
      pts = nxt;
    }
    const lo = f.x + side * f.w * 0.8, top = f.y - f.h * 0.75;
    pts = pts.map((p) => [p[1] < top ? p[0] : (side > 0 ? Math.max(p[0], lo) : Math.min(p[0], lo)), p[1]]);
    const d = 'M ' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ');
    const br = [];
    for (let j = 0; j < 4; j++) {
      const i0 = 6 + Math.floor(random(sd + 50 + j) * (pts.length - 12));
      let p = pts[i0], q = [];
      q.push(p);
      for (let m = 1; m < 6; m++) {
        p = [p[0] + side * (25 + random(sd + 60 + j * 9 + m) * 55), p[1] + 35 + random(sd + 80 + j * 9 + m) * 55];
        q.push(p);
      }
      br.push('M ' + q.map((z) => z[0].toFixed(1) + ' ' + z[1].toFixed(1)).join(' L '));
    }
    return { d, br };
  }
  strikes.forEach((st) => {
    const dt = t - st.at;
    if (dt < 0 || dt > 0.26) return;
    const flick = (Math.floor(dt * 30) % 2 === 0 ? 1 : 0.6) * interpolate(dt, [0, 0.26], [1, 0.3]) * k;
    const x0 = clamp(f.x + st.side * f.w * 0.35, 60, W - 60);
    const b = bolt(st.s * 101, st.side, x0);
    const paths = [b.d].concat(b.br);
    paths.forEach((d, i) => {
      const main = i === 0 ? 1 : 0.55;
      kids.push(h('path', { d, fill: 'none', stroke: alpha(glow, 0.25 * flick), 'stroke-width': 48 * main, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      kids.push(h('path', { d, fill: 'none', stroke: alpha(glow, 0.6 * flick), 'stroke-width': 20 * main, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      kids.push(h('path', { d, fill: 'none', stroke: alpha('#ffffff', flick), 'stroke-width': 8 * main, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    const fl = interpolate(dt, [0, 0.1], [0.85, 0]) * k;
    if (fl > 0.01) kids.push(h('rect', { x: 0, y: 0, width: W, height: H, fill: alpha('#e8f4ff', fl) }));
  });
  return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, ...kids);
}
"""

RAIN = r"""
function render(ctx) {
  const W = ctx.W, H = ctx.H, t = ctx.t;
  const f = ctx.face || { x: W / 2, y: H * 0.38, w: W * 0.3, h: H * 0.18 };
  const k = clamp(ctx.params.intensity == null ? 0.9 : ctx.params.intensity, 0.4, 1) * env(t, ctx.d, 0.15, 0.3);
  const col = (ctx.params.colors || [])[0] || '#e3edf8';
  const kids = [h('rect', { x: 0, y: 0, width: W, height: H, fill: alpha('#0d1726', 0.32 * k) })];
  const fx0 = f.x - f.w * 0.45, fx1 = f.x + f.w * 0.45, fy0 = f.y - f.h * 0.5, fy1 = f.y + f.h * 0.5;
  for (let i = 0; i < 170; i++) {
    const x0 = random('rx' + i) * (W + 300) - 150, y0 = random('ry' + i) * (H + 200);
    const sp = 1700 + random('rs' + i) * 1000, len = 80 + random('rl' + i) * 90;
    const y = ((y0 + t * sp) % (H + 200)) - 100, x = x0 - (y + 100) * 0.18;
    const mx = x - len * 0.18 * 0.5, my = y + len * 0.5;
    if (mx > fx0 - 20 && mx < fx1 + 20 && my > fy0 - 20 && my < fy1 + 20) continue;
    kids.push(h('line', { x1: x, y1: y, x2: x - len * 0.18, y2: y + len, stroke: alpha(col, (0.55 + random('ra' + i) * 0.35) * k), 'stroke-width': 3.5 + random('rw' + i) * 3, 'stroke-linecap': 'round' }));
  }
  return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, ...kids);
}
"""

FOCUS_LINES = r"""
function render(ctx) {
  const W = ctx.W, H = ctx.H, t = ctx.t;
  const f = ctx.face || { x: W / 2, y: H * 0.38, w: W * 0.3, h: H * 0.18 };
  const k = clamp(ctx.params.intensity == null ? 1 : ctx.params.intensity, 0.4, 1) * env(t, ctx.d, 0.02, 0.25);
  const col = (ctx.params.colors || [])[0] || '#ffffff';
  const sd = Math.floor(ctx.frame / 2);
  const R = Math.hypot(W, H);
  const r0 = Math.max(f.h * 1.25, f.w * 1.1) * interpolate(t, [0, 0.12], [2.2, 1], { easing: Easing.out(Easing.cubic) });
  const kids = [];
  for (let i = 0; i < 78; i++) {
    const a = (i / 78) * Math.PI * 2 + (random('fa' + i + '_' + sd) - 0.5) * 0.05;
    const inner = r0 * (1 + random('fi' + i + '_' + sd) * 0.55);
    const wd = 0.008 + random('fw' + i + '_' + sd) * 0.018;
    const [x1, y1] = polar(f.x, f.y, R, a - wd), [x2, y2] = polar(f.x, f.y, R, a + wd), [x3, y3] = polar(f.x, f.y, inner, a);
    kids.push(h('polygon', { points: `${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}`, fill: alpha(col, 0.92 * k) }));
  }
  return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, ...kids);
}
"""

COMIC_BACKDROP = r"""
function render(ctx) {
  const W = ctx.W, H = ctx.H, t = ctx.t;
  const f = ctx.face || { x: W / 2, y: H * 0.38, w: W * 0.3, h: H * 0.18 };
  const k = env(t, ctx.d, 0.06, 0.12);
  const paper = (ctx.params.colors || [])[0] || '#f4f1ea', star = (ctx.params.colors || [])[1] || '#ffd21f';
  const sd = Math.floor(ctx.frame / 3);
  const kids = [h('defs', {}, h('pattern', { id: 'ht', width: 22, height: 22, patternUnits: 'userSpaceOnUse' },
    h('circle', { cx: 11, cy: 11, r: 4.2, fill: 'rgba(30,30,30,0.16)' })))];
  kids.push(h('rect', { x: 0, y: 0, width: W, height: H, fill: alpha(paper, k) }));
  kids.push(h('rect', { x: 0, y: 0, width: W, height: H * 0.42, fill: 'url(#ht)', opacity: k }));
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + random('ca' + i) * 0.1;
    const [x1, y1] = polar(f.x, f.y + f.h, f.h * 1.6, a), [x2, y2] = polar(f.x, f.y + f.h, Math.hypot(W, H), a);
    kids.push(h('line', { x1, y1, x2, y2, stroke: alpha('#2a2a2a', 0.12 * k), 'stroke-width': 3 + random('cw' + i) * 5 }));
  }
  for (let i = 0; i < 3; i++) {
    const y = H * (0.06 + i * 0.13) + (random('ty' + i + '_' + sd) - 0.5) * 18;
    const x = interpolate(t, [0.05 + i * 0.06, 0.25 + i * 0.06], [-W, 0], { easing: Easing.out(Easing.cubic) });
    kids.push(h('polygon', { points: `${x},${y} ${x + W * 1.05},${y + 20} ${x + W},${y + 120} ${x - 10},${y + 100}`, fill: alpha('#1c1c1c', 0.78 * k) }));
  }
  for (let i = 0; i < 7; i++) {
    const cx = W * (0.08 + random('sx' + i) * 0.84), cy = H * (0.05 + random('sy' + i) * 0.9);
    if (Math.abs(cx - f.x) < f.w * 0.9 && Math.abs(cy - f.y) < f.h * 1.2) continue;
    const r = 26 + random('sr' + i) * 26, tw = 0.6 + 0.4 * Math.abs(Math.sin((ctx.frame + i * 3) * 0.6));
    const pts = range(10).map((j) => { const rr = j % 2 ? r * 0.42 : r; const [px, py] = polar(cx, cy, rr * tw, -Math.PI / 2 + j * Math.PI / 5); return px.toFixed(1) + ',' + py.toFixed(1); }).join(' ');
    kids.push(h('polygon', { points: pts, fill: alpha(star, k), stroke: alpha('#1c1c1c', 0.6 * k), 'stroke-width': 3 }));
  }
  return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, ...kids);
}
"""

SHAKE_FLASH = r"""
function transform(ctx) {
  const t = ctx.t, k = clamp(ctx.params.intensity == null ? 1 : ctx.params.intensity, 0.4, 1);
  const hits = ctx.params.hits || [0.03];
  let x = 0, y = 0, rot = 0, br = 1;
  hits.forEach((h0, j) => {
    const dt = t - h0;
    if (dt < 0 || dt > 0.45) return;
    const dec = Math.pow(1 - dt / 0.45, 2) * k;
    x += Math.sin(dt * 95 + j) * 26 * dec;
    y += Math.cos(dt * 80 + j * 2) * 18 * dec;
    rot += Math.sin(dt * 70 + j) * 1.6 * dec;
    br = Math.max(br, 1 + interpolate(dt, [0, 0.07], [1.1, 0]) * k);
  });
  const s = 1.06 + 0.04 * Math.abs(Math.sin(t * 40)) * (x !== 0 ? 1 : 0);
  return { scale: x !== 0 ? s : 1, x: x, y: y, rotate: rot, brightness: br };
}
"""

PRESETS = {
    # id: (code, kind, layer, dur_max, sfx gen, nhan)
    "set_danh": (LIGHTNING, "overlay", "front", 1.0, "impact/blast", "sét đánh (tia sét zic-zac + chớp trắng)"),
    "mua": (RAIN, "overlay", "front", 4.0, "whoosh_big/deep", "mưa rơi xiên + tối màu"),
    "tia_tap_trung": (FOCUS_LINES, "overlay", "front", 1.3, "whoosh_big/swell", "tia tập trung kiểu manga"),
    "nen_truyen_tranh": (COMIC_BACKDROP, "overlay", "behind", 2.2, "whoosh_fast/heavy", "nền truyện tranh sau người"),
}

_SET = ("sét", "bão", "giông", "điện giật", "chập điện", "thunder", "storm")
_MUA = ("mưa", "khóc", "nước mắt", "rain")
_KHOE = ("chuyên gia", "mình là", "tôi là", "giới thiệu", "kênh", "expert")


def pick_preset(moment, story=None, level="manh"):
    """Chon hieu ung viet san hop cau hook (theo loi noi + cam xuc + y tuong B3). nhe -> mua / tia em."""
    txt = " ".join([str((moment or {}).get("caption") or ""), str((moment or {}).get("ly_do_chon") or ""),
                    " ".join(str(x.get("text") or "") for x in (moment or {}).get("loi_noi") or [] if isinstance(x, dict)),
                    str(((moment or {}).get("y_tuong_gay_chu_y") or {}).get("dac_biet") or "")]).lower()
    # CHI chon hinh khi cau noi DUNG VE no (user 2026-10-20: set khong hop 'rot hop dong'); con lai tia tap trung (trung tinh)
    if any(k in txt for k in _SET) and level != "nhe":
        return "set_danh"
    if any(k in txt for k in _MUA):
        return "mua"
    if any(k in txt for k in _KHOE):
        return "nen_truyen_tranh"
    return "tia_tap_trung"


def preset_effects(name, moment):
    """[hieu ung plan['fx']] cho hieu ung viet san `name` + rung / chop cung nhip (khong cho nhe / mua)."""
    code, kind, layer, dmax, _snd, label = PRESETS[name]
    a, b = float(moment["src_start"]), float(moment["src_end"])
    d = min(dmax, max(0.5, b - a))
    base = {"source_id": moment["source_id"], "_hook_rule": "fallback", "dac_biet": label,
            "context": "du phong luat hook: hieu ung dac biet viet san cho cau hook",
            "goal": "nguoi xem giat minh, dung lai ngay giay dau", "why_fit": "du phong (AI chua dat hieu ung dac biet)",
            "y_nghia": "khuech dai cau hook: %s" % str(moment.get("caption") or "")[:80]}
    if moment.get("anchor") == "hook":
        base["anchor"] = "hook"
    out = [dict(base, id="hookfx_" + name, kind=kind, layer=layer, code=code.strip(), visual=label,
                src_start=round(a, 3), src_end=round(a + d, 3), params={"colors": [], "intensity": 1.0})]
    if name in ("set_danh", "tia_tap_trung", "nen_truyen_tranh"):
        hits = [0.03, 0.3] if name == "set_danh" else [0.03]
        out.append(dict(base, id="hookfx_rung", kind="transform", layer="front", code=SHAKE_FLASH.strip(),
                        visual="rung + chop sang toan khung cung luc hieu ung dac biet cham", src_start=round(a, 3),
                        src_end=round(a + min(0.9, b - a), 3), params={"colors": [], "intensity": 1.0, "hits": hits}))
    return out


def preset_sound(name):
    return PRESETS.get(name, PRESETS["tia_tap_trung"])[4]


def declared(e):
    """Hieu ung plan['fx'] co khai la hieu ung DAC BIET cua hook."""
    return bool(re.sub(r"\s+", "", str((e or {}).get("dac_biet") or "")))
