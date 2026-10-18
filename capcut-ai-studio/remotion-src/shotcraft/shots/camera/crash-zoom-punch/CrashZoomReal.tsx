// crash-zoom 急推（回弹款，第二轮重设计）——真实 projects 页全景一拍砸到 card4 特写。
// 手法不变：全景 hold → 预备回拉 → 6f 强 ease-in 急推（速度峰值落在到位帧）→ 一次可见过冲回弹落定。
//
// 设计决定
// - look：ember（暖黑 + 橙）。截图本身是暖白纸色页面，放进暖黑舞台里像一块被聚光灯打亮的屏幕：
//   全景是"产品摆在舞台上"——浏览器窗口微微后仰（rotateX 11°）、背后一圈橙色背光勾出轮廓、
//   脚下地面反光；急推同时把后仰拉正，到位就是正视特写（Q6：要读的卡片正视）。
// - 预告目标：急推前一拍，四只橙色角标从大框收拢锁定 card4（"看这个"先在全景里被点名），
//   角标挂在页面坐标里，急推后自然变成特写卡的取景框——全景到特写是同一条视线。
// - 落定：周边页面压成暖黑（聚光），目标卡浮起 + 橙色轮廓光；到位帧一记暖色曝光闪（8f 衰减）。
//   随后相机做一次"跟随"——平滑左移把卡让到左侧黄金位，右栏落一组大号读数（配套文案，虚构数据）。
//
// 时间表（30fps，132f）
//   0–34   全景 hold：窗口已在画面，后仰 13°→11°、zoom ×0.972→1 极缓推近（smooth，机位活着但不晃）
//   14–30  锁定：四角标从外扩收拢到目标框外（snappy 16f），4f 显影
//   34–40  预备：zoom 回退 ~4%、后仰加深 1.5°，角标同步外扩一呼吸（蓄力）
//   40–46  急推 6f：log 空间强 ease-in，后仰同曲线归零，目标框屏幕位置单调收向画面中心
//          ——只这一段加时间采样运动模糊（快门 ≈200°，子帧间距 ≤6px、上限 44，每层按间距补微模糊抹平回波）
//   46–58  回弹：阻尼余弦 PEAK→REST（峰值高 6%），一次可见回弹、微下冲收干；到位帧起暖色曝光闪 8f 衰减
//   47–64  点名：周边压暗到 86%（暖黑）、目标框浮起 + 轮廓光（out 曲线 16f）
//   56–78  跟随：相机平滑移位（swift 22f），横屏把目标让到左侧黄金位 / 竖屏让到上方
//   68–110 读数栏：眉题 → 大数字逐字从线下升起 → 发丝线 → 标题 → 说明（错峰按词数压密）
//   110–131 hold：极缓推近 1→1.015 + 光的呼吸，尾帧是一张完整海报
//
// [Agent Edit] o anh `screen` (anh THAT, ti le bat ky: anh chup man hinh doc/ngang, anh dien thoai, anh chup):
//   - khung chua anh theo ti le anh (do kich thuoc that bang delayRender): anh ngang/vuong -> cua so trinh duyet,
//     anh doc (< 0.85) -> khung dien thoai. objectFit cover (anh qua dai kieu trang web -> neo mep tren).
//   - muc tieu dap toi = vung giua anh (32% x 32%, tam doc 46%) thay cho toa do card4 trong live-layout.json;
//     zoom chot (REST) tinh tu kich thuoc vung muc tieu de no chiem ~68% chieu cao khung (nhu ban goc).
//   - o chu: kicker / number / title / subtitle (cot so lieu sau khi dap). Khung doc (native): cot so lieu nam DUOI
//     anh, chu to; vung muc tieu duoc keo len tren.
import { useBackdrop, useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, useBrand } from '../../../runtime';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender } from 'remotion';
import { Dust, LOOKS, Stage, TextReveal, alpha, type } from '../../../fixtures/Look';
import { EASE, FONT, Grain, Vignette, mix, ramp, softShadow } from '../../../fixtures/Polish';

export const CRASHZOOM_DUR = 132;

const L = LOOKS.ember;

const PUSH = 40; // 急推起点
const HIT = 46; // 到位帧（6f 急推）
const OVER = 1.06; // 急推冲到的峰值比落定高 6%（卡片参数表"回弹幅度 3–6%"的上沿）
const SHIFT = 56; // 跟随起点（回弹在 ~56f 已收干）

