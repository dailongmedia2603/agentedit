// origin: template/src/aifl/FlashCut.tsx（模板片同源组件）
// [Agent Edit] lop OVERLAY trong suot (meta kind = 'overlay'): app de len dung canh cat cung (khong props) -> mac dinh
// duration = FLASH_CUT_DURATION (12f: dinh sang ~khung 5 = diem cat, hai phia ~5f nhu the goc). Khong chu, khong anh.
// Khung doc: AbsoluteFill phu kin chieu cao that; tam quang sang giu 50% / 45%.
import { useCurrentFrame } from '../../../runtime';
import { AbsoluteFill, interpolate } from 'remotion';

export const FLASH_CUT_DURATION = 12;

/** Bright-field cut: a warm-white bloom that flashes over the hard cut. */
export const FlashCut: React.FC<{ duration?: number }> = ({ duration = FLASH_CUT_DURATION }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, duration * 0.4, duration - 1], [0, 0.85, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: o,
        background: 'radial-gradient(ellipse at 50% 45%, rgba(255,248,235,0.98), rgba(255,244,224,0.55) 55%, transparent 80%)',
      }}
    />
  );
};
