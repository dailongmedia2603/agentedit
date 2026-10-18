// list-reveal — 菜单逐项找位 + 整体慢漂移（两层不相干的运动）
//
// 第二轮重设计（石墨暗场 · 侧边栏海报）：
// - look = graphite（近单色暗场，白为强调、香槟金只做点缀）。主体是一列 700×92 的侧边栏条目
//   （Home / Shots / Renders / Reviews / Settings / Sign out——video-shotcraft 工作台侧栏），46px 字、34px 线性图标、
//   26px 等宽快捷键；当前项 Home 是一块受光的瓷白实心条（全片唯一的高亮），未读徽章用香槟金。
//   右侧一句 120px 标题「Every shot, within reach.」+ 36px 副句，构成左列表右标题的发布片海报。
// - 手法本身（保留并做清楚）：两层运动完全解耦——
//   ① 逐项找位：每项 24f，scale 0.82→1 + 上移 44→0 + 对焦模糊 8px→0，软 back 过冲（~1.5%，
//      几乎读不出，只把落位那一帧"扣住"）；错峰 10f（"逐项读得完"的间隔），相邻约 2–3 项同时在动；
//      图标晚 2f、快捷键晚 4f 落定（跟随）。
//   ② 整体漂移：列表容器全程匀速上移 96px（≈0.8px/f），量级是单项位移的 2 倍、速度却慢一个数量级，
//      所以读作"画面在呼吸"而不是"一起往上飘"。末帧不回位（与卡片定义一致）。
// - 标题等列表铺到一半才进（Q5：开场只给列表一个主角），逐行从线下升起。
//
// 时间表（30fps，共 120f）：
//   0–2     舞台光已在，容器开始漂移
//   2–26    Home 找位（瓷白条，第一拍）
//   12–86   其余五项按 10f 错峰找位（Sign out 前的分隔线随之显现）
//   46–80   右侧标题逐行升起、副句淡入
//   86–120  hold：漂移继续、光呼吸，尾帧是完整海报
//
// [Agent Edit] o chu: items (3-8 muc, muc DAU = muc dang chon, to sang), keys (nhan nho ben phai tung muc, tuy chon —
// chi hien phim tat mau khi dung chu mau), badge (so tren muc thu 4, tuy chon), kicker / title / subtitle (khoi tieu de).
// So muc thay doi -> chieu cao hang + nhip vao tu tinh lai (muc cuoi van vao truoc khung 86). Khung doc (native): danh
// sach rong 1700 xep tren, tieu de ben duoi (vao sau khi danh sach trai duoc nua — nhu goc), chu to 1.8x, ca khoi
// can giua; lop troi cham ca khoi giu nguyen (khong ve vi tri o khung cuoi — dung the goc).
import { useCurrentFrame, useVideoConfig, useText, useList, useShot, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, bezier, ramp } from '../../../fixtures/Polish';
import { Dust, LOOKS, Sheen, Stage, alpha, type } from '../../../fixtures/Look';

export const LIST_REVEAL_DURATION = 120;

const L = LOOKS.graphite;

const START = 2; // 首项起点
const EACH = 24;
const softBack = bezier(0.3, 1.18, 0.5, 1); // 软过冲 ~1.5%

