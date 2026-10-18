// before-after-slider-scrub —— 前后对比拉杆
// FakeDashboard 两版叠放：before = 低对比灰蒙版（"处理前"），after = 正常清晰版。
// 竖分割杆带圆手柄：从左端 8% 快甩到 70%（overshoot 至 76% 回弹），
// 再慢速回扫到 40% 停住。杆经过处 after 揭出（clip-path inset 跟随杆 x）。
// 先快甩后慢扫速度对比是节奏关键。f=110 后全静止（40f）。
//
// 质感升级：before 从"灰度 + 灰罩"的自黑版改成可信的未处理态（轻微失焦 + 降饱和 + 低对比雾面）；
// 角标换成真正的 Before / After 胶囊，各自长在自己那一层里、被分割线一起裁切；分割杆换成 2px 白线 +
// 发丝描边 + 两侧软影，手柄是带内高光的白色圆钮 + 矢量双箭头；快甩前有 4f 预备回拉，甩出时手柄
// 按速度横向拉伸 + 方向性运动模糊，落定后归零。
//
// [Agent Edit] o anh: after (anh THAT "sau" — anh san pham / anh da chinh / giao dien moi, ti le bat ky, cover kin khung) +
// before (tuy chon: anh "truoc" CUNG bo cuc; khong co -> lay chinh anh after lam ban "chua xu ly": mo nhe + giam bao hoa +
// tuong phan thap + lop suong). o chu: before_label / after_label (nhan chip). Khung doc (portrait.mode = 'native'):
// anh phu kin ca chieu cao, thanh chia cao het khung, nut keo + chip to hon de doc ro tren dien thoai.
import { useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { LOOKS } from '../../../fixtures/Look';
import { EASE, Grain, SpeedBlur, mix, ramp, softShadow, velocity } from '../../../fixtures/Polish';

export const BEFORE_AFTER_SLIDER_SCRUB_DURATION = 150; // 110f 动作 + 40f 真静止

// 时间轴（杆位置以画面宽度百分比表示）
const PRE = 10; // 预备：10→14 先向左回拉 1.5%（甩之前"蓄力"）
const T0 = 14; // 快甩起点
const FLING = 26; // 快甩：14→26（12f 冲到 76%）
const BOUNCE = 38; // 回弹：26→38 落到 70%
const HOLD = 56; // 停顿看清
const SCRUB = 104; // 慢扫：56→104（48f 回到 40%）——速度约为快甩的 1/5

const posAt = (f: number): number => {
  if (f < T0) return mix(8, 6.5, ramp(f, PRE, T0 - PRE, EASE.smooth));
  if (f < FLING) return mix(6.5, 76, ramp(f, T0, FLING - T0, EASE.out));
  if (f < BOUNCE) return mix(76, 70, ramp(f, FLING, BOUNCE - FLING, EASE.smooth));
  if (f < HOLD) return 70;
  return mix(70, 40, ramp(f, HOLD, SCRUB - HOLD, EASE.smooth));
};

const W = 1920;

// 角标胶囊：before 白底暗字（贴右缘），after 深底白字 + 强调色点（贴左缘，长在 after 层里被分割线一起裁）
const Tag: React.FC<{ label: string; side: 'left' | 'right'; top: number; size: number; family: string; accent?: boolean }> = ({ label, side, top, size, family, accent }) => {
  const margin = Math.round(size * 2.4);
  // 胶囊最宽 ~ 半屏减去边距（after 杆最终停在 40%：after 胶囊必须完整落在左 40% 内）
  const maxW = (side === 'left' ? W * 0.4 - margin - 40 : W * 0.3 - margin) - size * 2.4;
  const fs = fitSize(label, { family, size, maxWidth: maxW, weight: 600, minSize: size * 0.6 });
  const dot = Math.round(fs * 0.45);
  return (
    <div
      style={{
        position: 'absolute',
        [side]: margin,
        top,
        height: Math.round(fs * 2.1),
        padding: `0 ${Math.round(fs * 0.9)}px 0 ${Math.round(fs * 0.75)}px`,
        display: 'flex',
        alignItems: 'center',
        gap: Math.round(fs * 0.5),
        borderRadius: fs * 1.05,
        background: accent ? G.ink1 : 'rgba(255,255,255,0.9)',
        border: accent ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${G.hairlineStrong}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,${accent ? 0.12 : 0.9}), ${softShadow(accent ? 14 : 8)}`,
        fontFamily: family,
        fontSize: fs,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        color: accent ? '#ffffff' : G.ink1,
        whiteSpace: 'nowrap',
      } as React.CSSProperties}
    >
      <span
        style={{
          width: dot,
          height: dot,
          borderRadius: dot,
          flex: 'none',
          background: accent ? LOOKS.porcelain.accent : G.ink3,
          boxShadow: accent ? `0 0 0 ${Math.round(dot * 0.35)}px rgba(255,255,255,0.18)` : 'none',
        }}
      />
      {label}
    </div>
  );
};

// 画面层：真实图片铺满（cover，居中）；before / after 同一机位同一裁切 → 对比成立
const Shot: React.FC<{ src?: string; H: number }> = ({ src, H }) =>
  src ? (
    <Img src={src} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover', objectPosition: '50% 50%' }} />
  ) : (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #4a5878 0%, #c9a27a 55%, #2c2f3a 100%)' }} />
  );

export const BeforeAfterSliderScrub: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = H > 1080 * 1.2;
  const afterSrc = useImage('after', 'samples/photo1.jpg');
  const beforeSrc = useImage('before');
  const beforeLabel = useText('before_label', 'Trước');
  const afterLabel = useText('after_label', 'Sau khi dùng AI');
  const p = posAt(frame); // 杆位置 %
  const x = (p / 100) * W;

  // 速度（px/帧）：驱动手柄拉伸与运动模糊，静止时为 0
  const vx = velocity((f) => (posAt(f) / 100) * W, frame);
  const speed = Math.abs(vx);
  const squish = 1 + Math.min(speed / 110, 1) * 0.18; // 峰值 1.18
  const press = 1 - 0.06 * Math.sin(Math.PI * ramp(frame, PRE, FLING - PRE, EASE.linear)); // 甩动期间手柄被"捏住"微缩

  // 尺寸：竖屏（舞台 1920 宽 → 手机 1080 宽，缩 0.5625）手柄与角标放大，保证在手机上读得清
  const knob = portrait ? 132 : 84;
  const tagSize = portrait ? 84 : 40;
  const tagTop = portrait ? Math.round(H * 0.1) : 48;
  const lineW = portrait ? 4 : 2;

  return (
    <AbsoluteFill style={{ background: G.bg, overflow: 'hidden' }}>
      {/* before：真实"处理前"图；没有就由 after 派生可信的未处理态——轻微失焦 + 降饱和 + 低对比 + 暖灰雾面 */}
      {beforeSrc ? (
        <Shot src={beforeSrc} H={H} />
      ) : (
        <>
          <div style={{ position: 'absolute', inset: 0, filter: 'blur(2.4px) saturate(0.18) contrast(0.72) brightness(1.04)' }}>
            <Shot src={afterSrc} H={H} />
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(214,212,206,0.30), rgba(196,194,188,0.38))' }} />
        </>
      )}
      {beforeLabel ? <Tag label={beforeLabel} side="right" top={tagTop} size={tagSize} family={fonts.sans} /> : null}

      {/* after：清晰版，杆左侧揭出；After 角标长在这一层，随分割线一起被裁 */}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${W - x}px 0 0)` }}>
        <Shot src={afterSrc} H={H} />
        {afterLabel ? <Tag label={afterLabel} side="left" top={tagTop} size={tagSize} family={fonts.sans} accent /> : null}
      </div>

      {/* 揭示边沿：after 一侧极淡的接触暗影，让两层有前后关系 */}
      <div
        style={{
          position: 'absolute',
          left: x - 32,
          top: 0,
          width: 32,
          height: H,
          background: 'linear-gradient(90deg, rgba(16,18,26,0), rgba(16,18,26,0.10))',
        }}
      />

      {/* 分割杆 + 圆手柄：快甩时手柄按速度横向拉伸，杆与手柄一起做方向性运动模糊 */}
      <SpeedBlur vx={vx} amount={0.12} max={14}>
        <div
          style={{
            position: 'absolute',
            left: x - lineW / 2,
            top: 0,
            width: lineW,
            height: H,
            background: '#ffffff',
            boxShadow: '0 0 0 1px rgba(16,18,26,0.12), 0 0 26px rgba(16,18,26,0.28)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: x - knob / 2,
            top: H / 2 - knob / 2,
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            background: 'linear-gradient(180deg, #ffffff, #f4f4f2)',
            border: `1px solid ${G.hairlineStrong}`,
            boxShadow: `inset 0 1px 0 #ffffff, ${softShadow(14 + Math.min(speed / 8, 18))}`,
            transform: `scale(${press * squish}, ${press})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <svg width={knob * 0.47} height={knob * 0.26} viewBox="0 0 36 20" style={{ display: 'block' }}>
            <path d="M11 3 L4 10 L11 17" fill="none" stroke={G.ink2} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M25 3 L32 10 L25 17" fill="none" stroke={G.ink2} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </SpeedBlur>

      <Grain opacity={0.04} />
    </AbsoluteFill>
  );
};
