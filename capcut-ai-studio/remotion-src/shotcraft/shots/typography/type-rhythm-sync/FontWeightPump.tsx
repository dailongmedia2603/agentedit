// 字重脉冲（font-weight-pump）——标题笔画随节拍变粗又弹回，像文字跟着低音鼓蹦迪。
//
// 第二轮重设计（夜店海报 · 回声字栈）：
// - look = aurora（深紫夜 · 紫粉霓虹）。主角是 210px 的大字：静止时是细体、字与字之间空着
//   （每个字钉在按 900 字重排好的槽位里），鼓点一到笔画瞬间撑满槽位变成实心黑体，再幂衰减弹回细体——
//   "缝隙一拍一合"本身就是节拍。字不位移、不重排，只有属性在动。
// - 节奏递进（128 BPM，14f 一拍，两小节 + 一记 drop）：
//   第 1 小节只有主字脉冲；第 2 小节上下各长出一行描边回声字，比主字晚 2f 跟着脉冲、并被冲击推开（跟随）；
//   第 9 拍 drop：主字冲到 900 后不再回细，而是落定在 780 字重、填上紫→粉渐变，回声推开后归位，
//   一道横向光带扫过（Q4：只给主角一次）——结尾帧是一张完整的海报。
// - 回弹按"中间先收、两边后收"错开（衰减窗 9f → 13f），读作冲击从中间向两侧散开；
//   每小节第 1 拍是重音：额外 scaleX +6%，染粉色。底部 8+1 格步进音序器作静音参照（亮哪格 = 第几拍）。
// - 不做整画面逐拍泵 / 抖动（节拍性抖动判例）：只有字、字后柔光和音序器格子随拍动。
//
// 时间表（30fps，共 165f）：
//   0–15    预备：细体 LOUDER、音序器空格、眉题（视频品牌标志 + 眉题字）就位，字后光极缓呼吸
//   16–58   第 1 小节 4 拍（16/30/44/58），每拍 9–13f 衰减窗，拍距 14f > 衰减窗
//   64–72   回声行淡入、上下拉开
//   72–114  第 2 小节 4 拍，回声晚 2f 跟拍、被推开 26px
//   128     drop：900 字重 + 渐变 + 光带，~12f 内回落到 780 定格；副标题逐词升起
//   140–165 hold
//
// [Agent Edit] Font dong goi (Be Vietnam Pro) KHONG co truc wght lien tuc: chi co cac do dam tinh 300/400/500/600/700/900.
// Theo duong lui cua the (已知坑): do dam nhay theo bac (luon la bac CO THAT, khong de trinh duyet tu gia lap) + vien chu
// (-webkit-text-stroke cung mau) day dan theo phan du giua 2 bac -> net chu van "phong" lien tuc 300 -> 900 roi xep lai;
// drop dung o 700 + vien (~780). Moi ky tu van ghim trong o rong theo do dam 900 (khong dan lai dong).
// o chu: word (1-3 tu, in hoa — chu chinh nhun theo nhip), subtitle (hien sau drop), kicker (goc trai tren, tuy chon).
// Khung doc (portrait.mode = 'native'): chu chinh tach dong theo tu de to nhat co the (<= 3 dong, toi da ~420px),
// dong vong vang tren / duoi bam dong dau / dong cuoi; may tao nhip phong 1.6x dat duoi.
import { useBackdrop, useBrand, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const FONT_WEIGHT_PUMP_DURATION = 165;

const L = LOOKS.aurora;

const BEATS = [16, 30, 44, 58, 72, 86, 100, 114];
const DROP = 128;
const DOWN = new Set([0, 4]); // 每小节第 1 拍重音
const W_REST = 300; // 静止字重（细；内置字体最细档）
const W_PEAK = 900;
const W_FINAL = 780; // drop 后定格字重（700 档 + 描边补足）
const DECAY = 9; // 中心字衰减窗
const SPREAD = 1.6; // 每离中心一字，衰减窗多 1.6f
const ECHO_IN = 64;
const LAG = 2; // 回声比主字晚 2f
const STEPS = [300, 400, 500, 600, 700, 900]; // 内置字体实有字重

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const hex = (c: string) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
const mixRgb = (a: string, b: string, k: number) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};

