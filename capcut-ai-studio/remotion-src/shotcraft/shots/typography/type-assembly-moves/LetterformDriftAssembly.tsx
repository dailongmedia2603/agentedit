// 字形漂移合拢（letterform-drift-assembly）——Stranger Things 片头式入场。
// 品牌名 / 标题拆成字符：各自从不同方向（h(i) seeded 随机向量，
// 幅度 ±260–360px）带 blur 8px + opacity 0.35 缓慢漂入，错峰归位
// （delay i×3f，45f 行程，Easing.out(cubic)）。每字锁定瞬间给一次
// "加深脉冲"：字色 ink→#000→ink + 描边 0→3px→0（8f）——白底上
// 不用发光用加深（库判例）。全部合体后整词 scale 1→1.04→1 收束呼吸
// （判例：1.02 太弱，加码到 1.04）。
// 关键帧：0–24 各字错峰启程 → i 字 [i*3, i*3+45] 漂入归位 →
// 锁定帧 i*3+45 起 8f 加深脉冲（最后一字 69–77）→ 80–104 整词呼吸 →
// 104–150 全静止（46f，无逐帧滤镜）。
//
// 质感升级：去掉调试标题；柔光 Backdrop；系统 SF 栈 700、带色相的近黑墨色；
// 漂入除位移/blur/opacity 外再绑同一条 p 的旋转（±24°→0）与纵深缩放（1.22→1），
// 字是从镜头前的空间里飘回字面，而不是平面滑动；合体后字面下方浮出一层极淡的落地影。
// 补导出时长 150f（原工作台按 56f 推断，渲染止于半空）。
//
// [Agent Edit] o chu: title (ten thuong hieu / tu khoa / ten chuong — bo trong = ten thuong hieu cua video).
// Chu dai: tach dong theo tu (ngang <=2 dong, doc <=3 dong, co chu tu vua); bo trai 3f/ky tu nen lai khi nhieu ky tu
// (ky tu cuoi van khoa truoc ~f80), nhip "tho" + bong dat tinh theo ky tu cuoi. Khung doc (native): chu ~240px giua khung.
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, ramp } from '../../../fixtures/Polish';
import { BRAND } from '../../../fixtures/Brand';

export const LETTERFORM_DRIFT_ASSEMBLY_DURATION = 150;

const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};

const TRAVEL = 45; // 每字漂入行程帧数
const INK = [23, 24, 28]; // G.ink1 #17181c

// Xuong dong CAN DONG: giu so dong cua wrapLines nhung thu hep be ngang de cac dong dai gan bang nhau
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4, hi = maxW;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid; else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

export const LetterformDriftAssembly: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const given = useText('title', '');
  const WORD = (given || BRAND.name || 'Bứt Phá').trim(); // 片头式亮相落在品牌名 / 关键词上
  const size0 = portrait ? 300 : 148;
  const maxW = portrait ? 1640 : 1640;
  const lines0 = balanced(WORD, fonts.sans, size0, maxW, 700, portrait ? 3 : 2);
  const FS = Math.min(...lines0.map((l) => fitSize(l, { family: fonts.sans, size: size0, maxWidth: maxW, weight: 700, letterSpacingEm: 0.02, minSize: size0 * 0.4 })));
  const lines = balanced(WORD, fonts.sans, FS, maxW, 700, portrait ? 3 : 2);
  const n = lines.reduce((a, l) => a + Array.from(l).length, 0);
  const STAG = Math.min(3, 34 / Math.max(1, n - 1)); // 错峰间隔（字多时压密）
  const lastLock = (n - 1) * STAG + TRAVEL; // 原版 69
  const b0 = lastLock + 11; // 原版 80

  // 整词收束呼吸：放大到 1.04 再回落，之后恒 1 → 帧确定
  const breath =
    frame < b0 + 12
      ? interpolate(frame, [b0, b0 + 12], [1, 1.04], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
      : interpolate(frame, [b0 + 12, b0 + 24], [1.04, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  // 合体后落地影
  const ground = ramp(frame, lastLock - 6, 30, EASE.out);
  const lineH = FS * 1.22;
  const blockH = lines.length * lineH;
  const groundW = Math.min(1700, Math.max(...lines.map((l) => Array.from(l).length)) * FS * 0.62);
  let idx = 0;

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden' }}>
      <Backdrop tone="light" light={{ x: 0.5, y: 0.32 }} accent={G.accent} grain={0.05} vignette={0.14} />
      {/* 落地影：合体后在字面下方出现的极淡椭圆影 */}
      <div style={{
        position: 'absolute', left: 960 - groundW / 2, top: SH / 2 + blockH / 2 - FS * 0.05, width: groundW, height: FS * 0.48, borderRadius: '50%',
        background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(20,22,32,0.13), rgba(20,22,32,0) 70%)', opacity: ground, transform: `scale(${breath})`,
      }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${breath})` }}>
        {lines.map((ln, li) => (
          <div key={li} style={{ display: 'flex', height: lineH, alignItems: 'center', whiteSpace: 'pre' }}>
            {Array.from(ln).map((c) => {
              const i = idx++;
              const start = i * STAG;
              const lock = start + TRAVEL;
              // 漂入进度（位移 / blur / opacity / 旋转 / 纵深 共用一条 p）
              const p = interpolate(frame, [start, lock], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
              // seeded 起始向量：方向 h(i)，幅度 260–360px（khung doc phong theo co chu）
              const k = FS / 148;
              const ang = h(i + 1) * Math.PI * 2;
              const mag = (260 + h(i + 101) * 100) * Math.max(1, Math.min(1.5, k));
              const dx = Math.cos(ang) * mag * (1 - p);
              const dy = Math.sin(ang) * mag * (1 - p);
              const rot = (h(i + 201) - 0.5) * 48 * (1 - p);
              const depth = 1 + 0.22 * (1 - p);
              const blur = 8 * Math.max(1, k * 0.8) * (1 - p);
              const op = interpolate(p, [0, 1], [0.35, 1]);
              // 锁定加深脉冲：lock→lock+8，三角波 0→1→0
              const pulse = frame <= lock || frame >= lock + 8 ? 0 : frame < lock + 4 ? (frame - lock) / 4 : (lock + 8 - frame) / 4;
              const color = `rgb(${INK.map((v) => Math.round(v * (1 - pulse))).join(',')})`;
              const strokeW = 3 * Math.max(1, k * 0.8) * pulse;
              const settled = p >= 1 && pulse === 0;
              return (
                <span key={i} style={{
                  fontFamily: fonts.sans, fontWeight: 700, fontSize: FS, lineHeight: 1.22, letterSpacing: '0.02em',
                  color: settled ? G.ink1 : color, display: 'inline-block', whiteSpace: 'pre',
                  transform: settled ? undefined : `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${depth.toFixed(4)})`,
                  opacity: op, filter: blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : undefined,
                  WebkitTextStroke: strokeW > 0.01 ? `${strokeW.toFixed(2)}px #000` : undefined,
                }}>
                  {c}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
