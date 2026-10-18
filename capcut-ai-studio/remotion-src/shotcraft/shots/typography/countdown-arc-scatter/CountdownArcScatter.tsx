// countdown-arc-scatter — 表盘数字扫过：等大数字沿大弧切向排布，整盘扫过 96° 后急停，
// "5" 停在弧顶随即平移落位成标题首字符，其余数字带 blur 原地散去，标题逐词模糊淡入、末词转强调色。
//
// 第二轮重设计（瑞士网格 · 纸面仪表）：
// - look = paper（暖白纸 · 墨 · 朱红）。按 1920×1080 原生作画（不再 480×270 放大）：
//   表盘半径 700px、圆心在画面下方（960,1150），弧顶在 y=450，可视角窗 ±70° 让整条弧横跨画面 ~70%；
//   9 个数字 112px 粗体 tabular、切向排布，像刻在一只巨大的纸面仪表上。
// - 盘面层次：数字内侧一圈随盘同速转的细刻度（每 4° 一根、数字位加长）+ 外侧一道静止的发丝弧与
//   朱红读数标（盘面散去后以 35% 留在海报上，标题像是从仪表上读出来的）；
//   朱红指针以 0.35 倍差速回正（"盘 vs 指针"），是扫动段唯一的强调色。
// - 扫动：先 5f 反向蓄力 3°（anticipation），再一记物理弹簧扫 99°→0°（damping 12 / stiffness 60，
//   ~2° 一次可见过冲后急停，像真表针）；快速段每个数字按切向速度做方向性运动模糊。
// - 落位："5" 在回弹落定的同一刻起飞（不留静置），20f 不对称 in-out 平移 + 112→150px 放大到
//   标题首字符槽；其余数字原地失焦淡出（不位移，不和 "5" 抢戏），刻度/指针同步退场。
// - 标题「5 phút là cài xong」150px，逐词 blur 淡入（窗重叠 = 一句话），末词转朱红是全片
//   唯一的颜色事件；下方 40px 说明条补一句事实。
// - 瑞士网格框：顶部发丝线 + 左标签 / 右侧品牌字标，全程 0.6% 极缓推近。
//
// 时间表（30fps，共 100f）：
//   0–5     预备：盘面已在画面里（第 0 帧有数字/刻度），反向蓄力 3°
//   5–34    扫动：弹簧 99°→0°，~24f 冲过 0°（≈−2°）、~34f 落定
//   28–44   其余数字 / 刻度 / 指针失焦淡出（早于 "5" 起飞 4f 先让路）
//   32–52   "5" 平移 + 放大落位
//   42–66   标题三词逐词模糊淡入（"5" 落进一句正在成形的话）；64–76 install → 朱红
//   62–78   说明条升起
//   78–100  hold 22f
//
// [Agent Edit] o chu: number (con so chinh — so NHO o cuoi thang do, vd thoi gian / so buoc / gia) / title (phan cau sau
// con so, tu cuoi duoc to mau nhan) / subtitle (dong phu trong khung) / label (nhan goc trai). Day so tren mat dong ho tu
// suy ra tu con so (x9 x7 x5.6 x4.4 x3.4 x2 -> so chinh -> x0.8 x0.6, dinh dang tieng Viet); khong phai so thi giu day mau.
// O chua so chinh do theo be ngang that cua chu (khong co dinh 0.6em). Tieu de qua dai tu thu nho (ngang) / xuong 2 dong
// (doc). Khung doc (portrait.mode = 'native'): mat dong ho phong x1.25, ca khoi dat giua khung.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useShotFonts, measureText, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, SpeedBlur, ramp, mix } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { ShotcraftWordmark } from '../../../fixtures/Brand';

export const COUNTDOWN_ARC_SCATTER_DURATION = 100;

const L = LOOKS.paper;
const SAMPLE_NUMS = [45, 35, 28, 22, 17, 10, 5, 4, 3]; // 递减不等距 = 真量程；主角在 i=6
const FACTORS = [9, 7, 5.6, 4.4, 3.4, 2, 1, 0.8, 0.6];
const HERO = 6;
const SP = 24; // 相邻数字角距
const CX = 960;
const GAP_EM = 0.24;

