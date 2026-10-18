// orbit-ring-title-open — 环形卡阵标题开场
// 八张 16:9 内容卡按 45° 均布在椭圆上匀速公转（卡身永不倾斜，纵深只由 sin(θ) 给出缩放、
// z 序、景深与明暗），入场期卡内容冻结首帧、环撑开落定后统一开播；居中标题逐字解糊下沉落定，
// 关键词全部到位那一刻荧光马克块自左横扫铺满（扫过处字色反白为墨），mono 副行随后浮出。
//
// 第二轮重设计（石墨夜 · 荧光笔）：
// - look = lime：石墨暗场 + 荧光黄绿。马克块从"黄色便利贴"变成一支荧光笔——暗场里唯一的高饱和色块，
//   只给关键词「每一个动效」。八张卡全部换成暗色产品卡（深石墨底 + 发丝线 + 顶部内高光），
//   卡内小动效统一用荧光绿做唯一强调，卡内字只做纹理（读的是标题）。
// - 标题从 64px 单行改成两级：上行 64px 次级灰「让镜头卡替你想好」，下行 156px「每一个动效」做主角；
//   马克块扫过时用两层裁切让字从白翻成墨色（反白在块的前沿同步发生，读作"被荧光笔划过"）。
// - 空间：椭圆轨道本身画成一圈极淡的发丝线（入场时描出来），卡的纵深除了 ±12% 缩放，
//   远处（上方）的卡再压暗 + 轻微失焦，近处（下方）全亮全清——环有前后，标题在焦平面上。
//   标题后垫一团暗色 scrim，保证卡从背后经过时标题始终压得住。
// - 收尾：原版末段整行失焦退场做交棒；单镜头演示改为停在完整海报（HANDOFF_EXIT 开关保留退场逻辑）。
//
// 时间表（30fps，共 150f）：
//   0–24    环从 0.62 撑开到满径（snappy）+ 逐卡淡入；轨道发丝线 0–30 描出
//   24      八张卡同时开播（冻结首帧 → 正常时间轴）
//   10–40   上行逐字解糊下沉（错峰 1f）
//   18–52   下行大字逐字解糊下沉（错峰 2f，更重更慢）
//   50–64   荧光马克块横扫（弹簧，damping 20），扫过处字反白为墨
//   60–76   副行（标志 + video-shotcraft + mono 代号）浮出
//   76–150  hold：环持续匀速公转 + 整体极缓推近 2.5%；最后 2.5s 是一张完整海报
//
// [Agent Edit] o chu: line1 (dong tren, xam) / highlight (dong chinh to + vet bút da quang, 1 dong — co chu tu vua) /
// tag (nhan nho canh ten thuong hieu). Anh tuy chon img1..img4 thay the o vi tri 1/3/5/7 cua vong (anh B-roll that, cover 16:9).
// Chu tren 8 the giao dien gia doi sang tieng Viet trung tinh (chi la hoa van). Khung doc (native): vong elip DUNG (RX 600 /
// RY ~1250) bao quanh tieu de, the to hon; toc do quay giu nguyen (toc do dai tren man hinh tuong duong khung ngang).
import { useCurrentFrame, useVideoConfig, useText, useImage, useShotFonts, useBrand, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Easing, Freeze, Img, interpolate } from 'remotion';
import { EASE, FONT, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const ORBIT_RING_TITLE_OPEN_DURATION = 150; // 5s @30fps

const L = LOOKS.lime;
const LIME = L.accent;

// ---- 环 ---- (khung ngang: RX 720 / RY 380 / the 400x225 — tinh trong component theo huong khung)
const N = 8;
const ROT_SPEED = 0.3; // rad/s，正值 = 顺时针
const RING_IN = 24; // f：从中心撑开到满径
const RING_SCALE_FROM = 0.62;
const PLAY_START = 24; // f：环撑开后卡内容才开播
const DEPTH_SCALE = 0.12; // 近大远小幅度（底部近、顶部远）

// ---- 标题 ----
const MARKER_AT = 50; // 下行末字视觉到位那一刻起扫
const HANDOFF_EXIT = false; // true = 末段整行失焦淡出、环继续转着交棒下一镜（成片里接下一镜时打开）
const EXIT_AT = 118;

const INK = L.ink;
const DIM = '#8d937f';

// ── 卡内占位内容（暗色产品卡，960×540 作画后整体缩到卡宽）──────────────────
const F = (frame: number, a: number, b: number, ease = Easing.out(Easing.cubic)) =>
  interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

const Pad: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = L.surface }) => (
  <div style={{ position: 'absolute', inset: 0, background: bg, padding: 60, fontFamily: FONT.sans, boxSizing: 'border-box' }}>{children}</div>
);

