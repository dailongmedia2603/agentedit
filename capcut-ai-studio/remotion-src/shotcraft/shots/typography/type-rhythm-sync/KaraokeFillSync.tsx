// 卡拉OK填色随读（karaoke-fill-sync）——旁白读到哪个词，哪个词就从左到右被填亮。
// 居中标语（按宽度自动分行），每个词双层同文本叠放：底层低透明墨色未读字，
// 上层用 mask 按词内进度线性揭开（逐词独立叠层，揭开百分比即词内进度，无需量测词宽；
// 揭开前沿是 ±4% 的柔边而不是硬切口）。正在读的词填强调色，读完 10f 内退成主墨色——
// 强调色只属于"此刻"。词级时间表模拟语速（长词读得慢，词间停顿 = 换气）。
// 读指：正在填的词底下 8px 强调色圆角下划线，右缘跟随填充前沿；读完从左往右收掉（6f），不留线。
// 底部一条旁白波形作静音预览的参照：词内起伏、换气处回落，已播部分着色。
// 0–19f hold；末词在 130f 读完，之后真静止。
//
// [Agent Edit] o chu: text (khau hieu 2-6 tu — tu dong chia dong theo be ngang that; the goc: <= 6 tu / man hinh).
// Lich doc tung tu tinh tu do dai tu (tu dai doc lau hon) trong khung 20–130f, nghi 5f giua cac tu (lay hoi).
// Mau nhan = LOOKS.porcelain.accent (doi theo mau cua video). Khong in hoa cuong buc (chu hoa tieng Viet rat rong):
// giu nguyen chu nhu o chu gui.
// Khung doc (portrait.mode = 'native'): chu to ~240px, toi da 4 dong, song am phong 1.6x, ca khoi can giua khung that.
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { interpolate } from 'remotion';
import { Backdrop, EASE, FONT, ramp } from '../../../fixtures/Polish';
import { LOOKS, alpha } from '../../../fixtures/Look';

export const KARAOKE_FILL_SYNC_DURATION = 150;

type Word = { text: string; start: number; end: number };

const FEATHER = 4; // 揭开前沿柔边（%）
const INK = [23, 24, 28];
const T0 = 20; // 第一个词开读
const T1 = 130; // 最后一个词读完
const PAUSE = 5; // 词间换气

