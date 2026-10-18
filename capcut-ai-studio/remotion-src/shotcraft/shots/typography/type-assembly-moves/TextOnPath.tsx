// 文字沿曲线流入（text-on-path）——字符沿一条上升曲线（图表增长线）鱼贯流入，行进中按切线角旋转；
// 到达后逐字从"贴线姿态"抬升摆正成水平标题。曲线随车头字符同步 evolve。
//
// 第二轮重设计（midnight · 暗场数据发布会）：
// - look = midnight（深蓝夜 · 电光蓝 · 青色点缀）。主角是一条占满画面的营收增长线：电光蓝 5px 圆头描边 +
//   线下纵向渐变面积 + 外发光，车头是一颗青色光点；背景是 4 条发丝网格线 + mono 刻度（纹理级）。
// - 文案 92px / 800 字重——字面意思就是这条线，字沿线走 = 字与数据同框叙事。
//   整串按真实步进沿弧长刚性推进（末字领跑、切线角旋转，行进中可读），按速度加横向拖影。
// - 摆正不再是原地 lerp：每个字沿一条"先抬起、后横移"的弧线飞到左上标题位（y 用 snappy、x 用 swift，
//   两条曲线错开 → 轨迹是弧），从左到右 1.1f 错峰，落位带 ≤一次的轻微过冲。
// - 余波：车头光点落在线顶 → 一枚数值牌「$48.6M ARR」+「▲ 312%」弹出（弹簧），眉题与副句逐词升起；
//   hold 段整画面 1.5% 极缓推近。
//
// 时间表（30fps，共 160f）：
//   0–16    网格线自左擦入、刻度淡入；舞台光（第 1 帧即有网格起始态）
//   4–64    整串沿线推进 60f（缓起、长 ease-out），曲线与车头同步生长
//   64–72   停 8f：整句挂在线上可读
//   72–110  逐字抬升摆正（18f/字，1.1f 错峰），曲线补完、面积淡满
//   92–110  副句 / 眉题升起；98 数值牌弹出（弹簧）；100 起季度标记逐个点亮
//   108–160 hold（极缓推近 1.5%）
//
// [Agent Edit] o chu: title (cau ve tang truong — chu thuong/hoa tu nhien, khong ep in hoa), kicker, subtitle, value
// (con so tren bien so) + label + delta, quarters (3 nhan moc tren duong). Be ngang tung ky tu do bang measureText (thay
// do DOM) -> buoc thuc theo font that. Khung ngang: tieu de 1 dong (co chu tu vua 1100px, khong de len bien so).
// Khung doc (native): tieu de to (<=3 dong) o phan tren, bieu do chiem nua duoi; chu chay tren duong o co nho hon
// (<=100px, tranh "can goc" o khuc cua) roi phong to dan khi bay len vi tri tieu de.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, bezier, mix, ramp, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, glow, springAt, type } from '../../../fixtures/Look';

export const TEXT_ON_PATH_DURATION = 160;

const L = LOOKS.midnight;
type Pt = { x: number; y: number };

// 增长曲线（三次贝塞尔）+ 弧长表：s(t) 采样 + 反查 t(s)
const makeCurve = (P0: Pt, P1: Pt, P2: Pt, P3: Pt) => {
  const bez = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
      y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
    };
  };
  const tangent = (t: number) => {
    const u = 1 - t;
    const dx = 3 * u * u * (P1.x - P0.x) + 6 * u * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x);
    const dy = 3 * u * u * (P1.y - P0.y) + 6 * u * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };
  const SAMPLES = 300;
  const ARC = [0];
  let prev = bez(0);
  for (let k = 1; k <= SAMPLES; k++) {
    const p = bez(k / SAMPLES);
    ARC.push(ARC[k - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const LEN = ARC[SAMPLES];
  const tAtS = (s: number) => {
    const v = Math.max(0, Math.min(LEN, s));
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ARC[mid] < v) lo = mid;
      else hi = mid;
    }
    const seg = ARC[hi] - ARC[lo] || 1;
    return (lo + (v - ARC[lo]) / seg) / SAMPLES;
  };
  return { bez, tangent, LEN, tAtS };
};