const Icon: React.FC<{ i: number; color: string; size: number }> = ({ i, color, size }) => {
  const p = { fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const k = i % 8;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {k === 0 && (<><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" {...p} /><path d="M9.5 20.5v-6h5v6" {...p} /></>)}
      {k === 1 && <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" {...p} />}
      {k === 2 && (<><rect x={3.5} y={5} width={17} height={14} rx={2.5} {...p} /><path d="M10.2 9.2v5.6l4.6-2.8Z" {...p} /></>)}
      {k === 3 && <path d="M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2h-7l-4.5 3.5V16H6a2 2 0 0 1-2-2Z" {...p} />}
      {k === 4 && (<><circle cx={12} cy={12} r={3} {...p} /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} /></>)}
      {k === 5 && (<><path d="M4 19.5V9M10 19.5V5M16 19.5v-7M20.5 19.5h-17" {...p} /></>)}
      {k === 6 && <path d="M12 3.8l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.8l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" {...p} />}
      {k === 7 && (<><path d="M14 4h3.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" {...p} /><path d="M10 8l-4 4 4 4M6 12h9" {...p} /></>)}
    </svg>
  );
};

// 标题逐行从线下升起（每行 22f、行间 7f，EASE.snappy —— 同原版 TextReveal by="line"；
// 遮罩上 0.5em / 下 0.26em 留白：越南语叠加声调不被裁）
const LineRise: React.FC<{ lines: string[]; start: number; lineH: number }> = ({ lines, start, lineH }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {lines.map((l, i) => {
        const p = EASE.snappy(Math.min(1, Math.max(0, (frame - start - i * 7) / 22)));
        return (
          <div key={i} style={{ overflow: 'hidden', padding: '0.5em 0.04em 0.26em', margin: '-0.5em -0.04em -0.26em', height: lineH, boxSizing: 'content-box', whiteSpace: 'nowrap' }}>
            <div style={{ transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.3).toFixed(3)}em))` }}>{l}</div>
          </div>
        );
      })}
    </>
  );
};

export const ListReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const shot = useShot();
  const realItems = !!shot && shot.texts.items !== undefined;

  const items = useList('items', ['Trang chủ', 'Cảnh quay', 'Bản dựng', 'Góp ý', 'Cài đặt', 'Đăng xuất']).slice(0, 8);
  const keysIn = useList('keys', realItems ? [] : ['⌘1', '⌘2', '⌘3', '', '⌘,', '']);
  const badge = useText('badge', realItems ? '' : '3');
  const kicker = useText('kicker', 'BÀN LÀM VIỆC');
  const title = useText('title', 'Mọi cảnh quay, trong tầm tay.');
  const subtitle = useText('subtitle', 'Công thức, bản dựng và kịch bản — chỉ cách một phím bấm.');
  const N = Math.max(1, items.length);
  // 末项分隔线（"退出"类收尾项）：只在示例侧栏里出现
  const lastSep = !realItems && N >= 4;
  const badgeIdx = badge && N >= 5 ? 3 : badge && N >= 2 ? N - 1 : -1;

  // ── 几何 ──
  const K = portrait ? 1.8 : 1;
  const ROW_W = portrait ? 1700 : 700;
  const LIST_X = portrait ? 110 : 170;
  const avail = portrait ? 1700 : 740; // 列表可用高（含漂移安全区）
  const step0 = (92 + 14) * K;
  const step = Math.min(step0, (avail - (lastSep ? 22 * K : 0)) / N);
  const ROW_H = step * (92 / 106);
  const RK = ROW_H / 92; // 行内元素缩放
  const listH = N * step - (step - ROW_H) + (lastSep ? 22 * K : 0);
  const DRIFT = 96 * K; // 全程总漂移（+48 → −48）
  const STAGGER = Math.min(10, 60 / Math.max(1, N - 1)); // 末项 ≤ 86f 落定

  // 标题块
  const tW = portrait ? 1700 : 780;
  const tSz0 = portrait ? 180 : 120;
  const tryLines = (sz: number, max: number) => wrapLines(title, fonts.sans, sz, tW, 760, max);
  let tSz = tSz0;
  let tLines = tryLines(tSz, 2);
  if (wrapLines(title, fonts.sans, tSz, tW, 760, 99).length > 2) {
    tSz = tSz0 * 0.78;
    tLines = tryLines(tSz, 3);
  }
  tSz = Math.min(tSz, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tSz, maxWidth: tW, weight: 760, minSize: tSz0 * 0.4 })));
  const subSz0 = portrait ? 58 : 36;
  const subLines = subtitle ? wrapLines(subtitle, fonts.sans, subSz0, tW - 20, 450, portrait ? 3 : 3) : [];
  const subSz = Math.min(subSz0, ...subLines.map((l) => fitSize(l, { family: fonts.sans, size: subSz0, maxWidth: tW - 20, weight: 450, minSize: 18 })));
  const kSz = fitSize(kicker, { family: fonts.sans, size: portrait ? 40 : 24, maxWidth: tW, weight: 600, minSize: 14, letterSpacingEm: 0.16 });
  const titleH = kSz * 1.3 + 26 * K + tLines.length * tSz * 1.1 + (subLines.length ? 34 * K + subLines.length * subSz * 1.35 : 0);

  let LIST_Y: number;
  let titleTop: number;
  let titleLeft: number;
  if (portrait) {
    const gap = 200;
    const block = listH + gap + titleH;
    LIST_Y = Math.round((SH - block) / 2);
    titleTop = LIST_Y + listH + gap;
    titleLeft = 110;
  } else {
    LIST_Y = Math.round(558 - listH / 2); // 漂移中点处的列表顶（原版 236，6 项）
    titleTop = Math.round(Math.max(90, 540 - titleH / 2 - 20));
    titleLeft = 1010;
  }

  // 整体漂移：全程匀速（"呼吸"层，故意线性，与逐项曲线无关）
  const drift = DRIFT / 2 - (DRIFT * frame) / (LIST_REVEAL_DURATION - 1);
  const keyW = Math.max(0, ...items.map((_, i) => (keysIn[i] ? measureText(keysIn[i], fonts.mono, 26 * RK, 500) : 0)), badgeIdx >= 0 ? 60 * RK : 0);
  const labelRoom = ROW_W - (30 + 56 + 26 + 34) * RK - (keyW ? keyW + 20 * RK : 0);
  const labelSz = Math.min(...items.map((it, i) => fitSize(it, { family: fonts.sans, size: 46 * RK, maxWidth: labelRoom, weight: i === 0 ? 680 : 560, minSize: 20 })));

  return (
    <AbsoluteFill style={{ background: L.bg[2], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.26, y: 0.02 }} fill={{ x: 0.85, y: 0.9 }} intensity={0.5} breathe={0.5} grain={0.09} vignette={0.6}>
        <Dust look={L} count={22} seed={7} drift={0.12} opacity={0.3} />
      </Stage>

      {/* 列表：整体漂移层 */}
      <div style={{ position: 'absolute', left: LIST_X, top: LIST_Y, width: ROW_W, transform: `translateY(${drift.toFixed(3)}px)` }}>
        {items.map((label, i) => {
          const t0 = START + i * STAGGER;
          const lin = ramp(frame, t0, EACH, EASE.linear);
          const p = softBack(lin);
          const pIcon = softBack(ramp(frame, t0 + 2, EACH, EASE.linear));
          const pKey = ramp(frame, t0 + 4, EACH - 4, EASE.out);
          const active = i === 0;
          const last = lastSep && i === N - 1;
          const y = i * step + (last ? 22 * K : 0);
          const blur = (1 - EASE.out(lin)) * 8 * K;
          const key = keysIn[i] ?? '';
          return (
            <React.Fragment key={i}>
              {last && (
                <div style={{
                  position: 'absolute', left: 24 * K, right: 24 * K, top: y - 18 * K, height: 1 * K, background: alpha('#ffffff', 0.1),
                  transform: `scaleX(${ramp(frame, t0, EACH, EASE.snappy).toFixed(4)})`, transformOrigin: '0 50%',
                }} />
              )}
              <div style={{
                position: 'absolute', left: 0, top: y, width: ROW_W, height: ROW_H, borderRadius: 24 * RK, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 26 * RK, padding: `0 ${34 * RK}px 0 ${30 * RK}px`,
                background: active ? 'linear-gradient(180deg, #f7f6f2 0%, #e9e8e3 100%)' : 'linear-gradient(180deg, #1c1d21 0%, #161719 100%)',
                boxShadow: active
                  ? `inset 0 1px 0 #ffffff, 0 18px 40px -14px rgba(0,0,0,0.75), 0 0 60px -10px ${alpha('#ffffff', 0.16)}`
                  : `inset 0 0 0 1px ${alpha('#ffffff', 0.07)}, inset 0 1px 0 ${alpha('#ffffff', 0.06)}, 0 14px 30px -14px rgba(0,0,0,0.8)`,
                opacity: Math.min(1, lin * 2.2),
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                transform: `translateY(${((1 - p) * 44 * K).toFixed(2)}px) scale(${(0.82 + 0.18 * p).toFixed(4)})`,
                transformOrigin: '30% 50%', overflow: 'hidden',
              }}>
                {/* 当前项落位后一次扫光（Q4：只给主角一次，裁进圆角） */}
                {active && <Sheen progress={ramp(frame, 22, 26, EASE.swift)} strength={0.6} width={0.18} />}
                <div style={{
                  width: 56 * RK, height: 56 * RK, borderRadius: 16 * RK, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? alpha('#000000', 0.06) : alpha('#ffffff', 0.05),
                  transform: `scale(${(0.72 + 0.28 * pIcon).toFixed(4)})`, opacity: Math.min(1, Math.max(0, pIcon) * 2),
                }}>
                  <Icon i={lastSep && i === N - 1 ? 7 : i} color={active ? '#141416' : last ? L.ink3 : L.ink2} size={34 * RK} />
                </div>
                <div style={{ ...type(labelSz, active ? 680 : 560), lineHeight: 1.3, color: active ? '#0f0f11' : last ? L.ink3 : L.ink, whiteSpace: 'nowrap' }}>{label}</div>
                <div style={{ marginLeft: 'auto', opacity: pKey, transform: `translateX(${((1 - pKey) * 14 * K).toFixed(2)}px)`, flexShrink: 0 }}>
                  {i === badgeIdx ? (
                    <div style={{
                      minWidth: 50 * RK, height: 40 * RK, padding: `0 ${14 * RK}px`, boxSizing: 'border-box', borderRadius: 20 * RK, background: L.accent2,
                      color: '#1a1408', display: 'flex', alignItems: 'center', justifyContent: 'center', ...type(26 * RK, 750), whiteSpace: 'nowrap',
                      boxShadow: `0 0 24px -4px ${alpha(L.accent2, 0.7)}`,
                    }}>{badge}</div>
                  ) : key ? (
                    <div style={{ ...type(26 * RK, 500, { mono: true }), color: active ? alpha('#000000', 0.45) : L.ink3, whiteSpace: 'nowrap' }}>{key}</div>
                  ) : null}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* 标题：列表铺到一半才进（横向在右侧；纵向在列表下方） */}
      <div style={{ position: 'absolute', left: titleLeft, top: titleTop, width: tW }}>
        {kicker ? (
          <div style={{ ...type(kSz, 600), lineHeight: 1.3, letterSpacing: '0.16em', color: L.accent2, whiteSpace: 'nowrap', opacity: ramp(frame, 40, 16, EASE.out) }}>
            {kicker}
          </div>
        ) : null}
        <div style={{ ...type(tSz, 760), lineHeight: 1.1, color: L.ink, marginTop: 26 * K, whiteSpace: 'nowrap' }}>
          <LineRise lines={tLines} start={46} lineH={tSz * 1.1} />
        </div>
        {subLines.length ? (
          <div style={{
            ...type(subSz, 450), color: L.ink2, marginTop: 34 * K, lineHeight: 1.35, whiteSpace: 'pre',
            opacity: ramp(frame, 66, 18, EASE.out), transform: `translateY(${((1 - ramp(frame, 66, 18, EASE.snappy)) * 16).toFixed(2)}px)`,
          }}>
            {subLines.join('\n')}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
