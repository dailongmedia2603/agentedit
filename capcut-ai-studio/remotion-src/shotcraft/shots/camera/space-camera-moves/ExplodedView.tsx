// exploded-view｜爆炸分解（第二轮重设计）
// 手法不变：整页带 3D 倾斜，构件沿 Z 轴错峰炸开、悬停一拍让层间视差读出深度，再逆序合体落锤收口。
//
// 设计决定
// - look：porcelain（冷白 · 钴蓝）。Apple 发布会式的"拆给你看"：机位改成 3/4 轴测（rotateX 54° +
//   rotateZ −32°），页面平躺像一块放在台面上的主板，层沿页面法线向上叠起——比原版正面微倾的
//   "浮起"更像真正的爆炸图。
// - 主体：video-shotcraft 的动效工作台：外壳底板 → 侧栏（品牌标志）→ 命令栏 → 三张渲染指标卡 →
//   渲染量图表 → AI 助手面板，6 层、每层都是真实 UI（大数字、钴蓝图表），底板上留着各构件的虚线插槽。
// - 标注：悬停时右侧一列编号标注（发布会式 callout）：锚点 → 折线引线描出 → 标题 44px + 说明 30px
//   逐条升起；锚点按 3D 投影实时算出，跟着机位环绕走。
// - 合体：标注先撤，层逆序 ease-in 砸回，落锤不做抖屏（Q3），改成整组 8px 下沉回弹 + 底板接触影
//   一紧，合体后一道扫光掠过整页（Q4：只给主角一次）；最后左上角落 video-shotcraft 字标 + 一行标题，尾帧是海报。
//
// 时间表（30fps，共 170f）
//   0–24    建立：已合体的页面（0.56 倍），极缓推近 + 环绕起步；18–24 预备（层整体下压 6px，蓄力）
//   22–62   机位拉远 0.56→0.47 并下移，给升起的层堆留出画面（106–136 合体时推回）
//   24–62   炸开：5 层弹簧错峰上升（damping 15，一次可见过冲），间隔 5f，越高的层越晚到
//   30–104  悬停环绕：rotateZ −32°→−22°、rotateX 54°→50°（smooth），层间视差读出深度
//   52–86   标注：每条 8f 描线 + 12f 升起，间隔 6f；86–104 hold
//   104–114 标注撤出（ease-in，2f 错峰）
//   108–132 合体：逆序 ease-in 每层 14f，间隔 3f；132f 最后一层落座
//   132–142 落锤：整组下沉 8px 阻尼回弹、接触影收紧；136–160 扫光一次
//   140–170 字标淡入、标题「Built in layers.」逐词升起 → hold，尾帧海报
//
// [Agent Edit] Mau "giao dien san pham": GIU hinh ve bang dieu khien 5 lop (chu tren giao dien -> tieng Viet trung tinh).
// O chu: items (3-5 ten chu thich cho 5 lop, theo thu tu: dieu huong / bieu do / tro ly AI / so lieu / thanh lenh),
// notes (dong mo ta duoi moi chu thich, tuy chon), title + subtitle (tieu de chot cuoi canh). Chu thich do be ngang that:
// ten tu thu nho, mo ta xuong toi da 2 dong; cot chu thich gian dong theo chieu cao that. Nhip tieu de cuoi nen lai de
// het chu truoc khung cuoi. Khung doc (native): canh 3D phong to P, lop co huy hieu so tai diem neo, chu thich thanh
// danh sach so to ben duoi (thay cot trai/phai); tieu de chot o phia tren.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { LOOKS, Sheen, Stage, TextReveal, alpha, springAt, type } from '../../../fixtures/Look';
import { EASE, FONT, mix, ramp } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark, ShotcraftWordmark } from '../../../fixtures/Brand';

