// timeline-travel —— 时间轴横移（《反恐王国》式）
// 镜头沿水平刻度轴加速横移，v1.0/v2.0/v3.0/Today 四个刻度依次掠过，
// 每过刻度对应卡片从刻度线 spring 过冲弹立 + 短停，镜头不停；
// 末刻度 4f 急停 + 推近 1.28×。世界层只动 translateX/scale。
// f0–12 初始静置；f114 起真静止 46f（160f 总长）。
//
// 质感升级：补导出时长（工作台原推断 104f，正好截在急停帧，Today 卡与推近从未出镜）；去掉调试标题，
// 换成固定页眉；灰骨架 Card 换成出版级里程碑卡（版本 chip / 年份 / 标题 / 说明 / 指标，Today 卡强调色）；
// 6px 墨色竖杠刻度换成带光晕的节点 + 版本/年份两级标签，卡片与节点间一根发丝连杆；冲刺段按相机速度给
// 横向 SpeedBlur（静止/慢段为 0）；背景层大号年份以 0.35× 速度视差平移、随距离交叉淡入淡出，给"旅行"一个远景参照；柔光亮场 + 颗粒。
//
// [Agent Edit] o chu: kicker + title (dau trang co dinh) / labels (3-5 moc: nam, phien ban, "Hôm nay"...) / titles (tieu de
// the moi moc) / descs (mo ta ngan, tuy chon) / dates (ngay nho tren the + duoi moc, tuy chon) / metrics (dong cuoi the,
// tuy chon). So moc = so labels (3-5); tong quang duong giu 4200px nhu ban goc (gian moc = 4200/(n-1)) -> duong cong toc
// do / bat the truoc 6f / phanh gap 104f / day vao 1.28x giu nguyen. The cao theo noi dung that (tieu de 2 dong, mo ta 3 dong).
// Khung doc (native): toan canh 1920x1080 phong 2.6x quanh truc (truc o ~64% khung), dau trang to o tren.
import { useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { interpolate, Easing, spring } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, FONT, Grain, SpeedBlur, innerHighlight, softShadow, tracking } from '../../../fixtures/Polish';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const TIMELINE_TRAVEL_DURATION = 160;

const W = 1920;
const AXIS_Y = 700;
const TOTAL = 4200; // tong quang duong (goc: 3 x 1400)

type Tick = { label: string; date: string; far: string; x: number; title: string[]; desc: string[]; metric: string };

const TRAVEL_START = 12;
const TRAVEL_END = 104; // 急停帧
const ZOOM_END = 114;

