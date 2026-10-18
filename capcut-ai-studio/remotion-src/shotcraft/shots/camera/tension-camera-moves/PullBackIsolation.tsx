// 拉远孤立收束（pull-back-isolation）——pull-back shot。
// 相机容器 scale 2.2→0.62（0–110f，Easing.out(cubic)）：开场怼在主卡
// "99.9%" 特写上，缓缓后拉露出周围 8 张兄弟卡。帧 30 起兄弟卡按离主卡
// 距离由近到远错峰熄灭（每 8f 一张，opacity→0 + brightness 压暗）；
// 背景 60–110f 从亮场沉入带色相的深场 #111216；主卡白光晕 60–100f 淡入。
// 帧 110–150 完全静止：暗场中央孤悬一张发光小卡——全片只为这一个数字。
//
// 改版要点：主卡从"白罩压在占位卡上"改为出版级指标卡（标签 + 大数字 +
// 90 天可用率条带 + 页脚）；相机按 2.2 倍布局（CSS zoom）再缩小，开场特写
// 文字锐利（审美准则 Q2）；兄弟卡熄灭时轻微下沉（scale 0.97）+ 失焦，而非原地变灰；
// 背景由柔光亮底交叉沉入深场，光晕带冷色相，卡面受光上沿随暗场浮现。
//
// [Agent Edit] o chu: number (con so lon tren the chinh — vd "99,9%", phan don vi cuoi duoc thu nho) / label (ten chi so) /
// badge (nhan goc phai, vd khoang thoi gian) / start + end (nhan hai dau dai lich su). The anh em ve tai cho bang tieng
// Viet trung tinh (Card cua fixtures con chu tieng Anh). Chu that dai ngan bat ky: tu thu nho vua be ngang the.
// Khung doc (portrait.mode = 'native'): 14 the anh em xep phu ca chieu cao, camera bat dau 3.2x (the chinh gan kin be
// ngang) va keo lui ve 1.3x (the chinh van doc ro tren dien thoai); khung ngang giu nguyen 2.2x -> 0.62x.
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { interpolate, Easing, AbsoluteFill } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, FONT, Grain, mix, softShadow } from '../../../fixtures/Polish';

export const PULL_BACK_ISOLATION_DURATION = 150; // 110f 后拉 + 40f 孤悬静止

type Sib = { dx: number; dy: number; w: number; h: number; seed: number };
// 8 张兄弟卡（landscape，相对主卡中心的偏移 + 尺寸 + seed）
const SIBS_L: Sib[] = [
  { dx: -620, dy: -330, w: 360, h: 240, seed: 3 },
  { dx: 10, dy: -390, w: 420, h: 220, seed: 4 },
  { dx: 620, dy: -320, w: 380, h: 260, seed: 5 },
  { dx: -680, dy: 20, w: 340, h: 230, seed: 6 },
  { dx: 700, dy: 40, w: 360, h: 250, seed: 7 },
  { dx: -600, dy: 360, w: 400, h: 240, seed: 8 },
  { dx: 40, dy: 400, w: 440, h: 220, seed: 9 },
  { dx: 640, dy: 350, w: 370, h: 250, seed: 10 },
];
// portrait：14 张，铺满竖向画面
const SIBS_P: Sib[] = [
  [-600, -1250, 380, 240], [40, -1300, 420, 230], [640, -1240, 360, 250],
  [-640, -760, 340, 260], [620, -720, 400, 240], [10, -560, 420, 220],
  [-680, -250, 340, 230], [700, -230, 360, 250],
  [-620, 300, 380, 240], [660, 330, 360, 240], [30, 560, 440, 220],
  [-600, 820, 400, 250], [620, 800, 370, 240],
  [40, 1300, 440, 220],
].map(([dx, dy, w, h], i) => ({ dx, dy, w, h, seed: i + 3 }));

