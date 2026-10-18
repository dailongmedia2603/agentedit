// white-flash-logo-simplify-cut — White Flash Simplify 冲白降维切换
// 液态金属质感的彩色词标静置流光，蓄力后从字心炸出一记白闪过曝，曝光回落时同一位置已是扁平版字标——
// 一次闪白完成"华丽演出 → 正式形象"的降维。
//
// 第二轮重设计（极光 · 液态金属 → 纸面定妆）：
// - look = aurora（暗场演出段）；冲白后落到纸面（纸 / 墨 / 琥珀）。
//   词标是品牌字标（字标字体 700 字重，按字长压字号 FS），
//   两个版本同字号同位置——观众读到的是"同一个字标被净化了"，不是换了一张图。
// - 液态段的质感是"真材质"而不是一条渐变：①流动的虹彩底色（紫 → 粉 → 桃 → 冰蓝，background-size 300% 缓流）
//   ②纵向明暗（顶亮底暗，读作有体积）③横贯字腰的镀铬地平线反光带 ④一次斜向高光扫过（Q4：只给主角一次，
//   裁进字形）⑤字下柔光 bloom + 地面倒影（翻转、渐隐）。背后一抹极光余光 + 浮尘。
// - 白闪不是整屏均匀淡入，而是"光从字里炸出来"：蓄力段字标提亮、一条横向变形镜头眩光从字心拉开，
//   随后白色径向光团从字心 6f 内撑满全屏（二次 ease-in，越来越快）。
// - 定妆段用"曝光回落"代替淡入：白层 22f 内 quint-out 退去，像眼睛适应强光——底下扁平字标早已在位，
//   只带 1.03→1 的对焦收束；随后字标上方镜刻标志描出（取景框先揭开、琥珀斜切后划入）、
//   一根琥珀短线画出、品牌短句逐词升起，完成锁定画面（标志本身不上液态质感——品牌规范禁渐变/发光）。
//
// 时间表（30fps，共 120f）：
//   0–34    演出：液态词标在场（第 0 帧即有）、虹彩缓流、高光 6–34f 扫过一次、整幅 1→1.035 缓推
//   34–46   蓄力：字标 brightness 1→1.7、bloom 加强、横向眩光拉开（ease-in）
//   44–50   冲白：径向白团从字心撑满（二次 ease-in），50–54 纯白 hold（呼吸位）
//   54–76   曝光回落：白层 1→0（quint-out）；扁平字标 1.03→1 对焦
//   72–96   锁定：琥珀短线 72–86 画出、标志 74–96 描出、品牌短句 78f 起逐词升起
//   96–120  hold：极缓前推 1→1.01 定格
//
// [Agent Edit] Chu chinh = TEN (o chu `name`: ten san pham / kenh / chien dich trong loi noi); khong co -> ten thuong hieu cua video.
// O `tagline` = cau khau hieu duoi ten (thay PITCH). Logo phia tren chi hien khi video co thuong hieu (logo that hoac chu viet tat).
// Co chu tu tinh theo do dai ten (1 dong, vua be ngang) — hai ban long / phang van cung co, cung tam (menh de cua the).
// Vung clip chu (background-clip:text) co dem tren / duoi 0.4em de dau tieng Viet (Ắ Ồ) nam trong vung to mau, khong mat dau.
// Khung doc (portrait.mode = 'native'): tam ten o ~46% chieu cao that, co chu toi da 300, bui sang trai doc ca khung.
import { useCurrentFrame, useVideoConfig, useText, useBrand, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, Grain, Vignette, mix, ramp } from '../../../fixtures/Polish';
import { Dust, LOOKS, Stage, alpha } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const WHITE_FLASH_LOGO_SIMPLIFY_CUT_DURATION = 120;

const L = LOOKS.aurora;
const FLASH0 = 44;
const WHITE = 50; // 全白、换场帧
const RECOVER = 54;

// 扁平版的三个颜色：纸面 / 墨 / 强调色
const PAPER: [string, string] = ['#f7f5f0', '#ebe7de'];
const FLAT_INK: string = BRAND.ink;
const FLAT_ACCENT: string = BRAND.amber;