const TRACK = -0.01; // em
const T0 = 4; // 起跑
const TRAVEL = 60; // 沿线推进
const HOLD = 8; // 挂线停顿
const SETTLE = 18; // 每字摆正
const TRAVEL_EASE = bezier(0.42, 0, 0.12, 1); // 缓起、长 ease-out
const LIFT_EASE = bezier(0.3, 1.22, 0.6, 1); // 抬升：快到、过冲 ~4% 回落（抬升行程大，8% 会顶进眉题）

export const TextOnPath: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const TEXT = useText('title', 'Tăng trưởng mỗi quý');
  const kicker = useText('kicker', 'BÁO CÁO NĂM 2026');
  const subtitle = useText('subtitle', 'Quý sau luôn cao hơn quý trước.');
  const value = useText('value', '48,6 tỷ');
  const label = useText('label', 'doanh thu');
  const delta = useText('delta', '▲ 312%');
  const quarters = useList('quarters', ['Quý 2', 'Quý 3', 'Quý 4']).slice(0, 3);
  const chars = Array.from(TEXT);
  const N = chars.length;

  // ───── 几何 ─────
  const X0 = 150;
  // bien so (gia tri) — do be ngang de tieu de khung ngang khong de len
  const valFs = value ? fitSize(value, { family: fonts.sans, size: portrait ? 150 : 84, maxWidth: portrait ? 1100 : 560, weight: 760, minSize: 40 }) : 0;
  const subBadgeFs = portrait ? 52 : 32;
  const badgeW = value ? Math.max(measureText(value, fonts.sans, valFs, 760), (label ? measureText(label, fonts.sans, subBadgeFs, 500) + 18 : 0) + (delta ? measureText(delta, fonts.sans, subBadgeFs, 700) : 0)) : 0;

  // 标题：终态字号 / 换行；行进时字号（khung doc nho hon, phong to khi抬升）
  const titleW = portrait ? 1640 : Math.max(700, Math.min(1100, 1644 - badgeW - 60 - X0));
  const FS0 = portrait ? 150 : 92;
  const lines0 = portrait ? wrapLines(TEXT, fonts.sans, FS0, titleW, 800, 3) : [TEXT];
  const FS = Math.min(...lines0.map((l) => fitSize(l, { family: fonts.sans, size: FS0, maxWidth: titleW, weight: 800, letterSpacingEm: TRACK, minSize: portrait ? 80 : 54 })));
  const lines = portrait ? wrapLines(TEXT, fonts.sans, FS, titleW, 800, 3) : [TEXT];
  // 字心（相对整串左缘，终态字号）：前缀实测宽
  const ls = TRACK * FS;
  const prefixW = (k: number) => measureText(chars.slice(0, k).join(''), fonts.sans, FS, 800) + k * ls;
  const centers = chars.map((_, i) => (prefixW(i) + prefixW(i + 1) - ls) / 2);
  const lastC = centers[N - 1] ?? 0;
  // 终位：按行排（khung doc nhieu dong）
  const kickFs = portrait ? 40 : 26;
  const LH = FS * 1.18;
  const FINAL_Y0 = portrait ? Math.round(SH * 0.12) + kickFs * 2.6 + FS * 0.6 : 250; // 第一行字心 y
  const finals: Pt[] = [];
  {
    let idx = 0;
    lines.forEach((ln, li) => {
      // vi tri bat dau cua dong trong chuoi goc (bo khoang trang dau)
      while (idx < N && chars[idx] === ' ' && li > 0) {
        finals[idx] = { x: X0, y: FINAL_Y0 + li * LH };
        idx++;
      }
      const lc = Array.from(ln);
      const start = idx;
      for (let j = 0; j < lc.length && idx < N; j++, idx++) {
        finals[idx] = { x: X0 + (centers[idx] - (prefixW(start) - 0)), y: FINAL_Y0 + li * LH };
      }
      while (idx < N && chars[idx] === ' ') {
        finals[idx] = { x: X0, y: FINAL_Y0 + li * LH };
        idx++;
      }
    });
    for (let i = 0; i < N; i++) if (!finals[i]) finals[i] = { x: X0 + centers[i], y: FINAL_Y0 };
  }
  const titleBottom = FINAL_Y0 + (lines.length - 1) * LH + FS * 0.55;
  const subFs = portrait ? 60 : 40;
  const subLines = subtitle ? wrapLines(subtitle, fonts.sans, subFs, titleW, 450, 2) : [];
  const SETTLE_STAG = Math.min(1.1, 20 / Math.max(1, N));
  // khung doc: bieu do bat dau duoi phan chu (chua cho bien so ~480px), chiem ~36% chieu cao
  const subBottom = titleBottom + 40 + subLines.length * subFs * 1.3;
  const gridTop = portrait ? Math.round(Math.max(SH * 0.38, Math.min(SH * 0.52, subBottom + 480))) : 400;
  const gridBot = portrait ? Math.round(Math.min(SH - 330, gridTop + SH * 0.42)) : 930;
  const H = gridBot - gridTop;
  const P0 = { x: 150, y: gridBot };
  const P1 = { x: 860, y: gridBot - H * 0.019 };
  const P2 = { x: 1300, y: gridBot - H * 0.283 };
  const P3 = { x: 1700, y: gridTop };
  const { bez, tangent, LEN, tAtS } = makeCurve(P0, P1, P2, P3);
  const END_S = LEN * 0.94; // 车头字心最终停在弧长 94% 处
  const GRID = [0, 1, 2, 3].map((k) => Math.round(gridTop + (H * k) / 3));
  const TICKS = ['60', '40', '20', '0'];
  const MONTHS = ['TH1', 'TH3', 'TH5', 'TH7', 'TH9', 'TH11'];
  const QT = [0.42, 0.66, 0.85];
  const tickFs = portrait ? 34 : 22;
  const FT = portrait ? Math.min(FS, 100, (LEN * 0.8) / Math.max(1, (measureText(TEXT, fonts.sans, 100, 800) / 100) * 1.02)) : FS;
  const kSc = FT / FS; // 行进缩放

  // 车头沿弧长推进（行进时字距按 kSc 缩）
  const headAt = (f: number) => -24 + (END_S + 24) * ramp(f, T0, TRAVEL, TRAVEL_EASE);
  const headS = headAt(frame);
  const headV = Math.abs(velocity(headAt, frame)); // px/帧
  // 曲线 evolve：与车头同步（略领先），到达后补完余下的线
  const tail = ramp(frame, T0 + TRAVEL - 4, 30, EASE.out);
  const evolveS = Math.min(LEN, Math.max(headS + FT * 0.45, 0) * (1 - tail) + LEN * tail);
  const tip = bez(tAtS(evolveS));
  const evolveFrac = evolveS / LEN;

  const pathD = `M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`;
  const areaD = `${pathD} L ${P3.x} ${GRID[3]} L ${P0.x} ${GRID[3]} Z`;
  const areaFull = ramp(frame, 70, 34, EASE.out);

  // hold 段极缓推近（以曲线顶点附近为目标）
  const push = 1 + 0.015 * ramp(frame, 100, 60, EASE.swift);
  // 数值牌
  const badge = springAt(frame, 98, { damping: 15, stiffness: 190 });
  const badgeIn = ramp(frame, 98, 8, EASE.out);
  const pulse = ramp(frame, T0 + TRAVEL + 2, 24, EASE.out); // 光点到顶的一圈脉冲

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.78, y: 0.28 }} fill={{ x: 0.12, y: 0.95 }} breathe={0.6} />

      <AbsoluteFill style={{ transform: `scale(${push.toFixed(5)})`, transformOrigin: '70% 40%' }}>
        <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="top-area" x1="0" y1={gridTop} x2="0" y2={gridBot} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={L.accent} stopOpacity={0.34} />
              <stop offset="0.6" stopColor={L.accent} stopOpacity={0.08} />
              <stop offset="1" stopColor={L.accent} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="top-line" x1={P0.x} y1="0" x2={P3.x} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={alpha(L.accent, 0.35)} />
              <stop offset="0.55" stopColor={L.accent} />
              <stop offset="1" stopColor="#9fc0ff" />
            </linearGradient>
            <clipPath id="top-reveal"><rect x={0} y={0} width={tip.x} height={SH} /></clipPath>
            <filter id="top-glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="10" /></filter>
          </defs>
          {/* 发丝网格 + 刻度（纹理级） */}
          {GRID.map((y, k) => {
            const g = ramp(frame, k * 3, 18, EASE.out);
            return (
              <g key={k} opacity={0.4 + 0.6 * g}>
                <line x1={150} x2={150 + 1560 * g} y1={y} y2={y} stroke={k === 3 ? alpha(L.ink, 0.22) : L.line} strokeWidth={portrait ? 2.5 : 1.5} strokeDasharray={k === 3 ? undefined : '2 10'} />
                <text x={1740} y={y + tickFs * 0.36} fontFamily={fonts.mono} fontSize={tickFs} fill={L.ink3} opacity={g}>{TICKS[k]}</text>
              </g>
            );
          })}
          {MONTHS.map((m, k) => (
            <text key={m} x={150 + k * 300} y={gridBot + tickFs * 2.2} fontFamily={fonts.mono} fontSize={tickFs} letterSpacing="0.12em" fill={L.ink3} opacity={ramp(frame, 6 + k * 2, 16, EASE.out)}>{m}</text>
          ))}
          {/* 线下面积：随曲线生长揭开，到顶后加满 */}
          <path d={areaD} fill="url(#top-area)" clipPath="url(#top-reveal)" opacity={0.55 + 0.45 * areaFull} />
          {/* 外发光 + 主线 */}
          <path d={pathD} fill="none" stroke={L.accent} strokeWidth={portrait ? 22 : 14} strokeLinecap="round" opacity={0.55} filter="url(#top-glow)"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - evolveFrac} />
          <path d={pathD} fill="none" stroke="url(#top-line)" strokeWidth={portrait ? 8 : 5} strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - evolveFrac} />
          {/* 季度标记：曲线画过之后逐个点亮（纹理级标签） */}
          {quarters.map((lab, k) => {
            const tq = QT[k];
            const q = bez(tq);
            const on = ramp(frame, 100 + k * 4, 12, EASE.overshoot);
            if (evolveFrac < tq || on <= 0) return null;
            return (
              <g key={k} opacity={Math.min(1, on)}>
                <line x1={q.x} x2={q.x} y1={q.y + 14} y2={GRID[3]} stroke={alpha(L.accent, 0.25)} strokeWidth={1.5} strokeDasharray="2 6" />
                <circle cx={q.x} cy={q.y} r={(portrait ? 11 : 7) * on} fill={L.bg[1]} stroke={L.accent} strokeWidth={portrait ? 4 : 3} />
                <text x={q.x + 16} y={q.y + tickFs * 1.55} fontFamily={fonts.sans} fontWeight={500} fontSize={tickFs} fill={L.ink2}>{lab}</text>
              </g>
            );
          })}
          {/* 车头光点 + 到顶脉冲 */}
          {evolveFrac > 0.002 && (
            <g>
              {pulse > 0 && pulse < 1 && <circle cx={tip.x} cy={tip.y} r={12 + 60 * pulse} fill="none" stroke={L.accent2} strokeWidth={2} opacity={1 - pulse} />}
              <circle cx={tip.x} cy={tip.y} r={portrait ? 30 : 22} fill={L.accent2} opacity={0.18} />
              <circle cx={tip.x} cy={tip.y} r={portrait ? 13 : 9} fill={L.ink} stroke={L.accent2} strokeWidth={4} />
            </g>
          )}
        </svg>

        {/* 数值牌：钉在线顶左下方 */}
        {value ? (
          <div style={{
            position: 'absolute', left: P3.x - (portrait ? 70 : 56), top: P3.y - (portrait ? 70 : 40), transform: `translateX(-100%) translateY(-100%) translateY(${((1 - badge) * 30).toFixed(2)}px) scale(${(0.9 + 0.1 * badge).toFixed(4)})`,
            transformOrigin: '100% 100%', opacity: badgeIn, textAlign: 'right', whiteSpace: 'nowrap',
          }}>
            <div style={{ ...type(valFs, 760), fontFamily: fonts.sans, lineHeight: 1.15, color: L.ink, textShadow: glow(L.accent, 0.35) }}>{value}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 10, alignItems: 'baseline' }}>
              {label ? <span style={{ ...type(subBadgeFs, 500), fontFamily: fonts.sans, color: L.ink2 }}>{label}</span> : null}
              {delta ? <span style={{ ...type(subBadgeFs, 700), fontFamily: fonts.sans, color: L.accent2 }}>{delta}</span> : null}
            </div>
          </div>
        ) : null}

        {/* 眉题 + 副句 */}
        {kicker ? (
          <div style={{ position: 'absolute', left: X0 + 4, top: FINAL_Y0 - FS * 0.6 - kickFs * 2.4, fontFamily: fonts.sans, fontSize: kickFs, fontWeight: 700, lineHeight: 1.4, letterSpacing: '0.18em', color: L.accent, whiteSpace: 'nowrap' }}>
            <TextReveal text={kicker} start={96} by="word" variant="rise" each={14} gap={3} />
          </div>
        ) : null}
        {subLines.length ? (
          <div style={{ position: 'absolute', left: X0 + 4, top: titleBottom + (portrait ? 40 : 14), fontFamily: fonts.sans, fontSize: subFs, fontWeight: 450, lineHeight: 1.3, color: L.ink2 }}>
            {subLines.map((l, j) => (
              <div key={j} style={{ whiteSpace: 'nowrap' }}>
                <TextReveal text={l} start={92 + j * 6} by="word" variant="blur" each={16} gap={2.5} />
              </div>
            ))}
          </div>
        ) : null}

        {/* 字符：沿线推进 → 抬升摆正 */}
        {chars.map((ch, i) => {
          if (ch === ' ') return null;
          const s = headS - (lastC - centers[i]) * kSc;
          const onPath = bez(tAtS(s));
          const pre = Math.min(0, s); // 还没上线的字沿起点切线退在线外
          const ang0 = tangent(0) * (Math.PI / 180);
          const px = onPath.x + Math.cos(ang0) * pre;
          const py = onPath.y + Math.sin(ang0) * pre;
          const angOnCurve = tangent(tAtS(s));
          const st = T0 + TRAVEL + HOLD + i * SETTLE_STAG;
          const sx = ramp(frame, st, SETTLE, EASE.swift); // 横移（in-out）
          const sy = ramp(frame, st, SETTLE, LIFT_EASE); // 抬升先到（带 ~4% 轻微过冲）
          const sr = ramp(frame, st + 2, SETTLE, EASE.out); // 旋转晚 2f 收敛
          const x = mix(px, finals[i].x, sx);
          const y = mix(py, finals[i].y, sy);
          const ang = angOnCurve * (1 - sr);
          const sc = mix(kSc, 1, sx); // 行进字号 → 终态字号
          const lift = -0.4 * FS * sc * (1 - Math.min(1, sy)); // 字底贴线 → 字心
          // chua len duong (chuoi dai) -> van hien khi bay len vi tri tieu de
          const op = Math.max(ramp(s, -FT * 0.9, FT * 0.9, EASE.linear), Math.min(1, sx * 1.6));
          // 行进中按速度横向拖影（文字自身的 blur 只在快速段）
          const moving = frame < st ? Math.min(6, headV * 0.12) : 0;
          return (
            <div key={i} style={{
              position: 'absolute', left: x, top: y, opacity: op,
              transform: `translate(-50%, -50%) rotate(${ang.toFixed(3)}deg) translateY(${lift.toFixed(2)}px) scale(${sc.toFixed(4)})`,
              fontFamily: fonts.sans, fontSize: FS, fontWeight: 800, letterSpacing: `${TRACK}em`, lineHeight: 1.2, color: L.ink, whiteSpace: 'pre',
              textShadow: `${(-moving * 1.4).toFixed(1)}px 0 ${(moving * 2).toFixed(1)}px ${alpha(L.accent, 0.5)}, 0 0 24px ${alpha(L.accent, 0.25)}`,
            }}>
              {ch}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
