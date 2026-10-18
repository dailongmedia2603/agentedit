// 对开门裂幕（barn-door-split-reveal）——旧页从正中裂成两扇门向外加速让位，新页从门缝里迎上来。
//
// 第二轮重设计（余烬 · 版本更替发布）：
// - look = ember（暖黑 · 橙）。语义是"新旧交替"：旧页 = 现行版（旧标题），
//   冷灰、无强调色、像一块熄了火的金属板；新页 = 新版发布海报，暖黑舞台 + 余烬橙，眉题前挂品牌标志（有品牌时）。
//   两页同一版式、同一槽位（眉题 / 220px 字标 / 副题 / 三枚数据），所以门一开，旧标题的位置上站着新标题——取代关系一眼可读。
// - 门是有厚度的实体板：内缘 10px 切面在门缝光里被照亮（橙色轮廓光），门面靠近裂缝处被光染暖；
//   门缝里透出的是新页的光——先是一条发丝亮线自中点向上下描出（预告裂点），再撑开一道光缝，
//   门滑走时新页带着一次过曝光束（屏幕混合，随门远去衰减）显影。
// - 运动：裂缝预张 ease-in（预备）接门 ease-in 加速 1000px（"让位"不是"被推走"），按速度挂横向运动模糊；
//   新页 1.08→1 迎上来（snappy，晚门 2f 起跳）；落定后副题逐词升起、三枚数据从旧值滚到新值
//   （数字本身讲出"新版更好"）。
//
// 时间表（30fps，共 150f）：
//   0–24    旧页建立：冷灰海报，相机极缓推近 1→1.015；第 0 帧即完整画面
//   20–30   预告：中缝发丝亮线自中点向上下描出（snappy 10f），两侧门面被光染暖
//   30–40   预备：缝隙 ease-in 撑开 0→16px，光缝变亮
//   40–64   主动作：两扇门各 translateX ∓1000（ease-in 24f）+ 横向运动模糊
//   42–78   新页 1.08→1 迎上（snappy 36f）；过曝光束 40–74 衰减
//   64–110  跟随：副题逐词升起（64）、三枚数据错峰滚到新值（72–104）
//   110–150 hold：余烬缓缓上浮、字标光呼吸、相机极缓推近 1.8%，尾帧是完整的发布海报
//
// [Agent Edit] o chu: old_kicker / old_title / old_subtitle (trang CU, xam lanh) va new_kicker / new_title / new_subtitle
// (trang MOI, tu cuoi cua new_title to gradient cam) + stat_labels / stat_old / stat_new (0-3 o so lieu, so cu lan toi so moi;
// chu so trich tu chu that, giu tien to / don vi cua so moi). Hai trang dung CHUNG mot bo cuc tinh tu chu that (dai nhat).
// Khung doc (native): cua cao bang ca khung (height), khoi noi dung to hon (tieu de 250, so lieu 3 cot rong) dat giua khung.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, useBrand, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';

import { EASE, FONT, SpeedBlur, bezier, mix, ramp, velocity } from '../../../fixtures/Polish';
import { Dust, LOOKS, Stage, alpha, glow, stagger, type } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const BARN_DOOR_SPLIT_DURATION = 150;

const L = LOOKS.ember;
// 旧页：冷灰金属板（刻意不用强调色）
const OLD = { bg0: '#1d1f23', bg1: '#141518', ink: '#9a9ea7', ink2: '#6f737b', ink3: '#4a4d54', line: 'rgba(255,255,255,0.07)' };

const CRACK = 20; // 发丝亮线起
const GAP = 30; // 缝隙预张起
const SLIDE = 40; // 门开始加速
const SLIDE_D = 24;
const SLIDE_EASE = bezier(0.42, 0, 0.8, 0.25); // ease-in（≈cubic-in 偏猛）：起步可见、越走越快，不是最后一帧才消失

const gapAt = (f: number) => 16 * ramp(f, GAP, 10, EASE.exit);
const slideAt = (f: number) => 1000 * ramp(f, SLIDE, SLIDE_D, SLIDE_EASE);
const doorAt = (f: number) => gapAt(f) / 2 + slideAt(f); // 单扇外移量

