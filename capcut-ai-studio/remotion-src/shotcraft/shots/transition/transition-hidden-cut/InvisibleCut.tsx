// invisible-cut：前景遮挡隐形切——离镜头极近的失焦前景物贴脸横扫，糊满全屏的那一两帧里
// 背景从 A 无痕硬切成 B，前景扫出画时观众以为还是同一镜。（invisible-cut + foreground-occlusion-swipe）
//
// 第二轮重设计（暖沙生活方式 · "点下预订，一晃就订好了"）：
// - look = sand（米色 · 赤陶 · 靛蓝点缀），衬线标题 + 无衬线 UI；场景 = 一次预订。
//   A：详情页——左侧 860px 照片卡（程序绘制的沙丘日落或真实照片，角标），右侧衬线大标题、
//   两项规格、价格与赤陶大按钮；B：完成页——左侧 168px 衬线大标题，右侧一张票根卡
//   （顶部还是那张照片 = 视觉连续，打孔线、大号确认码、赤陶对勾印章）。因果是一条线：按下按钮 → 一晃 → 办好了。
//   版式左右互换，换景幅度大但不突兀。
// - 遮挡物 = 贴着镜头掠过的失焦深棕前景（像镜头前走过一根立柱）：纯渐变绘制（中心实、两侧 340px 软边 = 失焦 +
//   运动模糊的观感），前缘一道赤陶轮廓光读作"受光的物体"；前方 640px 软投影先扫过页面（近物遮光）。
//   不用 CameraMotionBlur（12 倍采样太贵），软边渐变本身就是糊。
// - 一条 take 的错觉：全程一条恒定方向的慢横移（内容 +40→−40px，smooth 缓动起止）贯穿切点；
//   遮挡物同向但快 50 倍（近大远小的视差）；切前 A 被"带风"拖左 28px（ease-in），切后 B 从右 28px 回稳（ease-out 14f）。
//
// 时间表（30fps，共 110f）：
//   0–24    A 静置（首帧即完整画面），横移极缓起步，照片里的日轮微微呼吸
//   24–32   预备：按钮按下（0.96 缩放 + 压暗 6f）→ 文案换成「处理中」
//   32–46   遮挡物右→左扫过 14f（bezier 0.3,0,0.7,1）；39f 实心区盖满 1920，硬切 A→B
//   39–53   B 从右回稳；46–64 印章弹簧落座、对勾描画；45–68 说明行与确认码错峰升起
//   70–110  hold 40f：横移收尾、日轮呼吸
//
// [Agent Edit] Bo trang "render video-shotcraft" -> canh "bam nut -> xong ngay" trung tinh (mac dinh: dat chuyen di).
// o chu: badge, kicker_a, title_a, stats (2 muc "Nhan: gia tri", dung ca 2 trang), value + value_note, button, button_busy
// (trang A); kicker_b, title_b, subtitle_b, note_b, code (trang B). Tu cuoi cua title_a / title_b in nghieng mau nhan.
// o anh: photo (tuy chon) — anh that thay tranh "doi cat" ve tay, cover trong the anh trang A va dau ve trang B.
// Chu that dai ngan bat ky: tieu de tu xuong dong <= 3 dong + thu nho; dong phu xuong dong theo be ngang that.
// Khung doc (portrait.mode = 'native'): A = the anh lon tren + cot chu duoi; B = tieu de lon tren + ve phong 1.55x duoi;
// ca khoi can giua theo chieu doc. Vat che quet ngang van phu kin (loi 2600px > 1920, cao theo khung that).
import { useBrand, useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, FONT, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, SERIF, Stage, alpha, springAt } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const INVISIBLE_CUT_DURATION = 110;

const S = LOOKS.sand;
const PAD = 120;
const PRESS = 24; // 按下按钮
const SW_START = 32; // 遮挡物入画
const SW_END = 46; // 遮挡物出画
const CUT = 39; // 硬切：实心区盖满画幅的那一帧
const SOFT = 340; // 遮挡物软边宽
const CORE = 2600; // 遮挡物实心宽（> 1920，留出 >1 帧的全遮窗口）
const OCC_W = CORE + SOFT * 2;
const B_SHIFT = 40; // B 页排版右移量（抵消横移终点 −40）

