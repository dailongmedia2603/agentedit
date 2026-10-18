// beat-step-list-theme-cycle（bear 22.3–24.6s）——三通道节拍器：形容词列表逐拍上移一行、
// 视口中央固定胶囊"接住"新词并换色、整场底色同拍跟换；行 / 色 / 场锁同一个拍点。
//
// 第二轮重设计（look = custom「五套深场换肤」·video-shotcraft 的主题预设片）：
// - 版式改成一句话：左侧静止的细体「Make it」(132px / 300) + 右侧 960px 胶囊里的形容词 (132px)，
//   读作"Make it modern → playful → expressive → BOLD → yours."，最后一拍落在口号上。
// - 每个主题 = 胶囊色 + 场底色 + 胶囊上的字色 + **选中词的字体气质**（无衬线 / 圆体 / 衬线斜体 /
//   全大写 Futura），一拍里同时跳——换肤读作"同一产品多种气质"，而不只是换颜色。
// - 胶囊是一面"透镜"：胶囊外是统一的暗白无衬线列表，胶囊里是同一列表的裁切副本（深色字 + 主题字体），
//   词越过胶囊边缘才换色换字体，跳变中不会出现"还没进胶囊就先变黑"的穿帮；胶囊宽度跟着选中词
//   的实测字宽走（同一个 tInBeat 插值），不再是一条一半空着的长条。
// - 场不是平涂：底色 + 胶囊同色相大光晕（跟同一时钟换色）+ 左上冷白主光 + 暗角 + 颗粒；
//   列表按离视口中心的行距衰减透明度 / 字号 / 虚化（滚轮景深），拍头跳变带竖向运动模糊。
// - 元素层的第四路回声：右上「THEME 03 / 05」计数、左下五枚色票，都挂同一个 beat 整数换态。
//
// 时间表（30fps，共 140f）：
//   0–16    入场：「Make it」与列表由虚到实上浮，胶囊横向展开（snappy）
//   16–30   铺垫静置（极缓推镜 1.0→1.03 全程），观众读清"这是个列表"
//   30/48/66/84  四拍（BEAT_LEN 18f ≈ 100BPM）：拍头 6f 陡 ease-out 跳变 + squash，其余 12f 静置
//   84–96   末拍余波：口号行「Your product, in motion.」逐词升起
//   96–140  hold：停在 "Make it yours." 黄 / 深海军蓝的终态海报
// [Agent Edit] o chu: lead (cum dung yen ben trai / phia tren, vd "Video của bạn"), items (3-5 cum duoc chon lan luot
// trong vien thuoc — muc dau = trang thai mo, moi muc sau = 1 nhip; so nhip = so muc - 1), fillers (4 cum mo dem tren/duoi,
// tuy chon — khong co thi danh sach quay vong nhu banh xe chon, dung lai chinh cac muc), subtitle (khau hieu cuoi, tuy chon).
// Be ngang vien thuoc DO bang measureText tren font that cua tung chu de (ban goc ghi cung be ngang SF Pro); font chu de doi
// sang font dong goi du dau tieng Viet (Be Vietnam Pro / Playfair nghieng / Barlow Condensed in hoa). Co chu toan cum tu
// thu nho de "lead + vien thuoc" vua khung. Chu "THEME 03/05" + ten mau -> bo chu, giu so dem + mau.
// Khung doc (native): lead o tren, danh sach + vien thuoc can giua (chu canh giua), khau hieu + mau ben duoi.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, measureText, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Grain, SpeedBlur, Vignette, mix, ramp, velocity, EASE } from '../../../fixtures/Polish';
import { TextReveal, alpha } from '../../../fixtures/Look';
import { BRAND, ShotcraftWordmark } from '../../../fixtures/Brand';

export const BEAT_STEP_LIST_THEME_CYCLE_DURATION = 140; // 铺垫 30f + 4 拍 × 18f + 末拍后 hold 38f

const START_IDX = 2; // 上方垫两行
// 拍点：~0.6s 一拍 = 18 帧
const BEAT_LEN = 18;
const FIRST_BEAT = 30;
const JUMP = 6; // 跳变窗：拍头 6f，其余 12f 完全静置

