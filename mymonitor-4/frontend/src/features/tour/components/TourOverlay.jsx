import React from 'react';

/**
 * Microsoft Fabric Spotlight Dimmer & Focus Cutout Overlay
 * Uses full-screen SVG mask to dim background while highlighting the focused element.
 */
export default function TourOverlay({ targetRect, onClickBackground }) {
  const pad = 8;
  const radius = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!targetRect) {
    return (
      <div
        onClick={onClickBackground}
        className="fixed inset-0 bg-[#0f172a]/75 backdrop-blur-[1px] z-[10000] transition-opacity duration-300"
      />
    );
  }

  const x = Math.max(0, targetRect.left - pad);
  const y = Math.max(0, targetRect.top - pad);
  const width = Math.min(vw - x, targetRect.width + pad * 2);
  const height = Math.min(vh - y, targetRect.height + pad * 2);

  return (
    <div className="fixed inset-0 pointer-events-auto z-[10000] overflow-hidden">
      {/* SVG Mask Cutout */}
      <svg
        className="w-full h-full absolute inset-0 transition-all duration-300 pointer-events-auto"
        onClick={onClickBackground}
      >
        <defs>
          <mask id="tour-mask-cutout">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={radius}
              ry={radius}
              fill="black"
            />
          </mask>
        </defs>

        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="#0f172a"
          fillOpacity="0.75"
          mask="url(#tour-mask-cutout)"
        />
      </svg>

      {/* Focus Box Highlighting Glow Ring & Active Beacon */}
      <div
        style={{
          position: 'fixed',
          top: `${y}px`,
          left: `${x}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${radius}px`,
          pointerEvents: 'none',
          zIndex: 10001
        }}
        className="border-2 border-[#00b7c3] shadow-[0_0_0_3px_rgba(15,108,189,0.5),0_0_24px_rgba(0,183,195,0.7)] transition-all duration-300"
      >
        {/* Animated Beacon Tag */}
        <div className="absolute -top-3.5 left-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#0f6cbd] to-[#00b7c3] text-white text-[9.5px] font-bold tracking-wider uppercase shadow-md flex items-center gap-1.5 select-none pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          <span>Active Step</span>
        </div>
      </div>
    </div>
  );
}
