// integration-hub-map v5 —— 批次 14 单点节奏修正：
// 用户意见（逐字）"动作对了，但是需要翻的时候很快，最后快完成的时候变慢下来"
// → rotateY 0→180° 改为快翻+尾段减速：强 ease-out（cubic），前 ~40% 时间完成 ~80% 角度，尾段明显减速缓着陆；
//   仍一次连贯完成、无分段停顿（判例："匀速"=无停顿≠字面 linear）。
// ① 开头不是"转一个角度"，而是页面整个 rotateY 翻转 180° 翻到背面，得到一张新的页面（双面卡：正面=近景旧页，
//    背面=翻正后的新中枢页），翻到侧棱（~90°）时闪一下。
// ② 五图标光管连上后有"输送感"：亮脉冲沿管线方向（图标→中枢）持续循环流动，直到片尾不停。
// · 相机推拉/平移是一条连续曲线，前摇缓、无顿点；面板推拉走 CSS zoom（布局级缩放），文字按原生分辨率栅格化
// · 图标瓷贴弹现带一次过冲、连通后染上本管末端色的霓虹余光
// · 光管：彩虹管体收细 + 白热芯 + 生长头火花，输送脉冲是"亮头+拖尾"彗星形；管口接入瞬间一圈小涟漪
// · 背景霓虹框细、淡并随相机做弱视差，颗粒 + 暗角压住大面积暗场
//
// [Agent Edit] o chu: old_title / old_note (trang CU — "cach lam cu, thu cong", doc duoc trong canh can dau) / title (ten trang
// MOI = trung tam) / items (3-7 dong trong trang moi) / apps (5 nhan duoi 5 bieu tuong ung dung, tuy chon). Moi chu tren giao dien
// = tieng Viet; 5 bieu tuong la icon net chung (web / tin nhan / gio hang / email / bieu do), khong logo ben thu ba.
// Khung doc (native): trang to hon (1.7x) giua khung, 3 bieu tuong phia tren + 2 phia duoi, ong sang dung doc; nhip giu nguyen.
import { useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React, { useId } from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { Grain, Vignette, bezier } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const INTEGRATION_HUB_MAP_DURATION = 150; // 前摇 0.5s + 快翻 1.2s + 两拍接入 0.7s + 输送呼吸 ~2.6s

const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = mulberry32(20260718);
const NOISE: number[] = Array.from({ length: 200 }, () => rand());

const INK = '#1d1e25', INK2 = '#5f616b', INK3 = '#a0a2ab', HAIR = 'rgba(20,22,28,0.08)';
const ACC = '#5b55c8';

// 面板推拉走 CSS zoom（布局级缩放）而非 transform scale：任意推拉量下文字都按显示尺寸原生栅格化（Q2）
const PW = 820, PH = 520;
const ell: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

// 面板外观：发丝线 + 顶部受光沿 + 投在暗场上的深影 + 一圈随 glow 增强的冷紫环境光（只给主角）
const panelShell = (glow: number, font: string): React.CSSProperties => ({
  width: PW,
  height: PH,
  background: 'linear-gradient(180deg, #fdfdfc 0%, #f7f7f5 100%)',
  borderRadius: 14,
  boxSizing: 'border-box',
  fontFamily: font,
  overflow: 'hidden',
  boxShadow: [
    'inset 0 1px 0 rgba(255,255,255,1)',
    '0 0 0 1px rgba(255,255,255,0.55)',
    '0 2px 6px rgba(0,0,0,0.35)',
    '0 40px 90px -24px rgba(0,0,0,0.75)',
    `0 0 ${50 + glow * 90}px rgba(236,226,255,${(0.10 + glow * 0.45).toFixed(3)})`,
    `0 0 ${150 + glow * 120}px rgba(176,110,255,${(0.16 + glow * 0.28).toFixed(3)})`,
  ].join(', '),
});

// ---------- 中枢面板（新页：工作区，版式对照原片） ----------
const ICON_C = ['#4a9fd8', '#4a9fd8', '#34a853', '#a259ff', '#f2c744', '#9a9a98', '#c8c8c6'];
const SUBS = ['Đồng bộ 2 phút trước', 'Tự động · Đang chạy', 'Cập nhật hôm nay', 'Đã kết nối · 3 nguồn', 'Báo cáo tuần · Sẵn sàng', 'Lưu trữ · Tháng trước', 'Đang xử lý · Hôm qua'];
const HubPanel: React.FC<{ glow: number; title: string; items: string[]; font: string }> = ({ glow, title, items, font }) => {
  const tS = fitSize(title, { family: font, size: 25, maxWidth: 425, weight: 700, minSize: 14 }); // 左栏 ≈489 − 标志 42
  return (
    <div style={{ ...panelShell(glow, font), padding: '26px 30px', display: 'flex', gap: 26 }}>
      <div style={{ flex: 2, minWidth: 0 }}>
        {/* 工作区标题 = 品牌标志 + 新页名称 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34 }}>
          <ShotcraftMark size={32} tone="light" />
          <span style={{ fontSize: tS, fontWeight: 700, color: INK, letterSpacing: '0.01em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, borderBottom: `1px solid ${HAIR}`, paddingBottom: 8 }}>
          {['Tất cả', 'Đơn hàng', 'Khách hàng', 'Tin nhắn', 'Báo cáo', 'Tệp'].map((t, i) => (
            <div key={t} style={{ fontSize: 12, color: i === 0 ? ACC : '#8e9099', fontWeight: i === 0 ? 650 : 450, position: 'relative', whiteSpace: 'nowrap' }}>
              {t}
              {i === 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -9, height: 2, borderRadius: 1, background: ACC }} />}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: INK3, marginTop: 14, letterSpacing: '0.04em', fontWeight: 600 }}>GẦN ĐÂY</div>
        {items.slice(0, 7).map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'center', marginTop: 12 }}>
            <div
              style={{
                width: 22, height: 22, borderRadius: 6, flex: 'none',
                background: `linear-gradient(160deg, ${ICON_C[i]}, ${ICON_C[i]}cc)`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px rgba(16,18,24,0.12)',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, letterSpacing: '-0.005em', ...ell }}>{it}</div>
              <div style={{ fontSize: 11, color: INK3, marginTop: 2, ...ell }}>{SUBS[i]}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, borderLeft: `1px solid ${HAIR}`, paddingLeft: 22 }}>
        <div
          style={{
            height: 30, width: 168, borderRadius: 8, marginTop: 4, fontSize: 12, color: INK2, fontWeight: 500,
            background: '#fff', boxShadow: `inset 0 0 0 1px rgba(20,22,28,0.14), 0 1px 2px rgba(16,18,24,0.05)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          + Thêm bộ lọc
        </div>
        <div style={{ fontSize: 10.5, color: INK3, marginTop: 24, letterSpacing: '0.08em', fontWeight: 600 }}>LỌC NHANH</div>
        {['Giao cho tôi', 'Do tôi tạo'].map((t) => (
          <div key={t} style={{ fontSize: 13.5, color: INK2, marginTop: 11 }}>{t}</div>
        ))}
        <div style={{ fontSize: 10.5, color: INK3, marginTop: 24, letterSpacing: '0.08em', fontWeight: 600 }}>TRẠNG THÁI</div>
        {([['Đang chờ', 3], ['Hoàn tất', 31], ['Lưu trữ', 7]] as [string, number][]).map(([t, n]) => (
          <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: INK2, marginTop: 11, width: 168 }}>
            <span>{t}</span>
            <span style={{ color: INK3, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- 翻转前的旧页面（正面）：另一张页面，翻面后才得到中枢页 ----------
const FrontPanel: React.FC<{ glow: number; title: string; note: string; font: string }> = ({ glow, title, note, font }) => {
  const tS = fitSize(title, { family: font, size: 26, maxWidth: 560, weight: 650, minSize: 15 });
  return (
    <div style={{ ...panelShell(glow, font), padding: '30px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(160deg, #5aaee6, #3d8fcc)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)', flex: 'none' }} />
        <div style={{ fontSize: tS, fontWeight: 650, color: INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{title}</div>
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: INK3, whiteSpace: 'nowrap' }}>Sửa 2 giờ trước</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {['Thủ công', '5 ứng dụng', 'Excel'].map((t) => (
          <div key={t} style={{ fontSize: 11.5, color: INK2, background: '#efeff1', borderRadius: 6, padding: '3px 10px', boxShadow: `inset 0 0 0 1px ${HAIR}` }}>
            {t}
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: HAIR, marginTop: 18 }} />
      {/* 关键字段 */}
      <div style={{ display: 'flex', gap: 34, marginTop: 16 }}>
        {[['THỜI GIAN', '3 giờ/ngày'], ['CÔNG CỤ', '5 ứng dụng'], ['TRẠNG THÁI', 'Rời rạc'], ['PHỤ TRÁCH', 'Cả nhóm']].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10.5, color: INK3, letterSpacing: '0.06em', fontWeight: 600 }}>{k}</div>
            <div style={{ fontSize: 15, color: INK, fontWeight: 600, marginTop: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 15, fontWeight: 650, color: INK, marginTop: 22 }}>Tóm tắt</div>
      <div style={{ fontSize: 13, lineHeight: 1.62, color: INK2, marginTop: 8, maxWidth: 720, maxHeight: 13 * 1.62 * 4, overflow: 'hidden' }}>{note}</div>
      <div style={{ fontSize: 15, fontWeight: 650, color: INK, marginTop: 18 }}>Việc cần làm</div>
      {['Gom mọi công cụ về một nơi', 'Tự động hoá báo cáo hằng ngày'].map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, fontSize: 13, color: INK2 }}>
          <div style={{ width: 13, height: 13, borderRadius: 4, boxShadow: `inset 0 0 0 1.2px ${i ? 'rgba(20,22,28,0.22)' : ACC}`, background: i ? '#fff' : 'rgba(91,85,200,0.1)' }} />
          {s}
        </div>
      ))}
    </div>
  );
};

