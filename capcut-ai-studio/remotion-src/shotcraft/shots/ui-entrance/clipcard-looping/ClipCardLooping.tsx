// clipcard-looping —— 真实视频素材装进圆角卡片（ClipCard 交叉淡化循环）。
// 上游此文件只是 fixtures/ClipCard.tsx 的回归测试（三张 200px 小卡）。
//
// [Agent Edit] VIET LAI thanh mot canh B-roll that: "the footage" — doan video THAT (cat tu video goc hoac video nguoi
// dung) nam trong mot tam the bo goc tren san khau toi (graphite), nhu mot khung "highlight" trong phim tai lieu.
// Ngon ngu chuyen dong muon tu spotlight-hero-card / magician-card-flourish:
//   0–8     san khau sang dan (den chinh len, bui bay)
//   4–34    the vao: troi len tu duoi + nga ve sau (rotateX 22° -> 0), xoay nhe, phong 0.84 -> 1 (qua tron), mo -> net
//   10–28   footage "bat sang" trong the (chop sang 1.7 -> 1), 30 nhip cham dat: mot vong sang mau nhan toa ra tu mep the
//   34–60   vet sang (sheen) luot qua mat the mot lan
//   30–150  the troi nhe (bob 40f, xoay 3D rat nhe) + day may cham 1 -> 1.04; footage ben trong lui 1.1 -> 1.03 (thi sai)
//   26–86   chip nhan (kicker) -> tieu de len tung tu -> chu thich hien tu mo; tu ~86 la mot tam poster hoan chinh
// O anh `video` (role video, BAT BUOC): mp4 bat ky ti le (9:16 / 16:9 / vuong). Do do dai + ti le that bang mot the
// <video> an (delayRender). The theo ti le footage (kep trong khoang dep), footage `cover`. TAT TIENG (giong nguoi noi
// van chay ben duoi). Footage ngan hon canh -> lap lai bang hoa tan cheo (cung thuat toan ClipCard: lop moi mo dan
// tren lop cu, buoc = do dai - doan hoa tan). Khong dung truc tiep fixtures/ClipCard: no chi ve the VUONG, doc src qua
// staticFile va tinh Sequence theo 30fps cua mau — o day footage chay theo DONG HO THAT cua video (khong nhan `rate`).
// Gui anh thay video -> anh tinh (cover) voi day may cham.
// Khung doc (native): the lon chiem phan lon khung, tieu de + chu thich nam duoi; khung ngang: the ben trai, cot chu phai.
import { useCurrentFrame, useVideoConfig, useImage, useText, useShot, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame as useRealFrame,
  useVideoConfig as useRealConfig,
} from 'remotion';
import { EASE, Grain, Vignette, mix, ramp } from '../../../fixtures/Polish';
import { Dust, LOOKS, Sheen, Stage, TextReveal, alpha, type } from '../../../fixtures/Look';

export const CLIPCARD_LOOPING_DURATION = 150; // 5s @30fps

const isVideo = (u?: string) => !!u && /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i.test(u);

// Do do dai (giay) + ti le footage that (tat dinh: delayRender cho toi khi doc xong metadata).
type Probe = { sec: number | null; aspect: number | null };
const useFootageProbe = (src: string | undefined): Probe | null => {
  const [res, setRes] = useState<Probe | null>(null);
  const [handle] = useState(() => (src ? delayRender('clipcard: do do dai / ti le footage', { timeoutInMilliseconds: 60000 }) : null));
  useEffect(() => {
    if (!src || handle === null) return;
    let done = false;
    const finish = (p: Probe) => {
      if (done) return;
      done = true;
      setRes(p);
      continueRender(handle);
    };
    const timer = setTimeout(() => finish({ sec: null, aspect: null }), 20000);
    if (isVideo(src)) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () =>
        finish({
          sec: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null,
          aspect: v.videoWidth > 0 && v.videoHeight > 0 ? v.videoWidth / v.videoHeight : null,
        });
      v.onerror = () => finish({ sec: null, aspect: null });
      v.src = src;
    } else {
      const img = new Image();
      img.onload = () => finish({ sec: null, aspect: img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null });
      img.onerror = () => finish({ sec: null, aspect: null });
      img.src = src;
    }
    return () => {
      clearTimeout(timer);
      finish({ sec: null, aspect: null });
    };
  }, [src, handle]);
  return res;
};

