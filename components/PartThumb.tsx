"use client";
import { useEffect, useState } from "react";
import type { Part } from "@/lib/contracts";

type Photo = { src: string; credit: string };

let photos: Promise<Record<string, Photo>> | undefined;
const loadPhotos = () =>
  (photos ??= fetch("/api/part-images")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((x) => x as Record<string, Photo>));

const S = { fill: "none", stroke: "var(--muted)", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const board = (extra: React.ReactNode) => (<><rect x="4" y="8" width="32" height="24" rx="3" />{extra}</>);

// Line drawings keyed by id prefix, first match wins. Every part lands on one, ending in a generic box.
const DRAWINGS: [RegExp, React.ReactNode][] = [
  [/^chassis/, <><rect x="8" y="12" width="24" height="14" rx="3" /><circle cx="11" cy="29" r="4" /><circle cx="29" cy="29" r="4" /></>],
  [/^(pi|cam)/, board(<><rect x="9" y="13" width="9" height="9" /><circle cx="28" cy="20" r="3.5" /></>)],
  [/^(md|servo|adc|imu|reg)/, board(<><rect x="12" y="13" width="10" height="7" /><path d="M9 26h22" /></>)],
  [/^arm/, <><path d="M10 32l8-14 10 2 4-10" /><circle cx="18" cy="18" r="2.5" /><circle cx="28" cy="20" r="2.5" /><path d="M6 33h12" /></>],
  [/^(bat|sup-psu)/, <><rect x="6" y="12" width="28" height="16" rx="3" /><path d="M34 18v4M12 17v6M18 17v6M24 17v6" /></>],
  [/^(us|dist)/, <><circle cx="13" cy="20" r="7" /><circle cx="27" cy="20" r="7" /><circle cx="13" cy="20" r="2.5" /><circle cx="27" cy="20" r="2.5" /></>],
  [/^tank/, <><path d="M13 8h14M15 8v4l-4 4v16h18V16l-4-4V8" /><path d="M11 22h18" /></>],
  [/^(tool-pump|tool-gripper|tool-cam)/, <><rect x="9" y="14" width="16" height="14" rx="3" /><path d="M25 21h8M33 21v-6" /></>],
  [/^sup-(cutters|pliers|strippers|screwdrivers|iron|glue-gun)/, <><path d="M12 32l12-12M22 10l8 8M20 14l8 8" /><circle cx="11" cy="33" r="2" /></>],
  [/^sup-(hookup|jumpers|zipties|solder|glue-sticks)/, <><path d="M6 26c6-12 10 12 16 0s8-8 12-2" /></>],
];
const Box = () => <><path d="M20 7l13 7v12l-13 7-13-7V14z" /><path d="M7 14l13 7 13-7M20 21v12" /></>;

/** Product photo when one is cached, else a line drawing; never empty. */
export function PartThumb({ part }: { part: Part }) {
  const [photo, setPhoto] = useState<Photo | undefined>();
  useEffect(() => {
    let live = true;
    loadPhotos().then((all) => live && setPhoto(all[part.id]));
    return () => { live = false; };
  }, [part.id]);
  if (photo) return <img src={photo.src} alt={part.name} title={photo.credit} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 14 }} />;
  const art = DRAWINGS.find(([re]) => re.test(part.id))?.[1] ?? <Box />;
  return <svg viewBox="0 0 40 40" width="36" height="36" role="img" aria-label={`${part.name} drawing`} {...S}>{art}</svg>;
}
