// cloner-depth-echo —— 克隆纵队（第二轮重设计 · 酸柠暗场 · 边缘部署）
// 手法不变：一张主卡"复印"出 7 个克隆体沿纵深等距排开成队 → 停一拍让观众数清 → 全体同步加速吸回本体 → 合体弹一下。
//
// 设计决定
// - look = lime（石墨黑 + 荧光黄绿）。主角是一张 video-shotcraft 渲染卡「launch-film」（顶栏 video-shotcraft 标志）：
//   大号 30fps 读数 + 柠檬绿折线 + 底部 8 个镜头位。语义从"多副本"落到具体卖点：一句提示词 = 8 个镜头同时出片。
// - 纵深：真 3D 透视（perspective 1500），消失点放在左上——克隆体只做 translateZ 后退就自动排向左上，
//   再叠一点 dx/dy 让纵队张开；越远越淡、越虚、越"只剩轮廓"（填充褪掉、柠檬绿描边留下），像 C4D Cloner 的线框回声。
//   每个克隆体顶栏换成它自己的镜头号（S02 / S03 …）——同一配方、不同镜头。
// - 版式：主卡右侧中位（占画宽 ~36%），纵队伸向左上；左下是全片的计数器「×8」（260px 柠檬绿 tabular），
//   克隆每弹出一个它就滚一格；合体后左上空出的位置升起标题「One prompt. / Eight shots.」，尾帧是一张海报。
// - 合体：8 个镜头位在吸回到达的同一帧全部点亮（克隆"回到"本体里），主卡 1→1.06→1 单脉冲 + 一次柠檬绿描边光（Q4 只给主角一次）。
//
// 时间表（30fps，共 138f）
//   0–16    入场：主卡自下 40px 升起 + 由虚到实（snappy），卡内内容 2f 错峰；计数器 ×1 已在左下
//   16–24   预备：主卡按压到 0.96、描边提亮（"复印键按下"）
//   24–44   排开：7 个克隆 spring 错峰 2.2f/个弹向纵深（damping 15，一次轻过冲），每弹出一个计数 +1，顶栏镜头号同时浮现
//   44–76   停 32f：相机极缓推近 2%、纵队整体轻微视差漂移——数得清"有很多个"
//   76–86   吸回 10f：全体同步强 ease-in（越来越快），沿纵深方向按速度加拖影模糊
//   86–104  合体：镜头位全亮、主卡单脉冲 1.06、描边光一次；计数器同帧一记缩放回弹
//   92–118  标题逐词从线下升起（左上），副行淡入
//   118–138 hold 20f：光的呼吸 + 0.6% 极缓推近，干净落定
//
// [Agent Edit] o chu: title1 / title2 (tieu de 2 dong sau khi hop the; TU CUOI title2 to mau nhan), caption (dong duoi
// bo dem), count (con so "1 = nhieu": bo dem chay 1 -> count; 7 ban sao van giu de doc ra "doi hinh"), card_title /
// card_value / card_unit / card_tag (chu tren the chinh). O anh `image` (tuy chon): anh san pham / giao dien thay cho
// so lon + duong bieu do tren the (ban sao chi con khung vien). Khung doc (native): the to 1.55x giua khung, doi hinh
// lui ve phia tren-trai (diem tu o tren the), tieu de tren cung, bo dem + caption duoi the.
import { useCurrentFrame, useVideoConfig, useText, useImage, useShotFonts, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, Dust, alpha, glow, springAt, type } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const CLONER_DEPTH_ECHO_DURATION = 138;

const L = LOOKS.lime;
const N = 7; // 克隆数
const GAP_Z = 250; // 相邻克隆的纵深间隔（px）
const SPREAD = 24; // 排开起始帧
const EACH = 2.2; // 克隆错峰（帧/个）
const MERGE = 76; // 吸回起始帧
const MERGE_DUR = 10;
const LAND = MERGE + MERGE_DUR; // 合体帧 86

// 卡片内部坐标（660×420，纵向整体放大）
const CW0 = 660;
const CH0 = 420;
const PERSP = 1500;

