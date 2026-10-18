// corner-spotlight-reveal —— 对标 clickup-30.mp4 41.5–44.6s：
// 黑场上，左上角径向聚光从小到大扩张，把白色 video-shotcraft 镜头库界面逐步"点亮"，
// 照到的区域显影、照不到的沉黑，最终全屏亮起。光即转场。
//
// [Agent Edit] o chu: title (tieu de trang lon goc tren-trai — cho anh sang toi dau tien) / tabs (3-5 tab, tab dau duoc
// chon). O anh `screen` (tuy chon): anh chup man hinh that thay trang xam (cover, neo goc tren-trai). Font = FONT.sans.
// Khung doc (portrait.mode = 'native'): trang cao bang chieu cao that (them dong danh sach), ban kinh cuoi cua quang sang
// tinh theo duong cheo that -> van mo rong DEU (tuyen tinh) va phu kin dung luc het canh.
import { useCurrentFrame, useVideoConfig, useText, useList, useImage, useShotFonts, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { FONT } from '../../../fixtures/Polish';

// 灰阶界面（自绘，替代真 UI）：标题 + 标签页 + 列表行
const InboxPanel: React.FC<{ H: number; title: string; tabs: string[]; rows: number; titleSize: number; padTop: number; screen?: string }> = ({ H, title, tabs, rows, titleSize, padTop, screen }) => screen ? (
  // 相机放大 1.75→1.47、锚点 (346,130)：只看得到左上一块 → 实拍图铺在"终态可见区"（+ 平移余量）里，整张图都能被看到
  <div style={{ width: 1920, height: H, background: '#f6f6f5', position: 'relative' }}>
    <img src={screen} style={{ position: 'absolute', left: 50, top: -20, width: 1430, height: (H - 130) / 1.47 + 130 + 260, objectFit: 'cover', objectPosition: '50% 50%', display: 'block' }} />
  </div>
) : (
  <div
    style={{
      width: 1920,
      height: H,
      background: '#f6f6f5',
      fontFamily: FONT.sans,
      padding: `${padTop}px 120px 0`,
      boxSizing: 'border-box',
      color: '#2c2c2c',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
      <div style={{ fontSize: titleSize, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{title}</div>
      <div
        style={{
          width: 0, height: 0, marginTop: 26,
          borderLeft: '16px solid transparent',
          borderRight: '16px solid transparent',
          borderTop: '20px solid #3a3a3a',
        }}
      />
    </div>
    <div style={{ display: 'flex', gap: 64, marginTop: 70, fontSize: 44, color: '#555', whiteSpace: 'nowrap' }}>
      {tabs.map((t, i) => i === 0
        ? <div key={i} style={{ background: '#e9e8f6', color: '#5b55c8', padding: '10px 34px', borderRadius: 14, fontWeight: 600 }}>{t}</div>
        : <div key={i} style={{ padding: '10px 0' }}>{t}</div>)}
    </div>
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 30, marginTop: row === 0 ? 96 : 64 }}>
        <div style={{ width: 42, height: 42, border: '3px solid #c9c9c7', borderRadius: 10 }} />
        <div style={{ width: 14, height: 14, borderRadius: 7, background: '#5b55c8' }} />
        <div style={{ width: 56, height: 56, borderRadius: 28, background: '#efe4e2' }} />
        <div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
            <div style={{ height: 22, width: 220 + ((row * 67) % 90), background: '#3f3f3f', borderRadius: 11 }} />
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#bbb' }} />
            <div style={{ height: 18, width: 260, background: '#c9c9c7', borderRadius: 9 }} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 16 }}>
            <div style={{ height: 18, width: 300, background: '#8f8bd8', borderRadius: 9, opacity: 0.75 }} />
            <div style={{ height: 18, width: 340 - ((row * 91) % 120), background: '#d8d8d6', borderRadius: 9 }} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const CornerSpotlightReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const fonts = useShotFonts();
  const title = useText('title', 'Thư viện');
  const tabs = useList('tabs', ['Tất cả', 'Video', 'Hình ảnh', 'Tài liệu', 'Lưu trữ']).slice(0, 5);
  const screen = useImage('screen');
  // 标题：画面放大 ~1.5–1.75 倍后只看得到左上 ~1100px，标题限宽 1000（再长就缩字）
  const titleSize = fitSize(title, { family: fonts.sans, size: 118, maxWidth: 1000, weight: 700, minSize: 64 });
  // 竖屏：页面高 = 舞台高；列表行数按高度补满
  const rows = portrait ? 2 + Math.ceil((SH - 1080) / 170) : 3;
  // 半径终值：横屏 = 原版 1300；竖屏按"光心终点 (420,260) → 界面远角"的距离等比放大，饱和时刻与原版一致（仍匀速）
  const rEnd = portrait ? Math.round((1300 * Math.hypot(1920 - 420, SH - 260)) / Math.hypot(1920 - 420, 1080 - 260)) : 1300;

  // 聚光半径扩张：全程匀速（用户裁决"整个过程要匀速"——严格 linear，无缓动）
  // r+feather=1.85r 是光前沿；1.85*1300≈2400 恰在片尾盖满全屏对角，
  // 保证扩张动作占满全片时长而不是前 1/3 就饱和
  const r = interpolate(frame, [0, 100], [160, rEnd], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 光心沿左上角匀速游移（linear）
  const cx = interpolate(frame, [0, 96], [140, 420], { extrapolateRight: 'clamp' });
  const cy = interpolate(frame, [0, 96], [90, 260], { extrapolateRight: 'clamp' });

  // 软边宽度：扩张时边缘更羽化
  const feather = r * 0.85;

  // UI 轻微透视漂移（原片相机贴着界面缓推）
  const drift = interpolate(frame, [0, 100], [0, 1]);
  const scale = 1.75 - 0.28 * drift;
  const tx = -40 + 70 * drift;
  const ty = -30 + 50 * drift;

  const mask = `radial-gradient(circle ${r + feather}px at ${cx}px ${cy}px, rgba(255,255,255,1) ${Math.max(
    0,
    ((r - feather * 0.25) / (r + feather)) * 100,
  )}%, rgba(255,255,255,0) 100%)`;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          transform: `scale(${scale}) translate(${tx}px, ${ty}px) rotate(${-1.2 + 1.2 * drift}deg)`,
          transformOrigin: '346px 130px', // = 18% 12% cua khung 1920x1080 (khung doc: giu goc tren-trai, khong theo % chieu cao)
        }}
      >
        <InboxPanel H={SH} title={title} tabs={tabs} rows={rows} titleSize={titleSize} padTop={portrait ? 200 : 90} screen={screen} />
      </AbsoluteFill>
      {/* 聚光自身的白热光晕（叠在界面上方，光心最亮） */}
      <div
        style={{
          position: 'absolute',
          left: cx - r * 0.7,
          top: cy - r * 0.7,
          width: r * 1.4,
          height: r * 1.4,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,0.85), rgba(255,255,255,0.25) 45%, transparent 75%)',
          filter: 'blur(26px)',
          opacity: interpolate(frame, [0, 10, 60, 90], [0, 0.9, 0.55, 0], {
            extrapolateRight: 'clamp',
          }),
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

export const CORNER_SPOTLIGHT_REVEAL_DURATION = 130;
