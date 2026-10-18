// line-carry-transition｜线条接力横移转场（Catch Me If You Can 片头式图形接力）
// 场景 A 的进度条走满 → 末端延伸成长线冲出卡缘 → 镜头跟线横移 1920px → 线在移动中直角拐弯围出
// 场景 B 的画框，框闭合、画框里的海报长出来。全程一条线、没有切。
//
// 第二轮重设计（沙色制图 · Saul Bass 平面海报）：
// - look = sand（米色纸 + 墨 + 赤陶）。线是 8px 墨色硬线、方头直角，笔头是全片唯一的赤陶色点——
//   观众的眼睛只需要追这一个点。
// - 叙事：A = 进度卡（160px 百分比随线计数，走满 = 线出发的理由）；
//   B = 线围出的 720×480 画框里长出海报（赤陶太阳 + 海军蓝山丘 + 粗黑体短句），左侧是展签式标题，
//   线的水平段在 B 里刚好成了展签下的基线。
// - 世界宽 3840（A 左半 / B 右半），一条折线 path 全程 dashoffset 生长：
//   M 336,760 → H 2880（画框左下角）→ V 280 → H 3600 → V 760 → H 2880 闭合，总长 4944。
// - 命门：横移段 drawn = 1144 + cam，线生长与镜头同速，笔头钉在画面 x≈1480 直到拐角；
//   每段交接处速度连续（进度条 ease-out 到零 → 冲出段两端零速 → 镜头 in-out 起步 → 收框 in-out）。
// - 横移时世界内容（卡、点阵、展签）按镜头速度做水平运动模糊；线与笔头在模糊层外，始终锐利。
//
// 时间表（30fps，共 190f）：
//   0–4     A 进度卡静置（第 0 帧即在画面里），空轨道
//   4–40    进度条 0→100%（36f ease-out），百分比与 MB 同步计数
//   40–46   满格停一拍：状态变「Ready to ship」，对勾弹出（弹簧）
//   46–56   冲出段：线从条尾冲出卡缘到画面 x=1480（两端零速）
//   56–112  镜头左移 1920px（56f smooth in-out），线同速延伸；~92f 线到画框左下角、开始向上拐
//   100–126 B 展签标题逐行升起（框外，可以先到）
//   112–136 收框：线走完上边、右边、底边闭合（24f in-out）；136–142 笔头消散并卸载
//   136–166 框内海报：底色铺开 → 太阳升起 → 山丘错峰 → 海报字升起
//   166–190 hold 24f
// 线下的制图刻度（1200–2760，每 120px 一格）在线经过后才出现，给横移中段一个速度参照。
//
// [Agent Edit] o chu: kicker_a / task / task_sub / status (canh A: the tien do — viec dang lam, dong phu, trang thai khi xong) /
// kicker_b / title / subtitle (canh B: nhan trien lam ben canh khung) / poster (chu to tren tranh phang, 1–3 tu).
// O anh `photo` (tuy chon): anh that hien trong khung B (cover) thay tranh phang Saul Bass; co anh thi chu poster bo.
// Khung doc (portrait.mode = 'native'): van lia ngang 1920px (cot loi), canh A phong 1.75x, canh B: nhan tren — khung 1440×860
// duoi; duong ke cung mot Y. Khung lon hon -> doan dong khung bat dau tang toc ngay khi net da re goc trong luc lia
// (truoc do net van ghim tai TIP_X), khung van khep dung khung 136.
import { useCurrentFrame, useVideoConfig, useText, useImage, useShotFonts, wrapLines, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, SpeedBlur, mix, ramp, softShadow, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, stagger } from '../../../fixtures/Look';

export const LINE_CARRY_TRANSITION_DURATION = 190;

const L = LOOKS.sand;
const PAN0 = 56, PAN1 = 112;
const camAt = (f: number) => 1920 * ramp(f, PAN0, PAN1 - PAN0, EASE.smooth);
const NAVY = L.accent2;
const CREAM = '#f7eedf';