// 相机 X：in-out 但前段慢后段快（poly(3) in 为主，末端 out 急收）
const camXAt = (f: number): number => {
  const t = interpolate(f, [TRAVEL_START, TRAVEL_END], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 加速→巡航→急刹：分段缓动，前 15% 缓起，中段近匀加速冲刺，末 12% 急收
  const eased = interpolate(t, [0, 0.15, 0.88, 1], [0, 0.055, 0.9, 1], {
    easing: Easing.inOut(Easing.quad),
  });
  return eased * TOTAL;
};

// 每张卡的弹立帧：相机中心扫过该刻度的时刻（通过 camXAt 反查）
const popFrameOf = (tickX: number): number => {
  for (let f = TRAVEL_START; f <= TRAVEL_END; f++) {
    if (camXAt(f) >= tickX - 960 - 0.5) return f;
  }
  return TRAVEL_END;
};

const CARD_W = 360;
const STEM = 36; // 卡底到轴的连杆长度
const TITLE_FS = 32;
const DESC_FS = 23;

const MilestoneCard: React.FC<{ t: Tick; hero: boolean; h: number; titleFs: number; chipFs: number }> = ({ t, hero, h, titleFs, chipFs }) => (
  <div
    style={{
      width: CARD_W,
      height: h,
      boxSizing: 'border-box',
      borderRadius: 18,
      padding: '24px 26px',
      background: hero ? 'linear-gradient(180deg, #ffffff 0%, #f7f7ff 100%)' : '#ffffff',
      border: hero ? '1px solid rgba(91,99,211,0.35)' : `1px solid ${G.hairline}`,
      boxShadow: `${innerHighlight(0.9)}, ${softShadow(hero ? 18 : 8, { strength: hero ? 1.3 : 1 })}`,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT.sans,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          height: 30,
          padding: '0 12px',
          borderRadius: 8,
          background: hero ? G.accent : G.fill,
          color: hero ? '#fff' : G.ink2,
          fontFamily: FONT.sans,
          fontSize: chipFs,
          fontWeight: 650,
          lineHeight: '30px',
          whiteSpace: 'nowrap',
        }}
      >
        {t.label}
      </div>
      {t.date ? <div style={{ marginLeft: 'auto', fontSize: 20, color: G.ink3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t.date}</div> : null}
    </div>
    <div style={{ marginTop: 16 }}>
      {t.title.map((l, i) => <div key={i} style={{ fontSize: titleFs, fontWeight: 700, lineHeight: 1.2, letterSpacing: tracking(titleFs), color: G.ink1, whiteSpace: 'nowrap' }}>{l}</div>)}
    </div>
    {t.desc.length ? (
      <div style={{ marginTop: 8 }}>
        {t.desc.map((l, i) => <div key={i} style={{ fontSize: DESC_FS, lineHeight: 1.3, color: G.ink2, whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>
    ) : null}
    {t.metric ? (
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 600, color: hero ? G.accent : G.ink3, whiteSpace: 'nowrap' }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: hero ? G.accent : '#c4c6cc', flex: 'none' }} />
        {t.metric}
      </div>
    ) : null}
  </div>
);

const TickStop: React.FC<{ t: Tick; hero: boolean; frame: number; cardH: number; titleFs: number; chipFs: number; labelFs: number }> = ({ t, hero, frame, cardH, titleFs, chipFs, labelFs }) => {
  const pop = popFrameOf(t.x) - 6; // 提前 6f 起弹，掠过时正好立起
  const s = spring({
    frame: frame - pop,
    fps: 30,
    config: { damping: 11, stiffness: 160, mass: 0.9 }, // 明显过冲
    durationInFrames: 26,
  });
  const appeared = frame >= pop;
  // 节点被"点亮"：卡片起弹同拍从空心灰变实心
  const lit = interpolate(frame, [pop, pop + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', left: t.x, top: 0 }}>
      {/* 刻度节点：外圈光晕 + 实心芯 */}
      <div
        style={{
          position: 'absolute', left: -16, top: AXIS_Y - 16, width: 32, height: 32, borderRadius: 16,
          background: hero ? 'rgba(91,99,211,0.16)' : 'rgba(20,22,28,0.06)',
          transform: `scale(${(0.6 + 0.4 * lit).toFixed(3)})`,
        }}
      />
      <div
        style={{
          position: 'absolute', left: -8, top: AXIS_Y - 8, width: 16, height: 16, borderRadius: 8, boxSizing: 'border-box',
          border: `3px solid ${hero ? G.accent : G.ink1}`,
          background: lit > 0.5 ? (hero ? G.accent : G.ink1) : '#f4f4f2',
        }}
      />
      {/* 刻度标签：moc + ngay */}
      <div style={{ position: 'absolute', left: -200, top: AXIS_Y + 34, width: 400, textAlign: 'center', fontFamily: FONT.sans }}>
        <div style={{ fontWeight: 720, fontSize: labelFs, lineHeight: 1.25, letterSpacing: tracking(labelFs), color: hero ? G.accent : G.ink1, whiteSpace: 'nowrap' }}>{t.label}</div>
        {t.date ? <div style={{ marginTop: 2, fontSize: 28, fontWeight: 500, color: G.ink3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t.date}</div> : null}
      </div>
      {/* 卡片从刻度线弹立：以底边为轴 scaleY 0→1（带过冲），伴随轻微横向收拢 */}
      {appeared && (
        <>
          <div
            style={{
              position: 'absolute', left: -0.5, top: AXIS_Y - 8 - STEM * Math.min(1, s), width: 1, height: STEM * Math.min(1, s),
              background: hero ? 'rgba(91,99,211,0.5)' : 'rgba(20,22,28,0.22)',
            }}
          />
          <div
            style={{
              position: 'absolute', left: -CARD_W / 2, top: AXIS_Y - 8 - STEM - cardH,
              transform: `scaleY(${s}) scaleX(${0.85 + 0.15 * s})`, transformOrigin: '50% 100%', opacity: Math.min(1, s * 2),
            }}
          >
            <MilestoneCard t={t} hero={hero} h={cardH} titleFs={titleFs} chipFs={chipFs} />
          </div>
        </>
      )}
    </div>
  );
};

export const TimelineTravel: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'Chặng đường phát triển');
  const headTitle = useText('title', 'Mỗi tháng một bước tiến');
  const labels = useList('labels', ['v1.0', 'v2.0', 'v3.0', 'Hôm nay']).slice(0, 5);
  const titles = useList('titles', ['Ra mắt công khai', 'Máy quay & âm thanh', 'Bàn chỉnh chuyển động', 'Video chỉ từ một câu lệnh']);
  const descs = useList('descs', ['Thẻ công thức cảnh quay, mẫu và thư viện.', 'Chuyển động máy 2.5D, âm thanh khớp nhịp.', 'Tinh chỉnh mọi cảnh quay ở một nơi.', 'Bạn đạo diễn, trợ lý AI tự quay.']);
  const dates = useList('dates', ['Th7 2026', 'Th8 2026', 'Th9 2026', 'Th10 2026']);
  const metrics = useList('metrics', ['Xuất video Remotion', 'Cắt khớp nhịp', 'Xem trước trực tiếp', 'Dùng với trợ lý AI']);

  const n = Math.max(2, labels.length);
  const GAP = TOTAL / (n - 1);
  // do chu that -> xuong dong / thu nho, the cao theo noi dung dai nhat
  const inner = CARD_W - 52;
  const titleFs = Math.min(...titles.slice(0, n).map((t) => {
    const ls = wrapLines(t || ' ', fonts.sans, TITLE_FS, inner, 700, 2);
    return Math.min(...ls.map((l) => fitSize(l, { family: fonts.sans, size: TITLE_FS, maxWidth: inner, weight: 700, minSize: 22 })));
  }));
  const ticks: Tick[] = labels.map((label, i) => {
    const title = wrapLines(titles[i] ?? '', fonts.sans, titleFs, inner, 700, 2);
    let desc = (descs[i] ?? '').trim() ? wrapLines(descs[i], fonts.sans, DESC_FS, inner, 400, 3) : [];
    if (desc.length) desc = desc.map((l, k) => (k === desc.length - 1 && fitSize(l, { family: fonts.sans, size: DESC_FS, maxWidth: inner, weight: 400 }) < DESC_FS ? l.split(' ').slice(0, -1).join(' ') + '…' : l));
    return { label, date: (dates[i] ?? '').trim(), far: label, x: 960 + i * GAP, title, desc, metric: (metrics[i] ?? '').trim() };
  });
  const maxTitle = Math.max(...ticks.map((t) => t.title.length));
  const maxDesc = Math.max(...ticks.map((t) => t.desc.length));
  const hasMetric = ticks.some((t) => t.metric);
  const cardH = Math.max(240, Math.round(48 + 30 + 16 + maxTitle * titleFs * 1.2 + (maxDesc ? 8 + maxDesc * DESC_FS * 1.3 : 0) + (hasMetric ? 18 + 26 : 0) + 4));
  const chipFs = Math.min(...labels.map((l) => fitSize(l, { family: fonts.sans, size: 18, maxWidth: 170, weight: 650, minSize: 12 })));
  const labelFs = Math.min(...labels.map((l) => fitSize(l, { family: fonts.sans, size: 40, maxWidth: Math.min(400, GAP - 120), weight: 720, minSize: 22 })));
  const farFs = Math.min(...labels.map((l) => fitSize(l, { family: fonts.sans, size: 280, maxWidth: 1000, weight: 800, minSize: 110 })));
  const WORLD_W = 960 + TOTAL + 960;

  const camX = camXAt(frame);
  const vx = -(camXAt(frame + 0.5) - camXAt(frame - 0.5)); // 世界层屏幕速度（px/f，向左为负）

  // 急停后推近末刻度：scale 1 → 1.28，中心对准末刻度
  const zoom = interpolate(frame, [TRAVEL_END, ZOOM_END], [1, 1.28], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const headIn = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  // khung doc: canh 1920x1080 phong S quanh truc, truc dat ~60% chieu cao
  const S = portrait ? 2.6 : 1;
  const axisP = portrait ? Math.round(SH * 0.64) : AXIS_Y;
  const sceneTf = portrait ? `translateY(${(axisP - AXIS_Y).toFixed(1)}px) scale(${S})` : undefined;
  const hk = portrait ? 1.9 : 1;
  const kFs = fitSize(kicker.toUpperCase(), { family: fonts.sans, size: 30 * hk, maxWidth: 1680 - 50 * hk, weight: 650, minSize: 18, letterSpacingEm: 0.02 });
  const hLines = portrait ? wrapLines(headTitle, fonts.sans, 128, 1680, 720, 2) : [headTitle];
  const hFs = Math.min(...hLines.map((l) => fitSize(l, { family: fonts.sans, size: portrait ? 128 : 56, maxWidth: 1680, weight: 720, minSize: portrait ? 72 : 36 })));
  const headTop = portrait ? Math.round(SH * 0.09) : 96;

  return (
    <div style={{ width: W, height: SH, overflow: 'hidden', position: 'relative', fontFamily: FONT.sans }}>
      <Backdrop tone="light" light={{ x: 0.5, y: portrait ? 0.4 : 0.22 }} accent={G.accent} vignette={0.16} grain={0} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: 1080, transform: sceneTf, transformOrigin: `960px ${AXIS_Y}px` }}>
        {/* 远景视差：大号刻度字以 0.35× 速度平移、只推近 0.35 倍幅度（远景在推近层之外）；
            按与镜头中心的距离淡入淡出，同一时刻只读到当前刻度 */}
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${(1 + (zoom - 1) * 0.35).toFixed(4)})`, transformOrigin: '50% 62%' }}>
          {ticks.map((t, i) => {
            const d = Math.abs(camX - i * GAP) / 1400; // 0 = 该刻度正对镜头
            const op = Math.max(0, 1 - d / 0.62);
            if (op <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute', left: 960 + i * GAP * 0.35 - camX * 0.35 - 600, width: 1200, top: 210 + (280 - farFs) * 0.5, textAlign: 'center',
                  fontSize: farFs, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.05em', whiteSpace: 'nowrap',
                  color: `rgba(20,22,28,${(0.04 * op).toFixed(4)})`, fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.far}
              </div>
            );
          })}
        </div>
        {/* 推近层：以画面中央偏下（末刻度落点）为原点放大 */}
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '50% 62%' }}>
          {/* 世界层：唯一横移的容器；冲刺段横向运动模糊 */}
          <SpeedBlur vx={vx} amount={0.16} max={9}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: WORLD_W, height: 1080, transform: `translateX(${(-camX).toFixed(2)}px)` }}>
              {/* 主轴线 */}
              <div
                style={{
                  position: 'absolute', left: 200, top: AXIS_Y - 1, width: WORLD_W - 400, height: 2,
                  background: 'linear-gradient(90deg, rgba(20,22,28,0) 0%, rgba(20,22,28,0.22) 4%, rgba(20,22,28,0.22) 96%, rgba(20,22,28,0) 100%)',
                }}
              />
              {/* 次刻度（细短杠，速度参照物） */}
              {Array.from({ length: (n - 1) * 5 + 2 }).map((_, i) =>
                i % 5 === 0 ? null : (
                  <div key={i} style={{ position: 'absolute', left: 960 + i * (GAP / 5) - 1, top: AXIS_Y - 9, width: 2, height: 18, background: 'rgba(20,22,28,0.2)', borderRadius: 1 }} />
                ),
              )}
              {ticks.map((t, i) => (
                <TickStop key={i} t={t} hero={i === ticks.length - 1} frame={frame} cardH={cardH} titleFs={titleFs} chipFs={chipFs} labelFs={labelFs} />
              ))}
            </div>
          </SpeedBlur>
        </div>
      </div>
      {/* 固定页眉 */}
      <div style={{ position: 'absolute', left: 120, top: headTop, opacity: headIn, transform: `translateY(${((1 - headIn) * 8).toFixed(2)}px)` }}>
        {kicker.trim() ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * hk, fontSize: kFs, fontWeight: 650, letterSpacing: tracking(30, true), lineHeight: 1.3, color: G.accent, whiteSpace: 'nowrap' }}>
            <ShotcraftMark size={36 * hk} tone="light" />
            {kicker.toUpperCase()}
          </div>
        ) : null}
        <div style={{ marginTop: 6 * hk }}>
          {hLines.map((l, i) => <div key={i} style={{ fontSize: hFs, fontWeight: 720, lineHeight: 1.2, letterSpacing: tracking(hFs), color: G.ink1, whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
      </div>
      <Grain opacity={0.05} />
    </div>
  );
};
