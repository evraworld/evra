import { z } from "zod";

// EVRA avatars as plain data: a body shape, colours, eyes and a few details. components/avatar/EvraAvatar.tsx draws
// them. The geometry is EVRA's own: every body is a closed outline sampled from a formula, so nothing here comes from a
// third-party avatar engine.

export const SHAPES = ["spark", "bubble", "ticket", "seal", "pebble", "heart"] as const;
export const EYE_STYLES = ["pill", "dot", "spark", "slit"] as const;
export const MOODS = ["idle", "happy", "wink", "thinking", "focused", "surprised", "paid", "sleepy"] as const;
export type Shape = (typeof SHAPES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type Mood = (typeof MOODS)[number];

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

// The avatar file. The studio exports it and imports it back, so it's validated like any other upload.
export const AvatarSchema = z.object({
  v: z.literal(1),
  name: z.string().trim().min(1).max(40),
  shape: z.enum(SHAPES),
  body: hex,
  eyes: hex,
  eyeStyle: z.enum(EYE_STYLES),
  eyeSize: z.number().min(0.6).max(1.4),
  eyeGap: z.number().min(0.6).max(1.4),
  roundness: z.number().min(0).max(1),
  shine: z.boolean(),
  cheeks: z.boolean(),
  mouth: z.boolean(),
  // Raster data only, so a hand-edited file can't smuggle in script. The studio re-encodes pictures to 512 px.
  photo: z.string().max(1_500_000).regex(/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/]+=*$/i).optional(),
});
export type AvatarDef = z.infer<typeof AvatarSchema>;

export function parseAvatar(x: unknown): AvatarDef | null {
  const r = AvatarSchema.safeParse(x);
  return r.success ? r.data : null;
}

export const fileName = (def: AvatarDef) => def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "avatar";

// ---------- geometry (unit size, y pointing down) ----------

type Pt = [number, number];
const TAU = Math.PI * 2;
const ring = (n: number, f: (a: number) => Pt) => Array.from({ length: n }, (_, i) => f((i / n) * TAU));
const polar = (r: number, a: number): Pt => [r * Math.cos(a), r * Math.sin(a)];
// Lamé curve |x/w|^p + |y/h|^p = 1 as a radius: p < 1 pinches the sides into a star, p > 2 squares them off.
const lame = (a: number, p: number, w = 1, h = 1) => (Math.abs(Math.cos(a) / w) ** p + Math.abs(Math.sin(a) / h) ** p) ** (-1 / p);
// 1 at angle `to`, fading to 0 about `width` radians either side.
const bump = (a: number, to: number, width: number) => Math.exp(-((Math.atan2(Math.sin(a - to), Math.cos(a - to)) / width) ** 2));

// Centres an outline and scales it so its widest half-extent is 1.
function fit(pts: Pt[]): Pt[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const k = 1 / Math.max(Math.max(...xs) - cx, Math.max(...ys) - cy);
  return pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
}

export const SHAPE_INFO: Record<Shape, { label: string; face: { x: number; y: number; s: number }; points: Pt[] }> = {
  // The EVRA mark: a four-point sparkle whose waist twists a little, like the logo's; the tips stay on the axes.
  spark: {
    label: "Spark",
    face: { x: 0, y: 0.02, s: 0.74 },
    points: fit(ring(80, (a) => {
      const r = lame(a, 0.6, 0.9);
      return polar(r, a + 0.4 * (r - 1));
    })),
  },
  // A chat bubble: the agent lives in DMs.
  bubble: {
    label: "Bubble",
    face: { x: 0, y: -0.1, s: 1 },
    points: fit(ring(80, (a) => {
      const [x, y] = polar(lame(a, 3.2, 1, 0.8), a);
      const tail = bump(a, 2.05, 0.12);
      return [x - 0.1 * tail, y + 0.45 * tail];
    })),
  },
  // A ticket: every deal gets one.
  ticket: { label: "Ticket", face: { x: -0.14, y: 0, s: 0.92 }, points: fit(ring(80, (a) => polar(lame(a, 6, 1, 0.64) - 0.17 * (bump(a, 0, 0.2) + bump(a, Math.PI, 0.2)), a))) },
  // A rosette seal: work approved.
  seal: { label: "Seal", face: { x: 0, y: 0.02, s: 0.95 }, points: fit(ring(80, (a) => polar(0.9 - 0.1 * Math.cos(10 * a), a))) },
  pebble: { label: "Pebble", face: { x: 0, y: 0.02, s: 1 }, points: fit(ring(80, (a) => polar(lame(a, 2.6, 1, 0.9) * (1 + 0.05 * Math.sin(a)), a))) },
  heart: {
    label: "Heart",
    face: { x: 0, y: -0.02, s: 0.92 },
    points: fit(ring(80, (t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])),
  },
};

export const r1 = (n: number) => Math.round(n * 10) / 10;

// A smooth closed path through a shape's outline (Catmull-Rom as cubic Béziers), scaled to `size`.
export function outline(shape: Shape, size: number): string {
  const p = SHAPE_INFO[shape].points.map(([x, y]) => [x * size, y * size]);
  const q = (i: number) => p[(i + p.length) % p.length];
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  for (let i = 0; i < p.length; i++) {
    const [a, b, c, e] = [q(i - 1), q(i), q(i + 1), q(i + 2)];
    d += `C${r1(b[0] + (c[0] - a[0]) / 6)} ${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)} ${r1(c[1] - (e[1] - b[1]) / 6)} ${r1(c[0])} ${r1(c[1])}`;
  }
  return `${d}Z`;
}