const FADE_DUR = 16;
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// 历史条带：确定性，大部分全绿、2 天降级
const DAYS = Array.from({ length: 45 }, (_, i) => (i === 17 ? 1 : i === 33 ? 2 : 0));

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// 兄弟卡：越南语中性指标卡（标签 + 数字 + 迷你柱）
const SIB_LABELS = ['Doanh thu', 'Người dùng mới', 'Tỉ lệ chuyển đổi', 'Đơn hàng', 'Thời gian phản hồi', 'Lượt truy cập', 'Giữ chân', 'Chi phí quảng cáo', 'Đánh giá', 'Hoàn tiền', 'Tương tác', 'Đăng ký', 'Tồn kho', 'Lợi nhuận'];
const SIB_VALUES = ['128 tr', '2.431', '4,8%', '916', '1,2 giây', '58.204', '87%', '34 tr', '4,9★', '0,6%', '12,5k', '1.087', '3.420', '42 tr'];
const SibCard: React.FC<{ s: Sib }> = ({ s }) => {
  const i = s.seed - 3;
  const bars = Array.from({ length: 12 }, (_, k) => 0.25 + 0.75 * hash(s.seed * 7 + k));
  return (
    <div style={{
      width: s.w, height: s.h, background: '#ffffff', border: `1px solid ${G.hairline}`, borderRadius: 14, boxSizing: 'border-box',
      padding: '20px 22px', display: 'flex', flexDirection: 'column', fontFamily: FONT.sans, color: G.ink1, overflow: 'hidden',
      boxShadow: softShadow(6),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: i % 3 === 0 ? '#2fa36b' : '#7c84d8' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: G.ink2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{SIB_LABELS[i % SIB_LABELS.length]}</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{SIB_VALUES[i % SIB_VALUES.length]}</div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 5, height: Math.max(30, s.h - 140) }}>
        {bars.map((b, k) => (
          <div key={k} style={{ flex: 1, height: `${(b * 100).toFixed(1)}%`, borderRadius: 3, background: k === bars.length - 1 ? '#7c84d8' : G.fill2 }} />
        ))}
      </div>
    </div>
  );
};

