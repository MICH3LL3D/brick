import { loadCatalog } from "@/lib/data";
import { kindOf, type PartKind } from "@/lib/part-kind";
import { SUPPLIES } from "@/lib/supplies";
import type { IconNameT } from "@/lib/manual-format";

// Drawn art for manual slots that have no verified product photo, so no slot is ever empty.
// Parts get a drawing of their kind (chassis, board, pump, tank, ...); steps with no part get a tool or action icon.
// These are simple illustrations, not photos of the exact product; the page says so with a small caption.

const INK = "#222B26";
const STROKE = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const PART_ART: Record<PartKind, React.ReactNode> = {
  chassis: (<>
    <rect x="28" y="46" width="104" height="34" rx="8" fill="#E8D9B8" {...STROKE} />
    <rect x="40" y="36" width="80" height="10" rx="3" fill="#CDBB94" {...STROKE} />
    {[44, 116].map((x) => <g key={x}><circle cx={x} cy="86" r="15" fill="#3A413C" {...STROKE} /><circle cx={x} cy="86" r="5" fill="#E4B73A" stroke={INK} strokeWidth="2" /></g>)}
  </>),
  controller: (<>
    <rect x="26" y="24" width="108" height="72" rx="6" fill="#4F9A6A" {...STROKE} />
    <rect x="38" y="30" width="84" height="9" fill="#222B26" />
    <rect x="58" y="50" width="30" height="30" rx="3" fill="#C9CDC6" {...STROKE} />
    <rect x="102" y="52" width="26" height="14" rx="2" fill="#B8BDB5" {...STROKE} />
    <rect x="102" y="72" width="26" height="14" rx="2" fill="#B8BDB5" {...STROKE} />
  </>),
  driver: (<>
    <rect x="26" y="26" width="108" height="64" rx="6" fill="#C46E6E" {...STROKE} />
    <rect x="62" y="40" width="34" height="22" rx="3" fill="#3A413C" {...STROKE} />
    {[40, 66, 92, 118].map((x) => <rect key={x} x={x - 8} y="76" width="16" height="14" rx="2" fill="#E8813A" {...STROKE} />)}
  </>),
  arm: (<>
    <rect x="30" y="92" width="52" height="14" rx="4" fill="#8B5BB8" {...STROKE} />
    <path d="M56 92 L62 56 L104 36" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M56 92 L62 56 L104 36" fill="none" stroke="#B9A3D6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    {[[56, 92], [62, 56], [104, 36]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill="#E4B73A" {...STROKE} />)}
    <path d="M104 36 l16 -6 M104 36 l14 10" fill="none" {...STROKE} />
  </>),
  pump: (<>
    <rect x="30" y="44" width="54" height="40" rx="10" fill="#7FB7C4" {...STROKE} />
    <circle cx="57" cy="64" r="11" fill="#3A413C" {...STROKE} />
    <path d="M84 56 C112 56 112 90 132 90" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
    <path d="M84 56 C112 56 112 90 132 90" fill="none" stroke="#CFE8EE" strokeWidth="4" strokeLinecap="round" />
    <path d="M30 70 h-12" {...STROKE} />
  </>),
  tank: (<>
    <rect x="58" y="14" width="44" height="14" rx="4" fill="#3A413C" {...STROKE} />
    <path d="M62 28 h36 v8 c0 8 8 10 8 22 v38 a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8 v-38 c0 -12 8 -14 8 -22 z" fill="#CFE8EE" {...STROKE} />
    <path d="M54 68 h52 v30 a8 8 0 0 1 -8 8 h-36 a8 8 0 0 1 -8 -8 z" fill="#5FB8D0" stroke={INK} strokeWidth="3" />
  </>),
  ultrasonic: (<>
    <rect x="22" y="34" width="116" height="52" rx="5" fill="#3E6FB8" {...STROKE} />
    {[54, 106].map((x) => <g key={x}><circle cx={x} cy="60" r="19" fill="#C9CDC6" {...STROKE} /><circle cx={x} cy="60" r="9" fill="#3A413C" /></g>)}
    {[58, 70, 82, 94].map((x) => <rect key={x} x={x} y="86" width="5" height="12" fill="#222B26" />)}
  </>),
  camera: (<>
    <rect x="38" y="28" width="84" height="64" rx="6" fill="#3E9E63" {...STROKE} />
    <circle cx="80" cy="60" r="20" fill="#3A413C" {...STROKE} />
    <circle cx="80" cy="60" r="10" fill="#6E8FB8" stroke={INK} strokeWidth="2" />
    <rect x="52" y="92" width="56" height="10" fill="#E4B73A" {...STROKE} />
  </>),
  sensor: (<>
    <rect x="40" y="30" width="80" height="58" rx="5" fill="#3E9E63" {...STROKE} />
    <circle cx="80" cy="56" r="14" fill="#C9CDC6" {...STROKE} />
    {[56, 68, 80, 92].map((x) => <rect key={x} x={x} y="88" width="5" height="12" fill="#222B26" />)}
  </>),
  battery: (<>
    <rect x="26" y="38" width="100" height="52" rx="8" fill="#E4B73A" {...STROKE} />
    <rect x="126" y="54" width="10" height="20" rx="2" fill="#3A413C" {...STROKE} />
    <path d="M78 46 L64 68 H80 L74 84 L96 60 H80 Z" fill="#FBF8F3" {...STROKE} />
  </>),
  regulator: (<>
    <rect x="34" y="34" width="92" height="56" rx="5" fill="#8FB0D8" {...STROKE} />
    <rect x="56" y="46" width="28" height="28" rx="3" fill="#3A413C" {...STROKE} />
    {[48, 112].map((x) => <circle key={x} cx={x} cy="82" r="5" fill="#C98F5A" stroke={INK} strokeWidth="2" />)}
    {[48, 112].map((x) => <circle key={x} cx={x} cy="42" r="5" fill="#C98F5A" stroke={INK} strokeWidth="2" />)}
  </>),
  board: (<>
    <rect x="34" y="30" width="92" height="60" rx="5" fill="#9A8BC2" {...STROKE} />
    <rect x="58" y="44" width="30" height="22" rx="3" fill="#3A413C" {...STROKE} />
    {[46, 64, 82, 100, 112].map((x) => <circle key={x} cx={x} cy="80" r="4" fill="#C98F5A" stroke={INK} strokeWidth="2" />)}
  </>),
};