const IRIS = 'linear-gradient(100deg, #7c6bff 0%, #b18cff 16%, #f472b6 32%, #ffc6a8 46%, #8fdcff 62%, #7c6bff 78%, #c58cff 90%, #7c6bff 100%)';
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// 液态词标（一个 span 上叠多层背景并全部 clip 到字形）
const LiquidWord: React.FC<{ frame: number; bright: number; word: string; ws: React.CSSProperties }> = ({ frame, bright, word, ws }) => {
  const flow = (frame * 1.1) % 300;
  const sheen = ramp(frame, 6, 28, EASE.swift); // 斜向高光一次扫过
  const sx = mix(-30, 130, sheen);
  const layers = [
    // 斜向高光（只在 6–34f 出现）
    sheen > 0 && sheen < 1
      ? `linear-gradient(105deg, rgba(255,255,255,0) ${sx - 10}%, rgba(255,255,255,0.85) ${sx}%, rgba(255,255,255,0) ${sx + 10}%)`
      : 'linear-gradient(0deg, transparent, transparent)',
    // 镀铬地平线：字腰一道亮带 + 其下一道暗带（vung clip co dem 0.4em tren/duoi -> % theo hop moi: than chu nam 28%–72%）
    'linear-gradient(180deg, rgba(255,255,255,0) 44%, rgba(255,255,255,0.34) 50%, rgba(255,255,255,0.1) 52%, rgba(40,10,70,0.28) 55%, rgba(40,10,70,0) 62%)',
    // 纵向体积：顶亮底暗
    'linear-gradient(180deg, rgba(255,255,255,0.45) 22%, rgba(255,255,255,0) 44%, rgba(20,5,40,0) 58%, rgba(20,5,40,0.45) 78%)',
    IRIS,
  ];
  return (
    <span style={{
      ...ws,
      backgroundImage: layers.join(', '),
      backgroundSize: '100% 100%, 100% 100%, 100% 100%, 300% 100%',
      backgroundPosition: `0 0, 0 0, 0 0, ${flow}% 0`,
      WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      filter: bright > 1.001 ? `brightness(${bright.toFixed(3)}) saturate(${(1 / Math.sqrt(bright)).toFixed(3)})` : undefined,
    }}>{word}</span>
  );
};

// xuong dong can doi (khong de 1 tu mo coi o dong cuoi)
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

