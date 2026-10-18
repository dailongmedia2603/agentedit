// picker-carousel-feature-cycle — Picker Carousel 功能名吸附轮播（motion-lab 定稿转原生 Remotion）
// 移动端风竖向选择器：焦点药丸不动、内容穿过它，每项停靠 0.45s 且带明显 outQuint
// 减速吸附 + 4–5 帧静止；按到中心距离分层控制 opacity/字号/灰度，落定时药丸做
// scaleY 1→1.06→1 极轻呼吸，左外侧固定方形 AI 徽标。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
// 质感升级：纸面底加一处柔和顶光 + 极弱暗角颗粒；unicode 杂牌符号换成同一套 1.5 描边线性图标
// （焦点行图标用唯一强调色）；药丸补顶沿内高光 + 两层软影；走位快段给列表纵向速度拖影
// （吸附减速段自动归零）；AI 徽标改深色渐变 + 内高光 + 小星芒。时间轴与参数表数值不变。
// 左侧 app 图标 = 视频自己的品牌标志（无品牌时为中性标志）。
//
// [Agent Edit] o chu: items (danh sach 3-7 muc — ten tinh nang / buoc / lua chon tu loi noi) + title (dong nho phia tren,
// optional). So buoc hut = min(5, so muc - 1), van chia deu cua so t 0.05→0.95 (HOLD giu nguyen). Muc dai -> thu nho
// chu (khong xuong dong); be ngang khung chon tu dan theo muc dai nhat (300–400 px thiet ke). Bieu tuong o dong tieu diem
// = dau tich chung (khong gan bieu tuong rieng sai nghia). Khung doc (native): DesignStage cao theo khung, bo chon phong
// 1.4 lan, bieu tuong app dat phia tren.
import React from 'react';
import { DesignStage, E, lerp, seg, useT } from '../../../fixtures/Motion';
import { FONT, Grain, SpeedBlur, Vignette } from '../../../fixtures/Polish';
import { ShotcraftMark } from '../../../fixtures/Brand';
import { fitSize, measureText, useList, useShotFonts, useText, useVideoConfig } from '../../../runtime';

export const PICKER_CAROUSEL_FEATURE_CYCLE_DURATION = 108; // 3600ms @30fps