// The EVRA four-point sparkle, centred on 0,0. `waist` fattens its middle.
export function sparkle(r: number, waist = 0.2) {
  const [t, c] = [r1(r), r1(r * waist)];
  return `M0 ${-t}Q${c} ${-c} ${t} 0Q${c} ${c} 0 ${t}Q${-c} ${c} ${-t} 0Q${-c} ${-c} 0 ${-t}Z`;
}

// ---------- moods ----------

export type EyeKind = "open" | "arc" | "closed" | "star";
type Eye = { kind: EyeKind; sx?: number; sy?: number; tilt?: number };
const OPEN: Eye = { kind: "open" };

// Each mood reshapes the avatar's own eyes. `look` holds the gaze still; `tilt` leans both eyes in at the top.
export const MOOD_INFO: Record<Mood, { label: string; left: Eye; right: Eye; look?: Pt; mouth?: "smile" | "o" | "flat"; cheeks?: boolean; extra?: "sparkles" | "zzz" | "dots" }> = {
  idle: { label: "Idle", left: OPEN, right: OPEN, mouth: "smile" },
  happy: { label: "Happy", left: { kind: "arc" }, right: { kind: "arc" }, mouth: "smile", cheeks: true },
  wink: { label: "Wink", left: OPEN, right: { kind: "arc" }, mouth: "smile" },
  thinking: { label: "Thinking", left: { kind: "open", sy: 0.8 }, right: OPEN, look: [0.7, -0.8], mouth: "flat", extra: "dots" },
  focused: { label: "Focused", left: { kind: "open", sy: 0.6, tilt: 12 }, right: { kind: "open", sy: 0.6, tilt: 12 }, mouth: "flat" },
  surprised: { label: "Surprised", left: { kind: "open", sx: 1.2, sy: 1.25 }, right: { kind: "open", sx: 1.2, sy: 1.25 }, mouth: "o" },
  paid: { label: "Paid", left: { kind: "star" }, right: { kind: "star" }, mouth: "smile", cheeks: true, extra: "sparkles" },
  sleepy: { label: "Sleepy", left: { kind: "closed" }, right: { kind: "closed" }, extra: "zzz" },
};

export const EYE_STYLE_LABEL: Record<EyeStyle, string> = { pill: "Pill", dot: "Dot", spark: "Spark", slit: "Slit" };

// ---------- colour ----------

export const BODY_COLOURS = [
  { name: "Orchid", hex: "#a259f7" },
  { name: "Violet", hex: "#6a1fd0" },
  { name: "Plum", hex: "#2e0b5e" },
  { name: "Ink", hex: "#000000" },
  { name: "Lilac", hex: "#cda8ff" },
  { name: "Lavender", hex: "#ead1fd" },
  { name: "Paper", hex: "#ffffff" },
];
export const EYE_COLOURS = [
  { name: "Ink", hex: "#000000" },
  { name: "Paper", hex: "#ffffff" },
  { name: "Violet", hex: "#6a1fd0" },
  { name: "Orchid", hex: "#a259f7" },
];

// WCAG relative luminance of a #rrggbb colour.
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Keeps the eye colour unless it would get lost on the new body; then black or white, whichever reads better.
export function eyesFor(body: string, eyes: string) {
  const [hi, lo] = [luminance(body), luminance(eyes)].sort((x, y) => y - x);
  if ((hi + 0.05) / (lo + 0.05) >= 3) return eyes;
  return luminance(body) > 0.18 ? "#000000" : "#ffffff";
}

// ---------- the cast ----------

const BASE = { v: 1, eyeSize: 1, eyeGap: 1, roundness: 0.5, shine: true, cheeks: false, mouth: false } as const;

export const CAST: { role: string; def: AvatarDef }[] = [
  { role: "EVRA's agent", def: { ...BASE, name: "Evi", shape: "spark", body: "#a259f7", eyes: "#000000", eyeStyle: "pill", roundness: 0.35 } },
  { role: "Answers your DMs", def: { ...BASE, name: "Inky", shape: "bubble", body: "#000000", eyes: "#ffffff", eyeStyle: "dot", mouth: true } },
  { role: "Holds the deal terms", def: { ...BASE, name: "Stub", shape: "ticket", body: "#ffffff", eyes: "#6a1fd0", eyeStyle: "pill", roundness: 0.3 } },
  { role: "Turns up when work is approved", def: { ...BASE, name: "Seal", shape: "seal", body: "#ead1fd", eyes: "#000000", eyeStyle: "spark", cheeks: true } },
  { role: "A calm default for anyone", def: { ...BASE, name: "Pebs", shape: "pebble", body: "#6a1fd0", eyes: "#ffffff", eyeStyle: "slit" } },
  { role: "For creators and their fans", def: { ...BASE, name: "Fan", shape: "heart", body: "#cda8ff", eyes: "#000000", eyeStyle: "dot", cheeks: true, mouth: true } },
];
