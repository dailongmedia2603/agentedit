// brace-expand — Brace Expand Reveal 括号拉幕
// 一对紧贴的花括号先小字号出现在正中，随即带一次过冲向左右弹开并放大到标题级，括号之间的标题像被拉开的幕布
// 一样从中间露出（clip 宽度严格绑括号间距），落定后字距再细微松弛。
//
// 第二轮重设计（午夜 · 开发者发布会字卡）：
// - look = midnight。画面是一张技术产品发布字卡：等宽 300px 电光蓝花括号（带泛光）夹住 164px 800 字重的
//   品牌名「video-shotcraft」（全小写，字宽贴满括号内腔）；上方等宽眉题「// shot recipes for your agent」、
//   下方副标（品牌短句 Frame motion. Craft the shot.）逐词浮现。背景是编辑器式点阵网格
//   （径向渐隐）+ 顶光 + 地平线光带，括号下方一道冷光反射。
// - 开场：第 0 帧画面中心已有一个闪烁的输入光标（编辑器语感，不是空帧）；6f 光标被一对紧贴的 0.4 倍小括号
//   "{}" 硬切替换（符号啪地在那儿，不淡入）——先建立"这是一对括号"。
// - 主动作：14f 起物理弹簧 ex（damping 14 / stiffness 130：起跳后 ~8f 到位、~11f 过冲峰 ≈9%、一次回弹）；
//   sc = mix(0.4, 1, ex)，幕布半宽 x = (HALF−内缘)·ex·sc，位移与放大乘在一起（放大本身也在推开括号）；
//   括号中心 = ±(x + 内缘·sc)，文字 clip 宽度 = 2x，严格绑括号内缘，括号与文字共用同一个 sc。括号按水平速度加方向性运动模糊，落定为 0。
// - 余波：落定后字距 −0.05em → −0.03em 松弛（呼一口气）、括号泛光从峰值回落；眉题与副标随后入场。
//
// 时间表（30fps，共 120f）：
//   0–6     光标闪烁（中心，第 0 帧即在）
//   6–14    小括号 "{}" 硬切出现、静置 8f
//   14–38   弹开：弹簧 ~22f 到位、~25f 过冲峰 ≈9%、~38f 收敛；文字从中间被"拉"出来
//   40–64   松弛：字距 −0.05→−0.03em（smooth）、泛光回落
//   44–80   眉题字距收拢入场（44f）、副标逐词浮现（54f 起）
//   80–120  hold：整幅极缓前推 1→1.012
// [Agent Edit] o chu: kicker (dong chu thich kieu code, tu them "// "), title (chu giua hai ngoac — loi noi that),
// subtitle (cau phu hien tung tu). Chu that dai ngan bat ky: HALF (nua khoang cach ngoac) tinh theo be ngang that cua
// tieu de (do bang font that) -> man van keo het moi lo du chu (dung y "van ban rong vua khoang trong"); tieu de qua dai
// -> thu nho hoac xuong 2 dong va ngoac phong to theo chieu cao khoi chu. Khung doc (native): chu to hon, ca khoi giua khung.
import { useCurrentFrame, useVideoConfig, useText, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, SpeedBlur, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, glow, springAt, type } from '../../../fixtures/Look';

export const BRACE_EXPAND_DURATION = 120;

const L = LOOKS.midnight;
const APPEAR = 6;
const EXPAND = 14;
const LS_END = -0.03; // 字距松弛终值（em）

// 弹开：14f 起弹簧 damping 14 / stiffness 130（≈9% 过冲，全片唯一峰值）
const expandAt = (f: number) => (f < EXPAND ? 0 : springAt(f, EXPAND, { damping: 14, stiffness: 130 }));

const Brace: React.FC<{ ch: string; x: number; cy: number; fs: number; sc: number; v: number; glowK: number }> = ({ ch, x, cy, fs, sc, v, glowK }) => (
  <SpeedBlur vx={v} amount={0.22} max={16}>
    <div style={{
      position: 'absolute', left: 960 + x, top: cy, transform: `translate(-50%, -52%) scale(${sc.toFixed(4)})`,
      fontFamily: FONT.mono, fontSize: fs, fontWeight: 500, lineHeight: 1, color: L.accent,
      textShadow: glow(L.accent, 0.5 + 0.5 * glowK),
    }}>{ch}</div>
  </SpeedBlur>
);

