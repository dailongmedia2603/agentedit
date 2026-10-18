// value-stagger-gradient — Value Stagger 数值梯度（motion-lab 定稿转原生 Remotion）
// stagger 不只错开时间，还把属性值在 N 个元素上铺成梯度：16 根柱入场时
// delay=stagger(时间)，同时高度/色相/模糊都是 stagger([from,to]) 的数值梯度；
// 第二拍换 from:'center'，脉冲幅度以中心为原点重新铺开。
// 设计坐标 480×270（放大 4 倍到 1920 宽），参数表数值以此坐标系标定。
// 质感改版：
// - 柱子改用 height 生长（底部锚定）而非 scaleY，圆角不再被压扁；顶部受光高光 + 地面倒影 + 基线刻度；
// - 字幕条（≥38px 输出字高），两拍之间上下交叉换句，不再硬切；
// - 柱群与字幕条整体居中构图；带色相的深底 + 柱群下方柔光 + 暗角 + 颗粒（原生分辨率）。
//
// [Agent Edit] Chu "code anime.js" (ky thuat) -> 2 o chu co nghia: `title` (nhip 1, cot tran tu trai sang phai) va
// `title2` (nhip 2, xung tu giua — doi cau dung luc doi nhip; khong co -> giu title). Chu that dai ngan bat ky:
// tu xuong dong (ngang <= 2 dong, doc <= 3 dong) + thu nho vua khung; the chu tu gian theo chu.
// Khung doc (portrait.mode = 'native'): chu to hon, cot cao hon (giu ti le doc 92:32 = 2.9 lan), ca khoi can giua.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useShotFonts, useText, useVideoConfig, fitSize, wrapLines, measureText } from '../../../runtime';
import { E, lerp, seg, useT } from '../../../fixtures/Motion';
import { EASE, Grain, Vignette } from '../../../fixtures/Polish';

export const VALUE_STAGGER_GRADIENT_DURATION = 150; // 5000ms @30fps

// 数值梯度 util（等价 stagger([a,b]) 的 value 模式）
const staggerVal = (i: number, n: number, a: number, b: number, ease?: (x: number) => number) => {
  let k = n <= 1 ? 0 : i / (n - 1);
  if (ease) k = ease(k);
  return lerp(k, a, b);
};

const N = 16;
const C = (N - 1) / 2;
const BARS = Array.from({ length: N }, (_, i) => ({
  i,
  hue: staggerVal(i, N, 200, 320), // 数值梯度：色相铺开
  hMax: staggerVal(i, N, 92, 32), // 数值梯度：高度 1→0.35
  distC: Math.abs(i - C) / C,
}));

const Z = 4; // 设计 px → 舞台 px（480 → 1920）
const SWITCH = 0.52; // 两拍之间换字幕句