const DEFAULT_LABELS = ['Điều hướng', 'Phân tích', 'Trợ lý AI', 'Số liệu trực tiếp', 'Thanh lệnh'];
const DEFAULT_NOTES = ['Mọi thứ chỉ cách một cú nhấp', 'Doanh thu, tiến độ, xu hướng', 'Gợi ý việc cần làm tiếp theo', 'Cập nhật từng giây', 'Thêm việc chỉ bằng một dòng'];

export const EXPLODED_VIEW_DURATION = 170;

const L = LOOKS.porcelain;
const W = 1600;
const H = 1000;
const R = 26; // 页面圆角
const PERSP = 2400;

const EXPLODE = 24;
const STAGGER = 5;
const ASSEMBLE = 108;
const BACK = 3; // 合体错峰
const BACK_DUR = 14;

type Layer = {
  key: string; x: number; y: number; w: number; h: number; z: number; r: number; side: 'L' | 'R';
  label: { n: string };
};

// 层（页面坐标 + 炸开高度）；order = 数组下标（底 → 顶）
const LAYERS: Layer[] = [
  { key: 'side', x: 0, y: 0, w: 288, h: H, z: 150, r: R, side: 'L', label: { n: '01' } },
  { key: 'chart', x: 320, y: 410, w: 860, h: 558, z: 270, r: 22, side: 'L', label: { n: '02' } },
  { key: 'ai', x: 1204, y: 410, w: 364, h: 558, z: 400, r: 22, side: 'R', label: { n: '03' } },
  { key: 'kpi', x: 320, y: 130, w: W - 352, h: 250, z: 520, r: 22, side: 'R', label: { n: '04' } },
  { key: 'top', x: 288, y: 0, w: W - 288, h: 100, z: 640, r: 0, side: 'R', label: { n: '05' } },
];
const N = LAYERS.length;

// ───────────── 各层 UI（页面坐标系内，相对层左上） ─────────────
const ink = (c: string, s: number, w: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ ...type(s, w), color: c, ...extra });

const SideUI: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#f6f8fc', borderRight: `2px solid ${L.line}` }}>
    <div style={{ position: 'absolute', left: 34, top: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
      <ShotcraftMark size={44} tone="light" style={{ flex: 'none' }} />
      <div style={{ ...ink(L.ink, fitSize(BRAND.short || 'Bảng điều khiển', { family: BRAND.font, size: 32, maxWidth: 190, weight: 700, minSize: 18 }), 700), fontFamily: BRAND.font, letterSpacing: '0.01em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{BRAND.short || 'Bảng điều khiển'}</div>
    </div>
    {['Tổng quan', 'Dự án', 'Lịch', 'Khách hàng', 'Báo cáo', 'Cài đặt'].map((n, i) => (
      <div key={n} style={{
        position: 'absolute', left: 20, right: 20, top: 120 + i * 70, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center',
        padding: '0 18px', gap: 14, background: i === 0 ? alpha(L.accent, 0.1) : undefined,
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, border: `3px solid ${i === 0 ? L.accent : L.ink3}`, boxSizing: 'border-box' }} />
        <div style={ink(i === 0 ? L.accent : L.ink2, 26, i === 0 ? 700 : 550, { whiteSpace: 'nowrap', lineHeight: 1.3 })}>{n}</div>
        {i === 0 && <div style={{ marginLeft: 'auto', ...ink('#fff', 20, 700), background: L.accent, borderRadius: 999, padding: '2px 12px' }}>24</div>}
      </div>
    ))}
  </div>
);

const TopUI: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#ffffff', borderBottom: `2px solid ${L.line}`, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 24 }}>
    <div style={{ flex: 1, height: 58, borderRadius: 16, background: L.surface2, boxShadow: `inset 0 0 0 2px ${L.line}`, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14 }}>
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={L.ink3} strokeWidth={2.4} strokeLinecap="round"><circle cx={11} cy={11} r={7} /><path d="M20 20l-4-4" /></svg>
      <div style={ink(L.ink3, 26, 500)}>Tìm kiếm hoặc gõ lệnh…</div>
      <div style={{ marginLeft: 'auto', ...ink(L.ink3, 22, 600, { fontFamily: FONT.mono }), padding: '4px 12px', borderRadius: 8, boxShadow: `inset 0 0 0 2px ${L.line}` }}>⌘K</div>
    </div>
    <div style={{ width: 52, height: 52, borderRadius: 26, background: 'linear-gradient(135deg,#7aa2ff,#2f5bff)' }} />
  </div>
);

const KPIS = [
  { k: 'Thời gian xử lý TB', v: '1p 42s', d: '−31%' },
  { k: 'Đơn hoàn tất', v: '2.184', d: '+12%' },
  { k: 'Khách hài lòng', v: '98,2%', d: '+0,6' },
];
const KpiUI: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 24 }}>
    {KPIS.map((k, i) => (
      <div key={k.k} style={{ flex: 1, borderRadius: 22, background: '#fff', boxShadow: `inset 0 0 0 2px ${L.line}`, padding: '34px 36px', boxSizing: 'border-box' }}>
        <div style={ink(L.ink2, 26, 600, { whiteSpace: 'nowrap', lineHeight: 1.3 })}>{k.k}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 22 }}>
          <div style={ink(L.ink, 68, 780, { whiteSpace: 'nowrap' })}>{k.v}</div>
          <div style={ink(i === 0 ? L.accent2 : L.accent, 28, 700)}>{k.d}</div>
        </div>
      </div>
    ))}
  </div>
);

