// text-column-converge —— raycast-teams（实测素材 28–36s 段）重做版：
// 原片测量（1280 宽）：NEW 左缘钉死 x=412，特性词右缘钉死 x=867，
// 两词到左右屏边距相等（412 vs 413），轮换期间间距完全不收缩；
// 词换到 RAYCAST 后才发生唯一一次合拢——约 1.2s ease-in-out 连续滑动
// （左缘 412→554 / 右缘 867→725），"NEW RAYCAST" 以屏幕中线居中定格；
// 定格后约 0.6s，斜体 "COMING 2026" 在下方近乎硬切浮现。
// （以上为原片测量记录；内容来自视频：特性词轮换 → 合拢成「lead + final」；合拢终点按等宽字体实测宽度算。）
//
// 质感升级（节拍/钉死/唯一合拢全部不动）：
// - 暗场不再是 #050506 死黑：带冷色相的深底 + 中线上方极淡顶光 + 暗角 + soft-light 颗粒。
// - 词换瞬间 1 帧提亮（原片的打字机换行感，>1f 读作故障所以只给 1f）。
// - NEW 轮换期是次级灰（像目录页标签），合拢过程中随进度提亮到与特性词同色——两半变成一句话。
// - 合拢滑动按真实速度给水平方向运动模糊（两词方向相反），静止为 0；落定后背后柔光微微亮起。
// - 斜体小字降为三级色，层级清楚；补导出时长常量（原工作台按 16f 推断，只剩开头半秒）。
//
// [Agent Edit] o chu: lead (tu ben trai dung yen, vd "RA MẮT") / items (3-8 tu khoa tinh nang thay nhau o ben phai, in hoa) /
// final (tu cuoi = ten san pham / thong diep, sau do hai tu truot vao giua ghep thanh mot cum) / subtitle (dong nghieng nho
// hien sau khi ghep). Font = FONT.mono (JetBrains Mono, dang deu, du dau tieng Viet) -> diem ghep do bang measureText.
// Le trai = le phai (luon doi xung): khung ngang giu 618px goc va co 42px (tu dai -> le thu lai, toi thieu 240px roi moi
// thu nho chu); khung doc (native) le 90px, co chu lon (toi da 120px) vua tu dai nhat -> doc ro tren dien thoai.
// Nhip doi tu giu mau 16/12/9/8/7/8/10/12f (it tu hon -> moi tu o lau hon toi da 1.5x).
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, measureText, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { FONT, Grain, SpeedBlur, Vignette, ramp, EASE } from '../../../fixtures/Polish';
import { BRAND } from '../../../fixtures/Brand';

const DURS = [16, 12, 9, 8, 7, 8, 10, 12]; // 停留帧数不均（机器节奏）
const START = 8; // 开场黑场立静

const LSP_EM = 3 / 42; // letterSpacing（原版 3px @42）
const CONVERGE_DUR = 36; // 合拢时长：原片 ~1.2s ≈ 36 帧
const CONVERGE_DELAY = 10; // 末词停稳后先静置 10 帧再合拢（原片 32.4→32.7s）
const SUB_DELAY = 18; // 合拢定格后 ~0.6s 出斜体小字

// 8f 黑场 + 82f 轮换 + 10f 停稳 + 36f 合拢 + 18f 定格 + 4f 小字 + 22f 静置 = 180f（6.0s）
export const TEXT_COLUMN_CONVERGE_DURATION = 180;

const INK = '#eeeef2';
const INK_NEW = '#8a8c96'; // 轮换期 lead 的次级灰
const INK_SUB = '#a3a5ae';