// 连续字重 → 实有档位 + 描边补差（描边宽度按两档之间的笔画增量估算，随字号缩放）
const stepWeight = (w: number, size: number) => {
  let lo = STEPS[0];
  let hi = STEPS[STEPS.length - 1];
  for (let i = 0; i < STEPS.length - 1; i++) {
    if (w >= STEPS[i] && w <= STEPS[i + 1]) { lo = STEPS[i]; hi = STEPS[i + 1]; break; }
  }
  if (w >= hi) return { weight: hi, stroke: 0 };
  const r = (w - lo) / Math.max(1, hi - lo);
  return { weight: lo, stroke: r * size * 0.00011 * (hi - lo) };
};

// 命中后幂衰减包络：t=0 → 1，t>=decay → 精确 0
const envAt = (frame: number, beat: number, decay: number) => {
  const t = frame - beat;
  if (t < 0 || t >= decay) return 0;
  return Math.pow(1 - t / decay, 0.8);
};
// 某帧最大包络 + 拍序号（拍距 14f > 最长衰减窗，同一时刻只有一个活跃拍）
const pulse = (frame: number, decay: number) => {
  let env = 0;
  let beat = -1;
  BEATS.forEach((b, i) => {
    const e = envAt(frame, b, decay);
    if (e > env) { env = e; beat = i; }
  });
  return { env, beat };
};
// drop：冲到 1 再回落到定格值
const dropEnv = (frame: number, decay: number) => {
  const t = frame - DROP;
  if (t < 0) return 0;
  const fin = (W_FINAL - W_REST) / (W_PEAK - W_REST);
  return fin + (1 - fin) * Math.pow(1 - clamp01(t / (decay + 4)), 1.4);
};