// ---------- 接入源图标瓷贴（通用线性图标，无第三方标志） ----------
// 线性图标：墨色描边 + 强调色点睛；48 视框、显示 54px
const Tile: React.FC<{ kind: string; on: number; tint: string; amber: string }> = ({ kind, on, tint, amber }) => {
  const ln = { fill: 'none', stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const am = { ...ln, stroke: amber };
  const glyph = (() => {
    switch (kind) {
      case 'web':
        // 网页：浏览器框 + 内容区里一枚取景角标
        return (
          <svg width={54} height={54} viewBox="0 0 48 48">
            <rect x={5} y={8} width={38} height={32} rx={5} {...ln} />
            <path d="M5 16 H43" {...ln} />
            <circle cx={10.5} cy={12} r={1.4} fill={INK} />
            <circle cx={15} cy={12} r={1.4} fill={INK} />
            <circle cx={19.5} cy={12} r={1.4} fill={INK} />
            <path d="M15 26 V22 H19 M29 22 H33 V26 M33 30 V34 H29 M19 34 H15 V30" {...am} strokeWidth={2.6} />
          </svg>
        );
      case 'chat':
        // 消息：对话气泡 + 三个点
        return (
          <svg width={54} height={54} viewBox="0 0 48 48">
            <path d="M8 10 H40 A4 4 0 0 1 44 14 V30 A4 4 0 0 1 40 34 H20 L11 41 V34 H8 A4 4 0 0 1 4 30 V14 A4 4 0 0 1 8 10 Z" {...ln} />
            <circle cx={16} cy={22} r={2.2} fill={amber} />
            <circle cx={24} cy={22} r={2.2} fill={amber} />
            <circle cx={32} cy={22} r={2.2} fill={amber} />
          </svg>
        );
      case 'cart':
        // 购物车
        return (
          <svg width={54} height={54} viewBox="0 0 48 48">
            <path d="M5 8 H11 L16 31 H38 L42 15 H13" {...ln} />
            <circle cx={19} cy={38} r={3} {...am} />
            <circle cx={35} cy={38} r={3} {...am} />
          </svg>
        );
      case 'mail':
        // 邮件：信封
        return (
          <svg width={54} height={54} viewBox="0 0 48 48">
            <rect x={5} y={11} width={38} height={27} rx={4} {...ln} />
            <path d="M7 14 L24 27 L41 14" {...am} />
          </svg>
        );
      default: // chart：图表
        return (
          <svg width={54} height={54} viewBox="0 0 48 48">
            {[14, 22, 18, 30].map((h, k) => (
              <path key={k} d={`M${10 + k * 9} 40 V${40 - h}`} {...(k === 3 ? am : ln)} strokeWidth={4} />
            ))}
            <path d="M6 42 H42" {...ln} />
          </svg>
        );
    }
  })();
  return (
    <div
      style={{
        width: 112,
        height: 112,
        borderRadius: 28,
        background: 'linear-gradient(180deg, #ffffff 0%, #f1f1f4 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,1)',
          'inset 0 -2px 4px rgba(20,22,40,0.08)',
          '0 0 0 1px rgba(255,255,255,0.4)',
          '0 18px 40px -12px rgba(0,0,0,0.7)',
          // 连通后染上本管末端色的霓虹余光
          `0 0 ${18 + on * 40}px ${tint}${Math.round(Math.min(1, on) * 0x70).toString(16).padStart(2, '0')}`,
        ].join(', '),
      }}
    >
      {glyph}
    </div>
  );
};

