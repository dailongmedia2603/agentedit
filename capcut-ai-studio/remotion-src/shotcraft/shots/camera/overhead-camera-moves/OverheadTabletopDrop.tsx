// overhead-tabletop-drop｜上帝视角桌面滑降（第二轮重设计）
// 手法不变：三张页面卡平躺成桌面卡阵，相机俯拍横滑巡视（只动 translateX，角度锁死），
// 滑过目标后一拍停顿，骤降扎入——rotateX / scale / translateX 三通道同跑，抬正成满屏。
//
// 设计决定
// - look：graphite（近单色暗场 · 白 · 一点香槟金）。桌面是深石墨哑光台面，三盏顶灯在台面上各打一个
//   光池，页面像三张刚打印出来的样稿摆在评审桌上——暗桌白纸，反差即层次。台面有发丝网格 + 每张样稿下方
//   一枚印刷标签（01 SHOTS / 02 HOME / 03 CHANGELOG），横滑时它们是"相机在动"的参照。
// - 内容：video-shotcraft 官网的三页——镜头库、首页、更新日志。每页为镜头重新排版：大标题、少元素、
//   真实感文案。目标是中间的首页，落版满屏时它就是一张海报：150px 两行品牌短句 + 右侧分镜板产品图。
// - 节奏：巡视（50f 缓入缓出）→ 选定（停 8f：目标稿离桌 16px、它的顶灯更亮、另外两盏灯暗下去）→
//   骤降（28f，零速起步的不对称曲线，scale 带 ~5% 预备回缩）→ 软回落版（8f）→ 落版后页面里的
//   产品图完成一个小动作：金色「Hero shot」镜头块滑入分镜板空槽、轻过冲落座 → hold。
// - Q2：卡片按落版尺寸 2× 布局栅格化、再在平面内缩回 0.5 摆上桌，扎入满屏时文字是原生分辨率。
//
// 时间表（30fps，共 140f）
//   0–50    横滑巡视：translateX +760→−360（smooth，滑过目标约 1/3 身位），角度锁 62°
//   44–60   选定：目标稿离桌 16px、影子变大变虚；左右两盏顶灯降到 35%，目标灯 +25%
//   58–86   骤降扎入：rotateX 62→−1.6、scale 1→2.04（预备回缩 ~5%）、translateX −360→0 三通道同跑
//   86–94   软回 0° / 2.0 正视满屏；目标稿同时落回桌面
//   98–118  页面内：金色镜头块从右侧滑入空槽（snappy + 一次过冲），同列一块让位下移
//   94–140  hold：极缓推近 1→1.012，尾帧是 video-shotcraft 首页海报
//
// [Agent Edit] o chu: kicker / title / title2 (dong 2 chu nghieng serif) / subtitle / cta cua trang DICH (giua) +
// labels (3 nhan in tren mat ban). O anh tuy chon page1 / page2 / page3: co anh -> the do hien anh (cover) thay trang
// gia (page2 = trang duoc chon, phong full man hinh). Hai trang ben (bang gia / nhat ky cap nhat) = giao dien trung
// tinh tieng Viet. Khung doc (native): the cao theo ti le khung (996 x 996·H/1920), trang xep doc; khi lao xuong the
// phu kin khung doc. Camera (luot ngang 0–50 chi translateX, chon 44–60, lao 58–86 ba kenh cung chay) giu nguyen.
import { useBackdrop, useCurrentFrame, useImage, useList, useShot, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import type { ShotFonts } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { LOOKS, SERIF, alpha, type } from '../../../fixtures/Look';
import { EASE, FONT, Grain, Vignette, bezier, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};


export const OVERHEAD_TABLETOP_DROP_DURATION = 140;

const L = LOOKS.graphite;
const PAPER = '#f4f1ea'; // 样稿纸色（暖白，不用纯白）
const INK = '#141414';
const INK2 = '#5f5c56';
const INK3 = '#9b968c';
const RULE = 'rgba(20,20,20,0.1)';
const GOLD = '#b8893a'; // 纸上的金（比 look 的香槟金深一档，白底可读）

const CARD_W = 996;
const GAP = 150;
const PITCH = CARD_W + GAP;
const RES = 2; // 卡片按落版倍率布局后平面内缩回 0.5

const PAN_END = 50;
const DROP = 58;
const DROP_END = 86;
const SETTLE_END = 94;

const DIVE = bezier(0.36, 0, 0.12, 1); // 零速起步、快速加速、长减速落位
const DIVE_SCALE = bezier(0.45, -0.18, 0.12, 1); // 先回缩 ~5%（机位微抬）再扎

// ───────────── 三页样稿（1920×PGH 设计坐标；横版 PGH = 1080） ─────────────
type PageEnv = { P: boolean; PGH: number; fonts: ShotFonts };

const Nav: React.FC<{ env: PageEnv; active: string }> = ({ env, active }) => {
  const P = env.P;
  const k = P ? 1.5 : 1;
  const brandS = BRAND.name ? fitSize(BRAND.name, { family: env.fonts.sans, size: 32 * k, maxWidth: P ? 760 : 420, weight: 700 }) : 0;
  return (
    <div style={{ position: 'absolute', left: P ? 120 : 150, right: P ? 120 : 150, top: P ? 90 : 60, height: 64 * k, display: 'flex', alignItems: 'center', fontFamily: FONT.sans }}>
      <ShotcraftMark size={44 * k} tone="light" style={{ marginRight: 14 * k, flex: 'none' }} />
      {BRAND.name ? <div style={{ ...type(brandS, 700), lineHeight: 1.2, fontFamily: BRAND.font, letterSpacing: '0.03em', color: INK, whiteSpace: 'nowrap' }}>{BRAND.name}</div> : null}
      {!P && (
        <div style={{ display: 'flex', gap: 46, marginLeft: 90, ...type(26, 550), lineHeight: 1.3, color: INK2, whiteSpace: 'nowrap' }}>
          {['Sản phẩm', 'Bảng giá', 'Cập nhật', 'Hỗ trợ'].map((n) => (
            <span key={n} style={{ color: n === active ? INK : INK2, fontWeight: n === active ? 700 : 550 }}>{n}</span>
          ))}
        </div>
      )}
      <div style={{ marginLeft: 'auto', padding: `${16 * k}px ${30 * k}px`, borderRadius: 999, background: INK, color: PAPER, ...type(24 * k, 650), lineHeight: 1.3, whiteSpace: 'nowrap' }}>Dùng thử</div>
    </div>
  );
};

// 首页右侧产品图：一张内容日程板（五列 × 任务块）；slot = 金色「Ra mắt」块的滑入进度
const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6'];
const BLOCKS: { d: number; y: number; h: number; t: string }[] = [
  { d: 0, y: 40, h: 120, t: 'Quay video' },
  { d: 1, y: 190, h: 150, t: 'Viết bài' },
  { d: 2, y: 60, h: 100, t: 'Chụp ảnh' },
  { d: 3, y: 230, h: 120, t: 'Livestream' },
  { d: 4, y: 40, h: 140, t: 'Gửi email' },
  { d: 0, y: 300, h: 110, t: 'Họp nhóm' },
  { d: 4, y: 290, h: 110, t: 'Báo cáo' },
];
const Planner: React.FC<{ slot: number; left: number; top: number; zoom: number }> = ({ slot, left, top, zoom }) => {
  const colW = 126;
  const x0 = 38;
  const s = Math.max(0, slot);
  return (
    <div style={{ position: 'absolute', left, top, width: 690, height: 600, zoom }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 28, background: '#1a1a1c',
        boxShadow: '0 40px 80px -30px rgba(20,16,8,0.55), 0 0 0 1px rgba(0,0,0,0.2)', overflow: 'hidden', fontFamily: FONT.sans,
      }}>
        <div style={{ position: 'absolute', left: 40, top: 30, ...type(30, 700), lineHeight: 1.3, color: '#f4f4f2' }}>Lịch nội dung</div>
        <div style={{ position: 'absolute', right: 40, top: 34, ...type(24, 550), lineHeight: 1.3, color: '#8f8c86' }}>Tuần 42</div>
        {DAYS.map((d, i) => (
          <div key={d} style={{ position: 'absolute', left: x0 + i * colW, top: 96, width: colW - 12, ...type(22, 650), lineHeight: 1.3, color: '#8f8c86', letterSpacing: '0.12em' }}>{d}</div>
        ))}
        <div style={{ position: 'absolute', left: 40, right: 40, top: 132, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', left: 0, top: 150, width: 700, height: 440 }}>
          {BLOCKS.map((b, i) => {
            // T4 列（d=2）的块在金色块落座时让位下移
            const push = b.d === 2 ? 150 * s : 0;
            return (
              <div key={i} style={{
                position: 'absolute', left: x0 + b.d * colW, top: b.y + push, width: colW - 12, height: b.h, borderRadius: 14,
                background: '#2a2a2d', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', padding: '14px 12px', boxSizing: 'border-box',
                ...type(21, 600), color: '#c9c6bf', lineHeight: 1.25,
              }}>{b.t}</div>
            );
          })}
          {/* 金色任务块：从右侧画外滑入 T4 列的空槽 */}
          <div style={{
            position: 'absolute', left: mix(760, x0 + 2 * colW, slot), top: 60, width: colW - 12, height: 136, borderRadius: 14,
            background: 'linear-gradient(180deg, #e8c983 0%, #d4a85a 100%)', padding: '14px 12px', boxSizing: 'border-box',
            boxShadow: `0 ${12 + 18 * (1 - s)}px ${26 + 20 * (1 - s)}px -8px rgba(212,168,90,0.45), inset 0 1px 0 rgba(255,255,255,0.5)`,
            ...type(22, 750), color: '#2a1e08', lineHeight: 1.25,
          }}>Ra mắt<div style={{ ...type(19, 650), lineHeight: 1.3, color: 'rgba(42,30,8,0.65)', marginTop: 8 }}>20:00</div></div>
        </div>
      </div>
    </div>
  );
};

type HomeText = { kicker: string; title: string; title2: string; subtitle: string; cta: string };

const HomePage: React.FC<{ env: PageEnv; slot: number; t: HomeText }> = ({ env, slot, t }) => {
  const { P, PGH, fonts } = env;
  const colW = P ? 1680 : 900;
  const left = P ? 120 : 150;
  const T0 = P ? 236 : 148;
  // 横版每行 1 行（左栏），竖版各自最多 2 行
  const l1 = t.title ? (P ? wrapLines(t.title, fonts.sans, T0, colW, 800, 2) : [t.title]) : [];
  const l2 = t.title2 ? (P ? wrapLines(t.title2, fonts.serif, T0, colW, 400, 2) : [t.title2]) : [];
  const ts = Math.min(T0, ...l1.map((l) => fitSize(l, { family: fonts.sans, size: T0, maxWidth: colW, weight: 800, letterSpacingEm: -0.05, minSize: T0 * 0.4 })),
    ...l2.map((l) => fitSize(l, { family: fonts.serif, size: T0, maxWidth: colW, weight: 400, italic: true, minSize: T0 * 0.4 })));
  const SS = P ? 62 : 34;
  const sub = t.subtitle ? wrapLines(t.subtitle, fonts.sans, SS, colW - (P ? 0 : 20), 450, 3) : [];
  const kS = P ? 44 : 24;
  const ctaS = P ? 50 : 28;
  const titleTop = P ? 400 : 290;
  const tH = (l1.length + l2.length) * ts * 1.12;
  const subTop = kS * 1.3 + (P ? 50 : 34) + tH + (P ? 60 : 44);
  const ctaTop = subTop + sub.length * SS * 1.4 + (P ? 70 : 52);
  const blockBottom = titleTop + ctaTop + ctaS * 1.3 + (P ? 44 : 44);
  // Khung doc: bang lich xep duoi khoi chu, co theo cho con lai
  const pz = P ? Math.max(1.2, Math.min(2.3, (PGH - 160 - (blockBottom + 120)) / 600)) : 1;
  const plLeft = P ? (1920 - 690 * pz) / 2 / pz : 1080;
  const plTop = P ? (PGH - 160 - 600 * pz) / pz : 250;
  return (
    <div style={{ position: 'absolute', inset: 0, background: PAPER, fontFamily: FONT.sans }}>
      <Nav env={env} active="Sản phẩm" />
      <div style={{ position: 'absolute', left, top: titleTop, width: colW }}>
        {t.kicker ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...type(kS, 700), lineHeight: 1.3, color: GOLD, letterSpacing: '0.18em', whiteSpace: 'nowrap' }}>
            <div style={{ width: 36 * (P ? 1.6 : 1), height: P ? 3 : 2, background: GOLD, flex: 'none' }} />{t.kicker.toUpperCase()}
          </div>
        ) : null}
        <div style={{ ...type(ts, 800), color: INK, marginTop: P ? 50 : 34, lineHeight: 1.12, letterSpacing: '-0.05em' }}>
          {l1.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          {l2.map((l, i) => (
            <div key={`b${i}`} style={{ whiteSpace: 'nowrap', fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.03em' }}>{l}</div>
          ))}
        </div>
        {sub.length ? (
          <div style={{ ...type(SS, 450), color: INK2, marginTop: P ? 60 : 44, lineHeight: 1.4 }}>
            {sub.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 22, marginTop: P ? 70 : 52 }}>
          {t.cta ? <div style={{ padding: P ? '34px 60px' : '22px 40px', borderRadius: 999, background: INK, color: PAPER, ...type(ctaS, 650), lineHeight: 1.3, whiteSpace: 'nowrap' }}>{t.cta}</div> : null}
          <div style={{ padding: P ? '34px 60px' : '22px 40px', borderRadius: 999, boxShadow: `inset 0 0 0 2px ${RULE}`, color: INK, ...type(ctaS, 600), lineHeight: 1.3, whiteSpace: 'nowrap' }}>Xem video →</div>
        </div>
      </div>
      <Planner slot={slot} left={plLeft} top={plTop} zoom={pz} />
    </div>
  );
};

// 价目页：三张方案卡（横版三栏 / 竖版逐行）
const PLANS = [
  { n: 'Cơ bản', p: '0đ', u: 'mỗi tháng', d: 'Đủ để bắt đầu cho người mới.' },
  { n: 'Chuyên nghiệp', p: '199K', u: 'mỗi tháng', d: 'Mở khoá toàn bộ tính năng nâng cao.', hi: true },
  { n: 'Doanh nghiệp', p: '499K', u: 'mỗi tháng', d: 'Cho cả đội, hỗ trợ riêng 24/7.' },
];
const PricingPage: React.FC<{ env: PageEnv }> = ({ env }) => {
  const { P, PGH } = env;
  const k = P ? 1.5 : 1;
  const cardsTop = P ? 760 : 450;
  const cardH = P ? (PGH - cardsTop - 200 - 2 * 50) / 3 : 500;
  return (
    <div style={{ position: 'absolute', inset: 0, background: PAPER, fontFamily: FONT.sans }}>
      <Nav env={env} active="Bảng giá" />
      <div style={{ position: 'absolute', left: 0, right: 0, top: P ? 330 : 200, textAlign: 'center', ...type(104 * k, 800), lineHeight: 1.2, color: INK, letterSpacing: '-0.045em' }}>Chọn gói phù hợp.</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: P ? 560 : 336, textAlign: 'center', ...type(32 * k, 450), lineHeight: 1.3, color: INK2 }}>Bắt đầu miễn phí, nâng cấp khi cần.</div>
      <div style={{ position: 'absolute', left: P ? 140 : 200, right: P ? 140 : 200, top: cardsTop, display: 'flex', flexDirection: P ? 'column' : 'row', gap: P ? 50 : 40 }}>
        {PLANS.map((pl) => (
          <div key={pl.n} style={{
            flex: P ? 'none' : 1, height: cardH, borderRadius: 28 * k, padding: `${44 * k}px ${44 * k}px`, boxSizing: 'border-box',
            background: pl.hi ? INK : '#fbf9f4', color: pl.hi ? PAPER : INK,
            boxShadow: pl.hi ? '0 30px 60px -24px rgba(20,16,8,0.5)' : `inset 0 0 0 2px ${RULE}`,
          }}>
            <div style={{ ...type(30 * k, 650), lineHeight: 1.3, color: pl.hi ? '#e4c58a' : INK2 }}>{pl.n}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 30 }}>
              <div style={{ ...type(120 * k, 800), lineHeight: 1.1, letterSpacing: '-0.05em' }}>{pl.p}</div>
              <div style={{ ...type(26 * k, 500), lineHeight: 1.3, opacity: 0.6 }}>/ {pl.u}</div>
            </div>
            <div style={{ ...type(28 * k, 450), opacity: 0.72, marginTop: 30, lineHeight: 1.4 }}>{pl.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LOG = [
  { v: '2.4', d: '12/09', t: 'Bảng điều khiển mới', b: 'Xem mọi số liệu quan trọng trên một màn hình.' },
  { v: '2.3', d: '28/08', t: 'Xuất báo cáo PDF', b: 'Gửi báo cáo cho khách chỉ với một chạm.' },
  { v: '2.2', d: '09/08', t: 'Đồng bộ đa thiết bị', b: 'Làm trên máy tính, xem tiếp trên điện thoại.' },
];
const ChangelogPage: React.FC<{ env: PageEnv }> = ({ env }) => {
  const P = env.P;
  const k = P ? 1.5 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, background: PAPER, fontFamily: FONT.sans }}>
      <Nav env={env} active="Cập nhật" />
      <div style={{ position: 'absolute', left: P ? 120 : 150, top: P ? 330 : 200, ...type(104 * k, 800), lineHeight: 1.2, color: INK, letterSpacing: '-0.045em' }}>Nhật ký cập nhật</div>
      <div style={{ position: 'absolute', left: P ? 120 : 150, right: P ? 120 : 150, top: P ? 620 : 380 }}>
        {LOG.map((e) => (
          <div key={e.v} style={{ display: 'flex', flexDirection: P ? 'column' : 'row', gap: P ? 30 : 60, padding: P ? '70px 0' : '38px 0', borderTop: `2px solid ${RULE}` }}>
            <div style={{ width: P ? undefined : 260, display: 'flex', flexDirection: P ? 'row' : 'column', alignItems: P ? 'center' : 'flex-start', gap: P ? 30 : 0 }}>
              <div style={{ display: 'inline-block', padding: `${8 * k}px ${18 * k}px`, borderRadius: 999, background: INK, color: PAPER, ...type(24 * k, 700), lineHeight: 1.3 }}>v{e.v}</div>
              <div style={{ ...type(26 * k, 500), lineHeight: 1.3, color: INK3, marginTop: P ? 0 : 14 }}>{e.d}</div>
            </div>
            <div>
              <div style={{ ...type(48 * k, 750), lineHeight: 1.25, color: INK }}>{e.t}</div>
              <div style={{ ...type(28 * k, 450), lineHeight: 1.4, color: INK2, marginTop: 12 }}>{e.b}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 用户图片（任意比例）：铺满整张卡
const PhotoPage: React.FC<{ src: string }> = ({ src }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#1a1a1c' }}>
    <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 50%' }} />
  </div>
);

// ───────────── 桌面 ─────────────

// 单张样稿：平躺在桌面上；lift = 离桌高度（px，沿桌面法线）
const PageCard: React.FC<{ x: number; ch: number; pgh: number; lift?: number; children: React.ReactNode }> = ({ x, ch, pgh, lift = 0, children }) => (
  <div style={{
    position: 'absolute', left: x - (CARD_W * RES) / 2, top: -(ch * RES) / 2, width: CARD_W * RES, height: ch * RES,
    borderRadius: 10 * RES, overflow: 'hidden', boxSizing: 'border-box', background: PAPER,
    boxShadow: `${softShadow((4 + lift * 1.6) * RES, { strength: 3.2, color: '#000000' })}, inset 0 ${RES}px 0 rgba(255,255,255,0.7)`,
    backfaceVisibility: 'hidden', transform: `translateZ(${4 + lift}px) scale(${1 / RES})`,
  }}>
    <div style={{ width: 1920, height: pgh, zoom: (ch * RES) / pgh, position: 'relative' }}>{children}</div>
  </div>
);

// 桌面上的印刷标签：编号 + 页名（等宽、全大写），贴在样稿下沿外
const DeskTag: React.FC<{ x: number; ch: number; n: string; label: string; on: number; shadow?: string }> = ({ x, ch, n, label, on, shadow }) => (
  <div style={{ textShadow: shadow,
    position: 'absolute', left: x - CARD_W / 2, top: ch / 2 + 34, width: CARD_W, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18,
    fontFamily: FONT.mono, fontSize: 30, lineHeight: 1.3, letterSpacing: '0.16em', color: alpha(L.ink, 0.42 + 0.5 * on), transform: 'translateZ(1px)', whiteSpace: 'nowrap',
  }}>
    <span style={{ color: on > 0.5 ? L.accent2 : alpha(L.ink, 0.5) }}>{n}</span>
    <span style={{ flex: 'none', width: 40, height: 2, background: alpha(L.ink, 0.25) }} />
    <span>{label}</span>
  </div>
);

export const OverheadTabletopDrop: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SH > 1080 * 1.2;
  const PGH = P ? SH : 1080; // 页面设计高
  const CARD_H = (CARD_W * PGH) / 1920; // 卡片比例 = 画面比例（落版 scale 2.0 恰满屏）
  const env: PageEnv = { P, PGH, fonts };
  const home: HomeText = {
    kicker: useOptText('kicker', 'Dành cho chủ shop online'),
    title: useText('title', 'Bán hàng nhàn hơn.'),
    title2: useOptText('title2', 'Chốt đơn nhanh hơn.'),
    subtitle: useOptText('subtitle', 'Quản lý đơn, kho và khách hàng trong một ứng dụng duy nhất.'),
    cta: useOptText('cta', 'Dùng thử miễn phí'),
  };
  const tags = useList('labels', ['BẢNG GIÁ', 'TRANG CHỦ', 'CẬP NHẬT']);
  const img1 = useImage('page1');
  const img2 = useImage('page2');
  const img3 = useImage('page3');
  // Co anh ma khong co nhan rieng -> bo nhan mac dinh cua trang gia (chi con so 01/02/03)
  const ownTags = useShot()?.texts.labels !== undefined;
  const fitTag = (s: string) => ((img1 || img2 || img3) && !ownTags ? '' : (s || '').toUpperCase().slice(0, 22));

  // 横滑：只动 translateX（角度锁死——巡视归巡视）
  const panX = mix(760, -360, ramp(f, 0, PAN_END, EASE.smooth));
  // 骤降：三通道同起同止
  const d = ramp(f, DROP, DROP_END - DROP, DIVE);
  const ds = ramp(f, DROP, DROP_END - DROP, DIVE_SCALE);
  const rotX = f < DROP_END
    ? mix(62, -1.6, d)
    : f < 90
      ? mix(-1.6, 0.5, ramp(f, DROP_END, 4, EASE.smooth))
      : mix(0.5, 0, ramp(f, 90, 4, EASE.smooth));
  const push = mix(1, 1.012, ramp(f, SETTLE_END, 46, EASE.smooth)); // 落版后极缓推近
  const scale = (f < DROP_END ? mix(1, 2.04, ds) : mix(2.04, 2.0, ramp(f, DROP_END, SETTLE_END - DROP_END, EASE.smooth))) * push;
  const tx = f <= DROP ? panX : mix(-360, 0, d);

  // 选定：目标稿离桌、顶灯明暗
  const pick = ramp(f, 44, 16, EASE.out);
  const lift = 16 * (pick - ramp(f, 70, 18, EASE.smooth));
  const tilt = Math.max(0, Math.min(1, rotX / 62));
  // 页面内的小动作：金色日程块落座（snappy 位移 + overshoot 收尾）
  const slot = ramp(f, 98, 20, EASE.overshoot);

  // 顶灯光池（世界坐标，落在每张样稿上）：选定后左右两盏暗下去
  const pool = (x: number, k: number) =>
    `radial-gradient(ellipse 820px ${Math.max(620, CARD_H * 1.05).toFixed(0)}px at ${2800 + x}px 3200px, ${alpha('#f2efe6', 0.2 * k)} 0%, ${alpha('#f2efe6', 0.07 * k)} 45%, ${alpha('#f2efe6', 0)} 75%)`;
  const side = 1 - 0.65 * pick;
  const beamH = P ? 1000 : 560; // 顶灯光束长度（横版 −60→500）
  const hero = 1 + 0.25 * pick;
  // [Agent Edit] NEN ANH AI: mat ban / den / toi xa khong ve (anh nen hien ra); nhan tren ban co bong do de doc ro
  const bd = useBackdrop();
  const tagShadow = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[2], overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, perspective: P ? 2600 : 1600, perspectiveOrigin: '50% 42%' }}>
        {/* 世界原点 = 屏心；先 in-plane scale，再 rotateX，最后 translateX */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d',
          transform: `translateX(${tx}px) rotateX(${rotX}deg) scale(${scale})`,
        }}>
          {/* 台面：深石墨 + 三盏顶灯光池（[Agent Edit] bo luoi ke o; co anh nen -> khong ve mat ban） */}
          {!bd && <div style={{
            position: 'absolute', left: -2800, top: -3200, width: 5600, height: 3200 + Math.max(900, CARD_H / 2 + 600), backfaceVisibility: 'hidden',
            background: [
              pool(-PITCH, side), pool(0, hero), pool(PITCH, side),
              `linear-gradient(180deg, ${L.bg[0]}, ${L.bg[1]})`,
            ].join(', '),
          }} />}
          <DeskTag x={-PITCH} ch={CARD_H} n="01" label={fitTag(tags[0])} on={0} shadow={tagShadow} />
          <DeskTag x={0} ch={CARD_H} n="02" label={fitTag(tags[1])} on={pick} shadow={tagShadow} />
          <DeskTag x={PITCH} ch={CARD_H} n="03" label={fitTag(tags[2])} on={0} shadow={tagShadow} />
          <PageCard x={-PITCH} ch={CARD_H} pgh={PGH}>{img1 ? <PhotoPage src={img1} /> : <PricingPage env={env} />}</PageCard>
          <PageCard x={0} ch={CARD_H} pgh={PGH} lift={lift}>{img2 ? <PhotoPage src={img2} /> : <HomePage env={env} slot={slot} t={home} />}</PageCard>
          <PageCard x={PITCH} ch={CARD_H} pgh={PGH}>{img3 ? <PhotoPage src={img3} /> : <ChangelogPage env={env} />}</PageCard>
          {/* 左右样稿随顶灯变暗：盖一层台面色 */}
          {[-PITCH, PITCH].map((x) => (
            <div key={x} style={{
              position: 'absolute', left: x - CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H, borderRadius: 10,
              background: L.bg[1], opacity: 0.08 + 0.34 * pick, transform: 'translateZ(5px)', pointerEvents: 'none',
            }} />
          ))}
        </div>
      </div>
      {/* 顶灯光束（屏幕空间体积光）：三盏灯各一束斜落到样稿上，跟着卡阵横移；扎入时随俯角散去 */}
      {[-PITCH, 0, PITCH].map((x, i) => {
        const k = (i === 1 ? hero : side) * tilt;
        if (k < 0.02 || bd) return null;
        const cx = 960 + tx + x * 0.92; // 卡阵中线 → 屏幕 x（透视下略收拢）
        return (
          <div key={x} style={{
            position: 'absolute', left: cx - 560, top: SH / 2 - 40 - beamH, width: 1120, height: beamH, pointerEvents: 'none', opacity: k,
            filter: 'blur(26px)', mixBlendMode: 'screen',
          }}>
            <div style={{
              position: 'absolute', inset: 0, clipPath: 'polygon(44% 0, 56% 0, 90% 100%, 10% 100%)',
              background: `linear-gradient(180deg, ${alpha('#f2efe6', 0.22)} 0%, ${alpha('#f2efe6', 0.09)} 60%, ${alpha('#f2efe6', 0.0)} 100%)`,
            }} />
          </div>
        );
      })}
      {/* 屏幕空间：远端（画面上部）沉入夜色，随俯角收起；暗角 + 颗粒 */}
      {!bd && <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `linear-gradient(180deg, ${alpha(L.bg[2], 0.95 * tilt)} 0%, ${alpha(L.bg[2], 0.55 * tilt)} 24%, ${alpha(L.bg[2], 0)} 48%)`,
      }} />}
      <Vignette strength={0.12 + 0.45 * tilt} inner={0.45} color="#000000" />
      <Grain opacity={0.04 + 0.05 * tilt} blend="soft-light" />
    </AbsoluteFill>
  );
};