// 一行字：每个字钉在 900 字重槽位里原位变粗
const Row: React.FC<{ text: string; size: number; frame: number; gIdx: number; gN: number; lag?: number; outline?: boolean; opacity?: number }> = ({ text, size, frame, gIdx, gN, lag = 0, outline = false, opacity = 1 }) => {
  const f = frame - lag;
  const drop = clamp01(f - DROP + 1) > 0;
  const chars = Array.from(text);
  const center = (chars.length - 1) / 2;
  const tsh = useBackdrop() ? '0 2px 18px rgba(0,0,0,0.55)' : ''; // chu tren nen anh AI: bong do nhe
  const grad = (i: number) => mixRgb(L.accent, L.accent2, gN > 1 ? (gIdx + i) / (gN - 1) : 0); // drop 后紫→粉渐变（逐字取色）
  return (
    <div style={{ display: 'flex', whiteSpace: 'pre', fontFamily: FONT.sans, fontSize: size, fontWeight: W_REST, letterSpacing: '-0.01em', lineHeight: 1, opacity }}>
      {chars.map((ch, i) => {
        const decay = DECAY + Math.max(0, Math.abs(i - center) - 0.5) * SPREAD;
        const { env: e0, beat } = pulse(f, decay);
        const de = dropEnv(f, decay);
        const e = Math.max(e0, de);
        const { weight, stroke } = stepWeight(W_REST + (W_PEAK - W_REST) * e, size);
        const down = beat >= 0 && DOWN.has(beat);
        const hitCol = down ? L.accent2 : L.accent;
        const tint = drop ? 1 : Math.min(1, e0 * 1.25);
        const col = drop ? grad(i) : mixRgb(L.ink, hitCol === L.accent2 ? L.accent2 : '#c9b8ff', tint);
        const shine = drop ? 0.35 + 0.65 * Math.pow(1 - clamp01((f - DROP) / 24), 2) : e0;
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
            <span style={{ visibility: 'hidden', fontWeight: W_PEAK }}>{ch}</span>
            <span style={{
              position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', fontWeight: weight,
              color: outline ? 'transparent' : col,
              WebkitTextStroke: outline ? `2px ${alpha(drop ? L.accent : L.ink, 0.55)}` : stroke > 0.2 ? `${stroke.toFixed(2)}px ${col}` : undefined,
              textShadow: !outline && shine > 0.05
                ? `0 0 ${(18 * shine).toFixed(1)}px ${alpha(drop ? L.accent2 : hitCol, 0.5 * shine)}, 0 0 ${(70 * shine).toFixed(1)}px ${alpha(drop ? L.accent2 : hitCol, 0.35 * shine)}${tsh ? ', ' + tsh : ''}`
                : !outline && tsh ? tsh : 'none',
            }}>
              {ch}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const FontWeightPump: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  // nen anh AI: Stage tu bo gradient; quang sang sau chu (nhip trong) giam con nua; chu tren nen them bong
  const bd = !!useBackdrop();
  const tsh = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;
  const word = useText('word', 'BÙNG NỔ').trim();
  const subtitle = useText('subtitle', 'Cắt đúng nhịp, bùng nổ đúng lúc nhạc dồn.');
  const kicker = useText('kicker', 'Đêm nhạc cuối tuần');
  const K = portrait ? 1.45 : 1; // 竖版 UI 放大

  // 主字排版：按 900 字重量宽；横版单行 ≤240px；竖版按词折行（≤3 行）取最大字号
  const maxW = portrait ? 1720 : 1640;
  let lines = [word];
  let SIZE = Math.min(210, fitSize(word, { family: fonts.sans, size: 210, maxWidth: maxW, weight: W_PEAK, minSize: 60 }));
  if (portrait) {
    const ws = word.split(/\s+/).filter(Boolean);
    let best = { size: Math.min(420, fitSize(word, { family: fonts.sans, size: 420, maxWidth: maxW, weight: W_PEAK, minSize: 60 })), lines: [word] };
    for (let n = 2; n <= Math.min(3, ws.length); n++) {
      // 均分词到 n 行（按字数贪心）
      const per = Math.ceil(ws.length / n);
      const ls: string[] = [];
      for (let k = 0; k < ws.length; k += per) ls.push(ws.slice(k, k + per).join(' '));
      const sz = Math.min(420, ...ls.map((l) => fitSize(l, { family: fonts.sans, size: 420, maxWidth: maxW, weight: W_PEAK, minSize: 60 })));
      if (sz > best.size * 1.15) best = { size: sz, lines: ls };
    }
    SIZE = best.size;
    lines = best.lines;
  }
  const pitch = SIZE * 1.28; // 越南语大写叠加符号（Ổ Ấ）高出字顶 ~0.35em，行距放宽
  const blockH = SIZE + (lines.length - 1) * pitch;
  const CY = portrait ? Math.round(SH * 0.44) : 500; // 主字块中心
  const top0 = CY - blockH / 2;
  const ECHO_DY = 1.12 * SIZE; // 回声行距（越南语叠加符号略高，比原版 0.85 拉开）
  const gN = Array.from(lines.join('')).length;

  const { env, beat } = pulse(frame, DECAY);
  const dEnv = frame >= DROP ? Math.pow(1 - clamp01((frame - DROP) / 16), 1.2) : 0;
  const down = beat >= 0 && DOWN.has(beat);
  const scaleX = 1 + 0.06 * (down ? env : 0) + 0.08 * dEnv; // 重音拍 / drop 横向撑开（transform 不改排版）
  const intro = ramp(frame, 0, 12, EASE.out);
  // 回声：64f 起淡入并拉开；每拍晚 2f 被推开 26px；drop 推开 60px 后归位
  const echoIn = ramp(frame, ECHO_IN, 10, EASE.snappy);
  const { env: eEnv } = pulse(frame - LAG, DECAY + 2);
  const eDrop = frame >= DROP + LAG ? Math.pow(1 - clamp01((frame - DROP - LAG) / 18), 1.6) : 0;
  const echoPush = (mix(-40, 0, echoIn) + 26 * eEnv * echoIn + 60 * eDrop) * K;
  const breathe = 0.5 + 0.5 * Math.sin(frame / 9);
  const glowA = 0.1 + 0.05 * breathe * (1 - clamp01(frame / 16)) + 0.3 * env * (down ? 1.3 : 1) + 0.4 * dEnv + (frame >= DROP ? 0.12 : 0);
  // 横向光带：drop 时从左扫到右一次
  const streak = ramp(frame, DROP, 16, EASE.out);
  const bar = frame >= BEATS[4] ? 2 : 1;

  // 副标题：drop 后逐词升起
  const subSize = portrait ? 62 : 40;
  const subLines = subtitle ? wrapLines(subtitle, fonts.sans, subSize, portrait ? 1600 : 1500, 500, portrait ? 3 : 2) : [];
  const echoBottom = top0 + blockH + ECHO_DY + 26 * K;
  const subTop = portrait ? echoBottom + 120 : 866;
  const seqTop = portrait ? SH - 420 : 944;
  const nSubW = subtitle.split(/\s+/).filter(Boolean).length;
  let wi = 0;
  const label: React.CSSProperties = { fontFamily: FONT.sans, fontSize: 30 * K, fontWeight: 600, letterSpacing: '0.16em', lineHeight: 1.3, whiteSpace: 'nowrap' };

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.5 }} fill={{ x: 0.85, y: 0.15 }} intensity={0.7} />

      {/* 字后柔光：随拍明暗，只在标题身后 */}
      <div style={{
        position: 'absolute', left: 260 - (portrait ? 200 : 0), right: 260 - (portrait ? 200 : 0), top: CY - 240 - blockH / 2 + SIZE / 2, height: 480 + blockH - SIZE, borderRadius: '50%',
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(down || frame >= DROP ? L.accent2 : L.accent, Math.min(0.6, glowA) * (bd ? 0.5 : 1))} 0%, ${alpha(L.accent, 0)} 100%)`,
        mixBlendMode: 'screen',
      }} />

      {/* 眉题 */}
      <div style={{ position: 'absolute', left: 120, top: portrait ? 240 : 66, display: 'flex', alignItems: 'center', gap: 14 * K, opacity: intro, maxWidth: portrait ? 1680 : 1100, textShadow: tsh }}>
        {brand ? <ShotcraftMark size={46 * K} tone="dark" /> : null}
        {kicker ? <span style={{ ...label, fontWeight: 700, color: L.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{kicker.toUpperCase()}</span> : null}
      </div>
      <div style={{ position: 'absolute', right: 120, top: portrait ? 240 + 46 * K + 30 : 70, ...label, color: L.ink2, opacity: intro, fontVariantNumeric: 'tabular-nums', textShadow: tsh }}>
        128 BPM <span style={{ color: bd ? L.ink2 : L.ink3, marginLeft: 18 * K }}>{`Ô NHỊP ${bar} / 2`}</span>
      </div>

      {/* 回声行（描边）：上 = 首行、下 = 末行 */}
      {[-1, 1].map((s) => {
        const li = s < 0 ? 0 : lines.length - 1;
        const y = (s < 0 ? top0 : top0 + (lines.length - 1) * pitch) + s * (ECHO_DY + echoPush);
        return (
          <div key={s} style={{
            position: 'absolute', left: 0, right: 0, top: y, display: 'flex', justifyContent: 'center',
            opacity: echoIn, transform: `scaleX(${(1 + (scaleX - 1) * 0.5).toFixed(4)})`,
          }}>
            <Row text={lines[li]} size={SIZE} frame={frame} gIdx={0} gN={gN} lag={LAG} outline opacity={0.75} />
          </div>
        );
      })}

      {/* 主字 */}
      {lines.map((l, li) => (
        <div key={li} style={{
          position: 'absolute', left: 0, right: 0, top: top0 + li * pitch, display: 'flex', justifyContent: 'center',
          transform: `scaleX(${scaleX.toFixed(4)})`,
        }}>
          <Row text={l} size={SIZE} frame={frame} gIdx={Array.from(lines.slice(0, li).join('')).length} gN={gN} />
        </div>
      ))}

      {/* drop 光带：一次，横穿主字 */}
      {streak > 0 && streak < 1 && (
        <div style={{
          position: 'absolute', left: mix(-600, 1920, streak), top: CY - 4 * K, width: 600, height: 6 * K, borderRadius: 3 * K,
          background: `linear-gradient(90deg, ${alpha('#ffffff', 0)} 0%, ${alpha('#ffffff', 0.9)} 70%, ${alpha('#ffffff', 0)} 100%)`,
          boxShadow: `0 0 30px ${alpha(L.accent2, 0.8)}`, opacity: 1 - streak * 0.6, mixBlendMode: 'screen',
        }} />
      )}

      {/* 副标题：drop 后逐词升起（遮罩留足越南语叠加符号空间） */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: subTop, textAlign: 'center', fontFamily: FONT.sans, fontSize: subSize, fontWeight: 500, color: L.ink2, textShadow: tsh }}>
        {subLines.map((l, li) => (
          <div key={li} style={{ lineHeight: `${Math.round(subSize * 1.3)}px`, whiteSpace: 'nowrap' }}>
            {l.split(/\s+/).filter(Boolean).map((w, k) => {
              const p = ramp(frame, DROP + 8 + (wi++) * Math.min(2.5, 18 / Math.max(1, nSubW)), 14, EASE.snappy);
              return (
                <span key={k} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em 0.12em -0.26em' }}>
                  <span style={{ display: 'inline-block', transform: `translateY(${((1 - p) * 1.7).toFixed(4)}em)` }}>{w}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* 步进音序器：8 拍 + drop */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: seqTop, display: 'flex', justifyContent: 'center', opacity: intro }}>
        <div style={{ display: 'flex', gap: 16, transform: `scale(${portrait ? 1.6 : 1})`, transformOrigin: '50% 0' }}>
          {[...BEATS, DROP].map((b, i) => {
            const isDrop = i === BEATS.length;
            const e = isDrop ? dEnv : envAt(frame, b, DECAY);
            const passed = frame >= b;
            const dn = DOWN.has(i) || isDrop;
            const col = dn ? L.accent2 : L.accent;
            return (
              <div key={i} style={{
                width: isDrop ? 132 : 54, height: 54, borderRadius: 12, position: 'relative', marginLeft: i === 4 || isDrop ? 22 : 0,
                background: alpha(L.ink, 0.05), boxShadow: `inset 0 0 0 1.5px ${alpha(dn ? L.accent2 : L.ink, dn ? 0.35 : 0.14)}`,
                transform: `scale(${(1 + 0.12 * e).toFixed(3)})`,
              }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 12, background: col,
                  opacity: e > 0.02 ? Math.max(isDrop ? 0.9 : 0, 0.35 + 0.65 * e) : passed ? (isDrop ? 0.9 : 0.28) : 0,
                  boxShadow: e > 0.02 ? `0 0 ${(30 * e).toFixed(1)}px ${alpha(col, 0.8)}` : 'none',
                }} />
                {isDrop && (
                  <span style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT.sans, fontSize: 22, fontWeight: 700, letterSpacing: '0.2em', color: passed ? L.onAccent : L.ink3,
                  }}>
                    ĐỈNH
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