const T: React.FC<{ size: number; color?: string; weight?: number; mono?: boolean; style?: React.CSSProperties; children: React.ReactNode }> = ({
  size, color = INK, weight = 500, mono, style, children,
}) => (
  <div style={{
    fontSize: size, color, fontWeight: weight, fontFamily: mono ? FONT.mono : FONT.sans,
    letterSpacing: mono ? 0 : size >= 40 ? '-0.035em' : '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', ...style,
  }}>{children}</div>
);
const Caps: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = DIM }) => (
  <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: '0.16em', color }}>{children}</div>
);

/** 1 荧光笔扫读 */
const TileSweep: React.FC = () => {
  const f = useCurrentFrame();
  const s = F(f, 14, 32, EASE.snappy);
  return (
    <Pad>
      <Caps>GHI CHÚ PHÁT HÀNH · 4.2</Caps>
      <div style={{ position: 'relative', display: 'inline-block', marginTop: 40 }}>
        <div style={{ position: 'absolute', left: -12, right: -12, top: 4, bottom: 0, background: LIME, borderRadius: 4, transformOrigin: 'left center', transform: `scaleX(${s})` }} />
        <T size={58} weight={700} color={s > 0.6 ? L.onAccent : INK} style={{ position: 'relative' }}>Làm việc nhanh hơn.</T>
      </div>
      <T size={30} color={DIM} weight={450} style={{ marginTop: 34 }}>Mọi tác vụ được sắp xếp gọn gàng</T>
      <T size={30} color={DIM} weight={450} style={{ marginTop: 8 }}>theo đúng thứ tự ưu tiên.</T>
    </Pad>
  );
};

