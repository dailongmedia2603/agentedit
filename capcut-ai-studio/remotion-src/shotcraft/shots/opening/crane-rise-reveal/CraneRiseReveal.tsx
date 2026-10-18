// 升降臂拉升揭示（crane-rise-reveal）——crane shot：焦点 → 全局。
//
// 第二轮重设计（瓷白 SaaS · 产品数据面板）：
// - look = porcelain（冷白 + 钴蓝，青绿点缀）。世界 = 一扇为镜头设计的产品窗口：顶栏 + 页头（右侧 104px 的 KPI）
//   + 12 行订单表。开场相机 3.0× 怼在第 10 行上——单号 / 路线在画面里是 63px 的大字，行首一枚钴蓝"正在追踪"标，
//   观众先看清"这是一条具体的数据"。
// - 拉升：translate = 屏幕中心 − 对准点×scale，对准点与 scale 共用一条 bezier(0.2,0,0.25,1)（零速起步、
//   ~19% 处峰速、长尾临顶缓停 = 升降臂手感）。视野上缘每越过一行，该行一道钴蓝洗光从行首掠过（越线触发、
//   与运镜逐帧同步）——"一行行涌入"；页头 KPI 同步从 0 数到 48.210（体量感），窗口最后整体脱离画框、
//   落成瓷白舞台上的一件实物（背景点阵按 0.35 视差慢移，读出纵深）。
// - 余波：落定后被追踪的那一行状态胶囊由「Đang giao」翻成青绿「Đã giao」+ 对勾——hold 段里唯一的小事件，
//   结尾帧 = 「你盯着的这一行，只是这面墙的一格」。
//
// 时间表（30fps，共 165f）：
//   0–24    特写 hold：相机 +1.5% 预备推近（吸一口气），行首追踪点呼吸
//   24–126  拉升 102f：前 ~40f 快速段包 CameraMotionBlur；行洗光越线触发；KPI 计数（expo-out，与运镜同期收）
//   126–138 落定：窗口阴影收到静置高度、KPI 末位落定
//   134–148 余波：追踪行状态翻「Đã giao」（弹簧 damping 16）
//   148–165 hold 干净落定
//
// [Agent Edit] o chu: title (tieu de trang) / number (KPI lon, dem tu 0 neu la so) / label (nhan duoi KPI) / kicker (nhan
// tren tieu de) / focus (noi dung hang duoc theo doi — hang camera soi luc mo dau). Du lieu bang = don hang gia tieng Viet
// trung tinh. Khung doc (portrait.mode = 'native'): cua so san pham cao het khung (~29 hang, chu x1.6, bo cot don vi / du kien,
// KPI xuong dong rieng), camera 3.0x soi hang theo doi o giua khung roi keo len toan bo — cung mot cong thuc
// translate = tam man hinh - diem ngam x scale voi tam (960, H/2); khung ngang giu nguyen bo cuc goc.
import { useCurrentFrame, useVideoConfig, useText, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { bezier, ramp, mix, EASE, FONT, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const CRANE_RISE_REVEAL_DURATION = 165; // 特写 hold 24f + 拉升 102f + 落定/余波/hold 39f

const L = LOOKS.porcelain;
const HOLD = 24;
const MOVE_END = 126;
const BLUR_END = 64; // 速度降到峰值 ~35% 以下即撤运动模糊（慢段包了会抹软文字）
const FLIP = 134; // 追踪行状态翻「Đã giao」
const crane = bezier(0.2, 0, 0.25, 1);
const S0 = 3.0;
const BREATH = 0.015;
const F0X = 441; // 特写对准点 x：追踪点落在画面左缘 ~60px，窗口左边框刚好出画

// ───────────── 世界几何（终帧 = 世界 1:1）：横版 = 原版坐标；竖版 = 一扇高窗口（字 ×1.6、行更多） ─────────────
type Col = { id: number; route: number; carrier: number | null; eta: number | null; status: number; prog: number; progW: number; kg: number; kgW: number; routeW: number };
type Geo = {
  SH: number; portrait: boolean; k: number;
  WX: number; WY: number; WW: number; WH: number; PAD: number; CX: number; BAR_H: number;
  HEAD_Y: number; THEAD_Y: number; ROW0: number; ROW_H: number; ROWS: number; TRACK: number; COL: Col;
};
const geoOf = (SH: number): Geo => {
  const portrait = SH > 1080 * 1.2;
  if (!portrait) {
    const WX = 120, WY = 90, WW = 1680, WH = 900, PAD = 48, BAR_H = 72;
    return {
      SH, portrait, k: 1, WX, WY, WW, WH, PAD, CX: WX + PAD, BAR_H, HEAD_Y: WY + BAR_H, THEAD_Y: WY + 262, ROW0: WY + 302, ROW_H: 48, ROWS: 12, TRACK: 9,
      COL: { id: 0, route: 172, routeW: 370, carrier: 560, eta: 790, status: 930, prog: 1150, progW: 260, kg: 1480, kgW: 84 },
    };
  }
  const k = 1.6;
  const WX = 120, WY = 140, WW = 1680, WH = SH - 280, PAD = 56, BAR_H = 112;
  const HEAD_Y = WY + BAR_H;
  const THEAD_Y = HEAD_Y + 600;
  const ROW0 = THEAD_Y + 66;
  const ROW_H = 80;
  const ROWS = Math.max(8, Math.floor((WY + WH - 40 - ROW0) / ROW_H));
  return {
    SH, portrait, k, WX, WY, WW, WH, PAD, CX: WX + PAD, BAR_H, HEAD_Y, THEAD_Y, ROW0, ROW_H, ROWS, TRACK: Math.max(3, ROWS - 6),
    COL: { id: 0, route: 210, routeW: 520, carrier: null, eta: null, status: 760, prog: 1030, progW: 300, kg: 1424, kgW: 144 },
  };
};
const rowTop = (G: Geo, i: number) => G.ROW0 + i * G.ROW_H;

// ───────────── 相机 ─────────────
const camAt = (G: Geo, frame: number) => {
  const HY = G.SH / 2;
  const breath = ramp(frame, 0, HOLD, EASE.smooth);
  const e = crane(Math.min(1, Math.max(0, (frame - HOLD) / (MOVE_END - HOLD))));
  const s0 = S0 * (1 + BREATH * breath);
  const s = mix(s0, 1, e);
  // 特写取景下缘停在窗口底边上方 30px（圆角之上，不露窗外），推近时对准点同步下移保持贴底
  const fy0 = G.WY + G.WH - 30 - HY / s0;
  const fx = mix(F0X, 960, e);
  const fy = mix(fy0, HY, e);
  return { s, e, tx: 960 - fx * s, ty: HY - fy * s, visTop: fy - HY / s };
};

// ───────────── 数据（虚构的订单表，越南语中性占位）─────────────
type Status = 'transit' | 'customs' | 'delivered' | 'loading';
type Row = { id: string; route: string; carrier: string; eta: string; status: Status; prog: number; kg: string };
const BASE: Omit<Row, 'id'>[] = [
  { route: 'Hà Nội → Hải Phòng', carrier: 'Kho Bắc', eta: '09:40', status: 'delivered', prog: 1, kg: '104' },
  { route: 'Đà Nẵng → Huế', carrier: 'Kho Trung', eta: '10:15', status: 'transit', prog: 0.72, kg: '96' },
  { route: 'Cần Thơ → Cà Mau', carrier: 'Kho Nam', eta: '11:05', status: 'customs', prog: 0.48, kg: '120' },
  { route: 'Hà Nội → Nam Định', carrier: 'Kho Bắc', eta: '11:30', status: 'transit', prog: 0.61, kg: '150' },
  { route: 'TP.HCM → Vũng Tàu', carrier: 'Kho Nam', eta: '12:10', status: 'loading', prog: 0.12, kg: '73' },
  { route: 'Nha Trang → Đà Lạt', carrier: 'Kho Trung', eta: '12:45', status: 'transit', prog: 0.83, kg: '180' },
  { route: 'Huế → Quảng Trị', carrier: 'Kho Trung', eta: '13:20', status: 'delivered', prog: 1, kg: '210' },
  { route: 'TP.HCM → Biên Hòa', carrier: 'Kho Nam', eta: '13:55', status: 'transit', prog: 0.54, kg: '172' },
  { route: 'Hải Phòng → Hạ Long', carrier: 'Kho Bắc', eta: '14:05', status: 'customs', prog: 0.4, kg: '140' },
  { route: 'Hà Nội → TP.HCM', carrier: 'Kho Bắc', eta: '14:20', status: 'transit', prog: 0.91, kg: '165' },
  { route: 'Quy Nhơn → Pleiku', carrier: 'Kho Trung', eta: '14:50', status: 'loading', prog: 0.2, kg: '90' },
  { route: 'Cần Thơ → Sóc Trăng', carrier: 'Kho Nam', eta: '15:30', status: 'transit', prog: 0.66, kg: '120' },
];
const rowData = (i: number): Row => {
  const b = BASE[i % BASE.length];
  const cyc = Math.floor(i / BASE.length);
  const hh = 9 + ((i * 37) % 420) / 60;
  return {
    ...b,
    id: `ĐH-${String(401 + i).padStart(4, '0')}`,
    eta: cyc ? `${String(Math.floor(hh) + 6).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}` : b.eta,
    prog: cyc && b.status !== 'delivered' ? Math.min(0.95, (b.prog + 0.17 * cyc) % 1) : b.prog,
  };
};

const STATUS = {
  transit: { label: 'Đang giao', fg: '', bg: '' },
  customs: { label: 'Chờ duyệt', fg: '#b7791f', bg: 'rgba(214,158,46,0.13)' },
  delivered: { label: 'Đã giao', fg: '#00866f', bg: '' },
  loading: { label: 'Xếp hàng', fg: '', bg: 'rgba(76,86,110,0.09)' },
} as const;
const statusStyle = (kind: Status) => {
  const s = STATUS[kind];
  if (kind === 'transit') return { label: s.label, fg: L.accent, bg: alpha(L.accent, 0.1) };
  if (kind === 'delivered') return { label: s.label, fg: s.fg, bg: alpha(L.accent2, 0.13) };
  if (kind === 'loading') return { label: s.label, fg: L.ink2, bg: s.bg };
  return { label: s.label, fg: s.fg, bg: s.bg };
};

const text = (size: number, weight: number, color: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
  position: 'absolute', fontFamily: FONT.sans, fontSize: size, fontWeight: weight, color, whiteSpace: 'nowrap',
  letterSpacing: size >= 40 ? '-0.03em' : '-0.01em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', ...extra,
});

const Pill: React.FC<{ kind: Status; x: number; y: number; k: number; scale?: number; check?: number }> = ({ kind, x, y, k, scale = 1, check = 0 }) => {
  const s = statusStyle(kind);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, height: 28 * k, padding: `0 ${13 * k}px 0 ${10 * k}px`, borderRadius: 14 * k, background: s.bg,
      display: 'flex', alignItems: 'center', gap: 7 * k, transform: `scale(${scale})`, transformOrigin: '0% 50%',
    }}>
      {kind === 'delivered' && check > 0 ? (
        <svg width={14 * k} height={14 * k} viewBox="0 0 14 14">
          <path d="M2.5 7.4 L5.6 10.2 L11.5 3.8" fill="none" stroke={s.fg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - check} />
        </svg>
      ) : (
        <div style={{ width: 7 * k, height: 7 * k, borderRadius: 4 * k, background: s.fg }} />
      )}
      <span style={{ fontFamily: FONT.sans, fontSize: 17 * k, fontWeight: 600, color: s.fg, letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{s.label}</span>
    </div>
  );
};

