// typewriter-error-retype｜打字机误删重打
// 浅底居中大字（眉题 Introducing video-shotcraft）：f2 起 2f/字符打出 "just a slideshow"(16 字符) → f32–48 停顿
// 16f(光标闪两下=犹豫) → f48 起 1.5f/字符逐字退格删掉 "a slideshow"(11 字符，
// 字符直接消失) → f68 起 1.5f/字符果断打出 "your cinematic crew"(19 字符，
// f95 打完) → 光标闪两个周期(10f/周期)后 f110 永久熄灭。节奏三档：打 2f/删
// 1.5f/重打 1.5f 且无停顿。打完的同时（f96–110，与光标完稿两闪并行）一道强调色马克笔底色
// 从左到右铺到 "cinematic crew" 下半身给宣言一个落定；f110 后全静止，160f 总长 → 收尾真静止 50f。
// 等宽感：逐字符固定宽 span（等宽字体 100px，60px 槽），无 letter-spacing 动画。全部帧确定。
// 质感：柔光底 + 颗粒，主墨色近黑，光标是 6px 强调色圆角竖条。
//
// [Agent Edit] o chu: kicker (dong nho tren) / prefix (phan GIU lai) / wrong (cum tu "binh thuong" bi xoa) / right (cum tu
// "dat gia" go lai, duoc to marker). Chu tieng Viet bat ky do dai: dung Be Vietnam Pro (dong goi, du dau) thay font mono
// (may Windows / Mac khong co mono du dau tieng Viet). Chong rung khi go: moi dong CAN TRAI co dinh, toa do dong tinh san
// tu chuoi cuoi (wrapLines) -> ky tu moi chi noi them ben phai, khong dong nao dich (dung tinh than "左缘锚定").
// Nhip 3 toc do giu ti le 2 : 1.5 : 1.5 (chu dai -> ca 3 cung nhanh len theo cung he so), het go truoc f95, giu tinh >= 50f.
// Khung doc (portrait.mode = 'native'): chu to hon, xuong toi da 4 dong, ca khoi can giua theo chieu doc.
import { useCurrentFrame, useShot, useShotFonts, useText, useVideoConfig, measureText, wrapLines } from '../../../runtime';
import React from 'react';

import { G } from '../../../fixtures/Fixtures';
import { LOOKS, alpha } from '../../../fixtures/Look';
import { Backdrop, EASE, ramp } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const TYPEWRITER_ERROR_RETYPE_DURATION = 160;

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

type Layout = { lines: string[]; starts: number[] };
const layoutOf = (s: string, family: string, size: number, maxW: number, weight: number): Layout => {
  const lines = wrapLines(s, family, size, maxW, weight, 99);
  const starts: number[] = [];
  let idx = 0;
  for (const l of lines) {
    starts.push(idx);
    idx += l.length + 1;
  }
  return { lines, starts };
};