type ThemeFont = { role: 'sans' | 'serif' | 'display'; weight: number; italic?: boolean; upper?: boolean; ls: number };
type Theme = { pill: string; bg: string; ink: string; font: ThemeFont };
// 起始态 + 四拍；相邻底色同明度不同色相（都 ≈ L6–9 的深场），胶囊色与底色是配好的深浅对。
// 字体气质：无衬线 / 粗斜体（活泼）/ 衬线斜体 / 窄体全大写 / 特粗——全部用打包的越南语字体
const THEMES: Theme[] = [
  { pill: '#ece6da', bg: '#15120f', ink: '#17130f', font: { role: 'sans', weight: 700, ls: -0.035 } },
  { pill: '#ff8a3d', bg: '#1d0e17', ink: '#260e03', font: { role: 'sans', weight: 900, italic: true, ls: -0.03 } },
  { pill: '#9d8aff', bg: '#0f0d25', ink: '#120b36', font: { role: 'serif', weight: 700, italic: true, ls: -0.02 } },
  { pill: '#38d690', bg: '#06181a', ink: '#03150d', font: { role: 'display', weight: 800, upper: true, ls: 0.01 } },
  { pill: '#ffd43b', bg: '#0f1834', ink: '#1a1404', font: { role: 'sans', weight: 900, ls: -0.035 } },
];

// 拍内跳变：陡 ease-out（指数 3.2），6 帧内完成
const snap = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3.2);

