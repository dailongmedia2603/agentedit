// page-waterfall-wall —— 页面瀑布墙：真实页面截图切片排成 3 列，在后仰墙面上差速反向无限滚动，
// 外层镜头缓推，做"内容多到流不完"的一览。
// 质感层（改版）：
// · 素材只用卡片级切片（card1–10，列间不复用）；原先混入的整页空白截图 projects-empty 与
//   2032×88 的搜索条细长切片在墙里读作空白卡 / 碎条，已去掉
// · 3 列 420px 列宽、整墙收进画内（原 560 列宽 × 1.2 两侧列被画框切掉一半，左右列文字透视歪斜严重）
// · 墙的放大与缓推改走 CSS zoom（布局级缩放），切片文字按显示尺寸栅格化（Q2），不再被放大发软
// · 纯色 #101014 + 实色渐变遮罩换成：冷调暗场柔光底（墙后一团微弱靛蓝余光）+ 上下羽化
//   （渐变取底色上下缘的实际色）+ 顶部远端轻微压暗（空气透视）+ 暗角 + 颗粒
// · 切片卡加发丝线与顶部受光沿，投影改两层（接触影 + 环境影）
// 素材路径统一读 textures/live/（与工作台 / 模板 public 一致）。
//
// [Agent Edit] o anh: shot1..shot9 (anh chup man hinh / giao dien / anh bat ky, TI LE BAT KY). Anh duoc chia vong tron
// vao 3 cot (cot sau bat dau lech de cung hang khong trung anh), moi cot lap lai cho du dai (>= 6 the, khung doc >= 10)
// -> khong lo khoang trong; chu ky lap gian theo so the de giu toc do goc (12/9/14s cho 4/3/3 the). The cao qua (anh doc
// dai) bi cat tu tren xuong (cover). Khong co anh -> anh mau. o chu (tuy chon): title (chu noi giua khung, kinh mo).
// Khung doc (native): cot rong hon (500), tuong cao theo khung, phoi canh gian theo chieu cao (giu goc nghieng 20 do).
import { staticFile, useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate } from 'remotion';
import { Backdrop, Grain } from '../../../fixtures/Polish';
import { VerticalTicker, TickerColumn } from './VerticalTicker';

export const PAGE_WATERFALL_WALL_DURATION = 150; // 5s（无限循环体，按段落需要裁）

const BG = '#0d0e13';
const ZOOM = 1.2; // 补透视收缩的底值（配方 scale 1.2）
const PUSH = 0.06; // 镜头缓推 1→1.06

const shot = (src: string, maxH: number, key: string) => (
  <div
    key={key}
    style={{
      position: 'relative',
      borderRadius: 20,
      overflow: 'hidden',
      background: '#fefcf9',
      boxShadow: '0 2px 4px rgba(0,0,0,0.35), 0 22px 48px -12px rgba(0,0,0,0.6)',
    }}
  >
    <Img src={src} style={{ width: '100%', maxHeight: maxH, objectFit: 'cover', objectPosition: '50% 0%', display: 'block' }} />
    {/* 发丝线 + 顶部受光沿（裁在圆角内） */}
    <div
      style={{
        position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    />
  </div>
);

const SAMPLES = ['card1.png', 'card2.png', 'card3.png', 'card10.png', 'card4.png', 'card5.png', 'card6.png', 'card7.png', 'card8.png', 'card9.png'].map((f) => `textures/live/${f}`);
const BASE_N = [4, 3, 3]; // so the goc moi cot (chu ky 12/9/14s tinh cho so the nay)

// 3 列差速反向（配方卡参数：loop 12/9/14s，中列反向）；anh chia vong tron vao 3 cot, cot du dai thi lap lai
export const buildColumns = (loops: [number, number, number], srcs: string[], minItems: number, maxH: number): TickerColumn[] => {
  const n = srcs.length;
  const cols: string[][] = [[], [], []];
  if (n >= 3) srcs.forEach((s, i) => cols[i % 3].push(s));
  else for (let c = 0; c < 3; c++) for (let k = 0; k < n; k++) cols[c].push(srcs[(k + c) % n]);
  return cols.map((base, c) => {
    const reps = Math.max(1, Math.ceil(minItems / base.length));
    const items: string[] = [];
    for (let r = 0; r < reps; r++) items.push(...base);
    return {
      items: items.map((s, i) => shot(s, maxH, `${c}-${i}`)),
      durationInSeconds: loops[c] * (items.length / BASE_N[c]),
      direction: (c === 1 ? 1 : -1) as -1 | 1,
    };
  });
};

// 上下羽化：渐变色取暗场底在上 / 下缘的实际色（远端顶部羽化更长），行软进软出
const FADE_TOP = 'linear-gradient(to bottom, #111319 0%, rgba(17,19,25,0.85) 10%, rgba(17,19,25,0) 30%)';
const FADE_BOTTOM = 'linear-gradient(to top, #08090c 0%, rgba(8,9,12,0.8) 8%, rgba(8,9,12,0) 22%)';

const Wall: React.FC<{ columns: TickerColumn[]; zoom: number; H: number; colW: number; persp: number }> = ({ columns, zoom, H, colW, persp }) => (
  <AbsoluteFill>
    {/* zoom 让墙按显示尺寸布局与栅格化；内部 1920/zoom 宽的 css 画布居中排 3 列 */}
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920 / zoom, height: H / zoom, zoom }}>
      <VerticalTicker columns={columns} backgroundColor="transparent" maskHeight={0} scale={1} columnWidth={colW} gap={26} perspective={persp} />
    </div>
    {/* 空气透视：墙的远端（画面上部）轻微压暗 */}
    <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(13,14,19,0.5) 0%, rgba(13,14,19,0) 50%)', pointerEvents: 'none' }} />
    <AbsoluteFill style={{ background: FADE_TOP, pointerEvents: 'none' }} />
    <AbsoluteFill style={{ background: FADE_BOTTOM, pointerEvents: 'none' }} />
  </AbsoluteFill>
);