// ---------- 光管（彩虹渐变霓虹管） ----------
type Pipe = { kind: string; icon: [number, number]; path: string; len: number; tIcon: number; tPipe: number; tint: string; labelAbove: boolean };
const GROW = 9; // 两拍制：五图标 tIcon 统一 52 同帧出现，五管 tPipe 统一 62 同帧连接
const FLOW_SPEED = 4.6; // 输送脉冲速度 px/f
const FLOW_PERIOD = 74; // 脉冲间距（px）

// 路径上按弧长取点（只含直线段与一段二次曲线，生长头火花用）；dist = Infinity → 返回总长
const walk = (path: string, dist: number): { pt: [number, number]; total: number } => {
  const tok = path.match(/[MLQ]|-?[\d.]+/g)!;
  let i = 0, cx = 0, cy = 0, rest = dist, total = 0;
  let last: [number, number] = [0, 0];
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { cx = +tok[i++]; cy = +tok[i++]; last = [cx, cy]; continue; }
    if (c === 'L') {
      const x = +tok[i++], y = +tok[i++];
      const L = Math.hypot(x - cx, y - cy);
      if (rest <= L) { const k = rest / L; return { pt: [cx + (x - cx) * k, cy + (y - cy) * k], total }; }
      rest -= L; total += L; cx = x; cy = y; last = [cx, cy]; continue;
    }
    if (c === 'Q') {
      const qx = +tok[i++], qy = +tok[i++], x = +tok[i++], y = +tok[i++];
      const pts: [number, number][] = [];
      for (let s = 0; s <= 16; s++) {
        const u = s / 16;
        pts.push([(1 - u) * (1 - u) * cx + 2 * (1 - u) * u * qx + u * u * x, (1 - u) * (1 - u) * cy + 2 * (1 - u) * u * qy + u * u * y]);
      }
      for (let s = 1; s < pts.length; s++) {
        const L = Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]);
        if (rest <= L) { const k = rest / L; return { pt: [pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * k, pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * k], total }; }
        rest -= L; total += L;
      }
      cx = x; cy = y; last = [cx, cy]; continue;
    }
  }
  return { pt: last, total };
};
const pointAt = (path: string, dist: number) => walk(path, dist).pt;

