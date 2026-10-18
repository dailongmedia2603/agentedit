// marker-underline-title —— 白底大标题落定后，斜体 "new" 下方一道
// 马克笔下划线从左到右描画（粗细变化/端头圆润/微歪/边缘毛糙）。
// 对标 notion-ai.mp4 2.3–3.6s。与库内 draw-svg-trace 撞车，本版做马克笔质感。
// 质感层（改版）：补导出时长 75f（f42 划完后静止 33f ≥1s）；标题两行错峰 blur-slide
// （snappy，第二行晚 4f）；笔画加确定性干笔肌理——feTurbulence 位移做毛糙边 + 细碎飞白镂空，
// 墨色改带暖调的近黑并 multiply 进纸面；纸面 = 暖白低对比底 + 主光 + 颗粒；
// 第二行 = video-shotcraft 品牌行（镜刻标志 + 小写品牌名）；整段极缓推近 1→1.015。
//
// [Agent Edit] o chu: before (chu dung truoc tu nhan) / highlight (tu / cum tu nghieng duoc gach chan) / after (chu sau tu
// nhan, tuy chon) / line2 (dong thu hai; bo trong -> logo + ten thuong hieu cua video neu co, khong co thi an).
// Chu dai ngan bat ky: tu xuong dong theo be ngang that, cum highlight luon nam tron tren 1 dong; net but do theo be
// ngang that cua cum highlight, do day / do lech tinh theo co chu (giu ty le goc 118px).
// Khung doc (portrait.mode = 'native'): co chu ~200px, khoi chu dat giua khung.
import { useCurrentFrame, useShotFonts, useText, useVideoConfig, useBrand, fitSize, measureText, wrapLines } from '../../../runtime';
import React, { useId } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Backdrop, EASE, FONT, ramp } from '../../../fixtures/Polish';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const MARKER_UNDERLINE_TITLE_DURATION = 75; // 标题 22f 落定 → f32–42 划线 → 静止 33f

const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// 马克笔笔画：中轴微歪的路径 + 变宽轮廓，一次生成多边形
const buildStroke = (len: number, seed: number) => {
  const rand = mulberry32(seed);
  const N = 40;
  const top: string[] = [];
  const bot: string[] = [];
  // 预生成微歪偏移（低频）与毛糙（高频）
  const wob = Array.from({ length: N + 1 }, () => rand() - 0.5);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * len;
    // 中轴：跟随斜体微上斜（左低右高，对照截图）+ 缓波
    const mid = 19 - t * 9 + Math.sin(t * Math.PI * 1.6 + 0.4) * 2.6 + wob[i] * 1.6;
    // 宽度：起笔略细→中段饱满→收笔收尖，加高频毛糙
    const wBase = 14 + Math.sin(t * Math.PI) * 6 - Math.max(0, t - 0.86) * 46 - Math.max(0, 0.06 - t) * 70; // 起笔再收细一点，不再是平头
    const w = Math.max(2.2, wBase + wob[i] * 3);
    top.push(`${x.toFixed(1)},${(mid - w / 2).toFixed(1)}`);
    bot.push(`${x.toFixed(1)},${(mid + w / 2).toFixed(1)}`);
  }
  return `M${top.join('L')}L${bot.reverse().join('L')}Z`;
};

const BASE_FS = 118; // 笔画参数（宽 14–20px、斜 9px、字底 −20px）按 118px 字号标定
const MARKER_INK = '#1b1916'; // 暖调近黑（马克笔墨，不是纯黑）

type Unit = { text: string; hl?: boolean };

