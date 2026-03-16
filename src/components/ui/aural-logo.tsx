interface AuralLogoProps {
  size?: number;
  className?: string;
}

const BAR_W = 20;
const BAR_RX = 10;

const bars = [
  { x: 50, y: 100, h: 56 },
  { x: 84, y: 58, h: 140 },
  { x: 118, y: 78, h: 100 },
  { x: 152, y: 68, h: 120 },
  { x: 186, y: 104, h: 48 },
];

export function AuralLogo({ size = 32, className }: AuralLogoProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Aural logo"
    >
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={BAR_W}
          height={bar.h}
          rx={BAR_RX}
          style={{ fill: "hsl(var(--primary))" }}
        />
      ))}
    </svg>
  );
}
