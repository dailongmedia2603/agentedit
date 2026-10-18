// [Agent Edit] Diem roi (hero card) = THE SO LIEU CUA VIDEO: o chu label (ten chi so), number (con so lon), delta (muc tang /
// giam, tuy chon), subtitle (chu thich nho, tuy chon) — ve de len o luoi trai-tren cua bang dieu khien gia (FakeDashboard,
// fixtures), cung kieu the. O anh tuy chon `hero`: anh (chup man hinh / anh minh hoa) phu kin the dich (cover) — may bay
// lao thang vao anh do. Con so do be ngang that -> thu nho vua the. Khung doc (native): ca the gioi 3D phong to PZ,
// diem roi o giua khung (trang dashboard tran kin chieu cao, khong cat ngang).
import { useCurrentFrame, useVideoConfig, useText, useImage, useShotFonts, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Easing, interpolate } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { FakeDashboard, G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, Grain, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS } from '../../../fixtures/Look';

// drone-dive-landing：上帝视角俯视整页平躺的 dashboard（近垂直俯角、缩小居中），
// 相机猛扎下来——俯角抬平、页面放大立正，最后一段气垫式长尾减速，
// 稳稳停在 hero 卡正前方特写。FPV 无人机俯冲降落的运镜翻译。
//
// 改版要点：页面不再是悬在空白里的一张薄片——它悬停在一块点阵地面之上
// （地面与页面同处一个 3D 世界，俯冲时点阵向镜头涌来给速度参照），地面上
// 有同形接触影，随"降落"收紧变实；俯冲前有 ~2.5% 的上提预备；落定后
// 周边轻压暗、焦点收到 hero 卡，并留 1.2s 呼吸。
//
// hero 卡 = FakeDashboard A 网格左上格：
// 侧栏 220 + padding 36 = x 256 起，列宽 (1628-56)/3 = 524；
// 顶栏 72 + padding 36 = y 108 起，行高 (936-28)/2 = 454。
// 卡中心 (256+262, 108+227) = (518, 335)，全程 transform-origin 钉在这里。
const HERO = { cx: 518, cy: 335, w: 524, h: 454 };
const DIVE_START = 24; // 开头 24f：上帝视角建立 + 上提预备
const DIVE_END = 49; // 主俯冲段 25f，ease-in(cubic) 越冲越快
const LAND_END = 69; // 气垫段 20f，ease-out(quint) 长尾减速，之后真静止
const DIVE_SHARE = 0.82; // 俯冲段吃掉 82% 行程，剩 18% 留给气垫
const PRE_LIFT = 0.025; // 俯冲前相机上提（行程倒退 2.5%）：大动作前的预备
export const DRONE_DIVE_LANDING_DURATION = 105; // 落定后 hold 36f（1.2s）

// 页面按终点放大倍数布局（CSS zoom），再整体 scale(1/Z) 缩回：
// 3D 合成层按 1.35 倍分辨率栅格化，终点特写的文字不糊（审美准则 Q2）
const Z = 1.35;
const LIFT = 150; // 起始悬停高度（页面局部 px，经世界 scale 后约 60px）

// 一条行程 p：预备（-2.5%）→ 俯冲 → 气垫
const travel = (frame: number) => {
  const pre = -PRE_LIFT * ramp(frame, 4, DIVE_START - 4, EASE.smooth);
  if (frame < DIVE_START) return pre;
  const pDive = interpolate(frame, [DIVE_START, DIVE_END], [-PRE_LIFT, DIVE_SHARE], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  if (frame < DIVE_END) return pDive;
  return (
    DIVE_SHARE +
    interpolate(frame, [DIVE_END, LAND_END], [0, 1 - DIVE_SHARE], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.poly(5)),
    })
  );
};

