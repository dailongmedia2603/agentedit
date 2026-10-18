// circle-match-iris — 圆心匹配光圈切（match-cut × iris）：光圈从前景一个真圆的圆心炸开，
// 圈内新景的圆环图表接在同一个圆上——"这个人的头像"变成"这个人的数据"。
//
// 第二轮重设计（创作者周榜 · 荧光柠檬）：
// - look = lime（石墨底 + 荧光黄绿）。景 A 是 video-shotcraft 工作室的本周出片榜：五行大字号排行，
//   第 3 行是「你」——荧光绿实心头像圆（72px）是全片唯一的强调色块，也是匹配剪辑的锚点。
// - 定睛：其他行降到 32% 亮度、「你」这行抬亮，头像两次脉冲 + 两道荧光涟漪；相机以锚点为原点缓推 3%
//   （锚点在屏幕上纹丝不动）。
// - 接圆（命门）：头像实心圆本身"镂空"成圆环——描边宽度从 = 直径（实心盘）收到 44px、半径 36→300，
//   光圈半径 = 圆环外沿 + 一段 ease-in 加速的外扩，所以是"圆环把光圈撑开"，接圆发生在光圈吃满屏之前。
//   旧页同时以锚点为心被推远（放大 + 压暗），新景"压"在旧页之上。
// - 景 B：同心的计时刻度盘 + 圆环 sweep 到 87%（本周出片目标），中央 200px 数字与 sweep 同步计数；右侧大标题逐词升起、
//   三枚数据错峰落位。
//
// 时间表（30fps，共 165f）：
//   0–18    预备：舞台光、五行榜单逐行从下浮现（第 0 帧已有第一行的起始态）
//   14–40   定睛：其余行压暗；18f / 30f 两次头像脉冲 + 涟漪；相机以锚点缓推 1→1.03
//   40–47   蓄力：头像收到 0.9（预备）
//   47–75   主动作：实心头像镂空成圆环，r 36→300（spring 式 expo-out，28f），光圈被圆环撑开，
//           54–84 光圈 ease-in 加速外扩吃满屏；旧页放大 1.03→1.22 并压暗
//   60–118  跟随：sweep 0→87%（慢起长尾 58f），数字同步计数；76–104 右侧标题逐词升起、数据错峰；
//           108f 排名胶囊回扣景 A
//   118–165 hold：刻度盘极缓旋转 + 圆环光呼吸，最后是一张完整的海报
//
// [Agent Edit] o chu: board_label / board_title / metric (dau bang xep hang) / rows (3-5 ten, dong GIUA la "ban" = diem neo)
// / values / details / percent (con so trong vong tron, vd 87) / goal_label / kicker / title / subtitle / stats (3 muc
// "gia tri — nhan") / pill. Thuong hieu cua video (neu co) dung dau bang. Font mono (so hang, chenh lech) -> sans so
// deu. Chu "len tu duoi vach" tu viet (TextReveal cua fixtures chi chua 0.06em phia tren -> cat dau tieng Viet).
// Khung doc (portrait.mode = 'native'): bang xep hang phu ngang khung (dong cao hon, chu to), tam neo = tam avatar dong
// giua; vong tron mo ra DUNG tam neo (khop hinh giu nguyen), sau khi mong mat da phu kin man hinh (f78) vong tron truot
// mem ve giua nua tren (f78-98), cot chu xep ben duoi va vao muon 20f. Khung ngang giu dung bo cuc + nhip goc.
import { useBrand, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';

import { EASE, Grain, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, TYPE, alpha, stagger, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const CIRCLE_MATCH_IRIS_DURATION = 165;

const L = LOOKS.lime;
const GOAL_DEFAULT = 0.87;

const DELTAS = ['+8', '+3', '+5', '−1', '+1'];
const VALUES = ['61', '53', '47', '44', '39'];
const DETAILS = ['Hà Nội · 7 video', 'Đà Nẵng · 6 video', 'TP.HCM · 6 video', 'Cần Thơ · 5 video', 'Huế · 4 video'];

// 光圈外扩：前段很慢（让圆环先把它撑开）、后段加速吃满
const IRIS_EASE = bezier(0.62, 0, 0.32, 1);
// sweep：起笔稍慢（接住圆环生长的尾速）、长尾落定，读数在最后 1/3 慢慢爬到 87
const SWEEP_EASE = bezier(0.4, 0, 0.12, 1);

const initials = (s: string) => {
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  const pick = w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0].slice(0, 2);
  return pick.toLocaleUpperCase('vi');
};

// 逐词「从线下升起」：遮罩框上 0.32em / 下 0.26em 留白（越南语叠加声调不被裁）
const WordRise: React.FC<{ lines: string[]; start: number; each: number; gap: number; lh: number }> = ({ lines, start, each, gap, lh }) => {
  const f = useCurrentFrame();
  let k = 0;
  return (
    <>
      {lines.map((l, li) => (
        <div key={li} style={{ height: lh, lineHeight: `${lh}px`, whiteSpace: 'pre' }}>
          {l.split(' ').map((w, wi) => {
            const p = ramp(f, start + (k++) * gap, each, EASE.snappy);
            return (
              <React.Fragment key={wi}>
                {wi > 0 ? ' ' : null}
                <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.03em 0.26em', margin: '-0.32em -0.03em -0.26em' }}>
                  <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
                </span>
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </>
  );
};

export const CircleMatchIris: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const FAM = fonts.sans;

  // ── 文字槽 ──
  const boardLabel = useText('board_label', 'Bảng xếp hạng').trim();
  const boardTitle = useText('board_title', 'Tuần 41').trim();
  const metric = useText('metric', 'Video đã đăng').trim();
  const rowNames = useList('rows', ['Minh Quân', 'Thu Hà', 'Bạn', 'Đức Anh', 'Lan Phương']).slice(0, 5);
  while (rowNames.length < 3) rowNames.push(['Minh Quân', 'Thu Hà', 'Đức Anh'][rowNames.length]);
  const values = useList('values', VALUES);
  const details = useList('details', DETAILS);
  const pctText = useText('percent', '87');
  const goalLabel = useText('goal_label', 'mục tiêu 54 video').trim();
  const kickerText = useText('kicker', 'Tuần của bạn').trim();
  const titleText = useText('title', 'Sắp về đích.').replace(/\s+/g, ' ').trim();
  const subText = useText('subtitle', 'Chỉ còn 7 video nữa là hoàn thành.').trim();
  const statItems = useList('stats', ['47 video — Đã đăng', '6 tuần — Liên tục', '4:52 phút — Thời lượng TB']).slice(0, 3);
  const pillText = useText('pill', 'Còn 6 video nữa để vượt lên hạng 2').trim();
  const pctNum = parseFloat(pctText.replace(',', '.').replace(/[^0-9.]/g, ''));
  const GOAL = Number.isFinite(pctNum) ? Math.max(0.02, Math.min(1, pctNum / 100)) : GOAL_DEFAULT;

  const N = rowNames.length;
  const ME = Math.floor((N - 1) / 2);

  // ── 几何：landscape 原版常量；portrait 行更高、字更大 ──
  const K = portrait ? 1.55 : 1; // 景 A 字号倍率
  const RS = portrait ? 1.25 : 1; // 圆环倍率
  const AV_R = portrait ? 56 : 36; // 头像半径
  const RING_R = 300 * RS; // 新景圆环半径
  const RING_W = 44 * RS; // 圆环描边宽
  const ROW_H = portrait ? 180 : 108;
  const ROW_PITCH = portrait ? 206 : 124;
  const ROW_X = portrait ? 100 : 384; // 行左缘
  const ROW_W = portrait ? 1720 : 1152;
  const PADL = portrait ? 44 : 36;
  const RANKW = portrait ? 120 : 84;
  // ── 锚点：两景共用的唯一圆心（所有圆——头像、涟漪、光圈、圆环、刻度盘——都引用这一组常量）──
  const CX = ROW_X + PADL + RANKW + AV_R; // landscape = 540
  const CY = portrait ? Math.round(SH * 0.5) : 540;
  const rowTop = (i: number) => CY - ROW_H / 2 + (i - ME) * ROW_PITCH;

  // ── 景 B 排版（portrait：圆环落位后居中于上半；文字在下）──
  const D = portrait ? 20 : 0; // portrait 文字晚入 20f（等圆环滑到位）
  const COLW = portrait ? 1680 : 820;
  const H1 = portrait ? 170 : TYPE.h1;
  let h1 = H1;
  let tLines = [titleText];
  for (let k = 0; k < 40; k++) {
    tLines = wrapLines(titleText, FAM, h1, COLW, 780, 99);
    if (tLines.length <= 2 || h1 <= H1 * 0.55) break;
    h1 -= 4;
  }
  tLines = wrapLines(titleText, FAM, h1, COLW, 780, 2);
  h1 = Math.min(h1, ...tLines.map((l) => fitSize(l, { family: FAM, size: h1, maxWidth: COLW, weight: 780, minSize: H1 * 0.45 })));
  const tLH = h1 * 1.14;
  const BODY = portrait ? 60 : TYPE.body;
  const sLines = subText ? wrapLines(subText, FAM, BODY, COLW, 450, 2) : [];
  const KS = portrait ? 34 : TYPE.label;
  const STAT_V = portrait ? 84 : TYPE.h3;
  const STAT_U = portrait ? 36 : 28;
  const STAT_K = portrait ? 36 : 26;
  const PILL = portrait ? 44 : TYPE.small;
  const statGap = portrait ? 64 : 56;
  const statW = (COLW - statGap * Math.max(0, statItems.length - 1)) / Math.max(1, statItems.length);
  const stats = statItems.map((s) => {
    const [vRaw, kRaw] = s.split(/\s+[—–-]\s+/);
    const vv = (vRaw || '').trim();
    const sp = vv.indexOf(' ');
    const v = sp > 0 ? vv.slice(0, sp) : vv;
    const u = sp > 0 ? vv.slice(sp + 1) : '';
    const k = (kRaw || '').trim();
    const vs = fitSize(v, { family: FAM, size: STAT_V, maxWidth: statW * 0.62, weight: 720, minSize: STAT_V * 0.5 });
    const us = Math.min(STAT_U, fitSize(u, { family: FAM, size: STAT_U, maxWidth: Math.max(40, statW - vs * v.length * 0.62 - 8), weight: 500, minSize: STAT_U * 0.6 }));
    const ks = fitSize(k, { family: FAM, size: STAT_K, maxWidth: statW, weight: 500, minSize: STAT_K * 0.6 });
    return { v, u, k, vs, us, ks };
  });
  const pillS = pillText ? fitSize(pillText, { family: FAM, size: PILL, maxWidth: COLW - PILL * 3.2, weight: 600, minSize: PILL * 0.6 }) : PILL;
  const colH = KS * 1.4 + 22 + tLines.length * tLH + (sLines.length ? 26 + sLines.length * BODY * 1.3 : 0) + (stats.length ? 64 + STAT_V * 1.05 + 28 + STAT_K * 1.3 : 0) + (pillText ? 56 + pillS * 1.3 + 32 : 0);
  // portrait：圆环 + 文字整块竖向居中
  const ringBox = RING_R + 72 * RS; // 刻度盘外沿
  const RY_END = portrait ? Math.round(SH / 2 - (ringBox * 2 + 150 + colH) / 2 + ringBox) : CY;
  const RX_END = portrait ? 960 : CX;
  const colLeft = portrait ? 120 : 1010;
  const colTop = portrait ? RY_END + ringBox + 150 : Math.max(90, Math.round(540 - colH / 2 - 8));

  // ── 景 A ──
  const rowIn = (i: number) => ramp(f, -6 + stagger(i, N, 14, EASE.out), 16, EASE.snappy);
  const focus = ramp(f, 14, 18, EASE.out); // 其余行压暗
  const pulse = (s: number) => ramp(f, s, 5, EASE.snappy) - ramp(f, s + 5, 11, EASE.out);
  const anticip = ramp(f, 40, 7, EASE.swift);
  const avScale = 1 + 0.16 * (pulse(18) + pulse(30)) - 0.1 * anticip;
  const waves = [18, 30].map((s) => {
    const p = ramp(f, s, 22, EASE.out);
    return { r: AV_R + 10 + p * 64 * (AV_R / 36), o: f >= s && f < s + 22 ? 0.85 * (1 - p) : 0, w: mix(4, 1, p) };
  });
  // 相机：以锚点为原点缓推，开圈时旧页被推远（放大 + 压暗）
  const push = ramp(f, 4, 40, EASE.smooth);
  const away = ramp(f, 47, 34, EASE.exit);
  const aScale = 1 + 0.03 * push + 0.19 * away;
  const aDim = 1 - 0.55 * away;

  // ── 接圆：实心头像 → 圆环 ──
  const grow = ramp(f, 47, 28, EASE.snappy);
  const ringR = mix(AV_R * 0.9, RING_R, grow);
  const ringW = mix(AV_R * 0.9 * 2, RING_W, ramp(f, 47, 22, EASE.snappy)); // 描边 = 直径时就是实心盘
  const opened = f >= 47;
  const irisR = ringR + ringW / 2 + 10 + (portrait ? 3600 : 2400) * ramp(f, 54, 30, IRIS_EASE);
  // portrait：光圈吃满屏后（f78）圆环滑到上半中央；之前严格同心
  const slide = portrait ? ramp(f, 78, 20, EASE.smooth) : 0;
  const RX = mix(CX, RX_END, slide);
  const RY = mix(CY, RY_END, slide);
  const discToTrack = ramp(f, 50, 14, EASE.out); // 实心荧光 → 暗轨
  const sweep = GOAL * ramp(f, 60, 58, SWEEP_EASE);
  const circ = 2 * Math.PI * ringR;
  const headA = -Math.PI / 2 + sweep * 2 * Math.PI;
  const hx = RX + Math.cos(headA) * ringR;
  const hy = RY + Math.sin(headA) * ringR;
  const numIn = ramp(f, 58, 16, EASE.out);
  const dialIn = ramp(f, 56, 30, EASE.out);
  const dialRot = (f - 56) * 0.06;
  const breathe = f > 118 ? 0.5 - 0.5 * Math.cos((f - 118) / 9) : 0;
  const rimO = opened ? (1 - ramp(f, 70, 14, EASE.out)) * ramp(f, 49, 4, EASE.out) : 0;

  const brandName = BRAND.name;
  const pctShown = Math.round(sweep * 100);

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden', background: L.bg[2] }}>
      {/* ===== 景 A：周榜（共享舞台只有这一层 Stage；景 B 在光圈里自带暗底） ===== */}
      <div style={{ position: 'absolute', inset: 0, transformOrigin: `${CX}px ${CY}px`, transform: `scale(${aScale.toFixed(4)})`, filter: away > 0 ? `brightness(${aDim.toFixed(3)})` : undefined }}>
        <Stage look={L} keyLight={{ x: 0.5, y: -0.06 }} fill={{ x: 0.92, y: 0.98 }} intensity={0.7} grain={0} breathe={0.4} />
        {/* 页眉 */}
        <div style={{ position: 'absolute', left: ROW_X, top: portrait ? rowTop(0) - 340 : 76, width: ROW_W, display: 'flex', alignItems: 'flex-end', opacity: ramp(f, 0, 14, EASE.out) }}>
          <div style={{ minWidth: 0 }}>
            {/* 品牌眉题：标志 + 视频品牌名 + caps 小标签 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 * K, whiteSpace: 'nowrap' }}>
              {brand ? <ShotcraftMark size={34 * K} tone="dark" /> : null}
              {brandName ? <span style={{ ...type((TYPE.label + 4) * K, 700), letterSpacing: '0.03em', color: L.ink, lineHeight: 1.4 }}>{brandName}</span> : null}
              {boardLabel ? (
                <span style={{ ...type(TYPE.label * K, 700, { caps: true }), letterSpacing: '0.22em', color: L.accent, lineHeight: 1.4 }}>
                  {brandName ? '· ' : ''}{boardLabel}
                </span>
              ) : null}
            </div>
            <div style={{ ...type(fitSize(boardTitle, { family: FAM, size: TYPE.h2 * K, maxWidth: ROW_W * 0.62, weight: 760, minSize: 40 }), 760), color: L.ink, marginTop: 12, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{boardTitle}</div>
          </div>
          <div style={{ marginLeft: 'auto', ...type(fitSize(metric, { family: FAM, size: TYPE.small * K, maxWidth: ROW_W * 0.34, weight: 500, minSize: 20 }), 500), color: L.ink3, paddingBottom: 10, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{metric}</div>
        </div>
        {rowNames.map((name, i) => {
          const me = i === ME;
          const p = rowIn(i);
          const dim = me ? 1 : 1 - 0.68 * focus;
          const val = values[i] ?? VALUES[i] ?? '';
          const det = details[i] ?? '';
          const d = DELTAS[i] ?? '';
          const nameS = fitSize(name, { family: FAM, size: TYPE.body * K, maxWidth: ROW_W - PADL - RANKW - AV_R * 2 - 28 - 380 * K, weight: me ? 720 : 600, minSize: 22 });
          const detS = fitSize(det, { family: FAM, size: 26 * K, maxWidth: ROW_W - PADL - RANKW - AV_R * 2 - 28 - 380 * K, weight: 450, minSize: 16 });
          return (
            <div key={i} style={{
              position: 'absolute', left: ROW_X, top: rowTop(i), width: ROW_W, height: ROW_H, boxSizing: 'border-box',
              borderRadius: 22 * K, display: 'flex', alignItems: 'center', padding: `0 ${40 * K}px 0 ${PADL}px`,
              opacity: p * dim, transform: `translateY(${((1 - p) * 26).toFixed(2)}px)`,
              background: me
                ? `linear-gradient(90deg, ${alpha(L.accent, 0.1 + 0.05 * focus)}, ${alpha(L.surface2, 0.9)} 46%)`
                : `linear-gradient(180deg, ${alpha('#ffffff', 0.035)}, ${alpha('#ffffff', 0.018)})`,
              boxShadow: me
                ? `inset 0 0 0 1px ${alpha(L.accent, 0.18 + 0.2 * focus)}, inset 0 1px 0 ${alpha('#ffffff', 0.08)}, 0 30px 60px -30px #000`
                : `inset 0 0 0 1px ${L.line}, inset 0 1px 0 ${alpha('#ffffff', 0.04)}`,
            }}>
              <div style={{ ...type(TYPE.small * K, 600), fontVariantNumeric: 'tabular-nums', width: RANKW, flex: 'none', color: me ? L.accent : L.ink3 }}>{String(i + 1).padStart(2, '0')}</div>
              {/* 头像槽：「你」的头像单独画在外层（脉冲 / 接圆要精确对心） */}
              <div style={{
                width: AV_R * 2, height: AV_R * 2, borderRadius: '50%', flex: 'none',
                background: me ? 'transparent' : `linear-gradient(150deg, #3a3f33, #22261e)`,
                boxShadow: me ? 'none' : `inset 0 0 0 1px ${alpha('#ffffff', 0.08)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...type(26 * K, 650), color: L.ink2,
              }}>{me ? null : initials(name)}</div>
              <div style={{ marginLeft: 28 * K, minWidth: 0 }}>
                <div style={{ ...type(nameS, me ? 720 : 600), color: L.ink, whiteSpace: 'nowrap', lineHeight: 1.25 }}>{name}</div>
                {det ? <div style={{ ...type(detS, 450), color: L.ink3, marginTop: 4, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{det}</div> : null}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 26 * K, flex: 'none' }}>
                <div style={{ ...type(26 * K, 600), fontVariantNumeric: 'tabular-nums', color: d.startsWith('−') ? L.ink3 : alpha(L.accent, 0.8) }}>{d}</div>
                <div style={{ ...type(fitSize(val, { family: FAM, size: TYPE.h3 * K, maxWidth: 170 * K, weight: 720, minSize: 24 }), 720), color: L.ink, width: 170 * K, textAlign: 'right', whiteSpace: 'nowrap' }}>{val}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 「你」的头像（锚点真圆）+ 涟漪 —— 开圈后由圆环接管 */}
      {!opened && (
        <>
          <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {waves.map((w, i) => w.o > 0 && (
              <circle key={i} cx={CX} cy={CY} r={w.r * aScale} fill="none" stroke={L.accent} strokeWidth={w.w} opacity={w.o} />
            ))}
          </svg>
          <div style={{
            position: 'absolute', left: CX - AV_R, top: CY - AV_R, width: AV_R * 2, height: AV_R * 2, borderRadius: '50%',
            opacity: rowIn(ME), transform: `scale(${(avScale * aScale).toFixed(4)})`,
            background: `radial-gradient(circle at 36% 30%, #e6ff86 0%, ${L.accent} 55%, #9fcc12 100%)`,
            boxShadow: `0 0 ${(18 + 40 * (avScale - 1)).toFixed(1)}px ${alpha(L.accent, 0.35 + 1.2 * Math.max(0, avScale - 1))}, inset 0 -3px 6px rgba(40,60,0,0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', ...type(27 * K, 800), color: L.onAccent,
          }}>{initials(rowNames[ME])}</div>
        </>
      )}

      {/* ===== 景 B：目标圆环，从同一圆心被圆环撑开 ===== */}
      {opened && (
        <>
          {/* 圈外落影：新景压在旧页上 */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(circle at ${CX}px ${CY}px, rgba(0,0,0,0) ${irisR.toFixed(1)}px, rgba(0,0,0,0.45) ${(irisR + 1).toFixed(1)}px, rgba(0,0,0,0) ${(irisR + 90).toFixed(1)}px)`,
          }} />
          <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${irisR.toFixed(1)}px at ${CX}px ${CY}px)` }}>
            {/* B 底：更深的橄榄黑 + 以圆心为光源的荧光余光 + 右上冷白主光 */}
            <div style={{
              position: 'absolute', inset: 0,
              background:
                `radial-gradient(circle at ${RX}px ${RY}px, ${alpha(L.accent, 0.2 + 0.03 * breathe)} 0px, ${alpha(L.accent, 0.06)} ${380 * RS}px, ${alpha(L.accent, 0)} ${760 * RS}px), ` +
                `radial-gradient(ellipse 50% 60% at 78% 14%, ${alpha('#e9f3d4', 0.07)}, rgba(0,0,0,0) 70%), ` +
                `linear-gradient(180deg, #11140d 0%, #0a0c08 55%, #050604 100%)`,
            }} />
            <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <defs>
                <linearGradient id="cmi-arc" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f4ffc4" />
                  <stop offset="55%" stopColor={L.accent} />
                  <stop offset="100%" stopColor="#8fbf0c" />
                </linearGradient>
                <radialGradient id="cmi-head">
                  <stop offset="0%" stopColor="#f6ffd0" stopOpacity={0.9} />
                  <stop offset="40%" stopColor={L.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={L.accent} stopOpacity={0} />
                </radialGradient>
              </defs>
              {/* 同心计时刻度盘（120 格，每 10 格长刻度），极缓旋转 */}
              <g opacity={dialIn} transform={`rotate(${dialRot.toFixed(3)} ${RX} ${RY})`}>
                {Array.from({ length: 120 }, (_, i) => {
                  const a = (i / 120) * Math.PI * 2;
                  const major = i % 10 === 0;
                  const r0 = RING_R + 46 * RS, r1 = r0 + (major ? 26 : 12) * RS;
                  return (
                    <line key={i} x1={RX + Math.cos(a) * r0} y1={RY + Math.sin(a) * r0} x2={RX + Math.cos(a) * r1} y2={RY + Math.sin(a) * r1}
                      stroke={major ? alpha(L.ink, 0.45) : alpha(L.ink, 0.16)} strokeWidth={(major ? 2.5 : 1.5) * RS} />
                  );
                })}
              </g>
              <circle cx={RX} cy={RY} r={RING_R - RING_W / 2 - 22 * RS} fill="none" stroke={alpha(L.ink, 0.06 * dialIn)} strokeWidth={1.5} />
              {/* 暗轨：开圈瞬间还是实心荧光头像，再退成暗轨 */}
              <circle cx={RX} cy={RY} r={ringR} fill="none" strokeWidth={ringW}
                stroke={discToTrack < 1 ? `rgba(${mix(198, 40, discToTrack).toFixed(0)},${mix(244, 48, discToTrack).toFixed(0)},${mix(50, 28, discToTrack).toFixed(0)},1)` : '#283018'} />
              {/* sweep 弧：从 12 点起笔 */}
              {sweep > 0.002 && (
                <circle cx={RX} cy={RY} r={ringR} fill="none" stroke="url(#cmi-arc)" strokeWidth={ringW} strokeLinecap="round"
                  strokeDasharray={`${(sweep * circ).toFixed(2)} ${circ.toFixed(2)}`} transform={`rotate(-90 ${RX} ${RY})`}
                  style={{ filter: `drop-shadow(0 0 ${(14 + 8 * breathe).toFixed(1)}px ${alpha(L.accent, 0.45)})` }} />
              )}
              {sweep > 0.01 && <circle cx={hx} cy={hy} r={RING_W * 1.25} fill="url(#cmi-head)" />}
            </svg>
            {/* 中央数字：随 sweep 计数 */}
            <div style={{
              position: 'absolute', left: RX - 240 * RS, top: RY - 130 * RS, width: 480 * RS, height: 260 * RS, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', opacity: numIn, transform: `scale(${mix(0.86, 1, ramp(f, 58, 22, EASE.snappy)).toFixed(4)})`,
            }}>
              <div style={{ ...type(200 * RS, 760), color: L.ink, display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
                {pctShown}
                <span style={{ ...type(TYPE.h3 * RS, 650), color: L.accent, marginLeft: -2 }}>%</span>
              </div>
              {goalLabel ? (
                <div style={{ ...type(fitSize(goalLabel, { family: FAM, size: TYPE.small * RS, maxWidth: (RING_R - RING_W) * 1.6, weight: 500, minSize: 18 }), 500), color: L.ink2, marginTop: 8, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{goalLabel}</div>
              ) : null}
            </div>
            {/* 右侧（portrait：下方）：标题 + 数据 */}
            <div style={{ position: 'absolute', left: colLeft, top: colTop, width: COLW }}>
              {kickerText ? (
                <div style={{ ...type(KS, 700, { caps: true }), letterSpacing: '0.22em', color: L.accent, opacity: ramp(f, 72 + D, 14, EASE.out), lineHeight: 1.4, whiteSpace: 'nowrap' }}>
                  {kickerText}
                </div>
              ) : null}
              <div style={{ ...type(h1, 780), color: L.ink, marginTop: 22, lineHeight: 1.14 }}>
                <WordRise lines={tLines} start={76 + D} each={20} gap={Math.min(5, 24 / Math.max(1, titleText.split(' ').length - 1))} lh={tLH} />
              </div>
              {sLines.length ? (
                <div style={{ ...type(BODY, 450), color: L.ink2, marginTop: 26, lineHeight: 1.3, opacity: ramp(f, 86 + D, 18, EASE.out), transform: `translateY(${((1 - ramp(f, 86 + D, 18, EASE.snappy)) * 14).toFixed(2)}px)` }}>
                  {sLines.map((l, i) => <div key={i} style={{ whiteSpace: 'pre' }}>{l}</div>)}
                </div>
              ) : null}
              {stats.length ? (
                <div style={{ display: 'flex', gap: statGap, marginTop: 64 }}>
                  {stats.map((s, i) => {
                    const p = ramp(f, 92 + D + stagger(i, stats.length, 10, EASE.out), 18, EASE.snappy);
                    return (
                      <div key={i} style={{ width: statW, opacity: p, transform: `translateY(${((1 - p) * 22).toFixed(2)}px)` }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', height: STAT_V * 1.05 }}>
                          <span style={{ ...type(s.vs, 720), color: L.ink }}>{s.v}</span>
                          {s.u ? <span style={{ ...type(s.us, 500), color: L.ink3 }}>{s.u}</span> : null}
                        </div>
                        <div style={{ height: 1, background: L.line, margin: '14px 0 12px', width: '100%' }} />
                        <div style={{ ...type(s.ks, 500), color: L.ink2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{s.k}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {/* 叙事收口：回扣景 A 的排名 */}
              {pillText ? (
                <div style={{
                  marginTop: 56, display: 'inline-flex', alignItems: 'center', gap: 16, padding: `${pillS * 0.5}px ${pillS * 0.8}px`, borderRadius: 999,
                  background: alpha(L.accent, 0.1), boxShadow: `inset 0 0 0 1px ${alpha(L.accent, 0.28)}`,
                  opacity: ramp(f, 108 + D, 16, EASE.out), transform: `translateY(${((1 - ramp(f, 108 + D, 16, EASE.snappy)) * 16).toFixed(2)}px)`,
                }}>
                  <svg width={pillS * 0.7} height={pillS * 0.7} viewBox="0 0 22 22"><path d="M11 3 19 15H3z" fill={L.accent} /></svg>
                  <span style={{ ...type(pillS, 600), color: L.ink, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{pillText}</span>
                </div>
              ) : null}
            </div>
          </div>
          {/* 光圈边缘受光环（只在开圈初段） */}
          {rimO > 0.01 && (
            <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <circle cx={CX} cy={CY} r={irisR} fill="none" stroke={L.accent} strokeWidth={2} opacity={0.7 * rimO}
                style={{ filter: `drop-shadow(0 0 10px ${alpha(L.accent, 0.6)})` }} />
            </svg>
          )}
        </>
      )}
      <Grain opacity={0.08} blend="soft-light" />
    </div>
  );
};
