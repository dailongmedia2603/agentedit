// trailer-bumper｜前置速剪预告
// 结构即全部：三连 9f 速剪（A 整页 / B 整页 / A 中列 Top pages 卡 2.2x 怼脸特写）→ 6f 纯黑喘息
// → 正式开场大标题淡入+微升 16f 定格。每个速剪镜头内部带 1→1.04 轻推近。
// 收尾真静止：标题字距 30f 收拢完（63f）后所有动画结束，静止 77f（>40f）。
// 质感：三镜构图拉开（全景 / 换页全景 / 特写），特写放大走 CSS zoom 按目标尺寸栅格化（Q2）；
// 三镜统一镜头暗角 + 颗粒，像同一台摄影机拍的；黑场是真正的纯黑空帧（静默一拍）；
// 开场字卡是成品级标题：柔光底 + 眉题 + 主标题 + 副题，主标题在淡入微升的同时字距从
// 0.05em 缓收到 −0.012em（预告片标题的"呼吸"），副题晚 6f 跟进，63f 后整帧冻结。
//
// [Agent Edit] o anh: shot1 / shot2 / shot3 (tuy chon — 3 khoanh khac bat mat nhat: anh B-roll / khung hinh video; anh
// ti le bat ky -> cover; khong co thi dung dashboard gia nhu ban goc). O chu: kicker (dong nho tren) / title (ten
// thuong hieu / san pham / chuong trinh; khong co -> ten thuong hieu cua video) / subtitle. Tieu de tu thu nho vua be ngang
// (tinh ca gian chu 0.05em luc dau), khung doc to hon va xuong toi da 2 dong. Khung doc (portrait.mode = 'native'): 3 canh
// cat la 3 khung cat doc khac nhau cua dashboard (cover 3.2x trai / phai, can canh 3.3x) hoac anh that cover.
// (can canh doc 3.3x: the 'Trang xem nhieu' van nam tron trong be ngang)
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useImage, useBrand, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Freeze, interpolate, Easing } from 'remotion';
import { G, FakeDashboard } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, Grain, Vignette, mix, ramp, tracking } from '../../../fixtures/Polish';

export const TRAILER_BUMPER_DURATION = 140; // 速剪 27f + 黑场 6f + 标题入场 30f + 静止 77f

// 时间轴（帧）
const CUT_1 = 0; // 镜头1：variant A 整页
const CUT_2 = 9; // 镜头2：variant B 整页
const CUT_3 = 18; // 镜头3：variant A 中列卡片 2.2x 怼脸特写
const BLACK = 27; // 纯黑静默
const TITLE = 33; // 正式开场
const TITLE_IN = 16; // 标题淡入+微升时长
const SETTLED = TITLE + 30; // 字距收拢完成 = 全片最后一个动画帧

// 速剪镜头内部轻推近：镜头内 local 0→9f，scale 1→1.04（匀速：9f 内的恒速蠕动，跨切点读作同一口气）
const push = (frame: number, start: number) =>
  interpolate(frame, [start, start + 9], [1, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

// 镜头 3 对焦点：中列上卡 Top pages 中心 → 推到屏幕中心
const FOCUS_X = 1071;
const FOCUS_Y = 335;
const CLOSE = 2.2;

const Shot: React.FC<{ children: React.ReactNode; s: number }> = ({ children, s }) => (
  <AbsoluteFill style={{ background: G.canvas, overflow: 'hidden' }}>
    <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: '50% 50%' }}>{children}</AbsoluteFill>
    <Vignette strength={0.18} inner={0.5} color="#1a1c24" />
    <Grain opacity={0.05} />
  </AbsoluteFill>
);

// 假 dashboard 以 CSS zoom 放大（字按目标尺寸栅格化），对焦点 (fx, fy) 落在画面 (960, SH/2)
const DashCrop: React.FC<{ variant: 'A' | 'B'; z: number; fx: number; fy: number; SH: number }> = ({ variant, z, fx, fy, SH }) => (
  <div style={{ position: 'absolute', left: 960 / z - fx, top: SH / 2 / z - fy, width: 1920, height: 1080, zoom: z }}>
    <FakeDashboard variant={variant} />
  </div>
);
// 真实镜头：任意比例 cover 铺满
const Photo: React.FC<{ src: string }> = ({ src }) => (
  <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%' }} />
);

