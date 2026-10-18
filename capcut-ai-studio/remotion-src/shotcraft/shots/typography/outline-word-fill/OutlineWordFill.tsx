// outline-word-fill — Outline→Solid Fill 空心字瞬时点亮
// 空心词从约 3.2 倍急缓收缩落位居中；背后虚线大圆从画外持续收缩到字周围并缓慢自转，两侧水平虚线从画框
// 边缘向内伸向圆（"瞄准"）；描边先预热增亮，随即实心字一帧内硬切点亮（无慢扫），一闪辉光后定格。
//
// 第二轮重设计（制图 HUD · 白热点亮）：
// - look = ember（暖黑 · 橙）。原生 1920 坐标重写（不再走 480×270 DesignStage）：220px / 500 的 Helvetica Neue
//   空心字（2px 暖灰描边），r=410 虚线圆 + 内圈 72 格刻度环（每 30° 一根长刻度，反向慢转）+ 四个套准刻度，两侧水平虚线带 mono 读数
//   前后对比读数（旧值 vs 新值），瞄准的过程就有了内容。
// - 点亮：第 54 帧硬切成白热实心字（#fff5ee），同帧圆与水平线"锁定"成橙色、右侧读数 4 hrs 变橙；
//   辉光（白 + 橙两层）8f 衰完；一道冲击环从圆边外扩 14f 消散（只此一次）；舞台主光同步脉冲一下再回落。
// - 主圈自转在点亮那一刻刹停（"锁定"），内圈刻度环继续反向慢转。
// - 曲线：字急缩 11f（EASE.snappy，按 scale 速度给瞬时失焦）、圆慢收 44f（EASE.out，全片最慢的呼吸），
//   快慢对比是这张卡的节奏；水平线 18f ease-out 内伸，停在圆边外 28px。
// - 空心字必须用静态字体：可变字体字形内部有重叠轮廓，text-stroke 会描出 a/e 内部交叠线（Be Vietnam Pro 500 为静态字重）。
//
// 时间表（30fps，共 90f）：
//   0–2    舞台光与浮尘已在（第 1 帧不空）
//   2–13   空心字 3.2→1 急缩（2–8 淡入）
//   8–52   虚线圆 2.8→1 慢收 + 自转（8–18 淡入）
//   28–46  两侧水平虚线内伸、读数淡入
//   44–53  描边预热：暖灰 → 亮橙白
//   54     硬切点亮 + 锁定（主圈刹停）；54–62 辉光衰减；54–68 冲击环
//   56–70  眉题 / 副行在圆内升起
//   70–90  hold 20f（极缓推进 1.5%）
//
// [Agent Edit] o chu: word (1 tu / cum ngan duoc "dong dinh"; dai -> co chu thu nho, qua dai -> 2 dong; vong tron va diem
// dung cua vach ngang tu co gian theo be ngang chu that) / kicker (dong nho tren chu; trong -> ten thuong hieu) /
// subtitle (cau phu duoi chu, toi da 2 dong trong vong tron) / before_label + before (so cu, ben trai) /
// after_label + after (so moi, ben phai, sang cam khi bat sang). Font: Be Vietnam Pro 500 (ban tinh, du dau tieng Viet).
// Khung doc (native): ca cum phong 1.3x dat giua khung; so doc truoc/sau dat tren / duoi vong tron (chu lon hon).
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useShotFonts, useBrand, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, mix, ramp } from '../../../fixtures/Polish';
import { Dust, LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const OUTLINE_WORD_FILL_DURATION = 90; // 3.0s @30fps

const L = LOOKS.ember;
const CX = 960;
const R0 = 410; // 虚线圆半径（基准）
const SIZE0 = 220;
const POP = 54; // 硬切点亮帧

const lerpColor = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(mix(a[0], b[0], t))},${Math.round(mix(a[1], b[1], t))},${Math.round(mix(a[2], b[2], t))})`;
const GREY: [number, number, number] = [138, 118, 104]; // 暖灰描边 / 制图线
const HOT: [number, number, number] = [255, 196, 150]; // 预热后的亮橙白
const ORANGE: [number, number, number] = [255, 107, 44];

// 均衡折行：行数不变、宽度收到最窄（避免末行只剩一个词）
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

const wordScaleAt = (f: number) => mix(3.2, 1, ramp(f, 2, 11, EASE.snappy));

export const OutlineWordFill: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const word = useText('word', 'Nhanh hơn');
  const kicker = useText('kicker', '') || BRAND.name;
  const subtitle = useText('subtitle', 'Một câu lệnh, ra ngay video hoàn chỉnh.');
  const beforeLabel = useText('before_label', 'TRƯỚC');
  const beforeVal = useText('before', '1 tuần');
  const afterLabel = useText('after_label', 'SAU');
  const afterVal = useText('after', '4 giờ');

  const u = portrait ? 1.6 : 1; // 竖屏整组放大
  const CY = SH / 2;
  // 词：220/500 一行；宽了先放大圆（≤ R 上限），再缩字；仍过窄 → 两行
  const RMAX = portrait ? 880 / u : 500;
  const wordFam = fonts.sans;
  const wW = (t: string, sz: number) => measureText(t, wordFam, sz, 500);
  let lines = [word];
  let SIZE = fitSize(word, { family: wordFam, size: SIZE0, maxWidth: RMAX * 2 * 0.84, weight: 500, minSize: 60 });
  if (SIZE < 150 && word.split(/\s+/).length > 1) {
    // 两行：选使较宽一行最窄的断点
    const ws0 = word.split(/\s+/).filter(Boolean);
    let two = [word];
    let best = Infinity;
    for (let k = 1; k < ws0.length; k++) {
      const a = ws0.slice(0, k).join(' ');
      const b = ws0.slice(k).join(' ');
      const m = Math.max(wW(a, 100), wW(b, 100));
      if (m < best) {
        best = m;
        two = [a, b];
      }
    }
    const s2 = Math.min(...two.map((l) => fitSize(l, { family: wordFam, size: 180, maxWidth: RMAX * 2 * 0.74, weight: 500, minSize: 60 })));
    if (s2 > SIZE) {
      lines = two;
      SIZE = s2;
    }
  }
  const LH = SIZE * 1.16;
  const wordW = Math.max(...lines.map((l) => wW(l, SIZE)));
  const wordH = lines.length * LH;
  const R = Math.max(R0, Math.min(RMAX, Math.hypot(wordW / 2, wordH / 2) + 70));
  // 副行：圆内、词下方，≤2 行
  const subMax = R * 1.5;
  const SUB0 = portrait ? 46 : 40;
  let subLines = subtitle ? wrapLines(subtitle, fonts.sans, SUB0, subMax, 450, 2) : [];
  const subSize = subLines.length ? Math.min(...subLines.map((l) => fitSize(l, { family: fonts.sans, size: SUB0, maxWidth: subMax, weight: 450, minSize: 28 }))) : SUB0;
  if (subLines.length) subLines = balanced(subtitle, fonts.sans, subSize, subMax, 450, 2);
  const kickSize = fitSize(kicker, { family: fonts.mono, size: portrait ? 32 : 28, maxWidth: R * 1.3 - 56, weight: 600, letterSpacingEm: 0.16, minSize: 20 });

  const born = ramp(frame, 2, 6, EASE.out);
  const ws = wordScaleAt(frame);
  const zoomBlur = Math.min(6, Math.abs(wordScaleAt(frame + 0.5) - wordScaleAt(frame - 0.5)) * 9);
  const cin = ramp(frame, 8, 10, EASE.out);
  const shrink = ramp(frame, 8, 44, EASE.out);
  const ext = ramp(frame, 28, 18, EASE.out);
  const warm = ramp(frame, 44, 9, EASE.swift);
  const lit = frame >= POP ? 1 : 0; // 硬切：不存在中间态
  const flash = lit * (1 - ramp(frame, POP, 8, EASE.out));
  const lock = lit * (0.55 + 0.45 * flash); // 锁定后保持一半橙色
  const shock = ramp(frame, POP, 14, EASE.out);
  // 主圈自转到点亮那一刻"锁死"（再滑 6° 刹停）；内圈刻度环继续反向慢转，hold 段画面仍在呼吸
  const rot = 0.22 * Math.min(frame, POP) + (frame > POP ? 6 * ramp(frame, POP, 14, EASE.out) : 0);
  const rotIn = -0.14 * frame;
  const sub = (d: number) => ramp(frame, 56 + d, 14, EASE.snappy);
  const push = 1 + 0.015 * ramp(frame, 0, OUTLINE_WORD_FILL_DURATION, EASE.swift);

  const strokeC = lerpColor(GREY, HOT, warm);
  const lineC = lit ? lerpColor([150, 120, 100], ORANGE, lock) : lerpColor(GREY, [150, 120, 100], warm);
  const lineEnd = CX - R * u - 28; // 水平线停在圆边外 28px

  // 读数：横屏在水平线上方左右；竖屏放到圆的上方（旧）/ 下方（新），字号放大
  const rdSize = portrait ? 64 : 30;
  const rdMaxW = portrait ? 1920 - 240 : lineEnd - 120 - 10;
  const rdFit = (a: string, b: string) => fitSize(`${a} ${b}`, { family: fonts.mono, size: rdSize, maxWidth: rdMaxW, weight: 500, letterSpacingEm: 0.12, minSize: 18 });
  const rdL = rdFit(beforeLabel, beforeVal);
  const rdR = rdFit(afterLabel, afterVal);
  const rdTopL = portrait ? CY - R * u - 250 : CY - 74;
  const rdTopR = portrait ? CY + R * u + 160 : CY - 74;
  // [Agent Edit] nen anh AI: bo nen toi + bui (Stage tu trong suot); chu dat thang tren nen co bong toi nhe
  const bd = useBackdrop();
  const TSH = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.5 }} fill={{ x: 0.5, y: 1.1 }} intensity={0.45 + 0.5 * flash + 0.15 * lit} grain={0.09} vignette={0.6}>
        {!bd && Array.from({ length: Math.ceil(SH / 1080) }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 1080, height: 1080 }}>
            <Dust look={L} count={22} seed={3 + i * 11} drift={0.12} opacity={0.4} />
          </div>
        ))}
      </Stage>

      <AbsoluteFill style={{ transform: `scale(${push.toFixed(5)})` }}>
        <svg width={1920} height={SH} viewBox={`0 0 1920 ${SH}`} style={{ position: 'absolute', inset: 0 }}>
          {/* 冲击环：点亮那一下从圆边外扩消散（只此一次） */}
          {lit > 0 && shock < 1 && (
            <circle cx={CX} cy={CY} r={R * u + shock * 160 * u} fill="none" stroke={alpha('#ff8a4c', 0.55 * (1 - shock))} strokeWidth={2 + 10 * (1 - shock)} />
          )}
          <g transform={`translate(${CX} ${CY}) scale(${(mix(2.8, 1, shrink) * u).toFixed(5)})`} opacity={cin}>
            {/* 主虚线圆（自转） */}
            <g transform={`rotate(${rot.toFixed(3)})`}>
              <circle r={R} fill="none" stroke={lineC} strokeWidth={2} strokeDasharray="22 18" />
              {[0, 90, 180, 270].map((a) => (
                <line key={a} x1={0} y1={-R - 22} x2={0} y2={-R + 10} stroke={lineC} strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${a})`} />
              ))}
            </g>
            {/* 内圈刻度环（反向慢转，降亮：纹理层） */}
            <g transform={`rotate(${rotIn.toFixed(3)})`}>
              <circle r={R - 34} fill="none" stroke={lineC} strokeWidth={1} opacity={0.35} />
              {Array.from({ length: 72 }, (_, i) => {
                const major = i % 6 === 0;
                return (
                  <line key={i} x1={0} y1={-(R - 34)} x2={0} y2={-(R - (major ? 58 : 44))} stroke={lineC}
                    strokeWidth={major ? 2 : 1.2} opacity={major ? 0.7 : 0.32} transform={`rotate(${i * 5})`} />
                );
              })}
            </g>
          </g>
          {/* 两侧水平虚线：从画框边缘内伸到圆边外 */}
          <line x1={0} y1={CY} x2={lineEnd * ext} y2={CY} stroke={lineC} strokeWidth={2 * u} strokeDasharray="14 12" opacity={ext} />
          <line x1={1920} y1={CY} x2={1920 - lineEnd * ext} y2={CY} stroke={lineC} strokeWidth={2 * u} strokeDasharray="14 12" opacity={ext} />
          {/* 线端准星点 */}
          <circle cx={lineEnd * ext} cy={CY} r={5 * u} fill={lineC} opacity={ext} />
          <circle cx={1920 - lineEnd * ext} cy={CY} r={5 * u} fill={lineC} opacity={ext} />
        </svg>

        {/* 读数：左 = 旧值（弱），右 = 新值（点亮时变橙） */}
        {beforeVal ? (
          <div style={{ position: 'absolute', left: 120, top: rdTopL, opacity: ext, transform: `translateX(${((1 - ext) * -30).toFixed(2)}px)`, ...type(rdL, 500, { mono: true }), letterSpacing: '0.12em', lineHeight: 1.3, color: L.ink3, whiteSpace: 'nowrap', textShadow: TSH }}>
            {beforeLabel} <span style={{ color: L.ink2 }}>{beforeVal}</span>
          </div>
        ) : null}
        {afterVal ? (
          <div style={{ position: 'absolute', right: 120, top: rdTopR, opacity: ext, transform: `translateX(${((1 - ext) * 30).toFixed(2)}px)`, ...type(rdR, 500, { mono: true }), letterSpacing: '0.12em', lineHeight: 1.3, color: L.ink3, textAlign: 'right', whiteSpace: 'nowrap', textShadow: TSH }}>
            {afterLabel} <span style={{ color: lit ? L.accent : L.ink2, textShadow: lit && flash > 0.02 ? `0 0 ${(18 * flash).toFixed(1)}px ${alpha(L.accent, 0.8)}` : TSH }}>{afterVal}</span>
          </div>
        ) : null}

        <div style={{ position: 'absolute', left: CX, top: CY, width: 0, height: 0, transform: `scale(${u})` }}>
          {/* 眉题 = 品牌落款：小号标志（有品牌时）+ 文字 */}
          {kicker ? (
            <div style={{ position: 'absolute', left: -R, width: R * 2, top: -wordH / 2 - 30 - kickSize * 1.4 - (lines.length > 1 ? 10 : 0), display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, opacity: sub(0), transform: `translateY(${((1 - sub(0)) * 16).toFixed(2)}px)`, ...type(kickSize, 600, { mono: true }), letterSpacing: '0.16em', lineHeight: 1.3, color: L.ink2, whiteSpace: 'nowrap', textShadow: TSH }}>
              {brand ? <ShotcraftMark size={40} tone="dark" /> : null}
              <span>{kicker}</span>
            </div>
          ) : null}
          {subLines.map((l, i) => (
            <div key={i} style={{ position: 'absolute', left: -R, width: R * 2, top: wordH / 2 + 20 + i * subSize * 1.25, textAlign: 'center', opacity: sub(3 + i * 2), transform: `translateY(${((1 - sub(3 + i * 2)) * 16).toFixed(2)}px)`, ...type(subSize, 450), letterSpacing: '-0.01em', lineHeight: 1.25, color: L.ink2, whiteSpace: 'nowrap', textShadow: TSH }}>
              {l}
            </div>
          ))}

          {/* 双层字：底层空心描边、顶层白热实心（硬切） */}
          <div style={{
            position: 'absolute', left: 0, top: 0, fontFamily: wordFam, fontSize: SIZE, fontWeight: 500, letterSpacing: '0.005em', lineHeight: 1.16, textAlign: 'center',
            opacity: born, transform: `translate(-50%, -50%) scale(${ws.toFixed(5)})`, whiteSpace: 'nowrap',
          }}>
            <div style={{
              color: 'transparent', WebkitTextStroke: `2px ${strokeC}`, opacity: 1 - lit,
              filter: zoomBlur > 0.05 ? `blur(${(zoomBlur / ws).toFixed(2)}px)` : warm > 0.01 ? `drop-shadow(0 0 ${(10 * warm).toFixed(1)}px ${alpha('#ff9a5c', 0.5 * warm)})` : undefined,
            }}>
              {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <div style={{
              position: 'absolute', inset: 0, color: '#fff5ee', opacity: lit,
              textShadow: flash > 0.01 ? `0 0 ${(14 * flash).toFixed(1)}px rgba(255,255,255,${(0.7 * flash).toFixed(3)}), 0 0 ${(60 * flash).toFixed(1)}px ${alpha(L.accent, 0.65 * flash)}${bd ? ', ' + TSH : ''}` : `0 0 40px ${alpha(L.accent, 0.18)}${bd ? ', ' + TSH : ''}`,
            }}>
              {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
