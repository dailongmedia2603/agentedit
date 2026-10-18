// tilt-reveal｜俯仰揭示（第二轮重设计）
// 手法不变：整页 rotateX 平躺、开场只见上缘一条透视窄带，机位"抬头"回正，内容一排排涌入视野。
//
// 设计决定
// - look：midnight（深蓝夜 · 电光蓝）。开场是黑夜里的一道"地平线"——平躺页面的远端上缘只剩一条
//   发光的窄带（远端上沿一道白蓝亮线 + 宽幅蓝色泛光），像天际线上的第一道光。
// - 主体：为镜头设计的 video-shotcraft 暗场渲染看板——顶栏（品牌标志 + 字标）、120px 大标题「Renders are up 38%」、
//   一张横贯全宽的发光面积图、三块 76px 大数字 KPI。元素少、字大、对比强，落定就是一张海报。
//   页面落定在画面里留边（0.84 倍），四周能看到舞台光，脚下有一片蓝色光晕"地面反光"。
// - 运镜：页面绕下沿铰链、正面朝上平躺（视点在页面上方，窄带里的字是正的），rotateX 86°→−2.2° 过冲→0° 抬正，
//   同一条进度 p 驱动缩放 2.5→0.84、铰链位置、视点高度、透视距离；背景光池与浮尘按俯仰反向视差下移——读作"相机抬头"，而不是页面在转。
// - 光：抬升过程中一道镜面反光带从页面上沿扫到下沿（掠射角变化的物理反光，Q4：主角一次、
//   裁进圆角）；面积图的发光折线在抬升后半程描出，落定时终点亮起一颗光点。
// - Q2：放大不走 transform scale，按目标倍率布局 + CSS zoom 栅格化，再用等效 rotateX'·scaleY 还原透视；
//   平躺时按纵向压缩比做只竖向的抗锯齿预模糊，读得清之前自动关掉。
//
// 时间表（30fps，共 120f）
//   0–20   预备：窄带已在画面（第 1 帧就有那道光），极缓 creep 86°→83°，背光由暗到亮
//   20–60  抬头 40f：不对称 in-out（起步柔、中段快、末端零速），冲到 −2.2° 过冲顶点；
//          最快的几帧给竖向运动模糊；32–62 镜面反光带扫过页面
//   60–70  软回 0°（smooth）——机位落定
//   38–82  面积图折线描出（out，带一颗发光笔头），80f 终点光点亮起；KPI 三格错峰上浮提亮（行比底板晚一拍）
//   70–120 hold 50f：极缓推近 1→1.018、背光呼吸，尾帧是完整海报
//
// [Agent Edit] o chu: kicker (nhan nho tren tieu de) / title (tieu de) / number (con so nhan mau cuoi tieu de) /
// stat_values + stat_labels (+ stat_deltas tuy chon): 1-3 o so lieu. Menu / truc thang = chu giao dien trung tinh.
// Khung doc (native): trang dashboard cao theo khung (PH ~ 0.95 chieu cao), tieu de to xuong dong, bieu do cao hon,
// o so lieu xep doc; phep chieu 3D (ban le canh duoi, 86° -> -2.2° -> 0°, phoi canh / diem nhin / ti le cung mot tien do)
// giu nguyen, chi thay 1080 bang chieu cao trang / khung that.
import { useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, useShot } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Dust, LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { EASE, FONT, SpeedBlur, mix, ramp } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import type { ShotFonts } from '../../../runtime';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};
const useOptList = (id: string, samples: string[]): string[] => {
  const d = useShot();
  const v = useList(id, samples);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (Array.isArray(t) ? !t.length : !String(t).trim())) ? [] : v;
};


export const TILT_REVEAL_DURATION = 120;

const L = LOOKS.midnight;

const HOLD = 20; // 预备 creep 结束
const MOVE = 40; // 主抬升 20→60
const SETTLE = 10; // 过冲回落 60→70
const FROM = 86; // 平躺俯角（页面绕下沿铰链向远处躺倒，正面朝上）
const CREEP = 3 / 86; // 预备段先抬 3°
const OVER = 1 + 2.2 / 86; // 主抬升冲过 0° 到 +2.2°
const S0 = 2.5; // 平躺时的放大倍率（窄带够宽、够近）
const S1 = 0.84; // 落定倍率：页面四周留出舞台
const PAGE_R = 26; // 页面圆角（1x 页面 px）
// [Agent Edit] 几何随画面高度 SH / 页面高度 PH：横版 = 原值（BOT0 600、落定下沿 540 + 1080·S1/2 − 18、视点 520）
type Geo = { BOT0: number; BOT1: number; EYE1: number };
const geoOf = (SH: number, PH: number): Geo => ({
  BOT0: SH / 2 + 60,
  BOT1: SH / 2 + (PH * S1) / 2 - 18,
  EYE1: SH / 2 - 20,
});

