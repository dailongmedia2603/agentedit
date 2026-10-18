// product-card-progressive-assemble — 详情卡像被逐字段抓取般自建
// 图 → 标题 → 分类 pill → 价格（原价被划线降级、新价 spring 跳出）→ 正文逐行 + 马克笔高亮 → 色卡 → 按钮，
// 整卡全程极慢前推。价格降级是全片唯一的"改变"事件，放在中段最显眼处。
//
// 第二轮重设计（瓷白 · 自动填充的商品详情页）：
// - look = porcelain（冷白 + 钴蓝）。原生 1920 坐标重画：一张 1520×840 的商品详情卡占画宽 79%，
//   左侧 640 宽棚拍图（商品图 / 品牌标志当棚拍主体 + 无缝背景 + 接触影），右侧字段按真实字号排版：
//   标题 108px、价格 112px、正文 34px、pill 28px——不再是 480×270 小画布放大的小字。
// - 手法强化：一枚钴蓝"填充光标"（描边框 + AUTOFILL 小签）领先每个字段 2–3f 跳到它的槽位，
//   框形在字段之间不对称 in-out 变形移动；字段落位前槽位里是浅灰骨架条，落位时骨架淡出、内容升起
//   ——读作"表单正在被一格一格自动填好"。光标是唯一的主角光效（Q4），最后缩进按钮里消失。
// - 价格事件：$449 先完整落位 hold 18f，再 6f 内同窗"缩小 + 变灰 + 删除线从左划过"，钴蓝新价
//   Free（Apache-2.0 开源）物理弹簧（damping 14）从 1.18 收到 1、OPEN SOURCE chip 晚 6f 滑入。
// - 马克笔高亮：钴蓝 16% 底块 scaleX 0→1 由左向右 6f 刷过，比字段落位更快。
// - 收尾：按钮底色由左向右填满（墨黑），光标收进按钮淡出。
//
// 时间表（30fps，共 172f）：
//   0–14    卡片升起落位（scale .96→1 + 上移 30px，expo-out），骨架槽位已在
//   8–24    光标 → 图：棚拍图揭示（失焦→清晰 + 商品 1.08→1 慢收）
//   20–34   光标 → 标题：逐字升起
//   30–44   光标 → pill：三枚错峰 pop（3f 间隔，过冲）
//   42–56   光标 → 价格：$449 落位
//   62–80   价格降级（6f 急变）+ 新价 Free 弹簧 + chip
//   76–96   光标 → 正文：三行错峰升起（3f），两处高亮 86/90 刷过
//   96–112  光标 → 色卡：四枚 pop（3f）+ 色名
//   114–128 光标 → 按钮：底色左→右填满，光标收进按钮消失
//   0–132   整卡前推 1→1.035（不对称 in-out）
//   132–172 hold 40f，干净定格
//
// [Agent Edit] o chu: kicker / title (ten san pham, toi da 2 dong) / pills (1..3) / price_old (gia cu, tuy chon) /
// price_new / chip / body (mo ta, toi da 3 dong) + highlight (cum tu trong body duoc to but) / variant / cta.
// O anh `product` (anh san pham — tach nen dep nhat; anh bat ky deu duoc, contain tren nen studio). Khong co anh ->
// logo thuong hieu (hoac dau hieu trung tinh) lam vat the chinh nhu ban goc.
// Toa do cac o (光标落点) KHONG con viet cung: tinh tu bo cuc that (so dong tieu de / mo ta, be ngang gia) -> khung
// tu dien luon om dung truong. Khung doc (native): the doc — anh lon o tren, cac truong xep ben duoi, chu to hon.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useImage, useShot, useShotFonts, fitSize, measureText, staticFile } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DURATION = 172;

const L = LOOKS.porcelain;