type Geo = {
  LY: number; X0: number; BAR: number; TIP: number; FX0: number; FX1: number; FY0: number; KA: number; AX: number; AY: number;
  SEGS: Array<[number, number, number, number]>; lens: number[]; TOTAL: number; PATH: string; LEAD: number; extraFrom: number;
};
const makeGeo = (portrait: boolean, SH: number, capH: number): Geo => {
  let LY: number, KA: number, AX: number, TIP: number, FX0: number, FX1: number, FY0: number;
  if (!portrait) {
    LY = 760; KA = 1; AX = 280; TIP = 1480; FX0 = 2880; FX1 = 3600; FY0 = 280;
  } else {
    KA = 1.75;
    LY = Math.round(SH / 2 + (860 + 80 - 100 + capH) / 2);
    AX = Math.round((1920 - 760 * KA) / 2);
    TIP = 1740; FX0 = 1920 + 240; FX1 = 3840 - 240; FY0 = LY - 860;
  }
  const X0 = AX + 56 * KA; // 进度条起点（卡内左边距）
  const BAR = 648 * KA; // 进度条长度
  const AY = LY - 460 * KA; // the A: thanh tien do nam o y = 460 trong the
  const SEGS: Array<[number, number, number, number]> = [[X0, LY, FX0, LY], [FX0, LY, FX0, FY0], [FX0, FY0, FX1, FY0], [FX1, FY0, FX1, LY], [FX1, LY, FX0, LY]];
  const lens = SEGS.map(([a, b, c, d]) => Math.hypot(c - a, d - b));
  const TOTAL = lens.reduce((x, y) => x + y, 0);
  return {
    LY, X0, BAR, TIP, FX0, FX1, FY0, KA, AX, AY, SEGS, lens, TOTAL,
    PATH: `M ${X0} ${LY} H ${FX0} V ${FY0} H ${FX1} V ${LY} H ${FX0}`, LEAD: TIP - X0,
    extraFrom: portrait ? 84 : 9999,
  };
};
const drawnAt = (g: Geo, f: number) => {
  if (f < 46) return g.BAR * ramp(f, 4, 36, EASE.out);
  if (f < PAN0) return mix(g.BAR, g.LEAD, ramp(f, 46, 10, EASE.swift));
  if (g.extraFrom < 999) {
    // khung doc: sau khi net da re goc (f >= extraFrom), phan chu vi con thieu duoc bu dan bang 1 duong smooth toi khung 136
    const extra = (g.TOTAL - g.LEAD - 1920) * ramp(f, g.extraFrom, 136 - g.extraFrom, EASE.smooth);
    return Math.min(g.TOTAL, g.LEAD + camAt(f) + extra);
  }
  if (f < PAN1) return g.LEAD + camAt(f);
  return mix(g.LEAD + 1920, g.TOTAL, ramp(f, PAN1, 24, EASE.smooth));
};
const tipAt = (g: Geo, d: number): [number, number] => {
  let r = Math.max(0, Math.min(d, g.TOTAL));
  for (let i = 0; i < g.SEGS.length; i++) {
    const [a, b, c, e] = g.SEGS[i];
    if (r <= g.lens[i]) {
      const t = r / g.lens[i];
      return [a + (c - a) * t, b + (e - b) * t];
    }
    r -= g.lens[i];
  }
  return [g.FX0, g.LY];
};

