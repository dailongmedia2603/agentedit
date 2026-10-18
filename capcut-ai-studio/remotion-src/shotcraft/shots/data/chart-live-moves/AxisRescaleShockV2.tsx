// axis-rescale-shock-v2 —— 轴爆表重标：折线正常爬升，新值顶破图表上沿冲进标题区，
// 停半拍，y 轴"哗"地重标（旧刻度飞出 / 新刻度滑入 / 网格加密 / 旧线压扁成地平线），新值落回 + 弹真值标签。
//
// 第二轮重设计（沙色瑞士海报 · 渲染月报）：
// - look = sand（米色纸 + 墨黑 + 赤陶）。不再是"卡片里的小图表"，而是整张画面就是一页瑞士网格财务海报：
//   左上 120px 粗黑体标题「Monthly renders」、右上同字号年度合计 KPI，下面是满版图表（1540×540 绘图区），
//   3px 墨黑基线 + 3px "天花板"粗规线 + 发丝网格，历史面积用 45° 斜线排线（印刷感），月份/刻度 32px。
// - 主角是赤陶色爆表段：Dec 新值从 Nov 起跳，越冲越快顶破天花板规线（规线在穿透点裂开、两片碎屑弹飞），
//   一路冲进右上角的 KPI 数字里（KPI 被撞得一颤），悬停半拍带柔光——"装不下"字面化。
// - 重标：14f 内旧刻度 25k–100k 向下飞出、新刻度 100k–400k 从上滑入，网格 4→8 根从左展开，
//   旧折线与斜线面积被压扁成地平线；爆表点落回 340k，弹出赤陶真值标签，KPI 滚到 833k。
// - 品牌轮：眉题换成 video-shotcraft 标志 + 字标，内容从财务营收换成渲染量（数值与版式不变）。
//
// 时间表（30fps，共 168f）：
//   0–20    规线从左画出、标题逐词升起、刻度/月份淡入（第 1 帧已有纸面与规线起点）
//   14–56   历史段 Jan→Nov 写入（42f，不对称 in-out），笔尖带墨点
//   50–62   预警：天花板规线与 100k 刻度转赤陶，Nov 点一圈脉冲（预备）
//   62–76   爆表 14f：越冲越快（ease-in 主导）顶破规线（~69f 穿透：裂口 + 碎屑 + 图表震 10px）→ 冲进 KPI
//   76–94   悬停 18f：笔尖亮头 + 柔光，KPI 被撞后阻尼回位
//   94–108  重标 14f（expo-out）：刻度换、网格密、旧线压扁、端点落回
//   106–126 端点标记 overshoot 落座 + 真值标签弹出；KPI 493k → 833k
//   126–168 hold 42f：只有极缓推镜（1 → 1.018）
//
// [Agent Edit] o chu (so lieu tu loi noi): kicker, title, value (gia tri BUNG NO, vd "340k"), before (ky ngay truoc, vd
// "72k"), series (tuy chon: ca chuoi so, so cuoi = gia tri bung no), periods (nhan truc x; mac dinh T1..T12),
// kpi_label + kpi (+ kpi_from) goc phai — khong co kpi -> hien % tang truong tinh tu value/before, badge (dong duoi so
// tren nhan; mac dinh "gấp X lần <ky truoc>"). Truc y cu / moi tu tinh "dep" theo before / value (value ~85% truc moi);
// nhan truc giu don vi ngan cua value (k, tr, %, $...). Khung doc (native): tieu de to xuong dong, KPI xuong hang rieng
// ngay tren bieu do (doan bung no van dam vao so KPI), bieu do cao ~1300px, chu truc to.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import { balance2, fmtBare, niceStep, parseNum, type Num } from './numfmt';

export const AXIS_RESCALE_SHOCK_V2_DURATION = 168;

const L = LOOKS.sand;
const ACC = L.accent; // 赤陶：只给爆表段 / 事件
const INK = L.ink;

// 版式网格（横向；纵向见组件内）
const M = 96;
const X1 = 1800; // 绘图区右（末期）

const DATA = [22, 30, 26, 38, 35, 47, 44, 58, 55, 66, 72]; // 历史曲线形状（原版），按 before 缩放

