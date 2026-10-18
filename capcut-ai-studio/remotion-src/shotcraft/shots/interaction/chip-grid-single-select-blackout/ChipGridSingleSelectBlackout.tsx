// chip-grid-single-select-blackout —— Single Select 1 帧灰闪单选反黑
// 五个选项 chip 3+2 居中排布错峰入场；光标点下：先插 1 帧灰色按压块，紧接 5 帧线性反黑（白字）+ 1→1.04→1 极轻回弹，
// 其余 chip 淡到 18% 但位置锁死；约 1.5s 后余项归零，黑 chip 上移收窄回中线，下方升起结算价格。
//
// 第二轮重设计（瓷白 · 结账页的一次"决定"）：
// - look = porcelain（冷白 · 墨蓝黑 · 钴蓝）。按 1080p 原生排版重写：
//   眉题 + 84px 问句、96px 高的实体 chip（36px 字，发丝线 + 顶部内高光 + 两层软阴影），主体占画宽 ~62%。
// - 选中两级状态拆开演（本卡命门，参数不变）：56f 单帧灰闪（:active）→ 57–62f 线性反黑（:selected，不加缓动）
//   + sin 回弹 0.04；其余 chip 只降不透明度、transform 恒为 none。光标从右下走弧线点中它，因果更明确。
// - 黑 chip 被选中后底下亮起一圈极淡的钴蓝落地光（只给主角一次）；收束时上移 + 缩到 0.88 + 横向回中线，
//   阴影随抬升变深变大（离地更高）。
// - 结果段换成大字结算：现价 180px tabular + 单位，原价先出现再被一道划线划掉、退灰，
//   钴蓝胶囊最后 overshoot 弹出——结尾是一张完整的价格海报。
//
// 时间表（30fps，共 165f）：
//   0–14    眉题字距收拢、问句逐词升起
//   8–28    chip 错峰升起（3f 间隔，snappy）
//   26–54   读题：光标从右下入画、swift 弧线移向选中项（相机极缓推近 1.5%）
//   56      单帧灰闪（按下）
//   57–62   线性反黑 5f；57–66 回弹；57–66 余项降到 18%（outQuad），位置锁死
//   66–101  选中态 hold ~1.2s（落地光呼吸）；光标 70f 起淡出
//   101–119 收束：余项 101–110 归零；黑 chip 上移 / 缩 0.88 / 回中线（18f smooth in-out）
//   108–134 结算：原价升起 → 118f 划线 → 现价升起（rise）→ 128f 胶囊弹出
//   134–165 落定 hold 31f
//
// [Agent Edit] o chu: kicker / question / options (3..6 muc, MUC DAU duoc chon) / before (gia cu, tuy chon) / value / unit / badge.
// Be ngang chip DO bang font that (measureText) thay bang do rong co dinh -> vi tri van khoa chet (tinh 1 lan, transform none),
// chip duoc chon van ve dung giua. Xep hang can bang (3+2 cho 5 muc). Khung doc (native): chip to hon, xep nhieu hang,
// ca khoi can giua; ket qua: gia cu tren, gia moi rat to ben duoi.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, useBrand, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const CHIP_GRID_SINGLE_SELECT_BLACKOUT_DURATION = 165;

const L = LOOKS.porcelain;
const INK = '#0b1020'; // 反黑目标：墨蓝黑（不用纯 #000）

const TI = 0; // 选中项
const FS = 56; // 灰闪帧
const COLLAPSE = 101; // 收束起点（选中后 ~1.5s）
const COLLAPSE_DUR = 18;
const TARGET_S = 0.88; // 收窄到 0.88（字仍 ≈32px，满足辅助字下限）

const lin = (f: number, a: number, b: number) => Math.max(0, Math.min(1, (f - a) / (b - a)));
const outQuad = (t: number) => 1 - (1 - t) * (1 - t);
const h2r = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const mixC = (p: number, a: string, b: string) => {
  const A = h2r(a), B = h2r(b), q = Math.max(0, Math.min(1, p));
  return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * q)).join(',')})`;
};

// Mat na "chu troi len" co dem tren 0.32em / duoi 0.26em (dau tieng Viet, chan chu g y khong bi cat)
const Rise: React.FC<{ units: string[]; frame: number; start: number; each: number; gap: number; style?: React.CSSProperties; space?: string }> = ({ units, frame, start, each, gap, style, space = '0.24em' }) => (
  <div style={{ whiteSpace: 'nowrap', ...style }}>
    {units.map((w, i) => {
      const p = ramp(frame, start + i * gap, each, EASE.snappy);
      return (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em', marginRight: i < units.length - 1 ? space : '-0.04em' }}>
          <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.7).toFixed(3)}em))` }}>{w}</span>
        </span>
      );
    })}
  </div>
);