// Chu "troi len" (padding tren 0.5em cho dau chong chu hoa, duoi 0.26em)
const RiseWords: React.FC<{ text: string; start: number; each: number; gap: number }> = ({ text, start, each, gap }) => {
  const f = useCurrentFrame();
  const ws = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {ws.map((w, i) => {
        const p = EASE.snappy(clamp01((f - start - i * gap) / each));
        return (
          <React.Fragment key={i}>
            {i ? ' ' : ''}
            <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.5em 0.04em 0.26em', margin: '-0.5em -0.04em -0.26em' }}>
              <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.8).toFixed(3)}em))` }}>{w}</span>
            </span>
          </React.Fragment>
        );
      })}
    </>
  );
};

export const WhiteFlashLogoSimplifyCut: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const nameIn = useText('name', '');
  const WORD = (nameIn || brand?.name || 'Ánh Dương').normalize('NFC');
  const tagline = useText('tagline', 'Đơn giản là đẹp.');

  // ── bo cuc ──
  const FS = fitSize(WORD, { family: fonts.sans, size: portrait ? 300 : 300, maxWidth: portrait ? 1680 : 1560, weight: 700, minSize: portrait ? 110 : 90, letterSpacingEm: 0.03 });
  const CY = portrait ? Math.round(SH * 0.46) : 500; // 词标中心 y
  const MARK = portrait ? 170 : 124; // 锁定段字标上方的镜刻标志尺寸
  const tagSz = portrait ? 66 : 46;
  const tagLines = tagline ? wrapBalanced(tagline, fonts.sans, tagSz, portrait ? 1600 : 1500, 480, 2) : [];
  const wordStyle: React.CSSProperties = {
    fontFamily: fonts.sans, fontSize: FS, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1, whiteSpace: 'nowrap',
    padding: '0.4em 0.08em', display: 'inline-block',
  };
  const centered = (y: number): React.CSSProperties => ({
    position: 'absolute', left: 0, right: 0, top: y - FS, height: FS * 2, display: 'flex', justifyContent: 'center', alignItems: 'center',
  });

  // ── 演出段 ──
  const push = 1 + 0.035 * ramp(frame, 0, FLASH0, EASE.smooth);
  const charge = ramp(frame, 34, 12, EASE.exit); // 蓄力 0→1（越来越快）
  const bright = 1 + 0.7 * charge;
  const flare = ramp(frame, 34, 14, EASE.exit);

  // ── 冲白 ──
  const burst = ramp(frame, FLASH0, WHITE - FLASH0, (t) => t * t); // 径向白团半径（二次 ease-in：后 3 帧肉眼可见地吞掉字标）
  const whiteHold = frame >= WHITE && frame < RECOVER ? 1 : 0;
  const recover = 1 - ramp(frame, RECOVER, 22, EASE.out); // 曝光回落 1→0
  const whiteA = frame < WHITE ? burst : frame < RECOVER ? 1 : recover;

  // ── 定妆段 ──
  const focus = ramp(frame, RECOVER - 2, 26, EASE.snappy);
  const flatScale = mix(1.03, 1, focus) * (1 + 0.01 * ramp(frame, 96, 24, EASE.smooth));
  const rule = ramp(frame, 72, 14, EASE.snappy);
  const mark = ramp(frame, 74, 14, EASE.snappy); // 标志取景框揭开
  const cut = ramp(frame, 84, 12, EASE.snappy); // 琥珀斜切划入

  const dark = frame < WHITE;
  const capH = FS * 0.72; // chieu cao chu hoa ~ khoang than chu
  const nW = Math.max(1, tagline.split(/\s+/).filter(Boolean).length);
  const tGap = Math.min(4, 26 / nW);
  let wi = 0;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: dark ? L.bg[1] : PAPER[0] }}>
      {dark ? (
        <>
          <Stage look={L} keyLight={{ x: 0.5, y: 0.2 }} fill={{ x: 0.82, y: 0.85 }} breathe={0.6} />
          {/* bui sang: khung doc xep nhieu lop 1080 de phu ca chieu cao */}
          {Array.from({ length: Math.ceil(SH / 1080) }, (_, q) => (
            <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q * 1080, height: 1080 }}>
              <Dust look={L} count={36} seed={4 + q * 7} drift={0.2} opacity={0.5} />
            </div>
          ))}
          {/* 字后极光余光 */}
          <div style={{
            position: 'absolute', left: 360 - (portrait ? 200 : 0), right: 360 - (portrait ? 200 : 0), top: CY - 260 * (portrait ? 1.5 : 1), height: 520 * (portrait ? 1.5 : 1),
            background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha('#a78bfa', 0.28 + 0.25 * charge)} 0%, ${alpha('#f472b6', 0.08)} 45%, rgba(0,0,0,0) 72%)`,
          }} />

          <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: `50% ${CY}px` }}>
            {/* bloom：同色模糊副本 */}
            <div style={{ ...centered(CY), opacity: 0.42 + 0.4 * charge, filter: 'blur(38px)' }}>
              <span style={{ ...wordStyle, backgroundImage: IRIS, backgroundSize: '300% 100%', backgroundPosition: `${(frame * 1.1) % 300}% 0`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{WORD}</span>
            </div>
            {/* 地面倒影：翻转 + 渐隐 */}
            <div style={{
              ...centered(CY + FS * 0.86), transform: 'scaleY(-1)', opacity: 0.22,
              WebkitMaskImage: 'linear-gradient(0deg, transparent 30%, #000 42%, rgba(0,0,0,0.4) 52%, transparent 64%)',
              maskImage: 'linear-gradient(0deg, transparent 30%, #000 42%, rgba(0,0,0,0.4) 52%, transparent 64%)',
            }}>
              <LiquidWord frame={frame} bright={bright} word={WORD} ws={wordStyle} />
            </div>
            {/* 主词标 */}
            <div style={centered(CY)}>
              <LiquidWord frame={frame} bright={bright} word={WORD} ws={wordStyle} />
            </div>
            {/* 横向变形眩光：从字心拉开 */}
            {flare > 0 && (
              <>
                {/* 眩光：宽而软的光晕 + 细亮核（核的两端渐隐，不加描边阴影——否则亮线会带一圈暗边） */}
                <div style={{
                  position: 'absolute', left: 960 - 1100 * flare, width: 2200 * flare, top: CY - 24, height: 48,
                  background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha('#e9e2ff', 0.55 * flare)} 0%, rgba(233,226,255,0) 100%)`,
                }} />
                <div style={{
                  position: 'absolute', left: 960 - 1000 * flare, width: 2000 * flare, top: CY - 2, height: 4,
                  background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${(0.95 * flare).toFixed(3)}) 50%, rgba(255,255,255,0) 100%)`,
                }} />
                <div style={{
                  position: 'absolute', left: 960 - 900 * flare, width: 1800 * flare, top: CY - 90, height: 180,
                  background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha('#d8ccff', 0.45 * flare)} 0%, rgba(216,204,255,0) 70%)`,
                }} />
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* 纸面：冷白带一丝紫 + 顶部柔光 + 轻暗角 + 颗粒 */}
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${PAPER[0]} 0%, ${PAPER[1]} 100%)` }} />
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at 50% ${((CY / SH) * 100 - 6).toFixed(1)}%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)` }} />
          <Vignette strength={0.1} inner={0.5} color="#2a2620" />
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${flatScale.toFixed(5)})`, transformOrigin: `50% ${CY}px` }}>
            <div style={centered(CY)}>
              <span style={{ ...wordStyle, color: FLAT_INK }}>{WORD}</span>
            </div>
            {/* 锁定：标志（chi khi co thuong hieu）+ 琥珀短线 + 品牌短句 */}
            {brand ? (
              <div style={{ position: 'absolute', left: 960 - MARK / 2, top: CY - capH * 0.5 - 0.42 * FS - 44 - MARK }}>
                <ShotcraftMark size={MARK} tone="light" frameProgress={mark} cutProgress={cut} />
              </div>
            ) : null}
            <div style={{
              position: 'absolute', left: 960 - 48 * (portrait ? 1.4 : 1), top: CY + FS * 0.5 + 62, width: 96 * (portrait ? 1.4 : 1), height: 5 * (portrait ? 1.4 : 1), borderRadius: 3,
              background: FLAT_ACCENT, transform: `scaleX(${rule.toFixed(4)})`,
            }} />
            {tagLines.map((l, i) => {
              const st = 78 + wi * tGap;
              wi += l.split(/\s+/).filter(Boolean).length;
              return (
                <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: CY + FS * 0.5 + 106 + i * tagSz * 1.3, textAlign: 'center', color: '#716d64', fontFamily: fonts.sans, fontSize: tagSz, fontWeight: 480, letterSpacing: '-0.02em', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                  <RiseWords text={l} start={st} each={18} gap={tGap} />
                </div>
              );
            })}
          </div>
          <Grain opacity={0.04} />
        </>
      )}

      {/* 白闪：先是从字心撑开的径向白团，满屏后整层白，再随曝光回落退去 */}
      {whiteA > 0.001 && (
        frame < WHITE ? (
          <AbsoluteFill style={{
            background: `radial-gradient(circle ${(80 + burst * Math.max(1500, SH * 0.75)).toFixed(1)}px at 50% ${CY}px, rgba(255,255,255,1) 0%, rgba(255,255,255,${(0.6 + 0.4 * burst).toFixed(3)}) 55%, rgba(255,255,255,0) 100%)`,
            opacity: Math.min(1, burst * 1.4),
          }} />
        ) : (
          <AbsoluteFill style={{ background: '#ffffff', opacity: whiteHold ? 1 : whiteA }} />
        )
      )}
    </AbsoluteFill>
  );
};