/** 2 指标 + sparkline 描线 */
const SPARK = 'M8 118 L118 92 L228 104 L338 56 L448 68 L558 20 L632 34';
const TileMetric: React.FC = () => {
  const f = useCurrentFrame();
  const draw = F(f, 10, 46, EASE.smooth);
  const val = 128 + Math.round(F(f, 8, 40, Easing.out(Easing.quad)) * 84);
  const chip = F(f, 34, 46);
  return (
    <Pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <Caps>LƯỢT XEM / NGÀY</Caps>
        <div style={{ fontSize: 24, fontWeight: 650, color: L.onAccent, background: LIME, padding: '4px 12px', borderRadius: 999, opacity: chip, transform: `translateY(${(1 - chip) * 8}px)` }}>+18,4%</div>
      </div>
      <div style={{ fontSize: 140, fontWeight: 700, color: INK, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, fontFamily: FONT.sans }}>{val}</div>
      <svg width={640} height={140} viewBox="0 0 640 140" style={{ marginTop: 8, overflow: 'visible' }}>
        <defs>
          <linearGradient id="orto-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={LIME} stopOpacity={0.28} />
            <stop offset="1" stopColor={LIME} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${SPARK} L632 140 L8 140 Z`} fill="url(#orto-area)" opacity={draw} />
        <path d={SPARK} fill="none" stroke="rgba(220,255,170,0.12)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        <path d={SPARK} fill="none" stroke={LIME} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
    </Pad>
  );
};

/** 3 竖向步骤清单逐条勾选 */
const STEPS = ['Lên kịch bản', 'Chọn mẫu phù hợp', 'Tinh chỉnh chi tiết', 'Xuất bản và duyệt'];
const TileSteps: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Pad bg={L.surface2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {STEPS.map((label, i) => {
          const on = F(f, 8 + i * 9, 22 + i * 9);
          const tick = F(f, 12 + i * 9, 22 + i * 9, EASE.overshoot);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 23, flex: 'none', boxSizing: 'border-box',
                background: on > 0.6 ? LIME : 'transparent', border: on > 0.6 ? 'none' : '3px solid rgba(220,255,170,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={26} height={26} viewBox="0 0 24 24" style={{ transform: `scale(${tick})` }}>
                  <path d="M5 12.5 L10 17 L19 7.5" fill="none" stroke={L.onAccent} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <T size={38} weight={on > 0.6 ? 600 : 500} color={on > 0.6 ? INK : '#5f6556'}>{label}</T>
            </div>
          );
        })}
      </div>
    </Pad>
  );
};

/** 4 路线描线 + 落点钉针（暗网格地图底） */
const ROUTE = 'M40 380 C 200 380 190 210 340 200 C 500 190 500 90 700 70';
const TileRoute: React.FC = () => {
  const f = useCurrentFrame();
  const draw = F(f, 6, 42, EASE.smooth);
  const pin = springAt(f, 36, { damping: 12 });
  const tag = F(f, 42, 54);
  return (
    <Pad bg={L.surface2}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(220,255,170,0.06) 2px, transparent 2px), linear-gradient(90deg, rgba(220,255,170,0.06) 2px, transparent 2px)', backgroundSize: '80px 80px' }} />
      <svg width={848} height={428} viewBox="0 0 848 428" style={{ position: 'relative', overflow: 'visible' }}>
        <path d={ROUTE} fill="none" stroke="rgba(220,255,170,0.14)" strokeWidth={10} strokeLinecap="round" />
        <path d={ROUTE} fill="none" stroke={LIME} strokeWidth={10} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        <circle cx={40} cy={380} r={14} fill={L.surface2} stroke={LIME} strokeWidth={6} />
        <g transform={`translate(700 70) scale(${pin})`}>
          <circle r={36} fill={alpha(LIME, 0.2)} />
          <circle r={24} fill={LIME} />
          <circle r={9} fill={L.onAccent} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 470, top: 64, padding: '10px 18px', borderRadius: 12, background: '#262a20', boxShadow: '0 0 0 2px rgba(220,255,170,0.1), 0 10px 24px rgba(0,0,0,0.4)', opacity: tag, transform: `translateY(${(1 - tag) * 10}px)` }}>
        <T size={28} weight={600}>Còn 12 phút</T>
      </div>
    </Pad>
  );
};

/** 5 终端打字（打字是机械匀速语义，逐字线性揭示） */
const TERM = [
  { t: '$ npm run build', c: '#e8ecdf' },
  { t: '✓ Đóng gói trong 2,1 giây', c: LIME },
  { t: '  Đang xử lý 150 khung hình', c: '#8d937f' },
  { t: '✓ Xong → out/video.mp4', c: LIME },
];
const TileTerminal: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Pad bg="#0b0c09">
      <div style={{ display: 'flex', gap: 14, marginBottom: 34 }}>
        {[0.5, 0.3, 0.2].map((o, i) => <div key={i} style={{ width: 20, height: 20, borderRadius: 10, background: `rgba(220,255,170,${o})` }} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <T size={30} mono color={LIME}>~/du-an</T>
        {TERM.map((row, i) => {
          const p = F(f, 8 + i * 11, 20 + i * 11, Easing.linear);
          const n = Math.round(row.t.length * p);
          return <T key={i} size={30} mono color={row.c} style={{ height: 37 }}>{row.t.slice(0, n)}</T>;
        })}
      </div>
    </Pad>
  );
};

/** 6 线稿描画（点阵纸底） */
const SKETCH = ['M80 380 L768 380', 'M140 380 L200 90 L648 90 L708 380', 'M280 90 L280 380', 'M500 90 L500 380'];
const TileSketch: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Pad>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(220,255,170,0.14) 2px, transparent 2.5px)', backgroundSize: '40px 40px' }} />
      <svg width={848} height={428} viewBox="0 0 848 428" style={{ position: 'relative' }}>
        {SKETCH.map((d, i) => <path key={`g${i}`} d={d} fill="none" stroke="rgba(220,255,170,0.12)" strokeWidth={7} strokeLinecap="round" />)}
        {SKETCH.map((d, i) => {
          const p = F(f, 6 + i * 10, 24 + i * 10, EASE.smooth);
          return <path key={i} d={d} fill="none" stroke={i === 1 ? LIME : INK} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />;
        })}
      </svg>
    </Pad>
  );
};

/** 7 卡片缩成胶囊（主体让位） */
const TileShrink: React.FC = () => {
  const f = useCurrentFrame();
  const p = F(f, 16, 44, EASE.smooth);
  const cont = F(f, 28, 50);
  return (
    <Pad bg={L.surface2}>
      <div style={{
        position: 'absolute', left: 60, top: 60, width: 840 - 690 * p, height: 420 - 342 * p, borderRadius: 16 + 30 * p,
        background: '#262a20', boxShadow: '0 0 0 2px rgba(220,255,170,0.08), 0 12px 28px rgba(0,0,0,0.35)', overflow: 'hidden',
        display: 'flex', alignItems: p > 0.6 ? 'center' : 'flex-start', justifyContent: p > 0.6 ? 'center' : 'flex-start',
        padding: p > 0.6 ? 0 : 40, boxSizing: 'border-box',
      }}>
        {p <= 0.6 ? (
          <div style={{ opacity: 1 - p / 0.6 }}>
            <Caps>TÓM TẮT TUẦN</Caps>
            <T size={46} weight={700} style={{ marginTop: 18 }}>12 việc đã xong</T>
            <T size={28} color={DIM} weight={450} style={{ marginTop: 10 }}>3 chờ duyệt · 1 cần sửa</T>
          </div>
        ) : (
          <T size={30} weight={600} color={LIME} style={{ opacity: (p - 0.6) / 0.4 }}>Tóm tắt</T>
        )}
      </div>
      <div style={{ position: 'absolute', left: 260, top: 150, opacity: cont, transform: `translateX(${(1 - cont) * 24}px)` }}>
        <T size={48} weight={700}>Kế hoạch quý 3</T>
        <T size={28} color={DIM} weight={450} style={{ marginTop: 14 }}>Phụ trách · Nhóm dự án</T>
        <T size={28} color={DIM} weight={450} style={{ marginTop: 6 }}>Hạn 18/10</T>
      </div>
    </Pad>
  );
};

/** 8 冲击字卡 */
const TileImpact: React.FC = () => {
  const f = useCurrentFrame();
  const p = springAt(f, 8, { damping: 13, mass: 0.7 });
  return (
    <Pad bg="#0f110c">
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <div style={{ fontSize: 30, fontWeight: 650, color: LIME, letterSpacing: '0.4em', fontFamily: FONT.sans }}>QUÝ 3 · 2026</div>
        <div style={{ fontSize: 150, fontWeight: 850, letterSpacing: '-0.05em', color: INK, fontFamily: FONT.sans, transform: `scale(${0.72 + p * 0.28})`, opacity: Math.min(1, p) }}>RA MẮT</div>
      </div>
    </Pad>
  );
};

const TILES: React.FC[] = [TileSweep, TileShrink, TileMetric, TileRoute, TileSteps, TileTerminal, TileSketch, TileImpact];

// ── 标题逐字：位移只占前 1/3，解糊走满（同起不同终 = blur-slide 的手感）──
const charStyle = (frame: number, at: number, size: number, dur: number): React.CSSProperties => {
  const pMain = ramp(frame, at, dur, EASE.out);
  const pTravel = ramp(frame, at, dur / 3, EASE.out);
  return {
    display: 'inline-block', whiteSpace: 'pre', transformOrigin: '50% 55%', opacity: pMain,
    filter: pMain < 1 ? `blur(${((1 - pMain) * (size / 6)).toFixed(2)}px)` : undefined,
    transform: `translateY(${((1 - pTravel) * size * 0.22).toFixed(2)}px)`,
  };
};

// ── 主体 ───────────────────────────────────────────────────────────────────
const ImgTile: React.FC<{ src: string }> = ({ src }) => (
  <div style={{ position: 'absolute', inset: 0, background: L.surface }}>
    <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </div>
);

export const OrbitRingTitleOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const t = frame / fps;
  const LINE1 = useText('line1', 'Mọi công cụ bạn cần,');
  const LINE2 = useText('highlight', 'trong một ứng dụng');
  const KICKER = useText('tag', 'BỘ CÔNG CỤ SÁNG TẠO');
  const imgs = [useImage('img1'), useImage('img2'), useImage('img3'), useImage('img4')];

  // —— hinh hoc vong
  const CW = portrait ? 640 : 400; // 卡宽（16:9）
  const CH = CW * 9 / 16;
  const RX = portrait ? 570 : 720; // 椭圆长半轴
  const RY = portrait ? Math.min(1250, SH / 2 - CH * 0.62 - 140) : 380; // 椭圆短半轴（khung ngang RY/RX≈0.53 → 读作俯视的环）
  const CY = SH / 2;
  // —— co chu tieu de (chu that dai ngan bat ky: moi dong 1 hang, tu thu nho vua khung)
  const maxW = portrait ? 1640 : 1560;
  const S1 = fitSize(LINE1, { family: fonts.sans, size: portrait ? 100 : 64, maxWidth: maxW, weight: 500, minSize: 36, letterSpacingEm: 0.02 });
  // dong chinh: 1 dong (马克块 can 1 hang); chu dai qua -> tach 2 dong can bang, MOI dong 1 vet but quet noi tiep
  const hiW = portrait ? maxW - 80 : 1320;
  const hiSize0 = portrait ? 230 : 156;
  const fit1 = (tx: string) => fitSize(tx, { family: fonts.sans, size: hiSize0, maxWidth: hiW, weight: 600, minSize: 60, letterSpacingEm: 0.01 });
  const words2 = LINE2.split(/\s+/).filter(Boolean);
  let hiLines = [LINE2];
  if (fit1(LINE2) < hiSize0 * 0.72 && words2.length > 1) {
    let best = 1, bestD = Infinity;
    for (let k = 1; k < words2.length; k++) {
      const d = Math.abs(measureText(words2.slice(0, k).join(' '), fonts.sans, 100, 600) - measureText(words2.slice(k).join(' '), fonts.sans, 100, 600));
      if (d < bestD) { bestD = d; best = k; }
    }
    hiLines = [words2.slice(0, best).join(' '), words2.slice(best).join(' ')];
  }
  const S2 = Math.min(...hiLines.map(fit1), !portrait && hiLines.length > 1 ? 124 : 999); // khung ngang 2 dong: nho hon de vong the van tho
  // be ngang tung dong tinh theo em (cho vet but da quang + cat doi mau)
  const WemOf = (tx: string) => Math.max(0.5, (measureText(tx, fonts.sans, S2, 600) + Array.from(tx).length * 0.01 * S2) / S2);
  const kickFs = portrait ? 40 : 26;
  const hiGap = S2 * 0.16;
  const titleH = S1 * 1.25 + 34 + hiLines.length * S2 * 1.12 + (hiLines.length - 1) * hiGap + 40 + kickFs * 1.8;
  const titleTop = CY - titleH / 2 + (portrait ? 0 : 6);
  const ringIn = ramp(frame, 0, RING_IN, EASE.snappy);
  const ringScale = RING_SCALE_FROM + (1 - RING_SCALE_FROM) * ringIn;
  const rot = t * ROT_SPEED;
  const track = ramp(frame, 0, 30, EASE.out);
  const push = 1 + 0.025 * ramp(frame, 40, 110, EASE.smooth); // hold 段极缓推近

  const marker = Math.min(1.03, springAt(frame, MARKER_AT, { damping: 20, stiffness: 190 }));
  const kickerIn = ramp(frame, 60, 16, EASE.out);
  const exitQ = HANDOFF_EXIT ? ramp(frame, EXIT_AT, 10, EASE.exit) : 0;
  const titleExit: React.CSSProperties = { opacity: 1 - exitQ, filter: exitQ > 0.01 ? `blur(${(exitQ * 6.5).toFixed(2)}px)` : undefined };

  const l1 = Array.from(LINE1);
  const nChars2 = hiLines.reduce((acc, x) => acc + Array.from(x).length, 0);
  const step2 = Math.min(2, 22 / Math.max(1, nChars2)); // 下行逐字错峰（字多时压密，末字仍在马克块前到位）
  const step1 = Math.min(1, 20 / Math.max(1, l1.length));
  let c0 = 0;
  const hiRows = hiLines.map((tx, k) => {
    const chars = Array.from(tx);
    const base = c0;
    c0 += chars.length;
    const mk = k === 0 ? marker : Math.min(1.03, springAt(frame, MARKER_AT + 9 * k, { damping: 20, stiffness: 190 }));
    const W = WemOf(tx);
    // 马克块比字宽出左右各 0.14em：块前沿在字盒里的位置 = (m·(W+0.28em) − 0.14em) / W（W = 实测字宽 em）
    const edge = Math.min(1, Math.max(0, (Math.min(1, mk) * (W + 0.28) - 0.14) / W));
    const render = (color: string) => chars.map((ch, j) => <span key={j} style={{ ...charStyle(frame, 18 + (base + j) * step2, S2, 32), color }}>{ch}</span>);
    return { mk, render, clipR: ((1 - edge) * 100).toFixed(2), clipL: (edge * 100).toFixed(2) };
  });

  return (
    <AbsoluteFill style={{ background: L.bg[1], fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.0 }} fill={null} intensity={0.5} vignette={0.62}>
        {/* 标题背后的暗 scrim：卡从背后经过时标题始终压得住 */}
        <div style={{ position: 'absolute', left: 360, top: CY - 240, width: 1200, height: 480, background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha('#050604', 0.75)} 0%, ${alpha('#050604', 0)} 70%)` }} />
      </Stage>

      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {/* 椭圆轨道发丝线：入场时描出来，给环一个看得见的几何 */}
        <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0 }}>
          <ellipse cx={960} cy={CY} rx={RX * ringScale} ry={RY * ringScale} fill="none" stroke={alpha(LIME, 0.16)} strokeWidth={1.5}
            pathLength={1} strokeDasharray="1" strokeDashoffset={1 - track} />
        </svg>

        {TILES.map((Comp, i) => {
          const theta = -Math.PI / 2 + (i * Math.PI * 2) / N + rot;
          const x = 960 + Math.cos(theta) * RX * ringScale;
          const y = CY + Math.sin(theta) * RY * ringScale;
          const depth = Math.sin(theta); // +1 = 画面下方（近），−1 = 上方（远）
          const s = 1 + DEPTH_SCALE * depth;
          const op = ramp(frame, 2 + i * 1.5, 11, EASE.out);
          const grow = 0.9 + 0.1 * op;
          const far = Math.max(0, -depth); // 远处：压暗 + 轻微失焦
          const elev = 14 + 12 * depth;
          return (
            <div key={i} style={{
              position: 'absolute', left: x - (CW * s) / 2, top: y - (CH * s) / 2, width: CW * s, height: CH * s,
              borderRadius: 14, overflow: 'hidden', opacity: op, transform: `scale(${grow})`, zIndex: 10 + Math.round(depth * 5),
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${L.line}, 0 ${(elev * 0.6).toFixed(1)}px ${(elev * 1.6).toFixed(1)}px rgba(0,0,0,${(0.45 + 0.2 * depth).toFixed(2)})`,
              filter: far > 0.05 ? `blur(${(far * 1.6).toFixed(2)}px)` : undefined,
            }}>
              {/* 卡内按 960×540 作画再整体缩到卡宽——内容组件不需要知道自己被缩小了 */}
              <div style={{ position: 'absolute', left: 0, top: 0, width: 960, height: 540, transform: `scale(${(CW * s) / 960})`, transformOrigin: 'top left' }}>
                {i % 2 === 0 && imgs[i / 2] ? <ImgTile src={imgs[i / 2]!} /> : (
                  <Freeze frame={Math.max(0, frame - PLAY_START)}>
                    <Comp />
                  </Freeze>
                )}
              </div>
              {/* 纵深明暗：远处压暗、近处带一点顶光 */}
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(255,255,255,${(0.04 * Math.max(0, depth)).toFixed(3)}) 0%, rgba(5,6,4,${(0.5 * far).toFixed(3)}) 100%), rgba(5,6,4,${(0.25 * far).toFixed(3)})` }} />
            </div>
          );
        })}

        {/* 卡与标题之间的暗 scrim（在卡之上、字之下）：近处卡从标题背后经过时被压暗，字始终压得住 */}
        <div style={{ position: 'absolute', left: portrait ? 60 : 260, top: CY - titleH / 2 - (portrait ? 200 : 90), width: portrait ? 1800 : 1400, height: titleH + (portrait ? 400 : 180), zIndex: 25, background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha('#060705', 0.82)} 0%, ${alpha('#060705', 0.55)} 45%, ${alpha('#060705', 0)} 72%)` }} />

        {/* 标题：上行次级灰、下行主角大字 + 荧光马克 */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: titleTop, textAlign: 'center', zIndex: 30, ...titleExit }}>
          <div style={{ fontFamily: fonts.sans, fontSize: S1, fontWeight: 500, letterSpacing: '0.02em', color: '#b7bdaa', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
            {l1.map((ch, i) => <span key={i} style={charStyle(frame, 10 + i * step1, S1, 27)}>{ch}</span>)}
          </div>
          {hiRows.map((r, k) => (
            <div key={k}>
              <div style={{ marginTop: k ? hiGap : 34, display: 'inline-block', position: 'relative', fontFamily: fonts.sans, fontSize: S2, fontWeight: 600, letterSpacing: '0.01em', lineHeight: 1.12, whiteSpace: 'nowrap' }}>
                {/* 马克块：自左横扫铺满（垫在字下） */}
                <span aria-hidden style={{
                  position: 'absolute', left: '-0.14em', right: '-0.14em', top: '0.04em', bottom: '0.02em', background: LIME, borderRadius: 8,
                  transformOrigin: 'left center', transform: `scaleX(${r.mk.toFixed(4)})`, boxShadow: r.mk > 0.02 ? `0 0 60px ${alpha(LIME, 0.28)}` : undefined,
                }} />
                {/* 两层字：块的前沿左边是墨色、右边是白色——扫过即反白 */}
                <span style={{ position: 'relative', display: 'inline-block', clipPath: `inset(-20% 0 -20% ${r.clipL}%)`, color: INK }}>{r.render(INK)}</span>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, display: 'inline-block', clipPath: `inset(-20% ${r.clipR}% -20% 0)` }}>{r.render(L.onAccent)}</span>
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, whiteSpace: 'pre',
            opacity: kickerIn, transform: `translateY(${((1 - kickerIn) * 12).toFixed(2)}px)`,
          }}>
            {brand ? <ShotcraftMark size={kickFs * 1.7} tone="dark" /> : null}
            {brand?.name ? <span style={{ fontFamily: BRAND.font, fontSize: kickFs * 1.15, fontWeight: 700, letterSpacing: '0.03em', color: INK, lineHeight: 1 }}>{BRAND.name}</span> : null}
            {brand?.name && KICKER ? <span style={{ fontFamily: fonts.sans, fontSize: kickFs, fontWeight: 600, color: DIM, lineHeight: 1 }}>·</span> : null}
            {KICKER ? <span style={{ fontFamily: fonts.sans, fontSize: fitSize(KICKER, { family: fonts.sans, size: kickFs, maxWidth: maxW - (brand ? 500 : 0), weight: 600, letterSpacingEm: 0.2, minSize: 18 }), fontWeight: 600, letterSpacing: '0.2em', marginRight: '-0.2em', color: DIM, lineHeight: 1.2 }}>{KICKER}</span> : null}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