// Xuong dong CAN BANG: giu so dong, thu hep be ngang toi da de cac dong dai gan bang nhau (khong de 1 tu mo coi).
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number): string[] => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.45;
  let hi = maxW;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length > base.length) lo = mid;
    else hi = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

const MEDIA: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

// Mot lop cua vong lap: lop moi (i>0) mo dan 0->1 trong `fade` khung TREN lop cu (lop cu giu nguyen den het file)
// -> khong bi toi di giua hai lop nhu khi ca hai cung mo mot nua.
const LoopLayer: React.FC<{ src: string; fade: number }> = ({ src, fade }) => {
  const f = useRealFrame();
  const opacity = fade > 0 ? interpolate(f, [0, fade], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return <OffthreadVideo src={src} muted style={{ ...MEDIA, opacity }} />;
};

// Footage theo DONG HO THAT cua video (khung that, fps that): canh dai hon footage -> hoa tan lap lai.
const FootageVideo: React.FC<{ src: string; sec: number | null }> = ({ src, sec }) => {
  const { fps, durationInFrames: compDur } = useRealConfig();
  const shot = useShot();
  const rate = shot?.rate ?? 1;
  // do dai canh (khung that) + du phong khi canh giu khung cuoi lau hon do dai mau
  const shotFrames = Math.min(compDur, Math.ceil(((shot?.native ?? CLIPCARD_LOOPING_DURATION) / 30 / rate) * fps * 1.5) + Math.round(fps));
  const fade = Math.max(4, Math.round(fps * 0.4));
  const clipFrames = sec ? Math.floor(sec * fps) - 1 : 0;
  const step = clipFrames - fade;
  if (!sec || clipFrames >= shotFrames || step < fade) return <OffthreadVideo src={src} muted style={MEDIA} />;
  const n = Math.max(1, Math.ceil(shotFrames / step));
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Sequence key={i} from={i * step} durationInFrames={clipFrames} layout="none">
          <LoopLayer src={src} fade={i === 0 ? 0 : fade} />
        </Sequence>
      ))}
    </>
  );
};