export const BraceExpand: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kickerRaw = useText('kicker', 'mẹo nhỏ cho người làm nội dung');
  const title = useText('title', 'tự động hoá');
  const sub = useText('subtitle', 'Một câu lệnh, cả quy trình chạy xong.');
  const kicker = kickerRaw.trim() ? (kickerRaw.trim().startsWith('//') ? kickerRaw.trim() : `// ${kickerRaw.trim()}`) : '';

  // ── 版式：标题字号 / 行数 → 括号字号与半距（文案宽度与 HALF 匹配 = 本卡已知坑 #1）──
  const TITLE_FS = portrait ? 250 : 164;
  const BRACE_BASE = portrait ? 456 : 300; // 括号字号 : 标题字号 ≈ 1.83（原版 300 / 164）
  const wOf = (t: string, fs: number) => measureText(t, fonts.sans, fs, 800) + Math.max(0, t.length - 1) * LS_END * fs;
  // 内腔最大宽：括号外缘留 60px 安全边；括号随行数放大（k）时自身也变宽
  const cavMax = (k: number) => 2 * (900 - 0.3 * BRACE_BASE * k - (64 / 300) * BRACE_BASE * k) - 2 * 47;
  const kOf = (n: number) => (n === 1 ? 1 : Math.min(1.6, (n * 1.16) / 1.1));
  // 均衡折行：折成 ≤ n 行时让最长一行最短（与字号无关），再按内腔宽定字号
  const balanced = (t: string, fs: number, n: number) => {
    let lo = 0, hi = wOf(t, fs) + 1;
    let best = [t];
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      const ls = wrapLines(t, fonts.sans, fs, mid, 800, 99);
      if (ls.length <= n) { best = ls; hi = mid; } else lo = mid;
    }
    return best;
  };
  const words = title.trim().split(/\s+/).filter(Boolean);
  const maxLines = Math.min(words.length, portrait ? 3 : 2);
  let lines = [title.trim()];
  let fs = 0;
  for (let nl = 1; nl <= maxLines; nl++) {
    const base = nl === 1 ? TITLE_FS : TITLE_FS * 0.9;
    const cav = cavMax(kOf(nl));
    const ls = nl === 1 ? [title.trim()] : balanced(title, base, nl);
    const f = Math.max(TITLE_FS * 0.4, Math.min(base, ...ls.map((l) => base * Math.min(1, cav / wOf(l, base)))));
    if (f > fs * 1.06) { lines = ls; fs = f; }
    if (f >= base * 0.86) break;
  }
  const n = lines.length;
  const lineH = fs * 1.16;
  const k = n === 1 ? Math.max(0.78, fs / TITLE_FS) : kOf(n) * Math.max(0.8, fs / (TITLE_FS * 0.9)); // 括号随字块高度放大
  const BRACE_FS = BRACE_BASE * k;
  const INNER = (64 / 300) * BRACE_FS; // 括号字形中心到内缘（原版 300px 时 64）
  const textW = Math.max(...lines.map((l) => wOf(l, fs)));
  const HALF = Math.max(INNER * 2.4 + 140, textW / 2 + 47 + INNER); // 字宽 ≈ 内腔 − 两侧羽化
  const braceHalfH = BRACE_FS * 0.5;

  // 副标：按宽度折行（竖屏最多 3 行）
  const subFs = portrait ? 78 : 44;
  const subLines = sub.trim() ? wrapLines(sub, fonts.sans, subFs, portrait ? 1600 : 1500, 450, portrait ? 4 : 2) : [];
  const subLineFs = Math.min(subFs, ...subLines.map((l) => fitSize(l, { family: fonts.sans, size: subFs, maxWidth: portrait ? 1600 : 1640, weight: 450, minSize: 30 })));
  const kickFs = portrait ? 58 : 32;
  const kickSize = kicker ? fitSize(kicker, { family: fonts.mono, size: kickFs, maxWidth: portrait ? 1720 : 1640, weight: 500, minSize: 24, letterSpacingEm: 0.08 }) : kickFs;

  // 垂直：landscape 保持原版 CY=520；portrait 整组居中
  const gapK = portrait ? 120 : 98;
  const gapS = portrait ? 60 : 20;
  const subBlock = subLines.length * subLineFs * 1.3;
  const groupH = (kicker ? kickSize + gapK : 0) + braceHalfH * 2 + (subLines.length ? gapS + subBlock : 0);
  const CY = portrait ? Math.round(SH * 0.48 - groupH / 2 + (kicker ? kickSize + gapK : 0) + braceHalfH) : 520 + (n - 1) * 20;
  const kickTop = CY - braceHalfH - gapK;
  const subTop = CY + braceHalfH + gapS;

  // ── 动作（原版参数不变）──
  const on = frame >= APPEAR;
  const ex = expandAt(frame);
  const sc = mix(0.4, 1, ex);
  // 幕布半宽 x = (HALF − 内缘)·ex·sc；括号中心 = ±(x + 内缘·sc)——ex=0 时两只括号内缘相贴成 "{}"
  const braceX = (f: number) => {
    const e = expandAt(f);
    return (HALF - INNER) * e * mix(0.4, 1, e);
  };
  const x = braceX(frame);
  const v = braceX(frame + 0.5) - braceX(frame - 0.5); // 括号水平速度（px/帧）

  // 文字揭示宽度：严格绑括号内缘（= 2x），两侧 14px 羽化（窄时跟着收）
  const clipW = Math.max(0, 2 * x);
  const bx = x + INNER * sc;
  const feather = Math.min(14, clipW / 4);
  const mask = `linear-gradient(90deg, transparent 0px, #000 ${feather}px, #000 calc(100% - ${feather}px), transparent 100%)`;
  // clip 框高度：字块 + 越南语叠加声调上留 0.4em、下留 0.3em（原版写死 220 = 164 号字）
  const clipH = n * lineH + fs * 0.7;

  const relax = ramp(frame, 40, 24, EASE.smooth);
  const ls = mix(-0.05, LS_END, relax);
  const glowK = Math.min(1, ex) * (1 - ramp(frame, 34, 30, EASE.out));
  const caretOn = !on && Math.floor(frame / 3) % 2 === 0;
  const cam = 1 + 0.012 * ramp(frame, 70, 50, EASE.smooth);

  // 副标逐词：词间按总词数压密，保证 80f 前全部浮现
  const subWordsTotal = subLines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  const subGap = Math.min(3, 14 / Math.max(1, subWordsTotal - 1));
  let wi = 0;

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: portrait ? 0.2 : 0.02 }} fill={null} horizon={portrait ? (CY + braceHalfH + 120) / SH : 0.66} breathe={0.4}>
        {/* 编辑器点阵：32px 栅格，中心亮、四周隐去（竖屏铺满整个高度） */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 1920, height: SH,
          backgroundImage: `radial-gradient(circle, ${alpha('#a9bcff', 0.16)} 1.4px, transparent 1.8px)`,
          backgroundSize: '32px 32px', backgroundPosition: '16px 8px',
          WebkitMaskImage: `radial-gradient(ellipse ${portrait ? '75% 32%' : '60% 55%'} at 50% ${((CY / SH) * 100).toFixed(1)}%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 85%)`,
          maskImage: `radial-gradient(ellipse ${portrait ? '75% 32%' : '60% 55%'} at 50% ${((CY / SH) * 100).toFixed(1)}%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 85%)`,
        }} />
        {/* 括号下方的冷光反射带（随弹开展宽） */}
        <div style={{
          position: 'absolute', left: 960 - (x + 120), width: 2 * (x + 120), top: CY + braceHalfH, height: 90 * Math.max(1, k),
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent, 0.22 * Math.min(1, ex))} 0%, ${alpha(L.accent, 0)} 70%)`,
        }} />
      </Stage>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: `50% ${CY}px` }}>
        {/* 眉题：等宽注释 */}
        {kicker ? (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: kickTop - kickSize * 1.3, textAlign: 'center', color: L.accent2, whiteSpace: 'nowrap',
            ...type(kickSize, 500, { mono: true }), lineHeight: 1.3, letterSpacing: `${mix(0.5, 0.08, ramp(frame, 44, 20, EASE.snappy)).toFixed(3)}em`,
            opacity: ramp(frame, 44, 14, EASE.out),
          }}>{kicker}</div>
        ) : null}

        {/* 标题：clip 宽度绑括号间距（幕布感，不是淡入/打字） */}
        {on && (
          <div style={{
            position: 'absolute', left: 960 - clipW / 2, width: clipW, top: CY - clipH / 2, height: clipH, overflow: 'hidden',
            WebkitMaskImage: mask, maskImage: mask,
          }}>
            <div style={{
              position: 'absolute', left: clipW / 2, top: clipH / 2, transform: `translate(-50%, -50%) scale(${sc.toFixed(4)})`,
              fontFamily: FONT.sans, fontSize: fs, fontWeight: 800, letterSpacing: `${ls.toFixed(4)}em`, lineHeight: `${lineH}px`,
              whiteSpace: 'nowrap', textAlign: 'center', paddingTop: fs * 0.06,
              backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #e8eeff 55%, #a9b9e8 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        )}

        {on && <Brace ch="{" x={-bx} cy={CY} fs={BRACE_FS} sc={sc} v={-v} glowK={glowK} />}
        {on && <Brace ch="}" x={bx} cy={CY} fs={BRACE_FS} sc={sc} v={v} glowK={glowK} />}

        {/* 开场光标 */}
        {caretOn && (
          <div style={{
            position: 'absolute', left: 960 - 4 * k, top: CY - 60 * k, width: 8 * k, height: 120 * k, borderRadius: 2,
            background: L.accent, boxShadow: glow(L.accent, 0.6),
          }} />
        )}

        {/* 副标 */}
        {subLines.map((l, i) => {
          const start = 54 + wi * subGap;
          wi += l.split(/\s+/).filter(Boolean).length;
          return (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: subTop + i * subLineFs * 1.3, textAlign: 'center', color: L.ink2, ...type(subLineFs, 450), lineHeight: 1.3, whiteSpace: 'nowrap' }}>
              <TextReveal text={l} by="word" variant="blur" start={start} each={16} gap={subGap} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
