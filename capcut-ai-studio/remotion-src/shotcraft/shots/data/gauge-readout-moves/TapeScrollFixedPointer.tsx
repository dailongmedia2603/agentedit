// tape-scroll-fixed-pointer —— 滚带定针（世界动、针不动：数值大小 = 看得见的位移距离）
//
// 第二轮重设计（瓷白精密仪器 · 航电速度带语法）：
// - look = porcelain（冷白 + 钴蓝）。主角是一条贯穿全画高、上下渐隐出画的竖向刻度带（每 10 一刻、每 50 一大刻 +
//   64px 数字），钴蓝读数窗 + 指针缺口钉死在画面中线：窗里是 128px 白色读数，刻度带从窗后滚过。
//   不再是小盒子里的刻度尺——带子本身就是画面的"世界"。
// - 叙事：慢爬顶到旧上限（虚线 "Old limit"（140k） 横在窗口正上方，读数被压在 122 停住）→ 升级生效，
//   旧上限线断开淡出 → 预备回拉一下 → 刻度带冲刺（峰值 ~100px/f，按速度纵向运动模糊）→ 冲过 444 →
//   弹簧刹车回摆到 416 → 落定 420，新上限标记（钴蓝三角 bug）恰好停进指针。
// - 左侧排版：品牌眉题（video-shotcraft · frames / hour）+ 124px 标题 "Throughput"，落定后第二行 "tripled." 钴蓝升起
//   （结论晚于数据到），再弹出 "▲ 200%" 胶囊 + "140k → 420k" 等宽小结。
//
// 时间表（30fps，共 150f）：
//   0–14    预备：舞台、刻度带停在 60、标题第一行升起
//   10–48   慢爬 60→122（swift：起步加速、贴近上限时减速——"顶住了"，上限线正好压在读数窗上沿）
//   48–56   停在上限下；52f 旧上限线断开淡出（升级生效）
//   56–61   预备：回拉 122→117（anticip）
//   61–83   冲刺 117→444（22f，bezier .55,0,.25,1），刻度带按速度纵向模糊
//   83–110  弹簧刹车：444→416→420（~16% 一次可见回摆），110f 后锁死常数
//   96–124  余波："tripled." 升起（98f）、胶囊弹出（108f）、小结淡入（114f）
//   110–150 hold：整体极缓推近 1.0→1.025，尾帧是完整的结论海报
//
// [Agent Edit] o chu: kicker (eyebrow, sau ten thuong hieu) / title (dong 1) / title2 (dong 2 mau nhan, ket luan) /
// from + to (gioi han cu -> moi, so bat ky) / unit / old_label + new_label (nhan vach) / change (chip; trong -> tu tinh %).
// So bat ky: chon "buoc vach" dep (1/2/2,5/5 x 10^k) sao cho cu nhay ~28 vach nhu ban goc (140k -> 420k = 28 vach)
// -> toc do nuoc rut (~100px/f), qua da +24 don vi bang, lo xo ham, khoa 110f van GIU NGUYEN. Chu dai tu thu nho / xuong dong.
// Khung doc (native): chu len tren (to hon), cum bang cuon + cua so doc phong to 1.7 dat giua phan duoi.
import { useCurrentFrame, useShotFonts, useText, useVideoConfig, useBackdrop, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { EASE, FONT, SpeedBlur, bezier, mix, ramp, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND } from '../../../fixtures/Brand';

export const TAPE_SCROLL_FIXED_POINTER_DURATION = 150;

const L = LOOKS.porcelain;
const PXU = 5; // px / 单位：每 10 单位一刻 = 50px
const CY = 540; // 指针中线（屏幕 y）
const TAPE_X = 1000; // 刻度带左缘
const TAPE_W = 520;
const TICK_R = TAPE_X + TAPE_W - 40; // 刻度右端（向左伸）
const NUM_R = TAPE_X + 310; // 数字右对齐线
const WIN_X = TAPE_X - 30; // 读数窗
const WIN_W = 400;
const WIN_H = 150;

const SPRINT = bezier(0.55, 0, 0.25, 1); // 冲刺：猛加速、长刹车
// 回摆弹簧：444 → 420，回摆到 416（超调 4/24 ≈ 17%）→ 反算阻尼
const SET_STIFF = 140;
const SET_DAMP = (() => {
  const lp = Math.log(4 / 24);
  return 2 * (-lp / Math.sqrt(Math.PI * Math.PI + lp * lp)) * Math.sqrt(SET_STIFF);
})();

// 读数时间线（纯帧函数，全部钳位）—— [Agent Edit] 以带单位 u 表示：UF = 旧上限，UT = 新上限，dir = 方向
// pre = quang bo cham truoc moc cu (goc 80 don vi; so nho -> ngan lai de khong xuong duoi 0)
const valueAt = (f: number, UF: number, UT: number, dir: number, pre = 80): number => {
  if (f <= 10) return UF - pre * dir;
  if (f <= 48) return mix(UF - pre * dir, UF - 18 * dir, ramp(f, 10, 38, EASE.swift));
  if (f <= 56) return UF - 18 * dir;
  if (f <= 61) return mix(UF - 18 * dir, UF - 23 * dir, ramp(f, 56, 5, EASE.smooth));
  if (f <= 83) return mix(UF - 23 * dir, UT + 24 * dir, SPRINT((f - 61) / 22));
  if (f >= 110) return UT;
  return mix(UT + 24 * dir, UT, spring({ frame: f - 83, fps: 30, config: { stiffness: SET_STIFF, damping: SET_DAMP, mass: 1 } }));
};

// so tieng Viet: dau cham ngan cach hang nghin, dau phay thap phan
const parseNum = (t: string) => {
  const c = String(t).replace(/\s/g, '');
  const m = /-?[0-9.,]+/.exec(c);
  if (!m) return NaN;
  let x = m[0];
  if (/,\d{1,2}$/.test(x) || (x.includes(',') && x.includes('.') && x.lastIndexOf(',') > x.lastIndexOf('.'))) x = x.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(x) && !/\.\d{1,2}$/.test(x)) x = x.replace(/\./g, '');
  else x = x.replace(/,/g, '');
  return parseFloat(x);
};
const decOf = (t: string) => {
  const m = /[.,](\d{1,2})$/.exec(String(t).trim().replace(/[^0-9.,]/g, ''));
  return m ? m[1].length : 0;
};
const fmt = (x: number, dec: number) => {
  const neg = x < 0;
  const [i, d] = Math.abs(x).toFixed(dec).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + g + (d ? ',' + d : '');
};
// buoc vach "dep" gan nhat voi span / 28
const niceStep = (span: number) => {
  const raw = Math.max(1e-6, span / 28);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  let best = p;
  for (const m of [1, 2, 2.5, 5, 10]) if (Math.abs(Math.log((m * p) / raw)) < Math.abs(Math.log(best / raw))) best = m * p;
  return best;
};

