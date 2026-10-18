// glass-pill-dictation-typing — Glass Pill Dictation 玻璃胶囊听写
// 一条定宽玻璃胶囊以约 1.25 倍略大浮现、缓落到位；胶囊内部自左淡到右浓铺一层暖光（"在等你开口"）；
// 光标先行，随后听写的句子匀速打出，光随打字进度渐渐退去，收尾成一条中性的磨砂玻璃条。
// 全片最安静的一拍：只做三件事——落位、打字、光退。
//
// 第二轮重设计（沙色日光 · 磨砂玻璃）：
// - look = sand（米色 + 赤陶）。从近黑底换成午后日光的亮场：胶囊背后是一轮暖色"太阳"和几团柔光，
//   胶囊用 backdrop-filter 真磨砂（背后的光被它晕开），顶沿白色高光线、上亮下暗的体积、暖色两层落地影。
// - 主体放大到"看得见材质"：1240×132 的胶囊、56px 听写字、92px 圆形声波按钮；画面只有胶囊 + 底部一枚品牌小标。
// - 光的因果做满三层，都挂在同一个 g（1→0）上：胶囊内的赤陶→杏色渐层、背后那轮暖光、胶囊下方的地面反光，
//   一起随打字退去；声波按钮从"实心暖色"退成"描边中性色"。
// - 曲线：落位 scale 1.25→1 用强 ease-out（snappy，20f），opacity 前 2f 就满（先"在了"再落位），
//   落位前半段带一点景深虚化（离镜头更近）；打字匀速 2f/字（听写不犹豫）；光退 smooth in-out。
//
// 时间表（30fps，共 100f）：
//   0–2      胶囊整体出现（opacity 满），光在最亮
//   0–20     落位：scale 1.25→1（snappy）+ 虚化 6px→0（前 14f）；2f 光标先行
//   8–64     打字：28 字匀速（2f/字）
//   10–72    光退：g 1→0（smooth），三层光与声波按钮同步
//   66–74    光标撤掉
//   74–100   hold：中性磨砂玻璃条 + 句子，环境光极缓呼吸
//
// [Agent Edit] o chu: prompt (cau nguoi dung noi/go vao o nhap — loi noi that) / caption (dong nho duoi, canh ten thuong hieu).
// Chu dai ngan bat ky: o nhap van DINH RONG (rong ≈ 1.8 lan be ngang cau, kep [1240, 1760]); cau qua dai -> xuong dong,
// o nhap cao them (bo goc toi da = nua chieu cao 1 dong); nhip go deu, tu nen theo so ky tu de go xong truoc 64f.
// Khung doc (native): chu to ~112px, o nhap rong 1720, cau tu xuong dong (toi da 4 dong), ca khoi can giua khung,
// quang sang phia sau phong to theo chieu cao.
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, ramp, mix } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const GLASS_PILL_DICTATION_TYPING_DURATION = 100;

const L = LOOKS.sand;
// 内嵌光：赤陶 → 杏色（换品牌色只改这两个）
const WARM = '#d9643a';
const APRICOT = '#ffb070';

const BARS = [30, 16, 24, 13, 20]; // 声波竖条基准高（左高右低的听写图标）
const TYPE0 = 8;
const TYPE_END = 64; // 打字窗口 8–64f（原版 28 字 × 2f）

const hexRgb = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (a: string, b: string, t: number) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