// 平面海报（Saul Bass 式剪纸）：赤陶太阳 + 海军蓝山丘 + 粗黑体字；p = 各层入场进度。co anh that -> anh (cover) tu phong nhe vao
const Poster: React.FC<{ w: number; h: number; f: number; mini?: boolean; text: string; photo?: string }> = ({ w, h, f, mini, text, photo }) => {
  const fonts = useShotFonts();
  const sun = mini ? 1 : ramp(f, 140, 22, EASE.snappy);
  const hill = (i: number) => (mini ? 1 : ramp(f, 146 + stagger(i, 2, 6, EASE.out), 20, EASE.snappy));
  const txt = mini ? 1 : ramp(f, 152, 18, EASE.snappy);
  if (photo) {
    const p = mini ? 1 : ramp(f, 136, 30, EASE.out);
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: CREAM }}>
        <img src={photo} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${(1.08 - 0.08 * p).toFixed(4)})`, opacity: Math.min(1, p * 1.6) }} />
      </div>
    );
  }
  const k = w / 720;
  const words = text.split(/\s+/).filter(Boolean);
  const pLines = text ? (words.length >= 2 && words.length <= 4 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : wrapLines(text, fonts.sans, 72 * k, w * 0.62, 900, 3)) : [];
  const pSz = pLines.length ? Math.min(...pLines.map((l) => fitSize(l, { family: fonts.sans, size: 72 * k, maxWidth: w * 0.62, weight: 900, minSize: 34 * k, letterSpacingEm: -0.035 }))) : 72 * k;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: CREAM }}>
      <svg width={w} height={h} viewBox={`0 0 720 ${(480 * (h / w)) / (480 / 720)}`} preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0 }}>
        <g transform={`translate(0 ${((720 * h) / w - 480).toFixed(1)})`}>
          <circle cx={468} cy={mix(480, 226, sun)} r={142} fill={L.accent} />
          {/* 海军蓝山丘与太阳叠印（multiply = 孔版印刷的套色叠印） */}
          <path d={`M 250 480 Q 540 ${mix(620, 250, hill(0))} 830 480 Z`} fill={NAVY} style={{ mixBlendMode: 'multiply' }} />
          <path d={`M -60 480 Q 150 ${mix(600, 300, hill(1))} 420 480 Z`} fill={L.ink} />
          <rect x={0} y={420} width={720} height={60} fill={L.ink} opacity={hill(1)} />
        </g>
      </svg>
      {!mini && pLines.length ? (
        <div style={{ position: 'absolute', left: 44 * k, top: 40 * k, overflow: 'hidden', padding: '0.6em 0.1em 0.3em', margin: '-0.6em -0.1em -0.3em' }}>
          <div style={{ transform: `translateY(calc(${((1 - txt) * 110).toFixed(2)}% + ${((1 - txt) * 0.6).toFixed(3)}em))`, fontFamily: fonts.sans, fontSize: pSz, fontWeight: 900, color: L.ink, lineHeight: 1.18, letterSpacing: '-0.035em' }}>
            {pLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// 场景 A：进度卡（760×500，thanh tien do o y = 460 trong the）
const ExportCard: React.FC<{ g: Geo; pct: number; f: number; task: string; taskSub: string; status: string; poster: string; photo?: string }> = ({ g, pct, f, task, taskSub, status, poster, photo }) => {
  const fonts = useShotFonts();
  const done = pct >= 99.95;
  const check = springAt(f, 40, { damping: 14, stiffness: 220 });
  const tSz = fitSize(task, { family: fonts.sans, size: 38, maxWidth: 760 - 112 - 146, weight: 680, minSize: 24 });
  const sSz = fitSize(taskSub, { family: fonts.sans, size: 28, maxWidth: 760 - 112 - 146, weight: 500, minSize: 18 });
  const stText = done ? status : 'Đang hoàn thiện…';
  const stSz = fitSize(stText, { family: fonts.sans, size: 30, maxWidth: 600, weight: 600, minSize: 20 });
  return (
    <div style={{ position: 'absolute', left: g.AX, top: g.AY, width: 760, height: 500, transform: `scale(${g.KA})`, transformOrigin: '0 0' }}>
      <div style={{
        position: 'absolute', inset: 0, boxSizing: 'border-box', padding: '48px 56px',
        background: `linear-gradient(180deg, ${L.surface}, #f8f1e6)`, borderRadius: 28,
        boxShadow: `inset 0 1px 0 #fff, inset 0 0 0 1px ${L.line}, ${softShadow(22, { color: L.shadow, strength: 0.9 })}`,
        fontFamily: fonts.sans,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <div style={{ position: 'relative', width: 120, height: 80, borderRadius: 8, overflow: 'hidden', boxShadow: `0 0 0 1px ${L.line}`, flex: 'none' }}>
            <Poster w={120} h={80} f={f} mini text={poster} photo={photo} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: tSz, fontWeight: 680, letterSpacing: '-0.02em', lineHeight: 1.25, color: L.ink, whiteSpace: 'nowrap' }}>{task}</div>
            {taskSub ? <div style={{ fontSize: sSz, fontWeight: 500, lineHeight: 1.3, color: L.ink3, marginTop: 6, whiteSpace: 'nowrap' }}>{taskSub}</div> : null}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 56, right: 56, top: 226, display: 'flex', alignItems: 'flex-end' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: stSz, fontWeight: 600, lineHeight: 1.3, color: done ? L.accent : L.ink3, whiteSpace: 'nowrap' }}>
              {done && (
                <svg width={30} height={30} viewBox="0 0 30 30" style={{ transform: `scale(${check.toFixed(3)})`, flex: 'none' }}>
                  <circle cx={15} cy={15} r={15} fill={L.accent} />
                  <path d="M8.5 15.5 13 20l8.5-9" stroke="#fff" strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {stText}
            </div>
            <div style={{ fontSize: 170, fontWeight: 780, letterSpacing: '-0.04em', lineHeight: 1, color: L.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(pct)}<span style={{ fontSize: 60, fontWeight: 650, color: L.ink3, marginLeft: 6 }}>%</span>
            </div>
          </div>
        </div>
        {/* 进度条轨道（墨色填充即 path 本体） */}
        <div style={{ position: 'absolute', left: 56, top: 460 - 4, width: 648, height: 8, background: alpha(L.ink, 0.1) }} />
      </div>
    </div>
  );
};

// xuong dong can doi
const wrapBalanced = (text: string, family: string, size: number, maxWidth: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxWidth, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxWidth * 0.4, hi = maxWidth;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length > base.length) lo = mid; else hi = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

export const LineCarryTransition: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kickerA = useText('kicker_a', 'CHUẨN BỊ');
  const task = useText('task', 'Khóa học mới');
  const taskSub = useText('task_sub', '12 bài học · 4 giờ video');
  const status = useText('status', 'Sẵn sàng ra mắt');
  const kickerB = useText('kicker_b', 'RA MẮT');
  const title = useText('title', 'Chính thức lên sóng.');
  const sub = useText('subtitle', 'Học mọi lúc, ngay trên điện thoại');
  const poster = useText('poster', 'BẮT ĐẦU NGAY');
  const photo = useImage('photo');

  // ── nhan canh B ──
  const capW = portrait ? 1440 : 720;
  const SS = portrait ? 52 : 32;
  const sl = sub ? wrapBalanced(sub, fonts.sans, SS, capW, 500, 2) : [];
  const kSz = portrait ? 40 : 26;
  // khung ngang: nhan B phai nam trong [150, LY-50] -> thu nho tieu de toi khi vua chieu cao
  let TS = portrait ? 160 : 120;
  let tl: string[] = [];
  let tSz = TS;
  let capH = 0;
  for (let it = 0; it < 8; it++) {
    tl = wrapBalanced(title, fonts.sans, TS, capW, 820, 3);
    tSz = Math.min(...tl.map((l) => fitSize(l, { family: fonts.sans, size: TS, maxWidth: capW, weight: 820, minSize: portrait ? 72 : 48, letterSpacingEm: -0.04 })));
    capH = kSz * 1.3 + 26 + tl.length * tSz * 1.1 + (sl.length ? 30 + sl.length * SS * 1.3 : 0);
    if (portrait || capH <= 560) break;
    TS = Math.round(TS * 0.9);
  }
  const tLH = tSz * 1.1;
  const g = makeGeo(portrait, SH, capH);
  const capTop = portrait ? g.FY0 - 80 - capH : Math.max(150, Math.min(300, 710 - capH));
  const capLeft = portrait ? 1920 + 240 : 2080;

  const cam = camAt(f);
  const drawn = drawnAt(g, f);
  const vx = -velocity(camAt, f);
  const pct = Math.min(100, (Math.min(drawn, g.BAR) / g.BAR) * 100);
  const [tx, ty] = tipAt(g, drawn);
  const tipO = 1 - ramp(f, 136, 6, EASE.linear);
  const closed = f >= 136;
  const fillIn = ramp(f, 134, 10, EASE.out); // 框内底色
  const world: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: 3840, height: SH, transform: `translateX(${(-cam).toFixed(2)}px)` };
  const capIn = (k: number) => ramp(f, 100 + k * 6, 20, EASE.snappy);
  const kick: React.CSSProperties = { display: 'flex', gap: 18 * (portrait ? 1.4 : 1), alignItems: 'baseline', fontFamily: fonts.sans, fontSize: kSz, fontWeight: 700, letterSpacing: '0.24em', lineHeight: 1.3, whiteSpace: 'nowrap' };
  const K = portrait ? 1.6 : 1;

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      {/* 共享舞台（屏幕空间，像摄影棚里的固定灯） */}
      <Stage look={L} keyLight={{ x: 0.28, y: 0.02 }} fill={{ x: 0.9, y: 0.95 }} />

      {/* 世界内容：随镜头横移，快段水平模糊 */}
      <SpeedBlur vx={vx} amount={0.28} max={16}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div style={world}>
            {/* 制图点阵：给眼睛一个速度参照，上下渐隐 */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `radial-gradient(circle, ${alpha(L.ink, 0.13)} 1.7px, ${alpha(L.ink, 0)} 2.3px)`,
              backgroundSize: '60px 60px', backgroundPosition: '6px 10px',
              WebkitMaskImage: 'linear-gradient(180deg, transparent 6%, #000 28%, #000 80%, transparent 97%)',
              maskImage: 'linear-gradient(180deg, transparent 6%, #000 28%, #000 80%, transparent 97%)',
            }} />
            {/* A 眉题 */}
            <div style={{ ...kick, position: 'absolute', left: g.AX, top: g.AY - 86 * K }}>
              <span style={{ color: L.accent }}>01</span><span style={{ color: L.ink2 }}>{kickerA}</span>
            </div>
            <ExportCard g={g} pct={pct} f={f} task={task} taskSub={taskSub} status={status} poster={poster} photo={photo} />
            {/* B 展签：框外标题，镜头到位前后逐行升起 */}
            <div style={{ position: 'absolute', left: capLeft, top: capTop, width: capW }}>
              <div style={{ ...kick, opacity: capIn(0) }}>
                <span style={{ color: L.accent }}>02</span><span style={{ color: L.ink2 }}>{kickerB}</span>
              </div>
              {/* flex cot: le am tren/duoi cua mat na khong bi "gop le" (collapse) giua cac dong */}
              <div style={{ display: 'flex', flexDirection: 'column', fontFamily: fonts.sans, fontSize: tSz, fontWeight: 820, letterSpacing: '-0.04em', lineHeight: 1.1, color: L.ink, marginTop: 26 }}>
                {tl.map((t, k) => (
                  <div key={k} style={{ overflow: 'hidden', whiteSpace: 'nowrap', padding: '0.5em 0.04em 0.25em', margin: '-0.5em -0.04em -0.25em' }}>
                    <div style={{ transform: `translateY(calc(${((1 - capIn(k * 0.7 + 0.5)) * 115).toFixed(2)}% + ${((1 - capIn(k * 0.7 + 0.5)) * 0.6).toFixed(3)}em))` }}>{t}</div>
                  </div>
                ))}
              </div>
              {sl.map((l, i) => (
                <div key={i} style={{ fontFamily: fonts.sans, fontSize: SS, fontWeight: 500, lineHeight: 1.3, color: L.ink2, marginTop: i ? 0 : 30, opacity: capIn(2.2 + i * 0.4), whiteSpace: 'nowrap' }}>{l}</div>
              ))}
            </div>
            {/* B 画框内：框闭合后才长出海报 */}
            {closed && (
              <div style={{
                position: 'absolute', left: g.FX0, top: g.FY0, width: g.FX1 - g.FX0, height: g.LY - g.FY0, opacity: fillIn,
                boxShadow: softShadow(26 * fillIn, { color: L.shadow, strength: 0.8 }),
              }}>
                <Poster w={g.FX1 - g.FX0} h={g.LY - g.FY0} f={f} text={poster} photo={photo} />
              </div>
            )}
          </div>
        </div>
      </SpeedBlur>

      {/* 一条线全程 evolve（模糊层外，始终锐利） */}
      <div style={world}>
        <svg width={3840} height={SH} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {/* 制图刻度：线经过后才出现在线下（横移中段的速度参照 + 尺规感），主刻度标距离 */}
          {Array.from({ length: 14 }, (_, i) => {
            const x = (portrait ? 1800 : 1200) + i * 120;
            if (portrait && x > g.FX0 - 40) return null;
            const on = ramp(g.X0 + drawn, x, 40, EASE.out);
            if (on <= 0) return null;
            const major = i % 4 === 0;
            return (
              <g key={i} opacity={on}>
                <line x1={x} x2={x} y1={g.LY + 10} y2={g.LY + (major ? 34 : 20) * K} stroke={alpha(L.ink, major ? 0.55 : 0.3)} strokeWidth={2 * K} />
                {major && (
                  <text x={x + 8} y={g.LY + 62 * K} fill={alpha(L.ink, 0.42)} style={{ fontFamily: fonts.mono, fontSize: 22 * K, fontWeight: 600 }}>{`${(i / 4 + 1) * 12} cm`}</text>
                )}
              </g>
            );
          })}
          <path d={g.PATH} fill="none" stroke={L.ink} strokeWidth={8 * (portrait ? 1.6 : 1)} strokeLinecap="square" strokeLinejoin="miter"
            strokeDasharray={`${drawn.toFixed(2)} ${g.TOTAL + 20}`} />
          {tipO > 0.001 && (
            <g opacity={tipO}>
              <circle cx={tx} cy={ty} r={30 * K} fill={L.accent} opacity={0.16} />
              <circle cx={tx} cy={ty} r={14 * K} fill={L.accent} />
            </g>
          )}
        </svg>
      </div>
    </AbsoluteFill>
  );
};
