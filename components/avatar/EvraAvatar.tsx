"use client";

import "./avatar.css";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { MOOD_INFO, SHAPE_INFO, luminance, outline, r1, sparkle, type AvatarDef, type EyeKind, type EyeStyle, type Mood } from "@/lib/avatar";

const R = 80; // every body's outer radius, in a 240-unit viewBox centred on 0,0

export type AvatarMotion = "full" | "eyes" | "none";

// One EVRA avatar as SVG. "full" breathes, blinks, follows the pointer and glances around when it goes quiet; "eyes"
// only blinks and follows; "none" is a still frame, which is what downloads use. Bump `boop` to make it bounce.
// Geometry lives in SVG attributes and only motion is CSS, so a serialised still frame is a complete picture.
export function EvraAvatar({
  avatar,
  mood = "idle",
  size = 96,
  motion = "full",
  boop = 0,
  label,
  svgRef,
}: {
  avatar: AvatarDef;
  mood?: Mood;
  size?: number;
  motion?: AvatarMotion;
  boop?: number;
  label?: string;
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  const id = useId().replace(/[^\w-]/g, "");
  const ownRef = useRef<SVGSVGElement>(null);
  const svg = svgRef ?? ownRef;
  const tilt = useRef<SVGGElement>(null);
  const face = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const gaze = useRef({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const m = MOOD_INFO[mood];
  const w = avatar.roundness * 30; // a round-joined stroke this wide rounds every corner of the outline
  const d = useMemo(() => outline(avatar.shape, R - w / 2), [avatar.shape, w]);

  // Gaze: ease toward the pointer, or hold the mood's own look. The transforms are written straight to the DOM so the
  // pointer never re-renders React.
  useEffect(() => {
    const el = svg.current;
    if (!el || motion === "none") return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fixed = MOOD_INFO[mood].look;
    let tx = fixed?.[0] ?? 0;
    let ty = fixed?.[1] ?? 0;
    let raf = 0;
    let timer = 0;
    const draw = () => {
      const g = gaze.current;
      g.x += (tx - g.x) * (reduce ? 1 : 0.14);
      g.y += (ty - g.y) * (reduce ? 1 : 0.14);
      face.current?.setAttribute("transform", `translate(${(g.x * 11).toFixed(2)} ${(g.y * 9).toFixed(2)})`);
      tilt.current?.setAttribute("transform", `rotate(${(g.x * 4).toFixed(2)})`);
      raf = Math.abs(tx - g.x) + Math.abs(ty - g.y) > 0.002 ? requestAnimationFrame(draw) : 0;
    };
    const aim = (x: number, y: number) => {
      [tx, ty] = [x, y];
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const wander = () => {
      const home = Math.random() < 0.3;
      aim(home ? 0 : Math.random() * 1.6 - 0.8, home ? 0 : Math.random() * 1.2 - 0.6);
      timer = window.setTimeout(wander, 1400 + Math.random() * 2400);
    };
    const roam = !fixed && !reduce && motion === "full";
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2;
      const dy = e.clientY - r.top - r.height / 2;
      const k = Math.min(1, Math.hypot(dx, dy) / 320) / (Math.hypot(dx, dy) || 1);
      aim(dx * k, dy * k);
      clearTimeout(timer);
      if (roam) timer = window.setTimeout(wander, 2600);
    };
    aim(tx, ty);
    if (!fixed) window.addEventListener("pointermove", onMove);
    if (roam) timer = window.setTimeout(wander, 1200 + Math.random() * 1500);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [motion, mood, svg]);

  useEffect(() => {
    if (motion === "none") return;
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        t = window.setTimeout(() => {
          setBlink(false);
          next();
        }, 130);
      }, 2000 + Math.random() * 3500);
    };
    next();
    return () => clearTimeout(t);
  }, [motion]);

  useEffect(() => {
    if (!boop || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    body.current?.animate(
      [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.14, 0.84)", offset: 0.18 },
        { transform: "translateY(-16px) scale(0.9, 1.12)", offset: 0.45 },
        { transform: "scale(1.05, 0.96)", offset: 0.72 },
        { transform: "scale(1, 1)" },
      ],
      { duration: 650, easing: "ease-out" },
    );
  }, [boop]);

  const shape = SHAPE_INFO[avatar.shape];
  const fx = shape.face.x * R;
  const fy = shape.face.y * R;
  const h = 0.34 * R * shape.face.s * avatar.eyeSize; // eye height
  const gap = 0.26 * R * shape.face.s * avatar.eyeGap; // each eye's distance from the face centre
  const shut = blink && motion !== "none";
  const catchlight = luminance(avatar.eyes) < 0.2; // only shows on dark eyes
  const pale = luminance(avatar.body) > 0.6; // pale bodies get a lilac edge so they don't vanish on white

  return (
    <svg ref={svg} viewBox="-120 -120 240 240" width={size} height={size} className={`eva eva--${motion}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <defs>
        <mask id={`${id}m`}>
          <path d={d} fill="#fff" stroke="#fff" strokeWidth={w} strokeLinejoin="round" />
        </mask>
        <radialGradient id={`${id}l`} cx="0.34" cy="0.28" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="0.72" cy="0.82" r="0.6">
          <stop offset="0" stopColor="#2e0b5e" stopOpacity="0.22" />
          <stop offset="1" stopColor="#2e0b5e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform={`translate(0 ${R + 14})`}>
        <ellipse className="eva-shadow" rx={R * 0.62} ry="7" fill="#2e0b5e" opacity="0.13" />
      </g>
      <g ref={tilt}>
        {/* Breathing and bouncing scale from the feet: these groups' origin is the bottom of the body. */}
        <g transform={`translate(0 ${R})`}>
          <g className="eva-breathe">
            <g ref={body}>
              <g transform={`translate(0 ${-R})`}>
                {pale && <path d={d} fill="none" stroke="#c9b0ec" strokeWidth={w + 4} strokeLinejoin="round" />}
                <path d={d} fill={avatar.body} stroke={avatar.body} strokeWidth={w} strokeLinejoin="round" />
                {avatar.photo && <image href={avatar.photo} x={-R} y={-R} width={2 * R} height={2 * R} preserveAspectRatio="xMidYMid slice" transform="scale(0.92)" mask={`url(#${id}m)`} />}
                {avatar.shape === "ticket" && !avatar.photo && <path d={`M${0.5 * R} ${-0.4 * R}V${0.4 * R}`} stroke={avatar.eyes} strokeOpacity="0.3" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round" />}
                {avatar.shine && (
                  <g mask={`url(#${id}m)`}>
                    <rect x="-100" y="-100" width="200" height="200" fill={`url(#${id}s)`} />
                    <rect x="-100" y="-100" width="200" height="200" fill={`url(#${id}l)`} />
                  </g>
                )}
                {!avatar.photo && (
                  <g ref={face}>
                    {(avatar.cheeks || m.cheeks) &&
                      [-1, 1].map((s) => <ellipse key={s} cx={r1(fx + s * (gap + 0.5 * h))} cy={r1(fy + 0.62 * h)} rx={r1(0.42 * h)} ry={r1(0.24 * h)} fill="#ff6fb5" opacity="0.42" />)}
                    {[-1, 1].map((s) => {
                      const e = s < 0 ? m.left : m.right;
                      const sy = (e.sy ?? 1) * (shut && (e.kind === "open" || e.kind === "star") ? 0.1 : 1);
                      return (
                        <g key={s} transform={`translate(${r1(fx + s * gap)} ${r1(fy)}) rotate(${-s * (e.tilt ?? 0)}) scale(${e.sx ?? 1} ${sy})`}>
                          <g key={e.kind} className="eva-pop">
                            <EyeGlyph kind={e.kind} look={avatar.eyeStyle} h={h} color={avatar.eyes} catchlight={catchlight} />
                          </g>
                        </g>
                      );
                    })}
                    {avatar.mouth && m.mouth && <Mouth kind={m.mouth} x={fx} y={fy + 0.78 * h} h={h} color={avatar.eyes} />}
                  </g>
                )}
              </g>
            </g>
          </g>
        </g>
        {m.extra && <Extra kind={m.extra} />}
      </g>
    </svg>
  );
}

function EyeGlyph({ kind, look, h, color, catchlight }: { kind: EyeKind; look: EyeStyle; h: number; color: string; catchlight: boolean }) {
  const n = (k: number) => r1(k * h);
  const line = { fill: "none", stroke: color, strokeWidth: n(0.16), strokeLinecap: "round" } as const;
  if (kind === "arc") return <path d={`M${n(-0.32)} ${n(0.12)}Q0 ${n(-0.36)} ${n(0.32)} ${n(0.12)}`} {...line} />;
  if (kind === "closed") return <path d={`M${n(-0.32)} ${n(-0.04)}Q0 ${n(0.26)} ${n(0.32)} ${n(-0.04)}`} {...line} />;
  if (kind === "star" || look === "spark") return <path d={sparkle(kind === "star" ? 0.62 * h : 0.5 * h, 0.24)} fill={color} />;
  if (look === "slit") return <rect x={n(-0.36)} y={n(-0.13)} width={n(0.72)} height={n(0.26)} rx={n(0.13)} fill={color} />;
  const dot = look === "dot";
  return (
    <>
      {dot ? <circle r={n(0.3)} fill={color} /> : <rect x={n(-0.19)} y={n(-0.5)} width={n(0.38)} height={r1(h)} rx={n(0.19)} fill={color} />}
      {catchlight && <circle cx={n(-0.07)} cy={n(dot ? -0.12 : -0.28)} r={n(0.075)} fill="#fff" />}
    </>
  );
}

function Mouth({ kind, x, y, h, color }: { kind: "smile" | "o" | "flat"; x: number; y: number; h: number; color: string }) {
  const n = (k: number) => r1(k * h);
  if (kind === "o") return <ellipse cx={r1(x)} cy={r1(y + 0.04 * h)} rx={n(0.16)} ry={n(0.2)} fill={color} />;
  const path = kind === "flat" ? `M${r1(x - 0.18 * h)} ${r1(y)}H${r1(x + 0.18 * h)}` : `M${r1(x - 0.24 * h)} ${r1(y - 0.05 * h)}Q${r1(x)} ${r1(y + 0.2 * h)} ${r1(x + 0.24 * h)} ${r1(y - 0.05 * h)}`;
  return <path d={path} fill="none" stroke={color} strokeWidth={n(0.12)} strokeLinecap="round" />;
}

// What floats around a mood: sparkles when paid, a thought trail, or z's.
function Extra({ kind }: { kind: "sparkles" | "zzz" | "dots" }) {
  if (kind === "sparkles")
    return (
      <g fill="#6a1fd0">
        {[
          [80, -72, 15],
          [-94, -30, 10],
          [88, 40, 8],
        ].map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path className="eva-twinkle" style={{ animationDelay: `${i * 0.3}s` }} d={sparkle(r, 0.18)} />
          </g>
        ))}
      </g>
    );
  if (kind === "dots")
    return (
      <g fill="#6a1fd0">
        {[0, 1, 2].map((i) => (
          <circle key={i} className="eva-dot" style={{ animationDelay: `${i * 0.2}s` }} cx={66 + i * 14} cy={-84 - i * 8} r={4.5 + i} />
        ))}
      </g>
    );
  return (
    <g fill="#625c6a" fontWeight="700" fontFamily="system-ui, sans-serif">
      {[0, 1, 2].map((i) => (
        <text key={i} className="eva-zz" style={{ animationDelay: `${i * 0.7}s` }} x={58 + i * 15} y={-62 - i * 16} fontSize={14 + i * 5}>
          z
        </text>
      ))}
    </g>
  );
}