// 柱群：设计坐标（480 宽），k = 高度/位移放大倍数（竖屏更高），baseY = 基线（设计 px）
const Bars: React.FC<{ t: number; baseY: number; k: number }> = ({ t, baseY, k }) => (
  <>
    {/* 基线 + 刻度 */}
    <div style={{ position: 'absolute', left: '7%', right: '7%', top: baseY + 0.5, height: 0.3, background: 'rgba(255,255,255,0.12)', opacity: seg(t, 0.02, 0.1) }} />
    {BARS.map(({ i, hue, hMax, distC }) => {
      // 拍一：时间 stagger（linear from first）× 数值梯度（y/blur 同时铺开）
      const d = i * 0.02;
      const e = seg(t, 0.06 + d, 0.28 + d, E.outCubic);
      const y0 = staggerVal(i, N, 46, 14) * Math.sqrt(k); // 位移量本身也是梯度
      const b0 = staggerVal(i, N, 8, 2); // 模糊量梯度
      // 拍二：from:'center' —— 波与幅度都以中心为原点铺开
      const w = seg(t, 0.56 + distC * 0.13, 0.74 + distC * 0.13);
      const pulse = Math.sin(w * Math.PI);
      const amp = lerp(1 - distC, 0.06, 0.42); // 幅度梯度：中心最大
      const h = hMax * k * e * (1 + pulse * amp);
      const x = `${8 + i * 5.4}%`;
      const blur = (1 - e) * b0;
      const bright = 1 + pulse * 0.55;
      const body = `linear-gradient(180deg, hsl(${hue},80%,70%) 0%, hsl(${hue},72%,56%) 45%, hsl(${hue},66%,40%) 100%)`;
      return (
        <React.Fragment key={i}>
          {/* 刻度 */}
          <div style={{ position: 'absolute', top: baseY + 3, left: `${8 + i * 5.4 + 1.7}%`, width: 0.3, height: 2.5, background: 'rgba(255,255,255,0.18)', opacity: seg(t, 0.02, 0.1) }} />
          {/* 柱体（底部锚定，height 生长） */}
          <div
            style={{
              position: 'absolute',
              top: baseY - h,
              left: x,
              width: '3.4%',
              height: h,
              borderRadius: 4,
              background: body,
              boxShadow: `inset 0 0.5px 0 rgba(255,255,255,0.45), inset 0 0 0 0.25px rgba(255,255,255,0.10), 0 0 10px hsla(${hue},85%,58%,${(0.18 + pulse * 0.22).toFixed(3)})`,
              opacity: e,
              filter: `${blur > 0.02 ? `blur(${blur.toFixed(2)}px) ` : ''}brightness(${bright.toFixed(3)})`,
              transform: `translateY(${((1 - e) * y0).toFixed(3)}px)`,
              overflow: 'hidden',
            }}
          >
            {/* 左侧受光条 */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '34%', background: 'linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0))' }} />
          </div>
          {/* 地面倒影：翻转、渐隐、略糊 */}
          <div
            style={{
              position: 'absolute',
              top: baseY + 1.5,
              left: x,
              width: '3.4%',
              height: h * 0.45,
              borderRadius: 4,
              background: `linear-gradient(180deg, hsla(${hue},70%,52%,0.32), hsla(${hue},70%,40%,0))`,
              opacity: e * 0.8,
              filter: `blur(${(0.8 + blur).toFixed(2)}px) brightness(${bright.toFixed(3)})`,
              transform: `translateY(${((1 - e) * y0 * 0.4).toFixed(3)}px)`,
            }}
          />
        </React.Fragment>
      );
    })}
  </>
);