// 横版：原版坐标；竖版：面板（1.7x）居中，三枚图标在上、两枚在下，光管竖直接入面板上下沿
const pipesFor = (P: boolean, H: number): Pipe[] => {
  const base = { tIcon: 52, tPipe: 62, tint: '#ffd44d' };
  if (!P) {
    return [
      { kind: 'web', icon: [452, 262], path: 'M 452 322 L 452 440 Q 452 480 492 480 L 552 480', len: 300, labelAbove: true, ...base },
      { kind: 'chat', icon: [252, 612], path: 'M 316 612 L 552 612', len: 240, labelAbove: false, ...base },
      { kind: 'cart', icon: [992, 178], path: 'M 992 240 L 992 332', len: 92, labelAbove: true, ...base },
      { kind: 'mail', icon: [1512, 272], path: 'M 1512 332 L 1512 440 Q 1512 480 1472 480 L 1372 480', len: 290, labelAbove: true, ...base },
      { kind: 'chart', icon: [1702, 618], path: 'M 1640 618 L 1372 618', len: 270, labelAbove: false, ...base },
    ];
  }
  const cy = H / 2;
  const top = cy - (PH * 1.7) / 2 + 25; // 面板上沿（落定 panY=25）
  const bot = cy + (PH * 1.7) / 2 + 25;
  const raw: Omit<Pipe, 'len'>[] = [
    { kind: 'web', icon: [330, cy - 900], path: `M 330 ${cy - 810} L 330 ${top - 160} Q 330 ${top - 110} 380 ${top - 110} L 470 ${top - 110} Q 520 ${top - 110} 520 ${top - 60} L 520 ${top}`, labelAbove: true, ...base },
    { kind: 'cart', icon: [960, cy - 760], path: `M 960 ${cy - 670} L 960 ${top}`, labelAbove: true, ...base },
    { kind: 'mail', icon: [1590, cy - 900], path: `M 1590 ${cy - 810} L 1590 ${top - 160} Q 1590 ${top - 110} 1540 ${top - 110} L 1450 ${top - 110} Q 1400 ${top - 110} 1400 ${top - 60} L 1400 ${top}`, labelAbove: true, ...base },
    { kind: 'chat', icon: [560, cy + 920], path: `M 560 ${cy + 830} L 560 ${bot}`, labelAbove: false, ...base },
    { kind: 'chart', icon: [1360, cy + 920], path: `M 1360 ${cy + 830} L 1360 ${bot}`, labelAbove: false, ...base },
  ];
  return raw.map((p) => ({ ...p, len: Math.round(walk(p.path, Infinity).total) }));
};