// chu "troi len" tung tu / tung ky tu — mat na co dem tren 0.32em / duoi 0.26em (dau tieng Viet chong tang khong bi cat)
const Rise: React.FC<{ text: string; start: number; each: number; gap: number; by: 'word' | 'char' }> = ({ text, start, each, gap, by }) => {
  const frame = useCurrentFrame();
  const units = by === 'word' ? text.split(/(\s+)/) : Array.from(text.normalize('NFC'));
  let k = 0;
  return (
    <span style={{ whiteSpace: 'pre' }}>
      {units.map((u, i) => {
        if (/^\s+$/.test(u)) return <span key={i}>{u}</span>;
        const p = EASE.snappy(Math.max(0, Math.min(1, (frame - start - k++ * gap) / each)));
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.03em 0.26em', margin: '-0.32em -0.03em -0.26em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{u}</span>
          </span>
        );
      })}
    </span>
  );
};

export const TapeScrollFixedPointer: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'khung hình / giờ');
  const title = useText('title', 'Hiệu suất');
  const title2 = useText('title2', 'tăng gấp ba.');
  const fromT = useText('from', '140');
  const toT = useText('to', '420');
  const unit = useText('unit', 'k').trim();
  const oldLabel = useText('old_label', 'Giới hạn cũ');
  const newLabel = useText('new_label', 'Giới hạn mới');
  const changeT = useText('change', '');

  // ── so -> bang cuon ──
  let A = parseNum(fromT);
  let B = parseNum(toT);
  if (!Number.isFinite(A)) A = 140;
  if (!Number.isFinite(B)) B = A * 3;
  if (B === A) B = A + 1;
  const STEP = niceStep(Math.abs(B - A));
  const u = (r: number) => (r / STEP) * 10;
  const UF = u(A);
  const UT = u(B);
  const dir = UT >= UF ? 1 : -1;
  const dec = Math.max(decOf(fromT), decOf(toT));
  const tickDec = Number.isInteger(5 * STEP) ? 0 : (5 * STEP).toString().split('.')[1]?.length ?? 1;
  const allPos = Math.min(A, B) >= 0;
  const realOf = (uu: number) => (uu * STEP) / 10;

  const pre = allPos && dir > 0 ? Math.max(30, Math.min(80, UF * 0.8)) : 80;
  const v = valueAt(frame, UF, UT, dir, pre);
  const vy = velocity((f) => valueAt(f, UF, UT, dir, pre) * PXU, frame); // 刻度带速度（px/帧）
  const speed = Math.abs(vy);
  const yOf = (uu: number) => CY + (v - uu) * PXU; // 单位 u 的屏幕 y（大数在上）
  const readout = frame >= 110 ? fmt(B, dec) : fmt(allPos ? Math.max(0, realOf(v)) : realOf(v), dec);

  // 读数窗字号：按最宽读数缩放
  const unitW = unit ? measureText(unit, fonts.sans, 48, 600) + 10 : 0;
  const widest = [fmt(realOf(UF - pre * dir), dec), fmt(realOf(UT + 24 * dir), dec), fmt(B, dec)].reduce((a, b) => (b.length > a.length ? b : a), '');
  const readSize = fitSize(widest, { family: fonts.sans, size: 128, maxWidth: WIN_W - 48 - 30 - unitW, weight: 700, minSize: 56, letterSpacingEm: -0.04 });
  const tickSize = fitSize(fmt(realOf(Math.max(Math.abs(UF), Math.abs(UT)) + 130), tickDec), { family: fonts.sans, size: 64, maxWidth: 270, weight: 600, minSize: 34 });
  const lblMax = 1920 - (TAPE_X + TAPE_W + 28) - 40;
  const oldSize = fitSize(oldLabel.toUpperCase(), { family: fonts.sans, size: 32, maxWidth: lblMax, weight: 600, minSize: 20, letterSpacingEm: 0.1 });
  const newSize = fitSize(newLabel.toUpperCase(), { family: fonts.sans, size: 32, maxWidth: lblMax, weight: 700, minSize: 20, letterSpacingEm: 0.1 });

  // 刻度（只画视野内的）
  const ticks: React.ReactNode[] = [];
  const uMin = Math.floor((v - 130) / 10) * 10;
  for (let uu = allPos ? Math.max(0, uMin) : uMin; uu <= v + 130; uu += 10) {
    const y = yOf(uu);
    const major = Math.round(uu) % 50 === 0;
    ticks.push(
      <div key={`t${uu}`} style={{
        position: 'absolute', left: TICK_R - (major ? 150 : 70), top: y - (major ? 2 : 1), width: major ? 150 : 70, height: major ? 4 : 2,
        borderRadius: 2, background: major ? L.ink : alpha(L.ink, 0.32),
      }} />,
    );
    if (major) {
      // 数字滑到读数窗背后前淡出（不从窗沿露出半截）
      const near = Math.min(1, Math.max(0, (Math.abs(y - CY) - WIN_H / 2 - 36) / 30));
      ticks.push(
        <div key={`n${uu}`} style={{ opacity: near,
          position: 'absolute', left: NUM_R - 290, width: 290, top: y - 40, height: 80, lineHeight: '80px', textAlign: 'right', whiteSpace: 'nowrap',
          ...type(tickSize, 600), letterSpacing: '-0.03em', color: alpha(L.ink, 0.82),
        }}>{fmt(realOf(uu), tickDec)}</div>,
      );
    }
  }

  // 旧上限线：52f 断开淡出（两半各自向外滑开）
  const brk = ramp(frame, 52, 14, EASE.out);
  const oldY = yOf(UF);
  // 新上限 bug：随带滚动，落定后 bug 与指针重合时亮起
  const newY = yOf(UT);
  const locked = ramp(frame, 104, 10, EASE.out);

  const head = ramp(frame, 0, 20, EASE.snappy);
  const push = 1 + 0.025 * ramp(frame, 90, 60, EASE.smooth);
  const readBlur = Math.min(6, speed * 0.06);
  const chip = ramp(frame, 108, 14, EASE.overshoot);
  const recap = ramp(frame, 114, 16, EASE.out);
  const glowK = Math.min(1, speed / 60); // 冲刺时读数窗的钴蓝外发光

  // chip: o chu `change`, trong -> tu tinh % thay doi
  const pct = A !== 0 ? ((B - A) / Math.abs(A)) * 100 : 0;
  const change = changeT.trim() || (A !== 0 ? `${pct >= 0 ? '▲' : '▼'} ${fmt(Math.abs(pct), Math.abs(pct) < 10 && Math.abs(pct - Math.round(pct)) > 0.05 ? 1 : 0)}%` : '');
  const us = unit && /[\p{L}]{2,}/u.test(unit) ? ` ${unit}` : unit;
  const recapText = `${fmt(A, dec)}${us} → ${fmt(B, dec)}${us}`;

  // ── bo cuc chu ──
  const brandName = BRAND.name;
  const kick = [brandName, kicker].filter((x) => x && x.trim()).join(' · ');
  const colW = portrait ? 1620 : 790;
  const H1 = portrait ? 210 : 124;
  const t1 = wrapLines(title, fonts.sans, H1, colW, 750, 2);
  const t2 = title2.trim() ? wrapLines(title2, fonts.sans, H1, colW, 750, 2) : [];
  const hSize = Math.min(...[...t1, ...t2].map((l) => fitSize(l, { family: fonts.sans, size: H1, maxWidth: colW, weight: 750, minSize: portrait ? 96 : 60 })));
  const lineH = hSize * 1.14;
  const kSize = fitSize(kick.toUpperCase(), { family: fonts.sans, size: portrait ? 44 : 26, maxWidth: colW - (portrait ? 80 : 52), weight: 650, minSize: portrait ? 28 : 18, letterSpacingEm: 0.24 });
  const chipS = portrait ? 1.6 : 1;
  const blockH = (kick ? kSize * 1.4 + 34 * chipS : 0) + (t1.length + t2.length) * lineH + 40 * chipS + 60 * chipS;
  const textTop = portrait ? Math.round(Math.max(170, SH * 0.075)) : Math.round(540 - blockH / 2 + 10);
  const textLeft = portrait ? 150 : 150;
  // cum bang cuon: khung doc -> phong to K, dat giua phan con lai ben duoi chu
  const K = portrait ? 1.7 : 1;
  const clusterCX = 1390; // tam ngang cum (cua so -> nhan)
  const tapeCY = portrait ? Math.round((textTop + blockH + 120 + SH) / 2) : CY;
  const tapeTf = portrait ? `translate(${(960 - clusterCX).toFixed(1)}px, ${(tapeCY - CY).toFixed(1)}px) scale(${K})` : undefined;
  const t1Words = t1.join(' ').split(/\s+/).length;
  // [Agent Edit] DOT 2: chu nam truc tiep tren nen anh AI (tieu de trai, so / nhan cua bang cuon) -> bong sang nhe
  const halo = useBackdrop() ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.68, y: portrait ? 0.55 : 0.3 }} fill={null} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: tapeTf, transformOrigin: `${clusterCX}px ${CY}px` }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(4)})`, transformOrigin: '62% 50%' }}>
        {/* ── 世界层：刻度带（整体在动）── */}
        <div style={{
          position: 'absolute', left: TAPE_X, top: 0, width: TAPE_W, height: 1080,
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)',
        }}>
          {/* 带面：微渐变白 + 左右发丝线 */}
          <div style={{
            position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${alpha('#ffffff', 0.35)} 0%, ${alpha('#ffffff', 0.85)} 60%, ${alpha('#ffffff', 0.6)} 100%)`,
            borderLeft: `1px solid ${L.line}`, borderRight: `1px solid ${L.line}`,
          }} />
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          WebkitMaskImage: 'linear-gradient(180deg, transparent 2%, #000 24%, #000 76%, transparent 98%)',
          maskImage: 'linear-gradient(180deg, transparent 2%, #000 24%, #000 76%, transparent 98%)',
          textShadow: halo,
        }}>
          <SpeedBlur vx={0} vy={vy} amount={0.12} max={12}>
            {ticks}
            {/* 旧上限：虚线 + 标签，升级后断开 */}
            {brk < 1 && oldY > -40 && oldY < 1120 && (
              <>
                <div style={{
                  position: 'absolute', left: TAPE_X - 10 - brk * 80, top: oldY - 1.5, width: TAPE_W / 2 + 10, height: 3, opacity: 1 - brk,
                  backgroundImage: `repeating-linear-gradient(90deg, ${L.ink2} 0 14px, transparent 14px 24px)`,
                }} />
                <div style={{
                  position: 'absolute', left: TAPE_X + TAPE_W / 2 + brk * 80, top: oldY - 1.5, width: TAPE_W / 2 - 16, height: 3, opacity: 1 - brk,
                  backgroundImage: `repeating-linear-gradient(90deg, ${L.ink2} 0 14px, transparent 14px 24px)`,
                }} />
                <div style={{
                  position: 'absolute', left: TAPE_X + TAPE_W + 28, top: oldY - 22, opacity: 1 - brk, whiteSpace: 'nowrap',
                  ...type(oldSize, 600), letterSpacing: '0.1em', color: L.ink2,
                }}>{oldLabel.toUpperCase()}</div>
              </>
            )}
            {/* 新上限 bug：钴蓝三角，贴在刻度右缘 */}
            {newY > -60 && newY < 1140 && (
              <>
                <svg width={44} height={56} style={{ position: 'absolute', left: TICK_R + 6, top: newY - 28, overflow: 'visible' }}>
                  <path d="M 4 28 L 40 6 L 40 50 Z" fill={L.accent} stroke={L.accent} strokeWidth={6} strokeLinejoin="round" />
                </svg>
                <div style={{
                  position: 'absolute', left: TAPE_X + TAPE_W + 28, top: newY - 22, whiteSpace: 'nowrap',
                  ...type(newSize, 700), letterSpacing: '0.1em', color: L.accent,
                  opacity: 0.55 + 0.45 * locked,
                }}>{newLabel.toUpperCase()}</div>
              </>
            )}
          </SpeedBlur>
        </div>

        {/* ── 固定层：读数窗 + 指针缺口（针不动）── */}
        <div style={{
          position: 'absolute', left: WIN_X, top: CY - WIN_H / 2, width: WIN_W, height: WIN_H, borderRadius: 26,
          background: `linear-gradient(180deg, ${L.accent} 0%, #2448d8 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 24px 50px -16px ${alpha(L.shadow, 0.45)}, 0 4px 10px ${alpha(L.shadow, 0.16)}, 0 0 ${(30 + 50 * glowK).toFixed(1)}px ${alpha(L.accent, 0.18 + 0.32 * glowK)}`,
          overflow: 'hidden', opacity: head,
        }}>
          {/* 窗内读数（冲刺时按速度纵向模糊） */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end',
            paddingRight: 48, paddingTop: 10, boxSizing: 'border-box', color: L.onAccent, whiteSpace: 'nowrap',
          }}>
            <span style={{ ...type(readSize, 700), letterSpacing: '-0.04em', lineHeight: '140px', filter: readBlur > 0.4 ? `blur(${readBlur.toFixed(2)}px)` : undefined }}>
              {readout}
            </span>
            {unit ? <span style={{ ...type(48, 600), marginLeft: 10, opacity: 0.75, whiteSpace: 'nowrap' }}>{unit}</span> : null}
          </div>
          {/* 窗面上沿高光 */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%', background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0))' }} />
        </div>
        {/* 指针：读数窗右侧伸向刻度的钴蓝细针 + 三角 */}
        <div style={{ position: 'absolute', left: WIN_X + WIN_W - 2, top: CY - 2, width: TICK_R - (WIN_X + WIN_W) + 2, height: 4, background: L.accent, opacity: head, borderRadius: 2 }} />
        <svg width={40} height={44} style={{ position: 'absolute', left: WIN_X + WIN_W - 6, top: CY - 22, overflow: 'visible', opacity: head }}>
          <path d="M 2 4 L 30 22 L 2 40 Z" fill={L.accent} stroke={L.accent} strokeWidth={4} strokeLinejoin="round" />
        </svg>
      </div>

      </div>

      {/* ── 左侧排版 ── */}
      <div style={{ position: 'absolute', left: textLeft, top: textTop, width: colW, textShadow: halo }}>
        {kick ? (
          <div style={{ ...type(kSize, 650), letterSpacing: '0.24em', color: L.accent, opacity: head, display: 'flex', alignItems: 'center', gap: 16 * chipS, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
            {/* [Agent Edit] DOT 2: cham tron thay vach ngang (doc nhu dau gach "—") */}
            <span style={{ width: 12 * chipS, height: 12 * chipS, background: L.accent, borderRadius: 999, flex: 'none' }} />
            <span>
              {brandName ? <span style={{ fontFamily: BRAND.font, fontWeight: 700, letterSpacing: '0.03em' }}>{brandName}</span> : null}
              {brandName && kicker.trim() ? ' · ' : ''}
              {kicker.toUpperCase()}
            </span>
          </div>
        ) : null}
        <div style={{ marginTop: kick ? 34 * chipS : 0 }}>
          {t1.map((l, i) => (
            <div key={i} style={{ ...type(hSize, 750), lineHeight: `${lineH}px`, color: L.ink, whiteSpace: 'nowrap' }}>
              <Rise text={l} by="word" start={2 + i * 8} each={18} gap={Math.min(5, 20 / Math.max(1, t1Words))} />
            </div>
          ))}
          {t2.map((l, i) => (
            <div key={`b${i}`} style={{ ...type(hSize, 750), lineHeight: `${lineH}px`, color: L.accent, whiteSpace: 'nowrap' }}>
              <Rise text={l} by="char" start={98 + i * 6} each={14} gap={Math.min(1.6, 14 / Math.max(1, l.length))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 40 * chipS, height: 60 * chipS, display: 'flex', alignItems: 'center', gap: 24 * chipS }}>
          {change ? (
            <div style={{
              height: 60 * chipS, padding: `0 ${24 * chipS}px`, borderRadius: 30 * chipS, display: 'flex', alignItems: 'center', background: alpha(L.accent2, 0.12),
              border: `${chipS > 1 ? 2 : 1}px solid ${alpha(L.accent2, 0.35)}`, color: '#00866f', ...type(34 * chipS, 700), whiteSpace: 'nowrap',
              opacity: Math.min(1, chip * 1.5), transform: `scale(${mix(0.6, 1, chip).toFixed(4)})`, transformOrigin: '0% 50%',
            }}>{change}</div>
          ) : null}
          <div style={{ ...type(36 * chipS, 500), fontVariantNumeric: 'tabular-nums', color: L.ink2, opacity: recap, transform: `translateX(${mix(-16, 0, recap).toFixed(2)}px)`, whiteSpace: 'nowrap' }}>
            {recapText}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
