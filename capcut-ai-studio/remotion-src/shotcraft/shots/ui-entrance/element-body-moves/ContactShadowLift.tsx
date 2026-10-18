// contact-shadow-lift｜接触阴影离面抬升
//
// 第二轮重设计（瓷白桌面 · 2.5D 斜俯拍 · 逐张点名）：
// - look = porcelain（冷白 + 钴蓝）。三张 440×580 竖版 video-shotcraft 镜头配方卡平躺在一张斜俯拍（rotateX ≈ 30°）的
//   瓷白桌面上：Whip pan 8f / Crash zoom 12f / Logo sting 24f（选定卡的图标位是 video-shotcraft 标志）。手法本身做成真的物理：
//   卡沿桌面法线 translateZ 抬起，阴影是另一层「躺在桌面 z=0 上」的实体——接触核（小而实、几乎贴边）
//   随抬升变大、变虚、变淡并向背光方向（右下）偏移；环境影（大而软）同步扩散。卡本体不带 box-shadow，
//   影子留在桌上，所以"纸片离桌"的距离是被阴影证明的，不是被缩放暗示的。
// - 节奏「扫—扫—选」：前两张是轻快的点名（抬 10f out-cubic → 悬停 14f → 落回 8f in-cubic + 2f 微压卡壳），
//   第三张是选定：抬得更慢更高（14f，弹簧落座、一次轻微过冲），停在空中不落回，钴蓝描边 + 对勾弹出，
//   成为结尾海报的唯一主角。一次只有一张离桌（P4），其余两张同步轻微压暗让位。
// - 相机：整段极缓的斜俯角回正（30°→26°）+ 跟随被点名的卡横移 ±40px（平滑，无速度突变）。
//
// 时间表（30fps，共 150f）：
//   0–16    预备：桌面、三卡已在位，标题逐词升起
//   16–50   点名 1：抬 16–26、悬停、落回 40–48、卡壳 48–50
//   50–84   点名 2：同上
//   86–100  选定 3：抬升 14f（spring damping 16，~3% 过冲），100f 起悬停呼吸
//   96–118  余波：钴蓝描边、对勾弹出（对勾描线）、节拍格同步染成钴蓝
//   118–150 hold：选定卡停在空中，极缓推镜
//
// [Agent Edit] o chu: kicker / title / labels (3 nhan the) / values (3 con so lon) / notes (3 cau mo ta). The thu 3 = lua
// chon duoc chon (vien mau nhan + dau tick). Bieu tuong o the 3 = ngoi sao trung tinh (khong con logo video-shotcraft).
// Chu dai ngan bat ky: nhan / so tu thu nho vua be ngang the; mo ta tu xuong dong (2 dong, dai hon -> co nho, 3 dong).
// Khung doc (portrait.mode = 'native'): 3 the xep DOC tren mat ban nghieng (the nam ngang 1400x640), camera theo the
// duoc diem ten theo truc doc; khung ngang giu bo cuc goc (3 the 420x600 thanh hang).
import { useCurrentFrame, useShotFonts, useList, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';

export const CONTACT_SHADOW_LIFT_DURATION = 150;

const L = LOOKS.porcelain;
const RADIUS = 30;

// ───────────── 抬升 ─────────────
const LIFT_Z = 96; // 沿桌面法线的抬升（屏幕上约 40–50px 的可见位移，远大于 28px 判例下限）
const LIFT_S = 1.05;
const SCANS = [16, 50]; // 前两张点名起点
const PICK = 86; // 第三张选定起点

const outCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const inCubic = (t: number) => Math.pow(Math.min(1, Math.max(0, t)), 3);

// 点名（会落回）：返回 lift 0→1→0 与缩放（含落地卡壳）
const scanMotion = (t: number) => {
  if (t < 0 || t >= 34) return { lift: 0, s: 1 };
  const up = outCubic(t / 10);
  const down = inCubic((t - 24) / 8);
  const lift = up - down;
  let s = 1 + (LIFT_S - 1) * lift;
  if (t >= 32) s = 0.99 + 0.01 * outCubic((t - 32) / 2); // 2f 微压卡壳后回到 1
  else if (t >= 31) s = 0.99;
  const hover = t >= 10 && t < 24 ? Math.sin(((t - 10) / 14) * Math.PI) : 0;
  return { lift: lift + 0.05 * hover, s };
};

// 选定（不落回）：弹簧抬起 + 悬停呼吸
const pickMotion = (f: number) => {
  if (f < PICK) return { lift: 0, s: 1 };
  const k = springAt(f, PICK, { damping: 16, stiffness: 120 });
  const breathe = f > PICK + 16 ? 0.04 * Math.sin(((f - PICK - 16) / 40) * Math.PI * 2) * ramp(f, PICK + 16, 20, EASE.smooth) : 0;
  const lift = 1.15 * k + breathe;
  return { lift, s: 1 + (LIFT_S - 1) * Math.min(1.2, k) };
};

const motionOf = (i: number, f: number) => (i < 2 ? scanMotion(f - SCANS[i]) : pickMotion(f));

// ───────────── 内容 ─────────────
type Focus = { tag: string; hours: string; note: string; days: number[]; glyph: 'whip' | 'zoom' | 'sting' };
const DAYS_ON = [
  [0, 1, 0, 1, 0, 0, 0],
  [1, 0, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 0, 0],
];
const GLYPHS: Focus['glyph'][] = ['whip', 'zoom', 'sting'];

// whip = 速度线、zoom = 取景角标；sting = 星标（[Agent Edit] 中性图标，替代 video-shotcraft 标志）
const Glyph: React.FC<{ kind: Focus['glyph']; color: string; size: number }> = ({ kind, color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    {kind === 'whip' && <path d="M3 8h11M6 12h14M3 16h11M16 8.5l4 3.5-4 3.5" />}
    {kind === 'zoom' && (<><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><circle cx={12} cy={12} r={2.4} /></>)}
    {kind === 'sting' && <path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" />}
  </svg>
);

const DAYS = ['1', '2', '3', '4', '5', '6', '7']; // 节拍号（沿用原变量名）

// 卡面几何（landscape = 原版竖卡；portrait = 横卡）
type Geo = { w: number; h: number; pad: [number, number]; icon: number; glyph: number; check: number; tag: number; value: number; note: number; cell: number; portrait: boolean };

const CardFace: React.FC<{ d: Focus; sel: number; check: number; g: Geo }> = ({ d, sel, check, g }) => {
  const fonts = useShotFonts();
  const tint = (a: number) => alpha(sel > 0.5 ? L.accent : L.ink, a);
  const innerW = g.w - g.pad[1] * 2;
  const tagW = g.portrait ? innerW - g.icon - g.check - 64 : innerW;
  const tagSize = fitSize(d.tag, { family: fonts.sans, size: g.tag, maxWidth: tagW, weight: 650, letterSpacingEm: 0.14, minSize: g.tag * 0.6 });
  const valueSize = fitSize(d.hours, { family: fonts.sans, size: g.value, maxWidth: innerW, weight: 780, letterSpacingEm: -0.055, minSize: g.value * 0.35 });
  // 说明：先按原字号折 2 行，放不下改小字号折 3 行
  let noteSize = g.note;
  let notes = wrapLines(d.note, fonts.sans, noteSize, innerW, 500, 99);
  if (notes.length > 2) {
    noteSize = Math.round(g.note * 0.8);
    notes = wrapLines(d.note, fonts.sans, noteSize, innerW, 500, 3);
    noteSize = Math.min(noteSize, ...notes.map((l) => fitSize(l, { family: fonts.sans, size: noteSize, maxWidth: innerW, weight: 500, minSize: noteSize * 0.7 })));
  }
  const checkEl = (
    <div style={{
      width: g.check, height: g.check, borderRadius: g.check / 2, background: L.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
      transform: `scale(${check.toFixed(4)})`, opacity: Math.min(1, check * 2), boxShadow: `0 8px 20px -6px ${alpha(L.accent, 0.7)}`,
    }}>
      <svg width={g.check * 0.52} height={g.check * 0.52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={22} strokeDashoffset={22 * (1 - Math.min(1, Math.max(0, check * 1.2 - 0.2)))} />
      </svg>
    </div>
  );
  const tagEl = (
    <div style={{ ...type(tagSize, 650), letterSpacing: '0.14em', color: L.ink2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{d.tag}</div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, padding: `${g.pad[0]}px ${g.pad[1]}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
        <div style={{
          width: g.icon, height: g.icon, borderRadius: g.icon * 0.275, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          background: tint(0.07), border: `1px solid ${tint(0.08)}`,
        }}>
          <Glyph kind={d.glyph} color={sel > 0.5 ? L.accent : L.ink2} size={g.glyph} />
        </div>
        {g.portrait ? <div style={{ flex: 1, minWidth: 0 }}>{tagEl}</div> : null}
        {checkEl}
      </div>
      {g.portrait ? null : <div style={{ marginTop: 40 }}>{tagEl}</div>}
      <div style={{ ...type(valueSize, 780), color: L.ink, letterSpacing: '-0.055em', marginTop: g.portrait ? 24 : 10, lineHeight: 1.08, whiteSpace: 'nowrap' }}>{d.hours}</div>
      <div style={{ ...type(noteSize, 500), color: L.ink2, marginTop: g.portrait ? 14 : 16, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
        {notes.map((l, k) => <div key={k} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
        {d.days.map((on, k) => (
          <div key={k} style={{
            flex: 1, height: g.cell, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: on ? (sel > 0.5 ? L.accent : alpha(L.ink, 0.82)) : alpha(L.ink, 0.05),
            color: on ? '#fff' : L.ink3, ...type(g.portrait ? 26 : 22, 650),
          }}>
            {DAYS[k]}
          </div>
        ))}
      </div>
    </div>
  );
};

// 逐词升起（遮罩留足越南语叠加声调的上下空间：上 0.32em / 下 0.26em）
const RiseWords: React.FC<{ text: string; start: number; each: number; gap: number }> = ({ text, start, each, gap }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {text.split(/\s+/).filter(Boolean).map((w, i) => {
        const p = ramp(frame, start + i * gap, each, EASE.snappy);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em 0.1em -0.26em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(${((1 - p) * 160).toFixed(2)}%)` }}>{w}</span>
          </span>
        );
      })}
    </>
  );
};

