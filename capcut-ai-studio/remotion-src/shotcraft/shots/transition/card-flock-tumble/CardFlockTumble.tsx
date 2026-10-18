// card-flock-tumble —— 三张 UI 页卡从侧棱薄边 3D 翻飞成阶梯站定（一条 Catmull-Rom 样条，全程清晰），
// 站定后保持慢转不停，10f 加速吸入中心，炸出单个湍流烟雾环扩散，巨字横贯收场。
// 用户历次裁决全部保留：三卡全程零模糊；烟雾环只有一个、湍流絮边、衰减极慢；站定后不许停；收束要快；不加粒子。
//
// 第二轮重设计（设计决定）
// - look = aurora（紫粉极光暗场）。整片收成一套色：卡片环境辉光、背景字墙、烟雾环、巨字全部落在
//   紫 → 粉 → 奶桃这一条色带上，去掉原来黄 / 品红 / 紫 / 蓝四色彩虹，能量感靠亮度和运动，不靠色数。
// - 背景：彩虹描边字墙换成两行 300px 单色描边「CRAFT THE SHOT」反向缓移（淡紫 0.16），卡后一团极光
//   主光把卡片群托起来；收束时字墙随吸入向中心收缩并淡出（不糊卡片）。
// - 构图：卡片群重心移回画面中心偏下（原版偏左上），收束点 = 环心 = 巨字中心，一条视线。
// - 节奏：去掉原版 72–84f 的黑场空档——吸入到点（70f）同一帧中心一记白热闪核（6f 衰减），环从闪核里
//   长出；巨字 74f 就"砸"进来（1.22 → 1，snappy 14f + 字距收拢），之后极缓长大不停；眉题 / 标语随后错峰。
// - 巨字改成实心：白热芯 → 淡紫的竖向渐变填充 + 粉紫泛光（全片唯一的泛光主角，Q4），
//   上方 video-shotcraft 标志 + 字标眉题、下方 44px 品牌短句，结尾是一张完整的发布海报。
// - 卡片 UI = video-shotcraft 工作台（收件箱 / 镜头列表 / 首页），按 CARD_ZOOM 布局级放大栅格化（Q2）。
//
// 时间表（30fps，135f）
//   0–22    字墙亮起（6–22f），第一张卡侧棱薄边已在画面
//   10–54   翻飞：侧棱 → 翻飞 → 阶梯站定（样条 + out cubic）
//   46–62   站定慢转（ry +0.34°/f，不停）
//   62–72   收束：10f ease-in 吸入中心缩小；字墙同步向心收缩淡出
//   70–76   闪核：白热核 + 全屏微曝，6f 衰减
//   70–135  烟雾环：减速外扩 → 全程缓慢长大，衰减极慢
//   74–88   巨字砸入（snappy）→ 之后极缓长大；84f 眉题、92f 标语逐词升起
//   106–135 hold：环继续长、字极缓推近，尾帧是海报
//
// [Agent Edit] o chu: title (chu khong lo cuoi + tuong chu vien nen), kicker (dong nho tren chu lon; co thuong hieu thi
// kem dau hieu), subtitle (cau phu duoi), labels (3 ten trang tren 3 the giao dien). O anh tuy chon screen1..3: anh chup
// man hinh that phu kin tung the (cover, canh tren) — khong co thi ve giao dien gia (chu tieng Viet trung tinh).
// Chu lon: do be ngang that, qua dai -> thu nho / 2 dong. Khung doc (native): ca cum (the, vong khoi, chu) phong to P
// lan quanh tam khung, tuong chu nen phu kin chieu cao.
import { useCurrentFrame, useVideoConfig, useText, useList, useImage, useShotFonts, useBackdrop, fitSize, wrapLines, measureText } from '../../../runtime';
import React, { useId } from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { EASE, FONT, Grain, Vignette, ramp, mix } from '../../../fixtures/Polish';
import { LOOKS, TextReveal, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

const L = LOOKS.aurora;

// ---------- 时间轴 ----------
export const CARD_FLOCK_TUMBLE_DURATION = 135;
const WALL_UP = [6, 22] as const; // 字墙亮起
const FLIGHT = [10, 54] as const; // 侧棱→翻飞→站定：一条连续样条
const CARD_OUT = [62, 72] as const; // 收束（快！10 帧向中心聚拢）
const RING_T0 = 70; // 烟雾环自收束点扩散（= 闪核帧）
const TEXT_T0 = 74; // 巨字砸入
const CY_OFF = 30; // 卡片群 / 收束点相对画面中心的下移（构图重心）

// ---------- 背景：单色描边字墙 + 极光主光 ----------
const Backdrop: React.FC<{ frame: number; word: string; SH: number; cy: number }> = ({ frame, word, SH, cy }) => {
  const up = interpolate(frame, [WALL_UP[0], WALL_UP[1]], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out });
  const k = ramp(frame, CARD_OUT[0], CARD_OUT[1] - CARD_OUT[0] + 4, EASE.exit); // 收束：向心收 + 淡出
  const wallOp = up * (1 - k);
  const drift = frame * 2.4;
  // 收束后极光主光换成环后的一团余辉
  const bloomA = mix(0.5, 0.32, ramp(frame, CARD_OUT[0], 14, EASE.smooth));
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${L.bg[0]} 0%, ${L.bg[1]} 55%, ${L.bg[2]} 100%)`, overflow: 'hidden' }}>
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse ${SH > 1300 ? '70% 30%' : '46% 52%'} at 50% ${((cy / SH) * 100).toFixed(1)}%, ${alpha(L.light, bloomA)} 0%, ${alpha(L.accent2, bloomA * 0.28)} 40%, ${alpha(L.light, 0)} 72%)`,
      }} />
      {wallOp > 0.01 && (
        <AbsoluteFill style={{ opacity: wallOp, transform: `scale(${mix(1, 0.7, k).toFixed(4)})`, transformOrigin: `50% ${cy}px` }}>
          {/* 字墙 = 巨字本身的描边重复；竖屏铺满整个高度（行数按高度算） */}
          {Array.from({ length: SH > 1300 ? 6 : 2 }, (_, row) => (
            <div key={row} style={{
              position: 'absolute', top: SH > 1300 ? 120 + row * 540 : row === 0 ? 60 : 640, left: 0, whiteSpace: 'nowrap',
              fontFamily: FONT.sans, fontWeight: 900, fontStyle: 'italic', fontSize: 300, letterSpacing: '-0.02em', lineHeight: 1.3,
              transform: `translateX(${((row % 2 === 0 ? -1 : 1) * drift - (row % 2 === 0 ? 300 : 1400)).toFixed(1)}px)`,
              color: 'transparent', WebkitTextStroke: `2.5px ${alpha('#d9c8ff', row % 2 === 0 ? 0.18 : 0.12)}`,
            }}>
              {Array(Math.max(3, Math.ceil(9 / Math.max(1, word.length / 6)))).fill(word.toUpperCase()).join('  ·  ')}
            </div>
          ))}
        </AbsoluteFill>
      )}
      {/* 地平线余光 */}
      <div style={{
        position: 'absolute', left: '-10%', right: '-10%', top: '74%', height: '30%',
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent, 0.12)} 0%, ${alpha(L.accent, 0)} 70%)`,
      }} />
    </AbsoluteFill>
  );
};

// ---------- video-shotcraft UI 卡（出版级假内容：侧栏导航 + 三种页面——收件箱 / 镜头列表 / 首页） ----------
// 卡片在 3D 里放大到 1.6–1.74 倍：按 CARD_ZOOM 布局级放大（CSS zoom，按目标尺寸栅格化），
// 外层再 scale(s / CARD_ZOOM) 缩回——文字不是 560 宽位图被放大的糊字（Q2）。
const CARD_ZOOM = 1.75;
const UI = {
  get sans() { return FONT.sans; },
  ink: '#17132a', ink2: '#5d5873', ink3: '#9a95ad', line: 'rgba(40,24,80,0.08)', fill: '#f5f3fb',
  violet: '#7c5cf6', pink: '#ec5fae', sky: '#5b8cff', mint: '#2fbf9b', amber: '#f0a23b',
};
const AV_COLORS = [UI.violet, UI.pink, UI.sky, UI.mint, UI.amber];
const Av: React.FC<{ t: string; i: number; size?: number }> = ({ t, i, size = 22 }) => (
  <div style={{
    width: size, height: size, borderRadius: size / 2, flex: 'none', background: AV_COLORS[i % AV_COLORS.length],
    color: '#fff', fontSize: size * 0.4, fontWeight: 650, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 0 1.5px #fff', letterSpacing: '0.02em',
  }}>{t}</div>
);
const Chip: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
  <div style={{
    height: 19, padding: '0 8px', borderRadius: 6, fontSize: 10, fontWeight: 650, display: 'flex', alignItems: 'center',
    gap: 4, color: c, background: `${c}1c`, whiteSpace: 'nowrap', flex: 'none',
  }}>
    <div style={{ width: 5, height: 5, borderRadius: 3, background: c }} />{children}
  </div>
);
// 侧栏：第 0 项 = 首页（卡 2），第 1 项 = 收件箱（卡 0），第 2 项 = 列表（卡 1）——卡标题写进对应项
const NAV = ['Trang chủ', 'Hộp thư', 'Công việc', 'Báo cáo', 'Thư viện'];
const NAV_OF = [1, 2, 0];
const INBOX = [
  ['AN', 'An Nguyễn', 'Đã duyệt bản thiết kế mới', '2 phút'],
  ['MT', 'Minh Trần', 'Hôm nay mình chốt kế hoạch nhé?', '9 phút'],
  ['LH', 'Linh Hoàng', 'Giao cho bạn “Báo cáo quý”', '24 phút'],
  ['QP', 'Quân Phạm', 'Đã để lại ghi chú cho bạn', '1 giờ'],
  ['TV', 'Thảo Vũ', 'Đã duyệt nội dung tuần này', '2 giờ'],
];
const DONE = 'Xong';
const TASKS: [string, string, string][] = [
  ['Thiết kế trang chủ', DONE, UI.mint],
  ['Viết nội dung', 'Đang làm', UI.violet],
  ['Quay video', 'Đang làm', UI.violet],
  ['Chạy quảng cáo', 'Cần làm', UI.amber],
  ['Tổng kết số liệu', 'Cần làm', UI.amber],
];
const PageBody: React.FC<{ seed: number }> = ({ seed }) => {
  if (seed === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {INBOX.map(([t, n, m, ago], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, borderBottom: `1px solid ${UI.line}` }}>
            <Av t={t} i={i} size={27} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 650, color: UI.ink }}>{n}</div>
              <div style={{ fontSize: 11, color: UI.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m}</div>
            </div>
            <div style={{ fontSize: 10, color: UI.ink3, fontVariantNumeric: 'tabular-nums' }}>{ago}</div>
            {i < 2 && <div style={{ width: 6, height: 6, borderRadius: 3, background: UI.violet }} />}
          </div>
        ))}
      </div>
    );
  }
  if (seed === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 9, fontWeight: 650, color: UI.ink3, letterSpacing: '0.08em', height: 24, alignItems: 'center', borderBottom: `1px solid ${UI.line}` }}>
          <span style={{ flex: 1, paddingLeft: 25 }}>VIỆC</span><span style={{ width: 96 }}>TRẠNG THÁI</span><span style={{ width: 28 }} />
        </div>
        {TASKS.map(([name, st, c], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 42, borderBottom: `1px solid ${UI.line}` }}>
            <div style={{
              width: 14, height: 14, borderRadius: 7, marginRight: 11, flex: 'none',
              border: st === DONE ? 'none' : `1.5px solid ${UI.ink3}`, background: st === DONE ? UI.mint : 'transparent',
            }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 550, color: st === DONE ? UI.ink3 : UI.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ width: 96 }}><Chip c={c}>{st}</Chip></div>
            <Av t={INBOX[(i + 2) % 5][0]} i={i + 2} size={21} />
          </div>
        ))}
      </div>
    );
  }
  const bars = [0.42, 0.66, 0.5, 0.82, 0.58, 0.94, 0.72];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: UI.fill, borderRadius: 10, padding: '11px 13px', boxShadow: `inset 0 0 0 1px ${UI.line}` }}>
          <div style={{ fontSize: 10, color: UI.ink3, fontWeight: 650 }}>Hoàn thành tuần này</div>
          <div style={{ fontSize: 30, fontWeight: 750, color: UI.ink, letterSpacing: '-0.035em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>12</div>
          <div style={{ fontSize: 10, color: UI.mint, fontWeight: 650 }}>Vượt kế hoạch 4 việc</div>
        </div>
        <div style={{ flex: 1.4, background: UI.fill, borderRadius: 10, padding: '11px 13px', boxShadow: `inset 0 0 0 1px ${UI.line}` }}>
          <div style={{ fontSize: 10, color: UI.ink3, fontWeight: 650 }}>Tiến độ</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 54, marginTop: 6 }}>
            {bars.map((h, i) => (
              <div key={i} style={{
                flex: 1, height: `${h * 100}%`, borderRadius: 3,
                background: i === 5 ? `linear-gradient(180deg, ${UI.pink}, ${UI.violet})` : 'rgba(124,92,246,0.2)',
              }} />
            ))}
          </div>
        </div>
      </div>
      {TASKS.slice(1, 4).map(([name, st, c], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 27 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: c }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 550, color: UI.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <Chip c={c}>{st}</Chip>
        </div>
      ))}
    </div>
  );
};
const UiCard: React.FC<{ seed: number; title: string; img?: string }> = ({ seed, title, img }) => (
  img ? (
    // 真实截图：铺满整张卡（cover、顶对齐——截图的顶部通常是标题栏 / 导航）
    <div style={{
      width: 560, height: 400, borderRadius: 16, overflow: 'hidden', background: '#f4f2fa',
      boxShadow: `inset 0 1px 0 #ffffff, 0 0 0 1px ${alpha('#d6c4ff', 0.4)}, 0 0 70px ${alpha(L.light, 0.32)}, 0 26px 70px rgba(4,1,12,0.6)`,
    }}>
      <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0%', display: 'block' }} />
    </div>
  ) : <div
    style={{
      width: 560, height: 400, borderRadius: 16, boxSizing: 'border-box', display: 'flex', overflow: 'hidden', fontFamily: UI.sans,
      background: 'linear-gradient(180deg, #ffffff 0%, #faf8ff 100%)',
      // 极光场的紫色环境辉光 + 落地暗影 + 顶部受光内高光 + 1px 发丝外框
      boxShadow: `inset 0 1px 0 #ffffff, 0 0 0 1px ${alpha('#d6c4ff', 0.4)}, 0 0 70px ${alpha(L.light, 0.32)}, 0 26px 70px rgba(4,1,12,0.6)`,
    }}
  >
    <div style={{ width: 118, background: '#f4f2fa', padding: '15px 10px', display: 'flex', flexDirection: 'column', gap: 3, borderRight: `1px solid ${UI.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 4px 11px' }}>
        <ShotcraftMark size={17} tone="light" />
        <div style={{ fontSize: 12, fontWeight: 800, color: UI.ink, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{BRAND.short || 'Dự án'}</div>
      </div>
      {NAV.map((n0, i) => {
        const on = i === NAV_OF[seed];
        const n = on ? title : n0;
        return (
          <div key={n} style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 25, padding: '0 6px', borderRadius: 6,
            background: on ? 'rgba(124,92,246,0.12)' : 'transparent', color: on ? UI.violet : UI.ink2,
            fontSize: 11, fontWeight: on ? 650 : 500, whiteSpace: 'nowrap', overflow: 'hidden',
          }}>
            <div style={{ width: 9, height: 9, flex: 'none', borderRadius: i % 2 ? 5 : 2.5, border: `1.5px solid ${on ? UI.violet : UI.ink3}` }} />
            {n}
          </div>
        );
      })}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
        <Av t="JL" i={2} size={18} />
        <div style={{ fontSize: 10, color: UI.ink2 }}>Linh Hoàng</div>
      </div>
    </div>
    <div style={{ flex: 1, padding: '17px 20px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: fitSize(title, { family: FONT.sans, size: 27, maxWidth: 200, weight: 800, minSize: 15 }), color: UI.ink, letterSpacing: '-0.035em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{title}</div>
        <div style={{ marginLeft: 'auto', display: 'flex' }}>
          {[0, 1, 2].map((j) => <div key={j} style={{ marginLeft: j ? -5 : 0 }}><Av t={INBOX[(j + seed) % 5][0]} i={j + seed} size={20} /></div>)}
        </div>
        <div style={{
          height: 23, padding: '0 10px', borderRadius: 7, background: UI.violet, color: '#fff', fontSize: 10.5, fontWeight: 650,
          display: 'flex', alignItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
        }}>+ Mới</div>
      </div>
      <div style={{ fontSize: 11, color: UI.ink3, marginTop: -6 }}>
        {seed === 0 ? '5 chưa đọc · Hôm nay' : seed === 1 ? 'Dự án ra mắt · 5 việc' : 'Chào buổi sáng, Linh'}
      </div>
      <PageBody seed={seed} />
    </div>
  </div>
);

// ---------- 闪核：吸入到点同一帧的白热核 + 一层全屏微曝（6f 衰减；不画几何描边环、不加粒子） ----------
const CoreFlash: React.FC<{ frame: number; cy: number; P: number }> = ({ frame, cy, P }) => {
  const t = frame - RING_T0;
  if (t < -1 || t > 14) return null;
  const a = t < 0 ? 0.4 : Math.exp(-t / 3.2);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      <div style={{
        position: 'absolute', left: 960 - 420 * P, top: cy - 420 * P, width: 840 * P, height: 840 * P, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,250,255,${a.toFixed(3)}) 0%, rgba(255,226,246,${(0.85 * a).toFixed(3)}) 9%, ${alpha(L.accent2, 0.45 * a)} 22%, ${alpha(L.light, 0.22 * a)} 44%, ${alpha(L.light, 0)} 70%)`,
      }} />
      <AbsoluteFill style={{ background: alpha('#f3e6ff', 0.12 * a) }} />
    </AbsoluteFill>
  );
};

