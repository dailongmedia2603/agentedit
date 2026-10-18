// reticle-lock-on —— 准星咬合（钢铁侠 HUD / 安德的游戏）
// FakeDashboard 静置。四个 L 形角标组成的取景框从画外飞入（大框），
// 超调回弹后收缩贴紧目标卡片四角"咔"地咬合定格；咬合帧卡片微亮 +
// 上方弹一行小标签。画面不冻结，是运动中的捕获。
// f0–14 面板静置；f14–24 飞入；f20–46 收缩（含过冲回弹）；f46 咬合；
// 标签 f48–58 弹出；之后静止 ≥30f（90f 总长）。
//
// 质感升级：补导出时长（工作台原先从源码猜成 24f，只演到飞入一半）；目标框改用 fixture 真实
// 卡片几何（524×454，原 425 高差了 29px 咬不住下沿）；角标从 10px 实心黑块改为 5px 圆头强调色
// 笔画 + 白色描边衬底（任何底色上都清楚）+ 中心十字刻度；飞入段按速度做斜向运动模糊；
// 收缩改为与飞入重叠、不对称缓动的连续过冲（不再每个关键帧都停一下）；咬合帧角标一次"咔"的
// 收紧脉冲，目标微亮做成裁进圆角的顶亮渐变 + 强调色描边，其余画面轻压暗聚焦；标签换成出版级
// 深色胶囊（状态点 + 卡名 + 等宽锁定编号）；整段相机极缓推向目标，"在流动中点名"。
//
// [Agent Edit] o chu: label (ten muc tren nhan bat len) / tag (ma nho ben phai nhan). O anh `screen` (tuy chon): anh chup
// man hinh that phu kin khung, khung ngam khoa vao VUNG GIUA anh; khong co anh -> giu dashboard gia (FakeDashboard).
// Khung doc (portrait.mode = 'native'): dashboard phong to SH/1080 lan, can ngang theo tam the muc tieu (the + khung ngam
// lap day be ngang man hinh doc); anh that -> phu kin 1920 x SH, khung ngam khoa vung giua 1500x1100.
import { useCurrentFrame, useVideoConfig, useText, useImage, useShotFonts, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { G, FakeDashboard } from '../../../fixtures/Fixtures';
import { EASE, FONT, Grain, SpeedBlur, mix, ramp } from '../../../fixtures/Polish';

export const RETICLE_LOCK_ON_DURATION = 90; // 3s：飞入 → 咬合 → 标签 → 静止 ≥1s

// 目标：variant A 网格第 2 张卡（第一行中间）。fixture 几何：卡 524×454 @ x=808, y=108
const CARD_X = 808;
const CARD_Y = 108;
const CARD_W = 524;
const CARD_H = 454;
const PAD = 16; // 咬合后角标与卡的呼吸距

const FLY_IN = 14; // 飞入开始
const FLY_END = 24; // 飞入结束（大框就位）
const SHRINK0 = 20; // 收缩起点（与飞入尾段重叠 4f，动作连贯不停顿）
const UNDER = 40; // 收过头（0.94×）的时刻
const LOCK_END = 46; // 咬合帧
const LABEL0 = LOCK_END + 2;
const LABEL_END = LOCK_END + 12;

const ARM = 58; // L 臂长
const THICK = 5; // L 笔画粗
const INK = G.accent; // 角标色：唯一强调色

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// 飞入位移（px）：整框从右下画外冲进来，ease-out cubic
const flyAt = (f: number) => {
  const t = interpolate(f, [FLY_IN, FLY_END], [0, 1], { easing: Easing.out(Easing.cubic), ...clamp });
  return { x: (1 - t) * 1100, y: (1 - t) * 620 };
};
// 收缩倍率：2.2 → 0.94（swift 不对称缓动，冲过头）→ 1（ease-out 回弹落定）
const shrinkAt = (f: number) =>
  f < UNDER ? mix(2.2, 0.94, ramp(f, SHRINK0, UNDER - SHRINK0, EASE.swift)) : mix(0.94, 1, ramp(f, UNDER, LOCK_END - UNDER, EASE.out));

export const ReticleLockOn: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const label = useText('label', 'Trang xem nhiều nhất');
  const tag = useText('tag', 'ĐÃ KHÓA');
  const screen = useImage('screen');

  // 世界：无图 = 1920×1080 假 dashboard（竖屏时整体放大 SH/1080、水平对准目标卡）；有图 = 整个舞台
  const W = 1920;
  const H = screen ? SH : 1080;
  const T = screen
    ? portrait
      ? { x: 210, y: SH / 2 - 550, w: 1500, h: 1100 }
      : { x: 960 - 400, y: 540 - 270, w: 800, h: 540 }
    : { x: CARD_X, y: CARD_Y, w: CARD_W, h: CARD_H };
  const u = screen && portrait ? 2.4 : screen ? 1.25 : 1; // 角标 / 标签尺寸系数（世界单位）
  const TCX = T.x + T.w / 2;
  const TCY = T.y + T.h / 2;
  const radius = screen ? 18 * u : 14;
  const worldK = !screen && portrait ? SH / 1080 : 1;
  // 竖屏 dashboard：整体下移 TOP_PAD，给顶部标签留呼吸（上方空带用顶栏同色补齐）
  const TOP_PAD = worldK !== 1 ? 170 : 0;
  const worldTf = worldK !== 1 ? `translate(${(960 - TCX * worldK).toFixed(2)}px, ${TOP_PAD}px) scale(${worldK.toFixed(5)})` : undefined;

  const fly = flyAt(frame);
  const fly0 = flyAt(frame - 0.5);
  const fly1 = flyAt(frame + 0.5);
  const shrink = shrinkAt(frame);
  // 咬合"咔"：锁定瞬间角标再向内收紧 6px 后弹回（4f）
  const bite = interpolate(frame, [LOCK_END, LOCK_END + 1, LOCK_END + 5], [0, 1, 0], clamp);
  const hw = (T.w / 2 + PAD * u) * shrink - 6 * u * bite;
  const hh = (T.h / 2 + PAD * u) * shrink - 6 * u * bite;

  // 咬合帧：卡片微亮（快闪 0.55 后停在 0.28；裁进卡片圆角）
  const glow = interpolate(frame, [LOCK_END, LOCK_END + 3, LOCK_END + 10], [0, 0.55, 0.28], clamp);
  // 聚焦：目标之外轻压暗（锁定后 10f 内到 0.10；真实截图压得更深一点）
  const focus = interpolate(frame, [LOCK_END - 2, LOCK_END + 10], [0, 1], { easing: Easing.out(Easing.cubic), ...clamp });

  // 标签：咬合后从左上角标上方弹出（scale back 过冲 + 淡入）
  const labelT = interpolate(frame, [LABEL0, LABEL_END], [0, 1], { easing: Easing.out(Easing.back(1.8)), ...clamp });

  // 相机：全程极缓推向目标（1 → 1.035），smooth in-out，无起止速度突变
  const cam = mix(1, 1.035, ramp(frame, 0, RETICLE_LOCK_ON_DURATION - 1, EASE.smooth));

  const showReticle = frame >= FLY_IN;
  const locked = frame >= LOCK_END;
  const reticleOp = interpolate(frame, [FLY_IN, FLY_IN + 3], [0, 1], clamp);

  // 四个 L 角：位置 = 中心 ± (hw, hh)，各自镜像
  const corners = [
    { x: TCX - hw, y: TCY - hh, sx: 1, sy: 1 },
    { x: TCX + hw, y: TCY - hh, sx: -1, sy: 1 },
    { x: TCX - hw, y: TCY + hh, sx: 1, sy: -1 },
    { x: TCX + hw, y: TCY + hh, sx: -1, sy: -1 },
  ];
  // L 笔画：白色衬底（外扩 2px）+ 强调色芯，圆头
  const stroke = (w: number, h: number, under: boolean): React.CSSProperties => ({
    position: 'absolute', left: under ? -2 * u : 0, top: under ? -2 * u : 0,
    width: w + (under ? 4 * u : 0), height: h + (under ? 4 * u : 0), borderRadius: 4 * u,
    background: under ? 'rgba(255,255,255,0.92)' : INK,
    boxShadow: under ? '0 2px 6px rgba(16,18,40,0.18)' : 'none',
  });

  // 标签：字号按可见宽度收（竖屏 dashboard 可见宽 ≈ 1920/worldK）
  // 标签总宽上限 = 角标左缘 → 可见区右缘；减去圆点 / 内边距 / 标签码，余下给文字（再长则折成 2 行）
  const labelLeft = T.x - PAD * u;
  const visRight = screen ? 1920 - 50 : worldK !== 1 ? TCX + 960 / worldK - 44 : 1920 - 60;
  const tagW = tag ? measureText(tag, fonts.mono, 18 * u, 500) * 1.08 + 16 * u + 14 * u : 0;
  const textMax = Math.max(140 * u, visRight - labelLeft - (14 + 12 + 14 + 16) * u - tagW);
  const labelSize = fitSize(label, { family: fonts.sans, size: 30 * u, maxWidth: textMax, weight: 600, minSize: 22 * u });

  return (
    <div style={{ width: 1920, height: SH, background: G.bg, overflow: 'hidden', position: 'relative' }}>
      {TOP_PAD > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TOP_PAD + 4, background: '#fafaf9' }} />}
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: worldTf, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: `${TCX}px ${TCY}px` }}>
          {screen ? (
            <img src={screen} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover', objectPosition: '50% 50%' }} />
          ) : (
            <FakeDashboard variant="A" />
          )}
          {/* 聚焦压暗：目标卡外一圈巨型 box-shadow（目标处镂空、圆角一致） */}
          {focus > 0 && (
            <div style={{
              position: 'absolute', left: T.x, top: T.y, width: T.w, height: T.h, borderRadius: radius,
              boxShadow: `0 0 0 4000px rgba(16,18,28,${((screen ? 0.32 : 0.1) * focus).toFixed(3)})`, pointerEvents: 'none',
            }} />
          )}
          {/* 咬合微亮层：条件渲染，锁定前不存在；顶亮底淡的渐变裁进圆角 + 强调色细描边 */}
          {locked && (
            <div style={{
              position: 'absolute', left: T.x, top: T.y, width: T.w, height: T.h, borderRadius: radius,
              overflow: 'hidden', pointerEvents: 'none',
              boxShadow: `0 0 0 ${1.5 * u}px rgba(91,99,211,${(0.55 * focus).toFixed(3)}), 0 18px 48px -16px rgba(91,99,211,${(0.35 * focus).toFixed(3)})`,
            }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: screen ? glow * 0.3 : glow,
                background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.55) 60%, rgba(255,255,255,0.35) 100%)',
              }} />
            </div>
          )}
          {showReticle && (
            <SpeedBlur vx={fly1.x - fly0.x} vy={fly1.y - fly0.y} amount={0.3} max={22}>
              <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${fly.x}px, ${fly.y}px)`, opacity: reticleOp }}>
                {corners.map((c, i) => (
                  <div key={i} style={{ position: 'absolute', left: c.x, top: c.y, transform: `scale(${c.sx}, ${c.sy})`, transformOrigin: '0 0' }}>
                    {/* L 形角标：横臂 + 竖臂（先衬底后芯） */}
                    <div style={stroke(ARM * u, THICK * u, true)} />
                    <div style={stroke(THICK * u, ARM * u, true)} />
                    <div style={stroke(ARM * u, THICK * u, false)} />
                    <div style={stroke(THICK * u, ARM * u, false)} />
                  </div>
                ))}
                {/* 中心十字刻度：飞行中可见，锁定后淡出（准星→取景框的语义交接） */}
                {[0, 1].map((k) => (
                  <div key={k} style={{
                    position: 'absolute', left: TCX - (k ? 1.5 : 14) * u, top: TCY - (k ? 14 : 1.5) * u, width: (k ? 3 : 28) * u, height: (k ? 28 : 3) * u,
                    borderRadius: 2 * u, background: INK, opacity: 0.8 * (1 - focus), boxShadow: `0 0 0 ${2 * u}px rgba(255,255,255,0.85)`,
                  }} />
                ))}
              </div>
            </SpeedBlur>
          )}
          {/* 小标签：左上角标正上方弹出（落在顶栏空白区，不压邻卡标题） */}
          {frame >= LABEL0 && label ? (
            <div style={{
              position: 'absolute', left: TCX - hw + 2 * u, top: TCY - hh - 18 * u, transform: `translateY(-100%) scale(${labelT})`,
              transformOrigin: '0 100%', opacity: Math.min(1, labelT * 1.5),
              display: 'flex', alignItems: 'center', gap: 14 * u, whiteSpace: 'nowrap', width: 'max-content',
              background: 'linear-gradient(180deg, #23252c 0%, #17181d 100%)', color: '#fff', fontFamily: FONT.sans,
              padding: `${10 * u}px ${16 * u}px ${10 * u}px ${14 * u}px`, borderRadius: 12 * u,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(0,0,0,0.25), 0 2px 4px rgba(16,18,24,0.18), 0 16px 32px -10px rgba(16,18,24,0.45)',
            }}>
              <div style={{ width: 12 * u, height: 12 * u, borderRadius: 6 * u, flex: 'none', background: '#8a91ff', boxShadow: `0 0 0 ${4 * u}px rgba(138,145,255,0.22)` }} />
              <span style={{ fontSize: labelSize, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25, whiteSpace: 'normal', maxWidth: textMax }}>{label}</span>
              {tag ? (
                <span style={{
                  fontFamily: FONT.mono, fontSize: 18 * u, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)',
                  padding: `${4 * u}px ${8 * u}px`, borderRadius: 6 * u, background: 'rgba(255,255,255,0.07)',
                }}>{tag}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Grain opacity={0.035} />
    </div>
  );
};