const hex = (a: string) => [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
const mixRgb = (a: string, b: string, t: number) => {
  const pa = hex(a);
  const pb = hex(b);
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
};
const css = (c: number[], a = 1) => (a >= 1 ? `rgb(${c.join(',')})` : `rgba(${c.join(',')},${a.toFixed(3)})`);
const lighten = (c: number[], k: number) => c.map((v) => Math.round(v + (255 - v) * k));
const darken = (c: number[], k: number) => c.map((v) => Math.round(v * (1 - k)));

export const BeatStepListThemeCycle: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const lead = useText('lead', 'Video của bạn');
  const items0 = useList('items', ['hiện đại', 'vui nhộn', 'cảm xúc', 'mạnh mẽ', 'của riêng bạn.']).map((x) => x.trim()).filter(Boolean);
  const items = (items0.length >= 2 ? items0 : [...items0, 'của riêng bạn.']).slice(0, 5);
  const fillers = useList('fillers', []).map((x) => x.trim()).filter(Boolean);
  const tagline = useText('subtitle', 'Một sản phẩm, muôn vàn phong cách.');
  const M = items.length;
  const N_BEATS = M - 1;
  // 主题：末拍固定落在最后一套（黄 / 深海军蓝终态海报）
  const themes = [...THEMES.slice(0, M - 1), THEMES[4]];
  // 词表 ≥ 拍数 + 4：上下各垫两行未选中词（没给 fillers → 列表像选择轮一样循环，用回这些词）
  const above = fillers.length >= 4 ? fillers.slice(0, 2) : [items[(M - 2 + M) % M], items[M - 1]];
  const below = fillers.length >= 4 ? fillers.slice(2, 4) : [items[0], items[1 % M]];
  const WORDS = [...above, ...items, ...below];

  const fam = (r: ThemeFont['role']) => fonts[r];
  const centered = portrait || !lead.trim();

  // ── 版式：先按基准字号量，再整体缩放让「lead + 胶囊」落在安全宽内 ──
  const FS0 = portrait ? 190 : 132;
  const PADL0 = 64, PADR0 = 76;
  const inkAt = (w: string, th: Theme, fs: number) => {
    const t = th.font.upper ? w.toUpperCase() : w;
    return measureText(t, fam(th.font.role), fs, th.font.weight, !!th.font.italic) + Math.max(0, Array.from(t).length - 1) * th.font.ls * fs;
  };
  // 胶囊宽 = max(主题字实测宽, 外层暗白字宽) + 边距：窄体主题时外层词也不会从胶囊边上露出来
  const pillAt = (fs: number) =>
    items.map((w, i) => Math.max(inkAt(w, themes[i], fs), measureText(w, fonts.sans, fs, 700) - Math.max(0, w.length - 1) * 0.035 * fs) + ((PADL0 + PADR0) * fs) / 132);
  const leadAt = (fs: number) => (lead.trim() ? measureText(lead, fonts.sans, fs, 300) * 0.98 : 0);
  let FS = FS0;
  if (centered) {
    FS = FS0 * Math.min(1, 1760 / Math.max(...pillAt(FS0)));
  } else {
    const tot = leadAt(FS0) + 34 + Math.max(...pillAt(FS0));
    FS = FS0 * Math.min(1, 1680 / tot);
  }
  const k = FS / 132;
  const ROW_H = FS * 1.42; // 越南语叠加声调：行高 / 胶囊高都比原版（1.33 / 1.18）放宽
  const PILL_H = FS * 1.36;
  const PAD_L = PADL0 * k;
  const pills = pillAt(FS);
  const LEAD_W = leadAt(FS);
  const GAP = 34 * k;
  const MID_PILL = (Math.min(...pills) + Math.max(...pills)) / 2;
  const LEFT = Math.max(110, Math.min((1920 - (LEAD_W + GAP + MID_PILL)) / 2, 1810 - LEAD_W - GAP - Math.max(...pills)));
  const PILL_X = LEFT + LEAD_W + GAP; // 左对齐模式：胶囊左沿固定
  const CY = portrait ? Math.round(SH * 0.5) : 520;
  const leadFs = portrait ? fitSize(lead, { family: fonts.sans, size: 170, maxWidth: 1700, weight: 300, minSize: 80 }) : FS;

  // 一个时钟：已触发拍数 + 拍内进度（跳变只占拍头 JUMP 帧）——三通道全部从这里取值
  const clock = (f: number) => {
    const raw = (f - FIRST_BEAT) / BEAT_LEN;
    const beat = Math.min(N_BEATS, Math.max(0, Math.floor(raw) + 1));
    const beatStart = FIRST_BEAT + (beat - 1) * BEAT_LEN;
    const tInBeat = beat === 0 ? 1 : snap((f - beatStart) / JUMP);
    const step = beat === 0 ? 0 : beat - 1 + tInBeat;
    return { beat, tInBeat, step, sinceBeat: beat === 0 ? 99 : f - beatStart };
  };
  const { beat, tInBeat, step, sinceBeat } = clock(frame);

  // 三通道 —— 1) 列表上移一行
  const listY = -step * ROW_H;
  const vy = velocity((f) => -clock(f).step * ROW_H, frame);

  // 2) 胶囊 / 3) 场底色：同一个 tInBeat 逐通道 cross-mix
  const prev = themes[Math.max(0, beat - 1)];
  const now = themes[beat];
  const mixT = beat === 0 ? 1 : tInBeat;
  const pill = mixRgb(prev.pill, now.pill, mixT);
  const bg = mixRgb(prev.bg, now.bg, mixT);
  const bgColor = css(bg);
  const pillW = mix(pills[Math.max(0, beat - 1)], pills[beat], mixT);
  const pillX = centered ? 960 - pillW / 2 : PILL_X;

  const sy = beat === 0 ? 1 : interpolate(tInBeat, [0, 0.6, 1], [1.14, 0.96, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sx = beat === 0 ? 1 : interpolate(tInBeat, [0, 0.6, 1], [0.97, 1.01, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const hit = beat === 0 ? 0 : Math.exp(-sinceBeat / 3.2);

  const open = ramp(frame, 2, 16, EASE.snappy);
  const listIn = ramp(frame, 4, 18, EASE.out);
  const cam = mix(1, 1.03, ramp(frame, 0, BEAT_STEP_LIST_THEME_CYCLE_DURATION, EASE.smooth));
  const listPos = START_IDX + step;
  const LAST = FIRST_BEAT + (N_BEATS - 1) * BEAT_LEN;

  // 词的排版盒：整行高、竖向居中（外层列表与胶囊透镜共用，保证两层逐像素重合）
  const wordBox: React.CSSProperties = {
    position: 'absolute', top: 0, height: ROW_H, display: 'flex', alignItems: 'center',
    fontSize: FS, lineHeight: 1, letterSpacing: '-0.035em', whiteSpace: 'nowrap', transformOrigin: centered ? '50% 50%' : '0% 50%',
  };
  const xf = (sc: number) => (centered ? `translateX(-50%) scale(${sc.toFixed(4)})` : `scale(${sc.toFixed(4)})`);
  const themeStyle = (th: Theme): React.CSSProperties => ({
    fontFamily: fam(th.font.role), fontWeight: th.font.weight, fontStyle: th.font.italic ? 'italic' : 'normal',
    textTransform: th.font.upper ? 'uppercase' : undefined, letterSpacing: `${th.font.ls}em`,
  });

  // 角落 / 底部信息
  const MARGIN = 128;
  const brandOn = !!BRAND.name;
  const tagFs = portrait ? 66 : 40;
  const tagLines = tagline.trim() ? (portrait ? wrapLines(tagline, fonts.sans, tagFs, 1640, 500, 2) : [tagline]) : [];
  const tagSize = portrait
    ? Math.min(tagFs, ...tagLines.map((l) => fitSize(l, { family: fonts.sans, size: tagFs, maxWidth: 1700, weight: 500, minSize: 40 })))
    : fitSize(tagline, { family: fonts.sans, size: tagFs, maxWidth: 1920 - MARGIN * 2 - (M * 68 + 40), weight: 500, minSize: 26 });
  const tagTop = portrait ? CY + 2.85 * ROW_H : 896;
  const swY = portrait ? tagTop + tagLines.length * tagSize * 1.3 + 110 : 900;
  const u = portrait ? 1.5 : 1;
  const tagWordsBefore = (i: number) => tagLines.slice(0, i).reduce((s, l) => s + l.split(/\s+/).length, 0);

  return (
    <AbsoluteFill style={{ background: bgColor, overflow: 'hidden', fontFamily: fonts.sans }}>
      {/* 场：左上冷白主光 + 胶囊同色相大光晕（跟同一时钟换色） */}
      <AbsoluteFill style={{
        background:
          `radial-gradient(ellipse ${portrait ? '90% 40%' : '60% 70%'} at ${centered ? 50 : 62}% ${((CY / SH) * 100).toFixed(1)}%, ${css(pill, 0.2 + 0.06 * hit)} 0%, ${css(pill, 0.06)} 45%, ${css(pill, 0)} 75%),` +
          `radial-gradient(ellipse 55% 55% at 18% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 70%)`,
      }} />

      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: `${centered ? 960 : PILL_X}px ${CY}px` }}>
        {/* 词列表（胶囊外层）：统一的暗白无衬线，按行距衰减；拍头跳变带竖向运动模糊 */}
        <SpeedBlur vx={0} vy={vy} amount={0.16} max={9}>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: CY - ROW_H / 2 - START_IDX * ROW_H,
            transform: `translateY(${(listY + (1 - listIn) * 40).toFixed(2)}px)`,
          }}>
            {WORDS.map((w, i) => {
              const d = Math.abs(i - listPos);
              const op = Math.max(0, 0.42 - 0.15 * Math.max(0, d - 1)) * listIn;
              const sc = 1 - Math.min(0.14, 0.05 * Math.max(0, d - 0.5));
              const blur = Math.max(0, d - 1.2) * 3.5 + (1 - listIn) * 10;
              return (
                <div key={i} style={{ height: ROW_H, position: 'relative' }}>
                  <span style={{
                    ...wordBox, left: centered ? 960 : PILL_X + PAD_L, fontFamily: fonts.sans, fontWeight: 700,
                    color: `rgba(255,255,255,${op.toFixed(3)})`,
                    transform: xf(sc),
                    filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                  }}>{w}</span>
                </div>
              );
            })}
          </div>
        </SpeedBlur>

        {/* 中央固定胶囊 = 透镜：胶囊里是同一列表的裁切副本（深色字 + 该词的主题字体） */}
        <div style={{
          position: 'absolute', left: pillX, top: CY - PILL_H / 2, width: pillW, height: PILL_H,
          transformOrigin: centered ? '50% 50%' : '0% 50%', transform: `scale(${(sx * mix(0.55, 1, open)).toFixed(4)}, ${sy.toFixed(4)})`,
          opacity: Math.min(1, open * 2.5), borderRadius: PILL_H / 2, overflow: 'hidden',
          background: `linear-gradient(180deg, ${css(lighten(pill, 0.16 + 0.07 * hit))} 0%, ${css(lighten(pill, 0.03 * hit))} 50%, ${css(darken(pill, 0.1))} 100%)`,
          boxShadow: [
            'inset 0 2px 0 rgba(255,255,255,0.5)',
            'inset 0 -3px 8px rgba(0,0,0,0.12)',
            '0 3px 6px rgba(0,0,0,0.35)',
            `0 30px 90px -20px ${css(pill, 0.5 + 0.25 * hit)}`,
            `0 0 ${(40 + 60 * hit).toFixed(1)}px ${css(pill, 0.18 + 0.2 * hit)}`,
          ].join(', '),
        }}>
          <SpeedBlur vx={0} vy={vy} amount={0.16} max={9}>
            <div style={{
              position: 'absolute', left: 0, right: 0, top: PILL_H / 2 - ROW_H / 2 - START_IDX * ROW_H,
              transform: `translateY(${listY.toFixed(2)}px)`,
            }}>
              {WORDS.map((w, i) => {
                const kk = i - START_IDX;
                const th = kk >= 0 && kk < themes.length ? themes[kk] : null;
                return (
                  <div key={i} style={{ height: ROW_H, position: 'relative' }}>
                    <span style={{
                      ...wordBox, left: centered ? pillW / 2 : PAD_L, transform: centered ? 'translateX(-50%)' : undefined,
                      fontFamily: fonts.sans, fontWeight: 700, ...(th ? themeStyle(th) : null),
                      color: th ? th.ink : themes[0].ink, opacity: Math.min(1, open * 2),
                    }}>{w}</span>
                  </div>
                );
              })}
            </div>
          </SpeedBlur>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: PILL_H * 0.45, background: 'linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0))', pointerEvents: 'none' }} />
        </div>

        {/* lead：landscape 静止的锚（细体右对齐贴着胶囊）；portrait 在列表上方居中（画在羽化之上，见下） */}
        {!portrait && lead.trim() ? (
          <div style={{
            position: 'absolute', left: LEFT - 40, width: LEAD_W + 40, top: CY - FS * 0.62, textAlign: 'right',
            fontSize: FS, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 1.2, color: 'rgba(255,255,255,0.94)',
            whiteSpace: 'nowrap',
          }}>
            <TextReveal text={lead} by="word" variant="blur" start={2} each={16} gap={4} />
          </div>
        ) : null}
      </AbsoluteFill>

      {/* 视口上下羽化：颜色跟 bgColor 实时同步，换场不穿帮 */}
      {portrait ? (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: CY - 1.5 * ROW_H, background: `linear-gradient(${bgColor} ${(((CY - 2.55 * ROW_H) / (CY - 1.5 * ROW_H)) * 100).toFixed(1)}%, ${css(bg, 0)})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: CY + 1.5 * ROW_H, bottom: 0, background: `linear-gradient(${css(bg, 0)}, ${bgColor} ${((1.05 * ROW_H / (SH - CY - 1.5 * ROW_H)) * 100).toFixed(1)}%)` }} />
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300, background: `linear-gradient(${bgColor} 34%, ${css(bg, 0)})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 330, background: `linear-gradient(${css(bg, 0)}, ${bgColor} 62%)` }} />
        </>
      )}

      {portrait && lead.trim() ? (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: CY - 3.35 * ROW_H - leadFs * 0.65, textAlign: 'center',
          fontSize: leadFs, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.3, color: 'rgba(255,255,255,0.94)', whiteSpace: 'nowrap',
          transform: `scale(${cam})`,
        }}>
          <TextReveal text={lead} by="word" variant="blur" start={2} each={16} gap={4} />
        </div>
      ) : null}

      {/* 顶栏：视频品牌（没有就不画）+ 计数（挂同一个整数拍，拍头 6f 竖向滚一格） */}
      {brandOn ? (
        <div style={{ position: 'absolute', left: MARGIN, top: portrait ? 220 : 96, opacity: ramp(frame, 0, 12, EASE.out) }}>
          <ShotcraftWordmark size={30 * u} markScale={1.6} gap={14 * u} tone="dark" />
        </div>
      ) : null}
      <div style={{
        position: 'absolute', right: MARGIN, top: portrait ? 222 : 98, display: 'flex', alignItems: 'baseline', gap: 18 * u,
        opacity: ramp(frame, 0, 12, EASE.out), fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ display: 'inline-block', height: 38 * u, overflow: 'hidden', fontFamily: fonts.mono, fontSize: 32 * u, fontWeight: 500, color: '#fff' }}>
          <span style={{ display: 'block', transform: `translateY(${(-(beat - 1 + (beat === 0 ? 1 : tInBeat)) * 38 * u).toFixed(2)}px)` }}>
            {themes.map((_, kk) => <span key={kk} style={{ display: 'block', height: 38 * u, lineHeight: `${38 * u}px` }}>{String(kk + 1).padStart(2, '0')}</span>)}
          </span>
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 32 * u, color: 'rgba(255,255,255,0.4)' }}>/ {String(M).padStart(2, '0')}</span>
      </div>

      {/* 色票：当前主题放大 + 描圈（整数拍换态，拍头 6f 弹到位）——landscape 左下，portrait 底部居中 */}
      <div style={{
        position: 'absolute', left: portrait ? 0 : MARGIN, right: portrait ? 0 : undefined, top: swY,
        display: 'flex', alignItems: 'center', justifyContent: portrait ? 'center' : 'flex-start', gap: 22 * u,
      }}>
        {themes.map((t, kk) => {
          const cur = kk === beat;
          const pop = cur ? (beat === 0 ? 1 : interpolate(tInBeat, [0, 0.6, 1], [0.7, 1.12, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })) : 1;
          const appear = ramp(frame, 6 + kk * 2, 12, EASE.overshoot);
          return (
            <div key={kk} style={{
              width: 46 * u, height: 46 * u, borderRadius: 23 * u, background: t.pill,
              transform: `scale(${((cur ? 1 : 0.62) * pop * appear).toFixed(4)})`, opacity: cur ? 1 : kk < beat ? 0.55 : 0.32,
              boxShadow: cur ? `0 0 0 ${5 * u}px ${bgColor}, 0 0 0 ${7 * u}px rgba(255,255,255,0.85), 0 0 30px ${alpha(t.pill, 0.6)}` : 'none',
            }} />
          );
        })}
      </div>

      {/* 末拍余波：口号逐词升起（landscape 右下对齐；portrait 居中，最多两行） */}
      {tagLines.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', right: portrait ? 0 : MARGIN, left: portrait ? 0 : undefined, textAlign: portrait ? 'center' : 'right',
          top: tagTop + i * tagSize * 1.3, fontSize: tagSize, fontWeight: 500, lineHeight: 1.3,
          color: 'rgba(255,255,255,0.72)', letterSpacing: '-0.015em', whiteSpace: 'nowrap',
        }}>
          <TextReveal text={l} by="word" variant="rise" start={LAST + 6 + tagWordsBefore(i) * Math.min(3, 18 / Math.max(1, tagline.split(/\s+/).length))} each={16} gap={Math.min(3, 18 / Math.max(1, tagline.split(/\s+/).length))} />
        </div>
      ))}

      <Vignette strength={0.5} inner={0.42} color="#020306" />
      <Grain opacity={0.09} blend="soft-light" />
    </AbsoluteFill>
  );
};