const VOL = [30, 34, 31, 42, 48, 45, 56, 61, 52, 66, 72, 69, 80, 76, 88];
const ChartUI: React.FC = () => {
  const cw = 860 - 72;
  const ch = 330;
  const pts = VOL.map((v, i) => [(i / (VOL.length - 1)) * cw, ch - (v / 100) * ch] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 22, background: '#fff', boxShadow: `inset 0 0 0 2px ${L.line}`, padding: '34px 36px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <div style={ink(L.ink, 36, 750)}>Doanh thu</div>
        <div style={ink(L.ink3, 24, 550)}>14 ngày qua</div>
      </div>
      <svg width={cw} height={ch + 10} style={{ position: 'absolute', left: 36, top: 150, overflow: 'visible' }}>
        <defs>
          <linearGradient id="xv-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={L.accent} stopOpacity={0.22} />
            <stop offset="1" stopColor={L.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 0.33, 0.66, 1].map((g) => <line key={g} x1={0} x2={cw} y1={ch * g} y2={ch * g} stroke={L.line} strokeWidth={2} />)}
        <path d={`${line} L${cw},${ch} L0,${ch} Z`} fill="url(#xv-area)" />
        <path d={line} fill="none" stroke={L.accent} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={11} fill="#fff" stroke={L.accent} strokeWidth={6} />
      </svg>
    </div>
  );
};

