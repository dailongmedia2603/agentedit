// 组合：长卷急刹 × 准星咬合（brake-reticle-lock）
// changelog 长列表从下往上高速掠过（加速冲刺→9f 猛减速带 30px 超调回弹），
// 急刹帧（BRAKE=59）同帧四个 L 形角标从画外四个方向飞入，back-out 超调咬合
// 锁定停点条目四角；条目同步高亮 + 右侧弹出小标签。
// 组合命门：角标咬合帧与列表急刹帧必须同帧共振（都在 f=59 起跳），错开即退化。
// 关键帧：0–12 初始静置 → 12–50 加速冲刺（速度段 blur）→ 50–59 猛减速超调 →
// 59 急刹+角标飞入 → 59–72 咬合回弹/高亮/标签 → 75–150 真静止 75f。
// 帧确定，无随机源。
//
// 质感升级：灰骨架行换成真实感 changelog（类型图标 / 标题 / 说明 / 版本 / 日期，时间自上而下递增），
// 停点 = 视频里的真实发布（出版级内容）；顶栏骨架换成真实应用顶栏；各向同性 blur 换成沿滚动方向的纵向 SpeedBlur；
// 角标从 8px 墨色粗角换成 6px 强调色圆头 L 角，飞入段按自身速度给方向性运动模糊；停点行加强调色描边 +
// 抬升阴影，其余行退暗 0.38；标签 0.6→1 弹出并带脉冲点；柔光亮场 + 上下渐隐 + 颗粒。
//
// [Agent Edit] o chu: header (ten trang tren thanh dau) / title + desc + version + date (dong DICH duoc ngam khoa) /
// tag (nhan bat ra ben canh, vd "Vừa ra mắt") / history (0-8 muc ngay tren dong dich; con lai la ten trung tinh tieng Viet
// chi de lam dai mau luc cuon). Bieu tuong loai = SVG (khong dung ky tu Unicode ✦ ↗ ✓ de khong phu thuoc font may).
// Khung doc (native): ca man (danh sach + goc ngam + nhan) phong 1.5x, dong dich cao hon voi tieu de lon (toi da 2 dong),
// nhan dat phia tren goc phai dong dich (ben phai khong con cho); them dong lo trinh de lap nua duoi.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, FONT, Grain, SpeedBlur, innerHighlight, softShadow, tracking } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';
import { alpha } from '../../../fixtures/Look';

const SCROLL_START = 12;
const BRAKE = 59;
const DUR = 150;
export const BRAKE_RETICLE_LOCK_DURATION = DUR;

const PITCH = 156; // 行高 120 + 间距 36
const ROW_H = 120;
const ROW_GAP = PITCH - ROW_H;
const TARGET_ROW = 30;
const LIST_W = 1200;

// ── 假内容：时间自上而下递增的发布记录（中性越南语，仅作高速段"色带"），第 30 行 = 停点 ──
const TITLES = [
  'Thêm mẫu cảnh mới', 'Xuất video nhanh hơn', 'Lệch âm thanh khi xuất dài', 'Nhịp cắt theo nhạc nền', 'Hiệu ứng chuyển cảnh',
  'Chụp trang web trực tiếp', 'Phụ đề ở 60 fps', 'Bộ lọc thư viện', 'Lia máy nhanh', 'Mẫu tiêu đề mới', 'Cải thiện giảm âm nền',
  'Viền mờ khi xuất 4K', 'Kịch bản từ một câu lệnh', 'Xem trước trong danh sách', 'Chọn ảnh bìa', 'Lớp chiều sâu', 'Phông chữ tiêu đề',
  'Chớp sáng theo nhịp', 'Hạt phim', 'Thanh tên người nói', 'Khởi động nhanh hơn', 'Mặt nạ trên Safari', 'Thư viện trưng bày',
  'Hiệu ứng lóa sáng', 'Tông màu từng cảnh', 'Lưu tài nguyên ngoại tuyến', 'Đường đi con trỏ', 'Mốc trên dòng thời gian',
  'Khối mã gõ chữ', 'Xuất sang CapCut',
];
const LATER = ['Video dọc 9:16', 'Nhập bộ nhận diện', 'So sánh A/B', 'Nhiều rãnh âm thanh', 'Xuất hàng loạt', 'Liên kết duyệt', 'Đồng bộ lồng tiếng'];
const DESCS = ['Đã áp dụng cho mọi dự án.', 'Nhanh gấp 3 lần với video dài.', 'Đã sửa trên macOS và Windows.', 'Có sẵn ngay hôm nay.'];
// 类型：图标色 + SVG 图标
type KindKey = 'feature' | 'improved' | 'fix';
const kindOf = (k: KindKey) =>
  ({
    feature: { tint: alpha(G.accent, 0.12), ink: G.accent },
    improved: { tint: 'rgba(22,150,110,0.12)', ink: '#137a5a' },
    fix: { tint: 'rgba(20,22,28,0.06)', ink: '#5d5f66' },
  })[k];
