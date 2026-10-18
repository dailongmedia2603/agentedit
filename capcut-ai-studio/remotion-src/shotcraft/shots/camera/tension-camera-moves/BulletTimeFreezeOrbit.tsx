// 子弹时间冻结环绕（bullet-time-freeze-orbit）——The Matrix bullet time：时间停住，相机却在动。
//
// 第二轮重设计（midnight · 深蓝夜 + 电光蓝）：
// - 主体是一块悬在暗场里的玻璃数据面板（1180×640）：7 根柱子按周错峰生长，每根柱顶向上喷出一串
//   "数据火花"（确定性粒子 ×140，带真实 z 深度 -300…+600px），右上角 120px 的六位滚轮计数器跟着冲。
// - 双时钟（命门）：内容全部吃 eff（内容时钟），相机吃真实帧。eff 不是硬停，而是 8f 的速度坡道
//   "急刹"进冻结（40–48f）、冻结 52 帧、再 8f 坡道恢复（100–108f）——像升格摄影的变速。
//   冻结期：柱子停在半途的波浪形、火花悬在半空并保留拖尾（拖尾长度按内容时钟的速度算，所以冻住的是
//   "运动中的瞬间"而不是静止画面）、计数器低位的滚动模糊也一起冻住。
// - 环绕：真实 3D 场景（preserve-3d）——面板、火花、地面光池各在自己的深度（[Agent Edit] 已去掉网格地面 / 点阵墙）。
//   相机 rotateY 0→-52°（26f，smooth）→ 顶点慢漂 12f → 回 0（22f，swift），同时 rotateX 抬 6°、
//   推近 160px。火花与面板、地面与背墙之间的视差把"相机在绕"讲清楚。
// - 恢复：柱子长完、火花散尽、柱顶数值标签逐个弹出，主角柱（周日）电光蓝 + 泛光，其余石板蓝。
//
// 时间表（30fps，共 170f）：
//   0–40    正常时间：柱子错峰生长（每根晚 5f）、火花上喷、计数器冲刺
//   40–48   速度坡道刹停（eff 速度 1→0）
//   48–100  冻结：相机 46–72 绕到 -52°，72–84 顶点慢漂，84–106 回正（推近 / 抬升同步）
//   100–108 速度坡道恢复
//   108–140 余波：柱子长完、火花散尽、数值标签弹出（eff 驱动）
//   140–170 hold：光的极缓呼吸，海报落定
//
// [Agent Edit] o chu: kicker / title (dau bang) / number (con so lon tren bo dem cuon, chi chu so) / values (4-7 cot:
// nhan gia tri tren dinh cot, chieu cao tinh tu con so trong chu, cot CUOI = cot chinh to sang) / labels (nhan truc duoi
// cot, cung so muc). Bo cuc cot / tia lua / bo dem tinh tu so cot + so chu so that.
// Khung doc (portrait.mode = 'native'): bang du lieu dung (1560x1960), tieu de + bo dem xep doc tren bieu do, chu to hon;
// camera quay vong 3D, dong ho kep (noi dung dong bang, camera van chay) giu nguyen.
import { useBackdrop, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const BULLET_TIME_FREEZE_ORBIT_DURATION = 170;

const L = LOOKS.midnight;
const GROW = 40; // 每根柱子的生长时长（内容时钟）
// 冻结时（eff≈40）柱顶正好是一道由高到低的波浪：n 根柱子总错峰 ≈30f
const startOf = (i: number, n: number) => 2 + i * Math.min(5, 30 / Math.max(1, n - 1));

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// —— 内容时钟：速度坡道进出冻结 ——
const speedAt = (f: number) =>
  f < 40 ? 1 : f < 48 ? 1 - EASE.smooth((f - 40) / 8) : f < 100 ? 0 : f < 108 ? EASE.smooth((f - 100) / 8) : 1;
const EFF: number[] = (() => {
  const out = [0];
  let e = 0;
  for (let f = 0; f < 200; f++) {
    for (let s = 0; s < 4; s++) e += speedAt(f + (s + 0.5) / 4) / 4;
    out.push(e);
  }
  return out;
})();
const effAt = (f: number) => {
  const i = Math.max(0, Math.min(EFF.length - 2, Math.floor(f)));
  return mix(EFF[i], EFF[i + 1], f - i);
};

// —— 滚轮计数器：每位一条数字带，按内容时钟的转速竖向模糊 ——
const digitPos = (v: number, k: number) => {
  const p10 = Math.pow(10, k);
  if (k === 0) return v % 10;
  const d = Math.floor(v / p10) % 10;
  const lower = v % p10;
  return d + Math.min(1, Math.max(0, lower - (p10 - 1)));
};
const STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const Odometer: React.FC<{ e: number; total: number; cols: number; size: number }> = ({ e, total, cols, size }) => {
  const valueAt = (x: number) => total * ramp(x, 4, 68, EASE.out);
  const v = valueAt(e);
  const v2 = valueAt(e + 0.5);
  const v1 = valueAt(e - 0.5);
  return (
    <div style={{ display: 'flex', ...type(size, 700), letterSpacing: 0, color: L.ink, lineHeight: 1 }}>
      {Array.from({ length: cols }, (_, ci) => {
        const k = cols - 1 - ci;
        const pos = digitPos(v, k);
        const speed = Math.abs(digitPos(v2, k) - digitPos(v1, k));
        const sp = speed > 5 ? 10 - speed : speed; // 跨 9→0 回绕时修正
        const blur = Math.min(9, sp * size * 0.1);
        const lit = v >= Math.pow(10, k) || k === 0;
        return (
          <React.Fragment key={ci}>
            {/* 千分位（越南语用点号） */}
            {ci > 0 && k % 3 === 2 && <span style={{ width: '0.28em', textAlign: 'center', color: lit ? L.ink2 : L.ink3 }}>.</span>}
            <div style={{
              position: 'relative', width: '0.62em', height: '1.24em', margin: '-0.12em 0', overflow: 'hidden',
              // 滚轮窗口上下渐隐：冻住的模糊数字带不留硬边
              WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%)',
              maskImage: 'linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%)',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: '0.12em', width: '100%', transform: `translateY(${(-pos).toFixed(4)}em)`,
                filter: blur > 0.3 ? `blur(${(blur * 0.35).toFixed(2)}px)` : undefined,
                color: lit ? L.ink : L.ink3,
              }}>
                {STRIP.map((c, i) => (
                  <div key={i} style={{ height: '1em', textAlign: 'center', opacity: blur > 0.3 ? 1 - Math.min(0.45, blur / 30) : 1 }}>{c}</div>
                ))}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const BulletTimeFreezeOrbit: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const bd = useBackdrop(); // [Agent Edit] nen anh AI
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'DOANH THU · TUẦN NÀY');
  const title = useText('title', 'Tổng đơn hàng');
  const numText = useText('number', '184920');
  const values = useList('values', ['14k', '18k', '16k', '22k', '20k', '26k', '31k']).slice(0, 7);
  const labelsIn = useList('labels', ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
  const digits = numText.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9) || '184920';
  const TOTAL = Number(digits);
  const COLS = digits.length;

  // —— 版式：landscape = 原版 1180×640 面板；portrait = 竖版面板 ——
  const n = Math.max(1, values.length);
  const PANEL = portrait ? { w: 1560, h: 2240 } : { w: 1180, h: 640 };
  const K = portrait ? 1.45 : 1; // 字号 / 火花尺度
  // 文字尺寸：计数器先定宽，标题在剩余宽度里折行（≤2 行）
  const units = COLS * 0.62 + Math.floor((COLS - 1) / 3) * 0.28;
  const odoSize = portrait ? Math.min(240, (PANEL.w - 160) / units) : Math.min(112, 560 / units);
  const odoW = odoSize * units;
  const headW = portrait ? PANEL.w - 2 * 64 * K : PANEL.w - 128 - odoW - 48;
  const kSize = fitSize(kicker, { family: fonts.sans, size: 26 * K, maxWidth: headW - 52 * K, weight: 650, letterSpacingEm: 0.2, minSize: 13 });
  const T0 = portrait ? 92 : 52;
  let tSize = fitSize(title, { family: fonts.sans, size: T0, maxWidth: headW, weight: 700, minSize: 20 });
  let tLines = [title];
  if (tSize < T0 * 0.85) {
    const sz = portrait ? T0 : 44;
    tLines = wrapLines(title, fonts.sans, sz, headW, 700, 2);
    tSize = Math.min(sz, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: sz, maxWidth: headW, weight: 700, minSize: 20 })));
  }
  const headBottom = 52 * K + kSize * 1.3 + 10 * K + tLines.length * tSize * 1.25;
  const odoTop = portrait ? headBottom + 70 : 46;
  const chY = portrait ? odoTop + odoSize * 1.24 + 220 : 250;
  const CH = portrait ? { x: 120, y: chY, w: 1320, h: PANEL.h - chY - 200 } : { x: 90, y: 250, w: 1000, h: 300 }; // 图表区（面板内坐标）
  const gapRatio = 0.45 * (7 / Math.max(4, n)) ** 0.3;
  const BAR_W = Math.min(portrait ? 190 : 140, CH.w / (n + (n - 1) * gapRatio));
  const BAR_GAP = n > 1 ? (CH.w - n * BAR_W) / (n - 1) : 0;
  const nums = values.map((v) => {
    const m = /-?\d+(?:[.,]\d+)?/.exec(v.replace(/\s/g, ''));
    return m ? Math.abs(parseFloat(m[0].replace(',', '.'))) : 0;
  });
  const vmax = Math.max(1e-6, ...nums);
  const BARS = nums.map((x) => Math.max(0.12, x / vmax));
  const growth = (i: number, e: number) => ramp(e, startOf(i, n), GROW, EASE.swift);
  const barTop = (i: number, e: number) => CH.y + CH.h - CH.h * BARS[i] * growth(i, e); // 面板内 y
  const barCx = (i: number) => CH.x + i * (BAR_W + BAR_GAP) + BAR_W / 2;
  // —— 火花：每根柱 20 颗，出生于柱顶（出生时刻的柱顶），向上减速飞散，带 z 深度 ——
  const SPARKS = BARS.flatMap((_, i) =>
    Array.from({ length: 20 }, (_, k) => {
      const r = (q: number) => hash(i * 97.1 + k * 13.7 + q);
      return {
        bar: i, born: startOf(i, n) + 1 + k * 1.9 + r(1) * 2,
        dx: (r(2) - 0.5) * BAR_W * 1.1, vx: (r(3) - 0.5) * 5 * K,
        v0: (12 + r(4) * 14) * K, tau: 8 + r(5) * 9, z: (r(6) - 0.35) * 900,
        size: (4 + r(7) * 7) * K, life: 30 + r(8) * 22, hot: r(9) < 0.35,
      };
    }),
  );
  const valSize = Math.min(36 * K, ...values.map((v) => fitSize(v, { family: fonts.sans, size: 36 * K, maxWidth: BAR_W + BAR_GAP * 0.9, weight: 700, minSize: 16 })));
  const labSize = Math.min(26 * K, ...labelsIn.slice(0, n).map((v) => fitSize(v, { family: fonts.sans, size: 26 * K, maxWidth: BAR_W + BAR_GAP * 0.9, weight: 550, minSize: 14 })));

  const e = effAt(frame);
  const frozen = 1 - speedAt(frame);

  // —— 相机（真实时钟）——
  const out = ramp(frame, 46, 26, EASE.smooth);
  const back = ramp(frame, 84, 22, EASE.swift);
  const drift = ramp(frame, 72, 12, EASE.linear);
  const orbit = out * (1 - back); // 0→1→0
  const ry = -52 * out * (1 - back) - 3 * drift * (1 - back);
  const rx = -3 - 6 * orbit;
  const dolly = 160 * orbit;
  const breathe = 1 + 0.05 * Math.sin(frame / 26);

  // 冻结时的空气：冷光微微加亮、四周收拢
  const chill = ramp(frame, 40, 10, EASE.out) * (1 - ramp(frame, 98, 12, EASE.smooth));
  const cy = portrait ? Math.round(SH * 0.5) : 520;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.04 }} fill={{ x: 0.5, y: 1.0 }} breathe={0.5} intensity={1 + 0.25 * chill} />

      <AbsoluteFill style={{ perspective: portrait ? 2400 : 1800, perspectiveOrigin: '50% 46%' }}>
        <div style={{
          position: 'absolute', left: 960, top: cy, width: 0, height: 0, transformStyle: 'preserve-3d',
          transform: `translateZ(${dolly.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`,
        }}>
          {/* [Agent Edit] bo diem cham nen (tuong luoi cham) + luoi ke o mat san: chi giu vung sang mem duoi mat san
              (khong co nen anh AI); co nen anh -> khong ve gi, anh nen hien ra */}
          {!bd && (
            <div style={{
              position: 'absolute', left: -1800, top: PANEL.h / 2 + 70 - 1800, width: 3600, height: 3600,
              transform: 'rotateX(90deg)',
              backgroundImage: `radial-gradient(ellipse 22% 14% at 50% 50%, ${alpha(L.accent, 0.32)} 0%, transparent 100%)`,
              WebkitMaskImage: 'radial-gradient(circle at 50% 50%, #000 0%, transparent 46%)',
              maskImage: 'radial-gradient(circle at 50% 50%, #000 0%, transparent 46%)',
            }} />
          )}

          {/* 面板 */}
          <div style={{
            position: 'absolute', left: -PANEL.w / 2, top: -PANEL.h / 2, width: PANEL.w, height: PANEL.h, boxSizing: 'border-box',
            borderRadius: 32 * (portrait ? 1.4 : 1), overflow: 'hidden',
            background: `linear-gradient(180deg, ${alpha('#1a2440', 0.94)} 0%, ${alpha(L.surface, 0.96)} 100%)`,
            border: `1.5px solid ${alpha('#a0beff', 0.18)}`,
            boxShadow: `inset 0 1.5px 0 ${alpha('#ffffff', 0.12)}, 0 50px 120px -30px ${alpha('#000208', 0.9)}`,
          }}>
            {/* 头部：标志 + 眉题 + 指标名 */}
            <div style={{ position: 'absolute', left: 64 * K, top: 52 * K }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 * K }}>
                <ShotcraftMark size={40 * K} tone="dark" style={{ margin: '-6px -2px -6px -5px' }} />
                {kicker ? <div style={{ ...type(kSize, 650), letterSpacing: '0.2em', color: L.accent, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{kicker}</div> : null}
              </div>
              <div style={{ ...type(tSize, 700), color: L.ink, marginTop: 10 * K, whiteSpace: 'nowrap', lineHeight: 1.25 }}>{tLines.map((l, i) => <div key={i}>{l}</div>)}</div>
            </div>
            <div style={{ position: 'absolute', ...(portrait ? { left: 80, top: odoTop } : { right: 64, top: 46 }) }}><Odometer e={e} total={TOTAL} cols={COLS} size={odoSize} /></div>

            {/* 刻度线 */}
            {[0, 1, 2, 3].map((g) => (
              <div key={g} style={{ position: 'absolute', left: CH.x, width: CH.w, top: CH.y + (CH.h / 3) * g, height: 1, background: g === 3 ? alpha(L.ink, 0.25) : L.line }} />
            ))}
            {/* 柱子 */}
            {BARS.map((b, i) => {
              const top = barTop(i, e);
              const hgt = CH.y + CH.h - top;
              const hero = i === BARS.length - 1;
              const lk = springAt(e, startOf(i, n) + GROW - 2, { damping: 15, stiffness: 200 });
              const lw = BAR_W + BAR_GAP;
              return (
                <React.Fragment key={i}>
                  <div style={{
                    position: 'absolute', left: barCx(i) - BAR_W / 2, top, width: BAR_W, height: hgt, borderRadius: `${14 * K}px ${14 * K}px 4px 4px`,
                    background: hero
                      ? `linear-gradient(180deg, #8fb0ff 0%, ${L.accent} 30%, #2f55d8 100%)`
                      : `linear-gradient(180deg, #3a4b74 0%, #253252 100%)`,
                    boxShadow: hero
                      ? `inset 0 2px 0 rgba(255,255,255,0.5), 0 0 40px ${alpha(L.accent, 0.55)}`
                      : `inset 0 2px 0 rgba(255,255,255,0.18)`,
                  }} />
                  {/* 柱顶亮边（生长中的"刀口"） */}
                  {growth(i, e) < 1 && growth(i, e) > 0 && (
                    <div style={{ position: 'absolute', left: barCx(i) - BAR_W / 2 - 6, top: top - 3, width: BAR_W + 12, height: 6, borderRadius: 3, background: '#dfe8ff', boxShadow: `0 0 18px ${alpha(L.accent, 0.9)}` }} />
                  )}
                  <div style={{
                    position: 'absolute', left: barCx(i) - lw / 2, width: lw, top: CH.y + CH.h - CH.h * b - valSize * 1.5, textAlign: 'center', whiteSpace: 'nowrap',
                    ...type(valSize, 700), lineHeight: 1.25, color: hero ? '#bcd0ff' : L.ink2, opacity: Math.min(1, lk * 1.4),
                    transform: `translateY(${((1 - lk) * 14).toFixed(2)}px) scale(${(0.8 + 0.2 * lk).toFixed(3)})`,
                  }}>
                    {values[i]}
                  </div>
                  <div style={{ position: 'absolute', left: barCx(i) - lw / 2, width: lw, top: CH.y + CH.h + 18 * K, textAlign: 'center', whiteSpace: 'nowrap', ...type(labSize, 550), lineHeight: 1.3, color: hero ? L.ink : L.ink3 }}>
                    {labelsIn[i] ?? ''}
                  </div>
                </React.Fragment>
              );
            })}
            {/* 冻结时面板表面的冷光（裁进圆角，跟相机角度横移） */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5 * orbit,
              background: `linear-gradient(105deg, transparent ${(30 + 50 * orbit).toFixed(1)}%, ${alpha('#cfdcff', 0.16)} ${(45 + 50 * orbit).toFixed(1)}%, transparent ${(60 + 50 * orbit).toFixed(1)}%)`,
            }} />
          </div>

          {/* 火花（真实 z 深度，冻结时悬停并保留拖尾） */}
          {SPARKS.map((s, idx) => {
            const age = e - s.born;
            if (age < 0 || age > s.life) return null;
            const birthTop = barTop(s.bar, s.born);
            const k = 1 - Math.exp(-age / s.tau);
            const x = barCx(s.bar) + s.dx + s.vx * age - PANEL.w / 2;
            const y = birthTop - s.v0 * s.tau * k - PANEL.h / 2;
            const z = s.z * k;
            const v = s.v0 * Math.exp(-age / s.tau); // 内容时钟下的速度
            const len = s.size + v * 3.2;
            const fade = Math.min(1, age / 3) * (1 - Math.pow(age / s.life, 2));
            const c = s.hot ? '#ffffff' : '#9cb8ff';
            return (
              <div key={idx} style={{
                position: 'absolute', left: x - s.size / 2, top: y, width: s.size, height: len, borderRadius: s.size,
                transform: `translateZ(${z.toFixed(1)}px)`,
                background: `linear-gradient(180deg, ${c} 0%, ${alpha(c, 0)} 100%)`,
                boxShadow: `0 0 ${(s.size * 2).toFixed(1)}px ${alpha(L.accent, 0.8)}`,
                opacity: fade * (0.85 + 0.15 * breathe),
              }} />
            );
          })}
        </div>
      </AbsoluteFill>

      {/* 冻结期暗角收拢（屏幕空间） */}
      {frozen > 0.001 || chill > 0.001 ? (
        <AbsoluteFill style={{
          pointerEvents: 'none', opacity: chill,
          background: `radial-gradient(ellipse 64% 64% at 50% 48%, ${alpha('#050a1c', 0)} 50%, ${alpha('#050a1c', 0.55)} 100%)`,
        }} />
      ) : null}
    </AbsoluteFill>
  );
};