// ---------- 背景霓虹矩形轮廓 ----------
const RECTS = Array.from({ length: 9 }, (_, i) => ({
  x: [150, 660, 1740, 250, 1150, 700, 1660, 90, 1330][i],
  y: [255, 355, 545, 850, 935, 985, 830, 555, 760][i],
  w: 90 + NOISE[i * 3] * 160,
  h: 60 + NOISE[i * 3 + 1] * 70,
  hue: [265, 285, 300, 255, 275, 210, 320, 240, 40][i],
  ph: NOISE[i * 3 + 2] * Math.PI * 2,
}));

// 相机：一条连续曲线（前摇段自然很慢，无关键帧顿点）
const CAM = bezier(0.55, 0, 0.18, 1);

export const IntegrationHubMap: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SH > 1080 * 1.2;
  // 滤镜/渐变 ID 按实例生成，多实例同场不串引（useId 的 «:» 在 url() 里非法，需清洗）
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const oldTitle = useText('old_title', 'Quy trình thủ công');
  const oldNote = useText('old_note', 'Mỗi ngày phải mở năm ứng dụng khác nhau, sao chép dữ liệu bằng tay rồi gửi báo cáo qua email. Mất hàng giờ mà vẫn dễ sai sót, thông tin nằm rải rác khắp nơi.');
  const title = useText('title', 'Trung tâm bán hàng');
  const items = useList('items', ['Đơn hàng mới #1024', 'Tin nhắn khách hàng', 'Tồn kho cập nhật', 'Chiến dịch email tháng 10', 'Báo cáo doanh thu tuần', 'Hoá đơn đã lưu trữ', 'Đồng bộ dữ liệu cửa hàng']);
  const apps = useList('apps', []);
  const PIPES = pipesFor(P, SH);
  const K = P ? 1.7 : 1; // 竖版面板 / 图标放大

  // --- 相机/面板轨迹：近景正视旧页 → 整体翻转 180°（翻到背面=新页）+ 拉远落定 ---
  const cam = CAM(Math.min(1, Math.max(0, frame / 96)));
  const zStart = P ? 2.2 : 2.05;
  const zEnd = P ? 1.7 : 1.0;
  const zoom = zStart + (zEnd - zStart) * cam;
  // 翻面窗口 f14–49（35 帧），快翻+尾段减速；90° 侧棱在 ~f21
  const rotY = interpolate(frame, [14, 49], [0, 180], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const panX = (P ? 40 : 130) + (0 - (P ? 40 : 130)) * cam;
  const panY = (P ? 160 : 120) + (25 - (P ? 160 : 120)) * cam;

  // 侧棱时刻（~f21）2 帧脉冲亮闪即回落
  const bloom = interpolate(frame, [19, 21, 23, 27], [0, 1, 0.25, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const noise = NOISE[Math.min(frame, NOISE.length - 1)];

  // 全连通后呼吸
  const allOn = Math.max(...PIPES.map((p) => p.tPipe)) + GROW;
  const breathe = frame > allOn ? 0.5 + 0.5 * Math.sin((frame - allOn) * 0.16) : 0;
  const panelGlow = bloom * 1.1 + breathe * 0.16;

  // 星图元素（图标/光管/矩形）整体可见度
  const mapIn = interpolate(frame, [34, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // 背景层弱视差：跟随相机 18% 的位移与 10% 的推拉
  const bgPar = `translate(${(panX * 0.18).toFixed(2)}px, ${(panY * 0.18).toFixed(2)}px) scale(${(1 + (zoom - zEnd) * 0.1).toFixed(4)})`;
  const yk = SH / 1080; // 竖版：背景矩形按高度铺开
  const labelS = P ? 44 : 26;
  const labelSize = (t: string) => fitSize(t, { family: fonts.sans, size: labelS, maxWidth: P ? 420 : 240, weight: 600, minSize: labelS * 0.55 });
  const sw = P ? 1.5 : 1; // 竖版管线加粗

  return (
    <AbsoluteFill style={{ background: '#09080e' }}>
      {/* 暗紫底：中心冷紫柔光 + 左下品红余光 */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 50%, rgba(98,58,160,0.28), transparent 70%), radial-gradient(ellipse 45% 40% at 16% 80%, rgba(150,56,128,0.13), transparent 70%), radial-gradient(ellipse 40% 35% at 86% 18%, rgba(70,90,190,0.10), transparent 70%)',
        }}
      />

      {/* 背景霓虹矩形轮廓：细、淡、轻微失焦，作远景衬场 */}
      <AbsoluteFill style={{ transform: bgPar, transformOrigin: '50% 50%' }}>
        {RECTS.map((r, i) => {
          const on = interpolate(frame, [36 + i * 4, 56 + i * 4], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const settle = interpolate(frame, [90, 120], [1, 0.62], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const a = on * settle;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: r.x,
                top: r.y * yk,
                width: r.w * (P ? 1.3 : 1),
                height: r.h * (P ? 1.3 : 1),
                borderRadius: 12,
                border: `1.5px solid hsla(${r.hue} 85% 72% / ${(0.5 * a).toFixed(3)})`,
                boxShadow: `0 0 14px hsla(${r.hue} 90% 62% / ${(0.32 * a).toFixed(3)}), inset 0 0 12px hsla(${r.hue} 90% 62% / ${(0.14 * a).toFixed(3)})`,
                filter: 'blur(0.8px)',
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* 光管层 */}
      <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0, opacity: mapIn }}>
        <defs>
          {/* 每条管一个 userSpaceOnUse 渐变（沿管起终点），彩虹沿管线方向铺开。
              objectBoundingBox 在纯水平/垂直线上宽或高为 0 会禁用 paint，必须用户坐标。 */}
          {PIPES.map((p, i) => {
            const nums = p.path.match(/-?[\d.]+/g)!.map(Number);
            const [x1, y1] = [nums[0], nums[1]];
            const [x2, y2] = [nums[nums.length - 2], nums[nums.length - 1]];
            return (
              <linearGradient key={i} id={`rainbow-${uid}-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                <stop offset="0%" stopColor="#ffe14d" />
                <stop offset="28%" stopColor="#ff8a5a" />
                <stop offset="52%" stopColor="#ff5ad0" />
                <stop offset="76%" stopColor="#b46bff" />
                <stop offset="100%" stopColor="#5ad0ff" />
              </linearGradient>
            );
          })}
          {/* userSpaceOnUse：纯水平/垂直直线管的 bbox 为零，百分比滤镜区域会坍缩成 0 导致整条管不渲染 */}
          <filter id={`pipeGlow-${uid}`} filterUnits="userSpaceOnUse" x="0" y="0" width="1920" height={SH}>
            <feGaussianBlur stdDeviation={9 * sw} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`soft-${uid}`} filterUnits="userSpaceOnUse" x="0" y="0" width="1920" height={SH}>
            <feGaussianBlur stdDeviation={3.5 * sw} />
          </filter>
        </defs>
        {PIPES.map((p, i) => {
          const grow = interpolate(frame, [p.tPipe, p.tPipe + GROW], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.quad),
          });
          if (grow <= 0) return null;
          const dashOn = p.len * grow;
          const pulse = frame > allOn ? 0.84 + 0.16 * Math.sin((frame - allOn) * 0.16 + i) : 1;
          // 输送感：亮脉冲沿管线方向（图标→中枢）持续循环流动
          const flowOffset = -((frame - p.tPipe) * FLOW_SPEED * sw + i * 37);
          const flowIn = interpolate(frame, [p.tPipe + GROW, p.tPipe + GROW + 8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const head = pointAt(p.path, dashOn);
          const growing = grow < 1;
          const per = FLOW_PERIOD * sw;
          return (
            <g key={i}>
              <g filter={`url(#pipeGlow-${uid})`}>
                <path
                  d={p.path}
                  fill="none"
                  stroke={`url(#rainbow-${uid}-${i})`}
                  strokeWidth={12 * sw}
                  strokeLinecap="round"
                  strokeDasharray={`${dashOn} ${p.len + 60}`}
                  opacity={0.9 * pulse}
                />
              </g>
              {/* 白热芯：细而亮，管体读作"发光的管"而不是色带 */}
              <path
                d={p.path}
                fill="none"
                stroke="rgba(255,250,255,0.92)"
                strokeWidth={3 * sw}
                strokeLinecap="round"
                strokeDasharray={`${dashOn} ${p.len + 60}`}
                opacity={0.8 * pulse}
              />
              {/* 生长头火花：只在 9f 生长期内出现 */}
              {growing && (
                <>
                  <circle cx={head[0]} cy={head[1]} r={16 * sw} fill="rgba(255,240,255,0.5)" filter={`url(#soft-${uid})`} />
                  <circle cx={head[0]} cy={head[1]} r={5.5 * sw} fill="#fff" />
                </>
              )}
              {grow >= 1 && flowIn > 0 && (
                <>
                  {/* 彗星拖尾：较长、较暗，柔化 */}
                  <path
                    d={p.path}
                    fill="none"
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth={8 * sw}
                    strokeLinecap="round"
                    strokeDasharray={`${26 * sw} ${per - 26 * sw}`}
                    strokeDashoffset={flowOffset}
                    opacity={0.38 * flowIn}
                    filter={`url(#soft-${uid})`}
                  />
                  {/* 彗星亮头：位于拖尾前端（朝中枢方向） */}
                  <path
                    d={p.path}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={6 * sw}
                    strokeLinecap="round"
                    strokeDasharray={`${7 * sw} ${per - 7 * sw}`}
                    strokeDashoffset={flowOffset - 19 * sw}
                    opacity={0.95 * flowIn}
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* 图标瓷贴：同帧弹现（一次过冲），连通后染色余光；可选名称标签 */}
      {PIPES.map((p, i) => {
        const appear = interpolate(frame, [p.tIcon, p.tIcon + 13], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (appear <= 0) return null;
        const pop = Easing.bezier(0.34, 1.5, 0.64, 1)(appear); // 过冲 ~8% 再回落
        const on = interpolate(frame, [p.tPipe + GROW - 2, p.tPipe + GROW + 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.cubic),
        });
        const lbl = (apps[['web', 'cart', 'mail', 'chat', 'chart'].indexOf(p.kind)] || '').trim(); // 标签按图标种类对应（与 meta 顺序一致）
        const half = 56 * K;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.icon[0] - half,
              top: p.icon[1] - half,
              width: half * 2,
              height: half * 2,
              opacity: Math.min(1, appear * 2.2),
              transform: `translateY(${((1 - pop) * 22).toFixed(2)}px) scale(${(0.72 + 0.28 * pop).toFixed(4)})`,
            }}
          >
            <div style={{ transform: `scale(${K})`, transformOrigin: '0 0' }}>
              <Tile kind={p.kind} tint={p.tint} amber={BRAND.amber} on={on * (frame > allOn ? 0.82 + 0.18 * breathe : 1)} />
            </div>
            {lbl ? (
              <div style={{
                position: 'absolute', left: half - 300, width: 600, textAlign: 'center',
                top: p.labelAbove ? undefined : half * 2 + 16 * K, bottom: p.labelAbove ? half * 2 + 14 * K : undefined,
                fontFamily: fonts.sans, fontWeight: 600, fontSize: labelSize(lbl), lineHeight: 1.3, color: 'rgba(245,240,255,0.92)', whiteSpace: 'nowrap',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}>{lbl}</div>
            ) : null}
          </div>
        );
      })}

      {/* 中枢面板：双面卡整体翻转 180°（正面旧页 → 背面新中枢页） */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', perspective: 1500 * zEnd }}>
        <div
          style={{
            transform: `translate(${panX.toFixed(2)}px, ${panY.toFixed(2)}px) rotateY(${rotY.toFixed(3)}deg)`,
            position: 'relative',
            transformStyle: 'preserve-3d',
            width: PW * zoom,
            height: PH * zoom,
            flexShrink: 0,
          }}
        >
          {/* 正面：翻转前的旧页面 */}
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
            <div style={{ zoom }}>
              <FrontPanel glow={panelGlow} title={oldTitle} note={oldNote} font={fonts.sans} />
            </div>
          </div>
          {/* 背面：翻正后得到的新中枢页（预转 180° 使翻完时朝向镜头且不镜像） */}
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <div style={{ zoom }}>
              <HubPanel glow={panelGlow} title={title} items={items} font={fonts.sans} />
            </div>
          </div>
          {/* 面板过曝罩：爆发期盖白 */}
          <div
            style={{
              position: 'absolute',
              inset: -6 * zoom,
              borderRadius: 18 * zoom,
              background: '#ffffff',
              opacity: Math.min(0.96, bloom * 1.05),
              filter: `blur(${5 * zoom}px)`,
              pointerEvents: 'none',
              transform: rotY > 90 ? 'rotateY(180deg) translateZ(1px)' : 'translateZ(1px)',
              backfaceVisibility: 'hidden',
            }}
          />
        </div>
      </AbsoluteFill>

      {/* 管口接入：五管同帧抵达中枢边缘时各起一圈小涟漪（在面板之上） */}
      {PIPES.map((p, i) => {
        const nums = p.path.match(/-?[\d.]+/g)!.map(Number);
        const [ex, ey] = [nums[nums.length - 2], nums[nums.length - 1]];
        const k = interpolate(frame, [p.tPipe + GROW - 1, p.tPipe + GROW + 13], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (k <= 0 || k >= 1) return null;
        const r = (6 + Easing.out(Easing.cubic)(k) * 26) * sw;
        return (
          <div
            key={`port-${i}`}
            style={{
              position: 'absolute', left: ex - r, top: ey - r, width: r * 2, height: r * 2, borderRadius: '50%',
              border: `${2 * sw}px solid rgba(255,255,255,0.9)`, opacity: (1 - k) * 0.85,
              boxShadow: '0 0 12px rgba(255,200,255,0.6)',
            }}
          />
        );
      })}

      {/* 全屏白热眩光：白核+品红/粉翼+青蓝斑（竖版按中心放大到全高） */}
      {bloom > 0.02 && (
        <div style={{ position: 'absolute', left: 0, top: (SH - 1080) / 2, width: 1920, height: 1080, pointerEvents: 'none', transform: `scale(${P ? 1.7 : 1})`, transformOrigin: '50% 50%' }}>
          <div
            style={{
              position: 'absolute',
              left: 300,
              top: 60,
              width: 1100,
              height: 900,
              background:
                'radial-gradient(closest-side, rgba(255,255,255,0.98), rgba(255,235,255,0.75) 42%, rgba(255,120,230,0.4) 68%, transparent 88%)',
              filter: 'blur(26px)',
              opacity: Math.min(1, bloom * (0.94 + 0.06 * noise)),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 1150,
              top: 150,
              width: 700,
              height: 620,
              background: 'radial-gradient(closest-side, rgba(255,90,208,0.85), rgba(200,70,255,0.4) 60%, transparent 85%)',
              filter: 'blur(34px)',
              opacity: bloom * 0.9,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 40,
              top: 480,
              width: 620,
              height: 520,
              background: 'radial-gradient(closest-side, rgba(140,210,255,0.8), rgba(90,120,255,0.35) 60%, transparent 85%)',
              filter: 'blur(30px)',
              opacity: bloom * 0.85,
            }}
          />
          {/* 横向紫白光痕（左侧光痕），只随侧棱闪出现 */}
          <div
            style={{
              position: 'absolute',
              left: 30,
              top: 700,
              width: 420,
              height: 40,
              borderRadius: 20,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.9), rgba(170,90,255,0.7), transparent)',
              filter: 'blur(16px)',
              opacity: interpolate(frame, [20, 34, 70, 92], [0, 0.9, 0.5, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          />
        </div>
      )}
      <Vignette strength={0.55} inner={0.42} color="#040308" />
      <Grain opacity={0.07} blend="soft-light" />
    </AbsoluteFill>
  );
};