// 读取图片真实宽高比（确定性：delayRender 等图片解码完再渲染）
const useImageAspect = (src: string | undefined, fallback: number) => {
  const [ar, setAr] = useState<number | null>(null);
  const [handle] = useState(() => (src ? delayRender('crash-zoom: kich thuoc anh') : null));
  useEffect(() => {
    if (!src || handle === null) return;
    let done = false;
    const finish = (v: number) => {
      if (done) return;
      done = true;
      setAr(v);
      continueRender(handle);
    };
    const img = new Image();
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : fallback);
    img.onerror = () => finish(fallback);
    img.src = src;
    return () => finish(fallback);
  }, [src, handle, fallback]);
  return ar ?? fallback;
};

// 几何：世界坐标 = 图片 px（图高恒为 1000），相机 zoom 把世界映射到舞台 px
type Geo = {
  portrait: boolean;
  SH: number;
  FW: number; FH: number; // 图片在世界里的宽高
  phone: boolean;
  ox: number; oy: number; ow: number; oh: number; // 外框（窗口含标题栏 / 手机含边框）
  chrome: number; bezel: number; radius: number;
  tcx: number; tcy: number; tw: number; th: number; // 目标框
  cx: number; cy: number; // 外框几何中心
  zWide: number; rest: number;
  endX: number; endY: number; // 跟随后目标中心的屏幕位置
};

const makeGeo = (aspect: number, portrait: boolean, SH: number, calloutH: number): Geo => {
  const a = Math.max(0.46, Math.min(2.4, aspect));
  const FH = 1000;
  const FW = FH * a;
  const phone = a < 0.85;
  const chrome = phone ? 0 : 54;
  const bezel = phone ? 26 : 0;
  const radius = phone ? 96 : 18;
  const ox = -bezel, oy = -bezel - chrome, ow = FW + bezel * 2, oh = FH + bezel * 2 + chrome;
  // 全景：外框放进舞台中央的取景盒
  const wide = portrait ? { w: 1560, h: 2500 } : { w: 1100, h: 790 };
  const zWide = Math.min(wide.w / ow, wide.h / oh);
  // 特写：目标框占画高 ~68%（横屏 ≈ 原版 836×730 卡）；竖屏给下方读数栏让位
  const gap = 110;
  const box = portrait ? { w: 1560, h: Math.max(900, SH - 2 * 170 - gap - calloutH) } : { w: 1040, h: 744 };
  // 目标框 = 图片中部、面积 ≈ 原版卡片占页面的比例（~10%），宽高比尽量贴合特写取景盒（任何图片比例特写都饱满）
  const area = 0.1024 * FW * FH;
  const r = box.w / box.h;
  let tw = Math.sqrt(area * r), th = Math.sqrt(area / r);
  if (tw > FW * 0.62) { tw = FW * 0.62; th = Math.min(FH * 0.62, tw / r); }
  if (th > FH * 0.62) { th = FH * 0.62; tw = Math.min(FW * 0.62, th * r); }
  const tcx = FW * 0.5, tcy = FH * 0.46;
  let rest = Math.min(box.w / tw, box.h / th);
  rest = Math.max(zWide * 2.4, Math.min(zWide * 3.6, rest));
  const endX = portrait ? 960 : 640;
  const blockTop = portrait ? Math.max(150, (SH - (th * rest + gap + calloutH)) / 2) : 0;
  const endY = portrait ? blockTop + (th * rest) / 2 : 540;
  return { portrait, SH, FW, FH, phone, ox, oy, ow, oh, chrome, bezel, radius, tcx, tcy, tw, th, cx: ox + ow / 2, cy: oy + oh / 2, zWide, rest, endX, endY };
};