const AiUI: React.FC = () => (
  <div style={{
    position: 'absolute', inset: 0, borderRadius: 22, padding: '30px 28px', boxSizing: 'border-box',
    background: `linear-gradient(180deg, #ffffff 0%, ${alpha(L.accent, 0.06)} 100%)`, boxShadow: `inset 0 0 0 2px ${alpha(L.accent, 0.35)}`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 10, background: `linear-gradient(135deg, #7aa2ff, ${L.accent})` }} />
      <div style={ink(L.ink, 30, 750)}>Trợ lý AI</div>
    </div>
    <div style={{ marginTop: 26, borderRadius: 18, background: L.surface2, padding: '18px 20px', ...ink(L.ink2, 24, 500), lineHeight: 1.35 }}>
      Doanh thu tuần này tăng 18%. Gửi báo cáo cho cả nhóm?
    </div>
    <div style={{ marginTop: 16, borderRadius: 18, background: '#fff', boxShadow: `inset 0 0 0 2px ${L.line}`, padding: '18px 20px', ...ink(L.ink, 24, 550), lineHeight: 1.35 }}>
      “Đã soạn xong báo cáo tuần, kèm biểu đồ và…”
    </div>
    <div style={{ position: 'absolute', left: 28, right: 28, bottom: 28, display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, height: 58, borderRadius: 16, background: L.accent, ...ink('#fff', 24, 700), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Đồng ý</div>
      <div style={{ flex: 1, height: 58, borderRadius: 16, boxShadow: `inset 0 0 0 2px ${L.line}`, ...ink(L.ink2, 24, 650), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sửa</div>
    </div>
  </div>
);

const LAYER_UI: Record<string, React.FC> = { side: SideUI, top: TopUI, kpi: KpiUI, chart: ChartUI, ai: AiUI };

// ───────────── 机位与投影 ─────────────
type Cam = { rx: number; rz: number; s: number; cx: number; cy: number; ox: number; oy: number };
// ox / oy = 场景中心（屏幕坐标）；P = 竖屏放大倍率；portrait 时不做收尾右移（标题在上方）
const camAt = (f: number, oy = 540, P = 1, portrait = false): Cam => {
  const orbit = ramp(f, 30, 74, EASE.smooth);
  const push = ramp(f, 0, 170, EASE.smooth);
  const outro = ramp(f, 132, 30, EASE.smooth); // 合体后机位右移，给左上角标题让位
  // 机位跟着层堆的高度走：炸开时整组下移，让最高的层也留在画里；合体后回升
  const tall = ramp(f, 22, 40, EASE.smooth) * (1 - ramp(f, 106, 30, EASE.smooth));
  return {
    rx: mix(54, 50, orbit),
    rz: mix(-34, -32, ramp(f, 0, 30, EASE.out)) + 10 * orbit,
    s: mix(0.56, 0.47, tall) * mix(1, 1.04, push) * P, // 炸开时拉远给层堆留画面，合体后推回
    cx: portrait ? -20 * P : mix(-20, 190, outro),
    cy: (portrait ? mix(40, 200, tall) + 330 * outro : mix(40, 180, tall) + 70 * outro) * P, // 竖屏收尾：页面下移给上方标题让位
    ox: 960,
    oy,
  };
};
// 页面点 (px,py,pz) → 屏幕坐标：与 CSS transform `translate(cx,cy) scale(s) rotateX(rx) rotateZ(rz)` +
// perspective(PERSP) 同一套矩阵（origin = 页面中心 = 屏幕中心）
const project = (c: Cam, px: number, py: number, pz: number) => {
  const X = px - W / 2, Y = py - H / 2;
  const a = (c.rz * Math.PI) / 180, b = (c.rx * Math.PI) / 180;
  const x1 = X * Math.cos(a) - Y * Math.sin(a);
  const y1 = X * Math.sin(a) + Y * Math.cos(a);
  const y2 = y1 * Math.cos(b) - pz * Math.sin(b);
  const z2 = y1 * Math.sin(b) + pz * Math.cos(b);
  const x4 = x1 * c.s + c.cx, y4 = y2 * c.s + c.cy;
  const k = PERSP / (PERSP - z2);
  return { x: c.ox + x4 * k, y: c.oy + y4 * k };
};

// 每层炸开进度：弹簧上升 × 逆序 ease-in 合体
const layerP = (f: number, i: number) => {
  const up = springAt(f, EXPLODE + i * STAGGER, { damping: 15, stiffness: 120 });
  const down = ramp(f, ASSEMBLE + (N - 1 - i) * BACK, BACK_DUR, EASE.exit);
  return up * (1 - down);
};
const CLOSE = ASSEMBLE + (N - 1) * BACK + BACK_DUR; // 合体落座帧 = 134

export const ExplodedView: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const P = portrait ? 1.6 : 1;
  const OY = portrait ? Math.round(SH * 0.4) : 540;
  const cam = camAt(f, OY, P, portrait);
  const labels = useList('items', DEFAULT_LABELS).slice(0, 5);
  const notes = useList('notes', DEFAULT_NOTES);
  const title = useText('title', 'Xây dựng từng lớp.');
  const sub = useText('subtitle', 'Mọi thứ bạn cần, gói gọn trong một nơi.');
  // 预备：层整体下压；落锤：整组下沉回弹
  const crouch = -6 * (ramp(f, 18, 6, EASE.out) * (1 - ramp(f, EXPLODE, 6, EASE.out)));
  const since = f - CLOSE;
  const thud = since >= 0 ? 8 * Math.exp(-since / 3) * Math.cos(since * 0.9) : 0;
  const spread = ramp(f, EXPLODE, 30, EASE.out) * (1 - ramp(f, ASSEMBLE, CLOSE - ASSEMBLE, EASE.exit));
  const sheen = ramp(f, CLOSE + 4, 24, EASE.swift);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.36, y: 0.05 }} fill={{ x: 0.85, y: 0.9 }} />

      <AbsoluteFill style={{ perspective: PERSP }}>
        <div style={{
          position: 'absolute', left: 960 - W / 2, top: OY - H / 2, width: W, height: H, transformStyle: 'preserve-3d',
          transform: `translate(${cam.cx}px, ${cam.cy + thud}px) scale(${cam.s}) rotateX(${cam.rx}deg) rotateZ(${cam.rz}deg)`,
        }}>
          {/* 台面接触影：整页落在台面上的大软影（炸开时变淡，落锤时一紧） */}
          <div style={{
            position: 'absolute', left: -20, top: 10, width: W + 40, height: H + 40, borderRadius: R + 20,
            background: alpha(L.shadow, 0.28 - 0.08 * spread + 0.06 * Math.max(0, thud / 8)),
            filter: `blur(${40 - 10 * Math.max(0, thud / 8)}px)`, transform: 'translateZ(-30px) translate(30px, 40px)',
          }} />
          {/* 底板厚度 */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: R, background: '#c9d3e6', transform: 'translateZ(-14px)' }} />
          {/* 底板：页面背景 + 构件插槽虚线 */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: R, overflow: 'hidden', background: `linear-gradient(160deg, #f3f6fb 0%, ${L.bg[2]} 100%)`, boxShadow: `inset 0 0 0 2px ${L.line}` }}>
            {LAYERS.map((ly) => (
              <div key={ly.key} style={{
                position: 'absolute', left: ly.x + 10, top: ly.y + 10, width: ly.w - 20, height: ly.h - 20, borderRadius: Math.max(10, ly.r - 6),
                border: `3px dashed ${alpha(L.accent, 0.28)}`, background: alpha(L.accent, 0.03), boxSizing: 'border-box', opacity: Math.min(1, spread * 2),
              }} />
            ))}
            {/* 扫光：合体后一次（裁进底板圆角） */}
            <Sheen progress={sheen} color="#ffffff" strength={0.6} width={0.18} />
          </div>
          {/* 层投到底板上的影：随高度下移、变虚、变淡（主光左上 → 影向右下） */}
          {LAYERS.map((ly, i) => {
            const p = Math.max(0, layerP(f, i));
            if (p < 0.01) return null;
            const h = ly.z * p;
            return (
              <div key={`sh-${ly.key}`} style={{
                position: 'absolute', left: ly.x + h * 0.18, top: ly.y + h * 0.26, width: ly.w, height: ly.h, borderRadius: ly.r,
                background: alpha(L.shadow, 0.3), filter: `blur(${(10 + h * 0.09).toFixed(1)}px)`, opacity: Math.min(1, p * 1.5) * (0.8 - h / 1400),
                transform: 'translateZ(1px)',
              }} />
            );
          })}
          {/* 可动层：沿法线升起；背后一片厚度边（钴蓝灰） */}
          {LAYERS.map((ly, i) => {
            const p = layerP(f, i);
            const z = ly.z * p + 2;
            const UI = LAYER_UI[ly.key];
            const box: React.CSSProperties = { position: 'absolute', left: ly.x, top: ly.y, width: ly.w, height: ly.h, borderRadius: ly.r };
            const lifted = Math.min(1, Math.max(0, p) * 4);
            return (
              <React.Fragment key={ly.key}>
                {lifted > 0.02 && <div style={{ ...box, background: '#b9c6de', transform: `translateZ(${Math.max(2.5, z - 8 + crouch).toFixed(2)}px)` }} />}
                <div style={{
                  ...box, overflow: 'hidden', transform: `translateZ(${(z + crouch).toFixed(2)}px)`,
                  boxShadow: lifted > 0.02 ? `0 0 0 2px ${alpha('#ffffff', 0.9 * lifted)}` : undefined,
                }}>
                  <UI />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* 标注：锚点（层右缘中点的 3D 投影）→ 折线引线 → 编号 + 标题 + 说明；竖屏改为锚点编号 + 下方图例列表 */}
      {portrait
        ? <LegendPortrait f={f} cam={cam} labels={labels} notes={notes} top={OY + 880} bottom={SH - 130} family={fonts.sans} />
        : <Callouts f={f} cam={cam} labels={labels} notes={notes} family={fonts.sans} />}

      {/* 收尾标题（标题词数多时压缩词间，保证片尾前全部升起） */}
      {(() => {
        const tFs0 = portrait ? 150 : 96;
        const tW = portrait ? 1680 : 900;
        const one = fitSize(title, { family: fonts.sans, size: tFs0, maxWidth: tW, weight: 780, minSize: 20 });
        const tLines = title.trim() ? (one >= tFs0 * 0.74 ? [title.trim()] : wrapLines(title, fonts.sans, tFs0, tW, 780, 2)) : [];
        const tFs = Math.min(tFs0, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tFs0, maxWidth: tW, weight: 780, minSize: tFs0 * 0.5 })));
        const sFs0 = portrait ? 58 : 36;
        const sLines = sub.trim() ? wrapLines(sub, fonts.sans, sFs0, tW, 450, 2) : [];
        const sFs = Math.min(sFs0, ...sLines.map((l) => fitSize(l, { family: fonts.sans, size: sFs0, maxWidth: tW, weight: 450, minSize: 24 })));
        const nW = title.split(/\s+/).filter(Boolean).length;
        const gap = Math.min(5, 12 / Math.max(1, nW - 1));
        let wi = 0;
        const subP = ramp(f, 150, 14, EASE.out);
        return (
          <div style={{ position: 'absolute', left: portrait ? 120 : 120, right: portrait ? 120 : undefined, top: portrait ? 300 : 104 }}>
            {BRAND.name ? <div style={{ opacity: ramp(f, 140, 14, EASE.out) }}><ShotcraftWordmark size={30 * (portrait ? 1.6 : 1)} tone="light" markScale={1.6} gap={14} /></div> : null}
            {tLines.map((l, i) => {
              const st = 140 + wi * gap;
              wi += l.split(/\s+/).filter(Boolean).length;
              return (
                <div key={i} style={{ ...type(tFs, 780), color: L.ink, marginTop: i === 0 ? 18 : 0, lineHeight: 1.18, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="word" variant="rise" start={st} each={14} gap={gap} />
                </div>
              );
            })}
            {sLines.map((l, i) => (
              <div key={i} style={{ ...type(sFs, 450), color: L.ink2, marginTop: i === 0 ? 22 : 0, lineHeight: 1.3, whiteSpace: 'nowrap', opacity: subP, transform: `translateY(${(1 - subP) * 16}px)` }}>
                {l}
              </div>
            ))}
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};

// 竖屏图例：每层锚点上一枚编号徽章（跟机位投影走），下方大字号编号列表（标题 + 说明），节拍与横屏标注一致
const LegendPortrait: React.FC<{ f: number; cam: Cam; labels: string[]; notes: string[]; top: number; bottom: number; family: string }> = ({ f, cam, labels, notes, top, bottom, family }) => {
  const rows = LAYERS.map((ly, i) => ({ ly, i })).filter(({ i }) => labels[i]);
  const rowH = (i: number) => fitSize(labels[i], { family, size: 66, maxWidth: 1460, weight: 760, minSize: 40 }) * 1.3 + (notes[i] ? wrapLines(notes[i], family, 46, 1460, 450, 2).length : 0) * 46 * 1.3 + 56;
  const total = rows.reduce((t, r) => t + rowH(r.i), 0);
  let y = Math.min(top, bottom - total);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {rows.map(({ ly, i }) => {
        const start = 52 + i * 6;
        const draw = ramp(f, start, 8, EASE.out);
        const rise = ramp(f, start + 6, 12, EASE.snappy);
        const out = ramp(f, 104 + (N - 1 - i) * 2, 8, EASE.exit);
        const z = ly.z * layerP(f, i) + 2;
        const cs = [[ly.x, ly.y], [ly.x + ly.w, ly.y], [ly.x, ly.y + ly.h], [ly.x + ly.w, ly.y + ly.h]].map(([x, yy]) => project(cam, x, yy, z));
        cs.sort((u, v) => (ly.side === 'L' ? u.x - v.x : v.x - u.x));
        const a = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 };
        const tFs = fitSize(labels[i], { family, size: 66, maxWidth: 1460, weight: 760, minSize: 40 });
        const dLines = notes[i] ? wrapLines(notes[i], family, 46, 1460, 450, 2) : [];
        const rowY = y;
        y += tFs * 1.3 + dLines.length * 46 * 1.3 + 56;
        if (draw <= 0 || out >= 1) return null;
        const bs = 34 * Math.min(1, draw * 2);
        return (
          <React.Fragment key={ly.key}>
            <div style={{
              position: 'absolute', left: a.x - bs, top: a.y - bs, width: bs * 2, height: bs * 2, borderRadius: bs, background: L.accent,
              boxShadow: `0 0 0 6px #fff, 0 8px 24px ${alpha(L.shadow, 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 1 - out, ...type(30 * Math.min(1, draw * 2), 700, { mono: true }), color: '#fff',
            }}>{ly.label.n}</div>
            <div style={{
              position: 'absolute', left: 160, right: 120, top: rowY, opacity: rise * (1 - out), display: 'flex', gap: 36,
              transform: `translateY(${(1 - rise) * 26 + out * -12}px)`,
            }}>
              <div style={{ ...type(40, 700, { mono: true }), color: L.accent, lineHeight: `${tFs * 1.3}px`, flex: 'none' }}>{ly.label.n}</div>
              <div>
                <div style={{ ...type(tFs, 760), color: L.ink, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{labels[i]}</div>
                {dLines.map((l, k) => <div key={k} style={{ ...type(46, 450), color: L.ink2, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{l}</div>)}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// 标注分左右两栏：左栏贴层的最左角、右栏贴最右角，引线水平拉出、到栏前一折
const COL = { L: 470, R: 1450 }; // 左栏右对齐线 / 右栏左对齐线
const Callouts: React.FC<{ f: number; cam: Cam; labels: string[]; notes: string[]; family: string }> = ({ f, cam, labels, notes, family }) => {
  // 实测：标题缩到栏宽内、说明最多两行；栏内行距按真实高度排
  const COLW = 430;
  const meas = LAYERS.map((_, i) => {
    const t = labels[i] || '';
    const tFs = fitSize(t, { family, size: 44, maxWidth: COLW, weight: 760, minSize: 26 });
    const one = notes[i] ? fitSize(notes[i], { family, size: 30, maxWidth: COLW, weight: 450, minSize: 20 }) : 30;
    const dl = notes[i] ? (one >= 25 ? [notes[i]] : wrapLines(notes[i], family, 30, COLW, 450, 2)) : [];
    const dFs = Math.min(30, ...dl.map((l) => fitSize(l, { family, size: 30, maxWidth: COLW, weight: 450, minSize: 20 })));
    return { t, tFs, dl, dFs, h: tFs * 1.3 + dl.length * dFs * 1.3 + 40 };
  });
  const items = LAYERS.map((ly, i) => ({ ly, i })).filter(({ i }) => labels[i]).map(({ ly, i }) => {
    const z = ly.z * layerP(f, i) + 2;
    const cs = [[ly.x, ly.y], [ly.x + ly.w, ly.y], [ly.x, ly.y + ly.h], [ly.x + ly.w, ly.y + ly.h]].map(([x, y]) => project(cam, x, y, z));
    // 锚点：靠外一侧的两个角取中点（即外缘中点），读作"这一层"
    cs.sort((u, v) => (ly.side === 'L' ? u.x - v.x : v.x - u.x));
    const a = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 };
    return { ly, i, a };
  });
  const placed: { it: (typeof items)[number]; y: number }[] = [];
  (['L', 'R'] as const).forEach((sd) => {
    const col = items.filter((it) => it.ly.side === sd).sort((u, v) => u.a.y - v.a.y);
    const ys: number[] = [];
    col.forEach((it, k) => { ys[k] = k === 0 ? Math.max(150, it.a.y) : Math.max(ys[k - 1] + Math.max(140, meas[col[k - 1].i].h), it.a.y); });
    const over = (ys[ys.length - 1] ?? 0) - 940;
    col.forEach((it, k) => placed.push({ it, y: ys[k] - Math.max(0, over) }));
  });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {placed.map(({ it, y: ly }) => {
        const start = 52 + it.i * 6;
        const draw = ramp(f, start, 8, EASE.out);
        const rise = ramp(f, start + 6, 12, EASE.snappy);
        const out = ramp(f, 104 + (N - 1 - it.i) * 2, 8, EASE.exit);
        if (draw <= 0 || out >= 1) return null;
        const L_ = it.ly.side === 'L';
        const ax = it.a.x, ay = it.a.y;
        const ex = L_ ? COL.L + 24 : COL.R - 24; // 引线终点
        const kx = L_ ? Math.min(ax - 40, ex + 70) : Math.max(ax + 40, ex - 70); // 折点：栏前 70px
        const len = Math.abs(kx - ax) + Math.hypot(ex - kx, ly - ay);
        const lab = it.ly.label;
        const m = meas[it.i];
        return (
          <React.Fragment key={it.ly.key}>
            <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 1 - out }}>
              <path d={`M${ax},${ay} L${kx},${ay} L${ex},${ly}`} fill="none" stroke={L.accent} strokeWidth={2.5}
                strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - draw)} strokeLinejoin="round" />
              <circle cx={ax} cy={ay} r={9 * Math.min(1, draw * 3)} fill={L.accent} stroke="#fff" strokeWidth={4} />
            </svg>
            <div style={{
              position: 'absolute', top: ly - 34, opacity: rise * (1 - out),
              ...(L_ ? { right: 1920 - COL.L, textAlign: 'right' as const } : { left: COL.R }),
              transform: `translateY(${(1 - rise) * 22 + out * -10}px)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, justifyContent: L_ ? 'flex-end' : 'flex-start' }}>
                <span style={{ ...type(26, 700, { mono: true }), color: L.accent }}>{lab.n}</span>
                <span style={{ ...type(m.tFs, 760), color: L.ink, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{m.t}</span>
              </div>
              {m.dl.map((l, k) => <div key={k} style={{ ...type(m.dFs, 450), color: L.ink2, marginTop: k === 0 ? 6 : 0, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{l}</div>)}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