export const TrailerBumper: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const fonts = useShotFonts();
  const brand = useBrand();
  // [Agent Edit] nen anh AI: the tieu de sang dan tu den len ANH NEN (thay nen sang tu ve); chu co bong sang nhe
  const bd = useBackdrop();
  const img1 = useImage('shot1');
  const img2 = useImage('shot2');
  const img3 = useImage('shot3');
  const kicker = useText('kicker', 'CHÍNH THỨC RA MẮT');
  const title = useText('title', brand?.name || 'Trợ Lý Bán Hàng');
  const subtitle = useText('subtitle', 'Chốt đơn nhanh gấp đôi, không cần thêm người.');

  // —— 段落 1–3：三连速剪 ——
  if (frame < BLACK) {
    const cover = SH / 1080; // 竖版：dashboard 按高度铺满（≈3.16×，三镜取不同竖条）
    if (frame < CUT_2) {
      // 镜头1：A 整页 + 轻推近
      return (
        <Shot s={push(frame, CUT_1)}>
          {img1 ? <Photo src={img1} /> : portrait ? <DashCrop variant="A" z={cover} fx={620} fy={540} SH={SH} /> : <FakeDashboard variant="A" />}
        </Shot>
      );
    }
    if (frame < CUT_3) {
      // 镜头2：B 整页 + 轻推近
      return (
        <Shot s={push(frame, CUT_2)}>
          {img2 ? <Photo src={img2} /> : portrait ? <DashCrop variant="B" z={cover} fx={1500} fy={540} SH={SH} /> : <FakeDashboard variant="B" />}
        </Shot>
      );
    }
    // 镜头3：A 中列卡片怼脸特写（CSS zoom 布局级放大），叠加同样的轻推近
    return (
      <Shot s={push(frame, CUT_3)}>
        {img3 ? (
          <div style={{ position: 'absolute', inset: 0, transform: 'scale(1.35)', transformOrigin: '50% 45%' }}><Photo src={img3} /></div>
        ) : (
          <DashCrop variant="A" z={portrait ? CLOSE * 1.5 : CLOSE} fx={FOCUS_X} fy={FOCUS_Y} SH={SH} />
        )}
      </Shot>
    );
  }

  // —— 段落 4：纯黑静默 6f，必须纯黑无物 ——
  if (frame < TITLE) {
    return <AbsoluteFill style={{ background: '#000000' }} />;
  }

  // —— 段落 5：正式开场——标题字卡淡入+微升 16f，字距 30f 缓收后定格 ——
  const opacity = interpolate(frame, [TITLE, TITLE + TITLE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const k = portrait ? 1.5 : 1;
  const rise = interpolate(frame, [TITLE, TITLE + TITLE_IN], [44 * k, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const track = mix(0.05, -0.012, ramp(frame, TITLE, SETTLED - TITLE, EASE.out));
  const eyebrow = ramp(frame, TITLE + 2, 16, EASE.out);
  const sub = ramp(frame, TITLE + 6, 18, EASE.out);
  // 开场底从黑场里"亮起"：背景 12f 由黑淡到柔光底（黑场之后不硬跳到大白）
  const lightUp = ramp(frame, TITLE, 12, EASE.out);

  // 标题：按入场时的最大字距（0.05em）留宽；竖版放大并允许两行
  const maxW = portrait ? 1700 : 1760;
  const base = portrait ? 230 : 176;
  const tWrap = portrait ? wrapLines(title, fonts.sans, base, maxW / 1.05, 800, 2) : [title];
  // hai dong: chia sao cho dong dai nhat ngan nhat (tranh mot tu mo coi)
  const tLines = tWrap.length < 2 ? tWrap : (() => {
    const ws = title.split(/\s+/).filter(Boolean);
    let best = [tWrap[0], tWrap[1]], bw = 1e9;
    for (let j = 1; j < ws.length; j++) {
      const a = ws.slice(0, j).join(' '), b = ws.slice(j).join(' ');
      const w = Math.max(measureText(a, fonts.sans, base, 800), measureText(b, fonts.sans, base, 800));
      if (w < bw) { bw = w; best = [a, b]; }
    }
    return best;
  })();
  const tSize = Math.min(...tLines.map((l) => fitSize(l, { family: fonts.sans, size: base, maxWidth: maxW, weight: 800, minSize: base * 0.4, letterSpacingEm: 0.05 })));
  const subSize0 = portrait ? 60 : 40;
  const sLines = subtitle ? wrapLines(subtitle, fonts.sans, subSize0, portrait ? 1640 : 1600, 500, 2) : [];
  const sSize = Math.min(subSize0, ...sLines.map((l) => fitSize(l, { family: fonts.sans, size: subSize0, maxWidth: portrait ? 1640 : 1600, weight: 500, minSize: subSize0 * 0.7 })));
  const kCaps = kicker.length <= 28;
  const kSize = fitSize(kCaps ? kicker.toUpperCase() : kicker, { family: fonts.sans, size: 34 * k, maxWidth: 1600, weight: 600, minSize: 22 * k, letterSpacingEm: kCaps ? 0.18 : 0.04 });

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : '#000000', overflow: 'hidden', fontFamily: fonts.sans }}>
      {bd ? (
        lightUp < 1 ? <AbsoluteFill style={{ background: '#000000', opacity: 1 - lightUp }} /> : null
      ) : (
        <Freeze frame={SETTLED} active={frame >= SETTLED}>
          <AbsoluteFill style={{ opacity: lightUp }}>
            <Backdrop tone="light" light={{ x: 0.5, y: portrait ? 0.45 : 0.36 }} vignette={0.2} />
          </AbsoluteFill>
        </Freeze>
      )}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: `translateY(${rise}px)`,
          }}
        >
          {kicker ? (
            <div
              style={{
                opacity: eyebrow,
                fontSize: kSize,
                fontWeight: 600,
                letterSpacing: kCaps ? '0.18em' : '0.04em',
                color: G.accent,
                marginBottom: 30 * k,
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}
            >
              {kCaps ? kicker.toUpperCase() : kicker}
            </div>
          ) : null}
          <div
            style={{
              opacity,
              fontFamily: fonts.sans,
              fontWeight: 800,
              fontSize: tSize,
              lineHeight: 1.12,
              color: G.ink1,
              letterSpacing: `${track.toFixed(4)}em`,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              paddingTop: tSize * 0.12,
            }}
          >
            {tLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {sLines.length ? (
            <div
              style={{
                opacity: sub,
                marginTop: 38 * k,
                fontSize: sSize,
                fontWeight: 500,
                lineHeight: 1.3,
                color: G.ink2,
                letterSpacing: tracking(40),
                textAlign: 'center',
              }}
            >
              {sLines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