export const TypewriterErrorRetype: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const shot = useShot();
  const portrait = SH > 1080 * 1.2;
  const kicker = clean(useText('kicker', 'Giới thiệu'));
  const prefix = clean(useText('prefix', 'Đây là'));
  const wrong = clean(useText('wrong', 'một app ghi chú'));
  const right = clean(useText('right', 'trợ lý AI của riêng bạn'));
  // mau nhan: giu chàm goc cua mau khi video khong doi mau; video co mau nhan -> theo LOOKS (theme.ts da doi)
  const ACC = LOOKS.porcelain.accent === '#2f5bff' ? G.accent : LOOKS.porcelain.accent;

  const KEEP = prefix ? prefix.length + 1 : 0; // "prefix " giu lai
  const S1 = (prefix ? prefix + ' ' : '') + wrong;
  const S2 = (prefix ? prefix + ' ' : '') + right;
  const DEL = S1.length - KEEP;

  // ── bo cuc: co chu lon nhat de ca S1 lan S2 nam gon trong maxLines dong ──
  const FAM = fonts.sans;
  const WEIGHT = 600;
  const maxW = portrait ? 1600 : 1640;
  const maxLines = portrait ? 4 : 2;
  let SIZE = portrait ? 172 : 104;
  const minSize = portrait ? 96 : 60;
  for (let k = 0; k < 40; k++) {
    const a = wrapLines(S1, FAM, SIZE, maxW, WEIGHT, 99).length;
    const b = wrapLines(S2, FAM, SIZE, maxW, WEIGHT, 99).length;
    if ((a <= maxLines && b <= maxLines) || SIZE <= minSize) break;
    SIZE = Math.max(minSize, SIZE - 4);
  }
  // 1 tu qua dai (khong xuong dong duoc) -> thu nho theo tu dai nhat
  const longest = [...S1.split(' '), ...S2.split(' ')].reduce((m, w) => Math.max(m, measureText(w, FAM, SIZE, WEIGHT)), 0);
  if (longest > maxW) SIZE = Math.floor(SIZE * (maxW / longest));
  const L1 = layoutOf(S1, FAM, SIZE, maxW, WEIGHT);
  const L2 = layoutOf(S2, FAM, SIZE, maxW, WEIGHT);
  const lineH = SIZE * 1.3; // dau chong tang tieng Viet: gian dong >= 1.1
  const maxLineW = Math.max(...L2.lines.map((l) => measureText(l, FAM, SIZE, WEIGHT)));
  const LEFT = Math.round((1920 - maxLineW) / 2); // cau cuoi can giua, qua trinh go can trai co dinh
  const nRows = Math.max(L1.lines.length, L2.lines.length);
  const blockTop = Math.round(SH / 2 - (L2.lines.length * lineH) / 2);

  // ── nhip: 3 toc do 2 : 1.5 : 1.5 (giu ti le), chu dai -> nen deu de go xong truoc f95 ──
  const budget = 95 - 2 - 16 - 3.5;
  const kSpeed = Math.min(1, budget / Math.max(1, 2 * (S1.length - 1) + 1.5 * DEL + 1.5 * (right.length - 1)));
  const STEP1 = 2 * kSpeed;
  const STEP2 = 1.5 * kSpeed;
  const T1 = 2;
  const PAUSE_START = T1 + (S1.length - 1) * STEP1;
  const DS = PAUSE_START + 16;
  const RS = DS + DEL * STEP2 + 3.5;
  const TYPE2_END = RS + (right.length - 1) * STEP2;
  const CURSOR_OFF = TYPE2_END + 20;
  const HL_START = TYPE2_END + 1;
  const HL_DUR = 14;

  const cursorOn = (fr: number): boolean => {
    if (fr >= CURSOR_OFF) return false;
    if (fr >= TYPE2_END) return Math.floor((fr - TYPE2_END) / 5) % 2 === 0;
    if (fr >= DS) return true;
    if (fr >= PAUSE_START) return Math.floor((fr - PAUSE_START) / 4) % 2 === 0;
    return true;
  };

  const n1 = f < T1 ? 0 : Math.min(S1.length, Math.floor((f - T1) / STEP1) + 1);
  const removed = f < DS ? 0 : Math.min(DEL, Math.floor((f - DS) / STEP2) + 1);
  const n2 = f < RS ? 0 : Math.min(right.length, Math.floor((f - RS) / STEP2) + 1);
  const phase2 = f >= RS;
  const shownLen = phase2 ? KEEP + n2 : Math.min(n1, Math.max(KEEP, n1 - removed));
  const L = phase2 ? L2 : L1;

  // dong + toa do x cua con tro
  let cRow = 0;
  for (let i = 0; i < L.lines.length; i++) if (L.starts[i] <= shownLen) cRow = i;
  const inRow = Math.min(L.lines[cRow].length, shownLen - L.starts[cRow]);
  const cursorX = measureText(L.lines[cRow].slice(0, inRow), FAM, SIZE, WEIGHT);

  // marker: phu nua duoi cum "right" (theo tung dong, trai -> phai lien mach)
  const hl = ramp(f, HL_START, HL_DUR, EASE.snappy);
  const segs = L2.lines
    .map((l, i) => {
      const a = Math.max(0, KEEP - L2.starts[i]);
      if (a >= l.length) return null;
      const x0 = measureText(l.slice(0, a), FAM, SIZE, WEIGHT);
      const x1 = measureText(l, FAM, SIZE, WEIGHT);
      return { row: i, x0, w: x1 - x0 };
    })
    .filter((s): s is { row: number; x0: number; w: number } => !!s && s.w > 0);
  const total = segs.reduce((s, g) => s + g.w + 20, 0);
  let acc = 0;

  // dong nho: kicker + ten thuong hieu cua video (khong co thuong hieu & khong co kicker that -> an)
  const brandName = BRAND.name;
  const kickerGiven = typeof shot?.texts?.kicker === 'string' && !!String(shot?.texts?.kicker).trim();
  const showKicker = !!kicker && (!!brandName || kickerGiven || !shot);
  const KS = portrait ? 56 : 34;
  const kickerTop = blockTop - (portrait ? 150 : 104);

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden' }}>
      <Backdrop tone="light" light={{ x: 0.42, y: 0.3 }} accent={ACC} />
      {/* 马克笔底色：只铺在宣言词下半身，左→右 */}
      {hl > 0 &&
        segs.map((s) => {
          const start = acc;
          acc += s.w + 20;
          const p = Math.max(0, Math.min(1, (hl * total - start) / (s.w + 20)));
          if (p <= 0) return null;
          return (
            <div
              key={s.row}
              style={{
                position: 'absolute', left: LEFT + s.x0 - 10, top: blockTop + s.row * lineH + lineH / 2 + SIZE * 0.04,
                width: (s.w + 20) * p, height: SIZE * 0.38, borderRadius: 6,
                background: `linear-gradient(90deg, ${alpha(ACC, 0.26)} 0%, ${alpha(ACC, 0.2)} 100%)`,
              }}
            />
          );
        })}
      {/* 眉题：与打字行左缘对齐，开场 10f 淡入——标志 + 品牌名（视频自己的品牌） */}
      {showKicker && (
        <div style={{
          position: 'absolute', left: LEFT + 6, top: kickerTop, right: 120,
          display: 'flex', alignItems: 'center', gap: KS * 0.36,
          fontFamily: FAM, fontSize: KS, fontWeight: 500, letterSpacing: '0.01em', color: G.ink3, lineHeight: 1.3,
          opacity: ramp(f, 0, 10, EASE.out), whiteSpace: 'nowrap',
        }}>
          <ShotcraftMark size={KS * 1.18} tone="light" style={{ marginTop: -2 }} />
          <span>
            {kicker}
            {brandName ? <span style={{ fontWeight: 700, letterSpacing: '0.03em', color: G.ink1 }}> {brandName}</span> : null}
          </span>
        </div>
      )}
      {/* 左缘锚定：打字过程不横移（真打字机感）；每行左对齐、行位置由终稿预先算定 */}
      {Array.from({ length: nRows }, (_, i) => {
        const line = L.lines[i];
        if (line === undefined) return null;
        const cnt = Math.max(0, Math.min(line.length, shownLen - L.starts[i]));
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: LEFT, top: blockTop + i * lineH, height: lineH,
              display: 'flex', alignItems: 'center', whiteSpace: 'pre',
              fontFamily: FAM, fontSize: SIZE, fontWeight: WEIGHT, color: G.ink1, lineHeight: 1,
            }}
          >
            {line.slice(0, cnt)}
          </div>
        );
      })}
      {/* 光标：强调色竖条，条件挂载而非 opacity 0 */}
      {cursorOn(f) && (
        <div
          style={{
            position: 'absolute', left: LEFT + cursorX + SIZE * 0.05, top: blockTop + cRow * lineH + (lineH - SIZE * 0.98) / 2,
            width: Math.max(6, SIZE * 0.06), height: SIZE * 0.98, borderRadius: 3,
            background: ACC, boxShadow: `0 0 12px ${alpha(ACC, 0.35)}`,
          }}
        />
      )}
    </div>
  );
};
