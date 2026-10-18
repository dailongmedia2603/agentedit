import { useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { LOOKS, alpha } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import { EASE, Vignette, bezier, mix, ramp } from '../../../fixtures/Polish';

// anime-impact 动漫打击帧〔组合〕：crash-zoom 急推撞停在目标卡上的那 3 帧，
// 整幅画面反转成黑白负片 + 手绘放射集中线 + 红青通道 ±8px 色散——
// 像素被打了一拳，第 4 帧一切撤掉恢复干净特写 + 6px 震屏衰减。
// 节拍：0–22 建立全景（极缓 creep 1→1.012，目标卡 accent 描边亮起锁定）→
//       22–28 预备回拉到 0.985（拳头往后收）→ 28–34 急推（6f ease-in cubic 到 2.25x，
//       时间采样运动模糊）→ 34–36 冲击帧（3f 负片/集中线/RGB split，每帧换形态）→
//       37 起恢复干净特写 + 震屏衰减 + 暗角压一拍 → ~50–120 静止读卡（≥2s 呼吸）。
//
// [Agent Edit] The muc tieu mang noi dung that: o chu `kicker` (nhan the), `number` (con so lon), `title` (cau chot
// duoi so). Dashboard nen ve lai trong file nay bang tieng Viet trung tinh (FakeDashboard / Card cua fixtures con chu
// tieng Anh + ten video-shotcraft) — giu dung hinh hoc goc o khung ngang (sidebar 220, topbar 72, luoi 3x2 the 524x454,
// the muc tieu o cot 2 hang 1). Khung doc (portrait.mode = 'native'): dashboard kieu dien thoai (topbar + luoi 2 cot x 3
// hang phu kin chieu cao that), the muc tieu o cot phai hang giua; cu day toi ~94% be ngang. Tat ca thong so nhip
// (6f du bi, 6f ease-in, 3f am ban, rung 6px) giu nguyen.

export const ANIME_IMPACT_DURATION = 120;

const WIND = 22; // 预备回拉起点
const ZOOM_START = 28;
const ZOOM_END = 34; // 撞停帧
const IMPACT_LEN = 3; // 冲击帧持续 3f（34/35/36）
const RECOVER = ZOOM_END + IMPACT_LEN; // 37：恢复干净特写

const inCubic = bezier(0.55, 0.055, 0.675, 0.19); // ease-in cubic（md：6f ease-in(cubic)）

// seed 正弦哈希（禁 Math.random）
const rnd = (i: number) => {
  const s = Math.sin(i * 127.3) * 43758.5453;
  return s - Math.floor(s);
};

type Rect = { x: number; y: number; w: number; h: number };
type Geo = { H: number; portrait: boolean; cards: Rect[]; target: number; scaleEnd: number; cx: number; cy: number };

// 相机：全景极缓 creep → 预备回拉 → ease-in 急推；返回 scale 与推近进度 p（卡心收敛到画面正中）
const camAt = (f: number, g: Geo) => {
  const creep = mix(1, 1.012, ramp(f, 0, WIND, EASE.smooth));
  const wind = mix(creep, 0.985, ramp(f, WIND, ZOOM_START - WIND, EASE.smooth));
  const p = ramp(f, ZOOM_START, ZOOM_END - ZOOM_START, inCubic);
  const scale = f < ZOOM_START ? wind : mix(0.985, g.scaleEnd, p);
  return { scale, p };
};

const zoomStyle = (f: number, g: Geo): React.CSSProperties => {
  const { scale, p } = camAt(f, g);
  return {
    position: 'absolute',
    inset: 0,
    transform: `translate(${(960 - g.cx) * p}px, ${(g.H / 2 - g.cy) * p}px) scale(${scale})`,
    transformOrigin: `${g.cx}px ${g.cy}px`,
  };
};

// 手绘放射集中线：外圈 34 根粗楔 + 22 根细针，内端落在卡周缘一带留出干净焦点；phase 每帧换形态
const SpeedLines: React.FC<{ phase: number; g: Geo }> = ({ phase, g }) => {
  const cx = 960;
  const cy = g.H / 2;
  const R_OUT = Math.hypot(960, g.H / 2) + 220; // 超出画框对角
  // 焦点区 = 撞停后的卡：横屏宽椭圆（×1.18 横向），竖屏卡更高 → 半径整体放大、横向收窄
  const fr = g.portrait ? (g.cards[g.target].h * g.scaleEnd) / 2 / 510 : 1;
  const ex = g.portrait ? 0.86 : 1.18;
  const wedge = (i: number, n: number, k: number, r0Min: number, r0Var: number, wMin: number, wVar: number) => {
    const ang = ((i + 0.5) / n) * Math.PI * 2 + (rnd(k) - 0.5) * 0.24;
    const r0 = (r0Min + rnd(k + 1) * r0Var) * fr; // 内端长短参差
    const halfW = ((wMin + rnd(k + 2) * wVar) * (g.portrait ? 1.5 : 1)) / R_OUT; // 外端宽度
    const ax = cx + Math.cos(ang) * r0 * ex;
    const ay = cy + Math.sin(ang) * r0;
    const p1 = `${cx + Math.cos(ang - halfW) * R_OUT},${cy + Math.sin(ang - halfW) * R_OUT}`;
    const p2 = `${cx + Math.cos(ang + halfW) * R_OUT},${cy + Math.sin(ang + halfW) * R_OUT}`;
    return `${ax},${ay} ${p1} ${p2}`;
  };
  const thick = Array.from({ length: 34 }, (_, i) => wedge(i, 34, i * 13 + phase * 101, 330, 230, 9, 22));
  const thin = Array.from({ length: 22 }, (_, i) => wedge(i + 0.37, 22, i * 29 + phase * 57 + 7, 420, 260, 2, 4));
  return (
    <svg viewBox={`0 0 1920 ${g.H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        {/* 焦点内缘柔化：集中线内端不是硬切，而是被一圈径向渐隐吃掉 */}
        <radialGradient id="ai-lines-fade" cx="960" cy={cy} r={700 * fr} gradientUnits="userSpaceOnUse">
          <stop offset="0.38" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="1" />
        </radialGradient>
        <mask id="ai-lines-mask">
          <rect width="1920" height={g.H} fill="url(#ai-lines-fade)" />
        </mask>
      </defs>
      <g mask="url(#ai-lines-mask)">
        {thick.map((pts, i) => (
          <polygon key={`a${i}`} points={pts} fill={i % 5 === 0 ? '#0d0e12' : '#f4f2ee'} />
        ))}
        {thin.map((pts, i) => (
          <polygon key={`b${i}`} points={pts} fill="#f4f2ee" opacity={0.85} />
        ))}
      </g>
    </svg>
  );
};

// ───────────── 自绘 dashboard（tiếng Việt trung tính） ─────────────
const MINI = [
  { title: 'Người dùng hoạt động', value: '24.812', delta: '+12,4%', chip: '7 ngày', kind: 'spark' },
  { title: '', value: '', delta: '', chip: '', kind: 'target' },
  { title: 'Doanh thu', value: '482 tr', delta: '+6,3%', chip: 'Tháng', kind: 'bars' },
  { title: 'Đơn hàng', value: '3.912', delta: '+4,8%', chip: 'Tuần', kind: 'spark' },
  { title: 'Mục tiêu quý', value: '68%', delta: '', chip: 'Q3', kind: 'goal' },
  { title: 'Hoạt động', value: '412', delta: '', chip: 'Q3', kind: 'heat' },
];
const NAV = ['Tổng quan', 'Phân tích', 'Dự án', 'Thành viên', 'Báo cáo', 'Thanh toán', 'Cài đặt'];

const series = (seed: number, n: number) => Array.from({ length: n }, (_, i) => 0.25 + 0.5 * rnd(seed * 17 + i) * 0.6 + (i / (n - 1)) * 0.45);

const MiniCard: React.FC<{ i: number; Hd: number; font: string }> = ({ i, Hd, font }) => {
  const c = MINI[i];
  const A = LOOKS.porcelain.accent;
  const v = series(i + 3, 14);
  const chartH = Math.max(90, Hd - 30 * 2 - 36 - 24 - 70 - 40);
  return (
    <div style={{ width: 524, height: Hd, boxSizing: 'border-box', padding: 30, display: 'flex', flexDirection: 'column', fontFamily: font, color: G.ink1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: G.fill, boxShadow: `inset 0 0 0 1px ${G.hairline}` }} />
        <div style={{ fontSize: 20, fontWeight: 550, color: G.ink2, whiteSpace: 'nowrap' }}>{c.title}</div>
        <div style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 550, color: G.ink3, padding: '4px 10px', borderRadius: 8, background: G.fill }}>{c.chip}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 24 }}>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.15 }}>{c.value}</div>
        {c.delta ? <div style={{ fontSize: 17, fontWeight: 600, color: '#178a5a', padding: '3px 9px', borderRadius: 7, background: 'rgba(23,138,90,0.1)' }}>{c.delta}</div> : null}
      </div>
      <div style={{ marginTop: 'auto', height: chartH, position: 'relative' }}>
        {c.kind === 'spark' && (
          <svg width={464} height={chartH} style={{ position: 'absolute', inset: 0 }}>
            <path
              d={v.map((y, k) => `${k ? 'L' : 'M'}${((k / (v.length - 1)) * 464).toFixed(1)} ${((1 - y) * (chartH - 10) + 5).toFixed(1)}`).join(' ')}
              fill="none" stroke={i === 0 ? A : '#c4c6cc'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        )}
        {c.kind === 'bars' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            {v.slice(0, 10).map((y, k) => <div key={k} style={{ flex: 1, height: `${y * 100}%`, borderRadius: 5, background: k === 9 ? '#c4c6cc' : G.fill2 }} />)}
          </div>
        )}
        {c.kind === 'goal' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 16 }}>
            {[0.82, 0.64, 0.47, 0.3].map((pct, k) => (
              <div key={k} style={{ height: 10, borderRadius: 5, background: G.fill2 }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 5, background: k === 0 ? A : '#c4c6cc' }} />
              </div>
            ))}
          </div>
        )}
        {c.kind === 'heat' && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '1fr', gap: 6 }}>
            {Array.from({ length: 12 * Math.max(3, Math.min(7, Math.floor(chartH / 34))) }, (_, k) => (
              <div key={k} style={{ borderRadius: 4, background: rnd(k + 5) > 0.7 ? alpha(A, 0.55) : rnd(k + 9) > 0.5 ? '#dcdde1' : G.fill }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 目标卡：讲话里的数字 / 结论
type TargetTxt = { kicker: string; number: string; numSize: number; lines: string[]; capSize: number; kickSize: number };
const TargetCard: React.FC<{ Hd: number; t: TargetTxt; font: string }> = ({ Hd, t, font }) => {
  const A = LOOKS.porcelain.accent;
  const v = series(11, 12);
  const capH = t.lines.length * t.capSize * 1.3;
  const chartH = Math.max(60, Hd - 30 * 2 - 40 - 18 - t.numSize * 1.15 - 14 - capH - 30);
  return (
    <div style={{ width: 524, height: Hd, boxSizing: 'border-box', padding: 30, display: 'flex', flexDirection: 'column', fontFamily: font, color: G.ink1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40 }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: A, boxShadow: `0 0 0 5px ${alpha(A, 0.16)}` }} />
        <div style={{ fontSize: t.kickSize, fontWeight: 650, color: A, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{t.kicker}</div>
      </div>
      <div style={{ marginTop: 18, fontSize: t.numSize, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.15, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{t.number}</div>
      <div style={{ marginTop: 14, fontSize: t.capSize, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.015em', color: G.ink2 }}>
        {t.lines.map((l, k) => <div key={k} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>
      <div style={{ marginTop: 'auto', height: chartH, display: 'flex', alignItems: 'flex-end', gap: 9 }}>
        {v.map((y, k) => (
          <div key={k} style={{ flex: 1, height: `${(k === v.length - 1 ? 1 : y * 0.8) * 100}%`, borderRadius: 6, background: k === v.length - 1 ? A : alpha(A, 0.16 + k * 0.02) }} />
        ))}
      </div>
    </div>
  );
};

const CardBox: React.FC<{ r: Rect; lock?: number; children: (Hd: number) => React.ReactNode }> = ({ r, lock = 0, children }) => {
  const k = r.w / 524;
  const A = LOOKS.porcelain.accent;
  return (
    <div
      style={{
        position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 14 * k, background: G.card, overflow: 'hidden',
        border: `1px solid ${G.hairline}`, boxSizing: 'border-box',
        boxShadow:
          `0 0 0 ${(1.5 * lock * k).toFixed(2)}px ${A}, 0 0 0 ${(6 * lock * k).toFixed(2)}px ${alpha(A, 0.14 * lock)}, ` +
          `inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 4px rgba(16,18,24,0.06), 0 ${mix(6, 22, lock)}px ${mix(18, 48, lock)}px -10px rgba(16,18,24,${mix(0.1, 0.22, lock).toFixed(3)})`,
      }}
    >
      <div style={{ width: 524, height: r.h / k, zoom: k }}>{children(r.h / k)}</div>
    </div>
  );
};

// 全景：侧栏 / 顶栏 + 6 卡；lock = 目标卡 accent 描边亮起进度（0–1）
const Scene: React.FC<{ lock: number; g: Geo; t: TargetTxt; font: string }> = ({ lock, g, t, font }) => {
  const A = LOOKS.porcelain.accent;
  const name = BRAND.name || 'Bảng điều khiển';
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: g.H, background: 'linear-gradient(180deg, #f4f4f2 0%, #eeeeeb 100%)', fontFamily: font }}>
      {!g.portrait ? (
        <>
          {/* 侧栏 */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: 220, height: g.H, background: 'linear-gradient(180deg, #1c1d22 0%, #16171b 100%)', padding: '28px 22px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 22 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg, #2a2a26 0%, #171714 100%)', flex: 'none' }}>
                <ShotcraftMark size={26} tone="dark" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 650, color: 'rgba(255,255,255,0.94)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>Gói Pro</div>
              </div>
            </div>
            {NAV.map((label, i) => (
              <div key={label} style={{ height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 11, padding: '0 10px', marginBottom: 6, background: i === 0 ? 'rgba(255,255,255,0.08)' : 'transparent', color: i === 0 ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.56)', fontSize: 14, fontWeight: i === 0 ? 550 : 450 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid currentColor', opacity: 0.7 }} />
                {label}
              </div>
            ))}
            <div style={{ marginTop: 26, padding: '0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.32)' }}>DỰ ÁN</div>
            {['Video ra mắt', 'Giới thiệu tính năng', 'Tổng kết quý'].map((n, i) => (
              <div key={n} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 11, padding: '0 10px', fontSize: 14, color: 'rgba(255,255,255,0.56)', whiteSpace: 'nowrap' }}>
                <div style={{ width: 8, height: 8, borderRadius: 3, margin: '0 4px', background: i === 0 ? A : `rgba(255,255,255,${0.42 - i * 0.12})` }} />
                {n}
              </div>
            ))}
          </div>
          {/* 顶栏 */}
          <div style={{ position: 'absolute', left: 220, right: 0, top: 0, height: 72, background: '#fafaf9', borderBottom: `1px solid ${G.hairline}`, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 20, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 15, color: G.ink3, whiteSpace: 'nowrap' }}>Bảng điều khiển ›</div>
            <div style={{ fontSize: 15, color: G.ink1, fontWeight: 600 }}>Tổng quan</div>
            <div style={{ display: 'flex', padding: 3, borderRadius: 9, background: G.fill, fontSize: 13, marginLeft: 12 }}>
              {['7N', '30N', '90N'].map((x, i) => (
                <div key={x} style={{ padding: '5px 11px', borderRadius: 6, color: i === 1 ? G.ink1 : G.ink3, background: i === 1 ? '#fff' : 'transparent' }}>{x}</div>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', height: 36, width: 320, background: '#fff', border: `1px solid ${G.hairlineStrong}`, borderRadius: 10, display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'border-box', fontSize: 14, color: G.ink3 }}>Tìm kiếm…</div>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'linear-gradient(145deg, #3a3c44, #23242a)' }} />
          </div>
        </>
      ) : (
        // 竖屏：手机式顶栏
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 200, background: '#fafaf9', borderBottom: `1px solid ${G.hairline}`, display: 'flex', alignItems: 'center', padding: '0 64px', gap: 28, boxSizing: 'border-box' }}>
          <div style={{ width: 92, height: 92, borderRadius: 24, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg, #2a2a26 0%, #171714 100%)', flex: 'none' }}>
            <ShotcraftMark size={60} tone="dark" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 40, color: G.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 1100 }}>{name}</div>
            <div style={{ fontSize: 60, color: G.ink1, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Tổng quan</div>
          </div>
          <div style={{ marginLeft: 'auto', width: 96, height: 96, borderRadius: 48, background: 'linear-gradient(145deg, #3a3c44, #23242a)', flex: 'none' }} />
        </div>
      )}
      {g.cards.map((r, i) => {
        if (i === g.target) return <CardBox key={i} r={r} lock={lock}>{(Hd) => <TargetCard Hd={Hd} t={t} font={font} />}</CardBox>;
        // 小卡内容按格子次序取 MINI 的非目标项
        const mi = [0, 2, 3, 4, 5][i - (i > g.target ? 1 : 0)];
        return <CardBox key={i} r={r}>{(Hd) => <MiniCard i={mi} Hd={Hd} font={font} />}</CardBox>;
      })}
    </div>
  );
};

// 急推段时间采样运动模糊：快门 0.6f 内取 N 个子帧叠化（第 k 层 opacity 1/(k+1) = 等权平均），
// 每个子帧再按相邻子帧间距加一点高斯模糊把阶梯抹平；只给 28–33 的飞行帧，撞停帧本身锐利
const SHUTTER = 0.6;
const blurAt = (f: number, g: Geo) => {
  if (f <= ZOOM_START || f >= ZOOM_END) return { n: 1, sd: 0 };
  const a = camAt(f, g), b = camAt(f - SHUTTER, g);
  const edge = Math.abs(a.scale - b.scale) * 900 + Math.abs(a.p - b.p) * 160; // 画框边缘处位移 px
  const n = Math.max(1, Math.min(12, Math.ceil(edge / 10)));
  return { n, sd: n > 1 ? Math.min(6, (edge / (n - 1)) * 0.45) : 0 };
};

// 锐利中心遮罩：跟着卡心在屏幕上的位置走（transform-origin 在卡心，屏幕位置 = 卡心 + 平移）
const sharpMask = (f: number, g: Geo) => {
  const { p } = camAt(f, g);
  const x = ((g.cx + (960 - g.cx) * p) / 1920) * 100;
  const y = ((g.cy + (g.H / 2 - g.cy) * p) / g.H) * 100;
  return `radial-gradient(ellipse 30% ${g.portrait ? 22 : 34}% at ${x.toFixed(1)}% ${y.toFixed(1)}%, #000 0%, rgba(0,0,0,0.85) 45%, transparent 100%)`;
};

export const AnimeImpact: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const kicker = useText('kicker', 'Doanh thu tháng này');
  const number = useText('number', '+248%');
  const title = useText('title', 'Kỷ lục mới chỉ sau một chiến dịch');
  const portrait = SH > 1080 * 1.2;

  // —— 几何 ——
  let g: Geo;
  if (!portrait) {
    // 原版：侧栏 220、顶栏 72、3×2 卡 524×454 @ x=256/808/1360, y=108/590；目标 = 列 2 行 1
    const cards = [0, 1].flatMap((row) => [256, 808, 1360].map((x) => ({ x, y: 108 + row * 482, w: 524, h: 454 })));
    const T = cards[1];
    g = { H: 1080, portrait, cards, target: 1, scaleEnd: 2.25, cx: T.x + T.w / 2, cy: T.y + T.h / 2 };
  } else {
    const top = 200;
    const pad = 64;
    const gap = 44;
    const w = (1920 - pad * 2 - gap) / 2;
    const h = (SH - top - pad * 2 - gap * 2) / 3;
    const cards = [0, 1, 2].flatMap((row) => [0, 1].map((col) => ({ x: pad + col * (w + gap), y: top + pad + row * (h + gap), w, h })));
    // 目标 = 右列中行
    const target = 3;
    const T = cards[target];
    g = { H: SH, portrait, cards, target, scaleEnd: Math.min((1920 * 0.94) / w, (SH * 0.94) / h), cx: T.x + T.w / 2, cy: T.y + T.h / 2 };
  }
  // 目标卡文字（设计坐标：卡宽 524，内宽 464）
  const T = g.cards[g.target];
  const Hd = T.h / (T.w / 524);
  const numSize = fitSize(number, { family: fonts.sans, size: g.portrait ? 150 : 128, maxWidth: 464, weight: 800, minSize: 56 });
  const kickSize = fitSize(kicker, { family: fonts.sans, size: g.portrait ? 26 : 22, maxWidth: 420, weight: 650, minSize: 14 });
  const cap0 = g.portrait ? 36 : 28;
  const capMax = g.portrait ? 4 : 3;
  const capRaw = wrapLines(title, fonts.sans, cap0, 464, 600, capMax);
  const capSize = Math.min(...capRaw.map((l) => fitSize(l, { family: fonts.sans, size: cap0, maxWidth: 464, weight: 600, minSize: cap0 * 0.6 })));
  const lines = wrapLines(title, fonts.sans, capSize, 464, 600, capMax);
  const txt: TargetTxt = { kicker, number, numSize: Math.min(numSize, (Hd - 260 - lines.length * capSize * 1.3) / 1.15), lines, capSize, kickSize };


  const lock = ramp(frame, 6, 14, EASE.out); // 目标卡描边亮起：观众先知道"拳头要落在哪"
  const impact = frame >= ZOOM_END && frame < RECOVER;
  const phase = impact ? frame - ZOOM_END : 0; // 每 1f 换一次集中线形态

  // 撞停后震屏：6px 起步、指数衰减 τ≈2.2f；cos 起相首拍沿推进方向"下沉"，相邻帧近乎反号的硬抖
  const since = frame - RECOVER;
  const env = since >= 0 ? 6 * Math.exp(-since / 2.2) : 0;
  const live = env > 0.12;
  const shakeX = live ? env * 0.7 * Math.sin(since * 2.5 + 0.6) : 0;
  const shakeY = live ? env * Math.cos(since * 2.9) : 0;
  const shakeR = live ? env * 0.04 * Math.sin(since * 3.3 + 1.7) : 0;

  // 撞停重量：暗角猛压一拍再退；目标卡外的页面压暗一点让特写"站出来"
  const hitK = frame >= RECOVER ? 1 - ramp(frame, RECOVER, 22, EASE.out) : 0;
  const vig = frame >= RECOVER ? mix(0.16, 0.42, hitK) : 0.12;

  const { n, sd } = blurAt(frame, g);
  const scene = <Scene lock={lock} g={g} t={txt} font={fonts.sans} />;

  return (
    <AbsoluteFill style={{ background: impact ? '#0d0e12' : G.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) rotate(${shakeR.toFixed(3)}deg)`,
        }}
      >
        {/* 主层：冲击帧期间整幅高反差黑白负片；急推段 n>1 时做时间采样运动模糊 */}
        <div style={{ position: 'absolute', inset: 0, filter: impact ? 'invert(1) grayscale(1) contrast(1.45)' : 'none' }}>
          {Array.from({ length: n }, (_, k) => (
            <div
              key={k}
              style={{
                ...zoomStyle(frame - (SHUTTER * k) / Math.max(1, n - 1), g),
                opacity: k === 0 ? 1 : 1 / (k + 1),
                filter: sd > 0.3 ? `blur(${sd.toFixed(2)}px)` : undefined,
              }}
            >
              {scene}
            </div>
          ))}
          {/* 变焦模糊的径向性：画心（推进中心）位移最小 → 叠一层当前帧的锐利副本，径向遮罩只留中心 */}
          {n > 1 && (
            <div
              style={{
                position: 'absolute', inset: 0,
                WebkitMaskImage: sharpMask(frame, g),
                maskImage: sharpMask(frame, g),
              }}
            >
              <div style={zoomStyle(frame, g)}>{scene}</div>
            </div>
          )}
        </div>
        {/* RGB split：红/青双层负片副本，screen 叠底、±8px 错位（随 phase 换向） */}
        {impact && (
          <>
            {[
              { dx: -8, dy: phase % 2 === 0 ? 4 : -4, tint: '#ff2a4a' },
              { dx: 8, dy: phase % 2 === 0 ? -4 : 4, tint: '#16e0ff' },
            ].map((c, i) => (
              <div
                key={i}
                style={{ position: 'absolute', inset: 0, mixBlendMode: 'screen', transform: `translate(${c.dx}px, ${c.dy}px)`, isolation: 'isolate' }}
              >
                <div style={{ ...zoomStyle(frame, g), filter: 'invert(1) grayscale(1) contrast(1.45)' }}>{scene}</div>
                <div style={{ position: 'absolute', inset: 0, background: c.tint, mixBlendMode: 'multiply' }} />
              </div>
            ))}
            {/* 手绘放射集中线：每帧换形态 */}
            <SpeedLines phase={phase} g={g} />
          </>
        )}
        {/* 恢复后：目标卡外压暗（卡外大 spread 阴影当遮罩，随特写坐标走） */}
        {frame >= RECOVER && (
          <div style={zoomStyle(frame, g)}>
            <div
              style={{
                position: 'absolute', left: T.x, top: T.y, width: T.w, height: T.h, borderRadius: 14 * (T.w / 524),
                boxShadow: `0 0 0 4000px rgba(14,15,20,${mix(0.1, 0.22, hitK).toFixed(3)})`,
              }}
            />
          </div>
        )}
      </div>
      {!impact && <Vignette strength={vig} inner={0.5} color="#0b0c12" />}
    </AbsoluteFill>
  );
};
