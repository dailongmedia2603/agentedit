// changelog-scroll-brake —— Changelog 长卷急刹
// ~34 行条目（行高错落）从下往上高速掠过（快起步 + 指数式长尾减速），
// 高速段叠纵向运动模糊（速度差分驱动，糊成色带），急刹精准停位后目标行抬升
// （scale 1.03 + 阴影加深）+ 强调色描边，其余行退暗。f=84 后全静止（66f）。
//
// 质感升级：灰色骨架行换成一整年的真实感更新日志（版本号 / 类型标签 / 标题 / 说明 / 日期，按时间
// 自上而下排列，停点之后是 Planned 路线图条目）；目标行出版级内容（视频里的真实发布）+ 「MỚI」徽标；起步从"第 14 帧
// 瞬间满速"改为 cubic-bezier(0.45,0,0.06,1)（约 5f 拉满速度后长尾刹停）；各向同性 blur 改为沿滚动方向
// 的纵向 SpeedBlur（横向字形不糊，读作真实运动模糊）；顶部固定页眉 + 上下渐隐遮罩；柔光亮场 + 颗粒。
//
// [Agent Edit] o chu: header (tieu de trang, vd "Nhật ký cập nhật") / version, kind, title, desc, date, badge (dong DICH —
// ban phat hanh / tinh nang moi duoc noi trong video) / history (0-8 ten cap nhat truoc do, xep ngay tren dong dich; phan
// con lai la ten trung tinh tieng Viet chi de lam "dai mau" luc cuon nhanh) / planned (0-5 muc lo trinh sau dong dich).
// Dong dich tu cao len theo so dong chu that (tieu de dai -> 2 dong). Khung doc (native): cot danh sach phong 1.8x,
// them dong lo trinh de lap day nua duoi, dong dich doi sang bo cuc doc (dong meta / tieu de lon / mo ta).
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, useBackdrop, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { interpolate } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, FONT, Grain, SpeedBlur, bezier, innerHighlight, softShadow, tracking } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import { alpha } from '../../../fixtures/Look';

export const CHANGELOG_SCROLL_BRAKE_DURATION = 150; // 静置 14f + 滚动 50f + 抬升 14f + 静止 66f

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 时间轴
const SCROLL0 = 14; // 前 14f 初始静置（停在长卷顶部）
const SCROLL1 = 64; // 急刹停位帧
const LIFT0 = 68; // 目标行抬升开始
const LIFT1 = 82;

const COL_W = 1000;
const GAP = 20;
const TARGET = 28;

// 行高错落（帧确定性：全由 i 决定）
const rowH0 = (i: number) => 72 + ((i * 29) % 3) * 22; // 72 / 94 / 116

// 快起步（~5f 到峰速）+ 长尾指数式减速：高开中收
const BRAKE_EASE = bezier(0.45, 0, 0.06, 1);

// ── 假内容：一整年的发布记录（自上而下时间递增，中性越南语，仅作高速段"色带"），停点之后为路线图 ──
const TITLES = [
  'Thêm mẫu cảnh mới', 'Xuất video nhanh hơn', 'Sửa lỗi lệch âm thanh', 'Nhịp cắt theo nhạc nền', 'Hiệu ứng chuyển cảnh mới',
  'Chụp trang web trực tiếp', 'Sửa lỗi phụ đề ở 60 fps', 'Bộ lọc thư viện', 'Lia máy nhanh', 'Mẫu tiêu đề mới', 'Cải thiện giảm âm nền',
  'Sửa viền mờ khi xuất 4K', 'Kịch bản từ một câu lệnh', 'Xem trước ngay trong danh sách', 'Chọn ảnh bìa', 'Lớp chiều sâu thị sai',
  'Sửa lỗi phông chữ tiêu đề', 'Chớp sáng theo nhịp', 'Hạt phim', 'Thanh tên người nói', 'Khởi động nhanh hơn', 'Sửa mặt nạ trên Safari',
  'Thư viện trưng bày', 'Hiệu ứng lóa sáng', 'Tông màu cho từng cảnh', 'Lưu tài nguyên ngoại tuyến', 'Sửa đường đi con trỏ', 'Xuất sang CapCut',
];
const PLANNED = ['Video dọc 9:16', 'Nhập bộ nhận diện', 'So sánh A/B', 'Nhiều rãnh âm thanh', 'Xuất hàng loạt'];
type Kind = 'feature' | 'improved' | 'fix' | 'planned' | 'launch';
const KIND_LABEL: Record<Kind, string> = { feature: 'Tính năng', improved: 'Cải tiến', fix: 'Sửa lỗi', planned: 'Dự kiến', launch: 'Ra mắt' };
const kindStyle = (k: Kind) =>
  ({
    feature: { bg: alpha(G.accent, 0.11), fg: G.accent },
    improved: { bg: 'rgba(22,150,110,0.11)', fg: '#137a5a' },
    fix: { bg: 'rgba(20,22,28,0.06)', fg: '#5d5f66' },
    planned: { bg: 'transparent', fg: '#9b9da3' },
    launch: { bg: G.accent, fg: '#ffffff' },
  })[k];