export const ClipCardLooping: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const L = LOOKS.graphite;
  const ACC = L.accent;

  const src = useImage('video', 'samples/clip1.mp4');
  const probe = useFootageProbe(src);
  const kicker = useText('kicker', 'CẢNH THỰC TẾ');
  const title = useText('title', 'Đơn hàng rời kho chỉ sau 2 giờ');
  const caption = useText('caption', 'Quay tại kho Bình Dương sáng nay, không dàn dựng.');

  // ── chu (do truoc de bo cuc) ──
  const colW = portrait ? 1640 : 640;
  const tBase = portrait ? 150 : 88;
  const tLines = title ? balanced(title, fonts.sans, tBase, colW, 700, portrait ? 2 : 4) : [];
  const tSize = Math.min(tBase, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tBase, maxWidth: colW, weight: 700, minSize: tBase * 0.55 })));
  const cBase = portrait ? 80 : 40;
  const cLines = caption ? balanced(caption, fonts.sans, cBase, colW, 400, 3) : [];
  const cSize = Math.min(cBase, ...cLines.map((l) => fitSize(l, { family: fonts.sans, size: cBase, maxWidth: colW, weight: 400, minSize: cBase * 0.6 })));
  const tLH = 1.16;
  const cLH = 1.38;
  const ruleGap = portrait ? 44 : 26;
  const tH = tLines.length * tSize * tLH;
  const cH = cLines.length * cSize * cLH;
  const textH = tH + (tLines.length && cLines.length ? ruleGap * 2 + 3 : 0) + cH;
  const hasText = textH > 0;

  // ── the: ti le theo footage (kep cho dep), dat theo khung ──
  const fa = probe?.aspect ?? (portrait ? 9 / 16 : 16 / 9);
  const ca = portrait ? Math.max(0.62, Math.min(1.2, fa)) : Math.max(0.56, Math.min(1.78, fa));
  let cardW: number, cardH: number, cardX: number, cardY: number, textX: number, textY: number;
  if (portrait) {
    const gap = hasText ? 110 : 0;
    const availH = SH - 2 * 210 - gap - textH;
    cardW = 1640;
    cardH = cardW / ca;
    if (cardH > availH) {
      cardH = availH;
      cardW = cardH * ca;
    }
    const blockH = cardH + gap + textH;
    cardY = Math.max(160, (SH - blockH) / 2 - 30);
    cardX = 960 - cardW / 2;
    textX = 140;
    textY = cardY + cardH + gap;
  } else if (hasText) {
    const gap = 96;
    cardH = 820;
    cardW = cardH * ca;
    if (cardW > 980) {
      cardW = 980;
      cardH = cardW / ca;
    }
    const groupW = cardW + gap + colW;
    cardX = (1920 - groupW) / 2;
    cardY = 540 - cardH / 2;
    textX = cardX + cardW + gap;
    textY = 540 - textH / 2;
  } else {
    cardH = 860;
    cardW = cardH * ca;
    if (cardW > 1500) {
      cardW = 1500;
      cardH = cardW / ca;
    }
    cardX = 960 - cardW / 2;
    cardY = 540 - cardH / 2;
    textX = 0;
    textY = 0;
  }
  const R = portrait ? 56 : 30;
  const ccx = cardX + cardW / 2;
  const ccy = cardY + cardH / 2;

  // ── chuyen dong cua the ──
  const enter = ramp(frame, 4, 30, EASE.snappy);
  const pop = ramp(frame, 4, 26, EASE.overshoot);
  const fadeIn = ramp(frame, 4, 8, EASE.out);
  const blurIn = (1 - ramp(frame, 4, 14, EASE.out)) * 16;
  const t = Math.max(0, frame - 30);
  const settle = ramp(frame, 26, 20, EASE.smooth); // bob vao dan, khong giat
  const bob = Math.sin(t / 40 * Math.PI) * (portrait ? 14 : 8) * settle;
  const ry = Math.sin(t / 55) * 1.8 * settle;
  const rxF = Math.cos(t / 47) * 1.1 * settle;
  const push = mix(1, 1.04, ramp(frame, 30, 120, EASE.smooth));
  const lift = (1 - enter) * (portrait ? 520 : 260);
  const rx = mix(22, 0, enter) + rxF;
  const rz = mix(-3.5, 0, enter);
  const scale = mix(0.84, 1, pop) * push;
  // footage "bat sang" trong the + thi sai nguoc chieu
  const lightUp = ramp(frame, 10, 18, EASE.out);
  const flash = mix(1.7, 1, ramp(frame, 12, 16, EASE.out));
  const inner = mix(1.12, 1.03, ramp(frame, 8, 142, EASE.smooth));
  // vong sang khi dat (30) + sheen (34–60) + den nen
  const ringU = ramp(frame, 28, 22, EASE.out);
  const ringOp = frame >= 28 ? (1 - ringU) * 0.9 : 0;
  const ringGrow = mix(0, portrait ? 90 : 56, ringU);
  const sheen = ramp(frame, 34, 26, EASE.smooth);
  const back = ramp(frame, 18, 30, EASE.out) * (0.85 + 0.15 * Math.sin(frame / 34));
  const stageOn = ramp(frame, 0, 10, EASE.out);
  const shadowK = mix(0.4, 1, enter);

  // ── chu: nhip vao theo so tu (moi thu hien du truoc ~86) ──
  const tWords = tLines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  const cWords = cLines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  const tGap = Math.min(4, 22 / Math.max(1, tWords));
  const cGap = Math.min(2.5, 14 / Math.max(1, cWords));
  const tStart = 38;
  const cStart = tLines.length ? Math.min(58, tStart + tWords * tGap + 4) : 44;
  let wi = 0;
  let ci = 0;

  // chip nhan tren goc the
  const kSize = portrait ? 46 : 24;
  const kText = kicker.toUpperCase();
  const kFit = fitSize(kText, { family: fonts.sans, size: kSize, maxWidth: cardW - (portrait ? 220 : 120), weight: 700, letterSpacingEm: 0.16, minSize: kSize * 0.6 });
  const chipOn = ramp(frame, 26, 12, EASE.overshoot);
  // thanh tien do + ma thoi gian (dong ho that cua footage)
  const realFrame = useRealFrame();
  const { fps: realFps } = useRealConfig();
  const secs = Math.floor(realFrame / realFps);
  const tc = `00:${String(secs % 60).padStart(2, '0')}`;
  const prog = ramp(frame, 20, 129, EASE.linear);
  const uiOn = ramp(frame, 30, 14, EASE.out);
  const pad = portrait ? 44 : 24;

  const vid = isVideo(src);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: L.bg[2] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: portrait ? 0.12 : 0.05 }} fill={{ x: 0.82, y: 0.95 }} intensity={0.35 + 0.55 * stageOn} breathe={0.5} vignette={0.45}>
        <AbsoluteFill style={{ opacity: 0.6 * stageOn }}>
          {Array.from({ length: Math.ceil(SH / 1080) }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, top: i * 1080, width: 1920, height: 1080 }}>
              <Dust look={L} count={28} seed={11 + i} drift={0.28} opacity={0.5} />
            </div>
          ))}
        </AbsoluteFill>
      </Stage>

      {/* den nen sau the (mau nhan nhat + trang am) */}
      <div
        style={{
          position: 'absolute', left: ccx - cardW * 0.95, top: ccy - cardH * 0.8 + bob, width: cardW * 1.9, height: cardH * 1.6, opacity: back,
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent2, 0.22)}, ${alpha(ACC, 0.08)} 45%, ${alpha(ACC, 0)} 72%)`,
          filter: 'blur(20px)',
        }}
      />

      {/* THE */}
      <div style={{ position: 'absolute', inset: 0, perspective: portrait ? 4200 : 2600, perspectiveOrigin: `50% ${((ccy / SH) * 100).toFixed(1)}%` }}>
        <div
          style={{
            position: 'absolute', left: cardX, top: cardY, width: cardW, height: cardH,
            transform: `translateY(${(lift + bob).toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${scale.toFixed(5)})`,
            transformOrigin: '50% 60%', opacity: fadeIn, filter: blurIn > 0.3 ? `blur(${blurIn.toFixed(2)}px)` : undefined,
          }}
        >
          {/* vong sang khi dat */}
          {ringOp > 0.01 && (
            <div style={{ position: 'absolute', left: -ringGrow, top: -ringGrow, right: -ringGrow, bottom: -ringGrow, borderRadius: R + ringGrow * 0.6, border: `${portrait ? 4 : 3}px solid ${alpha(ACC, ringOp)}`, boxShadow: `0 0 ${portrait ? 40 : 24}px ${alpha(ACC, ringOp * 0.5)}` }} />
          )}
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: R, overflow: 'hidden', background: '#0c0d10',
              boxShadow: `0 0 0 ${portrait ? 3 : 2}px ${alpha('#ffffff', 0.14)}, 0 ${(portrait ? 90 : 50) * shadowK}px ${(portrait ? 200 : 120) * shadowK}px ${(portrait ? -30 : -18)}px rgba(0,0,0,0.85), 0 ${portrait ? 24 : 14}px ${portrait ? 60 : 36}px rgba(0,0,0,0.55)`,
            }}
          >
            {/* footage */}
            <div style={{ position: 'absolute', inset: 0, opacity: lightUp, filter: flash > 1.01 ? `brightness(${flash.toFixed(3)})` : undefined, transform: `scale(${inner.toFixed(5)})` }}>
              {src ? vid ? probe ? <FootageVideo src={src} sec={probe.sec} /> : null : <Img src={src} style={MEDIA} /> : (
                <div style={{ ...MEDIA, background: `linear-gradient(160deg, ${L.surface2}, ${L.bg[2]})` }} />
              )}
            </div>
            {/* lop toi tren / duoi de chip + thanh tien do doc ro */}
            <div style={{ position: 'absolute', inset: 0, opacity: uiOn, background: `linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 74%, rgba(0,0,0,0.55) 100%)` }} />
            <Sheen progress={sheen} strength={0.4} width={0.2} />
            {/* chip nhan */}
            {kicker ? (
              <div
                style={{
                  position: 'absolute', left: pad, top: pad, display: 'flex', alignItems: 'center', gap: kFit * 0.55,
                  padding: `${(kFit * 0.5).toFixed(1)}px ${(kFit * 0.8).toFixed(1)}px`, borderRadius: kFit * 2, background: 'rgba(10,10,12,0.62)',
                  border: `1.5px solid ${alpha('#ffffff', 0.16)}`, color: '#fff', whiteSpace: 'nowrap',
                  fontFamily: fonts.sans, fontSize: kFit, fontWeight: 700, letterSpacing: '0.16em', lineHeight: 1.25,
                  transform: `scale(${chipOn.toFixed(4)})`, transformOrigin: '0 50%', opacity: Math.min(1, chipOn * 1.5),
                }}
              >
                <span style={{ width: kFit * 0.5, height: kFit * 0.5, borderRadius: kFit, background: ACC, boxShadow: `0 0 ${kFit * 0.6}px ${alpha(ACC, 0.9)}`, opacity: 0.55 + 0.45 * Math.abs(Math.cos(frame / 9)), flex: 'none' }} />
                {kText}
              </div>
            ) : null}
            {/* thanh tien do + ma thoi gian */}
            <div style={{ position: 'absolute', left: pad, right: pad, bottom: pad, display: 'flex', alignItems: 'center', gap: pad * 0.6, opacity: uiOn }}>
              <svg width={portrait ? 34 : 18} height={portrait ? 38 : 20} viewBox="0 0 18 20" style={{ flex: 'none' }}>
                <path d="M2 1.5 L16.5 10 L2 18.5 Z" fill="#fff" />
              </svg>
              <div style={{ position: 'relative', flex: 1, height: portrait ? 8 : 5, borderRadius: 8, background: alpha('#ffffff', 0.25), overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(prog * 100).toFixed(2)}%`, background: ACC, borderRadius: 8 }} />
              </div>
              <div style={{ ...type(portrait ? 38 : 20, 500, { mono: true }), color: '#fff', letterSpacing: '0.04em', flex: 'none' }}>{tc}</div>
            </div>
          </div>
        </div>
      </div>

      {/* cot chu: tieu de + chu thich */}
      {hasText ? (
        <div style={{ position: 'absolute', left: textX, top: textY, width: colW, color: L.ink }}>
          {tLines.map((l, i) => {
            const start = tStart + wi * tGap;
            wi += l.split(/\s+/).filter(Boolean).length;
            return (
              <div key={i} style={{ ...type(tSize, 700), lineHeight: tLH, whiteSpace: 'nowrap', textAlign: portrait ? 'center' : 'left' }}>
                <TextReveal text={l} by="word" variant="rise" start={start} each={18} gap={tGap} ease={EASE.snappy} />
              </div>
            );
          })}
          {tLines.length && cLines.length ? (
            <div
              style={{
                height: 3, width: portrait ? 220 : 120, margin: `${ruleGap}px ${portrait ? 'auto' : '0'}`, background: ACC, borderRadius: 3,
                transform: `scaleX(${ramp(frame, cStart - 6, 16, EASE.snappy).toFixed(4)})`, transformOrigin: portrait ? '50% 50%' : '0 50%',
              }}
            />
          ) : null}
          {cLines.map((l, i) => {
            const start = cStart + ci * cGap;
            ci += l.split(/\s+/).filter(Boolean).length;
            return (
              <div key={i} style={{ ...type(cSize, 400), lineHeight: cLH, color: L.ink2, whiteSpace: 'nowrap', textAlign: portrait ? 'center' : 'left' }}>
                <TextReveal text={l} by="word" variant="blur" start={start} each={14} gap={cGap} ease={EASE.out} />
              </div>
            );
          })}
        </div>
      ) : null}

      <Vignette strength={0.32} inner={0.5} color={L.shadow} />
      <Grain opacity={0.05} blend="soft-light" />
    </AbsoluteFill>
  );
};