const Cursor: React.FC<{ frame: number; tx: number; ty: number; sx: number; sy: number; size: number }> = ({ frame, tx, ty, sx, sy, size }) => {
  const p = ramp(frame, 26, FS - 2 - 26, EASE.swift);
  const x = mix(sx, tx, p);
  const y = mix(sy, ty, p) - Math.sin(Math.PI * p) * 60 * (size / 46);
  const press = frame >= FS - 1 && frame < FS + 6 ? 1 - 0.16 * Math.sin((Math.PI * (frame - FS + 1)) / 7) : 1;
  const show = ramp(frame, 24, 8, EASE.out) * (1 - ramp(frame, 70, 12, EASE.out));
  return (
    <svg width={size} height={size * 50 / 46} viewBox="0 0 20 22" style={{
      position: 'absolute', left: x, top: y, transform: `scale(${press.toFixed(3)})`, transformOrigin: '4px 2px', opacity: show,
      filter: `drop-shadow(0 3px 5px ${alpha(L.shadow, 0.28)})`,
    }}>
      <path d="M2 1 L2 17 L6.5 13.2 L9.4 20 L12.4 18.7 L9.5 12 L15 11.6 Z" fill={L.ink} stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
};

export const ChipGridSingleSelectBlackout: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'Chu kỳ thanh toán');
  const question = useText('question', 'Bạn muốn thanh toán thế nào?');
  const names = useList('options', ['Trả theo năm', 'Trả theo tháng', 'Cam kết hai năm', 'Sinh viên', 'Tổ chức phi lợi nhuận']).slice(0, 6);
  const before = useText('before', '499.000đ');
  const value = useText('value', '349.000đ');
  const unit = useText('unit', '/tháng');
  const badge = useText('badge', 'Tiết kiệm 30% · thanh toán một lần mỗi năm');
  const n = Math.max(1, names.length);

  // ── kich thuoc theo huong khung ──
  const CHIP_H = portrait ? 200 : 96;
  const CFS = portrait ? 76 : 36; // co chu chip
  const PADX = portrait ? 80 : 44;
  const GAP = portrait ? 36 : 22;
  const ROWG = portrait ? 40 : 22;
  const MAXROW = portrait ? 1720 : 1560;
  // be ngang chip do bang font that; chip qua dai -> chu nho lai cho vua MAXROW
  const chipFs = names.map((t) => fitSize(t, { family: fonts.sans, size: CFS, maxWidth: MAXROW - PADX * 2 - CFS, weight: 600, minSize: CFS * 0.55 }));
  const WIDTHS = names.map((t, i) => Math.ceil(measureText(t, fonts.sans, chipFs[i], 600) + PADX * 2 + (i === TI ? chipFs[i] * 0.9 : 0)));
  // xep hang can bang: so hang it nhat sao cho moi hang <= MAXROW (5 muc -> 3+2)
  let rows: number[][] = [];
  for (let r = 1; r <= n; r++) {
    const per = Math.ceil(n / r);
    const cand: number[][] = [];
    for (let k = 0; k < n; k += per) cand.push(Array.from({ length: Math.min(per, n - k) }, (_, j) => k + j));
    rows = cand;
    if (cand.every((row) => row.reduce((a, k) => a + WIDTHS[k], 0) + GAP * (row.length - 1) <= MAXROW)) break;
  }
  // muc dai lam lech -> xep tham lam (giu thu tu) neu it hang hon
  const greedy: number[][] = [[]];
  let acc = 0;
  names.forEach((_, k) => {
    const w = WIDTHS[k] + (greedy[greedy.length - 1].length ? GAP : 0);
    if (greedy[greedy.length - 1].length && acc + w > MAXROW) {
      greedy.push([k]);
      acc = WIDTHS[k];
    } else {
      greedy[greedy.length - 1].push(k);
      acc += w;
    }
  });
  if (greedy.length < rows.length) rows = greedy;
  // landscape giu 3+2 cho 5 muc (hang dau nhieu hon)
  if (!portrait && n === 5 && rows.length === 2 && rows[0].length === 3) rows = [[0, 1, 2], [3, 4]];

  // ── chu tieu de ──
  const qSize0 = portrait ? 150 : 84;
  const qW = portrait ? 1640 : 1700;
  const qLines0 = wrapLines(question, fonts.sans, qSize0, qW, 700, portrait ? 3 : 2);
  const qSize = Math.min(...qLines0.map((l) => fitSize(l, { family: fonts.sans, size: qLines0.length > 1 && !portrait ? 72 : qSize0, maxWidth: qW, weight: 700, minSize: qSize0 * 0.5 })));
  const qLines = wrapLines(question, fonts.sans, qSize, qW, 700, portrait ? 3 : 2);
  const qLH = qSize * 1.16;
  const kickFs = portrait ? 48 : 26;
  const headH = kickFs * 1.4 + (portrait ? 34 : 22) + qLines.length * qLH;
  const chipsH = rows.length * CHIP_H + (rows.length - 1) * ROWG;
  // khoi tieu de + chip can giua theo chieu doc (khung ngang: dung luoi goc top 168 / chip 452)
  const gapHC = portrait ? 170 : Math.max(60, 452 - 168 - headH);
  const blockH = headH + gapHC + chipsH;
  const headTop = portrait ? Math.round((SH - blockH) / 2) : Math.min(168, Math.round((1080 - blockH) / 2) - 20);
  const chipsTop = headTop + headH + gapHC;
  const ROW_Y = rows.map((_, r) => chipsTop + r * (CHIP_H + ROWG));
  const posOf: { x: number; y: number }[] = [];
  rows.forEach((row, r) => {
    const total = row.reduce((a, k) => a + WIDTHS[k], 0) + GAP * (row.length - 1);
    let x = (1920 - total) / 2;
    for (const k of row) {
      posOf[k] = { x, y: ROW_Y[r] };
      x += WIDTHS[k] + GAP;
    }
  });

  // [Agent Edit] nen anh AI: bo nen dac (Stage tu bo gradient); chu truc tiep tren nen co bong nhe
  const bd = useBackdrop();
  const tsh = bd ? (bd.dark ? '0 2px 18px rgba(0,0,0,0.55)' : '0 1px 12px rgba(255,255,255,0.7)') : undefined;
  // ── ket qua (sau khi thu gon) ──
  const valFs = fitSize(value, { family: fonts.sans, size: portrait ? 300 : 180, maxWidth: (portrait ? 1680 : before ? 1200 : 1500) - (unit ? measureText(unit, fonts.sans, portrait ? 76 : 48, 500) : 0), weight: 750, minSize: 80, letterSpacingEm: -0.05 });
  const oldFs = portrait ? 96 : 60;
  const unitFs = portrait ? 76 : 48;
  const badgeFs0 = portrait ? 60 : 32;
  const badgeFs = badge ? fitSize(badge, { family: fonts.sans, size: badgeFs0, maxWidth: portrait ? 1560 : 1500, weight: 650, minSize: badgeFs0 * 0.6 }) : 0;
  const chipTH = CHIP_H * TARGET_S;
  const resH = portrait
    ? chipTH + 90 + (before ? oldFs * 1.3 + 30 : 0) + valFs * 1.05 + (badge ? 60 + badgeFs * 1.8 : 0)
    : 0;
  const TARGET_Y = portrait ? Math.round((SH - resH) / 2 + chipTH / 2) : 330; // tam doc cua chip den sau khi thu gon
  const resTop = portrait ? TARGET_Y + chipTH / 2 + 90 : 452;

  // ── 选中两级状态 ──
  const flash = frame === FS ? 1 : 0; // 就一帧
  const bk = lin(frame, FS + 1, FS + 6); // 线性反黑 5f（故意不缓动）
  const pr = lin(frame, FS + 1, FS + 10);
  const pulse = 1 + Math.sin(pr * Math.PI) * 0.04 * (pr > 0 ? 1 : 0);
  const fade = outQuad(lin(frame, FS + 1, FS + 10));
  const gone = outQuad(lin(frame, COLLAPSE, COLLAPSE + 9));
  const lift = ramp(frame, COLLAPSE, COLLAPSE_DUR, EASE.smooth);

  const p0 = posOf[TI];
  const c0x = p0.x + WIDTHS[TI] / 2, c0y = p0.y + CHIP_H / 2;
  const dx = (960 - c0x) * lift, dy = (TARGET_Y - c0y) * lift;

  // 相机：读题段极缓推近，收束后回正
  const cam = 1 + 0.015 * ramp(frame, 20, 60, EASE.smooth) - 0.015 * ramp(frame, COLLAPSE, 30, EASE.smooth);

  // 问句随收束让位（上移淡出），把舞台让给结果
  const titleOut = ramp(frame, COLLAPSE - 4, 16, EASE.exit);

  // ── 结算 ──
  const oldIn = ramp(frame, 108, 14, EASE.snappy);
  const strike = ramp(frame, 118, 8, EASE.swift);
  const saveIn = ramp(frame, 128, 14, EASE.overshoot);
  const valChars = Array.from(value);
  const valGap = Math.min(1.2, 10 / Math.max(1, valChars.length));

  const oldEl = before ? (
    <div style={{ overflow: 'hidden', padding: '0.3em 0.1em 0.25em', margin: '-0.3em -0.1em -0.25em', fontSize: oldFs, opacity: frame >= 108 ? 1 : 0 }}>
      <div style={{ position: 'relative', transform: `translateY(calc(${((1 - oldIn) * 110).toFixed(1)}% + ${((1 - oldIn) * 0.6).toFixed(2)}em))`, ...type(oldFs, 500), fontFamily: fonts.sans, lineHeight: 1.1, color: mixC(strike, L.ink2, L.ink3), whiteSpace: 'nowrap', textShadow: tsh }}>
        {before}
        <div style={{
          position: 'absolute', left: -4, top: '54%', height: portrait ? 6 : 4, borderRadius: 3, background: L.ink3,
          width: `calc(${(strike * 100).toFixed(1)}% + ${(8 * strike).toFixed(1)}px)`,
        }} />
      </div>
    </div>
  ) : null;
  const valEl = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: portrait ? 16 : 10, textShadow: tsh }}>
      <Rise units={valChars} frame={frame} start={116} each={14} gap={valGap} space="0"
        style={{ ...type(valFs, 750), fontFamily: fonts.sans, letterSpacing: '-0.05em', lineHeight: 1, color: L.ink }} />
      {unit ? <span style={{ ...type(unitFs, 500), fontFamily: fonts.sans, color: L.ink2, opacity: ramp(frame, 124, 10, EASE.out), whiteSpace: 'nowrap' }}>{unit}</span> : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1], overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.12 }} fill={null} />

      <AbsoluteFill style={{ transform: `scale(${cam.toFixed(4)})`, transformOrigin: '50% 50%' }}>
        {/* 眉题 + 问句 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: headTop, textAlign: 'center', textShadow: tsh, opacity: 1 - titleOut, transform: `translateY(${(-30 * titleOut).toFixed(2)}px)` }}>
          {/* 眉题：标志 + 品牌名（không có thương hiệu -> ẩn）+ nhãn (字距收拢) */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, height: kickFs * 1.4, opacity: ramp(frame, 0, 10, EASE.out) }}>
            {brand ? <ShotcraftMark size={kickFs * 1.25} tone="light" /> : null}
            {brand?.name ? <span style={{ ...type(kickFs * 1.18, 680), letterSpacing: '0.01em', color: L.ink }}>{BRAND.name}</span> : null}
            {kicker ? (
              <span style={{
                ...type(kickFs, 650, { caps: true }), color: L.accent, whiteSpace: 'nowrap',
                letterSpacing: `${(0.24 + 0.3 * (1 - ramp(frame, 0, 18, EASE.snappy))).toFixed(3)}em`,
              }}>{brand?.name ? '· ' : ''}{kicker}</span>
            ) : null}
          </div>
          <div style={{ marginTop: portrait ? 34 : 22 }}>
            {qLines.map((l, li) => {
              const before = qLines.slice(0, li).join(' ').split(/\s+/).filter(Boolean).length;
              const g = Math.min(2.5, 16 / Math.max(1, question.split(/\s+/).length));
              return (
                <Rise key={li} units={l.split(/\s+/).filter(Boolean)} frame={frame} start={3 + before * g} each={16} gap={g}
                  style={{ ...type(qSize, 700), fontFamily: fonts.sans, lineHeight: 1.16, letterSpacing: '-0.025em', color: L.ink }} />
              );
            })}
          </div>
        </div>

        {/* chip */}
        {names.map((nm, i) => {
          const { x, y } = posOf[i];
          const inP = ramp(frame, 8 + i * 3, 16, EASE.snappy);
          const sel = i === TI;
          if (!sel) {
            const op = inP * mix(1, 0.18, fade) * (1 - gone);
            return (
              <div key={i} style={{
                position: 'absolute', left: x, top: y + (1 - inP) * 30, width: WIDTHS[i], height: CHIP_H, boxSizing: 'border-box',
                borderRadius: CHIP_H / 2, background: `linear-gradient(180deg, #ffffff, ${L.surface2})`,
                border: `1px solid ${L.line}`, boxShadow: `inset 0 1px 0 #ffffff, ${softShadow(6, { color: L.shadow, strength: 1.1 })}`,
                display: 'grid', placeItems: 'center', opacity: op, transform: 'none',
                ...type(chipFs[i], 560), fontFamily: fonts.sans, lineHeight: 1.2, whiteSpace: 'nowrap', color: L.ink,
              }}>{nm}</div>
            );
          }
          const elev = 6 + 10 * bk + 26 * lift;
          const ck = chipFs[i] * 0.84;
          return (
            <div key={i} style={{
              position: 'absolute', left: x, top: y + (1 - inP) * 30, width: WIDTHS[i], height: CHIP_H, opacity: inP,
              transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${(pulse * mix(1, TARGET_S, lift)).toFixed(4)})`,
            }}>
              {/* 落地光：选中后在 chip 下方亮起，只给主角一次 */}
              <div style={{
                position: 'absolute', left: -120, right: -120, top: CHIP_H * 0.35, height: CHIP_H * 1.3,
                background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent, 0.2 * bk * (1 - 0.5 * lift))} 0%, transparent 70%)`,
                filter: 'blur(6px)',
              }} />
              <div style={{
                position: 'absolute', inset: 0, boxSizing: 'border-box', borderRadius: CHIP_H / 2, overflow: 'hidden',
                background: bk > 0 ? `linear-gradient(180deg, ${mixC(bk, '#ffffff', '#1d2438')}, ${mixC(bk, '#f3f6fb', INK)})` : `linear-gradient(180deg, #ffffff, ${L.surface2})`,
                border: `1px solid ${bk > 0 ? alpha(INK, 0.1 + 0.9 * bk) : L.line}`,
                boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 1 - 0.85 * bk)}, ${softShadow(elev, { color: L.shadow, strength: 1.1 + 0.9 * bk })}`,
                display: 'grid', placeItems: 'center', ...type(chipFs[i], 600), fontFamily: fonts.sans, lineHeight: 1.2, whiteSpace: 'nowrap', color: mixC(bk, L.ink, '#ffffff'),
              }}>
                {/* 按压灰块：1 帧 */}
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(120,128,146,0.5)', opacity: flash }} />
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: ck * 0.45 }}>
                  <svg width={ck} height={ck} viewBox="0 0 18 18" style={{ marginLeft: -ck * 0.4 * bk, width: ck * bk, opacity: bk }}>
                    <path d="M3.5 9.5 L7.3 13 L14.5 5" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {nm}
                </span>
              </div>
            </div>
          );
        })}

        {/* ── 结算：原价划掉 → 现价 → 胶囊 ── */}
        {portrait ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: resTop, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
            {oldEl}
            {valEl}
          </div>
        ) : (
          <div style={{ position: 'absolute', left: 0, right: 0, top: resTop, height: 190, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 44 }}>
            {oldEl ? <div style={{ marginBottom: valFs * 0.12 }}>{oldEl}</div> : null}
            {valEl}
          </div>
        )}
        {badge ? (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: portrait ? resTop + (before ? oldFs * 1.3 + 30 : 0) + 30 + valFs * 1.05 + 60 : 690, display: 'flex', justifyContent: 'center',
          }}>
            <div style={{
              padding: portrait ? '20px 44px' : '12px 26px', borderRadius: 99, background: L.accent, color: L.onAccent, ...type(badgeFs, 650), fontFamily: fonts.sans, lineHeight: 1.3, whiteSpace: 'nowrap',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 10px 26px -10px ${alpha(L.accent, 0.8)}`,
              opacity: Math.min(1, saveIn * 1.5), transform: `translateY(${((1 - saveIn) * 16).toFixed(2)}px) scale(${(0.8 + 0.2 * saveIn).toFixed(3)})`,
            }}>{badge}</div>
          </div>
        ) : null}

        <Cursor frame={frame} tx={p0.x + WIDTHS[TI] * 0.62} ty={p0.y + CHIP_H * 0.58} sx={portrait ? 1560 : 1500} sy={portrait ? chipsTop + chipsH + 700 : 960} size={portrait ? 72 : 46} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
