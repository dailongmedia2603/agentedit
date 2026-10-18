// scan-bracket-sweep — Scan Bracket 取景括号扫描光带（motion-lab 定稿转原生 Remotion）
// 文档弹到画面中央，四角落下 L 形取景括号（向内位移 8px），随后一条扫描光带带着
// 朝来向的渐变拖尾在文档上往复扫 5 趟，两端慢中间快，文档本身完全静止。
// 设计坐标 480×270（DesignStage raster="zoom"：文档小字按成片尺寸栅格化，不糊）。
//
// 质感升级：骨架灰条换成出版级的明细表（标题 / 元信息 / 4 列 n 行 / 合计）；
// 光带从"黑线 + 灰泥拖尾"改成靛蓝扫描光——细亮芯 + 柔辉 + 正片叠底的色调拖尾，
// 拖尾长度随扫描速度伸缩（趟末停顿时收成 0，换向不再"啪"地跳到另一侧）；
// 光带经过的表格行被轻微照亮（光在读，文档不动）；括号改成圆头描边并带一次轻过冲落位；
// 背景换柔光底 + 颗粒，文档带随落位收紧的两层阴影。
//
// [Agent Edit] o chu: title (ten tai lieu) / items (4-7 dong cua bang — cot dau; cac cot khac la so lieu gia trung tinh) /
// meta (dong phu duoi tieu de). O anh `screen` (tuy chon): co anh that (anh chup hop dong / hoa don / man hinh) thi tai lieu
// hien anh do (cover) thay cho bang gia; anh sang quet van chay tren anh. Khung doc (portrait.mode = 'native'): tai lieu
// cao 290x430 (don vi thiet ke, x6.2), chu bang to hon, ngoac goc 44; khung ngang giu kich thuoc goc 300x178 (x4).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useBackdrop, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import { E, lerp, seg, useT } from '../../../fixtures/Motion';
import { Backdrop, EASE, Grain, softShadow } from '../../../fixtures/Polish';
import { G } from '../../../fixtures/Fixtures';

export const SCAN_BRACKET_SWEEP_DURATION = 150; // 5000ms @30fps

// —— 颜色：INK 负责括号与正文，SCAN 是唯一的光色（光带芯 / 辉光 / 拖尾共用，换肤只改这两个）——
const INK = '#16171c'; // 带冷调的近黑（替代纯黑）
const INK2 = '#5d5f66';
const INK3 = '#9b9da3';
const HAIR = 'rgba(20,22,28,0.09)';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const inOutSin = (x: number) => 0.5 - Math.cos(Math.PI * clamp01(x)) / 2;
const rgbStr = (hex: string) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

const PASSES = 5;

// 文档几何：横版 = 原版 300×178（×4）；竖版 = 290×430（×6.2），行距 / 字号随之放大
type Doc = {
  S: number; DW: number; DH: number; PADX: number; ROW_TOP: number; ROW_H: number;
  fTitle: number; fMeta: number; fHead: number; fRow: number; fTotal: number; fChip: number;
  titleY: number; metaY: number; rule1: number; headY: number; rule2: number; CS: number; TAIL: number; R: number;
};
const docOf = (portrait: boolean, n: number): Doc => {
  if (!portrait) {
    return { S: 4, DW: 300, DH: 178, PADX: 14, ROW_TOP: 58, ROW_H: Math.min(13 * 1.45, 91 / n), fTitle: 8.6, fMeta: 5.4, fHead: 4.5, fRow: 5.6, fTotal: 7, fChip: 4.6,
      titleY: 11, metaY: 23, rule1: 36, headY: 44, rule2: 52.5, CS: 36, TAIL: 82, R: 10 };
  }
  const ROW_H = Math.min(34 * 1.4, 238 / n);
  return { S: 6.2, DW: 290, DH: 430, PADX: 18, ROW_TOP: 112, ROW_H, fTitle: 13.5, fMeta: 7.4, fHead: 6.4, fRow: 9, fTotal: 11, fChip: 6.4,
    titleY: 20, metaY: 52, rule1: 72, headY: 86, rule2: 99, CS: 46, TAIL: 150, R: 12 };
};

