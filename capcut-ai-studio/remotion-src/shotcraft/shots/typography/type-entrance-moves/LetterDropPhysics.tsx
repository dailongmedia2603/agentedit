// 字符坠落堆积（letter-drop-physics）——FallingLetterAnimation。
// 品牌名 "Shotcraft"（BRAND.short）9 字符按字体自然字宽排成一行（flex 布局只管槽位，所有运动走 transform 不改排版），
// 第 i 字符从帧 4+36·(1−(1−i/8)^1.5) 起下落（间隔 6.5→1.6f 越来越密，R2 硬加速）：
// ① 重力加速 y = D*(t/24)^2 掉 720px 到地面，下落中按速度纵向拉伸 + 竖向运动模糊；
// ② 落地后 2 次衰减弹跳（高度 30% / 9%，抛物线 4u(1-u) 拼段），每次触地挤压（squash）
//    并阻尼回弹；落地瞬间 rotate 到 seed hash ±6° 小歪角并保持（歪歪扭扭站定）；
//    每个字符脚下一枚接触影：离地越高越大越虚越淡，落地收成小而实的一抹；
// ③ 帧 110 一拍：先 2f 吸气撑到 1.06，再 6f ease-out 全体齐整回正（rotate→0、错位→0、
//    scale 1.06→1），副标题「Every shot lands on the beat.」随后浮出；帧 116–150 真静止（≥34f）收尾。
//
// [Agent Edit] o chu: word (tu / cum tu roi xuong, 1-3 tu) + subtitle (cau phu hien sau nhip "dung nghiem").
// Toa do do theo SF Pro cua ban goc (BASE 0.886em, nua be ngang 48px) -> do lai bang font that (measureText + canvas
// fontBoundingBox) cho chu tieng Viet bat ky. Chu IN HOA (nhan ngan): tieng Viet thuong co nhieu chu chan dai g/y/p/q
// se "cam" vao mat dat (已知坑) — in hoa chi con dau nang nho duoi chan. Tu dai -> tu thu nho / xuong 2 hang (moi hang mot
// mat dat rieng); nhip roi tinh tren TONG so ky tu, giu khung 4 -> 40 cua ban goc. Quang roi = tu mep tren khung xuong
// mat dat (khung doc cao hon -> roi tu xa hon), bat nay giu ti le 30% / 9%.
// Khung doc (portrait.mode = 'native'): chu to (~280px san khau), khoi chu + cau phu can giua theo chieu doc.
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, measureText, wrapLines } from '../../../runtime';
import React from 'react';

import { G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, Grain, SpeedBlur, mix, ramp, tracking } from '../../../fixtures/Polish';

export const LETTER_DROP_PHYSICS_DURATION = 150;

// 确定性伪随机
const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};

const PAD = 200; // 运动模糊层外扩
const T_FALL = 24; // 落到地面用时
const T_B1 = 16; // 第一次弹跳时长（高 30%）
const T_B2 = 8; // 第二次弹跳时长（高 9%）
const SNAP = 110; // 齐整回正的一拍
const SNAP_DUR = 6;
const WEIGHT = 800;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// 单字符纵向位移（相对地面，负 = 在上方）
const dropY = (t: number, DROP: number): number => {
  if (t <= 0) return -DROP;
  if (t < T_FALL) return -DROP + DROP * (t / T_FALL) ** 2; // 重力加速
  if (t < T_FALL + T_B1) {
    const u = (t - T_FALL) / T_B1;
    return -DROP * 0.3 * 4 * u * (1 - u); // 弹跳 1：30%
  }
  if (t < T_FALL + T_B1 + T_B2) {
    const u = (t - T_FALL - T_B1) / T_B2;
    return -DROP * 0.09 * 4 * u * (1 - u); // 弹跳 2：9%
  }
  return 0;
};

// 触地挤压量：三次触地（落地 / 一跳落 / 二跳落）各给一次阻尼振荡，强度 1 / 0.45 / 0.18
const IMPACTS: [number, number][] = [
  [T_FALL, 1],
  [T_FALL + T_B1, 0.45],
  [T_FALL + T_B1 + T_B2, 0.18],
];
const squashAt = (t: number) => {
  let s = 0;
  for (const [t0, k] of IMPACTS) {
    const d = t - t0;
    if (d < 0 || d > 16) continue;
    s += k * Math.exp(-d / 2.6) * Math.cos(d * 0.85);
  }
  return s;
};

// 基线位置：lineHeight 1 的行盒顶 → 基线（按真实字体度量，代替 SF Pro 实测 0.886em）
let metricCtx: CanvasRenderingContext2D | null = null;
const baselineRatio = (family: string, weight: number): number => {
  if (!metricCtx && typeof document !== 'undefined') metricCtx = document.createElement('canvas').getContext('2d');
  if (!metricCtx) return 0.9;
  metricCtx.font = `${weight} 100px ${family}`;
  const m = metricCtx.measureText('HĐỘg');
  const A = m.fontBoundingBoxAscent;
  const D = m.fontBoundingBoxDescent;
  if (!A || !D) return 0.9;
  return ((100 - (A + D)) / 2 + A) / 100;
};