// 简单 hex 混色（lead 由次级灰提亮到主色）
const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, k) => Math.round(v + (pb[k] - v) * t)).join(',')})`;
};

export const TextColumnConverge: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const lead = useText('lead', 'RA MẮT').toUpperCase();
  const items = useList('items', ['PHỤ ĐỀ TỰ ĐỘNG', 'XUẤT VIDEO 4K', 'NHẠC NỀN AI', 'CẮT GHÉP NHANH', 'LỒNG TIẾNG', 'MẪU CẢNH MỚI', 'XEM TRƯỚC', 'ĐĂNG MỘT CHẠM'])
    .slice(0, 8)
    .map((x) => x.toUpperCase());
  const final = useText('final', '') || BRAND.name || 'PHIÊN BẢN MỚI';
  const subtitle = useText('subtitle', 'THÁNG 11 · 2026');

  // 轮换表：词少时每词停留拉长（≤1.5 倍），保持不均匀节奏
  const base = DURS.slice(0, items.length);
  const kDur = Math.min(1.5, Math.max(1, 82 / Math.max(1, base.reduce((x, y) => x + y, 0))));
  const STEPS = [...items.map((w, i) => ({ word: w, dur: Math.round(base[i] * kDur) })), { word: final, dur: 999 }];
  const LAST_START = START + STEPS.slice(0, -1).reduce((x, st) => x + st.dur, 0);

  // 字号与屏边距：左右边距永远相等；竖屏放大
  const fam = fonts.mono;
  const wM = (txt: string, size: number) => measureText(txt, fam, size, 500) + txt.length * LSP_EM * size;
  const longest = Math.max(...STEPS.map((st) => wM(st.word, 100)));
  const leadW100 = wM(lead, 100);
  const gap100 = wM(' ', 100);
  const need100 = leadW100 + gap100 * 2 + longest; // lead + 至少两格空隙 + 最长词
  let FS: number;
  let M: number;
  if (portrait) {
    M = 90;
    FS = Math.min(120, Math.floor(((1920 - 2 * M) / need100) * 100));
  } else {
    FS = 42;
    M = 618;
    const avail = 1920 - 2 * M;
    if ((need100 * FS) / 100 > avail) {
      M = Math.max(240, (1920 - (need100 * FS) / 100) / 2);
      if ((need100 * FS) / 100 > 1920 - 2 * M) FS = Math.floor(((1920 - 2 * M) / need100) * 100);
    }
  }
  const LSP = LSP_EM * FS;
  const NEW_LEFT_EDGE = M;
  const WORD_RIGHT_EDGE = 1920 - M;
  // 合拢终点：按等宽字体实测宽度，lead + 一个空格 + final 整行居中
  const LINE_W = wM(`${lead} ${final}`, FS);
  const MERGED_LEFT = 960 - LINE_W / 2;
  const MERGED_RIGHT = 960 + LINE_W / 2;
  const subSize = fitSize(subtitle, { family: fam, size: FS, maxWidth: 1920 - MERGED_LEFT - M * 0.5, weight: 500, italic: true, minSize: FS * 0.6, letterSpacingEm: LSP_EM });
  const top = SH / 2 - FS / 2 - (subtitle ? 0 : 0);

  // 合拢进度（以帧为自变量，供求速度）
  const cvAt = (frame: number) =>
    interpolate(frame - LAST_START - CONVERGE_DELAY, [0, CONVERGE_DUR], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    });

  const t = f - START;

  // 定位当前步
  let acc = 0;
  let idx = 0;
  let stepStart = 0;
  for (let i = 0; i < STEPS.length; i++) {
    if (t >= acc) { idx = i; stepStart = acc; }
    acc += STEPS[i].dur;
  }
  const cur = STEPS[idx];
  const isLast = idx === STEPS.length - 1;
  const local = t - stepStart;

  // 唯一一次合拢：末词停稳 CONVERGE_DELAY 帧后，ease-in-out 连续滑动
  const cvT = isLast ? local - CONVERGE_DELAY : -1;
  const cv = interpolate(cvT, [0, CONVERGE_DUR], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  const newLeft = interpolate(cv, [0, 1], [NEW_LEFT_EDGE, MERGED_LEFT]);
  const wordRight = interpolate(cv, [0, 1], [WORD_RIGHT_EDGE, MERGED_RIGHT]);

  const converged = cv >= 1;

  // 斜体小字：合拢定格后 SUB_DELAY 帧，近乎硬切（4 帧快速淡入，无位移）
  const subT = converged ? cvT - CONVERGE_DUR - SUB_DELAY : -1;
  const subOp = interpolate(subT, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const visible = t >= 0;

  const font: React.CSSProperties = {
    fontFamily: FONT.mono,
    fontWeight: 500,
    fontSize: FS,
    letterSpacing: LSP,
    color: INK,
    whiteSpace: 'nowrap',
    lineHeight: 1,
  };

  // 词换瞬间 1 帧提亮（首词不闪）
  const flash = local === 0 && idx > 0 ? 1 : 0;
  const wordColor = flash ? '#ffffff' : INK;
  const wordGlow = flash ? '0 0 14px rgba(200,210,255,0.35)' : 'none';

  // 合拢速度（px/帧）→ 水平运动模糊；两词相向
  const span = MERGED_LEFT - NEW_LEFT_EDGE;
  const v = (cvAt(f + 0.5) - cvAt(f - 0.5)) * span;
  // 落定后背后柔光
  const glow = ramp(cvT, CONVERGE_DUR - 6, 24, EASE.out);
  const u = FS / 42;
  // [Agent Edit] nen anh AI: bo nen toi + quang + vignette + hat; chu co bong toi nhe
  const bd = useBackdrop();
  const TSH = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : '#08090c', overflow: 'hidden' }}>
      {/* 冷色深底 + 中线上方极淡顶光 */}
      {!bd && <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 40%, rgba(120,130,170,0.10), rgba(120,130,170,0) 70%), ' +
            'linear-gradient(180deg, #0d0e12 0%, #08090c 60%, #060709 100%)',
        }}
      />}
      {/* 合拢落定后背后柔光微亮 */}
      {!bd && <div
        style={{
          position: 'absolute', left: 960 - 520 * Math.min(1.8, u), top: SH / 2 - 150 * Math.min(2, u), width: 1040 * Math.min(1.8, u), height: 300 * Math.min(2, u),
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(170,180,230,0.10), rgba(170,180,230,0) 70%)',
          opacity: glow,
        }}
      />}
      {visible && (
        <div style={{ position: 'absolute', inset: 0, textShadow: TSH }}>
          {/* lead：左缘定位（轮换期间钉死在左屏边距处）；随合拢由次级灰提亮 */}
          <SpeedBlur vx={v} amount={0.35} max={4 * Math.max(1, u * 0.7)}>
            <div style={{
              ...font, position: 'absolute',
              left: newLeft, top,
              color: mixHex(INK_NEW, INK, ramp(cvT, 0, CONVERGE_DUR * 0.8, EASE.smooth)),
            }}>
              {lead}
            </div>
          </SpeedBlur>
          {/* 特性词：右缘定位（词换长换短，右缘不动） */}
          <SpeedBlur vx={-v} amount={0.35} max={4 * Math.max(1, u * 0.7)}>
            <div style={{
              ...font, position: 'absolute',
              right: 1920 - wordRight, top,
              color: wordColor, textShadow: wordGlow === 'none' ? TSH : wordGlow + (TSH ? ', ' + TSH : ''),
            }}>
              {cur.word}
            </div>
          </SpeedBlur>

          {/* 斜体小字：合拢后在整行正下方浮现，与整行同左缘 */}
          {subtitle ? (
            <div style={{
              ...font,
              fontSize: subSize,
              letterSpacing: LSP_EM * subSize,
              fontStyle: 'italic',
              color: INK_SUB,
              position: 'absolute',
              left: MERGED_LEFT, top: top + FS + 14 * u + FS * 0.12,
              opacity: subOp,
            }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      )}
      {!bd && <Vignette strength={0.5} inner={0.45} color="#000000" />}
      {!bd && <Grain opacity={0.07} blend="soft-light" />}
    </AbsoluteFill>
  );
};