// 字幕一句：多行居中；末词用柱群同一道色相渐变（蓝→紫）做强调
const Caption: React.FC<{ lines: string[]; size: number; lineH: number; family: string; style: React.CSSProperties }> = ({ lines, size, lineH, family, style }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: family, fontSize: size, fontWeight: 600, lineHeight: `${lineH}px`, letterSpacing: '-0.01em', color: '#e9ecf7', whiteSpace: 'pre', ...style }}>
    {lines.map((l, li) => {
      const last = li === lines.length - 1;
      const sp = l.lastIndexOf(' ');
      const head = last && sp > 0 ? l.slice(0, sp + 1) : last ? '' : l;
      const tail = last ? (sp > 0 ? l.slice(sp + 1) : l) : '';
      return (
        <div key={li}>
          {head}
          {tail ? (
            <span style={{ background: 'linear-gradient(90deg, hsl(200,85%,70%), hsl(320,80%,72%))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{tail}</span>
          ) : null}
        </div>
      );
    })}
  </div>
);

export const ValueStaggerGradient: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const title = useText('title', 'Mỗi tháng tăng thêm một chút');
  const title2 = useText('title2', 'Và bùng nổ đúng lúc cao điểm');
  const portrait = SH > 1080 * 1.2;

  // 字幕条尺寸：按真实字宽折行 / 缩字
  const S0 = portrait ? 132 : 54;
  const maxW = portrait ? 1600 : 1440;
  const maxLines = portrait ? 4 : 2;
  const fit = (s: string) => {
    const lines = wrapLines(s, fonts.sans, S0, maxW, 600, maxLines);
    const size = Math.min(...lines.map((l) => fitSize(l, { family: fonts.sans, size: S0, maxWidth: maxW, weight: 600, minSize: S0 * 0.5 })));
    return { lines, size };
  };
  const capA = fit(title);
  const capB = title2.trim() ? fit(title2) : capA;
  const size = Math.min(capA.size, capB.size);
  const linesA = capA.lines;
  const linesB = capB.lines;
  // dau tieng Viet chong tang: gian dong 1.28, dem tren / duoi rong
  const lineH = Math.round(size * 1.28);
  const nLines = Math.max(linesA.length, linesB.length);
  const widest = Math.max(...[...linesA, ...linesB].map((l) => measureText(l, fonts.sans, size, 600)));
  const padX = Math.round(size * 0.9);
  const padY = Math.round(size * 0.42);
  const capW = Math.min(1840, widest + padX * 2);
  const capH = nLines * lineH + padY * 2;

  // 竖屏：柱更高（k 倍，比例不变），整块（字幕条 + 柱 + 倒影）垂直居中；横屏保持原版网格（基线 196 设计 px）
  const k = portrait ? 2.9 : 1;
  const barTop = 92 * k * 1.12 * Z; // 最高柱 + 脉冲余量（舞台 px）
  const gap = portrait ? 150 : 40;
  const blockH = capH + gap + barTop + 92 * k * 0.45 * Z;
  const capTop = portrait ? Math.round(SH / 2 - blockH / 2) : 0;
  const baseYStage = portrait ? capTop + capH + gap + barTop : 196 * Z;
  // 横屏若字幕两行，基线不动，字幕条向上让位
  const capTopL = portrait ? capTop : Math.max(70, Math.min(160, baseYStage - 92 * Z - 24 - capH));

  // 字幕条：入场淡入上浮；两拍间旧句上移淡出、新句自下而上替入（≈5f 交叉）
  const capIn = seg(t, 0.03, 0.12, EASE.out);
  const sw = title2.trim() ? seg(t, SWITCH - 0.018, SWITCH + 0.022, EASE.smooth) : 0;
  // 柱群下方的柔光随第一拍铺开、第二拍脉冲略增
  const pulseC = Math.sin(seg(t, 0.56, 0.74) * Math.PI);
  const glowY = portrait ? ((baseYStage - barTop * 0.35) / SH) * 100 : 66;
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #0e0f15 0%, #0a0b0f 100%)' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 46% ${portrait ? 22 : 34}% at 50% ${glowY.toFixed(1)}%, rgba(120,110,255,0.16), rgba(120,110,255,0) 70%)`,
          opacity: 0.35 + 0.65 * seg(t, 0.06, 0.5) + pulseC * 0.3,
        }}
      />
      {/* 柱群：设计坐标 ×4，基线对齐到舞台 baseYStage */}
      <div style={{ position: 'absolute', left: 0, top: baseYStage - 196 * Z, width: 480, height: 270, transform: `scale(${Z})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <Bars t={t} baseY={196} k={k} />
        </div>
      </div>
      {/* 字幕条 */}
      <div
        style={{
          position: 'absolute', left: (1920 - capW) / 2, top: capTopL, width: capW, height: capH, borderRadius: Math.min(28, size * 0.5),
          background: 'rgba(255,255,255,0.035)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
          overflow: 'hidden', opacity: capIn, transform: `translateY(${lerp(capIn, 16, 0).toFixed(3)}px)`,
        }}
      >
        <Caption lines={linesA} size={size} lineH={lineH} family={fonts.sans} style={{ top: padY + ((nLines - linesA.length) * lineH) / 2, opacity: 1 - sw, transform: `translateY(${(-sw * capH * 0.55).toFixed(3)}px)` }} />
        {title2.trim() ? (
          <Caption lines={linesB} size={size} lineH={lineH} family={fonts.sans} style={{ top: padY + ((nLines - linesB.length) * lineH) / 2, opacity: sw, transform: `translateY(${((1 - sw) * capH * 0.55).toFixed(3)}px)` }} />
        ) : null}
      </div>
      <Vignette strength={0.5} color="#000000" inner={0.45} />
      <Grain opacity={0.08} blend="soft-light" />
    </AbsoluteFill>
  );
};