export const LetterDropPhysics: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const FAM = fonts.sans;
  const portrait = SH > 1080 * 1.2;
  const word = useText('word', 'Bùng nổ').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('vi');
  const subtitle = useText('subtitle', 'Mọi thứ đều rơi đúng nhịp.').trim();

  // ── 排版：一行放得下就一行；放不下再按词拆两行（各自一条地面）──
  const MAXW = portrait ? 1680 : 1640;
  const MAX = portrait ? 290 : 176;
  const ls = (size: number) => parseFloat(tracking(size, true)) * size; // 字距 px
  const rowW = (s: string, size: number) => measureText(s, FAM, size, WEIGHT) + Math.max(0, Array.from(s).length - 1) * ls(size);
  const fitRow = (s: string) => Math.min(MAX, MAX * (MAXW / Math.max(1, rowW(s, MAX))));
  let rows = [word];
  let SIZE = fitRow(word);
  const words = word.split(' ');
  if (words.length > 1 && SIZE < MAX * 0.82) {
    let best = { rows: [word], size: SIZE };
    for (let k = 1; k < words.length; k++) {
      const r = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
      const s = Math.min(fitRow(r[0]), fitRow(r[1]));
      if (s > best.size) best = { rows: r, size: s };
    }
    rows = best.rows;
    SIZE = best.size;
  }
  SIZE = Math.floor(SIZE);
  const BASE = Math.round(SIZE * baselineRatio(FAM, WEIGHT));
  const ROW_GAP = Math.round(SIZE * 1.32); // 两行地面间距（含越南语叠加声调的上方空间）
  const SUB = portrait ? 74 : 38;
  const subLines = subtitle ? wrapLines(subtitle, FAM, SUB, MAXW, 500, 2) : [];
  const subGap = portrait ? 120 : 70;
  // 竖向：landscape 单行保持原版地面 600；其余以「字块 + 副标题」整块居中
  const blockH = SIZE * 0.95 + (rows.length - 1) * ROW_GAP + (subLines.length ? subGap + subLines.length * SUB * 1.3 : 0);
  const firstFloor = !portrait && rows.length === 1 ? 600 : Math.round(SH / 2 - blockH / 2 + SIZE * 0.95);
  const floors = rows.map((_, r) => firstFloor + r * ROW_GAP);
  const lastFloor = floors[floors.length - 1];

  // 字符槽位：按真实字宽排开（每行居中），运动只走 transform
  const glyphs: { ch: string; x: number; w: number; row: number; i: number }[] = [];
  let gi = 0;
  rows.forEach((r, ri) => {
    const chars = Array.from(r);
    const L = ls(SIZE);
    const widths = chars.map((c) => measureText(c, FAM, SIZE, WEIGHT));
    // 用整串宽度（含字偶距）摊回各槽，避免逐字宽累加的误差
    const total = rowW(r, SIZE);
    const sum = widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * L;
    const k = sum > 0 ? total / sum : 1;
    let x = (1920 - total) / 2;
    chars.forEach((c, ci) => {
      const w = widths[ci] * k;
      if (c !== ' ') glyphs.push({ ch: c, x, w, row: ri, i: gi++ });
      x += w + L * k;
    });
  });
  const n = glyphs.length;
  // 起跳帧：非等差错峰，越来越密（首末字固定 4f / 40f）
  const startOf = (i: number) => (n <= 1 ? 4 : 4 + 36 * (1 - Math.pow(1 - i / (n - 1), 1.5)));

  // 帧 110 回正：108–110 吸气撑起，110–116 ease-out 回落
  const inhale = ramp(frame, SNAP - 2, 2, EASE.out);
  const snap = ramp(frame, SNAP, SNAP_DUR, EASE.snappy);
  const snapRot = ramp(frame, SNAP, SNAP_DUR + 2, EASE.overshoot); // 歪角回正带一点过冲
  const pulse = 0.06 * inhale * (1 - snap);
  // 副标题：回正后浮出
  const sub = ramp(frame, SNAP + 4, 18, EASE.out);
  // [Agent Edit] nen anh AI: bo nen sang, mat ban mo va hat (giu vach mat dat cho chu dung); chu co bong sang
  const bd = useBackdrop();
  const TSH = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;

  return (
    <div style={{ width: 1920, height: SH, overflow: 'hidden', position: 'relative', fontFamily: FAM }}>
      {!bd && <Backdrop tone="light" light={{ x: 0.5, y: 0.16 }} grain={0} vignette={0.16} />}

      {/* 地面：最后一行地平线以下一块向下渐深的台面 + 每行一条两端淡出的发丝地平线 */}
      {!bd && <div style={{
        position: 'absolute', left: 0, right: 0, top: lastFloor, bottom: 0,
        background: 'linear-gradient(180deg, rgba(40,42,52,0.035) 0%, rgba(40,42,52,0.012) 30%, rgba(40,42,52,0) 64%)',
      }} />}
      {floors.map((fy, r) => (
        <React.Fragment key={r}>
          <div style={{
            position: 'absolute', left: 160, right: 160, top: fy, height: 1,
            background: 'linear-gradient(90deg, rgba(20,22,28,0) 0%, rgba(20,22,28,0.16) 22%, rgba(20,22,28,0.16) 78%, rgba(20,22,28,0) 100%)',
          }} />
          <div style={{
            position: 'absolute', left: 160, right: 160, top: fy + 1, height: 1,
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.7) 70%, rgba(255,255,255,0) 100%)',
          }} />
        </React.Fragment>
      ))}

      {glyphs.map(({ ch, x, w, row, i }) => {
        const floorY = floors[row];
        const DROP = Math.max(720, floorY + SIZE * 0.3); // 从画面上缘外落下
        const t = frame - startOf(i);
        const y = dropY(t, DROP);
        const vy = dropY(t + 0.5, DROP) - dropY(t - 0.5, DROP);
        const air = -y; // 离地高度
        // 落地瞬间歪到 seed 小角度（±6°），落地前为 0；snap 一拍齐整归零
        const tiltTarget = (h(i + 1) - 0.5) * 12;
        const landP = EASE.out(clamp01((t - T_FALL) / 6));
        const rot = tiltTarget * landP * (1 - snapRot);
        // 歪着站 = 一个底角着地：按歪角把字抬起 sin|θ|·半字宽，底角始终贴地不穿地面
        const jitter = -Math.sin((Math.abs(rot) * Math.PI) / 180) * (w / 2);
        // 拉伸（下落速度）+ 挤压（触地），保体积：scaleX ≈ 1/scaleY（速度按落差归一，保持与原版同样的拉伸量）
        const stretch = Math.min(1, Math.abs(vy) / (60 * (DROP / 720))) * 0.1 * (t < T_FALL ? 1 : 0.6);
        const sq = squashAt(t);
        const sy = (1 + stretch) * (1 - 0.2 * sq) + pulse;
        const sx = (1 - stretch * 0.55) * (1 + 0.15 * sq) + pulse;
        // 接触影：贴地小而实，离地大而虚而淡；未入画时几乎不可见
        const lift = clamp01(air / (420 * (SIZE / 176)));
        const shOp = (t < 0 ? 0 : 0.2) * (1 - lift * 0.85) * clamp01((t + 2) / 8);
        const shW = mix(0.74, 1.3, lift) * (1 + 0.12 * Math.max(0, sq));
        const shBlur = mix(7, 28, lift) * (SIZE / 176);
        const top = floorY - BASE;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top, width: w, height: SIZE }}>
            {/* 接触影 */}
            <div style={{
              position: 'absolute', left: '50%', top: BASE - 7 * (SIZE / 176), width: '84%', height: 14 * (SIZE / 176),
              transform: `translateX(-50%) scaleX(${shW.toFixed(3)})`,
              borderRadius: '50%', background: 'rgba(22,24,34,1)',
              opacity: shOp, filter: `blur(${shBlur.toFixed(1)}px)`,
            }} />
            {/* 运动层：位移在外，模糊随之移动（下落段全量、弹跳段减半，防触地时糊成一团）；挤压 / 歪角绕触地点 */}
            <div style={{
              position: 'absolute', left: -PAD, right: -PAD, top: -PAD, bottom: -PAD,
              transform: `translateY(${(y + jitter).toFixed(2)}px)`,
            }}>
              <SpeedBlur vx={0} vy={vy * (720 / DROP)} amount={t < T_FALL ? 0.26 : 0.12} max={16}>
                <div style={{
                  position: 'absolute', left: PAD, right: PAD, top: PAD, bottom: PAD, textAlign: 'center',
                  fontSize: SIZE, fontWeight: WEIGHT, lineHeight: 1, color: G.ink1, whiteSpace: 'pre', textShadow: TSH,
                  transform: `rotate(${rot.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
                  transformOrigin: `50% ${((BASE / SIZE) * 100).toFixed(1)}%`,
                }}>
                  {ch}
                </div>
              </SpeedBlur>
            </div>
          </div>
        );
      })}

      {/* 副标题：回正一拍后的句号 */}
      {subLines.map((l, k) => (
        <div key={k} style={{
          position: 'absolute', left: 0, right: 0, top: lastFloor + subGap + k * SUB * 1.3, textAlign: 'center',
          fontSize: SUB, fontWeight: 500, letterSpacing: tracking(SUB), color: G.ink2, lineHeight: 1.3, textShadow: TSH,
          opacity: sub, transform: `translateY(${((1 - sub) * 10).toFixed(2)}px)`,
        }}>
          {l}
        </div>
      ))}

      {!bd && <Grain opacity={0.05} />}
    </div>
  );
};