type Entry = { v: string; kind: Kind; kindLabel: string; title: string; desc: string; date: string };
type TargetTxt = { version: string; kind: string; title: string; desc: string; date: string; badge: string };
type TargetLay = { tSize: number; tLines: string[]; dSize: number; dLines: string[]; h: number };

const Row: React.FC<{ i: number; y: number; h: number; e: Entry; isTarget: boolean; frame: number; portrait: boolean; tl: TargetLay; badge: string }> = ({ i, y, h, e, isTarget, frame, portrait, tl, badge }) => {
  const k = kindStyle(e.kind);
  const tall = h >= 94;
  const planned = e.kind === 'planned';
  void i;

  // 目标行抬升 + 高亮；其余行退暗
  const t = interpolate(frame, [LIFT0, LIFT1], [0, 1], { easing: EASE.out, ...CL });
  const lift = isTarget ? t : 0;
  const dim = isTarget ? 0 : t;
  const box: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: y,
    width: COL_W,
    height: h,
    background: planned ? 'rgba(255,255,255,0.55)' : '#ffffff',
    border: planned ? '1px dashed rgba(20,22,28,0.14)' : `1px solid ${G.hairline}`,
    borderRadius: 14,
    boxSizing: 'border-box',
    transform: `scale(${1 + 0.03 * lift})`,
    boxShadow: planned
      ? 'none'
      : `${innerHighlight(0.9)}, ${softShadow(2 + 26 * lift, { strength: 1 + 0.6 * lift })}` +
        (lift > 0 ? `, 0 0 0 ${(2 * lift).toFixed(2)}px ${alpha(G.accent, 0.9 * lift)}` : ''),
    opacity: 1 - 0.62 * dim,
    zIndex: isTarget ? 2 : 1,
    fontFamily: FONT.sans,
  };
  const chip = (
    <div
      style={{
        flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 17, background: k.bg,
        border: planned ? '1px solid rgba(20,22,28,0.12)' : 'none', color: k.fg, fontSize: 20, fontWeight: 650, lineHeight: '34px', letterSpacing: '0.01em', whiteSpace: 'nowrap',
      }}
    >
      {e.kindLabel}
    </div>
  );
  const newTag = isTarget && badge ? (
    <div
      style={{
        flexShrink: 0, height: 30, padding: '0 12px', borderRadius: 8, background: alpha(G.accent, 0.11), color: G.accent, fontSize: 18, fontWeight: 750,
        lineHeight: '30px', letterSpacing: '0.08em', opacity: lift, transform: `translateX(${((1 - lift) * 8).toFixed(2)}px)`, whiteSpace: 'nowrap',
      }}
    >
      {badge.toUpperCase()}
    </div>
  ) : null;
  if (isTarget && portrait) {
    // 竖屏停点行：元信息一行 + 大标题 + 说明（字号按竖屏可读性放大）
    return (
      <div style={{ ...box, padding: '26px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 22, color: G.ink3 }}>{e.v}</div>
          {chip}
          {newTag}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 22, color: G.ink3, whiteSpace: 'nowrap' }}>{e.date}</div>
        </div>
        {tl.tLines.map((l, j) => (
          <div key={j} style={{ fontSize: tl.tSize, fontWeight: 700, color: G.ink1, letterSpacing: tracking(tl.tSize), lineHeight: 1.18, whiteSpace: 'nowrap', marginTop: j === 0 ? 8 : 0 }}>{l}</div>
        ))}
        {tl.dLines.map((l, j) => (
          <div key={j} style={{ fontSize: tl.dSize, color: G.ink2, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{l}</div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 22, padding: '0 30px' }}>
      <div style={{ width: 82, flexShrink: 0, fontFamily: FONT.mono, fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {e.v}
      </div>
      {chip}
      <div style={{ minWidth: 0, flex: 1 }}>
        {(isTarget ? tl.tLines : [e.title]).map((l, j) => (
          <div
            key={j}
            style={{
              fontSize: isTarget ? tl.tSize : 28,
              fontWeight: isTarget ? 700 : 600,
              color: planned ? G.ink3 : G.ink1,
              letterSpacing: tracking(isTarget ? tl.tSize : 28),
              lineHeight: 1.22,
              whiteSpace: 'nowrap',
              overflow: isTarget ? undefined : 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {l}
          </div>
        ))}
        {(isTarget ? tl.dLines : tall ? [e.desc] : []).map((l, j) => (
          <div key={j} style={{ marginTop: j === 0 ? 4 : 0, fontSize: isTarget ? tl.dSize : 22, lineHeight: 1.3, color: G.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {l}
          </div>
        ))}
      </div>
      {newTag}
      <div style={{ flexShrink: 0, width: 92, textAlign: 'right', fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {e.date}
      </div>
    </div>
  );
};

export const ChangelogScrollBrake: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const header = useText('header', 'Nhật ký cập nhật');
  const tg: TargetTxt = {
    version: useText('version', 'v2.41'),
    kind: useText('kind', 'Ra mắt'),
    title: useText('title', 'Bàn dựng chuyển động'),
    desc: useText('desc', 'Mọi cảnh quay, tinh chỉnh tại một nơi.'),
    date: useText('date', 'Hôm nay'),
    badge: useText('badge', 'Mới'),
  };
  const history = useList('history', []).slice(0, 8);
  const planned = useList('planned', []).slice(0, 5);
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: bo nen sang + hat code ve, tieu de trang co bong sang

  // 列表坐标：竖屏整列放大 u 倍（可见高度 = SH / u）
  const u = portrait ? 1.8 : 1;
  const VH = SH / u;
  // 停点行排版
  const tw = portrait ? COL_W - 68 : COL_W - 60 - 82 - 22 - 150 - 22 - (tg.badge ? 90 : 0) - 22 - 92 - 22;
  const T0 = portrait ? 62 : 36;
  let tLines = [tg.title];
  let tSize = fitSize(tg.title, { family: fonts.sans, size: T0, maxWidth: tw, weight: 700, minSize: T0 * 0.8 });
  if (tSize <= T0 * 0.8 && tg.title.split(/\s+/).length > 1) {
    tLines = wrapLines(tg.title, fonts.sans, T0 * 0.9, tw, 700, 2);
    tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: T0 * 0.9, maxWidth: tw, weight: 700, minSize: 18 })));
  }
  const D0 = portrait ? 34 : 26;
  let dLines = tg.desc ? wrapLines(tg.desc, fonts.sans, D0, tw, 400, 2) : [];
  const dSize = dLines.length ? Math.min(...dLines.map((l) => fitSize(l, { family: fonts.sans, size: D0, maxWidth: tw, weight: 400, minSize: 18 }))) : D0;
  if (dSize < D0 && dLines.length) dLines = wrapLines(tg.desc, fonts.sans, dSize, tw, 400, 2);
  const th = portrait
    ? 52 + 40 + 8 + tLines.length * tSize * 1.18 + 6 + dLines.length * dSize * 1.3 + 6
    : Math.max(116, 28 + tLines.length * tSize * 1.22 + (dLines.length ? 4 + dLines.length * dSize * 1.3 : 0) + 28);
  const tl: TargetLay = { tSize, tLines, dSize, dLines, h: th };

  // 行：停点前 28 行（越靠近停点越用 history），停点后路线图（竖屏多补几行填满下半屏）
  const N = TARGET + 1 + (portrait ? 11 : 5);
  const MONTHS = 9;
  const entries: Entry[] = Array.from({ length: N }, (_, i) => {
    if (i === TARGET)
      return { v: tg.version, kind: 'launch', kindLabel: tg.kind || KIND_LABEL.launch, title: tg.title, desc: tg.desc, date: tg.date };
    if (i > TARGET) {
      const j = i - TARGET - 1;
      return { v: 'v3.0', kind: 'planned', kindLabel: KIND_LABEL.planned, title: planned[j % Math.max(1, planned.length)] ?? PLANNED[j % PLANNED.length], desc: 'Có trong lộ trình quý tới.', date: 'Q4' };
    }
    const hi = TARGET - 1 - i;
    const title = hi < history.length ? history[hi] : TITLES[i];
    const kind: Kind = title.startsWith('Sửa') ? 'fix' : i % 2 === 0 ? 'feature' : 'improved';
    const month = 1 + Math.min(MONTHS - 1, Math.floor((i / TARGET) * MONTHS));
    return { v: `v2.${13 + i}`, kind, kindLabel: KIND_LABEL[kind], title, desc: 'Đã áp dụng cho mọi dự án, không cần thao tác.', date: `${1 + ((i * 11) % 27)}/${month}` };
  });
  const heights = entries.map((_, i) => (i === TARGET ? th : rowH0(i)));
  const rowY: number[] = [];
  {
    let y = 0;
    for (let i = 0; i < N; i++) {
      rowY.push(y);
      y += heights[i] + GAP;
    }
  }
  const TARGET_CY = rowY[TARGET] + th / 2;
  const END_T = VH / 2 - TARGET_CY + (portrait ? 0 : 0); // 目标行停在画面正中
  const START_T = 200; // 起始：长卷顶部在页眉下方
  const scrollAt = (f: number): number => interpolate(f, [SCROLL0, SCROLL1], [START_T, END_T], { easing: BRAKE_EASE, ...CL });
  const T = scrollAt(frame);
  // 速度差分（px/f）→ 纵向运动模糊
  const v = (scrollAt(frame + 0.5) - scrollAt(frame - 0.5)) * u;
  const COL_X = (1920 / u - COL_W) / 2;
  // 列表上下渐隐：页眉下方与画面底部各一段
  const LIST_MASK = `linear-gradient(180deg, transparent ${150 * u}px, #000 ${250 * u}px, #000 ${SH - 150 * u}px, transparent ${SH - 20 * u}px)`;
  const headSize = fitSize(header, { family: fonts.sans, size: 52, maxWidth: COL_W - 70 - (BRAND.name ? 200 : 0), weight: 720, minSize: 32 });

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans }}>
      {!bd && <Backdrop tone="light" light={{ x: 0.5, y: 0.2 }} vignette={0.16} grain={0} />}
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: LIST_MASK, maskImage: LIST_MASK }}>
        <SpeedBlur vx={0} vy={v} amount={0.32} max={30}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920 / u, height: VH, transform: `scale(${u})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: COL_X, top: 0, width: COL_W, height: VH, transform: `translateY(${T.toFixed(2)}px)` }}>
              {entries.map((e, i) => (
                <Row key={i} i={i} y={rowY[i]} h={heights[i]} e={e} isTarget={i === TARGET} frame={frame} portrait={portrait} tl={tl} badge={tg.badge} />
              ))}
            </div>
          </div>
        </SpeedBlur>
      </div>
      {/* 固定页眉：品牌标志 + 页面标题 + 品牌名 */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920 / u, transform: `scale(${u})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', left: COL_X, top: 64, width: COL_W, display: 'flex', alignItems: 'baseline', gap: 22 }}>
          {BRAND.name ? <ShotcraftMark size={50} tone="light" style={{ alignSelf: 'center', marginRight: -4 }} /> : null}
          <div style={{ fontSize: headSize, fontWeight: 720, letterSpacing: tracking(headSize), color: G.ink1, whiteSpace: 'nowrap', lineHeight: 1.25, textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>{header}</div>
          {BRAND.name ? <div style={{ fontFamily: BRAND.font, fontSize: 30, fontWeight: 600, color: G.ink3, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{BRAND.name}</div> : null}
        </div>
      </div>
      {!bd && <Grain opacity={0.05} />}
    </div>
  );
};