// 时间 → 姿态（纯函数；速度用中心差分求）。角度走带过冲的 q，缩放/位移/透视走不过冲的 p
const poseAt = (f: number, { BOT0, BOT1, EYE1 }: Geo) => {
  const creep = ramp(f, 0, HOLD, EASE.smooth) * CREEP;
  const lift = ramp(f, HOLD, MOVE, EASE.swift);
  const q = mix(creep, OVER, lift) - (OVER - 1) * ramp(f, HOLD + MOVE, SETTLE, EASE.smooth);
  const p = mix(creep, 1, lift);
  return {
    p,
    rotX: FROM * (1 - q),
    scale: mix(S0, S1, p),
    bot: mix(BOT0, BOT1, p),
    eye: mix(BOT0 - 300, EYE1, p), // 视点高度：平躺时在页面上方（俯视看到正面），落定时回到画面中心
    persp: mix(700, 1500, p),
  };
};

// ───────────── 页面：video-shotcraft 暗场渲染看板（1920×1080 设计坐标） ─────────────

// 面积图数据（确定性）：缓升 + 两次回落 + 末段冲高
const SERIES = [22, 26, 24, 31, 35, 33, 38, 44, 41, 47, 52, 49, 55, 61, 58, 66, 71, 69, 78, 86];
const chartPaths = (w: number, h: number) => {
  const pt = (i: number) => [(i / (SERIES.length - 1)) * w, h - (SERIES[i] / 100) * h] as const;
  // Catmull-Rom → 三次贝塞尔，平滑折线
  let d = '';
  for (let i = 0; i < SERIES.length; i++) {
    const [x, y] = pt(i);
    if (i === 0) { d += `M${x},${y}`; continue; }
    const [x0, y0] = pt(Math.max(0, i - 2));
    const [x1, y1] = pt(i - 1);
    const [x3, y3] = pt(Math.min(SERIES.length - 1, i + 1));
    d += ` C${x1 + (x - x0) / 6},${y1 + (y - y0) / 6} ${x - (x3 - x1) / 6},${y - (y3 - y1) / 6} ${x},${y}`;
  }
  return { pt, linePath: d, areaPath: `${d} L${w},${h} L0,${h} Z` };
};

type Kpi = { k: string; v: string; d: string };
type PageText = { kicker: string; title: string; number: string; kpis: Kpi[]; brand: string };