export const GlassPillDictationTyping: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  // nen anh AI: bo nen dac + cac dom sang vien canh; giu 'mat troi' am sau vien thuoc (la hieu ung, tat dan khi go chu)
  const bd = !!useBackdrop();
  const TEXT = useText('prompt', 'Dựng giúp tôi video ra mắt app');
  const caption = useText('caption', 'nói hoặc gõ');

  // ── 尺寸：竖屏整体放大（K），字号单独放大到手机上读得清 ──
  const K = portrait ? 1.4 : 1;
  const BTN = Math.round(92 * K);
  const PAD_L = Math.round(58 * K);
  const PAD_R = Math.round(20 * K);
  const ROW = Math.round(132 * K); // 单行胶囊高
  const FS0 = portrait ? 120 : 56;
  // 定宽：≈ 句宽 1.8 倍，夹在 [1240, 1760]（竖屏固定 1720）——不随打字伸缩
  const fullW = measureText(TEXT, fonts.sans, FS0, 500);
  const PW = portrait ? 1720 : Math.round(Math.min(1760, Math.max(1240, fullW * 1.8 + PAD_L + PAD_R + BTN)));
  const innerW = PW - PAD_L - PAD_R - BTN - Math.round(36 * K);
  const lines = wrapLines(TEXT, fonts.sans, FS0, innerW, 500, portrait ? 4 : 2);
  const FS = Math.min(FS0, ...lines.map((l) => fitSize(l, { family: fonts.sans, size: FS0, maxWidth: innerW, weight: 500, minSize: FS0 * 0.6 })));
  const LH = FS * 1.3; // 行高 ≥1.1：越南语叠加声调符号
  const PH = lines.length > 1 ? Math.round(lines.length * LH + 2 * Math.max((ROW - LH) / 2, FS * 0.42)) : ROW;
  const R = Math.min(PH / 2, ROW / 2); // 多行时圆角保持单行胶囊的圆角
  const PX = (1920 - PW) / 2;
  const CY = SH / 2;
  const PY = CY - PH / 2;

  const appear = ramp(f, 0, 2, EASE.linear);
  const land = ramp(f, 0, 20, EASE.snappy);
  const s = mix(1.25, 1, land);
  const defocus = 6 * (1 - ramp(f, 0, 14, EASE.out));
  const total = Array.from(TEXT).length;
  const n = Math.floor(Math.min(1, Math.max(0, (f - TYPE0) / (TYPE_END - TYPE0))) * total + 1e-6); // 匀速（epsilon 防末字不出）
  const caret = ramp(f, 2, 2, EASE.linear) * (1 - ramp(f, 66, 8, EASE.out));
  const g = 1 - ramp(f, 10, 62, EASE.smooth); // 光：随打字退去
  const breathe = 0.5 + 0.5 * Math.sin(f / 22);

  // 逐行切出已打出的字（光标跟在最后一个字后面）
  let used = 0;
  const typed = lines.map((l) => {
    const chars = Array.from(l);
    const take = Math.max(0, Math.min(chars.length, n - used));
    used += chars.length + 1; // +1 = 换行处的空格
    return chars.slice(0, take).join('');
  });
  let caretLine = 0;
  typed.forEach((t, i) => {
    if (t.length > 0) caretLine = i;
  });
  const G = portrait ? 1.6 : 1; // 背景光放大（竖屏填满纵向）
  const CAP = portrait ? 2.1 : 1; // 底部小标字号倍率

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.36, y: portrait ? 0.3 : 0.12 }} fill={{ x: 0.8, y: 0.9 }} vignette={0.22}>
        {/* 胶囊背后的"太阳"：暖光主体，光心压在胶囊右段正后方，跟胶囊内的光一起退到只剩一点余温 */}
        <div style={{
          position: 'absolute', left: PX + PW * 0.83, top: CY - 70, width: 1100 * G, height: 900 * G, marginLeft: -550 * G, marginTop: -450 * G, borderRadius: '50%',
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(APRICOT, 0.15 + 0.6 * g)} 0%, ${alpha(APRICOT, 0.1 + 0.42 * g)} 18%, ${alpha(WARM, 0.06 + 0.26 * g)} 40%, ${alpha(WARM, 0.02 + 0.08 * g)} 62%, ${alpha(WARM, 0)} 80%)`,
        }} />
        {/* 几团远景柔光（磨砂玻璃后面要有东西可晕） */}
        {!bd && [
          { x: 520, y: -70, r: 220, c: '#fff4e4', a: 0.9 },
          { x: 820, y: 80, r: 160, c: '#e9b08a', a: 0.35 },
          { x: 1460, y: 70, r: 200, c: '#f6d2a8', a: 0.55 },
          ...(portrait ? [
            { x: 1380, y: -900, r: 360, c: '#fff4e4', a: 0.7 },
            { x: 460, y: 820, r: 320, c: '#f6d2a8', a: 0.45 },
          ] : []),
        ].map((b, i) => (
          <div key={i} style={{
            position: 'absolute', left: b.x - b.r * G + Math.sin(f / 40 + i) * 6, top: CY + b.y * G - b.r * G, width: b.r * 2 * G, height: b.r * 2 * G, borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(b.c, b.a)} 0%, ${alpha(b.c, 0)} 70%)`,
          }} />
        ))}
        {/* 地面反光：胶囊下方一抹暖色，随 g 熄灭 */}
        <div style={{
          position: 'absolute', left: PX + PW * 0.35, width: PW * 0.75, top: PY + PH * 0.9, height: 220 * K,
          background: `radial-gradient(ellipse 50% 40% at 60% 20%, ${alpha(WARM, 0.22 * g)} 0%, ${alpha(WARM, 0)} 72%)`,
          opacity: appear,
        }} />
      </Stage>

      {/* 胶囊本体 */}
      <div style={{
        position: 'absolute', left: PX, top: PY, width: PW, height: PH, borderRadius: R, overflow: 'hidden', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', padding: `0 ${PAD_R}px 0 ${PAD_L}px`, opacity: appear,
        transform: `scale(${s})`, filter: defocus > 0.05 ? `blur(${defocus.toFixed(2)}px)` : undefined,
        background: `linear-gradient(180deg, ${alpha('#ffffff', 0.62)} 0%, ${alpha('#fffaf3', 0.42)} 55%, ${alpha('#f3e7d8', 0.5)} 100%)`,
        backdropFilter: 'blur(26px) saturate(1.3)', WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
        border: `${1.5 * K}px solid ${alpha('#ffffff', 0.85)}`,
        // 落地影两层（近地小而实 + 远地大而虚，落位时收紧）直接挂在胶囊上，与玻璃同一个圆角
        boxShadow: `0 0 0 1px ${alpha(L.shadow, 0.07)}, inset 0 ${2 * K}px 0 ${alpha('#ffffff', 0.95)}, inset 0 -10px 24px ${alpha('#c9a888', 0.22)}, ` +
          `0 ${mix(10, 4, land).toFixed(1)}px ${mix(20, 10, land).toFixed(1)}px ${alpha(L.shadow, 0.12)}, 0 ${(mix(60, 36, land) * K).toFixed(1)}px ${70 * K}px -28px ${alpha(L.shadow, 0.4)}, ` +
          `0 0 ${60 * g * K}px ${alpha(APRICOT, 0.45 * g)}`,
      }}>
        {/* 内嵌暖光：左淡右浓，随打字退去（光在玻璃里面，不是外部光晕） */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: g,
          background: `linear-gradient(90deg, ${alpha(WARM, 0)} 0%, ${alpha(WARM, 0.18)} 38%, ${alpha(WARM, 0.62)} 78%, ${alpha(APRICOT, 0.95)} 100%)`,
        }} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: g * 0.7, mixBlendMode: 'screen',
          background: `radial-gradient(ellipse 34% 130% at 100% 100%, ${alpha('#ffe2b8', 0.9)} 0%, ${alpha('#ffe2b8', 0)} 70%)`,
        }} />
        {/* 顶沿高光线：两端渐隐，裁在圆角里 */}
        <div style={{
          position: 'absolute', left: R * 0.9, right: R * 0.9, top: 3, height: 1.5 * K, pointerEvents: 'none',
          background: `linear-gradient(90deg, ${alpha('#ffffff', 0)}, ${alpha('#ffffff', 0.95)} 20%, ${alpha('#ffffff', 0.7)} 75%, ${alpha('#ffffff', 0)})`,
        }} />
        {/* 听写文字 + 光标（逐行；光标跟在已打出的最后一个字后面） */}
        <div style={{ position: 'relative', flex: 'none', width: innerW }}>
          {lines.map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: LH }}>
              <div style={{ ...type(FS, 500), lineHeight: 1.3, letterSpacing: '-0.015em', color: L.ink, whiteSpace: 'pre', flex: 'none' }}>
                {typed[i]}
              </div>
              {i === caretLine && (
                <div style={{
                  position: 'relative', width: 4 * K, height: FS * 1.1, marginLeft: 4 * K, borderRadius: 2 * K, flex: 'none', opacity: caret,
                  background: mixHex(L.ink, WARM, 0.8 * g),
                }} />
              )}
            </div>
          ))}
        </div>
        {/* 声波按钮：实心暖色 → 描边中性 */}
        <div style={{
          position: 'relative', marginLeft: 'auto', width: BTN, height: BTN, borderRadius: BTN / 2, flex: 'none', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 * K,
          background: `linear-gradient(180deg, ${alpha('#ffffff', 0.35 * g)}, ${alpha('#ffffff', 0)}), ${alpha(WARM, 0.92 * g)}`,
          border: `${1.5 * K}px solid ${g > 0.5 ? alpha('#ffffff', 0.5) : alpha(L.ink, 0.16 + 0.1 * (1 - g))}`,
          boxShadow: `inset 0 1.5px 0 ${alpha('#ffffff', 0.5)}, 0 ${6 * g}px ${18 * g}px -6px ${alpha(WARM, 0.8 * g)}`,
        }}>
          {BARS.map((h, i) => (
            <div key={i} style={{
              width: 5 * K, borderRadius: 3 * K, height: (h + 2.4 * Math.sin(f * 0.5 + i * 1.7)) * K,
              background: mixHex(L.ink2, '#fffaf3', g),
            }} />
          ))}
        </div>
      </div>

      {/* 品牌小标 + 提示（静态，跟胶囊一起出现，不抢戏）；无品牌时只留提示 */}
      {(BRAND.name || caption) ? (
        <div style={{
          position: 'absolute', left: 80, right: 80, top: portrait ? Math.min(SH - 300, PY + PH + 360) : 1080 - 112 - 40, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 * K,
          opacity: ramp(f, 4, 16, EASE.out) * (0.9 + 0.1 * breathe), whiteSpace: 'nowrap',
          textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined,
        }}>
          {BRAND.name ? <ShotcraftMark size={34 * CAP} tone="light" /> : null}
          {BRAND.name ? <span style={{ ...type(30 * CAP, 650), color: L.ink2 }}>{BRAND.name}</span> : null}
          {caption ? <span style={{ ...type(fitSize(caption, { family: fonts.sans, size: 30 * CAP, maxWidth: 1200, weight: 450 }), 450), color: bd ? L.ink2 : L.ink3 }}>{BRAND.name ? '· ' : ''}{caption}</span> : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
