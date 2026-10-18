// sakuga-timing-shift —— 一拍三转一拍一（作画打拍切换）
//
// 第二轮重设计（动画师的作画纸 · 赛璐珞卡）：
// - look = paper（暖白纸 · 墨 · 朱红）。整个画面是一张动画作画纸：顶部定位孔（peg holes）、淡蓝铅笔的
//   安全框/十字（field guide）当纹理；底部是一行真正的「摄影表」（タイムシート）——一拍三时只有每 3 格写
//   原画号 ①④⑦…、中间格画竖线（摄影表里竖线 = 沿用上一张），一拍一时格格都有号。观众直接"看见"每秒画了几张。
// - 主体是一张赛璐珞风格的产品卡：5px 墨线描边、平涂纸色、无模糊的硬边赛璐珞投影，
//   卡里是 150px 的大数字 + 一行说明——运动本身就是"逐帧作画"的冲刺，与一拍一的 30 张/秒呼应。
// - 手法：0–48f 驱动帧 q = floor(f/3)·3，16 张原画手翻书式横移（每步 65px），每张姿势不同（摆角 ±5°、
//   挤压/拉伸交替、一高一低的小跳）；48f 一拍一 + 两帧「冲击帧」（画面反相成墨底、集中线炸开 = 日式作画的高潮标记），
//   50–68f 逐帧丝滑冲刺折返中央（out-poly(4)），身后挂按速度生成的横向速度线，过冲 40px 后回弹落位。
//
// 时间表（30fps，共 150f）：
//   0–48    一拍三：16 张原画，角标「ON 3s / 3コマ打ち」，摄影表每 3 格一个号
//   48–49   冲击帧（全片唯一的全画面冲击）；角标切「ON 1s / 1コマ打ち」并 pop 1.25×
//   50–68   冲刺：out-poly(4) 高初速，scaleX 按速度拉到 ≈1.3、速度线随速度伸缩
//   68–74   过冲回弹落位；74–80 落地挤压 0.9/1.08 → 1
//   80–150  hold：镜头 2% 极缓推进（ease-out），角标线沸腾在 108f 冻结
//
// [Agent Edit] o chu: before / before_sub (goc tren trai khi chuyen dong "giat tung buoc" — nhip 3) va after / after_sub
// (doi ngay khung cat 48 — nhip 1, "but toc"): day la nhan danh dau diem doi nhip ma the goc bat buoc phai co.
// The celluloid: card_kicker (dong tren, khi co thuong hieu thi hien logo + ten) / number (so / chu lon) / card_sub.
// Chu Nhat (3コマ打ち) va chu tieng Anh tren giay dong hoat da doi sang tieng Viet trung tinh.
// Khung doc (portrait.mode = 'native'): the phong 1.5x, quang duong ngang 940px (15 buoc ~63px >= 30px — menh de cua the),
// nhan tren, bang nhip hinh duoi, ca khoi giua khung; giay ve + khung chi chi phu het chieu cao.
import { useCurrentFrame, useVideoConfig, useText, useBrand, useShotFonts, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { EASE, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const SAKUGA_TIMING_SHIFT_DURATION = 150; // 一拍三 48f + 冲刺落位 32f + hold 70f

const L = LOOKS.paper;
const PENCIL = '#4f78b8'; // 淡蓝铅笔（动画纸上的构图线颜色）

const W = 1920;
const CARD_W = 600;
const CARD_H = 360;
const OVERSHOOT = 40;

const SWITCH = 48;
const ARRIVE = 68;
const SETTLE = 74;
const BOIL_FREEZE = 108;

const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};

// 摄影表
const STRIP_N = 30;
const CELL = 44;
const CELL_GAP = 6;
const STRIP_W = STRIP_N * CELL + (STRIP_N - 1) * CELL_GAP; // 1494

// 赛璐珞卡（600×360 he toa do goc; khung doc phong bang transform ben ngoai）
const CelCard: React.FC<{ kicker: string; number: string; sub: string }> = ({ kicker, number, sub }) => {
  const fonts = useShotFonts();
  const brand = useBrand();
  const top = [brand?.name, kicker].filter(Boolean).join(' · ');
  const iw = CARD_W - 80;
  const topSz = fitSize(top, { family: fonts.sans, size: 30, maxWidth: iw - (brand ? 52 : 0), weight: 800, minSize: 18 });
  const nSz = fitSize(number, { family: fonts.sans, size: 160, maxWidth: iw, weight: 900, minSize: 70, letterSpacingEm: -0.05 });
  const sSz = fitSize(sub, { family: fonts.sans, size: 38, maxWidth: iw, weight: 600, minSize: 22 });
  return (
    <div style={{
      width: CARD_W, height: CARD_H, borderRadius: 30, background: L.surface, border: `5px solid ${L.ink}`,
      boxSizing: 'border-box', padding: '30px 40px', position: 'relative', overflow: 'hidden', fontFamily: fonts.sans,
    }}>
      {/* 赛璐珞的"影色"：右下一块硬边暗面 */}
      <div style={{ position: 'absolute', right: -60, bottom: -80, width: 360, height: 220, borderRadius: '50%', background: alpha(L.ink, 0.045) }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 40 }}>
        {brand ? <ShotcraftMark size={38} tone="light" frameColor={L.ink} /> : null}
        <div style={{ fontSize: topSz, fontWeight: 800, color: L.ink, letterSpacing: '0.01em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{top}</div>
      </div>
      <div style={{ position: 'absolute', left: 36, top: 92, height: 170, display: 'flex', alignItems: 'center', fontSize: nSz, fontWeight: 900, color: L.ink, letterSpacing: '-0.05em', lineHeight: 1, whiteSpace: 'nowrap' }}>
        {number}
      </div>
      <div style={{ position: 'absolute', left: 40, top: 276, fontSize: sSz, fontWeight: 600, color: L.ink2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{sub}</div>
    </div>
  );
};

export const SakugaTimingShift: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const before = useText('before', 'TỪNG BƯỚC');
  const beforeSub = useText('before_sub', 'Chậm mà chắc, mỗi ngày một chút');
  const after = useText('after', 'BỨT TỐC!');
  const afterSub = useText('after_sub', 'Rồi tăng tốc gấp ba lần');
  const cardKicker = useText('card_kicker', 'DOANH THU');
  const number = useText('number', '+300%');
  const cardSub = useText('card_sub', 'chỉ sau ba tháng');
  const onThrees = f < SWITCH;
  const impact = f >= SWITCH && f <= SWITCH + 1;

  // ── bo cuc ──
  const S = portrait ? 1.5 : 1; // he so the
  const cw = CARD_W * S, chh = CARD_H * S;
  const X_LEFT = portrait ? 40 : 140;
  const X_RIGHT = portrait ? W - 40 - cw : 1180;
  const X_CENTER = (W - cw) / 2;
  const labSz0 = portrait ? 170 : 100;
  const subSz0 = portrait ? 54 : 36;
  const labW = portrait ? 1700 : 1150;
  const labSz = Math.min(fitSize(before, { family: fonts.sans, size: labSz0, maxWidth: labW, weight: 900, italic: true, minSize: labSz0 * 0.45, letterSpacingEm: -0.04 }),
    fitSize(after, { family: fonts.sans, size: labSz0, maxWidth: labW, weight: 900, italic: true, minSize: labSz0 * 0.45, letterSpacingEm: -0.04 }));
  const subTxt = onThrees ? beforeSub : afterSub;
  const subSz = Math.min(fitSize(beforeSub, { family: fonts.sans, size: subSz0, maxWidth: labW, weight: 500, minSize: subSz0 * 0.6 }), fitSize(afterSub, { family: fonts.sans, size: subSz0, maxWidth: labW, weight: 500, minSize: subSz0 * 0.6 }));
  const SK = portrait ? 1.14 : 1; // bang nhip hinh
  let LAB_Y: number, CARD_Y: number, STRIP_Y: number;
  if (portrait) {
    const labH = labSz * 1.25 + 34 + subSz * 1.4;
    const total = labH + 220 + chh + 240 + (76 + 70) * SK;
    const y0 = Math.round(SH / 2 - total / 2);
    LAB_Y = y0; CARD_Y = y0 + labH + 220; STRIP_Y = CARD_Y + chh + 240;
  } else {
    LAB_Y = 92; CARD_Y = 330; STRIP_Y = 826; // nhan + cau phu phai ket thuc truoc dinh the (330 - nhun 18)
  }
  const STRIP_X = (W - STRIP_W * SK) / 2;

  // 段一：一拍三——位置线性（机械等距步进是"手翻书"语义），只在 q 上取值
  const pos1 = (t: number) => interpolate(t, [0, SWITCH - 3], [X_LEFT, X_RIGHT], C);
  // 段二：一拍一——out-poly(4) 冲刺到过冲点 → 回弹
  const pos2 = (t: number) =>
    t < ARRIVE
      ? interpolate(t, [SWITCH, ARRIVE], [X_RIGHT, X_CENTER - OVERSHOOT * S], { ...C, easing: Easing.out(Easing.poly(4)) })
      : interpolate(t, [ARRIVE, SETTLE], [X_CENTER - OVERSHOOT * S, X_CENTER], { ...C, easing: Easing.inOut(Easing.cubic) });

  // ---- 卡片 ----
  const q = Math.floor(f / 3) * 3;
  const drawing = q / 3; // 第几张原画
  const x = onThrees ? pos1(q) : pos2(f);
  // 一拍三姿势（随 q 冻结）：摆角 + 挤压/拉伸交替 + 一高一低
  const rot = onThrees
    ? Math.sin(q * 0.7) * 5
    : interpolate(f, [SWITCH, SWITCH + 8], [-4, 0], { ...C, easing: Easing.out(Easing.cubic) });
  const hop = (onThrees ? (drawing % 2 === 0 ? -18 : -2) : 0) * S;
  const poseSX = onThrees ? (drawing % 2 === 0 ? 0.97 : 1.035) : 1;
  const poseSY = onThrees ? (drawing % 2 === 0 ? 1.035 : 0.97) : 1;

  // 冲刺速度 → 运动拉伸 + 速度线
  const v = onThrees ? 0 : Math.abs(pos2(f) - pos2(f - 1)) / S;
  const sFac = Math.min(v / 60, 1);
  const stretchX = 1 + 0.3 * sFac;
  const stretchY = 1 - 0.1 * sFac;
  // 落地挤压
  const sqX = interpolate(f, [SETTLE - 2, SETTLE + 1, SETTLE + 6], [1, 0.92, 1], { ...C, easing: Easing.out(Easing.cubic) });
  const sqY = interpolate(f, [SETTLE - 2, SETTLE + 1, SETTLE + 6], [1, 1.07, 1], { ...C, easing: Easing.out(Easing.cubic) });
  // 硬边投影：一拍三随跳高变化，冲刺时拉远
  const shOff = (onThrees ? (hop < -5 * S ? 18 : 10) : 10 + 10 * sFac) * S;

  // ---- 角标沸腾（每 4 帧换一张，108f 冻结） ----
  const qb = Math.min(Math.floor(f / 4) * 4, BOIL_FREEZE);
  const bx = (h(qb + 1) - 0.5) * 5;
  const by = (h(qb + 2) - 0.5) * 5;
  const brot = (h(qb + 3) - 0.5) * 2;
  const ul = [0, 1, 2, 3].map((i) => (h(qb * 3 + i * 7 + 11) - 0.5) * 8);
  const pop = interpolate(f, [SWITCH, SWITCH + 3, SWITCH + 10], [1, 1.25, 1], { ...C, easing: Easing.out(Easing.cubic) });

  // 入场：角标 / 摄影表上浮（0 帧就有纸与卡，不空白）
  const labelIn = ramp(f, 0, 14, EASE.out);
  const stripIn = ramp(f, 4, 16, EASE.out);
  // hold 段极缓推进
  const cam = mix(1, 1.02, ramp(f, SETTLE, 150 - SETTLE, EASE.out));

  // 摄影表播放头：一秒一循环；hold 段 110f 停在当前格
  const head = Math.min(f, 110) % STRIP_N;

  // 速度线（冲刺段）：卡片身后（右侧）9 条横向锥形墨线，长度 ∝ 速度，y 位置逐帧伪随机
  const speedLines = !onThrees && !impact && sFac > 0.08
    ? Array.from({ length: 9 }, (_, i) => {
        const yy = CARD_Y + 20 * S + h(i * 7.3 + f * 0.37) * (chh - 40 * S);
        const len = (160 + h(i * 3.1 + f) * 260) * sFac * S;
        const x0 = x + cw * stretchX * 0.8 + h(i * 5.7 + f * 1.3) * 80 * S;
        const th = (3 + h(i * 2.9) * 6) * S;
        return { yy, len, x0, th };
      })
    : [];

  // 冲击帧：集中线（以卡片中心为焦点的放射楔形）
  const cx = x + cw / 2;
  const cy = CARD_Y + chh / 2;
  const focusLines = impact
    ? Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2 + h(i + f) * 0.05;
        const r0 = (300 + h(i * 1.7 + f) * 220) * S;
        const r1 = Math.max(1500, SH);
        const wd = 0.012 + h(i * 4.1) * 0.02;
        const p = (r: number, aa: number) => `${(cx + Math.cos(aa) * r).toFixed(1)},${(cy + Math.sin(aa) * r).toFixed(1)}`;
        return `M${p(r0, a)} L${p(r1, a - wd)} L${p(r1, a + wd)} Z`;
      }).join(' ')
    : '';

  const inkBg = impact; // 冲击帧：画面反相成墨底
  const lineColor = inkBg ? L.bg[0] : L.ink;
  const tex: React.CSSProperties = { fontFamily: fonts.mono, fontSize: 26 * (portrait ? 1.3 : 1), fontWeight: 600, letterSpacing: '0.12em', lineHeight: 1.3 };
  const fgH = portrait ? SH - 220 : 860;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', fontFamily: fonts.sans, background: L.bg[1] }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.toFixed(5)})`, transformOrigin: '50% 46%' }}>
        <Stage look={L} keyLight={{ x: 0.45, y: 0.2 }} fill={null} grain={0.06} />
        {/* 动画纸：定位孔 */}
        {[-1, 0, 1].map((k) => (
          <div key={k} style={{
            position: 'absolute', top: 34, left: 960 + k * 330 - (k === 0 ? 50 : 17), width: k === 0 ? 100 : 34, height: 34, borderRadius: 17,
            background: alpha(L.shadow, 0.13), boxShadow: `inset 0 3px 5px ${alpha(L.shadow, 0.22)}`,
          }} />
        ))}
        {/* 淡蓝铅笔 field guide：安全框 + 十字 + 刻度（phu het chieu cao that） */}
        <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
          <g stroke={alpha(PENCIL, 0.22)} strokeWidth={1.5} fill="none">
            <rect x={110} y={110} width={1700} height={fgH} rx={4} />
            <rect x={260} y={110 + fgH * 0.093} width={1400} height={fgH * 0.814} strokeDasharray="10 8" />
            <line x1={940} x2={980} y1={110 + fgH / 2} y2={110 + fgH / 2} />
            <line x1={960} x2={960} y1={90 + fgH / 2} y2={130 + fgH / 2} />
            {Array.from({ length: 17 }, (_, i) => <line key={i} x1={110 + i * 106.25} x2={110 + i * 106.25} y1={110} y2={124} />)}
          </g>
          <text x={1800} y={100} textAnchor="end" fill={alpha(PENCIL, 0.45)} fontSize={22} fontFamily={fonts.sans}>KHUNG 12</text>
        </svg>

        {/* 冲击帧：墨底 + 集中线 */}
        {inkBg && (
          <AbsoluteFill style={{ background: L.ink }}>
            <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
              <path d={focusLines} fill={L.bg[0]} opacity={0.9} />
            </svg>
          </AbsoluteFill>
        )}

        {/* 中央落位槽：铅笔虚线框（原画师标的"落点"） */}
        {!inkBg && (
          <div style={{
            position: 'absolute', left: X_CENTER - 10 * S, top: CARD_Y - 10 * S, width: cw + 20 * S, height: chh + 20 * S, borderRadius: 36 * S,
            border: `${2 * S}px dashed ${alpha(PENCIL, 0.4)}`, boxSizing: 'border-box',
          }} />
        )}

        {/* 速度线 */}
        {speedLines.length > 0 && (
          <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
            {speedLines.map((sl, i) => (
              <path key={i} d={`M${sl.x0} ${sl.yy - sl.th / 2} L${sl.x0 + sl.len} ${sl.yy} L${sl.x0} ${sl.yy + sl.th / 2} Z`} fill={L.ink} opacity={0.85} />
            ))}
          </svg>
        )}

        {/* 主卡：硬边赛璐珞投影 + 本体 */}
        <div style={{
          position: 'absolute', left: 0, top: CARD_Y, width: cw, height: chh,
          transform: `translate(${x}px, ${hop}px) rotate(${rot}deg) scaleX(${stretchX * sqX * poseSX}) scaleY(${stretchY * sqY * poseSY})`,
          transformOrigin: '50% 100%',
        }}>
          <div style={{
            position: 'absolute', left: shOff, top: shOff + (onThrees ? -hop * 0.6 : 0), width: cw, height: chh, borderRadius: 30 * S,
            background: inkBg ? L.accent : L.ink, opacity: inkBg ? 1 : 0.92,
          }} />
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${S})`, transformOrigin: '0 0' }}>
            <CelCard kicker={cardKicker} number={number} sub={cardSub} />
          </div>
        </div>

        {/* 角标：nhip 3 / nhip 1（手绘沸腾） */}
        <div style={{ position: 'absolute', left: portrait ? 110 : 150, top: LAB_Y, opacity: labelIn, transform: `translateY(${mix(16, 0, labelIn)}px)` }}>
          <div style={{ transform: `translate(${bx}px, ${by}px) rotate(${brot}deg) scale(${pop})`, transformOrigin: '0% 60%', display: 'inline-block' }}>
            <div style={{ fontFamily: fonts.sans, fontSize: labSz, fontWeight: 900, fontStyle: 'italic', color: onThrees ? lineColor : L.accent, letterSpacing: '-0.04em', lineHeight: portrait ? 1.25 : 1.12, whiteSpace: 'nowrap' }}>
              {onThrees ? before : after}
            </div>
            <svg width={300 * (portrait ? 1.5 : 1)} height={24 * (portrait ? 1.5 : 1)} viewBox="0 0 300 24" style={{ display: 'block', marginTop: 2, overflow: 'visible' }}>
              <path d={`M 4 ${12 + ul[0]} Q 90 ${8 + ul[1]} 170 ${13 + ul[2]} T 296 ${10 + ul[3]}`} fill="none"
                stroke={onThrees ? lineColor : L.accent} strokeWidth={8} strokeLinecap="round" />
            </svg>
          </div>
          {subTxt ? (
            <div style={{ fontFamily: fonts.sans, fontSize: subSz, fontWeight: 500, lineHeight: 1.4, color: inkBg ? L.bg[2] : L.ink2, marginTop: 10, whiteSpace: 'nowrap' }}>
              {subTxt}
            </div>
          ) : null}
        </div>

        {/* 右上：摄影表抬头（纹理字） */}
        <div style={{ position: 'absolute', right: portrait ? 110 : 150, top: portrait ? 150 : 146, textAlign: 'right', opacity: labelIn }}>
          <div style={{ ...tex, color: inkBg ? L.bg[2] : L.ink3 }}>CẢNH 012 · CẮT 04</div>
          <div style={{ ...tex, color: inkBg ? L.bg[2] : L.ink3, marginTop: 8 }}>
            {onThrees ? `A${String(drawing + 1).padStart(2, '0')} · 16 hình` : `B${String(Math.min(f - SWITCH, SETTLE - SWITCH) + 1).padStart(2, '0')} · ${SETTLE - SWITCH + 1} hình`}
          </div>
        </div>

        {/* 摄影表：30 格 = 1 秒。一拍三：每 3 格一个原画号，中间格画竖线（= 沿用）；一拍一：格格有号 */}
        {!inkBg && (
          <div style={{ position: 'absolute', left: STRIP_X, top: STRIP_Y, opacity: stripIn, transform: `translateY(${mix(14, 0, stripIn)}px) scale(${SK})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: -6, top: -6, width: STRIP_W + 12, height: 76, borderRadius: 8, border: `1.5px solid ${alpha(L.ink, 0.25)}` }} />
            {Array.from({ length: STRIP_N }).map((_, i) => {
              const key = onThrees ? i % 3 === 0 : true;
              const isHead = i === head;
              const num = onThrees ? i / 3 + 1 : i + 1;
              return (
                <div key={i} style={{
                  position: 'absolute', left: i * (CELL + CELL_GAP), top: 0, width: CELL, height: 64, borderRadius: 4,
                  background: isHead ? alpha(L.accent, 0.14) : 'transparent',
                  boxShadow: isHead ? `inset 0 0 0 2.5px ${L.accent}` : `inset 0 0 0 1px ${alpha(L.ink, 0.1)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {key ? (
                    <div style={{
                      width: 34, height: 34, borderRadius: 17, border: `2.5px solid ${onThrees ? L.ink : L.accent}`, boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: fonts.mono, fontSize: 17, fontWeight: 700, color: onThrees ? L.ink : L.accent,
                    }}>{num}</div>
                  ) : (
                    <div style={{ width: 3, height: 44, borderRadius: 2, background: alpha(L.ink, 0.45) }} />
                  )}
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: 0, top: 92, width: STRIP_W, display: 'flex', justifyContent: 'space-between', fontFamily: fonts.sans, fontSize: 32, fontWeight: 500, lineHeight: 1.3, color: L.ink3 }}>
              <span>Bảng nhịp hình</span>
              <span style={{ fontSize: 28 }}>1 giây · 30 khung</span>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