type Box = { x: number; y: number; w: number; h: number };
type Key = 'img' | 'title' | 'pills' | 'price' | 'body' | 'swatch' | 'cta';
// 光标到达帧（与原版一致）
const AT: Record<Key, number> = { img: 8, title: 20, pills: 30, price: 42, body: 76, swatch: 96, cta: 114 };
const ORDER: Key[] = ['img', 'title', 'pills', 'price', 'body', 'swatch', 'cta'];
const HOP = 6; // 光标跳格帧数
const LAND = 2; // 字段在光标到达后几帧开始落位
const PRICE_DROP = 62;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// 光标当前框：在相邻两个字段框之间按 swift 插值
const cursorBox = (f: number, B: Record<Key, Box>): Box => {
  let prev = B[ORDER[0]];
  for (let i = 0; i < ORDER.length; i++) {
    const key = ORDER[i];
    if (f < AT[key]) {
      const k = i === 0 ? 1 : ramp(f, AT[key] - HOP, HOP, EASE.swift);
      const b = B[key];
      return { x: mix(prev.x, b.x, k), y: mix(prev.y, b.y, k), w: mix(prev.w, b.w, k), h: mix(prev.h, b.h, k) };
    }
    prev = B[key];
  }
  return prev;
};

// 字段落位：骨架淡出 + 内容上移失焦淡入（snappy 14f）
const landP = (f: number, key: Key, extra = 0) => ramp(f, AT[key] + LAND + extra, 14, EASE.snappy);
const rise = (p: number, dist = 18): React.CSSProperties => ({
  opacity: clamp01(p * 1.8),
  transform: `translateY(${((1 - p) * dist).toFixed(2)}px)`,
  filter: p < 0.98 ? `blur(${((1 - p) * 6).toFixed(2)}px)` : undefined,
});
const pop = (f: number, start: number): React.CSSProperties => {
  const s = springAt(f, start, { damping: 13, stiffness: 260 });
  return { opacity: clamp01((f - start) / 4), transform: `scale(${mix(0.4, 1, s).toFixed(4)})` };
};

// 骨架条（字段落位前的浅灰占位）
const Skeleton: React.FC<{ box: Box; fade: number; rows?: number[]; radius?: number; bar?: number }> = ({ box, fade, rows = [1], radius = 10, bar = 28 }) =>
  fade >= 1 ? null : (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, opacity: 1 - fade, display: 'flex', flexDirection: 'column', gap: bar * 0.5, justifyContent: 'center' }}>
      {rows.map((w, i) => (
        <div key={i} style={{ height: Math.min(bar, (box.h - bar * 0.5 * (rows.length - 1)) / rows.length), width: `${w * 100}%`, borderRadius: radius, background: '#e8edf5' }} />
      ))}
    </div>
  );