// 一行订单
const RowView: React.FC<{ G: Geo; i: number; frame: number; focusText: string }> = ({ G, i, frame, focusText }) => {
  const { k, COL, CX, WX, WW, PAD, ROW_H, TRACK, ROWS } = G;
  const r = rowData(i);
  const top = rowTop(G, i);
  const tracked = i === TRACK;
  const flip = tracked ? springAt(frame, FLIP, { damping: 16, stiffness: 190 }) : 0;
  const kind: Status = tracked && frame >= FLIP + 2 ? 'delivered' : tracked ? 'transit' : r.status;
  const p0 = tracked ? 0.91 : r.prog;
  const prog = tracked ? mix(p0, 1, ramp(frame, FLIP - 4, 16, EASE.out)) : p0;
  const pillPop = tracked && frame >= FLIP ? 0.86 + 0.14 * flip : 1;
  const check = tracked ? ramp(frame, FLIP + 4, 10, EASE.out) : 0;
  // 追踪点呼吸（特写 hold 段最明显，之后保持轻呼吸）
  const beat = 0.5 + 0.5 * Math.sin(frame / 5.5);
  const ty = top + ROW_H / 2;
  const fg = L.ink;
  // 对焦：特写 hold 时只有追踪行是实的，其余行压到 38%，起吊后 ~26f 内回满
  const focus = tracked ? 1 : mix(0.38, 1, ramp(frame, HOLD - 2, 28, EASE.out));
  const route = tracked ? focusText : r.route;
  // 追踪行：特写时整段要落在 3× 取景内（右缘 = F0X + 960/S0），过长则折两行
  const trackW = Math.min((COL.eta ?? COL.status) - COL.route - 24, F0X + 960 / S0 - (CX + COL.route) - 12);
  const mw = tracked ? trackW : COL.routeW;
  let rLines = [route];
  let rs = fitSize(route, { family: FONT.sans, size: 21 * k, maxWidth: mw, weight: 600, minSize: 13 * k });
  if (tracked && rs < 17 * k) {
    rLines = wrapLines(route, FONT.sans, 17 * k, mw, 600, 2);
    rs = Math.min(17 * k, ...rLines.map((l) => fitSize(l, { family: FONT.sans, size: 17 * k, maxWidth: mw, weight: 600, minSize: 11 * k })));
  }
  return (
    <div style={{ opacity: focus }}>
      {tracked && (
        <div style={{
          position: 'absolute', left: WX + 10, top: top + 3 * k, width: WW - 20, height: ROW_H - 6 * k, borderRadius: 12 * k,
          background: `linear-gradient(90deg, ${alpha(L.accent, 0.11)} 0%, ${alpha(L.accent, 0.05)} 60%, ${alpha(L.accent, 0.03)} 100%)`,
          boxShadow: `inset 0 0 0 1px ${alpha(L.accent, 0.22)}`,
        }} />
      )}
      {!tracked && i < ROWS - 1 && i !== TRACK - 1 && (
        <div style={{ position: 'absolute', left: CX, top: top + ROW_H - 0.5, width: WW - PAD * 2, height: 1, background: L.line }} />
      )}
      {tracked && (
        <>
          <div style={{ position: 'absolute', left: CX - 26, top: ty - 5 * k, width: 10 * k, height: 10 * k, borderRadius: 5 * k, background: L.accent }} />
          <div style={{
            position: 'absolute', left: CX - 26 - 6 * beat * k, top: ty - (5 + 6 * beat) * k, width: (10 + 12 * beat) * k, height: (10 + 12 * beat) * k,
            borderRadius: 20 * k, border: `1.5px solid ${alpha(L.accent, 0.5 * (1 - beat))}`,
          }} />
        </>
      )}
      <span style={text(20 * k, 600, tracked ? L.accent : L.ink2, { left: CX + COL.id, top: ty - 10 * k, fontFamily: FONT.mono, letterSpacing: '0em' })}>{r.id}</span>
      <div style={text(rs, 600, fg, { left: CX + COL.route, top: ty - rs * 0.56 * rLines.length, lineHeight: 1.12 })}>
        {rLines.map((l, j) => <div key={j}>{l}</div>)}
      </div>
      {COL.carrier !== null && <span style={text(20 * k, 500, L.ink2, { left: CX + COL.carrier, top: ty - 10 * k })}>{tracked ? '' : r.carrier}</span>}
      {COL.eta !== null && <span style={text(20 * k, 500, L.ink2, { left: CX + COL.eta, top: ty - 10 * k })}>{r.eta}</span>}
      <Pill kind={kind} x={CX + COL.status} y={ty - 14 * k} k={k} scale={pillPop} check={check} />
      {/* 进度条 */}
      <div style={{ position: 'absolute', left: CX + COL.prog, top: ty - 3 * k, width: COL.progW, height: 6 * k, borderRadius: 3 * k, background: 'rgba(15,30,60,0.07)' }}>
        <div style={{
          width: `${prog * 100}%`, height: '100%', borderRadius: 3 * k,
          background: kind === 'delivered' ? L.accent2 : tracked ? L.accent : alpha(L.ink, 0.32),
        }} />
      </div>
      <span style={text(20 * k, 500, L.ink2, { left: CX + COL.kg, top: ty - 10 * k, width: COL.kgW, textAlign: 'right' })}>
        {r.kg}<span style={{ color: L.ink3 }}> kg</span>
      </span>
    </div>
  );
};

