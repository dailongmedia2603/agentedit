// document-typewriter-reveal —— 整页真排版文档在光标后自己"写"出来、侧栏跟进、历史条目逐个落入轨道
// （第二轮重设计 · 极光暗场 · 悬浮应用窗）
// 手法不变：内容块两两一对按节拍被"写"出（页面底色遮罩右锚收窄，强调色笔尖骑在揭示前沿，永远只有一个笔尖）；
// 人名标题写完后长出强调色底；左右双栏随后自上而下揭开；尾段 6 条历史周报逐条落入左栏。
//
// 设计决定
// - look = aurora（紫夜 + 紫/粉光）。真实周报页面截图保留（Q1），但不再铺满全屏：它是一扇悬浮在紫夜舞台上的
//   应用窗口——圆角、发丝亮边、背后一圈紫色背光、脚下的长投影；暖白纸面在冷紫夜里像一盏灯。
// - 相机（单调 Hermite 样条，起止无速度突变）：开场 1.42x 斜侧（rotY −18°）特写标题，窗口左上角与舞台光同时入画；
//   笔尖往下写时相机一路后撤、把斜侧角收小，到全窗（双栏完整入画，Q10）；最后微俯、上移让出底部给一行标语。
// - 笔尖：深紫 3px caret + 同色柔光；人名标题的强调底改成极光紫 multiply（只染纸不洗字）。
// - 收尾标语「From screenshot / to showreel.」——第二段强调色，底部左对齐窗口左缘。
//
// 时间表（30fps，共 150f）
//   0–8     标题特写已在画面（窗口 + 光），笔尖在标题起点
//   8–58    写入：20 块两两一对，第 g 对 cue = 8 + 4.4g，每块 9f（in-out），最后一对 ~57f 写完
//   0–64    相机后撤：1.42x 斜侧 → 0.86x 全窗
//   54/62   左 / 右栏自上而下揭开（10f）+ 内缘强调线生长后淡去
//   66–100  历史周报 6 条逐条落入左栏（每 5f 一条，9f 轻弹跳 + 空中影）
//   70–104  相机微俯上移到海报位（0.74x）
//   100–126 标语逐词升起
//   126–150 hold：0.8% 极缓推近，光的呼吸
//
// [Agent Edit] Anh chup trang tuan bao (chu Trung + logo video-shotcraft, toa do live-layout.json) -> TRANG TAI LIEU VE BANG
// DOM tu o chu: title / sections (moi muc "Tieu de phan: y 1; y 2") / doc_label / app / history / tagline + tagline_accent.
// Moi dong chu (da xuong dong theo be ngang that) = 1 khoi viet; nhip cap doi cue = 8 + g*buoc, buoc tu nen de khoi cuoi
// xong truoc f58 ("块数×节拍要先对预算"). Tieu de phan duoc to nen sau khi viet (thay "ten thanh vien").
// O anh `screen` (tuy chon, TI LE BAT KY): co anh chup trang that -> cua so hien anh (cover, canh tren) va duoc "viet" theo
// cac dai ngang deu nhau (anh cat theo dai, khong dung mau giay phu -> hop ca anh nen toi); bo cot ben / lich su.
// Khung doc (portrait.mode = 'native'): trang doc 1600x2500 (chu to hon, cot "ban truoc" + "binh luan" xuong day trang),
// camera cung kieu (dac ta -> toan trang -> nang len), khau hieu to ben duoi trang.
import { useBackdrop, useBrand, useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate, Easing } from 'remotion';
import { EASE, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, Dust, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const DOCUMENT_TYPEWRITER_REVEAL_DURATION = 150;

const L = LOOKS.aurora;
type Block = { x: number; y: number; w: number; h: number; tag: 'h1' | 'h2' | 'li' | 'p' | 'strip'; text?: string; dot?: boolean; size?: number };
type Rect = { x: number; y: number; w: number; h: number };

const PAPER = '#fefcf9'; // 纹理纸面实测色
const CARET = '#7a4dff'; // 深一档的极光紫：暖白纸上要看得见
const WASH = 'rgba(196,170,255,0.4)';
const INK = '#1f2937';
const INK2 = '#6b7280';
const INK3 = '#9ca3af';
const LINE = 'rgba(31,41,55,0.08)';

// ───────────── 相机 ─────────────
type Cam = { cx: number; cy: number; zoom: number; rotX: number; rotY: number; sx: number; sy: number };
type Key = Cam & { frame: number };
const PARAMS: (keyof Cam)[] = ['cx', 'cy', 'zoom', 'rotX', 'rotY', 'sx', 'sy'];
const hermite = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = xs.map((_, i) => (i === 0 || i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
};
const camFn = (anchors: Key[]) => {
  const curves = Object.fromEntries(PARAMS.map((p) => [p, hermite(anchors.map((k) => k.frame), anchors.map((k) => k[p]))])) as Record<keyof Cam, (x: number) => number>;
  return (f: number): Cam => Object.fromEntries(PARAMS.map((p) => [p, curves[p](f)])) as Cam;
};
const PERSP = 2200;

// ───────────── 写入节拍 ─────────────
const REVEAL_EASE = Easing.bezier(0.4, 0, 0.6, 1);
const WIPE = 9;
const WEEK_CUE = (i: number) => 66 + i * 5;
const WEEK_DROP = Easing.bezier(0.2, 1.15, 0.3, 1);

const Icon: React.FC<{ d: string; s: number }> = ({ d, s }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: 'block' }}>
    <path d={d} fill="none" stroke={INK2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICONS = {
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  olist: 'M10 6h10M10 12h10M10 18h10M4 4v4M3 18h3l-3 3h3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  down: 'M12 4v12M7 11l5 5 5-5M5 20h14',
};

export const DocumentTypewriterReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const FAM = fonts.sans;
  const portrait = SH > 1080 * 1.2;

  // ── 文字槽 ──
  const title = useText('title', 'Báo cáo tuần 28 · Nhóm nội dung').trim();
  const sections = useList('sections', [
    'Tổng quan: Ba mục tiêu chính đều đạt, lượt xem tăng 18% so với tuần trước; Mẫu kịch bản mới đã áp dụng cho toàn bộ video',
    'Video: Đăng 6 video ngắn, 2 video vượt mốc 100 nghìn lượt xem; Thử phụ đề tự động, tiết kiệm 3 giờ dựng mỗi tuần',
    'Quảng cáo: Chi phí mỗi khách hàng giảm còn 42 nghìn đồng; Tạm dừng nhóm quảng cáo hiệu quả thấp',
    'Tuần sau: Quay series mới về mẹo dùng AI; Chốt lịch đăng bài cho cả tháng',
  ]).slice(0, 6);
  const docLabel = useText('doc_label', 'Tuần 28').trim();
  const appName = useText('app', brand?.name || 'Sổ tay nhóm').trim();
  const history = useList('history', ['Báo cáo tuần 27', 'Báo cáo tuần 26', 'Báo cáo tuần 25', 'Báo cáo tuần 24', 'Báo cáo tuần 23', 'Báo cáo tuần 22']).slice(0, 6);
  const tag1 = useText('tagline', 'Viết báo cáo').trim();
  const tag2 = useText('tagline_accent', 'chỉ trong 5 phút.').trim();
  const screen = useImage('screen');

  // ── 页面几何 ──
  const PAGE_W = portrait ? 1600 : 1920;
  const PAGE_H = portrait ? 2500 : 1080;
  const TOP_H = 61 * (portrait ? 1.7 : 1);
  const HEAD_H = 45 * (portrait ? 1.7 : 1);
  const TOOL_H = 46 * (portrait ? 1.7 : 1);
  const leftRail: Rect = portrait ? { x: 0, y: 1740, w: 800, h: PAGE_H - 1740 } : { x: 0, y: 61, w: 208, h: 1019 };
  const rightRail: Rect = portrait ? { x: 800, y: 1740, w: 800, h: PAGE_H - 1740 } : { x: 1632, y: 61, w: 288, h: 1019 };
  const main: Rect = portrait ? { x: 0, y: TOP_H, w: PAGE_W, h: 1740 - TOP_H } : { x: 208, y: 61, w: 1424, h: 1019 };
  const CX0 = portrait ? 110 : 576; // 正文左缘
  const CW = portrait ? 1380 : 700; // 正文宽
  const contentTop = main.y + HEAD_H + TOOL_H + (portrait ? 70 : 36);
  const contentBottom = portrait ? 1700 : 1040;

  // ── 正文排版（DOM 真文字，按真实字宽折行；块 = 一行）──
  const parsed = sections.map((s) => {
    const k = s.indexOf(':');
    if (k > 0 && k < 48) return { head: s.slice(0, k).trim(), items: s.slice(k + 1).split(';').map((x) => x.trim()).filter(Boolean) };
    return { head: '', items: s.split(';').map((x) => x.trim()).filter(Boolean) };
  });
  const layoutAt = (k: number) => {
    const bs: Block[] = [];
    const t1 = 28 * k, t2 = 21 * k, tl = 17 * k;
    const liPitch = tl * 1.65;
    let y = contentTop;
    const titleLines = wrapLines(title, FAM, t1, CW, 700, 2);
    titleLines.forEach((l) => {
      bs.push({ x: CX0, y, w: measureText(l, FAM, t1, 700), h: t1 * 1.3, tag: 'h1', text: l, size: t1 });
      y += t1 * 1.4;
    });
    y += t1 * 0.5;
    parsed.forEach((sec) => {
      if (sec.head) {
        const hl = wrapLines(sec.head, FAM, t2, CW, 650, 1)[0];
        bs.push({ x: CX0, y: y + t2 * 0.35, w: Math.min(CW, measureText(hl, FAM, t2, 650)), h: t2 * 1.3, tag: 'h2', text: hl, size: t2 });
        y += t2 * 1.3 + t2 * 0.35 + tl * 0.45;
      }
      sec.items.forEach((it) => {
        const ls = wrapLines(it, FAM, tl, CW - 23 * k, 400, 3);
        ls.forEach((l, li) => {
          bs.push({ x: CX0 + 23 * k, y, w: measureText(l, FAM, tl, 400), h: tl * 1.45, tag: 'li', text: l, dot: li === 0, size: tl });
          y += liPitch;
        });
        y += tl * 0.25;
      });
      y += tl * 0.5;
    });
    return { bs, end: y };
  };
  let scaleK = portrait ? 2.5 : 1;
  let lay = layoutAt(scaleK);
  for (let i = 0; i < 30 && lay.end > contentBottom && scaleK > (portrait ? 1.3 : 0.7); i++) {
    scaleK -= 0.04;
    lay = layoutAt(scaleK);
  }
  // 截图模式：内容块 = 等高横条（整张图按条带被"写"出）
  const STRIP_TOP = 0.13;
  const NSTRIP = portrait ? 22 : 16;
  const blocks: Block[] = screen
    ? Array.from({ length: NSTRIP }, (_, i) => {
        const h = (PAGE_H * (1 - STRIP_TOP)) / NSTRIP;
        return { x: 0, y: PAGE_H * STRIP_TOP + i * h, w: PAGE_W, h, tag: 'strip' as const };
      })
    : lay.bs;
  const pairs = Math.ceil(blocks.length / 2);
  const step = Math.min(4.4, 49 / Math.max(1, pairs - 1));
  const cueFor = (i: number) => 8 + Math.floor(i / 2) * step;
  const writeEnd = cueFor(blocks.length - 1) + WIPE;

  // ── 相机 ──
  const first = blocks[0];
  const ZF = portrait ? Math.min(1840 / PAGE_W, (SH - 1000) / PAGE_H) : 0.86;
  const ZP = portrait ? ZF * 0.94 : 0.74;
  const SYP = portrait ? -(SH / 2 - (PAGE_H * ZP) / 2 - 170) : -78;
  const cam = camFn(
    portrait
      ? [
          { frame: 0, cx: CX0 + 420, cy: first.y + 40, zoom: 1.6, rotX: 8, rotY: -18, sx: 0, sy: 0 },
          { frame: 26, cx: CX0 + 560, cy: first.y + 420, zoom: 1.35, rotX: 6, rotY: -13, sx: 0, sy: 0 },
          { frame: 64, cx: PAGE_W / 2, cy: PAGE_H / 2, zoom: ZF, rotX: 4, rotY: -6, sx: 0, sy: -10 },
          { frame: 104, cx: PAGE_W / 2, cy: PAGE_H / 2, zoom: ZP, rotX: 9, rotY: -3, sx: 0, sy: SYP },
          { frame: 150, cx: PAGE_W / 2, cy: PAGE_H / 2, zoom: ZP * 1.008, rotX: 9, rotY: -3, sx: 0, sy: SYP - 2 },
        ]
      : [
          { frame: 0, cx: 690, cy: 320, zoom: 1.42, rotX: 8, rotY: -18, sx: 0, sy: 0 },
          { frame: 26, cx: 770, cy: 390, zoom: 1.24, rotX: 6, rotY: -13, sx: 0, sy: 0 },
          { frame: 64, cx: 960, cy: 540, zoom: 0.86, rotX: 4, rotY: -6, sx: 0, sy: -10 },
          { frame: 104, cx: 960, cy: 540, zoom: 0.74, rotX: 9, rotY: -3, sx: 0, sy: -78 },
          { frame: 150, cx: 960, cy: 540, zoom: 0.746, rotX: 9, rotY: -3, sx: 0, sy: -80 },
        ],
  )(frame);
  const MIDY = SH / 2;

  // 只有一个笔尖：跟最新的、仍在写的块
  let caretIdx = -1;
  blocks.forEach((_, i) => {
    if (frame >= cueFor(i) && frame <= cueFor(i) + WIPE + 2) caretIdx = i;
  });
  const idleBlink = frame < cueFor(0) ? (Math.floor(frame / 4) % 2 === 0 ? 1 : 0.25) : 0;

  // ── 标语 ──
  const TAG = portrait ? 150 : 84;
  const tagW = portrait ? 1680 : 1500;
  const tagWords = [
    ...tag1.split(/\s+/).filter(Boolean).map((w) => ({ w, acc: false })),
    ...tag2.split(/\s+/).filter(Boolean).map((w) => ({ w, acc: true })),
  ];
  const tagFull = `${tag1} ${tag2}`.trim();
  const tagSize = portrait ? TAG : fitSize(tagFull, { family: FAM, size: TAG, maxWidth: tagW, weight: 760, minSize: 48 });
  const tagLines = portrait ? wrapLines(tagFull, FAM, tagSize, tagW, 760, 3) : [tagFull];
  const tagSize2 = Math.min(tagSize, ...tagLines.map((l) => fitSize(l, { family: FAM, size: tagSize, maxWidth: tagW, weight: 760, minSize: 60 })));
  const pageScreenBottom = MIDY + SYP + (PAGE_H * ZP) / 2;
  const tagTop = portrait ? pageScreenBottom + 110 : 930;
  const tagLeft = portrait ? 120 : 250;
  const tagStep = Math.min(3, 18 / Math.max(1, tagWords.length - 1));

  // ── 历史条目几何 ──
  const WEEK_H = 56 * (portrait ? 1.5 : 1);
  const WEEK_Y0 = portrait ? leftRail.y + 252 : 228;

  const chrome = (s: number) => s * (portrait ? 1.7 : 1);
  const label = docLabel || title;
  // [Agent Edit] nen anh AI: bo bui + quang tim sau cua so (Stage tu trong suot); tieu de cuoi co bong
  const bd = useBackdrop();

  return (
    <AbsoluteFill style={{ fontFamily: FAM, overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.02 }} fill={{ x: 0.88, y: 0.95 }} horizon={0.9} breathe={0.7} intensity={0.9}>
        {!bd && <Dust look={L} count={24} seed={9} drift={0.16} opacity={0.4} />}
      </Stage>

      {/* 3D 相机 */}
      <AbsoluteFill style={{ transform: `translate(${cam.sx.toFixed(2)}px, ${cam.sy.toFixed(2)}px)` }}>
        <div style={{ position: 'absolute', inset: 0, perspective: `${(PERSP * cam.zoom).toFixed(2)}px`, perspectiveOrigin: `960px ${MIDY}px` }}>
          <div
            style={{
              position: 'absolute', width: PAGE_W, height: PAGE_H, zoom: cam.zoom,
              transform: `translate(${(960 / cam.zoom - cam.cx).toFixed(3)}px, ${(MIDY / cam.zoom - cam.cy).toFixed(3)}px) rotateY(${cam.rotY.toFixed(3)}deg) rotateX(${cam.rotX.toFixed(3)}deg)`,
              transformOrigin: `${cam.cx.toFixed(2)}px ${cam.cy.toFixed(2)}px`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* 背光：窗口背后的一圈紫光（页面空间，随窗口一起透视） */}
            {!bd && <div
              style={{
                position: 'absolute', left: -220, top: -180, width: PAGE_W + 440, height: PAGE_H + 400, pointerEvents: 'none',
                background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent, 0.34)} 0%, ${alpha(L.accent2, 0.1)} 55%, transparent 72%)`,
                transform: 'translateZ(-40px)',
              }}
            />}
            {/* 应用窗口：文档 + 写入遮罩 + 栏位 + 历史条目，全部裁进圆角 */}
            <div
              style={{
                position: 'absolute', left: 0, top: 0, width: PAGE_W, height: PAGE_H, borderRadius: 26 * (portrait ? 1.5 : 1), overflow: 'hidden',
                background: PAPER, color: INK,
                boxShadow: `0 0 0 1.5px ${alpha('#ffffff', 0.35)}, 0 70px 160px -20px ${alpha(L.shadow, 0.95)}, 0 20px 60px ${alpha('#000000', 0.55)}`,
              }}
            >
              {screen ? (
                <>
                  {/* 截图模式：顶部 13%（应用外框）常驻；其余按横条写出 */}
                  {frame > writeEnd ? (
                    <Img src={screen} style={{ position: 'absolute', inset: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover', objectPosition: '50% 0%' }} />
                  ) : (
                    <>
                      <Img src={screen} style={{ position: 'absolute', inset: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover', objectPosition: '50% 0%', clipPath: `inset(0 0 ${((1 - STRIP_TOP) * 100).toFixed(2)}% 0)` }} />
                      {blocks.map((b, i) => {
                        const cue = cueFor(i);
                        const coverT = interpolate(frame, [cue, cue + WIPE], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: REVEAL_EASE });
                        if (coverT >= 1) return null;
                        return (
                          <Img key={i} src={screen} style={{
                            position: 'absolute', inset: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover', objectPosition: '50% 0%',
                            clipPath: `inset(${b.y.toFixed(1)}px ${(PAGE_W * coverT).toFixed(1)}px ${(PAGE_H - b.y - b.h - 0.5).toFixed(1)}px 0)`,
                          }} />
                        );
                      })}
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* 顶栏：标志 + 应用名 + 导航 */}
                  <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE_W, height: TOP_H, borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: chrome(22), padding: `0 ${chrome(28)}px`, boxSizing: 'border-box' }}>
                    {brand ? <ShotcraftMark size={chrome(24)} tone="light" /> : <div style={{ width: chrome(22), height: chrome(22), borderRadius: chrome(6), background: CARET }} />}
                    <span style={{ fontSize: chrome(21), fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{brand?.name ? BRAND.name : appName}</span>
                    <span style={{ fontSize: chrome(15), color: INK2 }}>Báo cáo</span>
                    <span style={{ fontSize: chrome(15), color: INK2 }}>Tài liệu</span>
                  </div>
                  {/* 文档头 + 工具栏 */}
                  <div style={{ position: 'absolute', left: main.x, top: main.y, width: main.w, height: HEAD_H, borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: chrome(12), padding: `0 ${chrome(18)}px`, boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: chrome(15), fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: chrome(14), color: INK3 }}>10/7</span>
                    <span style={{ fontSize: chrome(13), color: '#15803d', fontWeight: 600 }}>Đã đồng bộ</span>
                    <div style={{ marginLeft: 'auto', width: chrome(30), height: chrome(30), borderRadius: '50%', background: '#3f6f55', boxShadow: '0 0 0 2px #fff, 0 0 0 3px #b45309', color: '#fff', fontSize: chrome(13), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>T</div>
                  </div>
                  <div style={{ position: 'absolute', left: main.x, top: main.y + HEAD_H, width: main.w, height: TOOL_H, borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: chrome(14), padding: `0 ${chrome(18)}px`, boxSizing: 'border-box', color: INK2 }}>
                    <Icon d={ICONS.undo} s={chrome(18)} />
                    <Icon d={ICONS.redo} s={chrome(18)} />
                    <span style={{ fontSize: chrome(14), whiteSpace: 'nowrap', marginLeft: chrome(10) }}>Tiêu đề 1 ▾</span>
                    <span style={{ fontSize: chrome(16), fontWeight: 700, marginLeft: chrome(14) }}>B</span>
                    <span style={{ fontSize: chrome(16), fontStyle: 'italic', fontFamily: fonts.serif }}>I</span>
                    <span style={{ fontSize: chrome(16), textDecoration: 'underline' }}>U</span>
                    <span style={{ fontSize: chrome(16), textDecoration: 'line-through' }}>S</span>
                    <Icon d={ICONS.code} s={chrome(18)} />
                    <Icon d={ICONS.list} s={chrome(18)} />
                    <Icon d={ICONS.olist} s={chrome(18)} />
                    <Icon d={ICONS.link} s={chrome(18)} />
                    <Icon d={ICONS.image} s={chrome(18)} />
                    <Icon d={ICONS.table} s={chrome(18)} />
                    <div style={{ marginLeft: 'auto' }}><Icon d={ICONS.down} s={chrome(18)} /></div>
                  </div>
                  {/* 正文：真文字（遮罩盖在上面写出） */}
                  {blocks.map((b, i) => (
                    <React.Fragment key={`t${i}`}>
                      {b.dot ? <div style={{ position: 'absolute', left: b.x - 17 * scaleK, top: b.y + b.h / 2 - 2.6 * scaleK, width: 5.2 * scaleK, height: 5.2 * scaleK, borderRadius: '50%', background: INK }} /> : null}
                      <div style={{
                        position: 'absolute', left: b.x, top: b.y, height: b.h, display: 'flex', alignItems: 'center', whiteSpace: 'pre',
                        fontSize: b.size, fontWeight: b.tag === 'h1' ? 700 : b.tag === 'h2' ? 650 : 400, color: INK, lineHeight: 1,
                        letterSpacing: b.tag === 'h1' ? '-0.01em' : undefined,
                      }}>{b.text}</div>
                    </React.Fragment>
                  ))}
                  {/* 左栏（portrait：底部左块）：报告列表 */}
                  <div style={{ position: 'absolute', left: leftRail.x, top: leftRail.y, width: leftRail.w, height: leftRail.h, borderRight: portrait ? undefined : `1px solid ${LINE}`, borderTop: portrait ? `1px solid ${LINE}` : undefined, background: '#faf8f4', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${chrome(16)}px ${chrome(12)}px`, fontSize: chrome(13), color: INK2 }}>
                      <span>Báo cáo</span><span>«</span>
                    </div>
                    <div style={{ margin: `0 ${chrome(12)}px`, height: chrome(32), borderRadius: chrome(6), border: `1px solid ${LINE}`, background: '#fff', display: 'flex', alignItems: 'center', gap: chrome(8), padding: `0 ${chrome(10)}px`, fontSize: chrome(14), color: INK3, whiteSpace: 'nowrap' }}>
                      <Icon d={ICONS.search} s={chrome(14)} /> Tìm trong báo cáo
                    </div>
                    <div style={{ marginTop: chrome(12), padding: `${chrome(10)}px ${chrome(12)}px`, background: 'rgba(31,41,55,0.05)', height: WEEK_H * 1.15, boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: chrome(14), fontWeight: 600 }}>{label} <span style={{ fontSize: chrome(10), color: '#b45309' }}>tuần này</span></span>
                        <span style={{ fontSize: chrome(10), color: INK3 }}>10/7</span>
                      </div>
                      <div style={{ marginTop: chrome(3), fontSize: chrome(12), color: INK2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                    </div>
                  </div>
                  {/* 右栏（portrait：底部右块）：评论 */}
                  <div style={{ position: 'absolute', left: rightRail.x, top: rightRail.y, width: rightRail.w, height: rightRail.h, borderLeft: `1px solid ${LINE}`, borderTop: portrait ? `1px solid ${LINE}` : undefined, background: '#faf8f4', boxSizing: 'border-box', padding: `0 ${chrome(12)}px` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${chrome(16)}px 0`, fontSize: chrome(13), color: INK2 }}>
                      <span>Bình luận · 2</span><span>»</span>
                    </div>
                    {[
                      { q: '“Mục tiêu tuần”', t: 'Phần này rõ ràng rồi, có thể gộp vào báo cáo chung.' },
                      { q: '“Việc tuần sau”', t: 'Đồng ý, tuần sau mình rà lại lần cuối nhé.' },
                    ].map((c, i) => (
                      <div key={i} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: chrome(10), padding: chrome(12), marginBottom: chrome(14) }}>
                        <div style={{ background: 'rgba(31,41,55,0.05)', borderRadius: chrome(4), padding: `${chrome(4)}px ${chrome(8)}px`, fontSize: chrome(11), color: INK2, fontStyle: 'italic' }}>{c.q}</div>
                        <div style={{ marginTop: chrome(8), fontSize: chrome(12), fontWeight: 600 }}>Minh Anh <span style={{ fontWeight: 400, fontSize: chrome(10), color: INK3 }}>vừa xong</span></div>
                        <div style={{ marginTop: chrome(4), fontSize: chrome(13), lineHeight: 1.5, color: INK }}>{c.t}</div>
                        <div style={{ marginTop: chrome(8), display: 'flex', gap: chrome(8), alignItems: 'center' }}>
                          <div style={{ flex: 1, height: chrome(24), borderRadius: chrome(4), border: `1px solid ${LINE}`, fontSize: chrome(11), color: INK3, display: 'flex', alignItems: 'center', paddingLeft: chrome(8) }}>Trả lời...</div>
                          <span style={{ fontSize: chrome(11), color: INK2 }}>Trả lời</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {blocks.map((p, i) => {
                    const cue = cueFor(i);
                    const coverT = interpolate(frame, [cue, cue + WIPE], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: REVEAL_EASE });
                    const k = p.size ? p.size / 17 : 1;
                    const bx = p.tag === 'li' ? p.x - 28 * k : p.x - 4;
                    const by = p.y - 3;
                    const bw = p.w + (p.tag === 'li' ? 34 * k : 10) + (p.tag === 'li' ? 24 : 120) * k;
                    const bh = p.h + 6;
                    const caretX = bx + bw * (1 - coverT);
                    const caretH = Math.min(22 * k, p.h - 2);
                    const nameCue = cue + WIPE + 4;
                    const nameGrow = p.tag === 'h2'
                      ? interpolate(frame, [nameCue, nameCue + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) })
                      : 0;
                    // 写入中的笔尖只骑在实际文字宽度内（遮罩右侧多盖的空白段不走笔尖）
                    const textRight = p.x + p.w + 6;
                    return (
                      <React.Fragment key={i}>
                        {nameGrow > 0 ? (
                          <div style={{ position: 'absolute', left: p.x - 4, top: p.y - 1, width: (p.w + 10) * nameGrow, height: p.h + 2, background: WASH, borderRadius: 4, mixBlendMode: 'multiply' }} />
                        ) : null}
                        {coverT > 0 ? (
                          <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${coverT * 100}%`, background: PAPER }} />
                          </div>
                        ) : null}
                        {i === caretIdx ? (
                          <div
                            style={{
                              position: 'absolute', left: Math.min(caretX, textRight), top: p.y + (p.h - caretH) / 2, width: 3 * Math.max(1, k * 0.8), height: caretH, background: CARET, borderRadius: 2,
                              boxShadow: `0 0 8px ${alpha(CARET, 0.6)}, 0 0 20px ${alpha(L.accent, 0.45)}`,
                              opacity: coverT > 0 ? 1 : interpolate(frame, [cue + WIPE, cue + WIPE + 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                            }}
                          />
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </>
              )}
              {/* 开场待命笔尖 */}
              {idleBlink > 0 ? (
                <div style={{ position: 'absolute', left: first.x - 4 + (screen ? 40 : 0), top: first.y + 3, width: 3 * (portrait ? 2 : 1), height: Math.min(first.h - 6, 22 * (screen ? 1 : (first.size ?? 28) / 28) * 1.3), background: CARET, borderRadius: 2, opacity: idleBlink, boxShadow: `0 0 8px ${alpha(CARET, 0.6)}` }} />
              ) : null}
              {screen && caretIdx >= 0 ? (() => {
                const b = blocks[caretIdx];
                const cue = cueFor(caretIdx);
                const coverT = interpolate(frame, [cue, cue + WIPE], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: REVEAL_EASE });
                return (
                  <div style={{
                    position: 'absolute', left: PAGE_W * (1 - coverT) - 2, top: b.y + b.h * 0.15, width: 3 * (portrait ? 2 : 1), height: b.h * 0.7, background: CARET, borderRadius: 2,
                    boxShadow: `0 0 8px ${alpha(CARET, 0.6)}, 0 0 20px ${alpha(L.accent, 0.45)}`,
                    opacity: coverT > 0 ? 1 : interpolate(frame, [cue + WIPE, cue + WIPE + 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  }} />
                );
              })() : null}

              {/* 双栏揭开：纸面补丁自上而下收走，内缘强调线随揭示生长后淡去（截图模式无栏位） */}
              {!screen && [
                { rail: leftRail, cue: 54, inner: 'right' as const },
                { rail: rightRail, cue: 62, inner: 'left' as const },
              ].map(({ rail, cue, inner }, i) => {
                const t = interpolate(frame, [cue, cue + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
                const lineFade = interpolate(frame, [cue + 10, cue + 24], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return (
                  <React.Fragment key={`rail${i}`}>
                    {t < 1 ? <div style={{ position: 'absolute', left: rail.x, top: rail.y + rail.h * t, width: rail.w, height: rail.h * (1 - t), background: PAPER }} /> : null}
                    {frame >= cue && lineFade > 0 ? (
                      <div style={{ position: 'absolute', left: inner === 'right' ? rail.x + rail.w - 2 : rail.x, top: rail.y, width: 2, height: rail.h * t, background: CARET, opacity: lineFade, boxShadow: `0 0 10px ${alpha(L.accent, 0.6)}` }} />
                    ) : null}
                  </React.Fragment>
                );
              })}

              {/* 历史条目：从上方逐条落入左栏 */}
              {!screen && history.map((w, i) => {
                const cue = WEEK_CUE(i);
                if (frame < cue) return null;
                const t = interpolate(frame, [cue, cue + 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: WEEK_DROP });
                const appear = interpolate(frame, [cue, cue + 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                const air = Math.max(0, 1 - t);
                const n = 27 - i;
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute', left: leftRail.x + 4, top: WEEK_Y0 + i * WEEK_H, width: leftRail.w - 8, height: WEEK_H,
                      transform: `translateY(${-48 * air * (portrait ? 1.6 : 1)}px)`, opacity: appear,
                      boxShadow: air > 0.02 ? `0 ${12 * air}px ${24 * air}px rgba(40,20,60,${0.2 * air})` : 'none',
                      background: '#faf8f4', borderBottom: '1px solid rgba(31,41,55,0.07)', padding: `${chrome(8)}px ${chrome(10)}px 0`, boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: chrome(13), fontWeight: 500, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w}</span>
                      <span style={{ fontSize: chrome(10), color: INK3 }}>{`${[3, 26, 19, 12, 5, 29][i]}/${[7, 6, 6, 6, 6, 5][i]}`}</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: chrome(11), color: INK2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`Tuần ${n} · đã lưu`}</div>
                  </div>
                );
              })}
              {/* 窗口上沿受光：一道极淡的顶部高光（玻璃感） */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }} />
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* 收尾标语：底部，左对齐窗口左缘；逐词升起（遮罩上 0.32em / 下 0.26em，越南语声调不被裁） */}
      {frame >= 100 && (
        <div style={{ position: 'absolute', left: tagLeft, top: tagTop, width: tagW, ...type(tagSize2, 760), lineHeight: 1.18, color: L.ink, textShadow: bd ? (L.dark ? '0 2px 18px rgba(0,0,0,0.55)' : '0 1px 12px rgba(255,255,255,0.7)') : undefined }}>
          {(() => {
            let wi = 0;
            return tagLines.map((line, li) => (
              <div key={li} style={{ whiteSpace: 'pre', height: tagSize2 * 1.18, lineHeight: `${tagSize2 * 1.18}px` }}>
                {line.split(' ').map((w, k) => {
                  const idx = wi++;
                  const acc = tagWords[idx]?.acc;
                  const p = ramp(frame, 100 + (acc ? 8 : 0) + idx * tagStep, 16, EASE.snappy);
                  return (
                    <React.Fragment key={k}>
                      {k > 0 ? ' ' : null}
                      <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.03em 0.26em', margin: '-0.32em -0.03em -0.26em' }}>
                        <span style={{ display: 'inline-block', color: acc ? L.accent : undefined, transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      )}
    </AbsoluteFill>
  );
};