// 数字滚动：从文字里抽出第一个数（支持 , . 小数 / 千分位），旧数 → 新数，按新值的前后缀与小数位显示
const parseNum = (t: string) => {
  const m = /(-?\d[\d.,]*)/.exec(t);
  if (!m) return null;
  const raw = m[1];
  const lastSep = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
  let dec = 0;
  let num: number;
  if (lastSep >= 0 && raw.length - lastSep - 1 !== 3) {
    dec = raw.length - lastSep - 1;
    num = parseFloat(raw.slice(0, lastSep).replace(/[.,]/g, '') + '.' + raw.slice(lastSep + 1));
  } else num = parseFloat(raw.replace(/[.,]/g, ''));
  const decSep = lastSep >= 0 && dec > 0 ? raw[lastSep] : ',';
  const group = raw.length > 3 && dec === 0 && lastSep >= 0 ? raw[lastSep] : '';
  return { num, dec, decSep, group, pre: t.slice(0, m.index), post: t.slice(m.index + raw.length) };
};
const fmtNum = (v: number, dec: number, decSep: string, group: string) => {
  const [i, d] = Math.abs(v).toFixed(dec).split('.');
  const ig = group ? i.replace(/\B(?=(\d{3})+(?!\d))/g, group) : i;
  return (v < 0 ? '-' : '') + ig + (d ? decSep + d : '');
};
const rollText = (from: string, to: string, p: number) => {
  const a = parseNum(from);
  const b = parseNum(to);
  if (!a || !b) return p < 0.5 ? from : to;
  if (p >= 1) return to;
  return b.pre + fmtNum(mix(a.num, b.num, p), b.dec, b.decSep, b.group || a.group) + b.post;
};

// 逐词升起（遮罩上留 0.32em、下留 0.26em：越南语叠加声调符号不被裁掉）
const RiseWords: React.FC<{ text: string; start: number; frame: number; each: number; gap: number }> = ({ text, start, frame, each, gap }) => (
  <span style={{ whiteSpace: 'nowrap' }}>
    {text.split(/\s+/).filter(Boolean).map((w, i) => {
      const p = EASE.snappy(Math.min(1, Math.max(0, (frame - start - i * gap) / each)));
      return (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : null}
          <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        </React.Fragment>
      );
    })}
  </span>
);

// 两行：选使较宽一行最窄的断点（不留孤字）
const split2 = (text: string, family: string) => {
  const ws = text.split(/\s+/).filter(Boolean);
  let best = [text];
  let bw = Infinity;
  for (let k = 1; k < ws.length; k++) {
    const a = ws.slice(0, k).join(' ');
    const b = ws.slice(k).join(' ');
    const m = Math.max(measureText(a, family, 100, 800), measureText(b, family, 100, 800));
    if (m < bw) {
      bw = m;
      best = [a, b];
    }
  }
  return best;
};

type Lay = {
  rowH: number; SH: number; portrait: boolean;
  kSize: number; tSize: number; tLines: { old: string[]; nw: string[] }; tLH: number; sSize: number; sLines: { old: string[]; nw: string[] }; sLH: number;
  cellW: number; gap: number; vSize: number; lSize: number; labels: string[][]; n: number;
  yK: number; yT: number; yS: number; yStats: number; markCY: number;
};

