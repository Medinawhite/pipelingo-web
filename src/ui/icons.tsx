import type { ReactNode } from "react";

// Icons from the mockups. Decorative by default; pass `label` when the icon is the only content.
function Svg({ children, size = 16, label, width = 2 }: { children: ReactNode; size?: number; label?: string; width?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}

type P = { size?: number; label?: string };

export const Flame = (p: P) => (
  <Svg {...p}>
    <path d="M12 3s5 4.5 5 9.5a5 5 0 0 1-10 0C7 9 9 7.5 9 7.5S10 10 12 10c0-3 0-7 0-7z" />
  </Svg>
);
export const Bolt = (p: P) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Svg>
);
export const Heart = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
  </Svg>
);
export const Check = (p: P) => (
  <Svg {...p} width={3}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const Lock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const Crown = (p: P) => (
  <Svg {...p}>
    <path d="M4 8l4 3 4-6 4 6 4-3-2 11H6z" />
  </Svg>
);
export const Close = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const MapIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15" />
  </Svg>
);
export const ReviewIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);
export const User = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const ArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);
export const ArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12l7 7 7-7" />
  </Svg>
);
export const Grip = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
  </Svg>
);
export const TerminalIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 17l6-5-6-5M12 19h8" />
  </Svg>
);
export const CodeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
  </Svg>
);
export const Skip = (p: P) => (
  <Svg {...p}>
    <path d="M5 4l10 8-10 8zM19 5v14" />
  </Svg>
);