const DashboardPage: React.FC<{ draw: number; dot: number; rows: number[]; PH: number; portrait: boolean; tx: PageText; fonts: ShotFonts }> = ({ draw, dot, rows, PH, portrait: P, tx, fonts }) => {
  // ── 排版（页面 px，宽 1920，高 PH）──
  const pad = P ? 130 : 120;
  const barH = P ? 150 : 104;
  const iw = 1920 - pad * 2;
  const kickS = P ? 46 : 26;
  const h1Base = P ? 210 : TYPE_H1;
  const head = `${tx.title}${tx.number ? ' ' + tx.number : ''}`.trim();
  const hLines = P ? wrapLines(head, fonts.sans, h1Base, iw, 760, 3) : [head];
  const h1 = Math.min(...hLines.map((l) => fitSize(l, { family: fonts.sans, size: h1Base, maxWidth: iw, weight: 760, minSize: h1Base * 0.45, letterSpacingEm: -0.04 })));
  const hLH = h1 * 1.14;
  const titleTop = P ? barH + 150 : 168;
  const titleBottom = titleTop + kickS * 1.3 + (P ? 36 : 26) + hLines.length * hLH;
  const n = tx.kpis.length;
  const kpiH = P ? 300 : 190;
  const kpiGap = P ? 36 : 40;
  const kpiBlock = P ? n * kpiH + (n - 1) * kpiGap : kpiH;
  const kpiTop = PH - (P ? 150 : 60) - kpiBlock;
  const chartTop = P ? titleBottom + 130 : 420;
  const chartW = P ? iw : 1600;
  const axisH = P ? 90 : 60;
  const chartH = P ? Math.max(500, kpiTop - 110 - axisH - chartTop) : 300;
  const { pt, linePath, areaPath } = chartPaths(chartW, chartH);
  const [lx, ly] = pt(SERIES.length - 1);
  const axisS = P ? 38 : 24;
  const kLabelS = P ? 46 : 26;
  const kValS0 = P ? 150 : 76;
  const cardW = P ? iw : (1920 - 240 - (n - 1) * 40) / n;
  const valMax = P ? cardW * 0.62 : cardW - 76 - 130;
  const kValS = Math.min(...tx.kpis.map((k) => fitSize(k.v, { family: fonts.sans, size: kValS0, maxWidth: valMax, weight: 720, minSize: kValS0 * 0.45 })));
  const kLabS = Math.min(...tx.kpis.map((k) => fitSize(k.k, { family: fonts.sans, size: kLabelS, maxWidth: P ? cardW * 0.42 : cardW - 76, weight: 550, minSize: kLabelS * 0.6 })));
  const brandS = P ? 54 : 36;
  const brandSize = tx.brand ? fitSize(tx.brand, { family: fonts.sans, size: brandS, maxWidth: P ? 700 : 520, weight: 700, letterSpacingEm: 0.03 }) : 0;
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: PAGE_R, overflow: 'hidden', fontFamily: FONT.sans,
      background: `linear-gradient(180deg, #121a2e 0%, ${L.surface} 46%, #0c1222 100%)`,
      boxShadow: `inset 0 0 0 1.5px ${L.line}, inset 0 1.5px 0 rgba(200,215,255,0.16)`,
    }}>
      {/* 顶栏：下沿一条电光蓝发丝线——平躺时它就是开场那道"地平线" */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: barH, display: 'flex', alignItems: 'center',
        padding: `0 ${P ? 90 : 64}px`, gap: P ? 30 : 22, background: 'rgba(160,190,255,0.035)',
      }}>
        <ShotcraftMark size={P ? 72 : 48} tone="dark" style={{ flex: 'none' }} />
        {tx.brand ? <div style={{ ...type(brandSize, 700), fontFamily: BRAND.font, letterSpacing: '0.03em', color: L.ink, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{tx.brand}</div> : null}
        {!P && (
          <div style={{ display: 'flex', gap: 44, marginLeft: 72, ...type(28, 550), lineHeight: 1.3, color: L.ink3, whiteSpace: 'nowrap' }}>
            <span style={{ color: L.ink }}>Tổng quan</span><span>Báo cáo</span><span>Khách hàng</span><span>Cài đặt</span>
          </div>
        )}
        <div style={{
          marginLeft: 'auto', padding: P ? '16px 34px' : '12px 26px', borderRadius: 999, border: `1.5px solid ${L.line}`,
          ...type(P ? 38 : 26, 550), lineHeight: 1.3, color: L.ink2, background: 'rgba(160,190,255,0.05)', whiteSpace: 'nowrap',
        }}>12 tháng qua</div>
        <div style={{ width: P ? 76 : 52, height: P ? 76 : 52, flex: 'none', borderRadius: 40, background: `linear-gradient(135deg,${L.accent},${L.accent2})`, boxShadow: `0 0 0 3px ${L.surface}` }} />
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: barH - 1, height: 2,
        background: `linear-gradient(90deg, ${alpha(L.accent, 0)} 0%, ${L.accent} 22%, #b9cdff 50%, ${L.accent} 78%, ${alpha(L.accent, 0)} 100%)`,
        boxShadow: `0 0 18px ${alpha(L.accent, 0.8)}`,
      }} />

      {/* 标题区（最后一个词 = 数字 → 强调色） */}
      <div style={{ position: 'absolute', left: pad, top: titleTop, opacity: rows[0], transform: `translateY(${(1 - rows[0]) * 18}px)` }}>
        {tx.kicker ? <div style={{ ...type(kickS, 650), lineHeight: 1.3, color: L.accent, letterSpacing: '0.2em', whiteSpace: 'nowrap' }}>{tx.kicker.toUpperCase()}</div> : null}
        <div style={{ ...type(h1, 760), lineHeight: `${hLH}px`, color: L.ink, marginTop: P ? 36 : 26 }}>
          {hLines.map((l, i) => {
            const last = i === hLines.length - 1 && tx.number && l.endsWith(tx.number);
            const body = last ? l.slice(0, l.length - tx.number.length) : l;
            return (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>
                {body}
                {last ? <span style={{ color: L.accent, textShadow: `0 0 40px ${alpha(L.accent, 0.45)}` }}>{tx.number}</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* 面积图：横贯全宽 */}
      <div style={{ position: 'absolute', left: P ? pad : 160, top: chartTop, width: chartW, height: chartH + axisH, opacity: rows[1] }}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <div key={g} style={{ position: 'absolute', left: 0, right: 0, top: chartH * (1 - g), height: 1.5, background: L.line }} />
        ))}
        <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <linearGradient id="mer-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={L.accent} stopOpacity={0.38} />
              <stop offset="1" stopColor={L.accent} stopOpacity={0} />
            </linearGradient>
            <clipPath id="mer-clip"><rect x={-10} y={-40} width={(chartW + 20) * draw} height={chartH + 80} /></clipPath>
          </defs>
          <g clipPath="url(#mer-clip)">
            <path d={areaPath} fill="url(#mer-area)" />
            <path d={linePath} fill="none" stroke={alpha(L.accent, 0.35)} strokeWidth={P ? 20 : 14} strokeLinecap="round" style={{ filter: 'blur(8px)' }} />
            <path d={linePath} fill="none" stroke="#a9c1ff" strokeWidth={P ? 8 : 5} strokeLinecap="round" />
          </g>
          {draw > 0.02 && draw < 0.995 && (() => {
            const i = Math.min(SERIES.length - 1, draw * (SERIES.length - 1));
            const i0 = Math.floor(i), i1 = Math.min(SERIES.length - 1, i0 + 1);
            const [ax, ay] = pt(i0), [bx, by] = pt(i1);
            const hx = ax + (bx - ax) * (i - i0), hy = ay + (by - ay) * (i - i0);
            return <circle cx={hx} cy={hy} r={P ? 13 : 9} fill="#e6edff" style={{ filter: `drop-shadow(0 0 10px ${L.accent})` }} />;
          })()}
          {dot > 0 && (
            <g opacity={dot}>
              <circle cx={lx} cy={ly} r={(P ? 50 : 34) * dot} fill={alpha(L.accent, 0.18)} />
              <circle cx={lx} cy={ly} r={P ? 16 : 11} fill="#e6edff" stroke={L.accent} strokeWidth={P ? 7 : 5} />
            </g>
          )}
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: chartH + (P ? 32 : 22), display: 'flex', justifyContent: 'space-between', ...type(axisS, 550), lineHeight: 1.3, color: L.ink3, letterSpacing: '0.1em' }}>
          {['T10', 'T12', 'T2', 'T4', 'T6', 'T9'].map((m) => <span key={m}>{m}</span>)}
        </div>
      </div>

      {/* KPI：横版三格并排，竖版逐行 —— 大数字 + 涨幅 */}
      <div style={{ position: 'absolute', left: pad, right: pad, top: kpiTop, display: 'flex', flexDirection: P ? 'column' : 'row', gap: kpiGap }}>
        {tx.kpis.map((k, i) => (
          <div key={i} style={{
            flex: P ? 'none' : 1, height: kpiH, borderRadius: P ? 30 : 22, padding: P ? '0 56px' : '30px 38px', boxSizing: 'border-box',
            display: P ? 'flex' : 'block', alignItems: 'center', justifyContent: 'space-between',
            background: `linear-gradient(180deg, ${L.surface2} 0%, rgba(23,32,54,0.6) 100%)`,
            boxShadow: `inset 0 0 0 1.5px ${L.line}, inset 0 1.5px 0 rgba(200,215,255,0.1)`,
            opacity: 0.55 + 0.45 * rows[2 + i], transform: `translateY(${(1 - rows[2 + i]) * 26}px)`,
          }}>
            <div style={{ ...type(kLabS, 550), lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap' }}>{k.k}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: P ? 28 : 20, marginTop: P ? 0 : 14 }}>
              <div style={{ ...type(kValS, 720), lineHeight: 1.15, color: L.ink, whiteSpace: 'nowrap' }}>{k.v}</div>
              {k.d ? <div style={{ ...type(P ? 46 : 28, 650), lineHeight: 1.3, color: L.accent2, whiteSpace: 'nowrap' }}>{k.d}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
const TYPE_H1 = 120;

export const TiltReveal: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const PH = portrait ? Math.round((SH * 0.86) / S1) : 1080; // 页面高（竖版：落定占画面 ~86%）
  const G = geoOf(SH, PH);
  const kicker = useOptText('kicker', 'Báo cáo kinh doanh · Quý 3');
  const title = useText('title', 'Doanh thu tăng');
  const number = useOptText('number', '38%');
  const vals = useList('stat_values', ['4,8 tỷ', '12.480', '99,1%']);
  const labs = useList('stat_labels', ['Doanh thu', 'Đơn hàng', 'Khách hài lòng']);
  const dels = useOptList('stat_deltas', ['+38%', '+2.100', '+1,4 điểm']);
  const kpis: Kpi[] = vals.slice(0, 3).map((v, i) => ({ v, k: labs[i] || '', d: dels[i] || '' }));
  const tx: PageText = { kicker, title, number, kpis, brand: BRAND.name };
  const { p, rotX, scale: s0, bot, eye, persp } = poseAt(f, G);
  // 落定后极缓推近（hold 段机位活着）
  const push = mix(1, 1.018, ramp(f, 70, 50, EASE.smooth));
  const scale = s0 * push;
  const CY = SH / 2;
  const botY = CY + (bot - CY) * push;
  const topY = botY - PH * scale; // 布局框上缘（3D 变换前）

  // 抬头角速度（°/帧）→ 画面竖向位移近似，只在快段生效
  const vRot = poseAt(f + 0.5, G).rotX - poseAt(f - 0.5, G).rotX;
  const vy = -vRot * 7;

  // Q2：等效 rotateX'·scaleY（在 s 倍布局的平面上），投影与 scale(s)·rotateX(r) 一致
  const rad = (rotX * Math.PI) / 180;
  const rEq = (Math.atan2(Math.sin(rad), scale * Math.cos(rad)) * 180) / Math.PI;
  const kEq = Math.sqrt(scale * scale * Math.cos(rad) ** 2 + Math.sin(rad) ** 2) / scale;
  const vScale = kEq * Math.abs(Math.cos((rEq * Math.PI) / 180));
  const sigma = vScale > 0.6 ? 0 : (0.55 / Math.max(0.05, vScale)) * 1.6 - 1.2;

  const flat = Math.min(1, Math.abs(rotX) / 86); // 1 = 平躺
  // 远端（页面上沿）在屏幕上的投影 y：开场那道"地平线"就挂在这里
  const Hs = PH * scale * kEq;
  const zFar = -Hs * Math.sin((rEq * Math.PI) / 180);
  const farY = eye + (botY - Hs * Math.cos((rEq * Math.PI) / 180) - eye) * (persp / (persp - zFar));
  const glowUp = ramp(f, 0, 26, EASE.out); // 开场背光由暗到亮
  // 背景视差：相机抬头 → 舞台光池 / 浮尘相对下移
  const bgShift = mix(-150, 0, p);
  // 镜面反光带：随俯角从上沿扫到下沿（裁进页面圆角）
  const sheen = ramp(f, 32, 30, EASE.swift);
  // 内容：折线描出、终点光点、行错峰
  const draw = ramp(f, 38, 44, EASE.out);
  const dot = ramp(f, 80, 14, EASE.overshoot);
  const rows = [0, 1, 2, 3, 4].map((i) => ramp(f, 34 + i * 4, 22, EASE.out));
  // 开场"地平线"：页面上缘的电光蓝缘光，平躺时最亮，抬起后收成页面上沿的一道高光
  const rim = glowUp * Math.pow(flat, 3);
  rows[0] = Math.max(rows[0], 0.85 + 0.15 * ramp(f, 30, 20, EASE.out)); // 标题平躺时就在（窄带里能看见）
  rows[1] = 1;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: L.bg[2] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.0 }} fill={{ x: 0.82, y: 0.95 }} intensity={0.75 + 0.25 * glowUp} breathe={0.6}
        style={{ transform: `translateY(${bgShift}px)`, inset: '-160px 0 -160px 0' }}>
        <Dust look={L} count={34} seed={7} drift={0.18} opacity={0.5} />
      </Stage>
      {/* 竖版：Stage 的子层只铺上方 1080，下方补几层浮尘（同样随相机视差） */}
      {portrait && Array.from({ length: Math.ceil(SH / 1080) - 1 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 1080 * (i + 1) + bgShift, height: 1080, pointerEvents: 'none' }}>
          <Dust look={L} count={30} seed={11 + i * 5} drift={0.18} opacity={0.45} />
        </div>
      ))}

      {/* 页面背后的背光：平躺时是一条贴着窄带的蓝色辉光，抬起后成为页面四周的轮廓光 */}
      <div style={{
        position: 'absolute', left: 960 - 900, width: 1800, top: mix(farY - 90, farY - 40, p), height: mix(180, 1000, p),
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.light, 0.55 * glowUp)} 0%, ${alpha(L.light, 0)} 70%)`,
        filter: 'blur(30px)', opacity: 0.9,
      }} />
      {/* 地面反光：页面脚下一片蓝色光晕 */}
      <div style={{
        position: 'absolute', left: 160, right: 160, top: SH - 150, height: 260, opacity: p,
        background: `radial-gradient(ellipse 50% 40% at 50% 30%, ${alpha(L.accent, 0.4)} 0%, ${alpha(L.accent, 0.08)} 55%, ${alpha(L.accent, 0)} 75%)`,
      }} />

      <SpeedBlur vx={0} vy={vy} amount={0.2} max={9}>
        <div style={{ position: 'absolute', inset: 0, perspective: persp, perspectiveOrigin: `50% ${(eye / SH) * 100}%` }}>
          <div style={{
            position: 'absolute', left: 960 - 960 * scale, top: topY, width: 1920 * scale, height: PH * scale,
            transformOrigin: '50% 100%', transform: `rotateX(${rEq}deg) scaleY(${kEq})`,
            borderRadius: PAGE_R * scale, overflow: 'hidden',
            boxShadow: `0 ${40 * scale}px ${120 * scale}px ${alpha(L.shadow, 0.7)}, 0 0 ${60 * scale}px ${alpha(L.light, 0.18 * (1 - flat))}`,
          }}>
            {sigma > 0.5 && (
              <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                <filter id="tilt-aa" x="0" y="-5%" width="100%" height="110%" colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation={`0 ${sigma.toFixed(2)}`} />
                </filter>
              </svg>
            )}
            <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: PH, zoom: scale, filter: sigma > 0.5 ? 'url(#tilt-aa)' : undefined }}>
              <DashboardPage draw={draw} dot={dot} rows={rows} PH={PH} portrait={portrait} tx={tx} fonts={fonts} />
            </div>
            {/* 掠射受光：平躺时远端（页面下部，远离铰链）沉入夜色 */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `linear-gradient(0deg, ${alpha(L.bg[2], 0.1 * flat)} 0%, ${alpha(L.bg[2], 0.5 * flat)} 45%, ${alpha(L.bg[2], 0.9 * flat ** 1.5)} 100%)`,
            }} />
            {/* 镜面反光带：一次，从上沿扫到下沿 */}
            {sheen > 0 && sheen < 1 && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen',
                background: `linear-gradient(180deg, transparent ${(sheen * 130 - 30).toFixed(1)}%, ${alpha('#9fb6ff', 0.16 * Math.sin(sheen * Math.PI))} ${(sheen * 130 - 12).toFixed(1)}%, transparent ${(sheen * 130 + 6).toFixed(1)}%)`,
              }} />
            )}
          </div>
        </div>
      </SpeedBlur>

      {/* 地平线缘光：一条贴着窄带上沿的亮线 + 宽幅泛光（屏幕空间，随铰链走） */}
      {rim > 0.01 && (
        <>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: farY - 60, height: 120, opacity: rim, pointerEvents: 'none',
            background: `radial-gradient(ellipse 46% 50% at 50% 50%, ${alpha(L.accent, 0.5)} 0%, ${alpha(L.accent, 0)} 70%)`,
            mixBlendMode: 'screen',
          }} />
          <div style={{
            position: 'absolute', left: 0, right: 0, top: farY - 1.5, height: 3, opacity: rim, pointerEvents: 'none',
            background: `linear-gradient(90deg, ${alpha('#cfdcff', 0)} 4%, #cfdcff 32%, #ffffff 50%, #cfdcff 68%, ${alpha('#cfdcff', 0)} 96%)`,
            boxShadow: `0 0 14px ${alpha(L.accent, 0.9)}, 0 0 40px ${alpha(L.accent, 0.6)}`,
          }} />
        </>
      )}
    </AbsoluteFill>
  );
};