const KINDS: KindKey[] = ['feature', 'improved', 'fix'];
const Glyph: React.FC<{ k: KindKey; color: string; size: number }> = ({ k, color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    {k === 'feature' && <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill={color} stroke="none" />}
    {k === 'improved' && <path d="M7 17L17 7M9 7h8v8" />}
    {k === 'fix' && <path d="M5 12.5l4.5 4.5L19 7.5" />}
  </svg>
);

type Entry = { title: string; desc: string; v: string; date: string; kind: KindKey; later: boolean };
type TL = { tSize: number; tLines: string[]; dSize: number; dLines: string[]; h: number };

const Row: React.FC<{ top: number; h: number; e: Entry; isTarget: boolean; highlight: number; dim: number; tl: TL; portrait: boolean }> = ({ top, h, e, isTarget, highlight, dim, tl, portrait }) => {
  const k = kindOf(e.kind);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        width: LIST_W,
        height: h,
        background: '#ffffff',
        border: `1px solid ${G.hairline}`,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        padding: '0 32px',
        boxSizing: 'border-box',
        boxShadow:
          `${innerHighlight(0.9)}, ${softShadow(3 + 20 * highlight, { strength: 1 + 0.6 * highlight })}` +
          (highlight > 0 ? `, 0 0 0 ${(2 * highlight).toFixed(2)}px ${alpha(G.accent, 0.85 * highlight)}` : ''),
        opacity: 1 - 0.62 * dim,
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          width: isTarget && portrait ? 76 : 56,
          height: isTarget && portrait ? 76 : 56,
          flexShrink: 0,
          borderRadius: 14,
          background: isTarget ? `linear-gradient(180deg, ${alpha(G.accent, 0.78)}, ${G.accent})` : k.tint,
          display: 'grid',
          placeItems: 'center',
          boxShadow: isTarget ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
        }}
      >
        <Glyph k={e.kind} color={isTarget ? '#ffffff' : k.ink} size={isTarget && portrait ? 34 : 26} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {(isTarget ? tl.tLines : [e.title]).map((l, j) => (
          <div key={j} style={{ fontSize: isTarget ? tl.tSize : 30, fontWeight: isTarget ? 700 : 600, color: e.later ? G.ink3 : G.ink1, letterSpacing: tracking(30), lineHeight: 1.22, whiteSpace: 'nowrap', overflow: isTarget ? undefined : 'hidden', textOverflow: 'ellipsis' }}>
            {l}
          </div>
        ))}
        {(isTarget ? tl.dLines : [e.desc]).map((l, j) => (
          <div key={j} style={{ marginTop: j === 0 ? 6 : 0, fontSize: isTarget ? tl.dSize : 24, lineHeight: 1.3, color: G.ink2, whiteSpace: 'nowrap', overflow: isTarget ? undefined : 'hidden', textOverflow: 'ellipsis' }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ flexShrink: 0, fontFamily: FONT.mono, fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.v}</div>
      <div style={{ flexShrink: 0, width: 96, textAlign: 'right', fontSize: 22, color: G.ink3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.date}</div>
    </div>
  );
};

// L 形角标：两条圆头强调色边组成的直角
const Corner: React.FC<{ flip: [number, number]; style: React.CSSProperties }> = ({ flip, style }) => (
  <div style={{ position: 'absolute', width: 46, height: 46, transform: `scale(${flip[0]}, ${flip[1]})`, ...style }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 46, height: 6, background: G.accent, borderRadius: 3 }} />
    <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: 46, background: G.accent, borderRadius: 3 }} />
  </div>
);