const ICON_ART: Record<IconNameT, React.ReactNode> = {
  laptop: (<><rect x="36" y="30" width="88" height="54" rx="5" fill="#DDE3DA" {...STROKE} /><rect x="22" y="84" width="116" height="10" rx="4" fill="#B8BDB5" {...STROKE} /></>),
  wire: (<><path d="M24 84 C50 24, 110 24, 136 76" fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round" /><path d="M24 84 C50 24, 110 24, 136 76" fill="none" stroke="#D94F41" strokeWidth="6" strokeLinecap="round" /><rect x="14" y="78" width="14" height="14" rx="2" fill="#B8BDB5" {...STROKE} /><rect x="132" y="68" width="14" height="14" rx="2" fill="#B8BDB5" {...STROKE} /></>),
  multimeter: (<><rect x="46" y="14" width="68" height="94" rx="10" fill="#E4B73A" {...STROKE} /><rect x="56" y="24" width="48" height="24" rx="3" fill="#CFE3CF" {...STROKE} /><circle cx="80" cy="74" r="14" fill="#3A413C" {...STROKE} /><path d="M80 74 l8 -8" {...STROKE} stroke="#FBF8F3" /></>),
  screwdriver: (<><rect x="22" y="62" width="44" height="22" rx="8" fill="#D94F41" {...STROKE} /><rect x="66" y="69" width="62" height="8" fill="#B8BDB5" {...STROKE} /><path d="M128 69 l10 4 l-10 4 z" fill="#B8BDB5" {...STROKE} /></>),
  wifi: (<><path d="M30 52 C60 24, 100 24, 130 52 M48 68 C70 50, 90 50, 112 68 M66 84 C76 76, 84 76, 94 84" fill="none" {...STROKE} strokeWidth="7" /><circle cx="80" cy="98" r="6" fill={INK} /></>),
  check: (<><circle cx="80" cy="60" r="38" fill="#7FC8A0" {...STROKE} /><path d="M62 60 l14 14 l24 -28" fill="none" stroke="#FBF8F3" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></>),
  power: (<><circle cx="80" cy="60" r="38" fill="#B0382C" {...STROKE} /><path d="M80 34 v28" stroke="#FBF8F3" strokeWidth="9" strokeLinecap="round" /><path d="M62 46 a26 26 0 1 0 36 0" fill="none" stroke="#FBF8F3" strokeWidth="8" strokeLinecap="round" /></>),
  terminal: (<><rect x="24" y="26" width="112" height="70" rx="8" fill="#2E3430" {...STROKE} /><path d="M42 48 l16 12 l-16 12" fill="none" stroke="#7FC8A0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /><path d="M68 76 h28" stroke="#7FC8A0" strokeWidth="6" strokeLinecap="round" /></>),
  sdcard: (<><path d="M50 22 h42 l18 18 v62 a6 6 0 0 1 -6 6 h-54 a6 6 0 0 1 -6 -6 v-74 a6 6 0 0 1 6 -6 z" fill="#4179C7" {...STROKE} />{[60, 72, 84, 96].map((x) => <rect key={x} x={x - 8} y="26" width="5" height="14" fill="#E4B73A" />)}</>),
  header: (<><rect x="18" y="42" width="124" height="36" rx="4" fill="#3A413C" {...STROKE} />{Array.from({ length: 10 }, (_, i) => <g key={i}><rect x={26 + i * 12} y="48" width="6" height="8" fill="#E4B73A" /><rect x={26 + i * 12} y="64" width="6" height="8" fill="#E4B73A" /></g>)}<rect x="24" y="62" width="10" height="12" fill="none" stroke="#FBF8F3" strokeWidth="2" /></>),
  tools: (<><path d="M40 98 L96 42" stroke={INK} strokeWidth="12" strokeLinecap="round" /><path d="M40 98 L96 42" stroke="#C98F5A" strokeWidth="6" strokeLinecap="round" /><circle cx="108" cy="34" r="18" fill="#B8BDB5" {...STROKE} /><rect x="102" y="12" width="12" height="18" fill="#EFE9DD" /></>),
};

/** A drawing for one slot: a part by id, or an action icon. Falls back to a generic board if the part is unknown. */
export function Illustration({ partId, icon, label }: { partId?: string; icon?: IconNameT; label?: string }) {
  let body: React.ReactNode = ICON_ART.tools;
  if (icon) body = ICON_ART[icon];
  else if (partId) {
    const part = loadCatalog().find((p) => p.id === partId) ?? SUPPLIES.find((p) => p.id === partId);
    body = PART_ART[part ? kindOf(part) : "board"];
  }
  return <svg viewBox="0 0 160 120" role="img" aria-label={label ?? "Illustration"} className="m-ill">{body}</svg>;
}