export const MarkerUnderlineTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const before = useText('before', 'Chào đón phiên bản');
  const highlight = useText('highlight', 'mới');
  const after = useText('after', ' ').trim();
  const line2Text = useText('line2', ' ').trim();
  // 第二行：给了文字就用文字；否则 = 视频品牌（标志 + 品牌名），无品牌则省略
  const brandRow = !line2Text && !!brand;
  const line2 = line2Text || (brand?.name ?? '').trim();
  // SVG id 按实例生成，多实例同场不串引（useId 的 «:» 在 url() 里非法，需清洗）
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const revealId = `reveal-${uid}`;
  const dryId = `dry-${uid}`;

  // ── 排版：按真实宽度折行，highlight 整体不拆行 ──
  const FS0 = portrait ? 236 : 118;
  const MAXW = portrait ? 1660 : 1640;
  const MAXL = portrait ? 6 : 4;
  const units: Unit[] = [
    ...before.split(/\s+/).filter(Boolean).map((t) => ({ text: t })),
    { text: highlight, hl: true },
    ...after.split(/\s+/).filter(Boolean).map((t) => ({ text: t })),
  ];
  const w = (u: Unit, fs: number) => measureText(u.text, fonts.sans, fs, 700, !!u.hl);
  const space = (fs: number) => measureText(' ', fonts.sans, fs, 700);
  const wrapUnits = (fs: number) => {
    const rows: Unit[][] = [];
    let cur: Unit[] = [];
    let cw = 0;
    for (const u of units) {
      const uw = w(u, fs);
      if (cur.length && cw + space(fs) + uw > MAXW) {
        rows.push(cur);
        cur = [u];
        cw = uw;
      } else {
        cw += (cur.length ? space(fs) : 0) + uw;
        cur.push(u);
      }
    }
    if (cur.length) rows.push(cur);
    return rows;
  };
  // 字号：最长单元放得下 + 总行数（含第二行）不超过上限，逐级缩小
  let fs = Math.min(FS0, ...units.map((u) => fitSize(u.text, { family: fonts.sans, size: FS0, maxWidth: MAXW * 0.98, weight: 700, italic: !!u.hl, minSize: 48 })));
  let rows = wrapUnits(fs);
  let rows2 = line2 ? wrapLines(line2, fonts.sans, fs, brandRow ? MAXW - fs * 1.1 : MAXW, 700, 2) : [];
  for (let k = 0; k < 8 && rows.length + rows2.length > MAXL; k++) {
    fs = Math.max(48, Math.round(fs * 0.88));
    rows = wrapUnits(fs);
    rows2 = line2 ? wrapLines(line2, fonts.sans, fs, brandRow ? MAXW - fs * 1.1 : MAXW, 700, 2) : [];
  }
  if (rows2.length) fs = Math.min(fs, ...rows2.map((l) => fitSize(l, { family: fonts.sans, size: fs, maxWidth: brandRow ? MAXW - fs * 1.1 : MAXW, weight: 700, minSize: 40 })));
  const k = fs / BASE_FS;
  const hlW = measureText(highlight, fonts.sans, fs, 700, true) * 0.985;
  const LEN = hlW / k + 22; // 设计坐标长度（含左右出头）
  const PATH = buildStroke(LEN, 77);

  // 标题多行错峰落定：同一条 snappy 进度驱动 y / blur / opacity
  const line = (delay: number): React.CSSProperties => {
    const e = ramp(frame, delay, 22, EASE.snappy);
    return {
      opacity: Math.min(1, e * 1.4),
      transform: `translateY(${(1 - e) * 36 * k}px)`,
      filter: e < 0.999 ? `blur(${((1 - e) * 8).toFixed(2)}px)` : undefined,
    };
  };
  const delayOf = (i: number) => Math.min(12, i * 4);

  // 下划线：标题落定停一拍后描画，10 帧从左到右（提速一档），ease-out
  const draw = interpolate(frame, [32, 42], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const drawE = 1 - Math.pow(1 - draw, 2.2);
  // 整段极缓推近（smooth，起止速度为 0）
  const push = 1 + 0.015 * ramp(frame, 0, 74, EASE.smooth);

  const underline = (
    <svg
      width={LEN * k} height={44 * k} viewBox={`0 0 ${LEN.toFixed(1)} 44`}
      style={{ position: 'absolute', left: -12 * k, bottom: -20 * k, overflow: 'visible', mixBlendMode: 'multiply' }}
    >
      <defs>
        <clipPath id={revealId}>
          <rect x={0} y={-20} width={drawE * (LEN + 6)} height={60} />
        </clipPath>
        {/* 干笔肌理：低频位移 → 毛糙边；高频噪声阈值 → 细碎飞白（固定 seed，确定性） */}
        <filter id={dryId} x="-5%" y="-40%" width="110%" height="180%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.09 0.5" numOctaves={2} seed={7} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale={1.8} xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves={2} seed={19} result="grain" />
          <feColorMatrix in="grain" type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -16 11.4" result="holes" />
          <feComposite in="rough" in2="holes" operator="in" />
        </filter>
      </defs>
      {draw > 0 && (
        <g clipPath={`url(#${revealId})`}>
          <path d={PATH} fill={MARKER_INK} fillOpacity={0.94} filter={`url(#${dryId})`} />
        </g>
      )}
    </svg>
  );

  return (
    <AbsoluteFill>
      <Backdrop tone="light" light={{ x: 0.42, y: 0.3 }} vignette={0.12} grain={0.05} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${push})` }}>
        <div style={{
          fontFamily: FONT.sans,
          fontWeight: 700, fontSize: fs, color: '#17181c',
          textAlign: 'center', lineHeight: 1.16, letterSpacing: '-0.028em',
        }}>
          {rows.map((row, ri) => {
            const hasHl = row.some((u) => u.hl);
            return (
              <div key={ri} style={{ ...line(delayOf(ri)), whiteSpace: 'nowrap', marginBottom: hasHl ? '0.14em' : undefined }}>
                {row.map((u, ui) => (
                  <React.Fragment key={ui}>
                    {ui > 0 ? ' ' : null}
                    {u.hl ? (
                      <span style={{ fontStyle: 'italic', position: 'relative', display: 'inline-block' }}>
                        {u.text}
                        {/* 马克笔下划线：clip 从左到右揭示，保留笔形本身的粗细变化 */}
                        {underline}
                      </span>
                    ) : (
                      u.text
                    )}
                  </React.Fragment>
                ))}
              </div>
            );
          })}
          {rows2.map((l, i) => (
            <div key={`b${i}`} style={{ ...line(delayOf(rows.length + i)), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 * k, whiteSpace: 'nowrap' }}>
              {brandRow && i === 0 ? <ShotcraftMark size={fs * 0.95} tone="light" /> : null}
              <span>{l}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