type Texts = { title: string; number: string; label: string; kicker: string; focus: string };
// KPI：数字部分从 0 数上来（越南语千分位点），非数字原样显示
const kpiAt = (raw: string, p: number) => {
  const m = /^([^\d]*)([\d.,]+)(.*)$/.exec(raw.trim());
  if (!m) return raw;
  const digits = m[2].replace(/[.,]/g, '');
  const dec = /,\d{1,2}$/.test(m[2]) ? m[2].split(',')[1].length : 0;
  const v = Number(digits) / Math.pow(10, dec);
  if (!Number.isFinite(v)) return raw;
  const cur = v * p;
  const fixed = dec ? cur.toFixed(dec) : String(Math.round(cur));
  const [a, b] = fixed.split('.');
  return m[1] + a.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (b ? ',' + b : '') + m[3];
};

// 产品窗口（世界坐标）
const World: React.FC<{ G: Geo; frame: number; T: Texts; headTrig: number }> = ({ G, frame, T, headTrig }) => {
  const { k, WX, WY, WW, WH, PAD, CX, BAR_H, HEAD_Y, THEAD_Y, ROW0, COL, portrait } = G;
  // 窗口阴影：特写时贴近（几乎不可见），拉开后升到悬浮高度——"它是一件放在舞台上的东西"
  const elev = mix(6, 34, ramp(frame, HOLD + 30, MOVE_END - HOLD - 20, EASE.swift));
  const kpiP = ramp(frame, HOLD + 6, MOVE_END - HOLD + 4, EASE.snappy);
  const headOn = ramp(frame, headTrig - 8, 20, EASE.out);
  const cw = WW - PAD * 2;
  const titleSize = fitSize(T.title, { family: FONT.sans, size: portrait ? 104 : 64, maxWidth: portrait ? cw : cw - 560, weight: 700, minSize: portrait ? 56 : 36 });
  const kpiBase = portrait ? 176 : 104;
  const kpiSize = fitSize(T.number, { family: FONT.sans, size: kpiBase, maxWidth: portrait ? cw : 520, weight: 750, minSize: kpiBase * 0.5 });
  const tabs = ['Tổng quan', 'Đơn hàng', 'Kho', 'Báo cáo', 'Khách hàng'];
  const kickCaps = T.kicker.length <= 30;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{
        position: 'absolute', left: WX, top: WY, width: WW, height: WH, borderRadius: 28 * k, background: L.surface,
        boxShadow: `inset 0 0 0 1px ${L.line}, ${softShadow(elev, { color: L.shadow, strength: 1.15 })}, 0 ${elev * 2}px ${elev * 4}px -${elev}px ${alpha(L.shadow, 0.14)}`,
      }} />
      {/* 顶栏 */}
      <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: BAR_H, borderBottom: `1px solid ${L.line}` }} />
      {/* 品牌：视频自己的标志 + 名称（无品牌则只留中性标志） */}
      <ShotcraftMark size={32 * k} tone="light" style={{ position: 'absolute', left: CX - 3, top: WY + (BAR_H - 32 * k) / 2 }} />
      <span style={text(22 * k, 700, BRAND.ink, { left: CX + 38 * k, top: WY + BAR_H / 2 - 11 * k, fontFamily: BRAND.font, letterSpacing: '0.02em', maxWidth: portrait ? 560 : 200, overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 })}>{BRAND.name}</span>
      <div style={{ position: 'absolute', left: CX + (portrait ? 620 : 250), top: WY, height: BAR_H, display: 'flex', gap: 40 * (portrait ? 0.9 : 1) }}>
        {(portrait ? tabs.slice(0, 3) : tabs).map((t, i) => (
          <div key={t} style={{ position: 'relative', height: BAR_H, display: 'flex', alignItems: 'center' }}>
            <span style={{ ...text(18 * k, i === 1 ? 600 : 500, i === 1 ? L.ink : L.ink3), position: 'relative' }}>{t}</span>
            {i === 1 && <div style={{ position: 'absolute', left: -2, right: -2, bottom: -1, height: 2 * k, background: L.ink }} />}
          </div>
        ))}
      </div>
      {!portrait && (
        <div style={{ position: 'absolute', left: WX + WW - PAD - 330, top: WY + 18, width: 270, height: 36, borderRadius: 10, background: L.surface2, boxShadow: `inset 0 0 0 1px ${L.line}` }}>
          <span style={text(17, 500, L.ink3, { left: 16, top: 10 })}>Tìm đơn hàng…</span>
          <span style={text(14, 600, L.ink3, { left: 228, top: 11, fontFamily: FONT.mono })}>⌘K</span>
        </div>
      )}
      <div style={{ position: 'absolute', left: WX + WW - PAD - 40 * k, top: WY + (BAR_H - 36 * k) / 2, width: 36 * k, height: 36 * k, borderRadius: 18 * k, background: `linear-gradient(135deg, ${alpha(L.accent, 0.45)}, ${L.accent})` }} />

      {/* 页头：标题 + KPI */}
      <div style={{ opacity: 0.35 + 0.65 * headOn }}>
        {T.kicker ? <span style={text(16 * k, 700, L.accent, { left: CX, top: HEAD_Y + 44 * k * (portrait ? 0.8 : 1), letterSpacing: kickCaps ? '0.16em' : '0.02em', lineHeight: 1.2 })}>{kickCaps ? T.kicker.toUpperCase() : T.kicker}</span> : null}
        <span style={text(titleSize, 700, L.ink, { left: CX - 3, top: HEAD_Y + (portrait ? 96 : 72), letterSpacing: '-0.035em', lineHeight: 1.15 })}>{T.title}</span>
        <span style={text(20 * k, 500, L.ink3, { left: CX, top: HEAD_Y + (portrait ? 236 : 152), lineHeight: 1.2 })}>Cập nhật trực tiếp · 3 kho · 12 tuyến</span>
        {portrait ? (
          <>
            <span style={text(kpiSize, 750, L.ink, { left: CX - 6, top: HEAD_Y + 330, letterSpacing: '-0.045em', lineHeight: 1.05 })}>{kpiAt(T.number, kpiP)}</span>
            <span style={text(30, 500, L.ink3, { left: CX, top: HEAD_Y + 330 + kpiSize * 1.08 + 16, lineHeight: 1.2 })}>
              {T.label}<span style={{ color: '#00866f', fontWeight: 600 }}>{'   ▲ 12,4%'}</span>
            </span>
          </>
        ) : (
          <>
            <span style={text(kpiSize, 750, L.ink, { left: WX + WW - PAD - 520, top: HEAD_Y + 46 + (104 - kpiSize) * 0.6, width: 520, textAlign: 'right', letterSpacing: '-0.045em', lineHeight: 1.05 })}>{kpiAt(T.number, kpiP)}</span>
            <span style={text(20, 500, L.ink3, { left: WX + WW - PAD - 620, top: HEAD_Y + 158, width: 620, textAlign: 'right', lineHeight: 1.2 })}>
              {T.label}<span style={{ color: '#00866f', fontWeight: 600 }}>{'   ▲ 12,4%'}</span>
            </span>
          </>
        )}
      </div>

      {/* 表头 */}
      {([['MÃ ĐƠN', COL.id], ['TUYẾN', COL.route], ['KHO', COL.carrier], ['DỰ KIẾN', COL.eta], ['TRẠNG THÁI', COL.status], ['TIẾN ĐỘ', COL.prog]] as [string, number | null][]).map(([t, x]) =>
        x === null ? null : <span key={t} style={text(14 * k, 700, L.ink3, { left: CX + x, top: THEAD_Y + 14 * k, letterSpacing: '0.14em', lineHeight: 1.2 })}>{t}</span>,
      )}
      <span style={text(14 * k, 700, L.ink3, { left: CX + COL.kg, top: THEAD_Y + 14 * k, width: COL.kgW, textAlign: 'right', letterSpacing: '0.14em', lineHeight: 1.2 })}>KG</span>
      <div style={{ position: 'absolute', left: CX, top: ROW0 - 1, width: WW - PAD * 2, height: 1, background: L.line }} />

      {Array.from({ length: G.ROWS }, (_, i) => <RowView key={i} G={G} i={i} frame={frame} focusText={T.focus} />)}
    </div>
  );
};