// 相机：zoom（世界 px → 舞台 px）、目标中心的屏幕位置 sx/sy、后仰角 tilt。
// 用"目标屏幕位置"而不是相机中心做插值：急推时目标单调地收向画面中心，不会先甩出去再回来。
const camAt = (g: Geo, f: number) => {
  const midY = g.SH / 2;
  const settle = ramp(f, 0, 34, EASE.smooth);
  const wind = ramp(f, 34, 6, EASE.smooth);
  const z0 = g.zWide * mix(0.972, 1, settle) * mix(1, 0.96, wind);
  const tilt0 = mix(13, 11, settle) + 1.5 * wind;
  const peak = g.rest * OVER;
  // 全景下目标的屏幕位置（外框几何中心 → 舞台中心）
  const wideSx = 960 + (g.tcx - g.cx) * z0;
  const wideSy = midY + (g.tcy - g.cy) * z0;
  let zoom = z0;
  let k = 0; // 0 = 全景构图，1 = 目标居中
  if (f >= PUSH && f < HIT) {
    const p = ramp(f, PUSH, HIT - PUSH, EASE.exit);
    zoom = Math.exp(mix(Math.log(z0), Math.log(peak), p)); // log 空间：感知上的推进速度均匀加速
    k = p;
  } else if (f >= HIT) {
    const t = f - HIT;
    zoom = g.rest + (peak - g.rest) * Math.exp(-t / 2.2) * Math.cos((Math.PI * t) / 5.2);
    zoom *= 1 + 0.015 * ramp(f, 96, 35, EASE.smooth); // 尾段极缓推近，画面活着
    k = 1;
  }
  const tilt = f >= PUSH ? tilt0 * (1 - ramp(f, PUSH, HIT - PUSH, EASE.exit)) : tilt0;
  const shift = ramp(f, SHIFT, 22, EASE.swift);
  const sx = mix(wideSx, mix(960, g.endX, shift), k);
  const sy = mix(wideSy, mix(midY, g.endY, shift), k);
  return { zoom, sx, sy, tilt };
};