// 盘面转角：0–5 反向蓄力 +3°，5 起弹簧扫到 0（~2° 过冲）
const rotAt = (f: number) => {
  const pre = 96 + 3 * ramp(f, 0, 5, EASE.swift);
  if (f <= 5) return pre;
  return 99 * (1 - springAt(f, 5, { damping: 12, stiffness: 60 }));
};
const HAND0 = 32;
const handAt = (f: number) => ramp(f, HAND0, 20, EASE.swift);
const outAt = (f: number) => ramp(f, 28, 16, EASE.swift);

const deg = Math.PI / 180;
const windowOp = (pa: number) => Math.min(1, Math.max(0, (70 - Math.abs(pa)) / 22)); // 弧两端按角度淡入淡出

const TICKS = Array.from({ length: 61 }, (_, k) => (k - 30) * 4 - 48); // 盘面角 −168°..+72°（覆盖扫动全程）

// 越南语数字格式：千分位用点、小数用逗号
const fmt = (v: number) => {
  const r = v >= 3 ? Math.round(v) : Math.round(v * 10) / 10;
  const [a, b] = String(r).split('.');
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (b ? ',' + b : '');
};

export const CountdownArcScatter: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const GROT = fonts.sans;
  const portrait = SH > 1080 * 1.2;
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: Stage tu bo nen; chu nam tren nen co bong sang nhe
  const heroText = useText('number', '5').trim();
  const title = useText('title', 'phút là cài xong');
  const sub = useText('subtitle', 'Không cần cấu hình, chỉ một lệnh duy nhất');
  const label = useText('label', 'THỜI GIAN CÀI ĐẶT');

  // ── 盘面数列：由主角数字推出递减量程（主角始终在 i=6、角度 0） ──
  const v = parseFloat(heroText.replace(/\./g, '').replace(',', '.'));
  const labels = Number.isFinite(v) && v > 0 ? FACTORS.map((f, i) => (i === HERO ? heroText : fmt(v * f))) : SAMPLE_NUMS.map((n, i) => (i === HERO ? heroText : String(n)));

  // ── 几何：竖版盘面放大 1.25×，整块垂直居中 ──
  const S = portrait ? 1.25 : 1;
  const R = 700 * S; // 数字所在半径
  const ARC = 800 * S; // 外侧发丝弧半径
  const arcTop = portrait ? SH / 2 - 250 * S : 450;
  const CY = arcTop + R; // 圆心（landscape：1150）
  const polar = (a: number, r: number) => ({ x: CX + Math.sin(a * deg) * r, y: CY - Math.cos(a * deg) * r });
  const widest = Math.max(...labels.map((t) => measureText(t, GROT, 112, 700)));
  const NUM_SIZE = Math.min(112 * S, (112 * 250 * S) / Math.max(1, widest));

  // ── 标题排版：首槽 = 主角数字的真实宽度；横版一行（超宽则缩字），竖版最多 3 行 ──
  const words = title.split(/\s+/).filter(Boolean);
  const maxW = portrait ? 1700 : 1680;
  const layout = (size: number) => {
    const hw = measureText(heroText, GROT, size, 700) * 0.97;
    const ww = words.map((w) => measureText(w, GROT, size, 700) * 0.97);
    const gap = GAP_EM * size;
    const greedy = (lim: number) => {
      const lines: { items: number[]; w: number }[] = [{ items: [-1], w: hw }];
      ww.forEach((w, j) => {
        const cur = lines[lines.length - 1];
        if (portrait && cur.w + gap + w > lim) lines.push({ items: [j], w });
        else { cur.items.push(j); cur.w += gap + w; }
      });
      return lines;
    };
    let lines = greedy(maxW);
    // 多行时均衡行宽（避免末行只剩一个词）：逐步收紧上限，行数不变即采用
    if (lines.length > 1) {
      const total = hw + ww.reduce((a, w) => a + w + gap, 0);
      for (let lim = total / lines.length; lim < maxW; lim += 20) {
        const t = greedy(lim);
        if (t.length === lines.length) { lines = t; break; }
      }
    }
    return { hw, ww, gap, lines };
  };
  let TITLE_SIZE = portrait ? 210 : 150;
  let lay = layout(TITLE_SIZE);
  for (let it = 0; it < 8; it++) {
    const tooWide = Math.max(...lay.lines.map((l) => l.w)) > maxW;
    if (!tooWide && lay.lines.length <= 3) break;
    TITLE_SIZE *= !portrait && tooWide ? Math.max(0.5, maxW / Math.max(...lay.lines.map((l) => l.w))) : 0.88;
    lay = layout(TITLE_SIZE);
  }
  const LH = TITLE_SIZE * 1.18;
  const TITLE_Y = arcTop + 150 * S; // 第一行中线（landscape：600）
  const lineX0 = lay.lines.map((l) => CX - l.w / 2);
  const SLOT_CX = lineX0[0] + lay.hw / 2;
  const nW = Math.max(1, words.length);
  const wStep = Math.min(4, 16 / Math.max(1, nW - 1));
  const winOf = (j: number) => [42 + j * wStep, 42 + j * wStep + (j === nW - 1 ? 16 : 14)];
  const subTop = TITLE_Y + (lay.lines.length - 1) * LH + TITLE_SIZE * 0.5 + 70 * S;
  const subSize = fitSize(sub, { family: GROT, size: portrait ? 56 : 38, maxWidth: (portrait ? 1680 : 1500) - 100, weight: 500, minSize: portrait ? 34 : 24 });

  // 第 i 个数字：中心位置 / 自转 / 透明度 / 字号
  const numState = (i: number, f: number) => {
    const pa = (i - HERO) * SP + rotAt(f);
    const p = polar(pa, R);
    let { x, y } = p;
    let rSelf = pa;
    let op = windowOp(pa);
    let size = NUM_SIZE;
    if (i === HERO) {
      const h = handAt(f);
      x = mix(x, SLOT_CX, h);
      y = mix(y, TITLE_Y, h);
      rSelf *= 1 - h;
      size = mix(NUM_SIZE, TITLE_SIZE, h);
      op = Math.max(op, h);
    } else {
      op *= 1 - outAt(f);
    }
    return { x, y, rSelf, op, size };
  };

  const rot = rotAt(frame);
  const out = outAt(frame);
  const push = 1 + 0.006 * ramp(frame, 0, 100, EASE.smooth);
  const frameIn = ramp(frame, 0, 14, EASE.out);
  const tint = ramp(frame, 64, 12, EASE.swift); // 末词 → 朱红
  const cmd = ramp(frame, 62, 16, EASE.snappy);
  const headY = portrait ? arcTop - 100 * S - 260 : 104;
  const labelCaps = label.length <= 26;

  return (
    <AbsoluteFill style={{ textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
      <Stage look={L} keyLight={{ x: 0.5, y: portrait ? 0.4 : 0.3 }} fill={null} vignette={0.14} grain={0.05} />

      {/* 瑞士网格框：顶部发丝线 + 标签 */}
      <div style={{ position: 'absolute', left: 120, right: 120, top: headY + 46 * S, height: 1.5 * S, background: alpha(L.ink, 0.5), transform: `scaleX(${frameIn})`, transformOrigin: 'left' }} />
      <div style={{
        position: 'absolute', top: headY - 8, left: 120, maxWidth: 1100, fontFamily: GROT, fontSize: 28 * S, fontWeight: 700, lineHeight: 1.5,
        letterSpacing: labelCaps ? '0.14em' : '0.02em', color: L.ink, opacity: frameIn, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {labelCaps ? label.toUpperCase() : label}
      </div>
      {/* 右上：品牌字标，与左标签同一基线带 */}
      <div style={{ position: 'absolute', top: headY, right: 120, opacity: frameIn }}>
        <ShotcraftWordmark size={28 * S} markScale={1.3} gap={12} tone="light" color={L.ink} />
      </div>

      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `50% ${portrait ? `${TITLE_Y}px` : '50%'}` }}>
        {/* 盘面：随盘转的细刻度 + 静止发丝弧 + 0.35 倍差速的朱红指针 */}
        <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - out }}>
          {TICKS.map((a, k) => {
            const pa = a + rot;
            const op = windowOp(pa);
            if (op <= 0) return null;
            const major = ((a % SP) + SP) % SP === 0;
            const p0 = polar(pa, (major ? 584 : 600) * S);
            const p1 = polar(pa, 620 * S);
            return (
              <line key={k} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                stroke={L.ink} strokeOpacity={op * (major ? 0.7 : 0.28)} strokeWidth={(major ? 3 : 1.5) * S} strokeLinecap="round" />
            );
          })}
          {(() => {
            const a = rot * 0.35;
            const p0 = polar(a, 490 * S), p1 = polar(a, 566 * S);
            return <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={L.accent} strokeWidth={6 * S} strokeLinecap="round" />;
          })()}
        </svg>

        {/* 外侧静止发丝弧 + 朱红读数标：盘面散去后仍以 35% 留在海报上，作"仪表读数"的记忆 */}
        <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, opacity: (1 - out * 0.65) * frameIn }}>
          <path
            d={`M ${polar(-70, ARC).x} ${polar(-70, ARC).y} A ${ARC} ${ARC} 0 0 1 ${polar(70, ARC).x} ${polar(70, ARC).y}`}
            fill="none" stroke={alpha(L.ink, 0.3)} strokeWidth={1.5 * S}
          />
          <path d={`M ${CX - 13 * S} ${CY - ARC + 8 * S} L ${CX + 13 * S} ${CY - ARC + 8 * S} L ${CX} ${CY - ARC + 30 * S} Z`} fill={L.accent} />
        </svg>

        {/* 数字 */}
        {labels.map((n, i) => {
          const s = numState(i, frame);
          if (s.op <= 0.002) return null;
          const a = numState(i, frame - 0.5);
          const b = numState(i, frame + 0.5);
          const isHero = i === HERO;
          const blurOut = isHero ? 0 : out * 6;
          const B = 360 * S + (isHero ? lay.hw : 0); // 局部盒：方向性运动模糊只作用在数字附近
          return (
            <div key={i} style={{ position: 'absolute', left: s.x - B / 2, top: s.y - B / 2, width: B, height: B }}>
              <SpeedBlur vx={b.x - a.x} vy={b.y - a.y} amount={0.16} max={14}>
                <div style={{
                  position: 'absolute', left: B / 2, top: B / 2, textAlign: 'center',
                  fontFamily: GROT, fontWeight: 700, fontSize: s.size, lineHeight: 1, letterSpacing: '-0.03em',
                  fontVariantNumeric: 'tabular-nums', color: L.ink, opacity: s.op,
                  transform: `translate(-50%,-50%) rotate(${s.rSelf.toFixed(3)}deg)`,
                  filter: blurOut > 0.05 ? `blur(${blurOut.toFixed(2)}px)` : undefined,
                  whiteSpace: 'nowrap',
                }}>
                  {n}
                </div>
              </SpeedBlur>
            </div>
          );
        })}

        {/* 标题：首槽留给飞来的主角数字，其余词逐词模糊淡入 */}
        {lay.lines.map((line, li) => (
          <div key={li} style={{
            position: 'absolute', left: lineX0[li], top: TITLE_Y + li * LH, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center',
            fontFamily: GROT, fontWeight: 700, fontSize: TITLE_SIZE, lineHeight: 1.2, letterSpacing: '-0.03em', color: L.ink, whiteSpace: 'nowrap',
          }}>
            {line.items.map((j, q) => {
              if (j < 0) return <span key="slot" style={{ display: 'inline-block', width: lay.hw }} />;
              const [w0, w1] = winOf(j);
              const p = ramp(frame, w0, w1 - w0, EASE.out);
              const last = j === words.length - 1;
              return (
                <span key={j} style={{
                  display: 'inline-block', marginLeft: q === 0 ? 0 : `${GAP_EM}em`, opacity: p,
                  transform: `translateY(${((1 - p) * 0.12).toFixed(3)}em)`,
                  filter: p < 0.999 ? `blur(${((1 - p) * 10).toFixed(2)}px)` : undefined,
                  color: last ? `color-mix(in srgb, ${L.accent} ${(tint * 100).toFixed(1)}%, ${L.ink})` : undefined,
                }}>
                  {words[j]}
                </span>
              );
            })}
          </div>
        ))}

        {/* 说明条 */}
        {sub ? (
          <div style={{
            position: 'absolute', left: 0, right: 0, top: subTop, display: 'flex', justifyContent: 'center',
            opacity: cmd, transform: `translateY(${(1 - cmd) * 24}px)`,
          }}>
            <div style={{
              fontFamily: GROT, fontSize: subSize, fontWeight: 500, lineHeight: 1.35, color: L.ink2, letterSpacing: '0',
              padding: `${14 * S}px ${30 * S}px`, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 16 * S,
              border: `1.5px solid ${alpha(L.ink, 0.18)}`, borderRadius: 12 * S, background: alpha('#ffffff', 0.35),
            }}>
              <span style={{ width: 12 * S, height: 12 * S, borderRadius: 3, background: L.accent, flex: 'none' }} />
              {sub}
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