const hexRgb = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [91, 99, 211];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbMix = (a: number[], b: number[], k: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

const KaraokeWord: React.FC<{ word: Word; frame: number; acc: string; ul: number; bd?: boolean }> = ({ word, frame, acc, ul, bd }) => {
  // 词内 linear 填充进度，clamp 保证读完保持（跟语速，不加缓动）
  const p = interpolate(frame, [word.start, word.end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const edge = p * (100 + FEATHER * 2) - FEATHER; // 柔边中心（%），p=0/1 时完全藏 / 完全露
  const mask = `linear-gradient(90deg, #000 ${(edge - FEATHER).toFixed(2)}%, transparent ${(edge + FEATHER).toFixed(2)}%)`;
  const settle = ramp(frame, word.end, 10, EASE.out); // 读完退成主墨色
  const fillColor = rgbMix(hexRgb(acc), INK, settle);
  // 读指：读中跟随前沿，读完 6f 从左往右收掉
  const retract = ramp(frame, word.end, 6, EASE.swift);
  const showLine = frame >= word.start && retract < 1;
  return (
    <span style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
      {/* 底层：低透明墨色未读字 */}
      <span style={{ color: bd ? 'rgba(23,24,28,0.22)' : 'rgba(23,24,28,0.13)' }}>{word.text}</span>
      {/* 上层：按进度从左到右柔边揭开（上下留出叠加符号空间，mask 只控水平） */}
      {p > 0 && (
        <span style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, color: fillColor,
          WebkitMaskImage: mask, maskImage: mask,
          // chu da doc nam tren nen anh AI: bong sang nhe (chu mo chua doc giu nguyen, khong bong -> khong nhoe)
          textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined,
        }}>
          {word.text}
        </span>
      )}
      {/* 读指下划线：右缘跟随填充前沿，读完从左收 */}
      {showLine && (
        <span style={{
          position: 'absolute', bottom: -ul * 0.75, height: ul, borderRadius: ul / 2,
          left: `${(retract * p * 100).toFixed(2)}%`,
          width: `${(Math.max(0, p - retract * p) * 100).toFixed(2)}%`,
          background: acc, boxShadow: `0 2px 10px ${alpha(acc, 0.35)}`,
        }} />
      )}
    </span>
  );
};

// 旁白波形：48 根竖条，按"此刻是否在读词"给包络，确定性哈希给起伏
const BARS = 48;
const WAVE_T0 = 14;
const WAVE_T1 = 136;
const h = (n: number) => {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
};

export const KaraokeFillSync: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  // nen anh AI: bo nen giay code (Backdrop cua Polish); chu nam tren nen them bong sang
  const bd = !!useBackdrop();
  const text = useText('text', 'Nói ít hơn, làm nhiều hơn.');
  const acc = LOOKS.porcelain.accent;
  const words0 = text.split(/\s+/).filter(Boolean);
  // 词级时间表：读窗按字数（+3 基础）分配，词间停 5f
  const n = Math.max(1, words0.length);
  const pause = Math.min(PAUSE, 30 / n);
  const span = T1 - T0 - pause * (n - 1);
  const wts = words0.map((w) => Array.from(w).length + 3);
  const tot = wts.reduce((a, b) => a + b, 0);
  let t = T0;
  const ALL: Word[] = words0.map((w, i) => {
    const d = (span * wts[i]) / tot;
    const o = { text: w, start: t, end: t + d };
    t += d + pause;
    return o;
  });

  // 排版：按实测宽度贪心分行，字号找能放进 maxLines 行的最大值
  const maxW = portrait ? 1680 : 1640;
  const base = portrait ? 240 : 150;
  const maxLines = portrait ? 4 : 3;
  const GAP_EM = 0.37; // 词间距（原版 56px @150）
  const layout = (sz: number) => {
    const rows: Word[][] = [];
    let cur: Word[] = [];
    let wcur = 0;
    for (const w of ALL) {
      const ww = measureText(w.text, fonts.sans, sz, 900) - 0.03 * sz * Array.from(w.text).length;
      const add = cur.length ? GAP_EM * sz + ww : ww;
      if (cur.length && wcur + add > maxW) {
        rows.push(cur);
        cur = [w];
        wcur = ww;
      } else {
        cur.push(w);
        wcur += add;
      }
    }
    if (cur.length) rows.push(cur);
    return rows;
  };
  let SIZE = base;
  let rows = layout(SIZE);
  while (rows.length > maxLines && SIZE > base * 0.5) {
    SIZE = Math.round(SIZE * 0.93);
    rows = layout(SIZE);
  }
  // 单个超长词：再按宽度缩
  SIZE = Math.min(SIZE, ...ALL.map((w) => fitSize(w.text, { family: fonts.sans, size: SIZE, maxWidth: maxW, weight: 900, minSize: base * 0.35, letterSpacingEm: -0.03 })));
  // 行长均衡：行数不变时尽量平均（避免末行孤词）
  if (rows.length > 1) {
    const total = ALL.length;
    for (let tryW = 0; tryW < 1; tryW++) {
      const target = Math.ceil(total / rows.length);
      if (rows[rows.length - 1].length === 1 && total >= rows.length * 2) {
        const r: Word[][] = [];
        for (let k = 0; k < total; k += target) r.push(ALL.slice(k, k + target));
        const fits = r.every((row) => row.reduce((a, w, i) => a + (i ? GAP_EM * SIZE : 0) + measureText(w.text, fonts.sans, SIZE, 900), 0) <= maxW);
        if (fits && r.length === rows.length) rows = r;
      }
    }
  }
  const lineH = SIZE * 1.22;
  const blockH = rows.length * lineH;
  const waveW = portrait ? 900 : 560;
  const waveH = portrait ? 90 : 56;
  const cy = portrait ? SH * 0.47 : 510;
  const blockTop = cy - (blockH + 110 + waveH) / 2 + (portrait ? 0 : -20);
  const waveTop = blockTop + blockH + (portrait ? 140 : 90);
  const ul = portrait ? 12 : 8;

  const speechAt = (f: number) => {
    let e = 0.06;
    for (const w of ALL) {
      const fadeIn = ramp(f, w.start - 2, 3, EASE.out);
      const fadeOut = 1 - ramp(f, w.end - 2, 4, EASE.out);
      e = Math.max(e, fadeIn * fadeOut);
    }
    return e;
  };
  const playhead = (frame - WAVE_T0) / (WAVE_T1 - WAVE_T0);
  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans }}>
      {!bd && <Backdrop tone="light" light={{ x: 0.5, y: 0.22 }} accent={acc} />}

      {/* 标语：居中分行 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: blockTop, display: 'flex', flexDirection: 'column', alignItems: 'center',
        fontSize: SIZE, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: `${lineH}px`,
      }}>
        {rows.map((words, li) => (
          <div key={li} style={{ display: 'flex', gap: GAP_EM * SIZE, height: lineH, whiteSpace: 'nowrap' }}>
            {words.map((w, k) => (
              <KaraokeWord key={k} word={w} frame={frame} acc={acc} ul={ul} bd={bd} />
            ))}
          </div>
        ))}
      </div>

      {/* 旁白波形：已播部分强调色，未播部分淡墨 */}
      <div style={{
        position: 'absolute', left: 960 - waveW / 2, top: waveTop, width: waveW, height: waveH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {Array.from({ length: BARS }, (_, i) => {
          const u = i / (BARS - 1);
          const at = WAVE_T0 + u * (WAVE_T1 - WAVE_T0); // 这根条对应的旁白时刻
          const env = speechAt(at);
          const amp = 0.12 + env * (0.35 + 0.65 * h(i * 3 + 1));
          const played = u <= playhead;
          return (
            <div key={i} style={{
              width: portrait ? 7 : 4, height: `${(amp * 100).toFixed(1)}%`, borderRadius: 4,
              background: played ? acc : 'rgba(23,24,28,0.16)',
              opacity: played ? 0.9 : 1,
            }} />
          );
        })}
      </div>
    </div>
  );
};