export const PageWaterfallWall: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = H > 1080 * 1.2;
  const imgs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => useImage(`shot${i}`)).filter((x): x is string => !!x);
  const srcs = imgs.length ? imgs : SAMPLES.map((s) => staticFile(s));
  const title = useText('title', '').trim();
  // 镜头缓推寄生在外层，墙自身循环、镜头单向（线性铺满全镜，配方定义）
  const push = interpolate(frame, [0, durationInFrames], [1, 1 + PUSH], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const colW = portrait ? 500 : 420;
  const columns = buildColumns([12, 9, 14], srcs, portrait ? 10 : 6, colW * 1.9);
  const persp = 1000 * (H / 1080);

  // chu noi (tuy chon): kinh mo toi giua khung, hien sau 0.5s
  const tSize0 = portrait ? 120 : 84;
  const tW = portrait ? 1560 : 1300;
  let tSize = tSize0;
  let tLines = title ? wrapLines(title, fonts.sans, tSize, tW, 700, 99) : [];
  while (tLines.length > 2 && tSize > tSize0 * 0.5) {
    tSize = Math.floor(tSize * 0.93);
    tLines = wrapLines(title, fonts.sans, tSize, tW, 700, 99);
  }
  if (tLines.length > 2) tLines = wrapLines(title, fonts.sans, tSize, tW, 700, 2);
  if (tLines.length) tSize = Math.min(tSize, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tSize, maxWidth: tW, weight: 700, minSize: tSize0 * 0.35 })));
  const tp = interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - Math.pow(1 - t, 4) });

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Backdrop tone="dark" light={{ x: 0.5, y: 0.42 }} accent="#5b63d3" grain={0} vignette={0} />
      <Wall columns={columns} zoom={ZOOM * push} H={H} colW={colW} persp={persp} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(5,6,10,0) 55%, rgba(5,6,10,0.55) 100%)', pointerEvents: 'none' }} />
      {tLines.length ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div
            style={{
              padding: `${tSize * 0.42}px ${tSize * 0.7}px ${tSize * 0.36}px`, borderRadius: tSize * 0.5,
              background: 'rgba(12,13,18,0.62)', backdropFilter: 'blur(18px)', border: '1.5px solid rgba(255,255,255,0.12)',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)', opacity: tp, transform: `translateY(${((1 - tp) * 30).toFixed(1)}px) scale(${(0.96 + 0.04 * tp).toFixed(4)})`,
              textAlign: 'center',
            }}
          >
            {tLines.map((l, i) => (
              <div key={i} style={{ fontFamily: fonts.sans, fontWeight: 700, fontSize: tSize, lineHeight: 1.22, color: '#f5f6fa', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
        </AbsoluteFill>
      ) : null}
      <Grain opacity={0.08} blend="soft-light" />
    </AbsoluteFill>
  );
};

// 接缝自检用：短 loop（3s=90f）、无镜头推，f0 与 f90 应逐像素一致
export const SeamTest: React.FC = () => {
  const srcs = SAMPLES.map((s) => staticFile(s));
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Wall columns={buildColumns([3, 3, 3], srcs, 6, 800)} zoom={ZOOM} H={1080} colW={420} persp={1000} />
    </AbsoluteFill>
  );
};