const CATS = ['Marketing', 'Vận hành', 'Nhân sự', 'Công nghệ', 'Vận hành', 'Marketing', 'Khác'];
const DATES = ['02/07', '05/07', '10/07', '14/07', '21/07', '26/07', '30/07'];
const VALUES = [42.5, 28, 64, 12.8, 9.6, 21.5, 7.9];
const vnNum = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

export const ScanBracketSweep: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const SCAN = rgbStr(G.accent); // 扫描光（rgb 分量，便于拼 alpha）
  const bd = useBackdrop();
  const title = useText('title', 'Báo cáo chi phí quý 3');
  const meta = useText('meta', 'Phòng Kế toán · Bản rà soát · 07/2025');
  const items = useList('items', ['Quảng cáo Facebook', 'Thuê văn phòng', 'Lương nhân sự', 'Phần mềm & công cụ', 'Vận chuyển', 'Sự kiện ra mắt', 'Chi phí khác']).slice(0, 7);
  const screen = useImage('screen');
  const n = Math.max(1, items.length);
  const D0 = docOf(portrait, Math.max(4, n)); // 行少时拉开行距（合计行位置不变）
  // 页眉：标题放不进（标题 + 计数 chip）一行时，去掉 chip、标题折两行，下方整体下移
  const icon = D0.fTitle / 8.6;
  const total = items.reduce((a, _, r) => a + VALUES[r % 7], 0);
  const chip = `${n} MỤC · ${vnNum(total)} TR`;
  const chipW = measureText(chip, fonts.mono, D0.fChip, 400) * 1.04 + 9 * icon + 4;
  const titleX = D0.PADX + 13 * icon;
  const tMaxChip = D0.DW - D0.PADX - titleX - chipW - 6;
  let titleLines = [title];
  let titleSize = fitSize(title, { family: fonts.sans, size: D0.fTitle, maxWidth: tMaxChip, weight: 650, minSize: D0.fTitle * 0.66 });
  let showChip = true;
  if (measureText(title, fonts.sans, titleSize, 650) > tMaxChip + 0.5) {
    showChip = false;
    const tMax = D0.DW - D0.PADX - titleX;
    titleLines = wrapLines(title, fonts.sans, D0.fTitle * 0.92, tMax, 650, 2);
    titleSize = Math.min(D0.fTitle * 0.92, ...titleLines.map((l) => fitSize(l, { family: fonts.sans, size: D0.fTitle * 0.92, maxWidth: tMax, weight: 650, minSize: D0.fTitle * 0.6 })));
  }
  const extra = (titleLines.length - 1) * titleSize * 1.2;
  const rowH = portrait ? D0.ROW_H : Math.min(D0.ROW_H, (91 - extra) / Math.max(4, n));
  const D: Doc = { ...D0, metaY: D0.metaY + extra, rule1: D0.rule1 + extra, headY: D0.headY + extra, rule2: D0.rule2 + extra, ROW_TOP: D0.ROW_TOP + extra, ROW_H: rowH };
  const footY = D.ROW_TOP + n * rowH + (portrait ? 8 : 3);
  // 竖版文档高度随内容收紧（合计行下留白）；横版保持原版 178
  if (portrait && !screen) D.DH = Math.max(300, footY + D.fRow * 0.9 + D.fTotal * 1.3 + 28);
  const { DW, DH, PADX, ROW_H, ROW_TOP, CS } = D;
  const dt = 1 / (SCAN_BRACKET_SWEEP_DURATION - 1); // 一帧对应的 t

  // 画布：整张画面按设计坐标 zoom（文档小字按成片尺寸栅格化，不糊）
  const CWd = 1920 / D.S;
  const CHd = SH / D.S;
  const DX = (CWd - DW) / 2;
  const DY = (CHd - DH) / 2;

  // 表格列：4 列（标签列最宽）
  const inner = DW - PADX * 2;
  const gap = portrait ? 8 : 10;
  const fr = [0.38, 0.22, 0.14, 0.26];
  const colW = fr.map((f) => (inner - 3 * gap) * f);
  const colX = (c: number) => PADX + colW.slice(0, c).reduce((a, b) => a + b + gap, 0);
  const HEAD = ['Hạng mục', 'Nhóm', 'Ngày', 'Số tiền'];
  const ROWS = items.map((it, r) => [it, CATS[r % 7], DATES[r % 7], `${vnNum(VALUES[r % 7])} tr`]);

  // 四角取景括号：外扩 −7、臂长 CS-2，1.6px 圆头 L 形
  const e = CS - 1;
  const CORNERS = [
    { left: -8, top: -8, d: `M1 ${e}V1h${e - 1}`, dx: 1, dy: 1 },
    { left: DW + 8 - CS, top: -8, d: `M1 1h${e - 1}v${e - 1}`, dx: -1, dy: 1 },
    { left: DW + 8 - CS, top: DH + 8 - CS, d: `M${e} 1v${e - 1}H1`, dx: -1, dy: -1 },
    { left: -8, top: DH + 8 - CS, d: `M${e} ${e}H1V1`, dx: 1, dy: -1 },
  ];

  // 扫描位置（文档内 y，0→DH）与方向：t 的纯函数，便于求速度
  const scanAt = (tt: number) => {
    const sp = seg(tt, 0.17, 0.95, E.linear);
    const raw = sp * PASSES;
    const pi = Math.min(PASSES - 1, Math.floor(raw));
    const local = clamp01((raw - pi) / 0.88); // 每趟末尾 12% 完全停顿
    const dir = pi % 2 === 0 ? 1 : -1;
    const prog = inOutSin(local);
    return { y: dir > 0 ? prog * DH : DH - prog * DH, dir };
  };

  // 文档弹入：scale 0.86→1（snappy），透明度 dp*3 提前满亮——先"在了"再"稳了"
  const dp = seg(t, 0, 0.11, EASE.snappy);
  const elev = lerp(dp, 22, 6);

  // 扫描：位置 + 速度（拖尾长度跟速度走，趟末停顿处收成 0）
  const { y, dir } = scanAt(t);
  const speed = Math.abs(scanAt(t + dt / 2).y - scanAt(t - dt / 2).y); // 设计 px/帧
  const PEAK = (DH * Math.PI) / 2 / (((0.78 * SCAN_BRACKET_SWEEP_DURATION) / PASSES) * 0.88);
  const sNorm = clamp01(speed / PEAK);
  const tail = D.TAIL * Math.pow(sNorm, 0.75);
  // 光带整体淡入（0.16–0.20）淡出（0.93–0.99）
  const clipOp = seg(t, 0.16, 0.2) * (1 - seg(t, 0.93, 0.99));

  // 行照亮：光芯离行中心越近越亮（纯空间函数，文档本身不动）
  const lit = (cy: number) => clipOp * Math.exp(-Math.pow((y - cy) / (ROW_H * 0.54), 2));

  const cell = (txt: string, c: number, top: number, size: number, style: React.CSSProperties, key?: string) => {
    const w = (style.fontWeight as number) || 450;
    const fs = fitSize(txt, { family: fonts.sans, size, maxWidth: colW[c], weight: w, minSize: size * 0.72 });
    // 竖版行距够：放不下的标签折两行（不截断）
    if (portrait && c === 0 && measureText(txt, fonts.sans, fs, w) > colW[c] + 0.5 && ROW_H >= size * 2.5) {
      const ls = wrapLines(txt, fonts.sans, size * 0.86, colW[c], w, 2);
      const f2 = Math.min(size * 0.86, ...ls.map((l) => fitSize(l, { family: fonts.sans, size: size * 0.86, maxWidth: colW[c], weight: w, minSize: size * 0.6 })));
      return (
        <div key={key} style={{ position: 'absolute', top: top - f2 * 0.6, left: colX(c), width: colW[c], lineHeight: 1.2, fontSize: f2, whiteSpace: 'nowrap', ...style }}>
          {ls.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      );
    }
    return (
      <div
        key={key}
        style={{
          position: 'absolute', top, left: colX(c), width: colW[c], textAlign: c === 3 ? 'right' : 'left',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25, fontSize: fs, ...style,
        }}
      >
        {txt}
      </div>
    );
  };
  const metaSize = fitSize(meta, { family: fonts.sans, size: D.fMeta, maxWidth: DW - PADX * 2 - 13 * (D.fTitle / 8.6), weight: 400, minSize: D.fMeta * 0.75 });

  return (
    <AbsoluteFill>
      {/* [Agent Edit] nen anh AI (useBackdrop): bo nen sang + hat tu ve, tai lieu noi tren anh */}
      {!bd && <Backdrop tone="light" light={{ x: 0.5, y: 0.3 }} accent={G.accent} grain={0} vignette={0.16} />}
      <div style={{ position: 'absolute', left: 0, top: 0, width: CWd, height: CHd, zoom: D.S, overflow: 'hidden' }}>
        {/* holder：文档 + 光带 + 括号共用的定位容器 */}
        <div style={{ position: 'absolute', left: DX, top: DY, width: DW, height: DH }}>
          {/* 文档卡片：发丝线 + 顶部内高光 + 随落位收紧的两层阴影 */}
          <div
            style={{
              position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #ffffff 0%, #fcfcfb 100%)', borderRadius: D.R,
              boxShadow: `inset 0 0 0 0.3px ${HAIR}, inset 0 0.4px 0 rgba(255,255,255,0.9), ${softShadow(elev / 4, { strength: 1.1 })}`,
              overflow: 'hidden', transformOrigin: '50% 50%', transform: `scale(${lerp(dp, 0.86, 1)})`, opacity: clamp01(dp * 3),
              fontFamily: fonts.sans, color: INK, fontVariantNumeric: 'tabular-nums',
            }}
          >
            {screen ? (
              // 真实文档 / 截图：铺满文档卡（任意比例 → cover，居中）
              <img src={screen} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%' }} />
            ) : (
              <>
                {/* 页眉：文档图标 + 标题 + 计数 chip */}
                <svg style={{ position: 'absolute', left: PADX, top: D.titleY - 0.5 * icon }} width={9 * icon} height={11 * icon} viewBox="0 0 9 11">
                  <path d="M1 .5h4.6L8.5 3.4V10a.5.5 0 0 1-.5.5H1A.5.5 0 0 1 .5 10V1A.5.5 0 0 1 1 .5z" fill="#eef0fb" stroke={`rgb(${SCAN})`} strokeWidth={0.6} />
                  <path d="M5.5.6v2.9h2.9" fill="none" stroke={`rgb(${SCAN})`} strokeWidth={0.6} />
                </svg>
                <div style={{ position: 'absolute', left: PADX + 13 * icon, top: D.titleY - titleSize * 0.15, fontSize: titleSize, fontWeight: 650, letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  {titleLines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
                <div style={{ position: 'absolute', left: PADX + 13 * icon, top: D.metaY - metaSize * 0.15, fontSize: metaSize, color: INK2, lineHeight: 1.25, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                  {meta}
                </div>
                {showChip && <div
                  style={{
                    position: 'absolute', right: PADX, top: D.titleY + 1, padding: `${2 * icon}px ${4.5 * icon}px`, borderRadius: 4 * icon, background: '#f3f3f1',
                    boxShadow: `inset 0 0 0 0.3px ${HAIR}`, fontFamily: fonts.mono, fontSize: D.fChip, color: INK2, letterSpacing: '0.04em', lineHeight: 1.1, whiteSpace: 'nowrap',
                  }}
                >
                  {chip}
                </div>}
                <div style={{ position: 'absolute', left: PADX, right: PADX, top: D.rule1, height: 0.3, background: HAIR }} />

                {/* 表头 */}
                {HEAD.map((h, c) => cell(h.toUpperCase(), c, D.headY - D.fHead * 0.12, D.fHead, { fontWeight: 600, color: INK3, letterSpacing: '0.07em' }, `h${c}`))}
                <div style={{ position: 'absolute', left: PADX, right: PADX, top: D.rule2, height: 0.3, background: HAIR }} />

                {/* 明细行：光芯经过时整行被轻微照亮 */}
                {ROWS.map((row, r) => {
                  const top = ROW_TOP + r * ROW_H;
                  const Lt = lit(top + D.fRow * 0.55);
                  return (
                    <React.Fragment key={r}>
                      <div
                        style={{
                          position: 'absolute', left: PADX * 0.57, right: PADX * 0.57, top: top - (ROW_H - D.fRow * 1.1) / 2, height: ROW_H - 1, borderRadius: 3 * icon,
                          background: `rgba(${SCAN},${(Lt * 0.09).toFixed(3)})`,
                        }}
                      />
                      {row.map((v, c) =>
                        cell(v, c, top - D.fRow * 0.12, D.fRow, {
                          letterSpacing: '-0.012em', fontWeight: c === 0 || c === 3 ? 520 : 420, color: c === 0 || c === 3 ? INK : INK2,
                        }, `c${r}-${c}`),
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 合计 */}
                <div style={{ position: 'absolute', left: PADX, right: PADX, top: footY, height: 0.3, background: HAIR }} />
                {cell('Tổng cộng', 0, footY + D.fRow * 0.9, D.fRow, { fontWeight: 600 }, 'f0')}
                {cell(`${n} mục`, 2, footY + D.fRow * 0.9, D.fRow, { color: INK2 }, 'f2')}
                {cell(`${vnNum(total)} triệu`, 3, footY + D.fRow * 0.75, D.fTotal, { fontWeight: 680, letterSpacing: '-0.01em' }, 'f3')}
              </>
            )}
          </div>

          {/* 扫描光带（裁在文档同圆角内）：细亮芯 + 柔辉 + 朝来向的色调拖尾 */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: D.R, overflow: 'hidden', pointerEvents: 'none', opacity: clipOp }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 0, transform: `translateY(${y.toFixed(3)}px)` }}>
              {/* 拖尾：正片叠底把表格"染"上光色；长度随速度伸缩，下行挂上方、上行挂下方 */}
              <div
                style={{
                  position: 'absolute', left: 0, right: 0, height: tail, top: dir > 0 ? -tail : 0, mixBlendMode: 'multiply',
                  background:
                    dir > 0
                      ? `linear-gradient(180deg, rgba(${SCAN},0) 0%, rgba(${SCAN},0.06) 55%, rgba(${SCAN},0.2) 100%)`
                      : `linear-gradient(0deg, rgba(${SCAN},0) 0%, rgba(${SCAN},0.06) 55%, rgba(${SCAN},0.2) 100%)`,
                }}
              />
              {/* 柔辉：光芯两侧对称的窄光晕 */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: -5, height: 10, background: `linear-gradient(180deg, rgba(${SCAN},0) 0%, rgba(${SCAN},0.22) 50%, rgba(${SCAN},0) 100%)` }} />
              {/* 光芯：1.2px 强调色线，中间提亮成白热 */}
              <div
                style={{
                  position: 'absolute', left: 0, right: 0, top: -0.6, height: 1.2,
                  background: `linear-gradient(90deg, rgba(${SCAN},0.55) 0%, rgb(${SCAN}) 18%, rgba(255,255,255,0.85) 50%, rgb(${SCAN}) 82%, rgba(${SCAN},0.55) 100%)`,
                  boxShadow: `0 0 2.5px rgba(${SCAN},0.75)`,
                }}
              />
            </div>
          </div>

          {/* 四角取景括号：交错落位，从外侧 8px 带一次轻过冲收进来 */}
          {CORNERS.map((c, i) => {
            const t0 = 0.08 + i * 0.022;
            const a = seg(t, t0, t0 + 0.03); // 透明度先到
            const p = EASE.overshoot(clamp01((t - t0) / 0.055)); // 位移带 ~8% 过冲
            const off = (1 - p) * 8;
            return (
              <svg
                key={i} width={CS} height={CS} viewBox={`0 0 ${CS} ${CS}`}
                style={{ position: 'absolute', left: c.left, top: c.top, overflow: 'visible', opacity: a, transform: `translate(${(-off * c.dx).toFixed(3)}px,${(-off * c.dy).toFixed(3)}px)` }}
              >
                <path d={c.d} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );
          })}
        </div>
      </div>
      {!bd && <Grain opacity={0.045} />}
    </AbsoluteFill>
  );
};
