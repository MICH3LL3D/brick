import { BRAND } from "@/lib/brand";

// The brick mark: three gold studs on a brown brick with a small face. Matches the Paper logo.
export function Brick({ size, blink }: { size: number; blink?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" className={blink ? "brick-blink" : undefined} aria-hidden>
      <g transform="rotate(-6 70 94)">
        <rect x="28" y="50" width="22" height="16" rx="7" fill="#D4A437" />
        <rect x="59" y="50" width="22" height="16" rx="7" fill="#D4A437" />
        <rect x="90" y="50" width="22" height="16" rx="7" fill="#D4A437" />
        <rect x="22" y="62" width="96" height="64" rx="14" fill="#7A4E2D" />
        <g className="eyes">
          <circle className="eye" cx="55" cy="90" r="4.5" fill="#F6F1E6" />
          <circle className="eye" cx="85" cy="90" r="4.5" fill="#F6F1E6" />
        </g>
        <path d="M59 105 Q70 113 81 105" fill="none" stroke="#F6F1E6" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      {BRAND}
    </span>
  );
}
