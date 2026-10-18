// gradient-transition — 背景在 linear → radial → conic 三类 CSS 渐变间平滑过渡：
// 同类型内逐参数插值（角度 / 色标 / 中心 / 半径 / 起始角），跨类型用窄交叉淡化换类型不换气。
//
// 第二轮重设计（极光紫 · 发布会片头）：
// - look = aurora（紫粉暗场）。渐变就是主视觉——前景只有一组大字排版，节奏跟着渐变类型换拍：
//   「Bend light.」（linear：角度扫过）→「Focus it.」（radial：光斑对角游走并聚焦）→ video-shotcraft 字标（conic：三色环旋转）。
//   每段文案的动词正好描述该段渐变的参数运动，文案即手法。
// - 色彩：不再是七色彩虹——三段都在同一组紫 / 品红 / 冰蓝里取色，外圈压暗（radial 段光斑成立的前提，
//   也给白字留对比）；conic 改成 A→B→C→A 三色环，圆心放在字标右后方并在小画布上预模糊，抹掉尖点。
// - 性能：三层渐变画在 480×270 小画布上再 transform 放大 4×（合成期放大天然柔化，模糊在小画布上做，
//   每帧代价是全屏实时模糊的 1/16），上面叠颗粒防 h264 色带。
// - 底部一条技术注记：左侧实时读出正在插值的渐变参数（mono），右侧段号——给观众看"这是参数在动"。
//
// 时间表（30fps，共 200f）：
//   0–68    linear：角度 18°→198°（swift in-out），三档明度色标 HSL 三通道插值；6–26f「Bend light.」逐词升起
//   56–68   交叉淡化 linear → radial（12f），两层都在动
//   56–132  radial：圆心 (24%,72%) → (68%,38%) 对角游走、半径 48%→80% 扩张；52–62f 旧句虚化上飘，66–86f「Focus it.」
//   118–132 交叉淡化 radial → conic（14f）
//   118–200 conic：起始角 0→250° 旋转（ease-out 长尾，越转越慢落定）；114–124f 旧句退场，
//           128–150f video-shotcraft 字标字距收拢入场（标志框描出、斜切划入），140–160f 品牌短句；160–200f hold
//
// [Agent Edit] o chu: line1 (cau doan linear) / line2 (cau doan radial) / kicker + name + tagline (man chot o doan conic:
// ten san pham / kenh; trong -> ten thuong hieu video; khong co ca hai -> tagline thanh dong lon) / label (chu nho goc
// duoi trai, thay dong doc thong so CSS). Chu dai: tu xuong dong (toi da 2-3 dong) + thu nho; nhip tung tu nen theo so tu
// de moi cau hien du truoc khi lui. Khung doc (native): nen ve tren canvas nho cao theo height that, chu to (~230px)
// can giua theo chieu doc, toi nen o giua thay cho toi nen ben trai.
import { useBrand, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, Grain, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, TYPE, TextReveal, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const GRADIENT_TRANSITION_DURATION = 200;

const L = LOOKS.aurora;

type H3 = [number, number, number];
const hsl = ([h, s, l]: H3, a = 1) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`;
// HSL 三通道独立插值（比 RGB 不发灰）
const mixH = (a: H3, b: H3, k: number): H3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

// 小画布：渐变在 480×270 上画，放大 4× 铺满
const SW = 480;
const SLOW = bezier(0.45, 0, 0.2, 1);

const layer = (background: string, opacity: number, extra?: React.CSSProperties): React.CSSProperties => ({
  position: 'absolute', inset: 0, background, opacity, ...extra,
});

// mot cau / doan: nhieu dong, hien tung tu tu mo (variant blur, khong mat na -> dau tieng Viet nguyen ven), lui cung luc
const Phrase: React.FC<{ lines: string[]; size: number; top: number; left: number; start: number; doneBy: number; outAt: number }> = ({ lines, size, top, left, start, doneBy, outAt }) => {
  const n = lines.join(' ').split(/\s+/).filter(Boolean).length;
  const gap = Math.min(5, (doneBy - start - 20) / Math.max(1, n - 1));
  let k = 0;
  return (
    <div style={{ position: 'absolute', left, top, ...type(size, 760), lineHeight: 1.12, color: L.ink, textShadow: `0 10px 50px ${alpha('#05020c', 0.35)}` }}>
      {lines.map((l, i) => {
        const s0 = start + k * gap;
        k += l.split(/\s+/).filter(Boolean).length;
        return (
          <div key={i} style={{ whiteSpace: 'nowrap' }}>
            <TextReveal text={l} by="word" variant="blur" start={s0} each={20} gap={gap} out={{ start: outAt, dur: 12 }} />
          </div>
        );
      })}
    </div>
  );
};

export const GradientTransition: React.FC = () => {
  const f = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = H > 1080 * 1.2;
  const SH = H / 4; // canvas nho: cao theo khung that
  const line1 = useText('line1', 'Một khởi đầu mới.');
  const line2 = useText('line2', 'Tập trung vào điều quan trọng.');
  const kicker = useText('kicker', 'Giới thiệu');
  const nameT = useText('name', '');
  const tagline = useText('tagline', 'Biến ý tưởng thành video chỉ trong vài phút.');
  const label = useText('label', '');
  const name = (nameT.trim() || BRAND.name || '').trim();

  // ── linear：角度扫过 + 色标漂移 ──
  const p1 = ramp(f, 0, 68, EASE.swift);
  const ang = mix(18, 198, p1);
  const l1a = mixH([300, 86, 64], [330, 88, 66], p1);
  const l1b = mixH([268, 76, 40], [250, 78, 44], p1);
  const l1c: H3 = [250, 62, 7];
  // 色标拉开明度（64 → 40 → 7），角度扫过时亮带的走向一眼可见
  const bg1 =
    `radial-gradient(ellipse 60% 70% at ${mix(18, 70, p1).toFixed(1)}% ${mix(10, 22, p1).toFixed(1)}%, ${hsl(l1a, 0.3)}, ${hsl(l1a, 0)} 70%), ` +
    `linear-gradient(${ang.toFixed(2)}deg, ${hsl(l1a)} 0%, ${hsl(l1b)} 34%, ${hsl(l1c)} 78%, ${hsl(l1c)} 100%)`;

  // ── radial：圆心对角游走 + 半径扩张（px 半径，CSS circle 半径只接受长度） ──
  const p2 = ramp(f, 56, 76, EASE.swift);
  const rcx = mix(24, 68, p2), rcy = mix(72, 38, p2), rr = mix(48, 80, p2);
  const core = mixH([326, 92, 72], [282, 88, 70], p2);
  const mid = mixH([292, 72, 38], [256, 74, 36], p2);
  const rpx = (rr / 100) * (portrait ? SW * 1.45 : SW);
  const bg2 =
    `radial-gradient(circle ${rpx.toFixed(1)}px at ${rcx.toFixed(2)}% ${rcy.toFixed(2)}%, ${hsl(core)} 0%, ${hsl(mid)} 36%, ${hsl([250, 62, 8])} 100%)`;

  // ── conic：三色环 A→B→C→A 旋转，圆心在字标右后方 ──
  const p3 = ramp(f, 118, 82, SLOW);
  const from = mix(0, 250, p3);
  const CC = portrait ? '62% 50%' : '64% 54%';
  const bg3 =
    `conic-gradient(from ${from.toFixed(2)}deg at ${CC}, hsl(262,84%,60%), hsl(322,86%,64%), hsl(205,90%,68%), hsl(262,84%,60%))`;

  // 交叉淡化权重（窄窗）
  const x12 = ramp(f, 56, 12, EASE.smooth);
  const x23 = ramp(f, 118, 14, EASE.smooth);
  const w1 = 1 - x12;
  const w2 = x12 - x23;
  const w3 = x23;

  const phase = f < 62 ? 0 : f < 125 ? 1 : 2;

  // video-shotcraft 字标字距收拢
  const markP = ramp(f, 128, 26, EASE.snappy);
  const subP = ramp(f, 142, 20, EASE.snappy);

  // ── bo cuc chu ──
  const LEFT = portrait ? 130 : 160;
  const TW = 1920 - LEFT * 2;
  const PS = portrait ? 230 : TYPE.display;
  // xuong dong theo be ngang that; qua so dong cho phep -> giam co chu dan (khong don phan du vao dong cuoi)
  const fitLines = (t: string, size: number, maxLines: number, weight: number, family = fonts.sans, minK = 0.45) => {
    let sz = size;
    let ls = wrapLines(t, family, sz, TW, weight, 99);
    while (ls.length > maxLines && sz > size * minK) {
      sz = Math.floor(sz * 0.93);
      ls = wrapLines(t, family, sz, TW, weight, 99);
    }
    if (ls.length > maxLines) ls = wrapLines(t, family, sz, TW, weight, maxLines);
    sz = Math.min(sz, ...ls.map((l) => fitSize(l, { family, size: sz, maxWidth: TW, weight, minSize: size * 0.3 })));
    return { ls, sz };
  };
  const P1 = fitLines(line1, PS, portrait ? 3 : 2, 760);
  const P2 = fitLines(line2, PS, portrait ? 3 : 2, 760);
  const p1Lines = P1.ls, p1Size = P1.sz, p2Lines = P2.ls, p2Size = P2.sz;
  const midY = portrait ? H * 0.47 : 540;
  const p1Top = Math.round(midY - (p1Lines.length * p1Size * 1.12) / 2);
  const p2Top = Math.round(midY - (p2Lines.length * p2Size * 1.12) / 2);
  const hero = name;
  const showMark = !!brand;
  const markS = portrait ? 220 : 168;
  const heroW = portrait || !showMark ? TW : TW - markS - 44;
  const heroLines = hero ? wrapLines(hero, BRAND.font, portrait ? 240 : 156, heroW, 700, 2) : [];
  const heroSize = hero ? Math.min(...heroLines.map((l) => fitSize(l, { family: BRAND.font, size: portrait ? 240 : 156, maxWidth: heroW, weight: 700, minSize: portrait ? 110 : 80, letterSpacingEm: 0.01 }))) : 0;
  const T = tagline.trim() ? fitLines(tagline, hero ? (portrait ? 84 : TYPE.h3) : PS * 0.8, hero ? 2 : 3, hero ? 500 : 760) : { ls: [] as string[], sz: 0 };
  const tagLines = T.ls, tagSize = T.sz;
  const kSize = fitSize(kicker.toUpperCase(), { family: fonts.sans, size: portrait ? 40 : TYPE.label, maxWidth: TW, weight: 700, minSize: 16, letterSpacingEm: 0.3 });
  const footSize = fitSize(label, { family: fonts.sans, size: portrait ? 44 : 30, maxWidth: TW - 240, weight: 500, minSize: 20 });
  const finH = (kicker.trim() ? kSize * 1.4 + (portrait ? 44 : 30) : 0) +
    (hero ? (portrait && showMark ? markS + 48 : 0) + Math.max(portrait || !showMark ? 0 : markS, heroLines.length * heroSize * 1.16) : 0) +
    (tagLines.length ? (portrait ? 56 : 40) + tagLines.length * tagSize * 1.2 : 0);
  const finTop = Math.round(midY - finH / 2);

  return (
    <AbsoluteFill style={{ background: L.bg[2], overflow: 'hidden' }}>
      {/* 背景三层：小画布作画、放大 4× */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, overflow: 'hidden', transform: `scale(${1920 / SW})`, transformOrigin: '0 0' }}>
        <div style={layer(bg1, w1)} />
        <div style={layer(bg2, w2)} />
        {w3 > 0.001 && (
          <div style={{ position: 'absolute', inset: 0, opacity: w3 }}>
            {/* 外扩再模糊：抹掉环心尖点与色标硬带，边缘不露黑 */}
            <div style={layer(bg3, 1, { inset: -14, filter: 'blur(9px)' })} />
            {/* 外圈压暗 + 左侧压暗，给白字留对比 */}
            <div style={layer(`radial-gradient(ellipse ${portrait ? '80% 50%' : '62% 78%'} at ${CC}, rgba(8,5,18,0) 18%, rgba(8,5,18,0.55) 64%, rgba(8,5,18,0.92) 100%)`, 1)} />
            <div style={layer(`linear-gradient(90deg, rgba(8,5,18,0.55) 0%, rgba(8,5,18,0) 46%)`, 1)} />
          </div>
        )}
      </div>
      {/* 前两段同样给文字区一层压暗（khung doc: toi o giua, chu nam ngang ca khung） */}
      <div style={layer(portrait ? `radial-gradient(ellipse 95% 34% at 40% 50%, rgba(8,5,18,0.42) 0%, rgba(8,5,18,0) 100%)` : `linear-gradient(90deg, rgba(8,5,18,0.42) 0%, rgba(8,5,18,0) 55%)`, portrait ? 1 : 1 - w3)} />
      <div style={layer(`radial-gradient(ellipse 80% 80% at 50% 50%, rgba(6,4,14,0) 55%, rgba(6,4,14,0.55) 100%)`, 1)} />
      <Grain opacity={0.1} blend="soft-light" />

      {/* 前景：每段一句 */}
      {f < 66 && <Phrase lines={p1Lines} size={p1Size} top={p1Top} left={LEFT} start={6} doneBy={40} outAt={52} />}
      {f >= 62 && f < 128 && <Phrase lines={p2Lines} size={p2Size} top={p2Top} left={LEFT} start={66} doneBy={100} outAt={114} />}
      {f >= 124 && (
        <div style={{ position: 'absolute', left: LEFT, top: finTop, width: TW }}>
          {kicker.trim() ? (
            <div style={{ ...type(kSize, 700), letterSpacing: '0.3em', lineHeight: 1.4, whiteSpace: 'nowrap', color: alpha(L.ink, 0.75), opacity: ramp(f, 124, 16, EASE.out) }}>
              {kicker.toUpperCase()}
            </div>
          ) : null}
          {/* 品牌字标：标志（框描出 → 斜切划入）+ 名字，字距收拢 */}
          {hero ? (
            <div style={{
              display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center', gap: portrait ? 48 : 44, marginTop: kicker.trim() ? (portrait ? 44 : 30) : 0,
              opacity: ramp(f, 128, 12, EASE.out),
              filter: markP < 0.98 ? `blur(${((1 - markP) * 14).toFixed(2)}px)` : undefined,
            }}>
              {showMark ? <ShotcraftMark size={markS} tone="dark" frameProgress={ramp(f, 128, 18, EASE.snappy)} cutProgress={ramp(f, 138, 14, EASE.snappy)} style={{ flex: 'none' }} /> : null}
              <div>
                {heroLines.map((l, i) => (
                  <div key={i} style={{
                    fontFamily: BRAND.font, fontSize: heroSize, fontWeight: 700, lineHeight: 1.16, whiteSpace: 'nowrap', color: L.ink,
                    letterSpacing: `${mix(0.1, 0.01, markP).toFixed(4)}em`,
                    textShadow: `0 12px 60px ${alpha('#05020c', 0.4)}`,
                  }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {tagLines.length ? (
            <div style={{
              marginTop: hero ? (portrait ? 56 : 40) : (portrait ? 40 : 30),
              opacity: subP, transform: `translateY(${((1 - subP) * 18).toFixed(2)}px)`,
            }}>
              {tagLines.map((l, i) => (
                <div key={i} style={{ ...type(tagSize, hero ? 500 : 760), lineHeight: 1.2, whiteSpace: 'nowrap', color: hero ? alpha(L.ink, 0.82) : L.ink }}>{l}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* 底部注记：nhan nho + 段号 */}
      <div style={{ position: 'absolute', left: LEFT, right: LEFT, bottom: portrait ? 240 : 96, opacity: ramp(f, 0, 16, EASE.out) }}>
        <div style={{ height: portrait ? 2.5 : 1.5, background: alpha(L.ink, 0.18) }} />
        <div style={{ display: 'flex', marginTop: portrait ? 30 : 22, alignItems: 'baseline' }}>
          <div style={{ ...type(footSize, 500), color: alpha(L.ink, 0.7), whiteSpace: 'nowrap' }}>{label}</div>
          <div style={{ marginLeft: 'auto', ...type(portrait ? 44 : 30, 600), fontVariantNumeric: 'tabular-nums', color: alpha(L.ink, 0.7) }}>
            <span style={{ color: L.ink }}>{String(phase + 1).padStart(2, '0')}</span> / 03
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
