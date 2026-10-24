import { BRAND } from "@/lib/brand";

export function Owl({ size, blink }: { size: number; blink?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" className={blink ? "owl-blink" : undefined} aria-hidden>
      <path d="M24 58 C4 62 0 90 16 104 C30 96 34 74 24 58 Z" fill="#C8A56A" />
      <path d="M116 58 C136 62 140 90 124 104 C110 96 106 74 116 58 Z" fill="#C8A56A" />
      <ellipse cx="70" cy="66" rx="50" ry="48" fill="#151412" stroke="#F2EDE4" strokeWidth="12" />
      <circle className="eye" cx="54" cy="54" r="11" fill="#C8A56A" />
      <circle className="eye" cx="86" cy="54" r="11" fill="#C8A56A" />
      <path d="M64.5 68.5 H75.5 L70 77.5 Z" fill="#C8A56A" stroke="#C8A56A" strokeWidth="3.5" strokeLinejoin="round" />
      <rect x="52" y="120" width="12" height="9" rx="4.5" fill="#F2EDE4" />
      <rect x="76" y="120" width="12" height="9" rx="4.5" fill="#F2EDE4" />
    </svg>
  );
}

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      {BRAND.slice(0, -1)}
      <b>{BRAND.slice(-1)}</b>
    </span>
  );
}