// 相机层：世界 → 屏幕
const Cam: React.FC<{ G: Geo; frame: number; children: React.ReactNode }> = ({ G, frame, children }) => {
  const { s, tx, ty } = camAt(G, frame);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: G.SH, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
      {children}
    </div>
  );
};

// 舞台背景点阵：按 0.35 视差跟相机（比窗口"更远"）
const dotsFor = (SH: number) => {
  const out: { x: number; y: number }[] = [];
  for (let y = -600; y <= SH + 620; y += 48) for (let x = -900; x <= 2800; x += 48) out.push({ x, y });
  return out;
};
const BackDots: React.FC<{ G: Geo; frame: number }> = ({ G, frame }) => {
  const { s, tx, ty } = camAt(G, frame);
  const HY = G.SH / 2;
  const k = 0.35;
  const sp = 1 + (s - 1) * k;
  const px = 960 + (tx + 960 * s - 960) * k - 960 * sp; // 让视差层与主相机同心
  const py = HY + (ty + HY * s - HY) * k - HY * sp;
  const dots = React.useMemo(() => dotsFor(G.SH), [G.SH]);
  return (
    <svg width={1920} height={G.SH} style={{ position: 'absolute', left: 0, top: 0 }}>
      <g transform={`translate(${px.toFixed(2)} ${py.toFixed(2)}) scale(${sp.toFixed(4)})`}>
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1.6} fill={alpha(L.ink, 0.13)} />)}
      </g>
    </svg>
  );
};