const PAPER = '#F3F3F1';
const INK = '#111113';
const MID = '#8A8A8F';
const ACCENT = '#5b63d3';
// 焦点行标记：16 网格线性"选中"勾（通用，不随条目语义变化）
const CHECK = ['M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5z', 'M5.25 8.1 7.2 10l3.55-4'];
const Icon: React.FC<{ d: string[]; color: string; size: number }> = ({ d, color, size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
    {d.map((p, i) => (
      <path key={i} d={p} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
);
const HOLD = 5 / 14; // 每步末段静止占比（≈4–5 帧不动）

export const PickerCarouselFeatureCycle: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const ITEMS = useList('items', [
    'Tự động cắt ghép',
    'Phụ đề tiếng Việt',
    'Chuyển động máy quay',
    'Cắt theo nhịp nhạc',
    'Hiệu ứng âm thanh',
    'Bàn chỉnh chuyển động',
    'Xuất video một chạm',
  ]).slice(0, 7);
  const title = useText('title', 'TÍNH NĂNG NỔI BẬT');
  const STEPS = Math.max(1, Math.min(5, ITEMS.length - 1)); // 吸附推进次数（原版 5）

  // 设计坐标：480 宽；竖屏高度跟随画面（DesignStage h = SH/4），选择器整体放大 S
  const DH = SH / 4;
  const S = portrait ? 1.5 : 1;
  const ROW_H = 34 * S; // 单行高度（写死，防逐帧重排抖动）
  const F0 = 17 * S, F1 = 14 * S;
  const ICON = 13 * S;
  // 视口宽：按最长条目自适应（300–400），单条仍超宽则缩字号而不是换行
  const textW = (x: string) => measureText(x, fonts.sans, F0, 600); // F0 字号下的像素宽（设计 px）
  const VW = Math.round(Math.min(portrait ? 452 : 400, Math.max(300 * S, Math.max(...ITEMS.map(textW)) + ICON + 8 * S + 24 * S)));
  const maxText = VW - ICON - 8 * S - 20 * S;
  const fitK = ITEMS.map((x) => fitSize(x, { family: fonts.sans, size: F0, maxWidth: maxText, weight: 600, minSize: F0 * 0.55 }) / F0);
  const CX = 240, CY = DH / 2;

  // 主时间轴：t∈[0.05,0.95] 均分 STEPS 步；步内前 (1-HOLD) 用 outQuint 吸附，末段静止
  const posAt = (tt: number) => {
    const gg = seg(tt, 0.05, 0.95) * STEPS;
    const st = Math.min(STEPS - 1, Math.floor(gg));
    const lo = Math.min(1, gg - st);
    return st + E.outQuint(Math.min(1, lo / (1 - HOLD)));
  };
  const g = seg(t, 0.05, 0.95) * STEPS;
  const step = Math.min(STEPS - 1, Math.floor(g));
  const local = Math.min(1, g - step);
  const pos = posAt(t);
  // 列表纵向速度（设计 px/帧）：走位快段给一点竖向拖影，减速吸附与静止段自动归零
  const dt = 0.5 / (PICKER_CAROUSEL_FEATURE_CYCLE_DURATION - 1);
  const vy = -(posAt(t + dt) - posAt(t - dt)) * ROW_H;

  // 落定呼吸：吸附完成进入 HOLD 后，药丸 scaleY 1→1.06→1 极轻脉冲
  const land = Math.max(0, (local - (1 - HOLD)) / HOLD);
  const breath = land > 0 ? Math.sin(Math.min(1, land / 0.6) * Math.PI) * 0.06 : 0;

  // 标题（可选）：视口上方一行小字；竖屏时 app 图标在标题上方
  const TS = portrait ? 15 : 9;
  const titleSize = title ? fitSize(title, { family: fonts.sans, size: TS, maxWidth: 440, weight: 650, letterSpacingEm: 0.18, minSize: TS * 0.6 }) : 0;
  const vpTop = CY - (ROW_H * 5) / 2;
  const iconSz = 24 * (portrait ? 1.9 : 1);
  const titleY = vpTop - (portrait ? 34 : 16);
  const iconY = portrait ? titleY - (title ? titleSize * 1.4 : 0) - 26 - iconSz : CY - 12;
  const iconX = portrait ? CX - iconSz / 2 : CX - VW / 2 - 36;

  return (
    <DesignStage bg={PAPER} raster="zoom" h={DH}>
      {/* 纸面底 —— 与原采集页 paper() 容器一致 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: `radial-gradient(ellipse 70% 80% at 46% 30%, #f8f8f6 0%, rgba(248,248,246,0) 70%), linear-gradient(180deg, #f4f4f2 0%, ${PAPER} 55%, #eeeeeb 100%)`,
          fontFamily: FONT.sans,
        }}
      >
        {/* 药丸身后的一抹落地光：把"焦点行"从纸面上托起来（只在中心一处） */}
        <div
          style={{
            position: 'absolute',
            left: CX - 190 * S,
            top: CY - 40 * S,
            width: 380 * S,
            height: 80 * S,
            background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)',
            opacity: seg(t, 0, 0.05),
          }}
        />
        {title ? (
          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: titleY - titleSize * 1.3, height: titleSize * 1.3, textAlign: 'center',
              fontSize: titleSize, lineHeight: 1.3, fontWeight: 650, letterSpacing: '0.18em', color: MID, whiteSpace: 'nowrap',
              opacity: seg(t, 0.01, 0.08),
            }}
          >
            {title}
          </div>
        ) : null}
        {/* 选择器视口：VW×(ROW_H×5) 居中，整体在开头 5% 内淡入 */}
        <div
          style={{
            position: 'absolute',
            left: CX - VW / 2,
            top: vpTop,
            width: VW,
            height: ROW_H * 5,
            overflow: 'hidden',
            opacity: seg(t, 0, 0.05),
            // 上下各 26% 渐隐：alpha 遮罩（不叠纸色色块），底色是渐变也不会露出边界带
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
          }}
        >
          {/* 焦点药丸：位置不动，仅落定时 scaleY 呼吸（content-box + 1px 边框） */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: ROW_H * 2,
              height: ROW_H,
              boxSizing: 'content-box',
              borderRadius: 999,
              background: 'linear-gradient(180deg, #ffffff 0%, #fbfbfa 100%)',
              border: '1px solid #E3E3E6',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,1), 0 0.5px 1px rgba(16,18,24,.06), 0 3px 9px -2px rgba(16,18,24,.09), 0 10px 22px -10px rgba(16,18,24,.12)',
              transform: `scaleY(${1 + breath})`,
            }}
          />
          {/* 内容列：整列 translateY 穿过焦点药丸；快段带纵向速度拖影 */}
          <SpeedBlur vx={0} vy={vy} amount={0.06} max={0.8}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                transform: `translateY(${ROW_H * 2 - pos * ROW_H}px)`,
              }}
            >
              {ITEMS.map((txt, i) => {
                // 按到中心距离分层：透明度两段线性、字号 17→14、颜色三档灰度
                const d = Math.abs(i - pos);
                const k2 = Math.min(2, d);
                const o = k2 <= 1 ? lerp(k2, 1, 0.55) : lerp(k2 - 1, 0.55, 0.18);
                return (
                  <div
                    key={i}
                    style={{
                      height: ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8 * S,
                      fontWeight: 600,
                      fontSize: lerp(Math.min(1, d / 2), F0, F1) * fitK[i],
                      lineHeight: 1,
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      color: d < 0.5 ? INK : d < 1.5 ? MID : '#B9B9BE',
                      opacity: o,
                    }}
                  >
                    {/* 图标仅在贴近焦点时浮现（d<0.625 内可见），焦点行用唯一强调色 */}
                    <span style={{ opacity: Math.max(0, 1 - d * 1.6), marginTop: 0.5 }}>
                      <Icon d={CHECK} color={ACCENT} size={ICON} />
                    </span>
                    <span>{txt}</span>
                  </div>
                );
              })}
            </div>
          </SpeedBlur>
        </div>
        {/* 固定 app 图标：深色方形圆角里放视频品牌的标志（反白版），开头略滞后淡入 */}
        <div
          style={{
            position: 'absolute',
            left: iconX,
            top: iconY,
            width: iconSz,
            height: iconSz,
            borderRadius: iconSz / 4,
            background: 'linear-gradient(160deg, #2a2b31 0%, #111113 100%)',
            boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.22), 0 0 0 0.5px rgba(0,0,0,0.5), 0 2px 5px -1px rgba(16,18,24,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: seg(t, 0.02, 0.09),
          }}
        >
          <ShotcraftMark size={iconSz * 0.66} tone="dark" />
        </div>
        <Vignette strength={0.12} inner={0.5} color="#2a2c36" />
        <Grain opacity={0.045} scale={0.25} />
      </div>
    </DesignStage>
  );
};