// 角标咬合进度（back-out 超调）
const lockAt = (f: number) =>
  interpolate(f, [BRAKE, BRAKE + 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(2.4)),
  });

export const BrakeReticleLock: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const header = useText('header', 'Nhật ký cập nhật');
  const title = useText('title', 'Bàn dựng chuyển động');
  const desc = useText('desc', 'Mọi cảnh quay, tinh chỉnh tại một nơi.');
  const version = useText('version', 'v2.41');
  const date = useText('date', 'Hôm nay');
  const tag = useText('tag', 'Vừa ra mắt');
  const history = useList('history', []).slice(0, 8);

  // 列表坐标：竖屏整屏放大 u 倍
  const u = portrait ? 1.5 : 1;
  const VW = 1920 / u;
  const VH = SH / u;
  const LIST_X = (VW - LIST_W) / 2;
  // 停点行排版
  const tw = LIST_W - 64 - (portrait ? 76 : 56) - 26 - 26 - measureText(version, fonts.mono, 22, 400) - 26 - 96;
  const T0 = portrait ? 58 : 36;
  let tLines = [title];
  let tSize = fitSize(title, { family: fonts.sans, size: T0, maxWidth: tw, weight: 700, minSize: T0 * 0.8 });
  if (tSize <= T0 * 0.8 && title.split(/\s+/).length > 1) {
    tLines = wrapLines(title, fonts.sans, T0 * 0.9, tw, 700, 2);
    tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: T0 * 0.9, maxWidth: tw, weight: 700, minSize: 18 })));
  }
  const D0 = portrait ? 32 : 24;
  let dLines = desc ? wrapLines(desc, fonts.sans, D0, tw, 400, 2) : [];
  const dSize = dLines.length ? Math.min(...dLines.map((l) => fitSize(l, { family: fonts.sans, size: D0, maxWidth: tw, weight: 400, minSize: 18 }))) : D0;
  if (dSize < D0 && dLines.length) dLines = wrapLines(desc, fonts.sans, dSize, tw, 400, 2);
  const th = Math.max(ROW_H, 30 + tLines.length * tSize * 1.22 + (dLines.length ? 6 + dLines.length * dSize * 1.3 : 0) + 30);
  const tl: TL = { tSize, tLines, dSize, dLines, h: th };

  const N = TARGET_ROW + 1 + (portrait ? 10 : 7);
  const entries: Entry[] = Array.from({ length: N }, (_, i) => {
    const later = i > TARGET_ROW;
    if (i === TARGET_ROW) return { title, desc, v: version, date, kind: 'feature', later };
    if (later) return { title: LATER[(i - TARGET_ROW - 1) % LATER.length], desc: 'Dự kiến quý tới.', v: '—', date: 'Q4', kind: KINDS[(i * 7) % 3], later };
    const hi = TARGET_ROW - 1 - i;
    return {
      title: hi < history.length ? history[hi] : TITLES[i % TITLES.length],
      desc: DESCS[i % DESCS.length],
      v: `v2.${11 + i}`,
      date: `${1 + ((i * 11) % 27)}/${1 + Math.floor((i / TARGET_ROW) * 9)}`,
      kind: KINDS[(i * 7) % 3],
      later,
    };
  });
  const tops = entries.map((_, i) => (i <= TARGET_ROW ? i * PITCH : TARGET_ROW * PITCH + th + ROW_GAP + (i - TARGET_ROW - 1) * PITCH));
  const FINAL_SCROLL = TARGET_ROW * PITCH - (portrait ? VH / 2 - th / 2 : 480 - (th - ROW_H) / 2); // 停点条目落在画面中部

  // 滚动位置：12–50 加速冲刺（sin-in，越滚越快）→ 50–59 猛减速冲过头 30px → 59–63 回弹落定。59 帧为急刹帧。
  const scrollAt = (fr: number): number => {
    if (fr <= SCROLL_START) return 0;
    if (fr <= 50) return interpolate(fr, [SCROLL_START, 50], [0, FINAL_SCROLL - 430], { easing: Easing.in(Easing.sin) });
    if (fr <= BRAKE) return interpolate(fr, [50, BRAKE], [FINAL_SCROLL - 430, FINAL_SCROLL + 30], { easing: Easing.out(Easing.cubic) });
    return interpolate(fr, [BRAKE, BRAKE + 4], [FINAL_SCROLL + 30, FINAL_SCROLL], { extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
  };
  const scroll = scrollAt(f);

  // 速度段纵向模糊：由相邻帧位移决定（px/f），冲刺段拉成色带，刹停即清晰
  const v = (scroll - scrollAt(Math.max(0, f - 1))) * u;

  // 急刹帧起：高亮 0→1（6f），其余行退暗（12f）
  const highlight = interpolate(f, [BRAKE, BRAKE + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dim = interpolate(f, [BRAKE + 2, BRAKE + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  // 停点条目屏幕坐标（列表坐标）
  const rowTopAt = (fr: number) => TARGET_ROW * PITCH - scrollAt(fr);
  const GAP = 10; // 咬合位：角外扩 10px
  const rect = (fr: number) => ({ x: LIST_X - GAP, y: rowTopAt(fr) - GAP, w: LIST_W + GAP * 2, h: th + GAP * 2 });

  const corners: Array<{ ax: 0 | 1; ay: 0 | 1; fromX: number; fromY: number; flip: [number, number] }> = [
    { ax: 0, ay: 0, fromX: -620, fromY: -320, flip: [1, 1] },
    { ax: 1, ay: 0, fromX: 620, fromY: -320, flip: [-1, 1] },
    { ax: 0, ay: 1, fromX: -620, fromY: 320, flip: [1, -1] },
    { ax: 1, ay: 1, fromX: 620, fromY: 320, flip: [-1, -1] },
  ];
  const cornerPos = (c: (typeof corners)[number], fr: number) => {
    const r = rect(fr);
    const fly = 1 - lockAt(fr); // 1=画外 0=咬合到位
    return { x: r.x + c.ax * r.w - 23 + c.fromX * fly, y: r.y + c.ay * r.h - 23 + c.fromY * fly };
  };

  // 小标签：63f 从条目右侧弹出（超调）；右侧放不下（竖屏）→ 条目上方右对齐
  const tagT = interpolate(f, [BRAKE + 4, BRAKE + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2.6)) });
  const tagOp = interpolate(f, [BRAKE + 4, BRAKE + 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const r = rect(f);
  const tagSize = fitSize(tag, { family: fonts.sans, size: 26, maxWidth: portrait ? 700 : VW - (r.x + r.w + 28) - 46 - 40, weight: 650, minSize: 18 });
  const tagW = measureText(tag, fonts.sans, tagSize, 650) + 46 + 22;
  const tagRight = r.x + r.w + 28 + tagW <= VW - 24;
  const tagPos = tagRight ? { left: r.x + r.w + 28, top: r.y + r.h / 2 - 28, origin: 'left center' } : { left: r.x + r.w - tagW, top: r.y - 56 - 26, origin: 'right bottom' };
  const LIST_MASK = `linear-gradient(180deg, transparent ${72 * u}px, #000 ${170 * u}px, #000 ${SH - 120 * u}px, transparent ${SH}px)`;
  const initials = (BRAND.name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans }}>
      <Backdrop tone="light" light={{ x: 0.5, y: 0.25 }} vignette={0.16} grain={0} />

      {/* 长列表：整体上掠，速度段纵向模糊 */}
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: LIST_MASK, maskImage: LIST_MASK }}>
        <SpeedBlur vx={0} vy={v} amount={0.15} max={32}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: `scale(${u})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: LIST_X, top: 0, width: LIST_W, height: VH }}>
              <div style={{ position: 'absolute', top: -scroll, left: 0, width: LIST_W, height: (N + 2) * PITCH }}>
                {entries.map((e, i) => (
                  <Row key={i} top={tops[i]} h={i === TARGET_ROW ? th : ROW_H} e={e} isTarget={i === TARGET_ROW} highlight={i === TARGET_ROW ? highlight : 0} dim={i === TARGET_ROW ? 0 : dim} tl={tl} portrait={portrait} />
                ))}
              </div>
            </div>
          </div>
        </SpeedBlur>
      </div>

      <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: `scale(${u})`, transformOrigin: '0 0' }}>
        {/* 顶栏（不随滚动） */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 72, background: 'rgba(250,250,249,0.92)', borderBottom: `1px solid ${G.hairline}`,
            display: 'flex', alignItems: 'center', padding: '0 40px', gap: 16, boxSizing: 'border-box', zIndex: 3, whiteSpace: 'nowrap',
          }}
        >
          {BRAND.name ? (
            <>
              <ShotcraftMark size={32} tone="light" />
              <div style={{ fontFamily: BRAND.font, fontSize: 24, fontWeight: 700, color: G.ink1, letterSpacing: '0.03em' }}>{BRAND.name}</div>
              <div style={{ fontSize: 24, color: G.ink3 }}>/</div>
            </>
          ) : null}
          <div style={{ fontSize: 24, fontWeight: 550, color: G.ink2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{header}</div>
          <div style={{ marginLeft: 'auto', flexShrink: 0, width: 38, height: 38, borderRadius: 19, background: '#e4e5ea', color: G.ink2, fontSize: 15, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
            {initials || (
              <svg width={20} height={20} viewBox="0 0 24 24" fill={G.ink3}>
                <circle cx="12" cy="8.5" r="4" />
                <path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6z" />
              </svg>
            )}
          </div>
        </div>

        {/* 准星角标：急刹帧同帧挂载（组合命门：与刹停同帧共振）；飞入段方向性运动模糊 */}
        {f >= BRAKE &&
          corners.map((c, i) => {
            const p = cornerPos(c, f);
            const q = cornerPos(c, f - 1);
            return (
              <SpeedBlur key={i} vx={p.x - q.x} vy={p.y - q.y} amount={0.1} max={18}>
                <Corner flip={c.flip} style={{ left: p.x, top: p.y, opacity: Math.min(1, lockAt(f) * 3 + 0.35) }} />
              </SpeedBlur>
            );
          })}

        {/* 旁弹小标签 */}
        {f >= BRAKE + 4 && tag && (
          <div
            style={{
              position: 'absolute', left: tagPos.left, top: tagPos.top, height: 56, transform: `scale(${(0.6 + 0.4 * tagT).toFixed(4)})`, transformOrigin: tagPos.origin,
              opacity: tagOp, padding: '0 24px 0 22px', borderRadius: 28, background: G.ink1, boxShadow: softShadow(12, { strength: 1.4 }), color: '#ffffff',
              display: 'flex', alignItems: 'center', gap: 12, fontWeight: 650, fontSize: tagSize, letterSpacing: tracking(26), whiteSpace: 'nowrap', boxSizing: 'border-box',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, background: '#67d17c', boxShadow: '0 0 0 4px rgba(103,209,124,0.22)', flexShrink: 0 }} />
            {tag}
          </div>
        )}
      </div>
      <Grain opacity={0.05} />
    </div>
  );
};