const useLayout = (t: { oldK: string; newK: string; oldT: string; newT: string; oldS: string; newS: string; labels: string[]; olds: string[]; news: string[] }): Lay => {
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const W = 1680;
  const kSize = portrait ? 54 : 30;
  // 标题：同一字号给新旧两页（取较长者能放下的字号）；太长 → 两行
  const T0 = portrait ? 300 : 220;
  const fitT = (x: string, s: number) => fitSize(x, { family: fonts.sans, size: s, maxWidth: W, weight: 800, minSize: 40, letterSpacingEm: -0.055 });
  let tSize = Math.min(fitT(t.oldT, T0), fitT(t.newT, T0));
  let tLines = { old: [t.oldT], nw: [t.newT] };
  if (tSize < T0 * 0.6) {
    const s2 = T0 * 0.72;
    const o = split2(t.oldT, fonts.sans);
    const nw = split2(t.newT, fonts.sans);
    const ss = Math.min(...[...o, ...nw].map((x) => fitT(x, s2)));
    if (ss > tSize) {
      tSize = ss;
      tLines = { old: o, nw };
    }
  }
  const tLH = tSize * 1.12;
  const S0 = portrait ? 78 : 48;
  const sw = (x: string) => (x ? wrapLines(x, fonts.sans, S0, W, 450, 2) : []);
  let sLines = { old: sw(t.oldS), nw: sw(t.newS) };
  const sSize = Math.min(S0, ...[...sLines.old, ...sLines.nw].map((x) => fitSize(x, { family: fonts.sans, size: S0, maxWidth: W, weight: 450, minSize: 30 })));
  if (sSize < S0) sLines = { old: wrapLines(t.oldS, fonts.sans, sSize, W, 450, 2), nw: wrapLines(t.newS, fonts.sans, sSize, W, 450, 2) };
  const sLH = sSize * 1.25;
  const n = Math.min(3, t.labels.length, t.news.length);
  // 竖屏：数据改成纵向三行（数值左 / 名称右），横屏保持一排三格
  const gap = portrait ? 0 : 56;
  const cellW = n ? (portrait ? 760 : Math.min(300 * (3 / n) * 0.9 + 0.1 * 300, (W - gap * (n - 1)) / n)) : 0;
  const V0 = portrait ? 150 : 72;
  const vSize = n ? Math.min(...[...t.olds.slice(0, n), ...t.news.slice(0, n)].map((x) => fitSize(x, { family: fonts.sans, size: V0, maxWidth: cellW - 8, weight: 700, minSize: 36, letterSpacingEm: -0.04 }))) : V0;
  const L0 = portrait ? 54 : 30;
  const labels = t.labels.slice(0, n).map((x) => wrapLines(x, fonts.sans, L0, cellW, 500, 2));
  const lSize = n ? Math.min(...labels.flat().map((x) => fitSize(x, { family: fonts.sans, size: L0, maxWidth: cellW, weight: 500, minSize: 22 }))) : L0;
  const tl = Math.max(tLines.old.length, tLines.nw.length);
  const sl = Math.max(sLines.old.length, sLines.nw.length);
  const ll = Math.max(1, ...labels.map((x) => x.length));
  const gK = portrait ? 40 : 26;
  const gS = portrait ? 46 : 34;
  const gStats = portrait ? 150 : 92;
  const rowH = Math.max(vSize * 1.15, ll * lSize * 1.25) + 64;
  const statH = n ? (portrait ? n * rowH : 26 + vSize * 1.1 + 10 + ll * lSize * 1.25) : 0;
  const blockH = kSize * 1.3 + gK + tl * tLH + (sl ? gS + sl * sLH : 0) + (n ? gStats + statH : 0);
  // 横屏：原版网格（眉题 214 起），内容超高时整体上移；竖屏：整块居中
  const y0 = portrait ? (SH - blockH) / 2 : Math.max(60, Math.min(214, (1080 - blockH) / 2 + 20));
  const yK = y0;
  const yT = yK + kSize * 1.3 + gK;
  const yS = yT + tl * tLH + gS;
  const yStats = (sl ? yS + sl * sLH : yT + tl * tLH) + gStats;
  return { rowH, SH, portrait, kSize, tSize, tLines, tLH, sSize, sLines, sLH, cellW, gap, vSize, lSize, labels, n, yK, yT, yS, yStats, markCY: yT + (tl * tLH) / 2 };
};