// ---------- 单个湍流烟雾环 ----------
// 形态（用户对照原片定稿）：只有一个环；边缘破碎起絮（湍流位移）、环身明暗斑块交错；
// 紫粉为主、顶部奶桃色；出现后减速外扩且全程缓慢长大；衰减极慢（弥散变淡而非熄灭）；中心无水面光。
const SmokeRing: React.FC<{ frame: number; cy: number; P: number; SH: number }> = ({ frame, cy, P, SH }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = frame - RING_T0;
  if (t < 0) return null;
  const grow = Easing.out(Easing.cubic)(Math.min(1, t / 52));
  const R = (46 + 330 * grow + Math.max(0, t - 52) * 1.6) * P;
  const op = interpolate(t, [0, 4, 30, 60], [0, 1, 0.94, 0.76], { extrapolateRight: 'clamp' });
  const w = R * interpolate(t, [0, 52], [0.36, 0.27], { extrapolateRight: 'clamp' });
  const disp = (60 + grow * 90) * P;
  const rot = t * 0.35;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', mixBlendMode: 'screen' }}>
      <svg width={1920} height={SH} viewBox={`0 0 1920 ${SH}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <filter id={`smokeA-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feTurbulence type="fractalNoise" baseFrequency="0.013 0.016" numOctaves={4} seed={11} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={disp} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id={`smokeB-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feTurbulence type="fractalNoise" baseFrequency="0.021 0.018" numOctaves={4} seed={37} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={disp * 0.85} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id={`smokeC-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feTurbulence type="fractalNoise" baseFrequency="0.019 0.023" numOctaves={3} seed={73} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={disp * 1.1} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* 顶部奶桃 → 粉 → 紫的环身渐变（aurora 色带） */}
          <linearGradient id={`ringGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsla(24 80% 82% / 0.92)" />
            <stop offset="38%" stopColor="hsla(322 78% 72% / 0.9)" />
            <stop offset="100%" stopColor="hsla(262 80% 66% / 0.9)" />
          </linearGradient>
        </defs>
        <g transform={`rotate(${rot} 960 ${cy})`} opacity={op}>
          <g style={{ filter: `url(#smokeA-${uid})` }}>
            <circle cx={960} cy={cy} r={R} fill="none" stroke="hsla(285 70% 62% / 0.3)" strokeWidth={w * 1.9} style={{ filter: `blur(${22 * P}px)` }} />
          </g>
          <g style={{ filter: `url(#smokeA-${uid})` }}>
            <circle cx={960} cy={cy} r={R} fill="none" stroke={`url(#ringGrad-${uid})`} strokeWidth={w} style={{ filter: `blur(${9 * P}px)` }} opacity={0.88} />
          </g>
          <g style={{ filter: `url(#smokeB-${uid})` }}>
            <circle cx={960} cy={cy} r={R * 0.99} fill="none" stroke="hsla(318 90% 90% / 0.62)" strokeWidth={w * 0.42} style={{ filter: `blur(${6 * P}px)` }} />
          </g>
          <g style={{ filter: `url(#smokeC-${uid})` }}>
            <circle cx={960} cy={cy} r={R * 1.005} fill="none" stroke="hsla(262 50% 8% / 0.4)" strokeWidth={w * 0.4} style={{ filter: `blur(${7 * P}px)` }} />
          </g>
        </g>
      </svg>
    </AbsoluteFill>
  );
};

// ---------- 卡片位姿：Catmull-Rom 样条连续插值（真 3D 丝滑转动） ----------
type Pose = { x: number; y: number; rx: number; ry: number; rz: number; s: number };
const POSE_KEYS: (keyof Pose)[] = ['x', 'y', 'rx', 'ry', 'rz', 's'];

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
const splinePose = (keys: Pose[], u: number): Pose => {
  const seg = u < 0.55 ? 0 : 1;
  const lt = seg === 0 ? u / 0.55 : (u - 0.55) / 0.45;
  const out = {} as Pose;
  for (const k of POSE_KEYS) {
    out[k] = catmull(keys[Math.max(0, seg - 1)][k], keys[seg][k], keys[seg + 1][k], keys[Math.min(2, seg + 2)][k], lt);
  }
  return out;
};

// 三卡：k0 侧棱（近 90° 薄边）→ k1 翻飞中段 → k2 阶梯站定（大幅重叠成一叠，s 1.6–1.74）
const CARDS: { title: string; k: [Pose, Pose, Pose]; conv: Pose }[] = [
  {
    title: 'Hộp thư',
    k: [
      { x: -8, y: -16, rx: 9, ry: 88, rz: 12, s: 1.05 },
      { x: -135, y: -92, rx: 16, ry: 44, rz: -8, s: 1.38 },
      { x: -108, y: -76, rx: 4, ry: 13, rz: -2, s: 1.62 },
    ],
    conv: { x: -20, y: -12, rx: 0, ry: 55, rz: 4, s: 0.12 },
  },
  {
    title: 'Công việc',
    k: [
      { x: 0, y: 0, rx: 8, ry: 89, rz: 12, s: 1.0 },
      { x: -16, y: -7, rx: 13, ry: 38, rz: -7, s: 1.42 },
      { x: -5, y: -2, rx: 3, ry: 11, rz: -2, s: 1.68 },
    ],
    conv: { x: 0, y: 0, rx: 0, ry: 60, rz: 4, s: 0.12 },
  },
  {
    title: 'Tổng quan',
    k: [
      { x: 8, y: 16, rx: 7, ry: 90, rz: 12, s: 0.95 },
      { x: 112, y: 78, rx: 11, ry: 34, rz: -6, s: 1.46 },
      { x: 90, y: 70, rx: 2, ry: 9, rz: -1, s: 1.74 },
    ],
    conv: { x: 15, y: 10, rx: 0, ry: 65, rz: 4, s: 0.12 },
  },
];
const lerpPose = (a: Pose, b: Pose, t: number): Pose => {
  const out = {} as Pose;
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
};

// 站定后慢转（不许停，平方缓入避免与样条衔接顿挫），收束从漂移后姿态出发
const idleAt = (f: number) => {
  const t = Math.min(f, CARD_OUT[0]) - FLIGHT[1] * 0.86;
  if (t <= 0) return { ry: 0, rx: 0, rz: 0 };
  const r = Math.min(1, t / 14) ** 2;
  return { ry: t * 0.34 * r, rx: t * -0.1 * r, rz: t * 0.05 * r };
};

export const CardFlockTumble: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const P = portrait ? 1.45 : 1; // 竖屏：整组（卡片 / 环 / 闪核）放大
  const cy = SH / 2 + CY_OFF * P; // 卡片群 = 收束点 = 环心 = 巨字中心
  const title = useText('title', 'ĐỘT PHÁ');
  const kicker = useText('kicker', 'Bản cập nhật mới');
  const sub = useText('subtitle', 'Mọi công cụ bạn cần, gói gọn trong một ứng dụng.');
  const labels = useList('labels', ['Hộp thư', 'Công việc', 'Tổng quan']);
  const imgs = [useImage('screen1'), useImage('screen2'), useImage('screen3')];
  const brandOn = !!(BRAND.name);

  // 巨字版式：实测宽度；单行太小则均衡折两行
  const BIG0 = portrait ? 300 : 282;
  const bigW = portrait ? 1740 : 1600;
  const bw = (t: string, fs: number) => measureText(t, fonts.sans, fs, 900, true) * 1.04 - Math.max(0, t.length - 1) * 0.025 * fs;
  let bigLines = [title.trim()];
  let bigFs = Math.min(BIG0, (BIG0 * bigW) / bw(title.trim(), BIG0));
  if (bigFs < BIG0 * 0.62 && /\s/.test(title.trim())) {
    let lo = 0, hi = bw(title, BIG0);
    let best = wrapLines(title, fonts.sans, BIG0, hi, 900, 2);
    for (let it = 0; it < 16; it++) {
      const mid = (lo + hi) / 2;
      const ls = wrapLines(title, fonts.sans, BIG0, mid, 900, 99);
      if (ls.length <= 2) { best = ls; hi = mid; } else lo = mid;
    }
    const f2 = Math.min(BIG0 * 0.86, ...best.map((l) => (BIG0 * 0.86 * bigW) / bw(l, BIG0 * 0.86)));
    if (f2 > bigFs) { bigLines = best; bigFs = f2; }
  }
  const bigLH = bigFs * 1.12;
  const bigH = bigLines.length * bigLH;
  const kickFs = portrait ? 46 : 30;
  const kickSize = kicker.trim() ? fitSize(kicker, { family: fonts.sans, size: kickFs, maxWidth: bigW - (brandOn ? 80 * P : 0), weight: 700, minSize: 22, letterSpacingEm: 0.12 }) : kickFs;
  const subFs = portrait ? 66 : 44;
  const subLines = sub.trim() ? wrapLines(sub, fonts.sans, subFs, portrait ? 1640 : 1560, 500, 2) : [];
  const subSize = Math.min(subFs, ...subLines.map((l) => fitSize(l, { family: fonts.sans, size: subFs, maxWidth: portrait ? 1720 : 1700, weight: 500, minSize: 28 })));
  const subWords = sub.split(/\s+/).filter(Boolean).length;
  const subGap = Math.min(3, 18 / Math.max(1, subWords - 1));

  // 巨字：14f snappy 从 1.22 砸到 1、字距同步收拢，之后极缓长大（不停在死帧上）
  const st = frame - TEXT_T0;
  const slam = ramp(frame, TEXT_T0, 14, EASE.snappy);
  const textScale = mix(1.22, 1, slam) + Math.max(0, st - 14) * 0.0008;
  const textOp = ramp(frame, TEXT_T0, 5, EASE.out);
  const glowK = 0.6 + 0.4 * Math.exp(-Math.max(0, st) / 10); // 落地一瞬泛光更亮，随后回落
  const tracking = mix(0.06, -0.025, slam);
  const kickTop = cy - Math.max(bigH / 2 + kickSize * 1.4 + 40 * P, portrait ? 300 : 262) - kickSize * 0.6;
  const subTop = cy + Math.max(bigH / 2 + 40, portrait ? 270 : 200 - CY_OFF);
  // [Agent Edit] DOT 2: co nen anh AI -> bo nen code (gradient cuc quang, tuong chu vien, quang sang, toi goc, hat);
  // chu nam truc tiep tren anh -> bong toi nhe
  const bd = useBackdrop();
  const halo = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[2] }}>
      {!bd && <Backdrop frame={frame} word={title.trim() || 'ĐỘT PHÁ'} SH={SH} cy={cy} />}

      {/* 卡片群（全程清晰：无 blur） */}
      {frame < CARD_OUT[1] + 2 && (
        <AbsoluteFill style={{ transform: `translateY(${(cy - SH / 2).toFixed(1)}px) scale(${P})` }}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', perspective: 1400 }}>
            {CARDS.map((c, i) => {
              let pose: Pose;
              let op = 1;
              const drift = idleAt(frame);
              if (frame < FLIGHT[0]) {
                pose = c.k[0];
              } else if (frame < CARD_OUT[0]) {
                const raw = Math.min(1, (frame - FLIGHT[0]) / (FLIGHT[1] - FLIGHT[0]));
                pose = splinePose(c.k, Easing.out(Easing.cubic)(raw));
                pose = { ...pose, ry: pose.ry + drift.ry, rx: pose.rx + drift.rx, rz: pose.rz + drift.rz };
              } else {
                // 收束：10 帧 ease-in 加速向中心聚拢缩小；透明度前 55% 满格，"吸入"清晰可读
                const r = Math.min(1, (frame - CARD_OUT[0]) / (CARD_OUT[1] - CARD_OUT[0]));
                const e = Easing.in(Easing.quad)(r);
                const from = { ...c.k[2], ry: c.k[2].ry + drift.ry, rx: c.k[2].rx + drift.rx, rz: c.k[2].rz + drift.rz };
                pose = lerpPose(from, c.conv, e);
                op = 1 - Easing.in(Easing.cubic)(Math.max(0, (r - 0.55) / 0.45));
              }
              return (
                <div key={i} style={{
                  position: 'absolute', opacity: op, zIndex: 10 + i,
                  transform: `translate3d(${pose.x}px, ${pose.y}px, 0) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg) rotateZ(${pose.rz}deg) scale(${pose.s / CARD_ZOOM})`,
                }}>
                  <div style={{ zoom: CARD_ZOOM, position: 'relative' }}>
                    <UiCard seed={i} title={labels[i] || c.title} img={imgs[i]} />
                    {/* 叠层景深：后排卡压暗一档 */}
                    {i < 2 && (
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: '#140b26', opacity: i === 0 ? 0.2 : 0.1, pointerEvents: 'none' }} />
                    )}
                  </div>
                </div>
              );
            })}
          </AbsoluteFill>
        </AbsoluteFill>
      )}

      <SmokeRing frame={frame} cy={cy} P={P} SH={SH} />
      <CoreFlash frame={frame} cy={cy} P={P} />

      {/* 巨字锁版：眉题 / 实心巨字 / 标语 */}
      {st >= 0 && (
        <AbsoluteFill style={{ textShadow: halo }}>
          {kicker.trim() || brandOn ? (
            <div style={{ position: 'absolute', top: kickTop, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18 * P, whiteSpace: 'nowrap' }}>
              {brandOn ? <ShotcraftMark size={50 * P} tone="dark" frameProgress={ramp(frame, TEXT_T0 + 8, 12, EASE.out)} cutProgress={ramp(frame, TEXT_T0 + 14, 10, EASE.out)} /> : null}
              <div style={{ ...type(kickSize, 700), fontFamily: fonts.sans, color: '#f1e9ff', letterSpacing: '0.12em', lineHeight: 1.4 }}>
                <TextReveal text={kicker.trim() || BRAND.name} by="char" variant="blur" start={TEXT_T0 + 10} each={12} gap={Math.min(0.9, 14 / Math.max(1, (kicker.trim() || BRAND.name).length))} />
              </div>
            </div>
          ) : null}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: cy - bigH / 2, display: 'flex', flexDirection: 'column', alignItems: 'center',
            opacity: textOp, transform: `scale(${textScale.toFixed(4)})`, transformOrigin: `50% ${bigH / 2}px`,
            filter: `${bd ? 'drop-shadow(0 2px 18px rgba(0,0,0,0.55)) ' : ''}drop-shadow(0 0 ${(18 * glowK).toFixed(1)}px ${alpha(L.accent2, 0.55 * glowK)}) drop-shadow(0 0 ${(60 * glowK).toFixed(1)}px ${alpha(L.light, 0.5 * glowK)})`,
          }}>
            {bigLines.map((l, i) => (
              <div key={i} style={{
                fontFamily: fonts.sans, fontWeight: 900, fontStyle: 'italic', fontSize: bigFs, lineHeight: `${bigLH}px`, whiteSpace: 'nowrap',
                letterSpacing: `${tracking.toFixed(4)}em`,
                backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #fbf3ff 38%, #d8c2ff 72%, #b693ff 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', // bong o filter (text-shadow de len chu clip)
                // background-clip:text 只画在元素盒内：上下留出越南语叠加声调（Ấ Ầ）的空间，再用负 margin 抵消
                padding: '0.3em 0.08em 0.14em', margin: '-0.3em 0 -0.14em',
              }}>{l}</div>
            ))}
          </div>
          {subLines.map((l, i) => (
            <div key={i} style={{ position: 'absolute', top: subTop + i * subSize * 1.3, left: 0, right: 0, textAlign: 'center', ...type(subSize, 500), lineHeight: 1.3, color: alpha('#f3ecff', 0.82), whiteSpace: 'nowrap' }}>
              <TextReveal text={l} by="word" variant="rise" start={TEXT_T0 + 18 + subLines.slice(0, i).join(' ').split(/\s+/).filter(Boolean).length * subGap} each={16} gap={subGap} />
            </div>
          ))}
        </AbsoluteFill>
      )}
      {!bd && <Vignette strength={0.5} inner={0.48} color={L.shadow} />}
      {!bd && <Grain opacity={0.08} blend="soft-light" />}
    </AbsoluteFill>
  );
};