const SPARK = [0.62, 0.58, 0.66, 0.52, 0.55, 0.44, 0.48, 0.36, 0.4, 0.3, 0.33, 0.26, 0.3, 0.22];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// 第 idx（1..N）个克隆的排开进度：物理弹簧，错峰 EACH 帧
const spreadOf = (f: number, idx: number) => (f < SPREAD + (idx - 1) * EACH ? 0 : springAt(f, SPREAD + (idx - 1) * EACH, { damping: 15, stiffness: 150, mass: 0.9 }));
// 吸回：全体同步强 ease-in
const mergeOf = (f: number) => ramp(f, MERGE, MERGE_DUR, EASE.exit);
// 克隆的纵深位置（0 = 本体平面，1 = 排开位）
const depthOf = (f: number, idx: number) => spreadOf(f, idx) * (1 - mergeOf(f));

type CardText = { title: string; value: string; unit: string; tag: string; chips: string[]; image?: string };

// ───────────── 实例卡 ─────────────
const InstanceCard: React.FC<{ region: string; clone: number; lit: number; frame: number; t: CardText }> = ({ region, clone, lit, frame, t }) => {
  const fonts = useShotFonts();
  // clone: 0 = 本体，>0 越大越远 —— 越远填充越淡、只剩轮廓
  const c = clone / N;
  const fill = clone === 0 ? 1 : mix(0.55, 0.06, c);
  const rise = (k: number) => {
    const p = clone === 0 ? ramp(frame, 4 + k * 2, 14, EASE.snappy) : 1;
    return { opacity: p, transform: `translateY(${((1 - p) * 16).toFixed(2)}px)` };
  };
  const pts = SPARK.map((v, i) => `${(i / (SPARK.length - 1)) * 576},${(v * 120).toFixed(1)}`).join(' ');
  const tagW = measureText(region, fonts.mono, 26, 700) + 40;
  const titleSz = fitSize(t.title, { family: fonts.sans, size: 32, maxWidth: CW0 - 84 - 48 - tagW - 20, weight: 600, minSize: 18 });
  const valSz = fitSize(`${t.value}${t.unit}`, { family: fonts.sans, size: 132, maxWidth: 560 - (t.tag ? measureText(t.tag, fonts.sans, 26, 500) + 40 : 0), weight: 750, minSize: 60 });
  return (
    <div
      style={{
        position: 'absolute', inset: 0, borderRadius: 30, overflow: 'hidden',
        background: `linear-gradient(160deg, ${alpha('#20241a', fill)} 0%, ${alpha(L.surface, fill)} 60%, ${alpha('#0f110c', fill)} 100%)`,
        border: `1.5px solid ${clone === 0 ? alpha('#ffffff', 0.12) : alpha(L.accent, mix(0.55, 0.85, c))}`,
        boxShadow: clone === 0
          ? `inset 0 1px 0 ${alpha('#ffffff', 0.1)}, 0 40px 90px -30px ${alpha('#000000', 0.9)}, 0 12px 30px ${alpha('#000000', 0.5)}`
          : `0 0 ${(18 + 20 * c).toFixed(0)}px ${alpha(L.accent, 0.12 + 0.1 * c)}`,
        fontFamily: FONT.sans, color: L.ink,
      }}
    >
      {/* 卡面顶部受光：一道很淡的柠檬绿内光（只本体） */}
      {clone === 0 && (
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 50% at 30% 0%, ${alpha(L.accent, 0.1)} 0%, transparent 70%)` }} />
      )}
      <div style={{ position: 'absolute', left: 42, right: 42, top: 36, display: 'flex', alignItems: 'center', gap: 14, ...rise(0) }}>
        {/* 视频品牌标志（暗底反白版）；克隆体上随卡一起变淡 */}
        <ShotcraftMark size={34} tone="dark" style={{ margin: '-4px 0' }} />
        <div style={{ ...type(titleSz, 600), lineHeight: 1.3, whiteSpace: 'nowrap', color: clone === 0 ? L.ink : alpha(L.ink, 0.85) }}>{t.title}</div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            ...type(26, 700, { mono: true }), height: 44, padding: '0 16px', borderRadius: 22, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
            background: clone === 0 ? L.accent : alpha(L.accent, 0.14), color: clone === 0 ? L.onAccent : L.accent,
            border: clone === 0 ? 'none' : `1.5px solid ${alpha(L.accent, 0.6)}`,
          }}
        >
          {region}
        </div>
      </div>
      {t.image ? (
        // 实拍图 / 截图：本体实图（cover），克隆体只留强调色线框
        <div style={{
          position: 'absolute', left: 42, right: 42, top: 104, bottom: clone === 0 ? 84 : 36, borderRadius: 16, overflow: 'hidden',
          border: clone === 0 ? `1px solid ${alpha('#ffffff', 0.1)}` : `1.5px solid ${alpha(L.accent, 0.6)}`, ...rise(1),
        }}>
          {clone === 0 ? <Img src={t.image} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
        </div>
      ) : (
        <>
          {/* 读数：只有本体是实心（克隆体只留顶栏 + 折线 + 编号） */}
          {clone === 0 && (
            <div style={{ position: 'absolute', left: 40, top: 104, display: 'flex', alignItems: 'baseline', gap: 16, whiteSpace: 'nowrap', ...rise(1) }}>
              <div style={{ ...type(valSz, 750), letterSpacing: '-0.05em', lineHeight: 1.05, color: L.ink }}>
                {t.value}<span style={{ fontSize: valSz * 0.5, letterSpacing: '-0.02em', color: L.ink2, marginLeft: valSz * 0.08 }}>{t.unit}</span>
              </div>
              {t.tag ? <div style={{ ...type(26, 500), color: L.ink3, letterSpacing: '0.12em' }}>{t.tag}</div> : null}
            </div>
          )}
          {/* 折线 */}
          <svg width={576} height={130} style={{ position: 'absolute', left: 42, top: 246, overflow: 'visible', ...rise(2) }}>
            <defs>
              <linearGradient id={`cdeFill${clone}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={L.accent} stopOpacity={0.22} />
                <stop offset="1" stopColor={L.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            {clone === 0 && <polygon points={`0,130 ${pts} 576,130`} fill={`url(#cdeFill${clone})`} opacity={0.9} />}
            <polyline points={pts} fill="none" stroke={L.accent} strokeWidth={clone === 0 ? 4 : 2.5} strokeLinejoin="round" strokeLinecap="round" opacity={clone === 0 ? 1 : 0.8} />
          </svg>
        </>
      )}
      {/* 编号位：本体底部，合体时全部点亮 */}
      {clone === 0 && (
        <div style={{ position: 'absolute', left: 42, right: 42, bottom: 30, display: 'flex', gap: 8, ...rise(3) }}>
          {t.chips.map((r, i) => {
            const on = i === 0 ? 1 : lit;
            return (
              <div
                key={i}
                style={{
                  flex: 1, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...type(18, 600, { mono: true }),
                  background: alpha(L.accent, 0.06 + 0.84 * on),
                  color: on > 0.5 ? L.onAccent : L.ink3,
                  border: `1px solid ${alpha(L.accent, 0.18 + 0.5 * on)}`,
                }}
              >
                {r}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ───────────── 计数器：每一格从下滚上来 ─────────────
const Counter: React.FC<{ value: number; prev: number; tickAge: number; punch: number; size: number }> = ({ value, prev, tickAge, punch, size }) => {
  const fonts = useShotFonts();
  // tickAge：距上一次 +1 过了几帧（滚动 5f）；punch：合体回弹 0..1..0
  const roll = ramp(tickAge, 0, 5, EASE.snappy);
  const w = measureText(String(Math.max(value, prev)), fonts.sans, size, 800) * 0.98 + 10;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', transform: `scale(${(1 + 0.06 * punch).toFixed(4)})`, transformOrigin: '0% 70%' }}>
      <span style={{ ...type(size * 0.62, 500), color: alpha(L.accent, 0.55), marginTop: size * 0.2, marginRight: 8 }}>×</span>
      {/* 不用 overflow 裁切（会把泛光裁出方框）：出场格上移淡出、入场格自下升起淡入 */}
      <div style={{ position: 'relative', height: size * 1.02, width: w }}>
        {[prev, value].map((v, k) => {
          if (v < 1 || (k === 0 && prev === value)) return null;
          const y = k === 0 ? -roll * 45 : (1 - roll) * 45;
          // 滚动中两格都按速度竖向虚化（静止为 0）
          const spd = roll < 1 ? 1 - roll : 0;
          return (
            <div
              key={k}
              style={{
                position: 'absolute', left: 0, top: 0, ...type(size, 800), letterSpacing: '-0.04em', color: L.accent, whiteSpace: 'nowrap',
                transform: `translateY(${y.toFixed(2)}%)`, textShadow: glow(L.accent, 0.35 + 0.5 * punch),
                opacity: k === 0 ? clamp01(1 - roll * 1.6) : prev === value ? 1 : clamp01(roll * 1.6),
                filter: spd > 0.05 && prev !== value ? `blur(${(spd * 6).toFixed(2)}px)` : undefined,
              }}
            >
              {v}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 越南语逐词升起（遮罩上 0.32em / 下 0.26em 留白，叠加声调不被裁）
const Rise: React.FC<{ text: string; start: number; g: number; accentLast?: boolean; style: React.CSSProperties }> = ({ text, start, g, accentLast, style }) => {
  const frame = useCurrentFrame();
  const ws = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ whiteSpace: 'nowrap', ...style }}>
      {ws.map((w, i) => {
        const p = EASE.snappy(clamp01((frame - start - i * g) / 16));
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.24em' }}>
            <span style={{ display: 'inline-block', color: accentLast && i === ws.length - 1 ? L.accent : undefined, transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

export const ClonerDepthEcho: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;

  const title1 = useText('title1', 'Một câu lệnh.');
  const title2 = useText('title2', 'Tám video.');
  const caption = useText('caption', 'video được tạo từ một câu lệnh');
  const countS = useText('count', '8');
  const image = useImage('image');
  const card: CardText = {
    title: useText('card_title', 'video-ra-mắt'),
    value: useText('card_value', '60'),
    unit: useText('card_unit', 'giây'),
    tag: useText('card_tag', '1080p'),
    chips: [],
    image,
  };
  const COUNT = Math.max(2, Math.min(9999, parseInt(countS.replace(/[^\d]/g, ''), 10) || 8));
  const chipsN = Math.min(COUNT, 8);
  card.chips = Array.from({ length: chipsN }, (_, i) => String(i + 1).padStart(2, '0'));
  // 克隆号：本体 #01，克隆依次 #02…（总数大于 8 时按比例取号）
  const regionOf = (idx: number) => `#${String(Math.round(1 + ((COUNT - 1) * idx) / N)).padStart(2, '0')}`;

  // ── 场景几何 ──
  const S = portrait ? 1.55 : 1; // 卡片放大
  const CW = CW0 * S;
  const CH = CH0 * S;
  const CX = portrait ? 960 - CW / 2 : 1130;
  const CY = portrait ? Math.round(SH * 0.5) : 352;
  // 透视消失点：横向放左上角；纵向放在卡片正上方偏左——后退即向上排成纵队
  const VP = portrait ? { x: 960 - 250, y: CY - 1150 } : { x: 360, y: 120 };
  const DXI = portrait ? -18 : -58;
  const DYI = portrait ? -10 : -6;

  // 主卡入场 / 预备按压 / 合体脉冲
  const enter = ramp(frame, 0, 16, EASE.snappy);
  const press = ramp(frame, 16, 8, EASE.swift) * (1 - ramp(frame, SPREAD, 10, EASE.overshoot));
  const popT = clamp01((frame - LAND) / 16);
  const pop = frame >= LAND ? Math.sin(popT * Math.PI) * Math.pow(1 - popT, 0.6) : 0;
  const heroScale = (1 - 0.04 * press) * (1 + 0.06 * pop) * mix(0.94, 1, enter);
  const rimFlash = frame >= LAND ? Math.max(0, 1 - (frame - LAND) / 14) : 0;
  const lit = ramp(frame, LAND - 1, 5, EASE.snappy);

  // 计数：每个克隆弹出就滚一格；数值按比例从 1 走到 COUNT
  let born = 0;
  let lastTick = -99;
  for (let idx = 1; idx <= N; idx++) {
    const f0 = SPREAD + (idx - 1) * EACH + 2;
    if (frame >= f0) { born++; lastTick = f0; }
  }
  const valAt = (k: number) => Math.round(1 + ((COUNT - 1) * k) / N);
  const count = valAt(born);
  const prevCount = valAt(Math.max(0, born - 1));
  const counterPunch = frame >= LAND ? Math.sin(clamp01((frame - LAND) / 12) * Math.PI) : 0;

  // 相机：停留段极缓推近；合体后再极缓推进；纵队在停留段轻微视差漂移
  const dolly = 1 + 0.02 * ramp(frame, 40, 40, EASE.smooth) + 0.006 * ramp(frame, 100, 38, EASE.smooth);
  const drift = 14 * ramp(frame, 40, 40, EASE.smooth) * (1 - mergeOf(frame));

  const labelIn = ramp(frame, 6, 16, EASE.out);

  // ── 文字版式 ──
  const tSize0 = portrait ? 200 : 112;
  const tMaxW = portrait ? 1680 : 940;
  // 每行先尝试单行（≥0.72 倍字号）；放不下就各自折成 ≤2 行
  const tFits = [title1, title2].filter(Boolean).every((t) => measureText(t, fonts.sans, tSize0 * 0.72, 780) <= tMaxW);
  const tRows = (t: string) => (!t ? [] : tFits ? [t] : wrapLines(t, fonts.sans, tSize0 * 0.72, tMaxW, 780, 2));
  const rows1 = tRows(title1);
  const rows2 = tRows(title2);
  const tSize = Math.min(...[...rows1, ...rows2].map((t) => fitSize(t, { family: fonts.sans, size: tFits ? tSize0 : tSize0 * 0.72, maxWidth: tMaxW, weight: 780, minSize: tSize0 * 0.4 })));
  const tLine = tSize * 1.14;
  const titleTop = portrait ? Math.max(200, CY - 1150) : 168;
  const g1 = Math.min(4, 14 / Math.max(1, title1.split(/\s+/).length));
  const g2 = Math.min(4, 14 / Math.max(1, title2.split(/\s+/).length));
  const cSize = portrait ? 360 : 260;
  const counterTop = portrait ? CY + CH + 110 : 622;
  const capSize0 = portrait ? 54 : 32;
  const capTop = portrait ? counterTop + cSize * 1.06 + 50 : 900;
  const capSize = fitSize(caption, { family: fonts.sans, size: capSize0, maxWidth: (portrait ? 1680 : 1640) - 60, weight: 600, minSize: 20 });

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.62, y: portrait ? 0.5 : 0.42 }} fill={{ x: 0.1, y: 0.95 }} breathe={0.6} intensity={0.45}>
        <Dust look={L} count={26} seed={5} drift={0.18} opacity={0.35} color={L.accent} />
      </Stage>
      {/* 主卡脚下的柠檬绿地光 */}
      <div
        style={{
          position: 'absolute', left: CX - 160 * S, top: CY + CH - 40 * S, width: CW + 320 * S, height: 220 * S,
          background: `radial-gradient(ellipse 50% 50% at 50% 40%, ${alpha(L.accent, 0.14 + 0.12 * rimFlash)} 0%, transparent 70%)`,
          opacity: enter,
        }}
      />

      {/* 相机层：推近以主卡中心为锚 */}
      <AbsoluteFill style={{ transform: `scale(${dolly.toFixed(5)})`, transformOrigin: `${CX + CW / 2}px ${CY + CH / 2}px` }}>
        <AbsoluteFill style={{ perspective: PERSP, perspectiveOrigin: `${VP.x}px ${VP.y}px` }}>
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
            {/* 克隆纵队：从远到近渲染，遮挡正确 */}
            {Array.from({ length: N }, (_, k) => N - k).map((idx) => {
              const d = depthOf(frame, idx);
              const sp = spreadOf(frame, idx);
              const op = (1 - (idx / N) * 0.72) * clamp01(sp * 2.5) * (1 - mergeOf(frame) * 0.4);
              if (op <= 0.005 || d <= 0.002) return null;
              const z = -GAP_Z * S * idx * d;
              const dx = (DXI * S * idx - drift * idx * 0.4) * d;
              const dy = DYI * S * idx * d;
              // 速度 → 拖影模糊
              const v = Math.abs(depthOf(frame + 0.5, idx) - depthOf(frame - 0.5, idx)) * GAP_Z * idx;
              const blur = Math.min(10, v * 0.06);
              // 出生闪：弹出的前 8 帧描边更亮（一次复印的"啪"）
              const bornF = clamp01(1 - (frame - (SPREAD + (idx - 1) * EACH)) / 8);
              return (
                <div
                  key={idx}
                  style={{
                    position: 'absolute', left: CX, top: CY, width: CW, height: CH,
                    transform: `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, ${z.toFixed(2)}px)`,
                    opacity: op,
                    filter: `blur(${(blur + (idx / N) * 1.6).toFixed(2)}px)${bornF > 0 ? ` drop-shadow(0 0 ${(14 * bornF).toFixed(1)}px ${alpha(L.accent, 0.7 * bornF)})` : ''}`,
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, width: CW0, height: CH0, transform: `scale(${S})`, transformOrigin: '0 0' }}>
                    <InstanceCard region={regionOf(idx)} clone={idx} lit={0} frame={frame} t={card} />
                  </div>
                </div>
              );
            })}

            {/* 本体 */}
            <div
              style={{
                position: 'absolute', left: CX, top: CY, width: CW, height: CH,
                transform: `translate3d(0px, ${((1 - enter) * 40).toFixed(2)}px, 0px) scale(${heroScale.toFixed(4)})`,
                opacity: clamp01(enter * 1.4),
                filter: enter < 1 ? `blur(${((1 - enter) * 10).toFixed(2)}px)` : undefined,
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, width: CW0, height: CH0, transform: `scale(${S})`, transformOrigin: '0 0' }}>
                <InstanceCard region="#01" clone={0} lit={lit} frame={frame} t={card} />
                {/* 合体描边光（一次，裁在圆角里） */}
                <div
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 30, pointerEvents: 'none',
                    border: `2px solid ${alpha(L.accent, 0.25 * press + 0.9 * rimFlash)}`,
                    boxShadow: `0 0 ${(50 * rimFlash).toFixed(1)}px ${alpha(L.accent, 0.45 * rimFlash)}, inset 0 0 ${(40 * rimFlash).toFixed(1)}px ${alpha(L.accent, 0.18 * rimFlash)}`,
                  }}
                />
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* 合体后升起的标题（横向左上空位；纵向顶部） */}
      <div style={{ position: 'absolute', left: portrait ? 120 : 140, top: titleTop, color: L.ink }}>
        {rows1.map((r, i) => (
          <Rise key={`a${i}`} text={r} start={92 + i * 3} g={g1} style={{ position: 'absolute', left: 0, top: i * tLine, ...type(tSize, 780), lineHeight: 1.14 }} />
        ))}
        {rows2.map((r, i) => (
          <Rise key={`b${i}`} text={r} start={98 + i * 3} g={g2} accentLast={i === rows2.length - 1} style={{ position: 'absolute', left: 0, top: (rows1.length + i) * tLine, ...type(tSize, 780), lineHeight: 1.14 }} />
        ))}
      </div>

      {/* 计数器 */}
      <div style={{ position: 'absolute', left: portrait ? 120 : 128, top: counterTop, opacity: labelIn, transform: `translateY(${((1 - labelIn) * 20).toFixed(2)}px)` }}>
        <Counter value={count} prev={prevCount} tickAge={frame - lastTick} punch={counterPunch} size={cSize} />
      </div>
      {caption ? (
        <div
          style={{
            position: 'absolute', left: portrait ? 132 : 140, top: capTop, display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap',
            opacity: labelIn, ...type(capSize, 600), lineHeight: 1.3, color: L.ink2, letterSpacing: '0.02em',
          }}
        >
          <span style={{ width: 40 * (portrait ? 1.5 : 1), height: 2 * (portrait ? 1.5 : 1), background: L.accent, flexShrink: 0 }} />
          {caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