const StatRow: React.FC<{ lay: Lay; cells: { value: string; label: string[]; color: string; labelColor: string; line: string; o?: number; y?: number }[] }> = ({ lay, cells }) => lay.portrait ? (
  <div style={{ position: 'absolute', left: 160, right: 160, top: lay.yStats }}>
    {cells.map((c, k) => (
      <div key={k} style={{ height: lay.rowH, borderTop: `2px solid ${c.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: c.o ?? 1, transform: `translateY(${(c.y ?? 0).toFixed(2)}px)` }}>
        <div style={{ ...type(lay.vSize, 700), color: c.color, letterSpacing: '-0.04em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{c.value}</div>
        <div style={{ textAlign: 'right' }}>
          {c.label.map((l, i) => (
            <div key={i} style={{ ...type(lay.lSize, 500), color: c.labelColor, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{l}</div>
          ))}
        </div>
      </div>
    ))}
  </div>
) : (
  <div style={{ position: 'absolute', left: 0, right: 0, top: lay.yStats, display: 'flex', justifyContent: 'center', gap: lay.gap }}>
    {cells.map((c, k) => (
      <div key={k} style={{ width: lay.cellW, borderTop: `${lay.portrait ? 2 : 1}px solid ${c.line}`, paddingTop: lay.portrait ? 36 : 26, opacity: c.o ?? 1, transform: `translateY(${(c.y ?? 0).toFixed(2)}px)` }}>
        <div style={{ ...type(lay.vSize, 700), color: c.color, letterSpacing: '-0.04em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{c.value}</div>
        {c.label.map((l, i) => (
          <div key={i} style={{ ...type(lay.lSize, 500), color: c.labelColor, marginTop: i === 0 ? 10 : 0, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{l}</div>
        ))}
      </div>
    ))}
  </div>
);

const Lines: React.FC<{ lines: string[]; top: number; lh: number; style: React.CSSProperties; render?: (l: string, i: number) => React.ReactNode }> = ({ lines, top, lh, style, render }) => (
  <>
    {lines.map((l, i) => (
      <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: top + i * lh, textAlign: 'center', whiteSpace: 'nowrap', ...style }}>{render ? render(l, i) : l}</div>
    ))}
  </>
);

type Txt = { oldK: string; newK: string; oldT: string; newT: string; oldS: string; newS: string; labels: string[]; olds: string[]; news: string[] };

// 旧页（冷灰海报）
const OldPage: React.FC<{ lay: Lay; t: Txt }> = ({ lay, t }) => (
  <div style={{ position: 'absolute', inset: 0, fontFamily: FONT.sans, background: `radial-gradient(ellipse 70% 60% at 50% 30%, #25272c 0%, ${OLD.bg0} 45%, ${OLD.bg1} 100%)` }}>
    {/* 板面的细横纹：拉丝金属的质地（极淡） */}
    <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 4px)' }} />
    {t.oldK ? <Lines lines={[t.oldK.toUpperCase()]} top={lay.yK} lh={0} style={{ ...type(lay.kSize, 650), letterSpacing: '0.22em', color: OLD.ink3, lineHeight: 1.3 }} /> : null}
    <Lines lines={lay.tLines.old} top={lay.yT} lh={lay.tLH} style={{ ...type(lay.tSize, 760), color: OLD.ink, letterSpacing: '-0.055em', lineHeight: 1.12 }} />
    <Lines lines={lay.sLines.old} top={lay.yS} lh={lay.sLH} style={{ ...type(lay.sSize, 450), color: OLD.ink2, lineHeight: 1.25 }} />
    {lay.n > 0 && <StatRow lay={lay} cells={lay.labels.map((lb, k) => ({ value: t.olds[k] ?? '', label: lb, color: OLD.ink, labelColor: OLD.ink3, line: OLD.line }))} />}
  </div>
);

// 新页（余烬舞台上的发布海报）
const NewPage: React.FC<{ frame: number; lay: Lay; t: Txt; hasBrand: boolean }> = ({ frame, lay, t, hasBrand }) => {
  const statP = (k: number) => ramp(frame, 72 + stagger(k, 3, 12, EASE.out), 26, EASE.snappy);
  const breath = 0.85 + 0.15 * Math.sin(frame / 16);
  const nl = lay.tLines.nw.length;
  const subWords = lay.sLines.nw.join(' ').split(/\s+/).filter(Boolean).length;
  const sgap = Math.min(3, 24 / Math.max(1, subWords));
  let wi = 0;
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: FONT.sans }}>
      {t.newK ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: lay.yK - (hasBrand ? lay.kSize * 0.25 : 0), display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18 }}>
          {hasBrand ? <ShotcraftMark size={lay.kSize * 1.47} tone="dark" /> : null}
          <span style={{ ...type(lay.kSize, 700), letterSpacing: '0.22em', color: L.accent, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{t.newK.toUpperCase()}</span>
        </div>
      ) : null}
      <Lines lines={lay.tLines.nw} top={lay.yT} lh={lay.tLH} style={{ ...type(lay.tSize, 800), letterSpacing: '-0.055em', color: L.ink, lineHeight: 1.12 }}
        render={(l, i) => {
          if (i !== nl - 1) return l;
          // 最后一词：余烬渐变 + 呼吸光（原版"4"）
          const k = l.lastIndexOf(' ');
          const head = k >= 0 ? l.slice(0, k + 1) : '';
          const tail = k >= 0 ? l.slice(k + 1) : l;
          return (
            <>
              {head}
              <span style={{
                backgroundImage: `linear-gradient(180deg, ${L.accent2} 0%, ${L.accent} 70%, #e0471a 100%)`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', padding: '0.2em 0.04em', margin: '-0.2em -0.04em',
                filter: `drop-shadow(0 0 ${(30 * breath).toFixed(1)}px ${alpha(L.accent, 0.55)})`,
              }}>{tail}</span>
            </>
          );
        }} />
      <Lines lines={lay.sLines.nw} top={lay.yS} lh={lay.sLH} style={{ ...type(lay.sSize, 450), color: L.ink2, lineHeight: 1.25 }}
        render={(l) => {
          const st = 64 + wi * sgap;
          wi += l.split(/\s+/).filter(Boolean).length;
          return <RiseWords text={l} start={st} frame={frame} each={18} gap={sgap} />;
        }} />
      {lay.n > 0 && <StatRow lay={lay} cells={lay.labels.map((lb, k) => {
        const p = statP(k);
        return {
          value: rollText(t.olds[k] ?? t.news[k], t.news[k], p), label: lb,
          color: L.ink,
          labelColor: L.ink2, line: alpha(L.accent, 0.35),
          o: ramp(frame, 66 + k * 4, 12, EASE.out), y: mix(18, 0, ramp(frame, 66 + k * 4, 18, EASE.snappy)),
        };
      })} />}
    </div>
  );
};

// 门：960 宽视口里装一整页旧页（右门内层左移 960 对位拼合）+ 内缘切面 + 裂缝光染
// （门不投影到新页上：光从门后来，影子落向镜头一侧，投在门缝里只会把光压灰）
const Door: React.FC<{ side: 'left' | 'right'; offset: number; light: number; edge: number; lay: Lay; t: Txt }> = ({ side, offset, light, edge, lay, t }) => {
  const inner = side === 'left' ? 'right' : 'left';
  const toward = side === 'left' ? 'to left' : 'to right';
  return (
    <div style={{
      position: 'absolute', top: 0, left: side === 'left' ? 0 : 960, width: 960, height: lay.SH, overflow: 'hidden',
      transform: `translateX(${side === 'left' ? -offset : offset}px)`,
    }}>
      <div style={{ position: 'absolute', top: 0, left: side === 'left' ? 0 : -960, width: 1920, height: lay.SH }}>
        <OldPage lay={lay} t={t} />
      </div>
      {/* 门面被裂缝光染暖：靠缝最亮，向外 520px 衰减 */}
      {light > 0.01 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, [inner]: 0, width: 620, mixBlendMode: 'screen', opacity: light,
          background: `linear-gradient(${toward}, ${alpha(L.light, 0.5)} 0%, ${alpha(L.light, 0.14)} 30%, ${alpha(L.light, 0)} 100%)`,
        }} />
      )}
      {/* 板材切面：10px 厚度带，被门缝光照亮（亮 → 暖 → 暗） */}
      {edge > 0.01 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, [inner]: 0, width: 10, opacity: edge,
          background: `linear-gradient(${toward}, #ffe2c2 0%, ${L.accent} 35%, #5a2410 100%)`,
        }} />
      )}
    </div>
  );
};

