// draw-svg-trace —— 描边生长圈注（第二轮重设计 · 纸墨编辑风）
// 手法不变：一条带笔头的墨线沿元素轮廓跑一圈把它"画"出来 → 闭合瞬间加深加粗（白底上不用发光）→
// 描边交棒给元素自身边框、内容上墨 → 同一套路短版给重点词画一笔下划线。
//
// 设计决定
// - look = paper（暖白纸 · 墨 · 朱红）。主体放大到 1120×660（画宽 58%），内容是一张出版级 video-shotcraft 渲染报告卡：
//   眉题 mono、两段式大标题「Cuts on the beat / 100%」（100% 用 188px 黑体，是全镜头的重点词）、32px 说明、
//   右侧 12 根逐镜头能量柱（末三根朱红）、署名行（video-shotcraft 标志 + 字标）。
// - 开场就有东西：绘图纸点阵底 + 四角先长出裁切标记（印刷对位线）——观众先知道"这里要画一个东西"，笔再沿轮廓跑一圈。
// - 笔头：主线 6px 墨 + 三段渐细短 dash + 实心笔尖（按圆角矩形弧长精确定位，带落影）；
//   描边速度 in-out（起笔、收笔有呼吸），笔尖在四个圆角处自然减速（弧长参数化本身不减速，靠 in-out 整体曲线）。
// - 闭合：2f 冲纯黑 + 6→11px 加粗，6f 回落；裁切标记同时向外"弹"一下后退场。
// - 上墨：内容自上而下 3f 错峰由虚到实 + 上浮；柱子从基线长出（错峰 1.5f，末三根最后、朱红）；卡片从贴地升起（阴影长出来）。
// - 第二用法：100% 下一笔手绘朱红马克笔下划线（略带弧度的路径，18f out-cubic，笔头跟随），画完常驻。
//
// 时间表（30fps，共 132f）
//   0–12    裁切标记从四角长出（snappy，错峰 2f）
//   10–50   轮廓描边 40f（in-out cubic），笔头可见
//   50–58   闭合闪：50–52 冲黑加粗、52–58 回落；裁切标记外弹淡出
//   50–74   上墨：卡底 + 内容逐块（3f 错峰）、柱图长出、卡片升起
//   56–66   描边淡出 → 卡片自身发丝边淡入
//   74–92   100% 下划线 18f
//   92–132  hold 40f：0.9% 极缓推近
//
// [Agent Edit] o chu: kicker (dong mono dau the), tag (nhan nho goc phai), lead (cau dan), key (TU / SO trong tam — to
// nhat, co gach chan mau but da), body (cau giai thich, nhieu dong), chart_label + bars (cot nang luong tuy chon:
// so lieu tuong doi, 3 cot cuoi to mau nhan), note (dong ky ten cuoi the, canh thuong hieu). O anh `image` (tuy chon):
// anh thay cho bieu do cot (cover, bo goc). Khung doc (native): the doc 1720 rong, noi dung xep doc (tieu de to hon),
// chieu cao the theo noi dung that, dat giua khung — duong ve van chay het vien the (rx = bo goc the).
import { useCurrentFrame, useVideoConfig, useText, useList, useImage, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate, Easing } from 'remotion';
import { EASE, FONT, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const DRAW_SVG_TRACE_DURATION = 132;

const L = LOOKS.paper;
const PEN = 0.04; // 笔头 dash 长度（占整圈比例）
const INK = L.ink;
const TRACE0 = 10, TRACE1 = 50;

// 圆角矩形轮廓上弧长比例 u∈[0,1] 的点（与 SVG <rect> 的路径起点/方向一致：从上边 (x+rx, y) 顺时针）
const rrPoint = (u: number, x: number, y: number, w: number, h: number, r: number): [number, number] => {
  const sx = w - 2 * r, sy = h - 2 * r, arc = (Math.PI * r) / 2;
  const Ltot = 2 * sx + 2 * sy + 4 * arc;
  let s = (((u % 1) + 1) % 1) * Ltot;
  const segs: Array<[number, (k: number) => [number, number]]> = [
    [sx, (k) => [x + r + k * sx, y]],
    [arc, (k) => [x + w - r + r * Math.sin((k * Math.PI) / 2), y + r - r * Math.cos((k * Math.PI) / 2)]],
    [sy, (k) => [x + w, y + r + k * sy]],
    [arc, (k) => [x + w - r + r * Math.cos((k * Math.PI) / 2), y + h - r + r * Math.sin((k * Math.PI) / 2)]],
    [sx, (k) => [x + w - r - k * sx, y + h]],
    [arc, (k) => [x + r - r * Math.sin((k * Math.PI) / 2), y + h - r + r * Math.cos((k * Math.PI) / 2)]],
    [sy, (k) => [x, y + h - r - k * sy]],
    [arc, (k) => [x + r - r * Math.cos((k * Math.PI) / 2), y + r - r * Math.sin((k * Math.PI) / 2)]],
  ];
  for (const [len, f] of segs) {
    if (s <= len) return f(len > 0 ? s / len : 0);
    s -= len;
  }
  return [x + r, y];
};

const BARS = [34, 40, 37, 48, 45, 54, 58, 56, 66, 74, 81, 96];
const LETTERS = 'ABCDEFGHIJKL';

// 下划线：略带弧度的手绘笔画（本地坐标，宽 300）
const UL_PATH = 'M4,14 C70,6 150,18 230,9 S290,10 300,8';

export const DrawSvgTrace: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;

  const kicker = useText('kicker', 'BÁO CÁO · THÁNG 10');
  const tag = useText('tag', 'bản 3 · 1080p');
  const lead = useText('lead', 'Cắt đúng nhịp nhạc');
  const key = useText('key', '100%');
  const bodyT = useText('body', 'Mọi cú cắt đều rơi đúng phách mạnh của bài nhạc.');
  const chartLabel = useText('chart_label', 'NĂNG LƯỢNG · TỪNG CẢNH');
  const barsIn = useList('bars', []);
  const note = useText('note', 'cập nhật 2 phút trước');
  const image = useImage('image');
  const barsN = barsIn.map((b) => parseFloat(String(b).replace(/[^\d.,-]/g, '').replace(',', '.'))).filter((v) => isFinite(v) && v >= 0);
  const bars = barsN.length >= 3 ? barsN.slice(0, 12) : BARS;
  const bmax = Math.max(...bars, 1e-9);
  const barPct = bars.map((v) => (v / bmax) * 96);
  const hot0 = bars.length - Math.min(3, Math.max(1, Math.round(bars.length / 4)));

  // ── 版式 ──
  const CW = portrait ? 1720 : 1120;
  const PAD = portrait ? 92 : 64;
  const RX = portrait ? 44 : 28; // 与卡片圆角一致（交棒不错型）
  const IW = CW - PAD * 2;
  const kSz0 = portrait ? 42 : 26;
  const tagW = tag ? measureText(tag, fonts.sans, kSz0, 500) + 30 : 0;
  const kickSz = fitSize(kicker, { family: fonts.sans, size: kSz0, maxWidth: IW - tagW - 40, weight: 600, minSize: 16, letterSpacingEm: 0.14 });
  const colW = portrait ? IW : 560;
  const leadSz0 = portrait ? 104 : 72;
  // 引句：先单行缩字（≥0.6 倍）；还放不下再折 2 行
  const leadOne = fitSize(lead, { family: fonts.sans, size: leadSz0, maxWidth: colW, weight: 650, minSize: leadSz0 * 0.6 });
  const leadLines = measureText(lead, fonts.sans, leadOne, 650) <= colW ? [lead] : wrapLines(lead, fonts.sans, leadSz0 * 0.6, colW, 650, 2);
  const leadSz = leadLines.length === 1 ? leadOne : Math.min(...leadLines.map((l) => fitSize(l, { family: fonts.sans, size: leadSz0 * 0.6, maxWidth: colW, weight: 650, minSize: leadSz0 * 0.4 })));
  const keySz0 = portrait ? 330 : 188;
  const keyFit = fitSize(key, { family: fonts.sans, size: keySz0, maxWidth: colW, weight: 820, minSize: keySz0 * 0.32, letterSpacingEm: -0.055 });
  const footSz = portrait ? 44 : 28;
  // 正文：纵向 ≤4 行（56px 起，必要时缩到 0.7 倍）；横向 ≤3 行（32px 起，最小 24px）
  const bodySz0 = portrait ? 56 : 32;
  const maxBody = portrait ? 4 : 3;
  let bodySz = bodySz0;
  while (wrapLines(bodyT, fonts.sans, bodySz, colW, 450, 99).length > maxBody && bodySz > bodySz0 * (portrait ? 0.7 : 0.75)) bodySz -= 2;
  const bodyLines = bodyT ? wrapLines(bodyT, fonts.sans, bodySz, colW, 450, maxBody) : [];
  if (bodyLines.length) bodySz = Math.min(bodySz, ...bodyLines.map((l) => fitSize(l, { family: fonts.sans, size: bodySz, maxWidth: colW, weight: 450, minSize: 14 })));
  // 横向卡高固定 660：重点词字号吃剩余高度（署名行之上）
  const footLineY = 660 - 44 - footSz * 1.3 - 26;
  const keyRoom = footLineY - 18 - 128 - leadLines.length * leadSz * 1.18 - 2 - (bodyLines.length ? 44 + bodyLines.length * bodySz * 1.38 : 0);
  const keySz = portrait ? keyFit : Math.max(60, Math.min(keyFit, keyRoom / 0.98));
  const keyW = Math.min(colW, measureText(key, fonts.sans, keySz, 820) - key.length * keySz * 0.055);

  // 纵向坐标（卡片内部）
  const yKick = portrait ? 70 : 52;
  const yLead = portrait ? 200 : 128;
  const leadH = leadLines.length * leadSz * 1.18;
  const yKey = yLead + leadH + (portrait ? 10 : 2);
  const keyH = keySz * 0.98;
  const yBody = yKey + keyH + (portrait ? 90 : 44);
  const bodyH = bodyLines.length * bodySz * 1.38;
  const footH = portrait ? 150 : 110;
  // 图表 / 图片：横向在右栏，纵向在正文下方
  const chartX = portrait ? 0 : 616;
  const chartW = portrait ? IW : 376;
  const chartLabelY = portrait ? yBody + bodyH + 80 : 128;
  const chartTop = portrait ? chartLabelY + 70 : 170;
  const chartH = portrait ? (image ? 760 : 620) : image ? 300 : 280;
  const CH = portrait ? Math.round(chartTop + chartH + (image ? 40 : 90) + footH) : 660;
  const CX = (1920 - CW) / 2;
  const CY = Math.round((SH - CH) / 2);

  const p = interpolate(frame, [TRACE0, TRACE1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });

  // 闭合闪：50–52 冲峰，52–58 回落（纯黑 + 加粗，不发光）
  const flash = frame < 52 ? ramp(frame, 50, 2, EASE.linear) : 1 - ramp(frame, 52, 6, EASE.out);
  const SW = portrait ? 1.4 : 1;
  const strokeW = (6 + flash * 5) * SW;
  const strokeColor = flash > 0.5 ? '#000000' : INK;

  const traceOp = 1 - ramp(frame, 56, 10, EASE.linear);
  const borderOp = 1 - traceOp;
  const lift = ramp(frame, 50, 22, EASE.out);
  const inkIn = (k: number) => ramp(frame, 52 + k * 3, 12, EASE.out);
  const rise = (k: number): React.CSSProperties => {
    const t = inkIn(k);
    return { opacity: t, transform: `translateY(${((1 - t) * 14).toFixed(2)}px)`, filter: t < 1 ? `blur(${((1 - t) * 6).toFixed(2)}px)` : undefined };
  };

  const penOp = interpolate(p, [0, 0.02, 0.97, 0.995], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const [nx, ny] = rrPoint(p, 0, 0, CW, CH, RX);
  // 笔头 dash 按周长换算：保持原版的绝对长度（原卡周长 ≈ 3500px）
  const perim = 2 * (CW + CH) - (8 - 2 * Math.PI) * RX;
  const penK = 3500 / perim;

  // 裁切标记：0–12 长出，闭合时外弹 + 淡出
  const marksIn = (k: number) => ramp(frame, k * 2, 12, EASE.snappy);
  const marksPop = ramp(frame, 50, 10, EASE.out);
  const marksOp = 1 - ramp(frame, 52, 12, EASE.out);

  // 下划线
  const up = interpolate(frame, [74, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const upenOp = interpolate(up, [0, 0.04, 0.92, 0.99], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const push = 1 + 0.009 * ramp(frame, 60, 72, EASE.smooth);
  const hasBrand = !!BRAND.name;

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.42, y: 0.12 }} fill={{ x: 0.9, y: 0.9 }} />
      {/* 绘图纸点阵：48px 网格的墨点，中心清晰、四周隐去——描边阶段的"画板"，也给第 1 帧一个底 */}
      <div
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, ${alpha(L.ink, 0.24)} ${portrait ? 3 : 2}px, transparent ${portrait ? 3.5 : 2.4}px)`,
          backgroundSize: portrait ? '72px 72px' : '48px 48px', backgroundPosition: '24px 18px',
          WebkitMaskImage: 'radial-gradient(ellipse 62% 66% at 50% 50%, #000 30%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 62% 66% at 50% 50%, #000 30%, transparent 100%)',
        }}
      />

      <AbsoluteFill style={{ transform: `scale(${push.toFixed(5)})`, transformOrigin: `960px ${SH / 2}px` }}>
        {/* 卡片底面：闭合后上墨、从贴地升起 */}
        <div
          style={{
            position: 'absolute', left: CX, top: CY, width: CW, height: CH, borderRadius: RX,
            background: `linear-gradient(180deg, #fffefb 0%, ${L.surface} 100%)`,
            boxShadow: `inset 0 1px 0 #ffffff, ${softShadow((4 + lift * 26) * SW, { color: L.shadow, strength: 0.9 })}`,
            opacity: ramp(frame, 50, 10, EASE.out),
          }}
        />

        {/* 卡片内容 */}
        <div style={{ position: 'absolute', left: CX + PAD, top: CY, width: IW, height: CH }}>
          {/* 眉题行 */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: yKick, display: 'flex', alignItems: 'center', gap: 14 * SW, whiteSpace: 'nowrap', ...rise(0) }}>
            <div style={{ width: 12 * SW, height: 12 * SW, borderRadius: 6 * SW, background: L.accent, flexShrink: 0 }} />
            <div style={{ ...type(kickSz, 600), lineHeight: 1.3, letterSpacing: '0.14em', color: L.ink2 }}>{kicker}</div>
            <div style={{ flex: 1 }} />
            {tag ? <div style={{ ...type(kSz0, 500), lineHeight: 1.3, color: L.ink3 }}>{tag}</div> : null}
          </div>

          {/* 主栏：引句 + 重点词 + 说明 */}
          {leadLines.map((l, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, top: yLead + i * leadSz * 1.18, ...type(leadSz, 650), lineHeight: 1.18, whiteSpace: 'nowrap', color: L.ink2, ...rise(1) }}>{l}</div>
          ))}
          <div style={{ position: 'absolute', left: 0, top: yKey, ...rise(2) }}>
            <div style={{ ...type(keySz, 820), letterSpacing: '-0.055em', color: L.ink, lineHeight: 0.98, whiteSpace: 'nowrap', paddingTop: keySz * 0.04 }}>{key}</div>
            {/* 第二用法：重点词下方一笔朱红马克笔下划线 */}
            {up > 0.001 && (
              <svg width={300} height={24} viewBox="0 0 300 24" style={{ position: 'absolute', left: 6, bottom: -26 * SW, width: Math.max(80, keyW - 12), height: 24 * SW, overflow: 'visible' }} preserveAspectRatio="none">
                <path d={UL_PATH} fill="none" stroke={L.accent} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - up} opacity={0.92} />
                {upenOp > 0 && (
                  <path d={UL_PATH} fill="none" stroke={L.accent} strokeWidth={16} strokeLinecap="round" pathLength={1}
                    strokeDasharray={`${0.06} ${0.94}`} strokeDashoffset={0.06 - up} opacity={upenOp} />
                )}
              </svg>
            )}
          </div>
          {bodyLines.map((l, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, top: yBody + i * bodySz * 1.38, ...type(bodySz, 450), lineHeight: 1.38, whiteSpace: 'nowrap', color: L.ink2, ...rise(3) }}>{l}</div>
          ))}

          {/* 图表栏：逐项能量柱（从基线长出，末几根朱红）或实图 */}
          {chartLabel ? (
            <div style={{ position: 'absolute', left: chartX, top: chartLabelY, width: chartW, ...type(fitSize(chartLabel, { family: fonts.sans, size: portrait ? 38 : 22, maxWidth: chartW, weight: 600, minSize: 14, letterSpacingEm: 0.1 }), 600), lineHeight: 1.3, letterSpacing: '0.1em', whiteSpace: 'nowrap', color: L.ink3, ...rise(4) }}>{chartLabel}</div>
          ) : null}
          {image ? (
            <div style={{ position: 'absolute', left: chartX, top: chartTop, width: chartW, height: chartH, borderRadius: RX * 0.6, overflow: 'hidden', boxShadow: `0 0 0 1px ${alpha(L.ink, 0.1)}`, ...rise(3) }}>
              <Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ) : (
            <>
              <div style={{ position: 'absolute', left: chartX, top: chartTop, width: chartW, height: chartH, display: 'flex', alignItems: 'flex-end', gap: 10 * SW, opacity: inkIn(3) > 0 ? 1 : 0 }}>
                {barPct.map((v, i) => {
                  const g = ramp(frame, 56 + i * 1.5, 14, EASE.snappy);
                  const hot = i >= hot0;
                  return (
                    <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '100%', height: `${(v * g).toFixed(2)}%`, borderRadius: 8 * SW,
                          background: hot ? `linear-gradient(180deg, #f2674f 0%, ${L.accent} 100%)` : alpha(L.ink, 0.1),
                          opacity: hot ? 0.6 + ((i - hot0) / Math.max(1, bars.length - 1 - hot0)) * 0.4 : 1,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ position: 'absolute', left: chartX, top: chartTop + chartH + 12 * SW, width: chartW, display: 'flex', gap: 10 * SW, ...rise(4) }}>
                {bars.map((_, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', ...type(20 * SW, 600, { mono: true }), color: i >= hot0 ? L.accent : L.ink3 }}>{LETTERS[i]}</div>
                ))}
              </div>
            </>
          )}

          {/* 署名行：视频品牌标志 + 字标 + 备注 */}
          {(hasBrand || note) && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: (portrait ? 60 : 44), display: 'flex', alignItems: 'center', gap: 16 * SW, whiteSpace: 'nowrap', ...rise(5) }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: -26 * SW, height: 1.5, background: L.line }} />
              {hasBrand ? <ShotcraftMark size={52 * SW} tone="light" /> : null}
              {hasBrand ? <div style={{ ...type(footSz, 700), fontFamily: BRAND.font, lineHeight: 1.3, letterSpacing: '0.03em', color: L.ink }}>{BRAND.name}</div> : null}
              {note ? <div style={{ ...type(fitSize(note, { family: fonts.sans, size: footSz, maxWidth: IW - (hasBrand ? measureText(BRAND.name, fonts.sans, footSz, 700) + 100 * SW : 0), weight: 450, minSize: 16 }), 450), lineHeight: 1.3, color: L.ink3 }}>{note}</div> : null}
            </div>
          )}
        </div>

        {/* 卡片自身发丝边：描边淡出时接棒 */}
        <div style={{ position: 'absolute', left: CX, top: CY, width: CW, height: CH, borderRadius: RX, border: `${1.5 * SW}px solid ${alpha(L.ink, 0.14)}`, boxSizing: 'border-box', opacity: borderOp }} />

        {/* 裁切标记（印刷对位线）：四角外侧 */}
        {marksOp > 0.001 && (
          <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: marksOp }}>
            {[[CX, CY, -1, -1], [CX + CW, CY, 1, -1], [CX + CW, CY + CH, 1, 1], [CX, CY + CH, -1, 1]].map(([x, y, sx, sy], k) => {
              const t = marksIn(k);
              const off = (26 + 22 * marksPop) * (portrait ? 0.9 : 1);
              const len = 54 * t * SW;
              const ox = x + sx * off, oy = y + sy * off;
              return (
                <g key={k} stroke={L.ink2} strokeWidth={2.5 * SW} strokeLinecap="round">
                  <line x1={ox} y1={oy} x2={ox - sx * len} y2={oy} opacity={t} />
                  <line x1={ox} y1={oy} x2={ox} y2={oy - sy * len} opacity={t} />
                  <circle cx={ox} cy={oy} r={3.5 * SW} fill={L.accent} stroke="none" opacity={t} />
                </g>
              );
            })}
          </svg>
        )}

        {/* 描边生长层：主线 + 渐细笔头 + 圆形笔尖 */}
        {traceOp > 0.001 && (
          <svg width={CW} height={CH} style={{ position: 'absolute', left: CX, top: CY, overflow: 'visible', opacity: traceOp }}>
            <rect x={0} y={0} width={CW} height={CH} rx={RX} fill="none" stroke={strokeColor} strokeWidth={strokeW}
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} strokeLinecap="round" />
            {penOp > 0 &&
              [
                { len: PEN * penK, w: 6.4 },
                { len: PEN * 0.6 * penK, w: 8 },
                { len: PEN * 0.28 * penK, w: 9.6 },
              ].map(({ len, w }, k) => (
                <rect key={k} x={0} y={0} width={CW} height={CH} rx={RX} fill="none" stroke={INK} strokeWidth={w * SW} opacity={penOp}
                  pathLength={1} strokeDasharray={`${len} ${1 - len}`} strokeDashoffset={len - p} strokeLinecap="round" />
              ))}
            {penOp > 0 && (
              <g opacity={penOp}>
                <circle cx={nx + 1.5 * SW} cy={ny + 4 * SW} r={10 * SW} fill={alpha(L.shadow, 0.16)} />
                <circle cx={nx} cy={ny} r={7.5 * SW} fill={INK} />
                <circle cx={nx - 2.2 * SW} cy={ny - 2.4 * SW} r={2 * SW} fill="rgba(255,255,255,0.4)" />
              </g>
            )}
          </svg>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