// 一个相机姿态下的整个世界（外框 + 图片 + 角标），给运动模糊子帧复用
const World: React.FC<{ g: Geo; src?: string; f: number; lift: number; lock: number; breath: number; addr: string; bd?: boolean }> = ({ g, src, f, lift, lock, breath, addr, bd }) => {
  const { zoom, sx, sy, tilt } = camAt(g, f);
  const tx = sx - g.tcx * zoom;
  const ty = sy - g.tcy * zoom;
  // 角标：外扩量（屏幕 ≈108px → 10px）由锁定进度与预备呼吸决定；线宽按 zoom 反算，屏幕上恒定 3px
  const pad = (mix(108, 10, lock) + 6 * breath) / g.zWide;
  const sw = 3 / zoom;
  const arm = 34 / Math.max(g.zWide, zoom * 0.7);
  const bx = g.tcx - g.tw / 2 - pad, by = g.tcy - g.th / 2 - pad, bw = g.tw + pad * 2, bh = g.th + pad * 2;
  const tx0 = g.tcx - g.tw / 2, ty0 = g.tcy - g.th / 2;
  const R = 10; // 目标框圆角（世界 px）
  const tilted = tilt > 0.01;
  const tall = g.FW / g.FH < 0.46; // 超长页面：贴顶裁
  return (
    <AbsoluteFill style={tilted ? { perspective: 2600, perspectiveOrigin: '50% 40%' } : undefined}>
      <AbsoluteFill style={tilted ? { transform: `rotateX(${tilt.toFixed(3)}deg)`, transformOrigin: '50% 60%' } : undefined}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 10, height: 10, transformOrigin: '0 0', transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${zoom.toFixed(5)})` }}>
          {/* 外框：浏览器窗口（标题栏）或手机（黑色边框），深色带色相的双层影 + 顶沿受光 */}
          <div
            style={{
              position: 'absolute', left: g.ox, top: g.oy, width: g.ow, height: g.oh, borderRadius: g.radius, overflow: 'hidden',
              background: g.phone ? '#0b0806' : '#f9f6f1',
              // [Agent Edit] nen anh AI: sau cu dap, ca cua so (ngoai muc tieu) mo di de lo anh nen thay vi ep thanh den
              opacity: bd ? 1 - lift : 1,
              boxShadow: `0 0 0 ${g.phone ? 3 : 1}px ${alpha('#ffd9bf', g.phone ? 0.3 : 0.22)}, 0 40px 90px -10px rgba(5,1,0,0.75), 0 12px 30px rgba(5,1,0,0.5)`,
            }}
          >
            {!g.phone && (
              <div style={{ position: 'absolute', left: 0, top: 0, width: g.ow, height: g.chrome, background: 'linear-gradient(180deg, #f1ebe2, #e9e2d7)', borderBottom: '1px solid rgba(60,40,20,0.12)' }}>
                {['#ef6a5b', '#f2be4f', '#5fc35a'].map((c, i) => (
                  <div key={c} style={{ position: 'absolute', left: 24 + i * 24, top: 20, width: 14, height: 14, borderRadius: 7, background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                ))}
                <div style={{ position: 'absolute', left: g.ow / 2 - Math.min(210, g.ow * 0.28), top: 12, width: Math.min(420, g.ow * 0.56), height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.7)', boxShadow: 'inset 0 0 0 1px rgba(60,40,20,0.1)', fontFamily: FONT.sans, fontSize: 15, color: '#8a7a68', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <span style={{ width: 9, height: 11, borderRadius: 2, border: '2px solid #a8988a', boxSizing: 'border-box' }} />
                  {addr}
                </div>
              </div>
            )}
            <div style={{ position: 'absolute', left: g.bezel, top: g.bezel + g.chrome, width: g.FW, height: g.FH, overflow: 'hidden', borderRadius: g.phone ? g.radius - g.bezel : 0, background: '#1a120e' }}>
              {src ? <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: tall ? '50% 0%' : '50% 50%' }} /> : null}
              {/* 点名：目标框外一圈极大 spread 的影子当遮罩，周边压成暖黑；目标框生出浮起影 */}
              {lift > 0.001 && (
                <div
                  style={{
                    position: 'absolute', left: tx0, top: ty0, width: g.tw, height: g.th, borderRadius: R,
                    boxShadow: `0 0 0 4000px rgba(14,6,2,${(0.86 * lift).toFixed(3)}), ${softShadow(14 * lift, { color: '#050100', strength: 2.4 })}`,
                  }}
                />
              )}
              {/* 轮廓光：主角唯一的光效，贴着圆角走（Q4） */}
              {lift > 0.001 && (
                <div
                  style={{
                    position: 'absolute', left: tx0, top: ty0, width: g.tw, height: g.th, borderRadius: R, pointerEvents: 'none',
                    boxShadow: `0 0 0 ${(1.6 / zoom).toFixed(3)}px ${alpha(L.accent, 0.85 * lift)}, 0 0 ${(26 / zoom).toFixed(2)}px ${alpha(L.accent, 0.45 * lift)}`,
                  }}
                />
              )}
              {/* 锁定角标（世界坐标）：全景里收拢点名，特写里成为取景框 */}
              {lock > 0.001 && (
                <svg
                  width={bw + 40} height={bh + 40} viewBox={`${bx - 20} ${by - 20} ${bw + 40} ${bh + 40}`}
                  style={{ position: 'absolute', left: bx - 20, top: by - 20, overflow: 'visible', opacity: Math.min(1, lock * 4) * (1 - 0.35 * lift) }}
                >
                  <g fill="none" stroke={L.accent} strokeWidth={sw} strokeLinecap="square">
                    <path d={`M${bx} ${by + arm} V${by} H${bx + arm}`} />
                    <path d={`M${bx + bw - arm} ${by} H${bx + bw} V${by + arm}`} />
                    <path d={`M${bx + bw} ${by + bh - arm} V${by + bh} H${bx + bw - arm}`} />
                    <path d={`M${bx + arm} ${by + bh} H${bx} V${by + bh - arm}`} />
                  </g>
                </svg>
              )}
            </div>
            {/* 手机：顶部药丸 */}
            {g.phone && (
              <div style={{ position: 'absolute', left: g.ow / 2 - g.FW * 0.14, top: g.bezel + 22, width: g.FW * 0.28, height: 34, borderRadius: 17, background: '#0b0806' }} />
            )}
            {/* 顶沿受光：外框上沿一道暖色内高光 */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: g.radius, boxShadow: `inset 0 1px 0 ${alpha('#fff4e8', g.phone ? 0.35 : 0.9)}`, pointerEvents: 'none' }} />
          </div>
          {/* [Agent Edit] nen anh AI: muc tieu ve lai rieng (noi tren anh nen) + bong noi + vien sang */}
          {bd && lift > 0.001 && (
            <div
              style={{
                position: 'absolute', left: g.ox + g.bezel + tx0, top: g.oy + g.bezel + g.chrome + ty0, width: g.tw, height: g.th, borderRadius: R, overflow: 'hidden',
                boxShadow: `0 0 0 ${(1.6 / zoom).toFixed(3)}px ${alpha(L.accent, 0.85 * lift)}, 0 0 ${(26 / zoom).toFixed(2)}px ${alpha(L.accent, 0.45 * lift)}, ${softShadow(14 * lift, { color: '#050100', strength: 2.4 })}`,
              }}
            >
              <div style={{ position: 'absolute', left: -tx0, top: -ty0, width: g.FW, height: g.FH, background: '#1a120e' }}>
                {src ? <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: tall ? '50% 0%' : '50% 50%' }} /> : null}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 快门窗口内等权叠加：第 i 层不透明度 1/(i+1)，逐层 over 合成后恰为算术平均。
// 子帧数按本帧位移自适应：画面边缘在快门窗口内走过的像素 / 6px，封顶 44。
const SHUTTER = 0.55; // 帧（≈200° 快门）
const edgeAt = (g: Geo, f: number, withTilt: boolean) => {
  const a = camAt(g, f), b = camAt(g, f - SHUTTER);
  const span = g.portrait ? 1600 : 1100; // 画面边缘到中心的距离 ≈ 缩放引起的位移
  return Math.abs(a.zoom - b.zoom) / g.zWide * 0.72 * span + Math.hypot(a.sx - b.sx, a.sy - b.sy) + (withTilt ? Math.abs(a.tilt - b.tilt) * 30 : 0);
};
const samplesAt = (g: Geo, f: number) => Math.max(1, Math.min(44, Math.ceil(edgeAt(g, f, true) / 6)));
// 子帧间距（屏幕 px）→ 每层补一点各向同性模糊，把离散回波抹成连续拖影
const smearAt = (g: Geo, f: number, n: number) => {
  const edge = edgeAt(g, f, false);
  // 只在真正的高速帧补：位移 <60px 不补（否则慢段整体发虚），≥260px 补满
  const fast = Math.min(1, Math.max(0, (edge - 60) / 200));
  return Math.min(4, (edge / Math.max(1, n)) * 0.6 * fast);
};

export const CrashZoomReal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const bd = !!useBackdrop();
  // chu nam truc tiep tren nen anh: bong do nhe (chi khi co nen anh)
  const tsh = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;
  const src = useImage('screen', 'textures/live/projects-full.png');
  const aspect = useImageAspect(src, 16 / 10);
  const kicker = useText('kicker', 'TẬP TRUNG VÀO ĐÂY');
  const number = useText('number', '−41%');
  const title = useText('title', 'chi phí vận hành');
  const sub = useText('subtitle', 'cùng chất lượng, nhờ tự động hoá từng bước');

  // ── 读数栏排版（先排版，竖屏要用它的高度给特写让位）──
  const colW = portrait ? 1520 : 620;
  const kSize = fitSize(kicker.toUpperCase(), { family: fonts.sans, size: portrait ? 44 : 28, maxWidth: colW - (portrait ? 40 : 28), weight: 650, letterSpacingEm: 0.2, minSize: portrait ? 26 : 18 });
  const nSize = fitSize(number, { family: fonts.sans, size: portrait ? 360 : 232, maxWidth: colW + 10, weight: 700, letterSpacingEm: -0.055, minSize: portrait ? 150 : 100 });
  const tBase = portrait ? 104 : 52;
  const tLines = title ? wrapLines(title, fonts.sans, tBase, colW, 600, 2) : [];
  const tSize = Math.min(tBase, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: tBase, maxWidth: colW, weight: 600, minSize: tBase * 0.6 })));
  const sBase = portrait ? 66 : 38;
  const sLines = sub ? wrapLines(sub, fonts.sans, sBase, colW, 400, 3) : [];
  const sSize = Math.min(sBase, ...sLines.map((l) => fitSize(l, { family: fonts.sans, size: sBase, maxWidth: colW, weight: 400, minSize: sBase * 0.6 })));
  const kH = kicker ? kSize * 1.4 + (portrait ? 34 : 22) : 0;
  const nH = nSize * 1.08;
  const ruleM = portrait ? 40 : 28;
  const tH = tLines.length * tSize * 1.25;
  const sH = sLines.length * sSize * 1.32;
  const calloutH = kH + nH + ruleM * 2 + 2 + tH + (sLines.length ? (portrait ? 22 : 12) + sH : 0);

  const g = makeGeo(aspect, portrait, SH, calloutH);

  const lock = ramp(frame, 14, 16, EASE.snappy);
  const breath = ramp(frame, 34, 6, EASE.smooth) * (1 - ramp(frame, PUSH, 4, EASE.exit));
  const lift = ramp(frame, HIT + 1, 16, EASE.out);
  const flash = frame >= HIT ? Math.exp(-(frame - HIT) / 3) : 0;
  // 急推段画面收边：暗角随推进加深，落定后退回
  const vig = 0.1 + 0.3 * ramp(frame, PUSH, HIT - PUSH, EASE.exit) - 0.36 * ramp(frame, HIT, 18, EASE.out);
  // 舞台在急推后几乎被外框盖满；全景时它负责"产品在舞台上"
  const wideFade = 1 - ramp(frame, PUSH, HIT - PUSH, EASE.exit);
  const n = frame >= PUSH && frame <= HIT + 1 ? samplesAt(g, frame) : 1;
  const smear = n > 1 ? smearAt(g, frame, n) : 0;
  const callout = frame >= 58;
  const scrim = ramp(frame, 58, 14, EASE.out);
  // 读数栏压暗的起点跟着目标框边缘走（+70px），永远不压到主角身上
  const cam = camAt(g, frame);
  const scrimX = cam.sx + (g.tw / 2) * cam.zoom + 70;
  const scrimY = cam.sy + (g.th / 2) * cam.zoom + 50;
  // 全景外框底边（地面反光的位置）
  const wideBottom = SH / 2 + (g.oh / 2) * g.zWide;
  const wideW = g.ow * g.zWide;

  // 读数栏位置
  const colX = portrait ? 200 : 1212;
  const colY = portrait ? g.endY + (g.th * g.rest) / 2 + 110 : Math.max(80, 540 - calloutH / 2);
  // 标题 / 说明：词间错峰按词数压密，保证 ~110f 前全部落定
  const tWords = tLines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  const sWords = sLines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0);
  const tGap = Math.min(4, 12 / Math.max(1, tWords));
  const sGap = Math.min(2, 12 / Math.max(1, sWords));
  const nGap = Math.min(2.2, 10 / Math.max(1, Array.from(number).length));
  let wi = 0;
  let si = 0;
  const addr = (brand?.name || '').toLowerCase().replace(/\s+/g, '') ;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.0 }} fill={{ x: 0.5, y: 1.05 }} horizon={portrait ? undefined : 0.86} intensity={0.9} breathe={0.5} vignette={0} grain={0} />
      {/* 背光：外框身后一圈橙色光晕，勾出轮廓；地面反光椭圆 (nen anh AI: khong ve quang sang / bui code) */}
      {!bd && <>
      <AbsoluteFill style={{ opacity: wideFade, background: `radial-gradient(ellipse ${portrait ? '48% 34%' : '38% 44%'} at 50% 46%, ${alpha(L.accent, 0.34)}, ${alpha(L.accent, 0)} 70%)` }} />
      <div style={{ position: 'absolute', left: 960 - wideW * 0.62, width: wideW * 1.24, top: wideBottom - 60, height: 160, opacity: wideFade, borderRadius: '50%', background: `radial-gradient(closest-side, ${alpha('#ff9a5c', 0.28)}, ${alpha('#ff9a5c', 0)})`, filter: 'blur(8px)' }} />
      <AbsoluteFill style={{ opacity: wideFade }}>
        {Array.from({ length: Math.ceil(SH / 1080) }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, top: i * 1080, width: 1920, height: 1080 }}>
            <Dust look={L} count={34} seed={7 + i} drift={0.3} opacity={0.55} color="#ffb27a" />
          </div>
        ))}
      </AbsoluteFill>
      </>}
      <Vignette strength={mix(0.1, 0.5, wideFade) * (bd ? 0.4 : 1)} inner={0.42} color={L.shadow} />

      {n > 1 ? (
        Array.from({ length: n }, (_, i) => (
          <AbsoluteFill key={i} style={{ opacity: 1 / (i + 1), filter: smear > 0.3 ? `blur(${smear.toFixed(2)}px)` : undefined }}>
            <World g={g} src={src} f={frame - (SHUTTER * i) / (n - 1)} lift={lift} lock={lock} breath={breath} addr={addr} bd={bd} />
          </AbsoluteFill>
        ))
      ) : (
        <World g={g} src={src} f={frame} lift={lift} lock={lock} breath={breath} addr={addr} bd={bd} />
      )}

      {/* 到位帧暖色曝光闪：以目标为中心，8f 指数衰减 */}
      {flash > 0.01 && (
        <AbsoluteFill style={{ mixBlendMode: 'screen', background: `radial-gradient(ellipse 55% 60% at 50% 50%, ${alpha(L.accent2, 0.32 * flash)}, ${alpha(L.accent, 0.12 * flash)} 55%, ${alpha(L.accent, 0)} 80%)` }} />
      )}

      {/* 读数栏：跟随让出的位置（横屏右栏 / 竖屏下方），加一层暖黑压暗保证可读 */}
      {callout && (
        <>
          {!bd && <AbsoluteFill
            style={{
              opacity: scrim,
              background: portrait
                ? `linear-gradient(180deg, ${alpha('#0e0603', 0)} ${scrimY.toFixed(1)}px, ${alpha('#0e0603', 0.96)} ${(scrimY + 90).toFixed(1)}px, ${alpha('#0e0603', 0.97)} 100%)`
                : `linear-gradient(90deg, ${alpha('#0e0603', 0)} ${scrimX.toFixed(1)}px, ${alpha('#0e0603', 0.96)} ${(scrimX + 90).toFixed(1)}px, ${alpha('#0e0603', 0.97)} 100%)`,
            }}
          />}
          <div style={{ position: 'absolute', left: colX, top: colY, width: colW, color: L.ink, textShadow: tsh }}>
            {kicker ? (
              <div style={{ ...type(kSize, 650), lineHeight: 1.4, letterSpacing: '0.2em', color: L.accent, display: 'flex', alignItems: 'center', gap: kSize * 0.57, whiteSpace: 'nowrap', marginBottom: portrait ? 34 : 22, opacity: ramp(frame, 68, 10, EASE.out), transform: `translateY(${(14 * (1 - ramp(frame, 68, 14, EASE.snappy))).toFixed(2)}px)` }}>
                <span style={{ width: kSize * 0.43, height: kSize * 0.43, borderRadius: kSize, background: L.accent, boxShadow: `0 0 14px ${alpha(L.accent, 0.8)}`, flex: 'none' }} />
                {kicker.toUpperCase()}
              </div>
            ) : null}
            {/* 大数字逐字从线下升起（TextReveal rise 自带上下留白的遮罩框） */}
            <div style={{ ...type(nSize, 700), lineHeight: 1.08, letterSpacing: '-0.055em', marginLeft: -nSize * 0.04, whiteSpace: 'nowrap' }}>
              <TextReveal text={number} by="char" variant="rise" start={71} each={18} gap={nGap} ease={EASE.snappy} />
            </div>
            <div style={{ height: 2, width: Math.min(colW, portrait ? 1100 : 520), marginTop: ruleM, marginBottom: ruleM, background: alpha(L.ink, 0.16), transform: `scaleX(${ramp(frame, 76, 22, EASE.snappy).toFixed(4)})`, transformOrigin: '0 50%' }} />
            {tLines.map((l, i) => {
              const start = 79 + wi * tGap;
              wi += l.split(/\s+/).filter(Boolean).length;
              return (
                <div key={i} style={{ ...type(tSize, 600), lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="word" variant="blur" start={start} each={16} gap={tGap} ease={EASE.out} />
                </div>
              );
            })}
            {sLines.length ? <div style={{ height: portrait ? 22 : 12 }} /> : null}
            {sLines.map((l, i) => {
              const start = 85 + si * sGap;
              si += l.split(/\s+/).filter(Boolean).length;
              return (
                <div key={i} style={{ ...type(sSize, 400), lineHeight: 1.32, color: L.ink2, whiteSpace: 'nowrap' }}>
                  <TextReveal text={l} by="word" variant="blur" start={start} each={15} gap={sGap} ease={EASE.out} />
                </div>
              );
            })}
          </div>
        </>
      )}
      <Vignette strength={Math.max(0, vig) * (bd ? 0.5 : 1)} inner={0.42} color={L.shadow} cy={0.5} />
      {!bd && <Grain opacity={0.08} blend="soft-light" />}
    </AbsoluteFill>
  );
};