export const BarnDoorSplit: React.FC = () => {
  const frame = useCurrentFrame();
  const hasBrand = !!useBrand();
  const t: Txt = {
    oldK: useText('old_kicker', 'PHIÊN BẢN HIỆN TẠI'),
    oldT: useText('old_title', 'Phiên bản 3'),
    oldS: useText('old_subtitle', 'Làm thủ công, mất cả buổi chiều.'),
    newK: useText('new_kicker', 'GIỚI THIỆU'),
    newT: useText('new_title', 'Phiên bản 4'),
    newS: useText('new_subtitle', 'Một câu lệnh, ra ngay video hoàn chỉnh.'),
    labels: useList('stat_labels', ['Thời gian xuất', 'Thao tác thủ công', 'Khung hình / giây']),
    olds: useList('stat_old', ['64s', '12', '6']),
    news: useList('stat_new', ['11,8s', '0', '30']),
  };
  const lay = useLayout(t);
  const SH = lay.SH;
  const door = doorAt(frame);
  const vx = velocity(doorAt, frame);

  // 预告亮线：自中点向上下描出；缝隙一撑开就并入光缝
  const crack = ramp(frame, CRACK, 10, EASE.snappy);
  const seamLight = ramp(frame, CRACK, 12, EASE.out); // 门面光染 / 切面亮度
  const edge = frame >= GAP ? 1 : 0;
  // 过曝光束：随门远去衰减
  const flash = ramp(frame, GAP, 12, EASE.exit) * (1 - ramp(frame, SLIDE + 6, 30, EASE.out));
  const bP = ramp(frame, SLIDE + 2, 36, EASE.snappy);
  const bScale = mix(1.08, 1, bP) * mix(1, 1.018, ramp(frame, 78, 72, EASE.smooth)); // 落定后再极缓推近，hold 段不死
  const push = mix(1, 1.015, ramp(frame, 0, SLIDE, EASE.smooth));
  const doorsGone = frame > SLIDE + SLIDE_D;
  const showNew = frame >= GAP;
  // 门面光染：门滑开后随之减弱（门离光源越远越暗）
  const doorLight = seamLight * (1 - ramp(frame, SLIDE, 14, EASE.out) * 0.6);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: L.bg[2] }}>
      {/* 新页：只画一个 Stage 做舞台底；门缝一开才挂载 */}
      {showNew && (
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${bScale.toFixed(5)})`, transformOrigin: `50% ${((lay.markCY / SH) * 100).toFixed(1)}%` }}>
          <Stage look={L} keyLight={{ x: 0.5, y: lay.portrait ? lay.yK / SH : 0.12 }} fill={{ x: 0.5, y: 1.08 }} breathe={0.6}>
            {Array.from({ length: Math.ceil(SH / 1080) }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 1080, height: 1080 }}>
                <Dust look={L} count={28} seed={4 + i * 9} drift={0.35} opacity={0.55} color={L.accent2} />
              </div>
            ))}
          </Stage>
          {/* 字标后的暖光晕 */}
          <div style={{
            position: 'absolute', left: 960 - 700, top: lay.markCY - 260, width: 1400, height: 520,
            background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent, 0.16)} 0%, ${alpha(L.accent, 0)} 70%)`,
          }} />
          <NewPage frame={frame} lay={lay} t={t} hasBrand={hasBrand} />
          {/* 过曝光束：门缝里涌进来的光 */}
          {flash > 0.01 && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 960 - (door + 160), width: 2 * (door + 160), mixBlendMode: 'screen', opacity: flash,
              background: `linear-gradient(90deg, ${alpha(L.light, 0)} 0%, ${alpha(L.light, 0.55)} 40%, ${alpha('#ffe6cc', 0.85)} 50%, ${alpha(L.light, 0.55)} 60%, ${alpha(L.light, 0)} 100%)`,
            }} />
          )}
        </div>
      )}

      {!doorsGone && (
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: '50% 50%' }}>
          <SpeedBlur vx={-vx} amount={0.09} max={22}>
            <Door side="left" offset={door} light={doorLight} edge={edge} lay={lay} t={t} />
          </SpeedBlur>
          <SpeedBlur vx={vx} amount={0.09} max={22}>
            <Door side="right" offset={door} light={doorLight} edge={edge} lay={lay} t={t} />
          </SpeedBlur>
          {/* 裂点预告：发丝亮线 + 泛光，自中点向上下描出 */}
          {crack > 0 && frame < SLIDE + 4 && (
            <div style={{
              position: 'absolute', left: 960 - 1, top: 0, width: 2, height: SH, transform: `scaleY(${crack.toFixed(4)})`,
              background: 'linear-gradient(180deg, rgba(255,226,194,0) 0%, #ffe2c2 22%, #fff6ec 50%, #ffe2c2 78%, rgba(255,226,194,0) 100%)',
              boxShadow: glow(L.accent, 0.9), opacity: 1 - ramp(frame, SLIDE, 4, EASE.out),
            }} />
          )}
        </div>
      )}
    </div>
  );
};