const HeroCard: React.FC<{ rim: number; label: string; badge: string; num: string; unit: string; start: string; end: string; big?: boolean }> = ({ rim, label, badge, num, unit, start, end, big }) => {
  // portrait：小字放大一档（远景时仍读得清）
  const LS = big ? 25 : 17;
  const BS = big ? 18 : 13;
  const fonts = useShotFonts();
  const inner = 520 - 68;
  const labelSize = fitSize(label, { family: fonts.sans, size: LS, maxWidth: inner - 30 - (badge ? (big ? 150 : 130) : 0), weight: 600, minSize: 11 });
  const badgeSize = fitSize(badge, { family: fonts.sans, size: BS, maxWidth: big ? 150 : 140, weight: 550, minSize: 9 });
  // 大数字 + 单位（单位 0.56em）同一行放得下（字距 −0.045em 按字数扣回）
  const k = 0.56;
  const wAt = (fs: number) =>
    measureText(num, fonts.sans, fs, 700) + (unit ? measureText(unit, fonts.sans, fs * k, 600) + fs * 0.06 : 0) - 0.045 * fs * (num.length + unit.length);
  const nfs = Math.max(40, Math.min(128, Math.floor((128 * inner) / Math.max(1, wAt(128)))));
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 18,
        background: 'linear-gradient(180deg, #ffffff 0%, #fbfbfa 100%)',
        border: '1px solid rgba(20,22,28,0.08)',
        boxSizing: 'border-box',
        padding: '30px 34px 26px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT.sans,
        overflow: 'hidden',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,${0.9 + rim * 0.1})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 9, height: 9, borderRadius: 5, background: '#2fa36b', boxShadow: '0 0 0 4px rgba(47,163,107,0.14)', flex: 'none' }} />
        <div style={{ fontSize: labelSize, fontWeight: 600, color: G.ink1, letterSpacing: '-0.01em', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{label}</div>
        {badge ? (
          <div style={{ marginLeft: 'auto', fontSize: badgeSize, fontWeight: 550, color: G.ink2, padding: '3px 9px', borderRadius: 7, background: G.fill, boxShadow: `inset 0 0 0 1px ${G.hairline}`, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {badge}
          </div>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: nfs,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-0.045em',
          color: G.ink1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {num}{unit ? <span style={{ fontSize: `${k}em`, fontWeight: 600, color: G.ink2, marginLeft: '0.06em' }}>{unit}</span> : null}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 3, height: 30, alignItems: 'stretch' }}>
        {DAYS.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              background: d === 0 ? 'rgba(47,163,107,0.78)' : d === 1 ? '#e2a23b' : 'rgba(47,163,107,0.4)',
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'flex', fontSize: BS, color: G.ink3, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
        <span>{start}</span>
        <span style={{ marginLeft: 'auto' }}>{end}</span>
      </div>
    </div>
  );
};

export const PullBackIsolation: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: bo nen code, canh 'chim vao bong toi' = lop toi ban trong suot tren anh
  const numText = useText('number', '99,9%').trim();
  const label = useText('label', 'Tỉ lệ khách hài lòng');
  const badge = useText('badge', '90 ngày');
  const start = useText('start', '90 ngày trước');
  const end = useText('end', 'Hôm nay');
  // 数字主体 + 末尾单位（%、k、tr、đ…）分开排
  const m = /^(.*?[\d.,]+)\s*([^\d.,]*)$/.exec(numText);
  const num = m ? m[1] : numText;
  const unit = m ? m[2].trim() : '';

  const SIBS = (portrait ? SIBS_P : SIBS_L).map((s) => ({ ...s, dist: Math.hypot(s.dx, s.dy) }));
  // 按离主卡距离排名 → 错峰熄灭顺序（近的先灭）；张数多时压密间隔，保证 110f 前全部熄灭
  const step = Math.min(8, 64 / Math.max(1, SIBS.length - 1));
  const RANKED = SIBS.map((_, i) => i).sort((a, b) => SIBS[a].dist - SIBS[b].dist);
  const FADE_START = RANKED.reduce<number[]>((acc, idx, rank) => {
    acc[idx] = 30 + rank * step;
    return acc;
  }, []);

  // 相机布局倍率 = 起始特写倍率：按 Z 倍栅格化，之后只做缩小
  const Z = portrait ? 3.2 : 2.2;
  const END = portrait ? 1.3 : 0.62;
  const CY = portrait ? SH / 2 : 540;
  const VW = 1920;
  const VH = portrait ? SH : 1080;

  // 相机后拉：Z（怼脸特写）→ END（大远景孤悬）
  const scale = interpolate(frame, [0, 110], [Z, END], {
    easing: Easing.out(Easing.cubic),
    ...clamp,
  });

  // 背景沉入黑暗（60–110f）：亮柔光底 → 带色相深场，交叉淡化
  const bgT = interpolate(frame, [60, 110], [0, 1], { easing: Easing.inOut(Easing.quad), ...clamp });

  // 主卡光晕淡入（60–100f）
  const glow = interpolate(frame, [60, 100], [0, 1], { easing: Easing.inOut(Easing.quad), ...clamp });

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : G.dark, overflow: 'hidden' }}>
      {bd ? (
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(4,5,10,0.3) 0%, rgba(4,5,10,0.62) 100%)', opacity: bgT }} />
      ) : (
        <>
          <Backdrop tone="light" light={{ x: 0.5, y: 0.3 }} grain={0} />
          <AbsoluteFill style={{ opacity: bgT }}>
            <Backdrop tone="dark" light={{ x: 0.5, y: 0.5 }} accent="#5b63d3" grain={0} vignette={0.6} />
          </AbsoluteFill>
        </>
      )}

      {/* 相机容器：按 Z 倍布局，再以主卡中心（画面中心）为原点 scale(scale/Z) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: VW * Z,
          height: VH * Z,
          transformOrigin: `${960 * Z}px ${CY * Z}px`,
          transform: `translate(${960 - 960 * Z}px, ${CY - CY * Z}px) scale(${scale / Z})`,
        }}
      >
        <div style={{ position: 'relative', width: VW, height: VH, zoom: Z }}>
          {/* 兄弟卡：由近到远错峰熄灭，熄灭时轻微下沉 */}
          {SIBS.map((s, i) => {
            const t0 = FADE_START[i];
            const k = interpolate(frame, [t0, t0 + FADE_DUR], [0, 1], clamp);
            // 透明度先走（ease-out），压暗后走（k²）：熄灭过程不会在亮底上停成一块灰板
            const op = 1 - EASE.out(k);
            const dk = k * k;
            if (op <= 0.001) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 960 + s.dx - s.w / 2,
                  top: CY + s.dy - s.h / 2,
                  opacity: op,
                  // 压暗 + 轻微失焦：像沉进暗处
                  filter: k > 0.001 ? `brightness(${mix(1, 0.3, dk).toFixed(3)}) blur(${(k * 5).toFixed(2)}px)` : undefined,
                  transform: `scale(${mix(1, 0.97, k)})`,
                }}
              >
                <SibCard s={s} />
              </div>
            );
          })}

          {/* 主卡：520×340 居中；落入暗场后外圈冷白光晕 */}
          <div
            style={{
              position: 'absolute',
              left: 960 - 260,
              top: CY - 170,
              width: 520,
              height: 340,
              borderRadius: 18,
              boxShadow:
                `${softShadow(18, { strength: 1 - glow * 0.6 })}, ` +
                `0 0 70px rgba(214,222,255,${(glow * 0.32).toFixed(3)}), 0 0 180px rgba(150,162,240,${(glow * 0.2).toFixed(3)})`,
            }}
          >
            <HeroCard big={portrait} rim={glow} label={label} badge={badge} num={num} unit={unit} start={start} end={end} />
          </div>
        </div>
      </div>
      {!bd && <Grain opacity={mix(0.05, 0.09, bgT)} blend={bgT > 0.5 ? 'soft-light' : 'overlay'} />}
    </AbsoluteFill>
  );
};