const useScene = () => {
  const { height: SH } = useVideoConfig();
  const G = geoOf(SH);
  const T: Texts = {
    title: useText('title', 'Đơn hàng hôm nay'),
    number: useText('number', '48.210'),
    label: useText('label', 'đơn đã xử lý hôm nay'),
    kicker: useText('kicker', 'Trực tiếp · Kho vận'),
    focus: useText('focus', 'Hà Nội → TP.HCM'),
  };
  // 每行洗光触发帧：视野上缘首次越过该行顶边（开场已在画内的行不触发）
  const rowTrig = Array.from({ length: G.ROWS }, (_, i) => {
    if (camAt(G, HOLD).visTop <= rowTop(G, i)) return -1;
    for (let f = HOLD; f <= MOVE_END; f++) if (camAt(G, f).visTop <= rowTop(G, i) + 2) return f;
    return MOVE_END;
  });
  let headTrig = MOVE_END;
  for (let f = HOLD; f <= MOVE_END; f++) if (camAt(G, f).visTop <= G.HEAD_Y + 60) { headTrig = f; break; }
  return { G, T, rowTrig, headTrig };
};

// Page 自己读帧：CameraMotionBlur 靠子树内的 useCurrentFrame 做多重采样，外部传 frame 会把采样冻住
const Page: React.FC = () => {
  const frame = useCurrentFrame();
  const { G, T, headTrig } = useScene();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.02 }} fill={{ x: 0.85, y: 1 }} grain={0} vignette={0.14}>
        <BackDots G={G} frame={frame} />
      </Stage>
      <Cam G={G} frame={frame}>
        <World G={G} frame={frame} T={T} headTrig={headTrig} />
      </Cam>
    </AbsoluteFill>
  );
};