const DRAW0 = 14;
const DRAW1 = 56;
const WARN = 50;
const SHOCK0 = 62;
const SHOCK1 = 76;
const BEAT = 94;
const RESCALE1 = 108;
const MARK = 106;

// 冲顶：起步慢、越冲越快，到顶微过冲
const easeShock = bezier(0.7, 0, 0.36, 1.06);

// 越南语逐词升起（遮罩上 0.32em / 下 0.26em 留白，叠加声调不被裁）
const Rise: React.FC<{ text: string; start: number; g: number; style: React.CSSProperties }> = ({ text, start, g, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ whiteSpace: 'nowrap', ...style }}>
      {text.split(/\s+/).filter(Boolean).map((w, i) => {
        const p = EASE.snappy(Math.min(1, Math.max(0, (frame - start - i * g) / 18)));
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: '0.22em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

export const AxisRescaleShockV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;

  // ── 文案 / 数据 ──
  const kicker = useText('kicker', 'Doanh thu · 2026');
  const title = useText('title', 'Doanh thu hằng tháng');
  const valueS = useText('value', '340k');
  const beforeS = useText('before', '72k');
  const seriesIn = useList('series', []);
  const periodsIn = useList('periods', []);
  const kpiLabelIn = useText('kpi_label', '');
  const kpiS = useText('kpi', '');
  const kpiFromS = useText('kpi_from', '');
  const badgeIn = useText('badge', '');

  const vN = parseNum(valueS, 340);
  const seriesN = seriesIn.map((x) => parseNum(x, NaN)).filter((x) => x.ok);
  const useSeries = seriesN.length >= 3;
  const shockV = useSeries ? seriesN[seriesN.length - 1].value : vN.value;
  const fmtSrc: Num = useSeries ? seriesN[seriesN.length - 1] : vN;
  const bN = parseNum(beforeS, shockV / 4.7);
  const hist = useSeries ? seriesN.slice(0, -1).map((x) => x.value) : DATA.map((d) => (d / 72) * bN.value);
  const DATAV = [...hist, shockV];
  const N = DATAV.length;
  const before = hist[hist.length - 1];
  const periods = Array.from({ length: N }, (_, i) => (periodsIn[i] ?? '').trim() || `T${i + 1}`);
  const valueLabel = useSeries ? seriesIn[seriesIn.length - 1].trim() : valueS.trim();

  // 轴：旧量程让历史峰值落在 ~72%；新量程让爆表值落在 ~85%
  const histMax = Math.max(...hist, 1e-9);
  const step0 = niceStep(histMax / 0.72 / 4, true);
  const range0 = step0 * 4;
  const step1 = Math.max(niceStep(shockV / 0.85 / 4, true), step0 * 1.5);
  const range1 = step1 * 4;
  const unitShort = fmtSrc.post.trim().length > 0 && fmtSrc.post.trim().length <= 3 ? fmtSrc.post : '';
  const decOf = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? 0 : Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2);
  const tickLabel = (v: number) => `${fmtSrc.pre}${fmtBare(v, fmtSrc, decOf(v))}${unitShort}`;
  const OLD = [1, 2, 3, 4].map((i) => tickLabel(step0 * i));
  const NEW = [1, 2, 3, 4].map((i) => tickLabel(step1 * i));
  const mult = before > 0 ? shockV / before : 0;
  const pct = (mult - 1) * 100;
  const pctS = `${pct >= 0 ? '+' : '−'}${fmtBare(Math.abs(pct), fmtSrc, Math.abs(pct) < 10 ? 1 : 0)}%`;
  const prevPct = hist.length >= 2 && hist[hist.length - 2] > 0 ? (before / hist[hist.length - 2] - 1) * 100 : 0;
  const multS = fmtBare(mult, fmtSrc, mult < 10 ? 1 : 0);
  const badge = badgeIn || (mult > 1 ? `gấp ${multS} lần ${periods[N - 2]}` : '');
  // KPI：给了 kpi 就从 kpi_from（默认 = kpi 减去爆表值）滚到 kpi；没给就滚增长率
  const kN = parseNum(kpiS, 0);
  const hasKpi = !!kpiS.trim() && kN.ok;
  const kFromN = parseNum(kpiFromS, Math.max(0, kN.value - shockV));
  const kpiLabel = kpiLabelIn || (hasKpi ? 'Tổng cộng' : 'Tăng trưởng');
  const kpiFinal = hasKpi ? kpiS.trim() : pctS;

  // ── 版式 ──
  const K = portrait ? 1.5 : 1; // 字号 / 线宽倍率
  const tickSize = 32 * K;
  const tickW = Math.max(...[...OLD, ...NEW, '0'].map((t) => measureText(t, fonts.sans, tickSize, 600))) + 30 * K;
  const X0 = Math.max(portrait ? 250 : 268, M + tickW + 20);
  const PW = X1 - X0;
  const kpiSize0 = portrait ? 210 : 124;
  const kpiW = (sz: number) => measureText(kpiFinal, fonts.sans, sz, 850) * 1.02;
  const titleSize0 = portrait ? 180 : 124;
  let titleLines: string[];
  let titleSize: number;
  let kpiSize: number;
  let CEIL: number;
  let BASE: number;
  let headTop: number;
  let titleTop: number;
  let kpiTop: number;
  if (portrait) {
    const tw = wrapLines(title, fonts.sans, titleSize0, 1728, 850, 2);
    titleLines = tw.length === 2 ? balance2(title.split(/\s+/).filter(Boolean), (t) => measureText(t, fonts.sans, titleSize0, 850)) ?? tw : tw;
    titleSize = Math.min(...titleLines.map((l) => fitSize(l, { family: fonts.sans, size: titleSize0, maxWidth: 1728, weight: 850, minSize: 90 })));
    kpiSize = Math.min(kpiSize0, kpiSize0 * (1500 / Math.max(1, kpiW(kpiSize0))));
    const PH = Math.round(Math.min(1400, Math.max(1000, SH - 2000)));
    const block = 52 + 50 + titleLines.length * titleSize * 1.12 + 90 + 60 + kpiSize * 1.05 + 150 + PH + 100;
    headTop = Math.max(120, Math.round((SH - block) / 2));
    titleTop = headTop + 52 + 50;
    kpiTop = titleTop + titleLines.length * titleSize * 1.12 + 90;
    CEIL = Math.round(kpiTop + 60 + kpiSize * 1.05 + 150);
    BASE = CEIL + PH;
  } else {
    kpiSize = Math.min(kpiSize0, kpiSize0 * (620 / Math.max(1, kpiW(kpiSize0))));
    const room = 1728 - kpiW(kpiSize) - 70;
    const one = fitSize(title, { family: fonts.sans, size: titleSize0, maxWidth: room, weight: 850, minSize: 76 });
    if (measureText(title, fonts.sans, one, 850) <= room) {
      titleLines = [title];
      titleSize = one;
    } else {
      const tw = wrapLines(title, fonts.sans, 76, room, 850, 2);
      titleLines = tw.length === 2 ? balance2(title.split(/\s+/).filter(Boolean), (t) => measureText(t, fonts.sans, 76, 850)) ?? tw : tw;
      titleSize = Math.min(...titleLines.map((l) => fitSize(l, { family: fonts.sans, size: 76, maxWidth: room, weight: 850, minSize: 40 })));
    }
    CEIL = 362;
    BASE = 902;
    headTop = 92;
    titleTop = 140 + (titleLines.length > 1 ? -6 : (124 - titleSize) * 0.4);
    kpiTop = 92;
  }
  const PH = BASE - CEIL;
  const SHOCK_TOP = portrait ? kpiTop + 60 + kpiSize * 0.55 : CEIL - 226; // 冲出天花板，扎进 KPI 数字
  const xOf = (i: number) => X0 + (i / (N - 1)) * PW;

  const rescaleP = ramp(frame, BEAT, RESCALE1 - BEAT, EASE.snappy);
  const range = mix(range0, range1, rescaleP);
  const yOf = (v: number) => BASE - (v / range) * PH;

  // 历史段写入
  const drawT = ramp(frame, DRAW0, DRAW1 - DRAW0, EASE.swift) * (N - 2);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= Math.floor(drawT); i++) pts.push([xOf(i), yOf(DATAV[i])]);
  if (drawT < N - 2 && drawT > Math.floor(drawT)) {
    const i = Math.floor(drawT);
    const f = drawT - i;
    pts.push([mix(xOf(i), xOf(i + 1), f), mix(yOf(DATAV[i]), yOf(DATAV[i + 1]), f)]);
  }
  const lineD = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // 爆表段
  const shockT = ramp(frame, SHOCK0, SHOCK1 - SHOCK0, easeShock);
  const nx = xOf(N - 2);
  const ny = yOf(DATAV[N - 2]);
  const topY = mix(SHOCK_TOP, yOf(DATAV[N - 1]), rescaleP);
  const hx = mix(nx, X1, Math.min(1, shockT));
  const hy = mix(ny, topY, shockT);
  const shockOn = frame >= SHOCK0;

  // 面积（含爆表段）
  const all: Array<[number, number]> = shockOn ? [...pts, [hx, hy]] : pts;
  const areaD = all.length > 1
    ? `M${all[0][0]},${BASE} ` + all.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + ` L${all[all.length - 1][0].toFixed(2)},${BASE} Z`
    : '';

  // 穿透天花板：线段与 y=CEIL 的交点
  const ny0 = BASE - (DATAV[N - 2] / range0) * PH;
  const crossX = nx + ((ny0 - CEIL) / (ny0 - SHOCK_TOP)) * (X1 - nx);
  const pierced = shockOn && hy <= CEIL + 0.5 && rescaleP < 0.02;
  // 穿透帧（求一次）：shockT 使 hy 过 CEIL 的帧
  let PIERCE = SHOCK1;
  for (let f = SHOCK0; f <= SHOCK1; f += 0.25) {
    if (mix(ny0, SHOCK_TOP, ramp(f, SHOCK0, SHOCK1 - SHOCK0, easeShock)) <= CEIL) { PIERCE = f; break; }
  }
  const sinceP = frame - PIERCE;
  const crack = sinceP >= 0 ? ramp(frame, PIERCE, 8, EASE.snappy) * (1 - ramp(frame, BEAT, 14, EASE.smooth)) : 0;

  // 图表震：阻尼正弦，穿透帧起 12f
  const kick = sinceP >= 0 && sinceP < 14 ? 10 * K * Math.exp(-sinceP / 3.4) * Math.sin(sinceP * 1.8) : 0;
  // KPI 被撞：冲到顶（SHOCK1）时向上一颤
  const sinceTop = frame - (SHOCK1 - 2);
  const kpiKick = sinceTop >= 0 && sinceTop < 16 ? -14 * K * Math.exp(-sinceTop / 3.8) * Math.cos(sinceTop * 1.5) : 0;

  const warn = ramp(frame, WARN, 10, EASE.out) * (1 - ramp(frame, BEAT, 12, EASE.out));
  const hang = shockOn ? ramp(frame, SHOCK1 - 4, 8, EASE.out) * (1 - ramp(frame, BEAT, 14, EASE.out)) : 0;
  const shockW = mix(12, 7, ramp(frame, BEAT, 16, EASE.out)) * K;

  const markS = ramp(frame, MARK, 12, EASE.overshoot);
  const ripple = ramp(frame, MARK + 2, 20, EASE.out);
  const valS = ramp(frame, MARK + 4, 14, EASE.overshoot);
  const totalP = ramp(frame, MARK + 2, 20, EASE.snappy);
  // KPI 滚动：从起点滚到终值（保留原写法的前后缀 / 小数位）
  const kpiNow = totalP >= 0.999
    ? kpiFinal
    : hasKpi
      ? `${kN.pre}${fmtBare(mix(kFromN.value, kN.value, totalP), kN, kN.dec)}${kN.post}`
      : (() => {
          // 增长率模式：从上一期的增长率（末前两期）滚到本期的爆表增长率
          const v = mix(prevPct, pct, totalP);
          return `${v >= 0 ? '+' : '−'}${fmtBare(Math.abs(v), fmtSrc, Math.abs(pct) < 10 ? 1 : 0)}%`;
        })();

  const rule = (d: number) => ramp(frame, d, 20, EASE.snappy);
  const cam = mix(1, 1.018, ramp(frame, 0, AXIS_RESCALE_SHOCK_V2_DURATION, EASE.smooth));

  const tickY = (i: number) => BASE - ((i + 1) / 4) * PH;

  // 碎屑（两片规线残段从穿透点弹飞）
  const shard = (k: number) => {
    if (sinceP < 0 || sinceP > 32) return null;
    const t = sinceP / 32;
    const dir = k % 2 === 0 ? -1 : 1;
    const sp = [1, 0.75, 0.55][k];
    const x = crossX + dir * (18 + 190 * K * sp * EASE.out(t));
    const y = CEIL - (170 - k * 40) * K * EASE.out(t) + 300 * K * t * t;
    const w = [40, 30, 18][k] * K;
    return (
      <rect key={k} x={x - w / 2} y={y - 2 * K} width={w} height={4 * K} fill={ACC} opacity={1 - EASE.exit(t)}
        transform={`rotate(${dir * (240 - k * 50) * t} ${x} ${y})`} />
    );
  };

  // 真值标签尺寸
  const tagNum = 76 * K;
  const tagSub = 32 * K;
  const tagW = Math.max(measureText(valueLabel, fonts.sans, tagNum, 850), badge ? measureText(badge, fonts.sans, tagSub, 600) : 0) + 64 * K;
  const tagH = (badge ? 140 : 110) * K;
  const monthStep = PW / (N - 1);
  const monthSize = Math.min(32 * K, ...periods.map((m) => fitSize(m, { family: fonts.sans, size: 32 * K, maxWidth: monthStep - 12, weight: 600, minSize: 18 })));
  const kpiLabelSize = fitSize(kpiLabel, { family: fonts.sans, size: 32 * K, maxWidth: portrait ? 1728 : 620, weight: 650, minSize: 20 });
  const titleStep = Math.min(5, 26 / Math.max(1, title.split(/\s+/).length));

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.0 }} fill={{ x: 0.95, y: 0.95 }} />

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: `60% ${portrait ? CEIL + PH * 0.3 : SH * 0.45}px` }}>
        {/* 标题行 */}
        <div style={{ position: 'absolute', left: M, top: headTop, maxWidth: portrait ? 1728 : 1728 - kpiW(kpiSize) - 60, display: 'flex', alignItems: 'center', gap: 12 * K, ...type(32 * K, 650), color: L.ink2, opacity: ramp(frame, 0, 12, EASE.out), whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {BRAND.name ? (
            <>
              <ShotcraftMark size={38 * K} tone="light" style={{ marginTop: -2 }} />
              <span style={{ fontFamily: BRAND.font, fontWeight: 700, letterSpacing: '0.03em', color: INK }}>{BRAND.name}</span>
              {kicker ? <span style={{ color: L.ink3 }}>·</span> : null}
            </>
          ) : null}
          <span>{kicker}</span>
        </div>
        {titleLines.map((l, i) => (
          <Rise key={i} text={l} start={2 + i * 4} g={titleStep} style={{ position: 'absolute', left: M - 6, top: titleTop + i * titleSize * 1.12, ...type(titleSize, 850), lineHeight: 1.12, color: INK }} />
        ))}

        {/* KPI：爆表段会冲进这里 */}
        <div style={{ position: 'absolute', right: 1920 - 1824, top: kpiTop, textAlign: 'right', whiteSpace: 'nowrap', opacity: ramp(frame, 6, 14, EASE.out) }}>
          <div style={{ ...type(kpiLabelSize, 650), lineHeight: 1.3, color: totalP > 0.5 ? ACC : L.ink2 }}>{kpiLabel}</div>
        </div>
        <div style={{
          position: 'absolute', right: 1920 - 1824, top: kpiTop + 48 * K, ...type(kpiSize, 850), lineHeight: 1.05, textAlign: 'right', whiteSpace: 'nowrap',
          color: totalP > 0.5 ? ACC : INK, transform: `translateY(${kpiKick.toFixed(2)}px)`, opacity: ramp(frame, 8, 14, EASE.out),
        }}>
          {kpiNow}
        </div>

        {/* 图表组（震动只作用在这里） */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${kick.toFixed(2)}px)` }}>
          {/* 刻度 */}
          <div style={{ position: 'absolute', left: M, top: BASE - 48 * K, width: tickW, ...type(tickSize, 500), color: L.ink2, opacity: rule(4) }}>0</div>
          {OLD.map((v, i) => {
            const sw = ramp(frame, BEAT + (3 - i) * 2, 12, EASE.snappy);
            const top = i === 3;
            return (
              <div key={i} style={{ position: 'absolute', left: M, top: tickY(i) - 48 * K, width: tickW, height: 40 * K, opacity: rule(4 + i * 2), whiteSpace: 'nowrap' }}>
                <div style={{
                  position: 'absolute', inset: 0, ...type(tickSize, top ? mix(500, 750, warn) : 500),
                  color: top && warn > 0.02 ? ACC : L.ink2, opacity: 1 - sw, transform: `translateY(${(sw * 46 * K).toFixed(2)}px)`,
                  filter: sw > 0.02 && sw < 0.98 ? `blur(${(Math.sin(Math.PI * sw) * 3).toFixed(2)}px)` : undefined,
                }}>{v}</div>
                <div style={{
                  position: 'absolute', inset: 0, ...type(tickSize, 500), color: L.ink2,
                  opacity: sw, transform: `translateY(${((sw - 1) * 46 * K).toFixed(2)}px)`,
                  filter: sw > 0.02 && sw < 0.98 ? `blur(${(Math.sin(Math.PI * sw) * 3).toFixed(2)}px)` : undefined,
                }}>{NEW[i]}</div>
              </div>
            );
          })}

          {/* 期间（x 轴） */}
          {periods.map((m, i) => (
            <div key={i} style={{
              position: 'absolute', left: xOf(i) - monthStep / 2, top: BASE + 22 * K, width: monthStep, textAlign: 'center', whiteSpace: 'nowrap',
              ...type(monthSize, i === N - 1 && shockOn ? 750 : 500), color: i === N - 1 && shockOn ? ACC : L.ink2,
              opacity: ramp(frame, 6 + i, 12, EASE.out),
            }}>{m}</div>
          ))}

          <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <defs>
              <pattern id="arsHatch" width={12 * K} height={12 * K} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={12 * K} stroke={INK} strokeOpacity={0.16} strokeWidth={2 * K} />
              </pattern>
              <filter id="arsGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            {/* 网格：基础 3 根 + 重标加密 4 根 */}
            {[0, 1, 2].map((i) => (
              <line key={`g${i}`} x1={M} x2={mix(M, 1824, rule(2 + i * 2))} y1={tickY(i)} y2={tickY(i)} stroke={INK} strokeOpacity={0.14} strokeWidth={1.5 * K} />
            ))}
            {[0, 1, 2, 3].map((k) => {
              const d = ramp(frame, BEAT + 1 + k * 2, 12, EASE.snappy);
              const y = BASE - ((2 * k + 1) / 8) * PH;
              return d > 0 ? <line key={`d${k}`} x1={M} x2={mix(M, 1824, d)} y1={y} y2={y} stroke={INK} strokeOpacity={0.08} strokeWidth={1.5 * K} strokeDasharray="2 8" /> : null;
            })}

            {/* 面积：45° 排线 */}
            {areaD && <path d={areaD} fill="url(#arsHatch)" />}

            {/* 基线 */}
            <line x1={M} x2={mix(M, 1824, rule(0))} y1={BASE} y2={BASE} stroke={INK} strokeWidth={3 * K} />

            {/* 天花板规线：预警转赤陶，被穿透处裂开 */}
            {(() => {
              const c = warn > 0.02 ? ACC : INK;
              const xr = mix(M, 1824, rule(2));
              const gap = 26 * K * crack;
              const op = 0.85 + 0.15 * warn;
              if (crack <= 0.001) return <line x1={M} x2={xr} y1={CEIL} y2={CEIL} stroke={c} strokeOpacity={op} strokeWidth={3 * K} />;
              return (
                <>
                  <line x1={M} x2={crossX - gap} y1={CEIL} y2={CEIL} stroke={c} strokeOpacity={op} strokeWidth={3 * K} />
                  <line x1={crossX + gap} x2={xr} y1={CEIL} y2={CEIL} stroke={c} strokeOpacity={op} strokeWidth={3 * K} />
                </>
              );
            })()}
            {shard(0)}
            {shard(1)}
            {shard(2)}

            {/* 历史折线 */}
            {lineD && <path d={lineD} fill="none" stroke={INK} strokeWidth={6 * K} strokeLinejoin="round" strokeLinecap="round" />}
            {/* 历史段数据点 */}
            {pts.map(([x, y], i) => (i < pts.length - (drawT < N - 2 ? 1 : 0) ? <circle key={i} cx={x} cy={y} r={6 * K} fill={L.bg[0]} stroke={INK} strokeWidth={3.5 * K} /> : null))}
            {/* 写入笔尖 */}
            {frame >= DRAW0 && frame < DRAW1 + 1 && pts.length > 0 && (
              <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={9 * K} fill={INK} />
            )}
            {/* 预警脉冲：末前点 */}
            {frame >= WARN && frame < SHOCK0 + 6 && (() => {
              const t = ramp(frame, WARN, 16, EASE.out);
              return <circle cx={nx} cy={ny} r={mix(10, 46, t) * K} fill="none" stroke={ACC} strokeWidth={3 * K} opacity={0.7 * (1 - t)} />;
            })()}

            {/* 爆表段 */}
            {shockOn && (
              <>
                {hang > 0.01 && <line x1={nx} y1={ny} x2={hx} y2={hy} stroke={ACC} strokeWidth={shockW + 16 * K} strokeLinecap="round" opacity={0.35 * hang} filter="url(#arsGlow)" />}
                <line x1={nx} y1={ny} x2={hx} y2={hy} stroke={ACC} strokeWidth={shockW} strokeLinecap="round" />
                {markS <= 0 && <circle cx={hx} cy={hy} r={12 * K} fill={L.bg[0]} stroke={ACC} strokeWidth={5 * K} />}
              </>
            )}
            {pierced && sinceP < 10 && (
              <circle cx={crossX} cy={CEIL} r={mix(8, 70, ramp(frame, PIERCE, 10, EASE.out)) * K} fill="none" stroke={ACC} strokeWidth={2.5 * K}
                opacity={0.8 * (1 - ramp(frame, PIERCE, 10, EASE.out))} />
            )}

            {/* 端点标记 */}
            {markS > 0 && (
              <>
                {ripple < 1 && <circle cx={hx} cy={hy} r={mix(16, 64, ripple) * K} fill="none" stroke={ACC} strokeWidth={3 * K} opacity={0.6 * (1 - ripple)} />}
                <circle cx={hx} cy={hy} r={15 * markS * K} fill={ACC} stroke={L.bg[0]} strokeWidth={5 * markS * K} />
              </>
            )}
          </svg>

          {/* 真值标签 */}
          {valS > 0 && (
            <div style={{
              position: 'absolute', left: hx - 40 * K - tagW, top: hy - tagH / 2, width: tagW, height: tagH,
              transform: `scale(${valS.toFixed(4)})`, transformOrigin: '100% 50%', opacity: Math.min(1, valS * 1.6),
            }}>
              <div style={{
                position: 'absolute', inset: 0, background: ACC, borderRadius: 6 * K, color: L.onAccent, whiteSpace: 'nowrap',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 30 * K,
                boxShadow: `0 18px 40px -12px ${alpha(L.shadow, 0.45)}`,
              }}>
                <div style={{ ...type(tagNum, 850), lineHeight: 1.1 }}>{valueLabel}</div>
                {badge ? <div style={{ ...type(tagSub, 600), lineHeight: 1.3, opacity: 0.9 * ramp(frame, MARK + 10, 10, EASE.out), marginTop: 4 }}>▲ {badge}</div> : null}
              </div>
              <div style={{ position: 'absolute', right: -10 * K, top: tagH / 2 - 10 * K, width: 20 * K, height: 20 * K, background: ACC, transform: 'rotate(45deg)' }} />
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