// ───────────── 主体 ─────────────
export const ContactShadowLift: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'SO SÁNH 3 LỰA CHỌN');
  const title = useText('title', 'Chọn gói phù hợp.');
  const tags = useList('labels', ['CƠ BẢN', 'NÂNG CAO', 'CHUYÊN NGHIỆP']);
  const values = useList('values', ['99K', '199K', '399K']);
  const noteList = useList('notes', ['Đủ dùng cho người mới bắt đầu.', 'Thêm báo cáo và tự động hoá.', 'Toàn bộ tính năng, hỗ trợ riêng.']);
  const CARDS: Focus[] = [0, 1, 2].map((i) => ({
    tag: tags[i] ?? '', hours: values[i] ?? '', note: noteList[i] ?? '', days: DAYS_ON[i], glyph: GLYPHS[i],
  }));

  // 版式：landscape = 原版三卡横排；portrait = 三张横卡竖排
  const g: Geo = portrait
    ? { w: 1400, h: 720, pad: [52, 60], icon: 108, glyph: 54, check: 78, tag: 42, value: 210, note: 56, cell: 56, portrait: true }
    : { w: 420, h: 600, pad: [44, 46], icon: 80, glyph: 40, check: 58, tag: 26, value: 160, note: 32, cell: 52, portrait: false };
  const GAP = portrait ? 64 : 60;
  const DESK_W = portrait ? g.w : 3 * g.w + 2 * GAP;
  const DESK_H = portrait ? 3 * g.h + 2 * GAP : g.h;

  // 标题：landscape 一行放不下 → 折两行；portrait 字号放大、最多 3 行
  const TS = portrait ? 180 : 120;
  const TW = portrait ? 1640 : 1700;
  let tLines = [title];
  let tSize = fitSize(title, { family: fonts.sans, size: TS, maxWidth: TW, weight: 760, minSize: 40 });
  if (tSize < TS * 0.8) {
    const sz = portrait ? TS : 78;
    tLines = wrapLines(title, fonts.sans, sz, TW, 760, portrait ? 3 : 2);
    tSize = Math.min(sz, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: sz, maxWidth: TW, weight: 760, minSize: 40 })));
  }
  const kSize = portrait ? 46 : 24;
  const titleTop = portrait ? Math.round(SH * 0.5 - (DESK_H * 1.08 + 110 + tLines.length * tSize * 1.15 + kSize + 30) / 2) : tLines.length > 1 ? 70 : 92;
  const titleBottom = titleTop + kSize + 18 + tLines.length * tSize * 1.15;
  const deskTop = portrait ? Math.round(titleBottom + 130) : 350;

  const motions = [0, 1, 2].map((i) => motionOf(i, frame));
  const lifts = motions.map((m) => Math.max(0, Math.min(1, m.lift)));

  // 相机：斜俯角缓慢回正 + 跟随被点名的卡平移（landscape 横移 / portrait 纵移）；选定后极缓推近
  const tilt = 24 - 4 * ramp(frame, 0, 150, EASE.smooth);
  const follow = lifts.reduce((acc, l, i) => acc + l * (1 - i) * 40, 0);
  const push = 1 + 0.025 * ramp(frame, PICK, 64, EASE.smooth);

  const sel = ramp(frame, PICK + 10, 10, EASE.out);
  const check = frame < PICK + 14 ? 0 : springAt(frame, PICK + 14, { damping: 13, stiffness: 220 });
  let wi = 0;
  const tGap = Math.min(4, 28 / Math.max(1, title.split(/\s+/).filter(Boolean).length)); // 词间隔按词数压密

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.05 }} fill={null} grain={0.045} vignette={0.2} />

      {/* 标题（屏幕空间，不进 3D） */}
      <div style={{ position: 'absolute', top: titleTop, left: 0, right: 0, textAlign: 'center' }}>
        {kicker ? (
          <div style={{ ...type(kSize, 600, { mono: true }), letterSpacing: '0.16em', color: L.ink3, opacity: ramp(frame, 0, 14, EASE.out), lineHeight: 1.3 }}>
            {kicker}
          </div>
        ) : null}
        <div style={{ ...type(tSize, 760), color: L.ink, marginTop: 18, lineHeight: 1.15 }}>
          {tLines.map((l, k) => {
            const start = 2 + wi * tGap;
            wi += l.split(/\s+/).filter(Boolean).length;
            return <div key={k} style={{ whiteSpace: 'nowrap' }}><RiseWords text={l} start={start} each={18} gap={tGap} /></div>;
          })}
        </div>
      </div>

      {/* 桌面：斜俯拍 3D 平面 */}
      <div style={{ position: 'absolute', inset: 0, perspective: 2600, perspectiveOrigin: portrait ? `50% ${deskTop + DESK_H * 0.45}px` : '50% 34%' }}>
        <div style={{
          position: 'absolute', left: (1920 - DESK_W) / 2, top: deskTop, width: DESK_W, height: DESK_H,
          transformStyle: 'preserve-3d',
          transform: `${portrait ? `translateY(${follow.toFixed(2)}px)` : `translateX(${follow.toFixed(2)}px)`} scale(${push.toFixed(5)}) rotateX(${tilt.toFixed(3)}deg)`,
          transformOrigin: '50% 60%',
        }}>
          {/* 桌面点阵：让"桌面"这个平面在斜俯拍下有实在的透视（远疏近密），四周渐隐 */}
          <div style={{
            position: 'absolute', left: -700, top: -520, width: DESK_W + 1400, height: DESK_H + 1000,
            backgroundImage: `radial-gradient(circle, ${alpha(L.ink, 0.13)} 1.6px, transparent 2.2px)`, backgroundSize: '44px 44px',
            backgroundPosition: '-6px 14px',
            WebkitMaskImage: 'radial-gradient(ellipse 50% 50% at 50% 52%, #000 30%, transparent 78%)',
          }} />
          {CARDS.map((d, i) => {
            const { lift, s } = motions[i];
            const l = Math.max(0, lift);
            const x = portrait ? 0 : i * (g.w + GAP);
            const y = portrait ? i * (g.h + GAP) : 0;
            const others = Math.max(0, ...lifts.filter((_, k) => k !== i));
            const box: React.CSSProperties = { position: 'absolute', left: x, top: y, width: g.w, height: g.h, borderRadius: RADIUS };
            return (
              <React.Fragment key={i}>
                {/* 环境影：桌面上的大而软的影，随抬升扩散、偏向背光侧（右下） */}
                <div style={{
                  ...box,
                  background: alpha(L.shadow, 0.09 + 0.13 * l),
                  filter: `blur(${(14 + 40 * l).toFixed(1)}px)`,
                  transform: `translate3d(${(10 + 40 * l).toFixed(1)}px, ${(16 + 60 * l).toFixed(1)}px, 0.5px) scale(${(1.0 + 0.06 * l).toFixed(4)})`,
                }} />
                {/* 接触核：贴边小而实，抬起后变大、变虚、变淡 */}
                <div style={{
                  ...box,
                  background: alpha(L.shadow, 0.32 - 0.18 * l),
                  filter: `blur(${(3 + 22 * l).toFixed(1)}px)`,
                  transform: `translate3d(${(2 + 18 * l).toFixed(1)}px, ${(4 + 36 * l).toFixed(1)}px, 1px) scale(${(0.99 + 0.05 * l).toFixed(4)})`,
                }} />
                {/* 卡本体：沿法线抬起，不带 box-shadow（影子留在桌上） */}
                <div style={{
                  ...box, overflow: 'hidden',
                  transform: `translate3d(0, 0, ${(2 + LIFT_Z * lift).toFixed(2)}px) scale(${s.toFixed(4)})`,
                  background: 'linear-gradient(180deg, #ffffff 0%, #f8faff 100%)',
                  border: `1px solid ${alpha(L.ink, 0.07)}`, boxSizing: 'border-box',
                  boxShadow: `inset 0 1px 0 #ffffff${i === 2 ? `, inset 0 0 0 ${(3 * sel).toFixed(2)}px ${L.accent}` : ''}`,
                }}>
                  <CardFace d={d} sel={i === 2 ? sel : 0} check={i === 2 ? check : 0} g={g} />
                  {/* 让位压暗：别的卡离桌时本卡轻微沉下去 */}
                  <div style={{ position: 'absolute', inset: 0, background: alpha('#dfe5ef', 1), opacity: others * 0.22, mixBlendMode: 'multiply' }} />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

    </AbsoluteFill>
  );
};