// 行洗光（不进 CameraMotionBlur：半透明色块多重采样会出条带）
const Sweeps: React.FC<{ frame: number }> = ({ frame }) => {
  const { G, rowTrig } = useScene();
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      <Cam G={G} frame={frame}>
        {rowTrig.map((t, i) => {
          if (t < 0 || i === G.TRACK) return null;
          const p = ramp(frame, t, 20, EASE.out);
          const op = Math.min(1, ramp(frame, t, 3, EASE.linear)) * (1 - ramp(frame, t + 6, 18, EASE.out));
          if (op <= 0.002) return null;
          const head = mix(-0.2, 1.1, p);
          return (
            <div key={i} style={{
              position: 'absolute', left: G.WX + 10, top: rowTop(G, i) + 3 * G.k, width: G.WW - 20, height: G.ROW_H - 6 * G.k, borderRadius: 12 * G.k, opacity: op,
              background: `linear-gradient(90deg, ${alpha(L.accent, 0.03)} 0%, ${alpha(L.accent, 0.14)} ${(head * 100).toFixed(1)}%, ${alpha(L.accent, 0)} ${((head + 0.22) * 100).toFixed(1)}%)`,
              boxShadow: `inset 0 0 0 1px ${alpha(L.accent, 0.18)}`,
            }} />
          );
        })}
      </Cam>
    </AbsoluteFill>
  );
};

export const CraneRiseReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const fast = frame > HOLD + 1 && frame < BLUR_END;
  // 特写段的取景暗角：压边聚焦那一行，拉开后收掉（舞台自带的极淡暗角接手）
  const vig = 1 - ramp(frame, HOLD, 60, EASE.swift);
  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden' }}>
      {fast ? (
        <CameraMotionBlur shutterAngle={150} samples={10}>
          <Page />
        </CameraMotionBlur>
      ) : (
        <Page />
      )}
      <Sweeps frame={frame} />
      <AbsoluteFill style={{
        pointerEvents: 'none', opacity: vig,
        background: `radial-gradient(ellipse 75% 70% at 45% 58%, ${alpha(L.shadow, 0)} 55%, ${alpha(L.shadow, 0.16)} 100%)`,
      }} />
    </AbsoluteFill>
  );
};