// 地面点阵：以 hero 为中心铺开的大平面，径向渐隐到远处，不画出硬边
const FLOOR = { x: -2400, y: -1500, w: 6720, h: 3300 };
const floorStyle: React.CSSProperties = {
  position: 'absolute',
  left: FLOOR.x,
  top: FLOOR.y,
  width: FLOOR.w,
  height: FLOOR.h,
  backgroundImage: 'radial-gradient(circle at 3px 3px, rgba(40,44,60,0.34) 2.2px, rgba(40,44,60,0) 3.2px)',
  backgroundSize: '48px 48px',
  backgroundPosition: `${(-FLOOR.x) % 48}px ${(-FLOOR.y) % 48}px`,
  WebkitMaskImage: `radial-gradient(ellipse ${FLOOR.w * 0.36}px ${FLOOR.h * 0.42}px at ${-FLOOR.x + 960}px ${-FLOOR.y + 600}px, #000 30%, transparent 100%)`,
  maskImage: `radial-gradient(ellipse ${FLOOR.w * 0.36}px ${FLOOR.h * 0.42}px at ${-FLOOR.x + 960}px ${-FLOOR.y + 600}px, #000 30%, transparent 100%)`,
};

// 目标卡（页面坐标，盖在 FakeDashboard A 网格左上格上）：视频自己的指标 / 图片
const HeroCard: React.FC = () => {
  const fonts = useShotFonts();
  const label = useText('label', 'Doanh thu tháng này');
  const number = useText('number', '1,2 tỷ');
  const delta = useText('delta', '+32%');
  const caption = useText('subtitle', 'so với tháng trước');
  const img = useImage('hero');
  const acc = LOOKS.porcelain.accent;
  const IW = HERO.w - 64;
  const numFs = fitSize(number, { family: fonts.sans, size: 104, maxWidth: IW, weight: 800, minSize: 44 });
  const labFs = fitSize(label, { family: fonts.sans, size: 26, maxWidth: IW - 70, weight: 650, minSize: 16 });
  const deltaW = delta.trim() ? measureText(delta, fonts.sans, 20, 700) + 24 + 12 : 0;
  const capFs = fitSize(caption, { family: fonts.sans, size: 21, maxWidth: IW - deltaW, weight: 500, minSize: 13 });
  const pts = [0.3, 0.38, 0.34, 0.5, 0.46, 0.62, 0.58, 0.74, 0.7, 0.88, 0.94];
  const cw = HERO.w, chh = 120;
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * cw).toFixed(1)},${(chh - v * chh).toFixed(1)}`).join(' ');
  return (
    <div style={{
      position: 'absolute', left: HERO.cx - HERO.w / 2, top: HERO.cy - HERO.h / 2, width: HERO.w, height: HERO.h, borderRadius: 14,
      overflow: 'hidden', background: G.card, boxShadow: `${G.shadowSm}, 0 0 0 1px ${G.hairline}`, fontFamily: fonts.sans,
    }}>
      {img ? (
        <>
          <img src={img} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          {label.trim() ? (
            <div style={{ position: 'absolute', left: 20, bottom: 20, maxWidth: HERO.w - 40, padding: '8px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', color: G.ink1, fontSize: Math.min(22, labFs), fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>{label}</div>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 32, right: 32, top: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: `${acc}1c`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: acc }} />
            </div>
            <div style={{ fontSize: labFs, fontWeight: 650, color: G.ink2, whiteSpace: 'nowrap', lineHeight: 1.35 }}>{label}</div>
          </div>
          <div style={{ position: 'absolute', left: 32, right: 32, top: 92, fontSize: numFs, fontWeight: 800, color: G.ink1, letterSpacing: '-0.035em', lineHeight: 1.25, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{number}</div>
          <div style={{ position: 'absolute', left: 32, right: 32, top: 92 + numFs * 1.25 + 8, display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
            {delta.trim() ? <div style={{ fontSize: 20, fontWeight: 700, color: acc, background: `${acc}1a`, borderRadius: 999, padding: '4px 12px', lineHeight: 1.3 }}>{delta}</div> : null}
            <div style={{ fontSize: capFs, color: G.ink3, fontWeight: 500, lineHeight: 1.3 }}>{caption}</div>
          </div>
          <svg width={cw} height={chh} style={{ position: 'absolute', left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ddl-hero-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={acc} stopOpacity={0.22} />
                <stop offset="1" stopColor={acc} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`${line} L${cw},${chh} L0,${chh} Z`} fill="url(#ddl-hero-area)" />
            <path d={line} fill="none" stroke={acc} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </>
      )}
    </div>
  );
};

const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const PZ = portrait ? 1.6 : 1; // 竖屏：整个世界放大，落点在画面中心
  const OY = (SH - 1080) / 2;
  const p = travel(frame);

  // 三轴联动，全部由同一条 p 驱动（同一台"相机"的一次连续机动）
  const rotX = mix(72, 0, p); // 俯角抬平
  const scale = mix(0.42, 1.35, p) * PZ; // 缩小全景 → hero 特写
  // 平移：起点让整页平躺在画面中央；终点 hero 卡中心正对画面中心
  // 起点让整页居中（origin 钉在 hero 卡中心，故起点平移随世界倍率变；横屏 = 原版 256）
  const tx = mix(960 - HERO.cx - (960 - HERO.cx) * 0.42 * PZ, 960 - HERO.cx, p);
  const ty = mix(170 + OY, SH / 2 - HERO.cy, p);

  // 降落：悬停高度随行程收到 0（气垫段末尾正好触地）
  const lift = LIFT * Math.pow(1 - Math.min(1, Math.max(0, p)), 1.4);
  // 接触影：高时大而虚、偏下右（主光左上），落地时收干变实
  const shOff = lift * 0.22;
  const shBlur = 22 + lift * 0.42;
  const shOp = interpolate(p, [0, 0.9, 1], [0.16, 0.12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* 相机 = perspective 容器；地面 + 页面同处一个世界，绕 hero 卡中心做 rotateX + scale + translate */}
      <AbsoluteFill style={{ perspective: 1400 }}>
        <div
          style={{
            position: 'absolute',
            width: 1920,
            height: 1080,
            transformOrigin: `${HERO.cx}px ${HERO.cy}px`,
            transform: `translate(${tx}px, ${ty}px) rotateX(${rotX}deg) scale(${scale})`,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* 地面点阵（俯冲时向镜头涌来 = 速度参照） */}
          <div style={{ ...floorStyle, opacity: 1 - 0.45 * Math.min(1, Math.max(0, p)) }} />
          {/* 地面接触影：页面同形，随降落收紧 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1920,
              height: 1080,
              borderRadius: 18,
              background: 'rgba(22,24,34,1)',
              opacity: shOp,
              filter: `blur(${shBlur.toFixed(1)}px)`,
              transform: `translate3d(${(shOff * 0.5).toFixed(1)}px, ${shOff.toFixed(1)}px, 1px) scale(${(1 + lift * 0.0004).toFixed(4)})`,
            }}
          />
          {/* 页面本体：悬停在地面之上 lift 高度 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1920,
              height: 1080,
              borderRadius: 16,
              overflow: 'hidden',
              transform: `translateZ(${lift.toFixed(2)}px)`,
              boxShadow: '0 0 0 1px rgba(20,22,28,0.10)',
            }}
          >
            <div style={{ width: 1920 * Z, height: 1080 * Z, transform: `scale(${1 / Z})`, transformOrigin: '0 0' }}>
              <div style={{ zoom: Z }}>
                <FakeDashboard variant="A" />
                <HeroCard />
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 落定后的焦点：hero 卡外一圈轻压暗（屏幕空间，hero 已在画面中心），只在静止段出现
const Focus: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const PZ = SH > 1080 * 1.2 ? 1.6 : 1;
  const k = ramp(frame, LAND_END - 6, 22, EASE.out);
  if (k <= 0) return null;
  // hero 卡在终点的屏幕尺寸 = 524×454 × 1.35
  const hw = ((HERO.w * 1.35) / 2 + 40) * PZ;
  const hh = ((HERO.h * 1.35) / 2 + 40) * PZ;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: k,
        background: `radial-gradient(${hw * 1.9}px ${hh * 1.9}px at 50% 50%, rgba(14,16,24,0) 48%, rgba(14,16,24,0.13) 100%)`,
      }}
    />
  );
};

export const DroneDiveLanding: React.FC = () => (
  <AbsoluteFill>
    {/* 背景静止，放在动态模糊之外：多重采样叠加大面积渐变会量化出色环 */}
    <Backdrop tone="light" light={{ x: 0.5, y: 0.12 }} grain={0} vignette={0.16} />
    <CameraMotionBlur shutterAngle={220} samples={12}>
      <Scene />
    </CameraMotionBlur>
    <Focus />
    {/* 颗粒放在动态模糊之外：不被多重采样平均掉 */}
    <Grain opacity={0.06} />
  </AbsoluteFill>
);
