// list-stack-press —— 列表卡从底部逐张飞上摞起，每张落地压弹整摞、计数器同步跳格
// "堆叠有重量"：每张新卡落上来，已落定的整摞被压下再弹回——物理反馈里读出
// "这是实打实攒下来的东西"。参考实现从 template ScenePapers 剥离：
// 预备拍（计数器先于首卡 4–6f 亮起微缩，把视线引到堆叠区）；5 卡 12f 等距节拍
// 从底部 600px 升入（交替 ±2° 倾斜收平 + scale 1.06→1）；后一张到场时整摞压下
// 6px、8f 弹回（stackPress 脉冲——"有重量"的关键一笔）；落地后高亮条滞后 2–4f
// 长出；收尾一道 glaze 扫光掠过整摞；屏幕空间 DigitRoll 计数器落一张滚一格。
// 正视机位（堆叠/列表镜头必须正视，Q6），相机跟随堆叠向下。
// 质感层（改版）：
// · 相机是一条连续曲线（不在关键帧处速度归零）
// · 飞行卡按速度加纵向运动模糊；阴影改为随离地高度变化的两层（接触影 + 环境影）
// · 高亮条对准卡片标题那一行，叠在字下（荧光笔），不盖住正文
// · glaze 在最后一张落定后扫过，并裁进每张卡的圆角内（Q4）
// · 计数器数字显式用无衬线 + tabular-nums，滚动时带纵向拖影
//
// [Agent Edit] Bo anh chup trang mau (papers-full.png / paper1-5.png + toa do live-layout) -> VE trang danh sach that:
// o chu title / subtitle (dau trang), items (3-6 the, chu that tu xuong dong <= 2 dong), details (dong phu moi the,
// tuy chon), counter_label / counter_note (bo dem). So the n -> nhip roi chia deu de the cuoi van roi ~76f, cuon so
// 8f < khoang cach roi; bo dem dung o n. Camera tinh tu chieu cao that cua chong the.
// Khung doc (portrait.mode = 'native'): the rong gan het khung, chu to (~92px san khau), bo dem nam trong dau trang
// (khong de len the), camera tu 1.15 lui ve vua ca chong.
import { useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, measureText, wrapLines, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { FONT, SpeedBlur, bezier, softShadow, velocity } from '../../../fixtures/Polish';
import { alpha } from '../../../fixtures/Look';
import { BRAND } from '../../../fixtures/Brand';

export const LIST_STACK_PRESS_DURATION = 88; // 18–88f 落在 shot 内 offset 0

const PAPER = '#faf7f2';
const INK = '#1b1813';
const INK2 = '#6d665c';
const INK3 = '#9a9284';
const DUR = 22;
const FLY_EASE = Easing.bezier(0.45, 0.05, 0.25, 1.12);
const VOTES = [63, 51, 87, 44, 72, 58];

// 预备拍：计数器先于首卡亮起 + 微缩 (0.96→1)，把视线引到堆叠区（段落级一次）
const ANTICIPATE_START = 0;
const ANTICIPATE_END = 6;

// 相机：一条连续曲线（页头近景 → 整摞全景），纵向跟随堆叠；82f 后静止留给扫光与计数落定
const CAM_END = 82;
const CY_EASE = bezier(0.42, 0, 0.2, 1);
const Z_EASE = bezier(0.3, 0, 0.18, 1);

// odometer digit column —— 连续里程计，不重挂：`pos` 是数字带上的连续位置，每张卡落地让 pos 多滚进一格。
// 单格滚动必须短于落卡间距、且最后一格在镜头结束前落定。
const DIGITS = '0123456789';
const ROLL_DUR = 8; // 单格滚动帧数，< 落卡间距
const ROLL_EASE = Easing.bezier(0.25, 0.8, 0.25, 1);

const DigitRoll: React.FC<{ pos: number; size: number; color: string; blur: number }> = ({ pos, size, color, blur }) => {
  const lineH = size * 1.12;
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', height: lineH, verticalAlign: 'bottom' }}>
      <span style={{ display: 'inline-block', height: lineH }}>
        <span style={{ display: 'block', transform: `translateY(${-pos * lineH}px)`, filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined }}>
          {(DIGITS + DIGITS).split('').map((d, j) => (
            <span key={j} style={{ display: 'block', fontFamily: FONT.sans, fontWeight: 500, fontSize: size, letterSpacing: '-0.04em', lineHeight: `${lineH}px`, color, fontVariantNumeric: 'tabular-nums' }}>
              {d}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
};

// 折行 + 缩字号：先在 [minSize, size] 里找能放进 maxLines 行的最大字号，再做行长均衡（末行不只剩一个词）；
// 最小字号仍放不下 -> 末行合并并整体缩到一行宽内
const fitWrap = (text: string, family: string, weight: number, size: number, minSize: number, maxW: number, maxLines: number) => {
  let sz = size;
  let lines = wrapLines(text, family, sz, maxW, weight, 99);
  while (lines.length > maxLines && sz > minSize) {
    sz = Math.max(minSize, Math.round(sz * 0.93));
    lines = wrapLines(text, family, sz, maxW, weight, 99);
  }
  if (lines.length > maxLines) {
    lines = wrapLines(text, family, sz, maxW, weight, maxLines);
    sz = Math.min(sz, ...lines.map((l) => fitSize(l, { family, size: sz, maxWidth: maxW, weight, minSize: minSize * 0.6 })));
    return { size: sz, lines };
  }
  if (lines.length > 1) {
    for (let w = maxW - 24; w > maxW * 0.45; w -= 24) {
      const alt = wrapLines(text, family, sz, w, weight, 99);
      if (alt.length > lines.length) break;
      lines = alt;
    }
  }
  return { size: sz, lines };
};

export const ListStackPress: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: VH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = VH > 1080 * 1.2;
  const title = useText('title', 'Bản tin công nghệ sáng nay');
  const subtitle = useText('subtitle', 'Tự động tổng hợp từ 31 nguồn, chỉ giữ lại những tin liên quan tới bạn.');
  const items = useList('items', [
    'AI viết code giúp lập trình viên nhanh gấp đôi',
    'Điện thoại gập mới pin dùng trọn hai ngày',
    'Ngân hàng số mở tài khoản chỉ trong ba phút',
    'Xe điện giá rẻ sạc đầy trong 20 phút',
    'Ứng dụng học tiếng Anh bằng trợ lý giọng nói',
  ]).slice(0, 6);
  const details = useList('details', [
    'Thử nghiệm với 500 kỹ sư, thời gian hoàn thành giảm một nửa.',
    'Màn hình bền hơn, nếp gấp gần như biến mất.',
    'Xác thực khuôn mặt, không cần ra quầy giao dịch.',
    'Trạm sạc nhanh có mặt ở 63 tỉnh thành.',
    'Luyện nói mỗi ngày, chấm phát âm ngay lập tức.',
  ]);
  const counterLabel = useText('counter_label', 'Tin mới');
  const counterNote = useText('counter_note', 'Trên 31 tin hôm nay');
  const N = Math.max(1, items.length);
  // 节拍：≤12f 等距；条目多时压密，末张仍在 ~76f 落地，单格滚动 8f 始终短于间距
  const STEP = N > 1 ? Math.min(12, 48 / (N - 1)) : 12;
  const CUES = Array.from({ length: N }, (_, i) => 6 + i * STEP);
  const TILTS = CUES.map((_, i) => (i % 2 ? -2 : 2));

  // ───── 版面（页面坐标，宽 1920） ─────
  const K = portrait ? 1.5 : 1; // 竖版位移幅度等比放大（压感/飞入）
  const cardX = portrait ? 140 : 408;
  const cardW = portrait ? 1640 : 1104;
  const pad = portrait ? 52 : 26;
  const innerW = cardW - pad * 2;
  const tSize = portrait ? 92 : 34;
  const dSize = portrait ? 54 : 24;
  const rankSize = portrait ? 40 : 20;
  const rankW = portrait ? 0 : 130; // 横版序号与标题同行；竖版序号单独一行
  const tLH = Math.round(tSize * 1.2);
  const dLH = Math.round(dSize * 1.35);
  const cards = items.map((it, i) => {
    const tw = innerW - rankW;
    const { size, lines } = fitWrap(it, fonts.sans, 600, tSize, tSize * 0.75, tw, 2);
    const det = (details[i] || '').trim();
    const dLines = det ? wrapLines(det, fonts.sans, dSize, innerW, 400, 2) : [];
    return { text: it, lines, size, dLines, hlW: Math.min(tw, measureText(lines[0] || '', fonts.sans, size, 600)) };
  });
  const maxT = Math.max(...cards.map((c) => c.lines.length));
  const maxD = Math.max(0, ...cards.map((c) => c.dLines.length));
  const cardH = Math.round(pad * 2 + (portrait ? rankSize * 1.3 + 16 : 0) + maxT * tLH + (maxD ? (portrait ? 18 : 12) + maxD * dLH : 0));
  const gap = portrait ? 26 : 16;
  // 页头
  const headTop = portrait ? 260 : 90;
  const hSize = portrait ? 96 : 44;
  const sSize = portrait ? 50 : 26;
  // 计数器尺寸（竖版放在页头右侧：按标签实测宽度定缩放，标题让出这块宽度）
  const labW = (txt: string, sz: number, w: number, ls: number) => (txt ? measureText(txt.toUpperCase(), fonts.sans, sz, w) + txt.length * ls * sz : 0);
  const cRaw = Math.max(220, labW(counterLabel, 22, 600, 0.16), labW(counterNote, 19, 500, 0.1));
  const cScale = portrait ? Math.min(1.9, 560 / cRaw) : 1;
  const counterW = cRaw * cScale;
  const counterH = (22 * 1.3 + 4 + 104 * 1.12 + 19 + 19 * 1.3) * cScale;
  const hW = portrait ? cardW - counterW - 60 : cardW - 380;
  const hFitR = fitWrap(title, fonts.sans, 700, hSize, hSize * 0.6, hW, portrait ? 3 : 2);
  const hLines = hFitR.lines;
  const hFit = hFitR.size;
  const sLines = subtitle ? wrapLines(subtitle, fonts.sans, sSize, portrait ? cardW : hW, 400, 2) : [];
  const metaSize = portrait ? 38 : 20;
  const topRowH = portrait ? Math.max(hLines.length * hFit * 1.22, counterH) : hLines.length * hFit * 1.22;
  const headH = topRowH + (sLines.length ? 14 + sLines.length * sSize * 1.35 : 0) + 22 + metaSize * 1.4 + 18;
  const firstTop = Math.round(headTop + headH + (portrait ? 40 : 16));
  const cardTop = (i: number) => firstTop + i * (cardH + gap);
  const lastBottom = cardTop(N - 1) + cardH;

  // 相机：起点近景对准页头，终点框住整摞（横版不含页头，计数器在屏幕空间）
  const z0 = portrait ? 1.15 : 1.35;
  const cy0 = VH / (2 * z0) + headTop - (portrait ? 140 : 220);
  const spanTop = portrait ? headTop - 60 : firstTop - 40;
  const spanBot = lastBottom + 40;
  const z1 = Math.min(portrait ? 1.25 : 1, (VH * 0.96) / (spanBot - spanTop));
  const cy1 = (spanTop + spanBot) / 2;
  const camAt = (f: number) => {
    const u = Math.min(1, Math.max(0, f / CAM_END));
    return { cy: cy0 + (cy1 - cy0) * CY_EASE(u), zoom: z0 + (z1 - z0) * Z_EASE(u) };
  };
  const cam = camAt(frame);

  const rollAt = (f: number) => {
    let pos = 0;
    for (const c of CUES) {
      pos += interpolate(f, [c + DUR, c + DUR + ROLL_DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ROLL_EASE });
    }
    return pos;
  };
  // 飞行进度（含过冲）与纵向位移，作为帧的纯函数——速度模糊要在相邻帧求值
  const flyT = (i: number, f: number) =>
    interpolate(f, [CUES[i], CUES[i] + DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FLY_EASE });
  const flyY = (i: number, f: number) => 600 * K * (1 - flyT(i, f));

  const rollPos = rollAt(frame);
  const rollV = Math.abs(velocity(rollAt, frame)); // 格/帧

  // 预备拍：计数器 0→6f 从 scale 0.96 微缩回 1 并亮起
  const antT = interpolate(frame, [ANTICIPATE_START, ANTICIPATE_END], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
  });
  const counterScale = 0.96 + 0.04 * antT;
  const counterOpacity = 0.3 + 0.7 * antT;

  // 后一张到场时，已落定的整摞压下 6px 再 ~8f 弹回
  const stackPress = (settledIndex: number) => {
    let press = 0;
    for (let j = settledIndex + 1; j < CUES.length; j++) {
      const cue = CUES[j];
      const p = interpolate(frame, [cue, cue + 4, cue + 8], [0, 6 * K, 0], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin),
      });
      press = Math.max(press, p);
    }
    return press;
  };

  // glaze：最后一张落定后从左上扫过整摞（页面坐标），只在卡片圆角内可见
  const lastLand = CUES[N - 1] + DUR;
  const glazeX = interpolate(frame, [lastLand - 2, Math.min(87, lastLand + 11)], [-500, 2300], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.45, 0, 0.35, 1),
  });
  const glazeVis = interpolate(frame, [lastLand - 2, lastLand + 1, lastLand + 8, lastLand + 11], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const counter = (scale: number) => (
    <div style={{ textAlign: 'right', opacity: counterOpacity, transform: `scale(${counterScale})`, transformOrigin: 'top right' }}>
      {counterLabel ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 22 * scale, fontWeight: 600, letterSpacing: '0.16em', color: INK2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {counterLabel.toUpperCase()}
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 * scale }}>
        <DigitRoll pos={rollPos} size={104 * scale} color={BRAND.amber} blur={Math.min(6, rollV * 30)} />
      </div>
      <div style={{ height: Math.max(1, scale), background: 'rgba(60,50,40,0.18)', margin: `${8 * scale}px 0 ${10 * scale}px auto`, width: 220 * scale }} />
      {counterNote ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 19 * scale, fontWeight: 500, letterSpacing: '0.1em', color: INK3, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {counterNote.toUpperCase()}
        </div>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {/* 页面层：正视相机（只做纵向跟随 + 推拉） */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: 1920, height: VH, transformOrigin: '0 0',
        transform: `translate(960px, ${VH / 2}px) scale(${cam.zoom.toFixed(5)}) translate(-960px, ${(-cam.cy).toFixed(2)}px)`,
      }}>
        {/* 页头 */}
        <div style={{ position: 'absolute', left: cardX, top: headTop, width: cardW }}>
          <div style={{ height: topRowH, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {hLines.map((l, k) => (
              <div key={k} style={{ fontFamily: FONT.sans, fontSize: hFit, fontWeight: 700, color: INK, letterSpacing: '-0.02em', lineHeight: `${hFit * 1.22}px`, whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
          {sLines.length ? (
            <div style={{ marginTop: 14, width: portrait ? cardW : hW }}>
              {sLines.map((l, k) => (
                <div key={k} style={{ fontFamily: FONT.sans, fontSize: sSize, fontWeight: 400, color: INK2, lineHeight: `${sSize * 1.35}px`, whiteSpace: 'nowrap' }}>{l}</div>
              ))}
            </div>
          ) : null}
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', paddingBottom: 18, borderBottom: '1.5px solid rgba(40,30,20,0.12)', fontFamily: FONT.sans, fontSize: metaSize, color: INK3, letterSpacing: '0.04em', lineHeight: 1.4 }}>
            <span>Hôm nay · {N} mục</span>
            <span>Cập nhật 06:30</span>
          </div>
          {portrait ? <div style={{ position: 'absolute', right: 0, top: 0 }}>{counter(cScale)}</div> : null}
        </div>

        {cards.map((c, i) => {
          const cue = CUES[i];
          const t = flyT(i, frame);
          if (t <= 0) return null;
          const settled = t >= 0.999;
          const dy = flyY(i, frame) + (settled ? stackPress(i) : 0);
          const rot = TILTS[i] * (1 - t);
          const scale = 1.06 - 0.06 * t;
          // 离地高度：飞行段按剩余行程映射 0–56px，落定 3px（被压时更贴地）
          const elev = settled ? 3 - (stackPress(i) / K) * 0.3 : 3 + 53 * Math.min(1, Math.max(0, 1 - t));
          const vy = settled ? 0 : velocity((f) => flyY(i, f), frame);
          // 高亮条：落地后滞后 3f 长出；最后一张离切点近，节拍压缩到 5f 长 + 4f 淡
          const lastCard = i === N - 1;
          const hlStart = cue + DUR + (lastCard ? 2 : 3);
          const hlLen = lastCard ? 5 : 7;
          const hlGrow = interpolate(frame, [hlStart, hlStart + hlLen], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1),
          });
          const hlFade = interpolate(frame, [hlStart + hlLen, hlStart + hlLen + (lastCard ? 4 : 5)], [1, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const top = cardTop(i);
          const titleTop = pad + (portrait ? rankSize * 1.3 + 16 : 0);
          const card = (
            <div style={{
              position: 'absolute', left: cardX, top, width: cardW, height: cardH,
              transform: `translateY(${dy.toFixed(3)}px) rotate(${rot.toFixed(4)}deg) scale(${scale.toFixed(5)})`,
              transformOrigin: 'center center', borderRadius: portrait ? 22 : 12,
              boxShadow: softShadow(elev * K, { color: '#3c2d1e', strength: 1.15 }),
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: portrait ? 22 : 12, overflow: 'hidden', background: '#fffdf9', border: '1px solid rgba(40,30,20,0.1)' }}>
                {/* 序号 + 热度 */}
                <div style={{ position: 'absolute', left: pad, top: portrait ? pad : pad + (tLH - rankSize * 1.3) / 2, display: 'flex', gap: rankSize * 0.8, fontFamily: FONT.mono, fontSize: rankSize, color: INK3, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                  <span>#{i + 1}</span>
                  <span>↑ {VOTES[i % VOTES.length]}</span>
                </div>
                {/* 荧光笔：叠在标题首行字下 */}
                {hlGrow > 0 && hlFade > 0 ? (
                  <div style={{
                    position: 'absolute', left: pad + rankW - 4, top: titleTop + tLH * 0.52, height: tLH * 0.42,
                    width: (c.hlW + 8) * hlGrow, borderRadius: 3, background: alpha(BRAND.amber, 0.3 * hlFade),
                  }} />
                ) : null}
                <div style={{ position: 'absolute', left: pad + rankW, top: titleTop, width: innerW - rankW }}>
                  {c.lines.map((l, k) => (
                    <div key={k} style={{ fontFamily: FONT.sans, fontSize: c.size, fontWeight: 600, color: INK, letterSpacing: '-0.015em', lineHeight: `${tLH}px`, whiteSpace: 'nowrap' }}>{l}</div>
                  ))}
                </div>
                {c.dLines.length ? (
                  <div style={{ position: 'absolute', left: pad, top: titleTop + maxT * tLH + (portrait ? 18 : 12), width: innerW }}>
                    {c.dLines.map((l, k) => (
                      <div key={k} style={{ fontFamily: FONT.sans, fontSize: dSize, fontWeight: 400, color: INK2, lineHeight: `${dLH}px`, whiteSpace: 'nowrap' }}>{l}</div>
                    ))}
                  </div>
                ) : null}
                {/* glaze：一道斜向柔光，按页面坐标连续扫过整摞，被每张卡圆角裁切 */}
                {glazeVis > 0 && (
                  <div style={{
                    position: 'absolute', top: -200, height: cardH + 400, left: glazeX - cardX - (top - 200) * 0.25, width: 360 * K,
                    transform: 'rotate(14deg)', opacity: glazeVis * 0.55, mixBlendMode: 'soft-light',
                    background: 'linear-gradient(90deg, rgba(255,236,200,0), rgba(255,226,170,0.95) 45%, rgba(255,226,170,0.95) 55%, rgba(255,236,200,0))',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
              {/* 顶部 1px 受光沿 */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: portrait ? 22 : 12, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)', pointerEvents: 'none' }} />
            </div>
          );
          return Math.abs(vy) > 1 ? (
            <SpeedBlur key={i} vx={0} vy={vy / K} amount={0.22} max={14}>
              {card}
            </SpeedBlur>
          ) : (
            <React.Fragment key={i}>{card}</React.Fragment>
          );
        })}
      </div>

      {/* 横版：屏幕空间计数器，右上——落一张滚一格 */}
      {!portrait ? <div style={{ position: 'absolute', top: 70, right: 96, pointerEvents: 'none' }}>{counter(1)}</div> : null}
    </AbsoluteFill>
  );
};