// 遮挡物左缘位置：从画右外 → 画左外
const SWEEP_EASE = bezier(0.3, 0, 0.7, 1); // 起止有加减速、中段最快
const occX = (f: number) => mix(1940, -OCC_W - 20, ramp(f, SW_START, SW_END - SW_START, SWEEP_EASE));

// ───────────── 程序绘制的沙丘日落 ─────────────
const Dunes: React.FC<{ w: number; h: number; f: number; id: string }> = ({ w, h, f, id }) => {
  const breathe = 1 + 0.04 * Math.sin(f / 16);
  return (
    <svg width={w} height={h} viewBox="0 0 860 760" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d98a5c" />
          <stop offset="0.4" stopColor="#eeae78" />
          <stop offset="0.6" stopColor="#f8d2a0" />
        </linearGradient>
        <radialGradient id={`sun${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe6bf" stopOpacity={0.85} />
          <stop offset="0.4" stopColor="#ffd9a6" stopOpacity={0.45} />
          <stop offset="1" stopColor="#ffd9a6" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`d1${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e09a63" />
          <stop offset="1" stopColor="#c8743f" />
        </linearGradient>
        <linearGradient id={`d2${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c76b38" />
          <stop offset="1" stopColor="#9c4724" />
        </linearGradient>
        <linearGradient id={`d3${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f3f1f" />
          <stop offset="1" stopColor="#5e2611" />
        </linearGradient>
        <linearGradient id={`sh${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a160a" stopOpacity={0} />
          <stop offset="0.6" stopColor="#3a160a" stopOpacity={0} />
          <stop offset="1" stopColor="#3a160a" stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <rect width={860} height={760} fill={`url(#sky${id})`} />
      <circle cx={560} cy={400} r={190 * breathe} fill={`url(#sun${id})`} opacity={0.95} />
      <circle cx={560} cy={400} r={56} fill="#fffbf2" />
      {/* 远丘 */}
      <path d="M0 440 C 140 400 260 420 380 440 C 520 462 640 410 860 420 L860 760 L0 760 Z" fill={`url(#d1${id})`} />
      {/* 中丘：脊线左亮右暗 */}
      <path d="M0 540 C 120 470 230 460 330 500 C 430 540 520 470 640 486 C 740 498 800 530 860 520 L860 760 L0 760 Z" fill={`url(#d2${id})`} />
      {/* 脊线受光：沿中丘脊一道亮边 */}
      <path d="M0 540 C 120 470 230 460 330 500 C 430 540 520 470 640 486" fill="none" stroke="#f3b27a" strokeWidth={3} opacity={0.55} />
      {/* 近丘 */}
      <path d="M0 650 C 160 590 300 600 430 640 C 560 680 700 600 860 620 L860 760 L0 760 Z" fill={`url(#d3${id})`} />
      {/* 营地：三顶小帐篷剪影 + 一点暖灯 */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${196 + i * 46} ${598 - i * 4})`}>
          <path d="M0 0 L 18 -26 L 36 0 Z" fill="#3b1a0c" />
          <circle cx={18} cy={-6} r={3.2} fill="#ffd38a" opacity={0.9} />
        </g>
      ))}
      <rect width={860} height={760} fill={`url(#sh${id})`} />
    </svg>
  );
};

// ───────────── 文字工具（[Agent Edit]：真实台词长短不定） ─────────────
// 折行 + 缩字号：在 [minSize, size] 里找能放进 maxLines 行的最大字号，再均衡行长；'\n' = 强制换行
const fitWrap = (text: string, family: string, weight: number, size: number, minSize: number, maxW: number, maxLines: number) => {
  const segs = text.split('\n').map((x) => x.trim()).filter(Boolean);
  const wrapAll = (sz: number, w: number) => segs.flatMap((sg) => wrapLines(sg, family, sz, w, weight, 99));
  let sz = size;
  let lines = wrapAll(sz, maxW);
  while (lines.length > maxLines && sz > minSize) {
    sz = Math.max(minSize, Math.round(sz * 0.93));
    lines = wrapAll(sz, maxW);
  }
  if (lines.length > maxLines) {
    lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
    sz = Math.min(sz, ...lines.map((l) => fitSize(l, { family, size: sz, maxWidth: maxW, weight, minSize: minSize * 0.6 })));
    return { size: sz, lines };
  }
  if (lines.length > segs.length) {
    for (let w = maxW - 24; w > maxW * 0.45; w -= 24) {
      const alt = wrapAll(sz, w);
      if (alt.length > lines.length) break;
      lines = alt;
    }
  }
  return { size: sz, lines };
};

// 衬线大标题：末词斜体强调色（原版 "agent" / "wrap." 的强调手法）
const SerifTitle: React.FC<{ lines: string[]; size: number; lh: number; color: string; accent: string; style?: React.CSSProperties }> = ({ lines, size, lh, color, accent, style }) => (
  <div style={{ fontFamily: SERIF, fontSize: size, fontWeight: 500, letterSpacing: '-0.025em', color, ...style }}>
    {lines.map((l, i) => {
      const last = i === lines.length - 1;
      const k = l.lastIndexOf(' ');
      return (
        <div key={i} style={{ height: lh, lineHeight: `${lh}px`, whiteSpace: 'nowrap' }}>
          {last ? <>{k > 0 ? l.slice(0, k + 1) : ''}<i style={{ color: accent }}>{k > 0 ? l.slice(k + 1) : l}</i></> : l}
        </div>
      );
    })}
  </div>
);

type Texts = {
  photo?: string; badge: string; kickerA: string; titleA: string; stats: [string, string][]; value: string; valueNote: string;
  button: string; busy: string; kickerB: string; titleB: string; subB: string; noteB: string; code: string;
};

const Photo: React.FC<{ src?: string; w: number; h: number; f: number; id: string }> = ({ src, w, h, f, id }) =>
  src ? <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <Dunes w={w} h={h} f={f} id={id} />;

// ───────────── A：动作页（照片卡 + 标题 + 规格 + 大按钮） ─────────────
const PageA: React.FC<{ f: number; t: Texts; portrait: boolean; SH: number }> = ({ f, t, portrait, SH }) => {
  const fonts = useShotFonts();
  const brand = useBrand();
  const down = ramp(f, PRESS, 4, EASE.out) * (1 - ramp(f, PRESS + 5, 8, EASE.out));
  const reserving = f >= PRESS + 4;
  const P = portrait;
  const colW = P ? 1680 : 736;
  const tt = fitWrap(t.titleA, fonts.serif, 500, P ? 150 : 92, P ? 96 : 60, colW, 3);
  const tLH = Math.round(tt.size * 1.12);
  const kSize = P ? 40 : 28;
  const statL = P ? 36 : 26;
  const statV = P ? 60 : 40;
  const valSize = fitSize(t.value, { family: fonts.sans, size: P ? 130 : 76, maxWidth: colW * 0.55, weight: 700, minSize: P ? 70 : 44 });
  const noteBase = P ? 46 : 32;
  const noteInline = t.valueNote ? fitSize(t.valueNote, { family: fonts.sans, size: noteBase, maxWidth: colW - measureText(t.value, fonts.sans, valSize, 700) - 20, weight: 500, minSize: 10 }) : 0;
  // 说明太长：不挤在数字右边，改为数字下方另起（≤2 行）
  const noteBelow = !!t.valueNote && noteInline < noteBase * 0.8;
  const noteF = noteBelow ? fitWrap(t.valueNote, fonts.sans, 500, noteBase, noteBase * 0.75, colW, 2) : null;
  const noteSize = noteBelow ? noteF!.size : noteInline;
  const btnH = P ? 190 : 116;
  const btnSize = fitSize(reserving ? t.busy : t.button, { family: fonts.sans, size: P ? 66 : 42, maxWidth: colW - 160, weight: 650, minSize: 24 });
  const imgW = P ? 1680 : 860;
  const imgH = P ? 1060 : 760;
  // 竖版：照片卡在上、文字栏在下，整体垂直居中
  const textH = kSize * 1.3 + 26 + tt.lines.length * tLH + 44 + (22 * 2 + statL * 1.3 + 6 + statV * 1.3) + 34 + valSize * 1.2 + (noteF ? 4 + noteF.lines.length * noteSize * 1.3 : 0) + 34 + btnH;
  const top0 = P ? Math.max(180, Math.round((SH - (imgH + 70 + textH)) / 2)) : 160;
  const imgTop = top0;
  const colLeft = P ? PAD : 1064;
  const colTop = P ? imgTop + imgH + 70 : 176;
  return (
    <>
      <div style={{
        position: 'absolute', left: PAD, top: imgTop, width: imgW, height: imgH, borderRadius: P ? 48 : 36, overflow: 'hidden',
        boxShadow: `0 2px 4px ${alpha(S.shadow, 0.12)}, 0 40px 90px -30px ${alpha(S.shadow, 0.45)}`,
      }}>
        <Photo src={t.photo} w={imgW} h={imgH} f={f} id="a" />
        {t.badge ? (
          <div style={{
            position: 'absolute', left: P ? 44 : 32, top: P ? 44 : 32, height: P ? 84 : 60, padding: `0 ${P ? 34 : 24}px`, borderRadius: P ? 42 : 30, display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(255,248,238,0.86)', boxShadow: `0 8px 24px -8px ${alpha(S.shadow, 0.4)}`,
            fontFamily: FONT.sans, fontSize: P ? 42 : 30, fontWeight: 600, letterSpacing: '-0.01em', color: S.ink, whiteSpace: 'nowrap', maxWidth: imgW - 100, overflow: 'hidden',
          }}>
            {brand ? <ShotcraftMark size={P ? 48 : 34} tone="light" /> : null} {t.badge}
          </div>
        ) : null}
      </div>

      <div style={{ position: 'absolute', left: colLeft, top: colTop, width: colW }}>
        {t.kickerA ? <div style={{ fontFamily: FONT.sans, fontSize: fitSize(t.kickerA.toUpperCase(), { family: fonts.sans, size: kSize, maxWidth: colW, weight: 700, letterSpacingEm: 0.14, minSize: kSize * 0.6 }), fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.14em', color: S.accent, whiteSpace: 'nowrap' }}>{t.kickerA.toUpperCase()}</div> : null}
        <SerifTitle lines={tt.lines} size={tt.size} lh={tLH} color={S.ink} accent={S.accent} style={{ marginTop: 26 }} />
        <div style={{ display: 'flex', marginTop: 44, borderTop: `1.5px solid ${S.line}`, borderBottom: `1.5px solid ${S.line}` }}>
          {t.stats.map(([k, v], i) => (
            <div key={i} style={{ flex: 1, minWidth: 0, padding: '22px 0', paddingLeft: i ? 32 : 0, borderLeft: i ? `1.5px solid ${S.line}` : undefined }}>
              <div style={{ fontFamily: FONT.sans, fontSize: statL, fontWeight: 600, lineHeight: 1.3, letterSpacing: '0.1em', color: S.ink3, whiteSpace: 'nowrap' }}>{k.toUpperCase()}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: fitSize(v, { family: fonts.sans, size: statV, maxWidth: colW / t.stats.length - 40, weight: 600, minSize: statV * 0.55 }), fontWeight: 600, lineHeight: 1.3, color: S.ink, marginTop: 6, whiteSpace: 'nowrap' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 34, whiteSpace: 'nowrap', lineHeight: 1.2 }}>
          <span style={{ fontFamily: FONT.sans, fontSize: valSize, fontWeight: 700, letterSpacing: '-0.03em', color: S.ink }}>{t.value}</span>
          {t.valueNote && !noteBelow ? <span style={{ fontFamily: FONT.sans, fontSize: noteSize, fontWeight: 500, color: S.ink2 }}>{t.valueNote}</span> : null}
        </div>
        {noteF ? (
          <div style={{ fontFamily: FONT.sans, fontSize: noteSize, fontWeight: 500, color: S.ink2, lineHeight: 1.3, marginTop: 4 }}>
            {noteF.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        ) : null}
        <div style={{
          marginTop: 34, height: btnH, borderRadius: btnH / 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18,
          background: `linear-gradient(180deg, ${alpha('#ffffff', 0.12)} 0%, ${alpha('#ffffff', 0)} 100%), ${S.accent}`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 ${mix(18, 6, down)}px ${mix(40, 16, down)}px -12px ${alpha(S.shadow, 0.55)}`,
          transform: `scale(${(1 - 0.04 * down).toFixed(4)})`, filter: down > 0.01 ? `brightness(${1 - 0.12 * down})` : undefined,
          fontFamily: FONT.sans, fontSize: btnSize, fontWeight: 650, color: S.onAccent, whiteSpace: 'nowrap',
        }}>
          {reserving && (
            <span style={{
              width: btnSize * 0.72, height: btnSize * 0.72, borderRadius: '50%', border: `${P ? 6 : 4}px solid ${alpha(S.onAccent, 0.35)}`, borderTopColor: S.onAccent,
              transform: `rotate(${(f - PRESS) * 24}deg)`, boxSizing: 'border-box',
            }} />
          )}
          {reserving ? t.busy : t.button}
        </div>
      </div>
    </>
  );
};

// ───────────── B：结果页（大标题 + 票根卡 + 印章） ─────────────
const PageB: React.FC<{ f: number; t: Texts; portrait: boolean; SH: number }> = ({ f, t, portrait, SH }) => {
  const fonts = useShotFonts();
  const seal = springAt(f, CUT + 7, { damping: 13, stiffness: 190 });
  const check = ramp(f, CUT + 12, 14, EASE.out);
  const rows = [0, 1, 2].map((i) => ramp(f, CUT + 6 + i * 5, 18, EASE.snappy));
  const P = portrait;
  const colW = P ? 1680 : 900;
  const kSize = P ? 40 : 28;
  const subF = t.subB ? fitWrap(t.subB, fonts.sans, 500, P ? 60 : 42, P ? 44 : 30, colW, P ? 3 : 2) : { size: 42, lines: [] as string[] };
  const subSize = subF.size;
  const subLines = subF.lines;
  const noteF = t.noteB ? fitWrap(t.noteB, fonts.sans, 500, P ? 44 : 32, P ? 32 : 24, colW, 2) : { size: 32, lines: [] as string[] };
  const noteSize = noteF.size;
  const noteLines = noteF.lines;
  // 票根卡（660×780 设计尺寸，竖版放大 1.55 居中置于文字下方）
  const ts = P ? 1.55 : 1;
  const restH = kSize * 1.3 + 30 + (subLines.length ? 52 + subLines.length * subSize * 1.35 : 0) + (noteLines.length ? 30 + noteLines.length * noteSize * 1.35 : 0);
  // 标题高度预算：横版整栏须落在 1080 内；竖版给票根留位
  const room = (P ? SH - 320 - 90 - 780 * ts : 1080 - 160) - restH;
  let tBase = P ? 230 : 168;
  let tt = fitWrap(t.titleB, fonts.serif, 500, tBase, P ? 130 : 100, colW, 3);
  while (tt.lines.length * tt.size * 1.08 > room && tBase > 80) {
    tBase = Math.round(tBase * 0.92);
    tt = fitWrap(t.titleB, fonts.serif, 500, tBase, Math.min(tBase, P ? 130 : 100) * 0.8, colW, 3);
  }
  const tLH = Math.round(tt.size * 1.08);
  const textH = restH + tt.lines.length * tLH;
  const top0 = P ? Math.max(160, Math.round((SH - (textH + 90 + 780 * ts)) / 2)) : Math.max(80, Math.min(214, Math.round((1080 - textH) / 2)));
  const ticketLeft = P ? Math.round(960 - (660 * ts) / 2) : 1140;
  const ticketTop = P ? top0 + textH + 90 : 150;
  const code = t.code;
  const codeLine = t.stats.map(([, v]) => v).join(' · ');
  return (
    <>
      <div style={{ position: 'absolute', left: PAD, top: top0, width: colW }}>
        {t.kickerB ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONT.sans, fontSize: fitSize(t.kickerB.toUpperCase(), { family: fonts.sans, size: kSize, maxWidth: colW - kSize, weight: 700, letterSpacingEm: 0.14, minSize: kSize * 0.6 }), fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.14em', color: S.accent, whiteSpace: 'nowrap' }}>
            <span style={{ width: kSize / 2, height: kSize / 2, borderRadius: kSize / 4, background: S.accent }} />
            {t.kickerB.toUpperCase()}
          </div>
        ) : null}
        <SerifTitle lines={tt.lines} size={tt.size} lh={tLH} color={S.ink} accent={S.accent} style={{ marginTop: 30 }} />
        {subLines.length ? (
          <div style={{ fontFamily: FONT.sans, fontSize: subSize, fontWeight: 500, color: S.ink2, marginTop: 52, lineHeight: 1.35, opacity: rows[0], transform: `translateY(${(1 - rows[0]) * 22}px)` }}>
            {subLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        ) : null}
        {noteLines.length ? (
          <div style={{ fontFamily: FONT.sans, fontSize: noteSize, fontWeight: 500, color: S.ink3, marginTop: 30, lineHeight: 1.35, opacity: rows[1], transform: `translateY(${(1 - rows[1]) * 22}px)` }}>
            {noteLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        ) : null}
      </div>

      <div style={{ position: 'absolute', left: ticketLeft, top: ticketTop, width: 660, height: 780, transform: `scale(${ts})`, transformOrigin: '0 0' }}>
        {/* 票根卡 */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 34, overflow: 'hidden', background: S.surface,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 4px ${alpha(S.shadow, 0.1)}, 0 44px 90px -30px ${alpha(S.shadow, 0.42)}`,
        }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 660, height: 330, overflow: 'hidden' }}>
            <Photo src={t.photo} w={660} h={330} f={f} id="b" />
          </div>
          {/* 打孔线 + 两侧半圆缺口 */}
          <div style={{ position: 'absolute', left: 44, right: 44, top: 520, borderTop: `3px dashed ${alpha(S.ink3, 0.45)}` }} />
          {[-26, 634].map((x) => (
            <div key={x} style={{ position: 'absolute', left: x, top: 494, width: 52, height: 52, borderRadius: 26, background: S.bg[1], boxShadow: `inset 0 2px 6px ${alpha(S.shadow, 0.18)}` }} />
          ))}
          <div style={{ position: 'absolute', left: 52, top: 362, display: 'flex', justifyContent: 'space-between', width: 556, gap: 24 }}>
            {t.stats.map(([k, v], i) => (
              <div key={i} style={{ minWidth: 0, textAlign: i ? 'right' : 'left' }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 24, fontWeight: 650, lineHeight: 1.3, letterSpacing: '0.12em', color: S.ink3, whiteSpace: 'nowrap' }}>{k.toUpperCase()}</div>
                <div style={{ fontFamily: SERIF, fontSize: fitSize(v, { family: fonts.serif, size: 56, maxWidth: 556 / t.stats.length - 24, weight: 500, minSize: 30 }), fontWeight: 500, lineHeight: 1.25, letterSpacing: '-0.02em', color: S.ink, marginTop: 4, whiteSpace: 'nowrap' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 52, top: 570, width: 556, opacity: rows[2], transform: `translateY(${(1 - rows[2]) * 20}px)` }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 24, fontWeight: 650, lineHeight: 1.3, letterSpacing: '0.12em', color: S.ink3 }}>MÃ XÁC NHẬN</div>
            <div style={{ fontFamily: FONT.sans, fontSize: fitSize(code, { family: fonts.sans, size: 64, maxWidth: 556, weight: 700, minSize: 30, letterSpacingEm: 0.02 }), fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.02em', color: S.ink, marginTop: 8, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{code}</div>
            <div style={{ fontFamily: FONT.sans, fontSize: fitSize(codeLine, { family: fonts.sans, size: 30, maxWidth: 556, weight: 500, minSize: 18 }), fontWeight: 500, lineHeight: 1.3, color: S.ink2, marginTop: 14, whiteSpace: 'nowrap' }}>{codeLine}</div>
          </div>
        </div>
        {/* 赤陶印章：压在照片与票面交界处，弹簧落座 + 对勾描画 */}
        <div style={{
          position: 'absolute', left: 500, top: 120, width: 150, height: 150,
          transform: `rotate(${mix(-30, -8, seal)}deg) scale(${mix(1.8, 1, seal).toFixed(4)})`, opacity: Math.min(1, seal * 3),
        }}>
          <svg width={150} height={150} viewBox="0 0 150 150" style={{ overflow: 'visible', filter: `drop-shadow(0 14px 22px ${alpha(S.shadow, 0.45)})` }}>
            <circle cx={75} cy={75} r={70} fill={S.accent} />
            <circle cx={75} cy={75} r={58} fill="none" stroke={alpha(S.onAccent, 0.5)} strokeWidth={2} strokeDasharray="3 6" />
            <path d="M48 77 L 67 96 L 104 56" fill="none" stroke={S.onAccent} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={90} strokeDashoffset={90 * (1 - check)} />
          </svg>
        </div>
      </div>
    </>
  );
};

export const InvisibleCut: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const statsRaw = useList('stats', ['Thời gian: 3 ngày 2 đêm', 'Khởi hành: Thứ Sáu']).slice(0, 2);
  const stats = statsRaw.map((x) => {
    const k = x.indexOf(':');
    return (k > 0 ? [x.slice(0, k).trim(), x.slice(k + 1).trim()] : ['', x.trim()]) as [string, string];
  });
  const t: Texts = {
    photo: useImage('photo'),
    badge: useText('badge', 'Đà Lạt · Bình minh'),
    kickerA: useText('kicker_a', 'Chuyến đi cuối tuần'),
    titleA: useText('title_a', 'Đi thật xa,\nnghỉ thật sâu.'),
    stats,
    value: useText('value', '2,4 triệu'),
    valueNote: useText('value_note', 'đã gồm vé và khách sạn'),
    button: useText('button', 'Đặt ngay'),
    busy: useText('button_busy', 'Đang xử lý…'),
    kickerB: useText('kicker_b', 'Đặt chỗ thành công'),
    titleB: useText('title_b', 'Xong rồi,\nlên đường!'),
    subB: useText('subtitle_b', 'Chuyến đi đã được xác nhận và gửi vào email của bạn.'),
    noteB: useText('note_b', 'Vé điện tử đã lưu sẵn trong ứng dụng'),
    code: useText('code', 'VN-4821'),
  };
  const DUR = INVISIBLE_CUT_DURATION;
  // 贯穿切点的慢横移：内容 +40 → −40px（smooth 起止）；B 页整体右移 40px 排版，落定时回到 120 安全边
  const pan = 40 - 80 * ramp(frame, 0, DUR, EASE.smooth);
  // 带风推挤：切前 A 被拖左（ease-in），切后 B 从右回稳（ease-out）
  const shove = frame < CUT ? -28 * ramp(frame, SW_START - 2, CUT - SW_START + 2, EASE.exit) : 28 * (1 - ramp(frame, CUT, 14, EASE.out));
  const x = occX(frame);
  const sweeping = frame >= SW_START && frame <= SW_END;
  // 近物遮光：遮挡物前方的软投影
  const lead = x;

  return (
    <AbsoluteFill style={{ background: S.bg[1], overflow: 'hidden' }}>
      <Stage look={S} keyLight={{ x: 0.3, y: 0.05 }} fill={{ x: 0.9, y: 0.95 }} vignette={0.2} grain={0.05} />
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(pan + shove).toFixed(2)}px)` }}>
        {frame < CUT ? <PageA f={frame} t={t} portrait={portrait} SH={SH} /> : <div style={{ position: 'absolute', inset: 0, left: B_SHIFT }}><PageB f={frame} t={t} portrait={portrait} SH={SH} /></div>}
      </div>

      {sweeping && (
        <>
          {/* 前方软投影 */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: lead - 640, width: 640 + SOFT,
            background: `linear-gradient(90deg, ${alpha('#2a170c', 0)} 0px, ${alpha('#2a170c', 0.38)} 640px, ${alpha('#2a170c', 0.5)} ${640 + SOFT}px)`,
          }} />
          {/* 失焦前景：两侧软边 + 实心核 + 前缘赤陶轮廓光 */}
          <div style={{
            position: 'absolute', top: -40, bottom: -40, left: x, width: OCC_W,
            background: `linear-gradient(90deg, rgba(43,26,16,0) 0px, rgba(43,26,16,0.85) ${SOFT * 0.6}px, #2b1a10 ${SOFT}px, #24150c ${SOFT + CORE}px, rgba(36,21,12,0.8) ${SOFT + CORE + SOFT * 0.4}px, rgba(36,21,12,0) ${OCC_W}px)`,
          }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: SOFT * 0.35, width: 260,
              background: `linear-gradient(90deg, ${alpha('#e0703f', 0)} 0%, ${alpha('#e0703f', 0.42)} 45%, ${alpha('#e0703f', 0)} 100%)`,
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(255,210,170,0.08) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.25) 100%)',
              // 只作用在实心区，软边处渐隐（否则在透明软边上画出一道硬边）
              WebkitMaskImage: `linear-gradient(90deg, transparent 0px, #000 ${SOFT}px, #000 ${SOFT + CORE}px, transparent ${OCC_W}px)`,
              maskImage: `linear-gradient(90deg, transparent 0px, #000 ${SOFT}px, #000 ${SOFT + CORE}px, transparent ${OCC_W}px)`,
            }} />
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
