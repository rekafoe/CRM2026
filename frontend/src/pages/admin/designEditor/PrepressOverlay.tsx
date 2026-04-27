import React from 'react';

type PrepressOverlayProps = {
  canvasWidthPx: number;
  pageWidthPx: number;
  pageHeightPx: number;
  bleedPx: number;
  safeZonePx: number;
  isSpreadView: boolean;
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
};

function buildBandPath(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  insetX: number;
  insetY: number;
  insetWidth: number;
  insetHeight: number;
}): string {
  const { x, y, width, height, insetX, insetY, insetWidth, insetHeight } = opts;
  return [
    `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`,
    `M ${insetX} ${insetY} L ${insetX + insetWidth} ${insetY}`,
    `L ${insetX + insetWidth} ${insetY + insetHeight}`,
    `L ${insetX} ${insetY + insetHeight} Z`,
  ].join(' ');
}

export const PrepressOverlay: React.FC<PrepressOverlayProps> = ({
  canvasWidthPx,
  pageWidthPx,
  pageHeightPx,
  bleedPx,
  safeZonePx,
  isSpreadView,
  showBleed,
  showTrim,
  showSafeZone,
}) => {
  const pageOffsets = isSpreadView ? [0, pageWidthPx] : [0];
  const shouldShowBleed = showBleed && bleedPx > 0;
  const shouldShowSafeZone = showSafeZone && safeZonePx > 0;

  return (
    <svg
      className="fabric-guides-overlay prepress-overlay"
      width={canvasWidthPx}
      height={pageHeightPx}
      viewBox={`0 0 ${canvasWidthPx} ${pageHeightPx}`}
      aria-hidden="true"
    >
      {pageOffsets.map((pageX) => (
        <g key={pageX}>
          {shouldShowBleed && (
            <>
              <path
                className="prepress-overlay__bleed-band"
                fillRule="evenodd"
                d={buildBandPath({
                  x: pageX - bleedPx,
                  y: -bleedPx,
                  width: pageWidthPx + bleedPx * 2,
                  height: pageHeightPx + bleedPx * 2,
                  insetX: pageX,
                  insetY: 0,
                  insetWidth: pageWidthPx,
                  insetHeight: pageHeightPx,
                })}
              />
              <rect
                className="prepress-overlay__bleed-line"
                x={pageX - bleedPx}
                y={-bleedPx}
                width={pageWidthPx + bleedPx * 2}
                height={pageHeightPx + bleedPx * 2}
              />
            </>
          )}
          {showTrim && (
            <rect
              className="prepress-overlay__trim-line"
              x={pageX}
              y={0}
              width={pageWidthPx}
              height={pageHeightPx}
            />
          )}
          {shouldShowSafeZone && (
            <>
              <path
                className="prepress-overlay__safe-band"
                fillRule="evenodd"
                d={buildBandPath({
                  x: pageX,
                  y: 0,
                  width: pageWidthPx,
                  height: pageHeightPx,
                  insetX: pageX + safeZonePx,
                  insetY: safeZonePx,
                  insetWidth: Math.max(1, pageWidthPx - safeZonePx * 2),
                  insetHeight: Math.max(1, pageHeightPx - safeZonePx * 2),
                })}
              />
              <rect
                className="prepress-overlay__safe-line"
                x={pageX + safeZonePx}
                y={safeZonePx}
                width={Math.max(1, pageWidthPx - safeZonePx * 2)}
                height={Math.max(1, pageHeightPx - safeZonePx * 2)}
              />
              <text
                className="prepress-overlay__label"
                x={pageX + pageWidthPx / 2}
                y={Math.max(9, safeZonePx / 2)}
              >
                всё за safe zone может срезаться
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
};