// 正文分词 + 高亮标记（cum tu `highlight` xuat hien trong body -> cac tu do duoc to but）
const norm = (w: string) => w.toLowerCase().replace(/[.,;:!?…"“”()]/g, '');
const markWords = (body: string, hl: string) => {
  const ws = body.split(/\s+/).filter(Boolean);
  const hs = hl.split(/\s+/).filter(Boolean).map(norm);
  const mark = ws.map(() => false);
  if (hs.length) {
    for (let i = 0; i + hs.length <= ws.length; i++) {
      if (hs.every((h, j) => norm(ws[i + j]) === h)) {
        for (let j = 0; j < hs.length; j++) mark[i + j] = true;
        break;
      }
    }
  }
  return ws.map((w, i) => ({ w, m: mark[i] }));
};

export const ProductCardProgressiveAssemble: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const shot = useShot();
  const portrait = SH > 1080 * 1.2;
  const BLUE = L.accent;
  const kicker = useText('kicker', 'SẢN PHẨM MỚI · BỘ SƯU TẬP THU');
  const title = useText('title', 'Tai nghe Aura');
  const pills = useList('pills', ['Không dây', 'Chống ồn', 'Pin 40 giờ']).slice(0, 3);
  const oldPrice = useText('price_old', '2.490.000đ');
  const newPrice = useText('price_new', '1.790.000đ');
  const chipT = useText('chip', 'GIẢM 28%');
  const body = useText('body', 'Âm thanh sống động, chống ồn chủ động, đeo cả ngày vẫn êm tai.');
  const hl = useText('highlight', 'chống ồn chủ động');
  const variant = useText('variant', 'Màu · Đen nhám');
  const ctaT = useText('cta', 'Mua ngay · giao trong 2 giờ');
  const preview = !shot || (!!shot.preview && Object.keys(shot.images).length === 0); // [Agent Edit] chi xem thu kho moi dung anh mau
  const product = useImage('product') ?? (preview ? staticFile('samples/square1.jpg') : undefined);

  // ───── 卡片几何（画面坐标）─────
  const CW = portrait ? 1720 : 1520;
  const CL = (1920 - CW) / 2;
  const PAD = portrait ? 70 : 60;
  const COLW = portrait ? CW - PAD * 2 : CW - PAD - 640 - 64 - PAD;
  const COL = portrait ? PAD : PAD + 640 + 64;
  // 字号基准（khung doc to hon）
  const base = portrait
    ? { kick: 34, title: 150, pill: 44, pillH: 84, price: 150, body: 58, bodyLH: 84, sw: 76, swTxt: 50, ctaH: 124, cta: 50, gap: 34 }
    : { kick: 22, title: 112, pill: 28, pillH: 52, price: 112, body: 34, bodyLH: 50, sw: 52, swTxt: 30, ctaH: 64, cta: 30, gap: 24 };
  const kickFs = kicker ? fitSize(kicker, { family: fonts.sans, size: base.kick, maxWidth: COLW, weight: 600, letterSpacingEm: 0.18, minSize: base.kick * 0.7 }) : 0;
  // tieu de: 1 dong; dai -> 2 dong (co chu >= 0.68 co goc)
  let tLines = [title];
  let tSize = fitSize(title, { family: fonts.sans, size: base.title, maxWidth: COLW, weight: 720, letterSpacingEm: -0.045, minSize: base.title * 0.4 });
  if (tSize < base.title * 0.72 && title.split(/\s+/).length > 1) {
    // tach 2 dong can bang (diem cat lam dong dai nhat ngan nhat)
    const ws = title.split(/\s+/).filter(Boolean);
    let best = 1, bestW = Infinity;
    for (let k = 1; k < ws.length; k++) {
      const w = Math.max(measureText(ws.slice(0, k).join(' '), fonts.sans, 100, 720), measureText(ws.slice(k).join(' '), fonts.sans, 100, 720));
      if (w < bestW) { bestW = w; best = k; }
    }
    tLines = [ws.slice(0, best).join(' '), ws.slice(best).join(' ')];
    tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: base.title * 0.8, maxWidth: COLW, weight: 720, letterSpacingEm: -0.045, minSize: base.title * 0.4 })));
  }
  const tLH = tSize * 1.14;
  // gia: moi + 0.46×cu + chip phai vua 1 hang
  const chipFs = base.pill * 0.93;
  const chipW = chipT ? measureText(chipT, fonts.sans, chipFs, 700) + chipFs * 1.4 + 30 : 0;
  const wNew = measureText(newPrice, fonts.sans, 100, 780) / 100;
  const wOld = oldPrice ? measureText(oldPrice, fonts.sans, 100, 760) / 100 : 0;
  const gapPx = portrait ? 34 : 26;
  let pSize = Math.min(base.price, (COLW - gapPx - chipW) / Math.max(0.5, wNew + 0.46 * wOld + 0.06), wOld ? (COLW - 10) / wOld : 999);
  let chipBelow = false;
  if (pSize < base.price * 0.5 && chipT) {
    chipBelow = true;
    pSize = Math.min(base.price, (COLW - gapPx) / Math.max(0.5, wNew + 0.46 * wOld + 0.06), wOld ? (COLW - 10) / wOld : 999);
  }
  pSize = Math.max(40, pSize);
  const priceH = pSize + (chipBelow ? base.pillH + 12 : 0);
  // body + highlight
  const words = markWords(body, hl);
  const bodyMaxLines = portrait ? 3 : 3;
  const bodyRows: { w: string; m: boolean }[][] = [];
  {
    let cur: { w: string; m: boolean }[] = [];
    for (const t of words) {
      const test = [...cur, t].map((x) => x.w).join(' ');
      if (cur.length && measureText(test, fonts.sans, base.body, 450) > COLW) {
        bodyRows.push(cur);
        cur = [t];
      } else cur.push(t);
    }
    if (cur.length) bodyRows.push(cur);
  }
  const bodyLines = bodyRows.slice(0, bodyMaxLines);
  if (bodyRows.length > bodyMaxLines) bodyLines[bodyMaxLines - 1] = bodyRows.slice(bodyMaxLines - 1).flat();
  const bodyFs = Math.min(base.body, ...bodyLines.map((r) => fitSize(r.map((x) => x.w).join(' '), { family: fonts.sans, size: base.body, maxWidth: COLW, weight: 450, minSize: base.body * 0.6 })));
  const pillsFs = (() => {
    const tot = pills.reduce((a, t) => a + measureText(t, fonts.sans, base.pill, 560) + base.pill * 1.6, 0) + 12 * (pills.length - 1);
    return tot > COLW ? Math.max(base.pill * 0.6, base.pill * (COLW / tot)) : base.pill;
  })();
  const ctaFs = fitSize(ctaT, { family: fonts.sans, size: base.cta, maxWidth: COLW - 60, weight: 650, minSize: base.cta * 0.6 });
  // xep doc cac truong (toa do cuc bo trong the)
  const g = base.gap;
  const fieldsH = (kicker ? kickFs * 1.6 + 12 : 0) + tLines.length * tLH + g + (pills.length ? base.pillH + g : 0) + priceH + g + bodyLines.length * base.bodyLH + g + base.sw + g + base.ctaH;
  let imgBox: Box, CH: number, y0: number;
  if (portrait) {
    const maxCH = SH - 440;
    const imgH = Math.max(640, Math.min(1150, maxCH - PAD * 2 - 70 - fieldsH));
    imgBox = { x: PAD, y: PAD, w: CW - PAD * 2, h: imgH };
    CH = PAD + imgH + 70 + fieldsH + PAD;
    y0 = PAD + imgH + 70;
  } else {
    CH = 840;
    imgBox = { x: PAD, y: PAD, w: 640, h: CH - PAD * 2 };
    y0 = Math.max(56, (CH - fieldsH) / 2);
  }
  const CT = (SH - CH) / 2 + 6;
  let y = y0;
  const kickY = y;
  if (kicker) y += kickFs * 1.6 + 12;
  const titleY = y;
  y += tLines.length * tLH + g;
  const pillsY = y;
  if (pills.length) y += base.pillH + g;
  const priceY = y;
  y += priceH + g;
  const bodyY = y;
  y += bodyLines.length * base.bodyLH + g;
  const swY = y;
  y += base.sw + g;
  const ctaY = y;
  const pillsW = pills.reduce((a, t) => a + measureText(t, fonts.sans, pillsFs, 560) + pillsFs * 1.6, 0) + 12 * Math.max(0, pills.length - 1);
  const newX = oldPrice ? wOld * pSize * 0.46 + gapPx : 0;
  const chipX = newX + wNew * pSize + 24;
  const B: Record<Key, Box> = {
    img: imgBox,
    title: { x: COL, y: kickY, w: Math.min(COLW, Math.max(...tLines.map((l) => measureText(l, fonts.sans, tSize, 720))) + 20), h: titleY - kickY + tLines.length * tLH },
    pills: { x: COL, y: pillsY, w: Math.min(COLW, pillsW), h: base.pillH },
    price: { x: COL, y: priceY, w: Math.min(COLW, chipBelow ? Math.max(wOld * pSize, newX + wNew * pSize) : Math.max(wOld * pSize, chipT ? chipX + chipW - 30 : newX + wNew * pSize)), h: priceH },
    body: { x: COL, y: bodyY, w: COLW, h: bodyLines.length * base.bodyLH },
    swatch: { x: COL, y: swY, w: Math.min(COLW, base.sw * 4 + 64 + 30 + measureText(variant, fonts.sans, base.swTxt, 650)), h: base.sw },
    cta: { x: COL, y: ctaY, w: COLW, h: base.ctaH },
  };

  const enter = ramp(frame, 0, 14, EASE.snappy);
  const push = 1 + 0.035 * ramp(frame, 0, 132, EASE.swift);

  // 各字段进度
  const img = landP(frame, 'img');
  const titleP = landP(frame, 'title');
  const price = landP(frame, 'price');
  const sw = landP(frame, 'swatch');
  const cta = ramp(frame, AT.cta + LAND, 12, EASE.out);

  // 价格降级（6f 同窗：缩小 + 变灰 + 删除线）；không có giá cũ -> giá mới bật ra ngay khi trường giá đáp xuống
  const drop = oldPrice ? PRICE_DROP : AT.price + LAND;
  const cut = ramp(frame, PRICE_DROP, 6, EASE.snappy);
  const strike = ramp(frame, PRICE_DROP, 5, EASE.out);
  const newP = springAt(frame, drop + 1, { damping: 14, stiffness: 240 });
  const chip = ramp(frame, drop + 7, 10, EASE.snappy);

  // 光标
  const cb = cursorBox(frame, B);
  const cursorIn = ramp(frame, 2, 6, EASE.out);
  const cursorOut = ramp(frame, AT.cta + 8, 8, EASE.exit);
  const cursorOp = cursorIn * (1 - cursorOut);
  const cpad = (portrait ? 20 : 14) * (1 - cursorOut);
  const tagFs = portrait ? 28 : 18;

  // 色卡 = 品牌四色（中性）
  const SWATCHES = [BRAND.ink, BRAND.paper, BRAND.amber, BRAND.slate];
  const imgR = portrait ? 32 : 24;
  // [Agent Edit] nen anh AI: bo nen dac + quang sang xanh phia sau the (Stage tu bo gradient)
  const bd = useBackdrop();
  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.05 }} fill={{ x: 0.85, y: 0.95 }} vignette={0.2} />
      {/* 远景：一块极淡的钴蓝光晕在卡片右后方（空间层次） */}
      {!bd && <div style={{ position: 'absolute', left: 1100, top: CT + CH * 0.55, width: 900, height: 700, background: `radial-gradient(closest-side, ${alpha(BLUE, 0.08)}, ${alpha(BLUE, 0)})` }} />}

      <div style={{
        position: 'absolute', left: CL, top: CT, width: CW, height: CH,
        transform: `translateY(${((1 - enter) * 30).toFixed(2)}px) scale(${(mix(0.96, 1, enter) * push).toFixed(5)})`,
        transformOrigin: '50% 55%', opacity: clamp01(enter * 1.6),
      }}>
        {/* 卡面：白 + 发丝线 + 内高光 + 两层带色相软阴影 */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: portrait ? 48 : 36, background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
          boxShadow: `inset 0 1px 0 #ffffff, 0 0 0 1px ${L.line}, 0 2px 4px ${alpha(L.shadow, 0.06)}, 0 40px 90px -20px ${alpha(L.shadow, 0.28)}`,
        }} />

        {/* 骨架槽位 */}
        {kicker ? <Skeleton box={{ x: COL, y: kickY, w: COLW * 0.36, h: kickFs * 1.2 }} fade={titleP} bar={kickFs * 1.2} /> : null}
        <Skeleton box={{ x: COL, y: titleY, w: COLW * 0.8, h: tLines.length * tLH }} fade={titleP} rows={tLines.map((_, i) => (i ? 0.6 : 0.85))} radius={16} bar={tSize * 0.8} />
        {pills.length ? <Skeleton box={B.pills} fade={landP(frame, 'pills')} rows={[0.8]} radius={base.pillH / 2} bar={base.pillH * 0.6} /> : null}
        <Skeleton box={B.price} fade={price} rows={[0.5]} radius={16} bar={pSize * 0.7} />
        <Skeleton box={B.body} fade={landP(frame, 'body')} rows={bodyLines.map((_, i) => [0.92, 0.86, 0.6][i] ?? 0.7)} bar={base.body * 0.8} />
        <Skeleton box={B.swatch} fade={sw} rows={[0.7]} radius={base.sw / 2} bar={base.sw * 0.6} />
        <Skeleton box={B.cta} fade={cta} rows={[1]} radius={base.ctaH / 2} bar={base.ctaH} />

        {/* 图：棚拍无缝背景 + 商品图（contain） / 标志 */}
        <div style={{ position: 'absolute', left: imgBox.x, top: imgBox.y, width: imgBox.w, height: imgBox.h, borderRadius: imgR, overflow: 'hidden', background: '#eef2f8' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: img, background: 'radial-gradient(110% 80% at 38% 26%, #ffffff 0%, #eef2f8 46%, #dde4ee 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '72%', bottom: 0, opacity: img, background: `linear-gradient(180deg, ${alpha(L.shadow, 0.04)}, ${alpha(L.shadow, 0)})` }} />
          <div style={{
            position: 'absolute', inset: product ? '7%' : 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: clamp01(img * 1.5),
            transform: `translateY(${((1 - img) * 26).toFixed(2)}px) scale(${mix(1.08, 1, ramp(frame, 10, 40, EASE.out)).toFixed(4)})`,
            filter: img < 0.98 ? `blur(${((1 - img) * 10).toFixed(2)}px)` : undefined,
          }}>
            {product ? (
              <Img src={product} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 18, filter: `drop-shadow(0 30px 40px ${alpha(L.shadow, 0.22)})` }} />
            ) : (
              <div style={{ position: 'relative', width: Math.min(imgBox.w, imgBox.h) * 0.6, height: Math.min(imgBox.w, imgBox.h) * 0.66 }}>
                {/* 地面接触影 + 标志当棚拍主体 */}
                <div style={{ position: 'absolute', left: '6%', right: '6%', bottom: 0, height: '11%', borderRadius: '50%', background: `radial-gradient(closest-side, ${alpha(L.shadow, 0.26)}, ${alpha(L.shadow, 0)})` }} />
                <ShotcraftMark size={Math.min(imgBox.w, imgBox.h) * 0.6} tone="light" />
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', left: 32, top: 30, fontFamily: fonts.mono, fontSize: portrait ? 32 : 22, letterSpacing: '0.14em', color: L.ink3, opacity: img }}>01 / 06</div>
        </div>

        {/* 眉标 + 标题 */}
        {kicker ? (
          <div style={{ position: 'absolute', left: COL, top: kickY, fontFamily: fonts.sans, fontSize: kickFs, fontWeight: 600, lineHeight: 1.3, letterSpacing: '0.18em', color: L.ink3, whiteSpace: 'nowrap', ...rise(titleP, 10) }}>
            {kicker}
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: COL - 4, top: titleY, fontFamily: fonts.sans, fontSize: tSize, fontWeight: 720, lineHeight: 1.14, color: L.ink, letterSpacing: '-0.045em', whiteSpace: 'nowrap', ...rise(landP(frame, 'title', 2), 26) }}>
          {tLines.map((l, i) => <div key={i}>{l}</div>)}
        </div>

        {/* 分类 pill：错峰 pop */}
        <div style={{ position: 'absolute', left: COL, top: pillsY, height: base.pillH, display: 'flex', alignItems: 'center', gap: 12 }}>
          {pills.map((t, i) => (
            <div key={i} style={{
              fontFamily: fonts.sans, fontSize: pillsFs, fontWeight: 560, lineHeight: 1.2, whiteSpace: 'nowrap', color: i === pills.length - 1 ? L.ink : L.ink2, padding: `${pillsFs * 0.32}px ${pillsFs * 0.8}px`, borderRadius: 99,
              background: i === pills.length - 1 ? '#ffffff' : L.surface2, boxShadow: i === pills.length - 1 ? `inset 0 0 0 1.5px ${alpha(L.ink, 0.16)}` : `inset 0 0 0 1px ${L.line}`,
              transformOrigin: 'left center', ...pop(frame, AT.pills + LAND + i * 3),
            }}>{t}</div>
          ))}
        </div>

        {/* 价格行：原价落位 → 降级；新价弹簧跳出；chip 滑入 */}
        <div style={{ position: 'absolute', left: COL, top: priceY, height: priceH, width: COLW, ...rise(price, 16) }}>
          {oldPrice ? (
            <div style={{
              position: 'absolute', left: 0, top: 0, height: pSize, display: 'flex', alignItems: 'center', fontFamily: fonts.sans, fontSize: pSize, fontWeight: 760, lineHeight: 1, letterSpacing: '-0.04em',
              color: cut > 0.5 ? L.ink3 : L.ink, transform: `scale(${mix(1, 0.46, cut).toFixed(4)})`, transformOrigin: '0% 88%', whiteSpace: 'nowrap',
            }}>
              <span style={{ position: 'relative' }}>
                {oldPrice}
                <span style={{
                  position: 'absolute', left: -6, right: -6, top: '50%', height: Math.max(5, pSize * 0.08), borderRadius: 4, background: L.ink3,
                  transform: `scaleX(${strike.toFixed(4)})`, transformOrigin: 'left center',
                }} />
              </span>
            </div>
          ) : null}
          <div style={{
            position: 'absolute', left: newX, top: 0, height: pSize, display: 'flex', alignItems: 'center', fontFamily: fonts.sans, fontSize: pSize, fontWeight: 780, lineHeight: 1, letterSpacing: '-0.04em', color: BLUE, whiteSpace: 'nowrap',
            opacity: clamp01((frame - drop - 1) / 3), transform: `scale(${mix(1.18, 1, newP).toFixed(4)})`, transformOrigin: '0% 80%',
          }}>
            {newPrice}
          </div>
          {chipT ? (
            <div style={{
              position: 'absolute', left: chipBelow ? 0 : chipX, top: chipBelow ? pSize + 12 : pSize / 2 - chipFs * 0.95, fontFamily: fonts.sans, fontSize: chipFs, fontWeight: 700, lineHeight: 1.3, color: BLUE, background: alpha(BLUE, 0.1),
              boxShadow: `inset 0 0 0 1.5px ${alpha(BLUE, 0.25)}`, padding: `${chipFs * 0.3}px ${chipFs * 0.6}px`, borderRadius: 99, letterSpacing: '0.04em', whiteSpace: 'nowrap',
              opacity: chip, transform: `translateX(${((1 - chip) * -16).toFixed(2)}px)`,
            }}>
              {chipT}
            </div>
          ) : null}
        </div>

        {/* 正文：逐行错峰 + 马克笔高亮 */}
        <div style={{ position: 'absolute', left: COL, top: bodyY, width: COLW, fontFamily: fonts.sans, fontSize: bodyFs, fontWeight: 450, lineHeight: `${base.bodyLH}px`, color: L.ink2, letterSpacing: '-0.012em' }}>
          {bodyLines.map((row, li) => {
            // gom cac tu lien tiep cung trang thai thanh doan
            const segs: { t: string; m: boolean }[] = [];
            row.forEach((x, k) => {
              const last = segs[segs.length - 1];
              if (last && last.m === x.m) last.t += ' ' + x.w;
              else segs.push({ t: (k ? ' ' : '') + x.w, m: x.m });
            });
            return (
              <div key={li} style={{ whiteSpace: 'pre', ...rise(landP(frame, 'body', li * 3), 14) }}>
                {segs.map((sg, si) => !sg.m ? <span key={si}>{sg.t}</span> : (
                  <React.Fragment key={si}>
                    {sg.t.startsWith(' ') ? ' ' : null}
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      <span style={{
                        position: 'absolute', left: -4, right: -4, top: '14%', bottom: '8%', borderRadius: '4px 8px 6px 3px',
                        background: alpha(BLUE, 0.16), transform: `scaleX(${ramp(frame, 86 + li * 4, 6, EASE.out).toFixed(4)})`, transformOrigin: 'left center',
                      }} />
                      <span style={{ position: 'relative', color: L.ink, fontWeight: 620 }}>{sg.t.trim()}</span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            );
          })}
        </div>

        {/* 色卡：四枚 pop + 色名 */}
        <div style={{ position: 'absolute', left: COL, top: swY, height: base.sw, display: 'flex', alignItems: 'center', gap: base.sw * 0.3 }}>
          {SWATCHES.map((c, i) => (
            <div key={i} style={{
              width: base.sw, height: base.sw, borderRadius: base.sw / 2, marginRight: i === 0 ? 4 : 0, flex: 'none',
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%), ${c}`,
              boxShadow: i === 0 ? `0 0 0 4px #ffffff, 0 0 0 6px ${L.ink}` : `inset 0 0 0 1px ${alpha(L.ink, 0.12)}`,
              ...pop(frame, AT.swatch + LAND + i * 3),
            }} />
          ))}
          {variant ? (
            <div style={{ marginLeft: 14, fontFamily: fonts.sans, fontSize: fitSize(variant, { family: fonts.sans, size: base.swTxt, maxWidth: COLW - base.sw * 5.4, weight: 650, minSize: base.swTxt * 0.6 }), fontWeight: 650, color: L.ink, whiteSpace: 'nowrap', ...rise(ramp(frame, AT.swatch + 12, 12, EASE.snappy), 10) }}>
              {variant}
            </div>
          ) : null}
        </div>

        {/* 按钮：底色由左向右填满 */}
        <div style={{ position: 'absolute', left: B.cta.x, top: B.cta.y, width: B.cta.w, height: B.cta.h, borderRadius: base.ctaH / 2, overflow: 'hidden', opacity: clamp01(cta * 4) }}>
          <div style={{ position: 'absolute', inset: 0, background: L.ink, transform: `scaleX(${cta.toFixed(4)})`, transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.sans, fontSize: ctaFs, fontWeight: 650, color: '#ffffff', whiteSpace: 'nowrap', opacity: ramp(frame, AT.cta + 8, 8, EASE.out) }}>
            {ctaT}
          </div>
        </div>

        {/* 填充光标：描边框 + 小签，领先字段跳格 */}
        {cursorOp > 0.01 && (
          <div style={{
            position: 'absolute', left: cb.x - cpad, top: cb.y - cpad, width: cb.w + cpad * 2, height: cb.h + cpad * 2,
            borderRadius: portrait ? 30 : 22, border: `${portrait ? 4 : 2.5}px solid ${BLUE}`, background: alpha(BLUE, 0.04), opacity: cursorOp,
            boxShadow: `0 0 0 6px ${alpha(BLUE, 0.08)}, 0 10px 30px ${alpha(BLUE, 0.16)}`,
          }}>
            <div style={{
              position: 'absolute', right: 18, top: -tagFs * 0.95, height: tagFs * 1.78, padding: `0 ${tagFs * 0.66}px`, borderRadius: 8, background: BLUE, color: '#ffffff',
              display: 'flex', alignItems: 'center', gap: 8, fontFamily: fonts.sans, fontWeight: 700, fontSize: tagFs, letterSpacing: '0.12em', whiteSpace: 'nowrap',
            }}>
              <span style={{ width: tagFs * 0.44, height: tagFs * 0.44, borderRadius: tagFs, background: '#ffffff', opacity: 0.6 + 0.4 * Math.sin(frame / 3) }} />
              TỰ ĐIỀN
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
