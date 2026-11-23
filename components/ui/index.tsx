import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatMoney, type DisplayCurrency } from "@/lib/money";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnVariant = "primary" | "secondary" | "soft" | "danger" | "violet";
const btn = (variant: BtnVariant = "primary", small?: boolean, block?: boolean) =>
  cx("ev-btn", variant !== "primary" && `ev-btn--${variant}`, small && "ev-btn--small", block && "ev-btn--block");

export function Button({ variant, small, block, className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; small?: boolean; block?: boolean }) {
  return <button type="button" {...p} className={cx(btn(variant, small, block), className)} />;
}

export function LinkButton({ variant, small, block, className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; small?: boolean; block?: boolean }) {
  return <Link {...p} className={cx(btn(variant, small, block), className)} />;
}

export function PageHeader({ title, lead, action, display }: { title: ReactNode; lead?: ReactNode; action?: ReactNode; display?: boolean }) {
  return (
    <header className="ev-head">
      <div className="ev-spread">
        <h1 className={display ? "ev-display" : "ev-title"}>{title}</h1>
        {action}
      </div>
      {lead && <p className="ev-muted ev-prose">{lead}</p>}
    </header>
  );
}

export function Sheet({ children, tone, flush, className, ...p }: ComponentProps<"section"> & { tone?: "ink"; flush?: boolean }) {
  return (
    <section {...p} className={cx("ev-sheet", tone === "ink" && "ev-sheet--ink", flush && "ev-sheet--flush", className)}>
      {children}
    </section>
  );
}

export function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="ev-field">
      <label className="ev-label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="ev-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span className="ev-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ className, invalid, ...p }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input {...p} aria-invalid={invalid || undefined} className={cx("ev-input", className)} />;
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx("ev-textarea", className)} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select {...p} className={cx("ev-select", className)} />;
}

export function Chips({ legend, name, options, selected, type = "checkbox" }: { legend: ReactNode; name: string; options: { value: string; label: ReactNode }[]; selected: string[]; type?: "checkbox" | "radio" }) {
  return (
    <fieldset className="ev-stack" style={{ border: 0, padding: 0, margin: 0, ["--gap" as string]: "10px" }}>
      <legend className="ev-label" style={{ marginBottom: 10 }}>
        {legend}
      </legend>
      <div className="ev-chips">
        {options.map((o) => (
          <label className="ev-chip" key={o.value}>
            <input type={type} name={name} value={o.value} defaultChecked={selected.includes(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({ name, label, hint, defaultChecked }: { name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="ev-toggle">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="ev-stack" style={{ ["--gap" as string]: "2px" }}>
        <span className="ev-label">{label}</span>
        {hint && <span className="ev-hint">{hint}</span>}
      </span>
    </label>
  );
}

type Tone = "ok" | "warn" | "bad" | "ink";
export function Badge({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("ev-badge", tone && `ev-badge--${tone}`)}>{children}</span>;
}

export function Notice({ tone, title, children }: { tone?: Exclude<Tone, "ink">; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx("ev-notice", tone && `ev-notice--${tone}`)} role={tone === "bad" ? "alert" : "status"}>
      <div className="ev-stack" style={{ ["--gap" as string]: "4px" }}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Money({ cents, currency = "USD", locale = "en", size }: { cents: number; currency?: DisplayCurrency; locale?: string; size?: "hero" | "md" }) {
  const text = formatMoney(cents, currency, locale);
  if (!size) return <span style={{ fontVariantNumeric: "tabular-nums" }}>{text}</span>;
  return <span className={cx("ev-amount", size === "md" && "ev-amount--md")}>{text}</span>;
}

// A real sequence: each step is done, current or still to come.
export function Rail({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return (
    <ol className="ev-rail" aria-label={label} style={{ ["--steps" as string]: steps.length }}>
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? "done" : i === current ? "now" : "todo"} aria-current={i === current ? "step" : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className={cx("ev-avatar", large && "ev-avatar--lg")} aria-hidden>
      {initials || "?"}
    </span>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ev-empty">
      <p className="ev-h2">{title}</p>
      {children && <p className="ev-muted ev-prose">{children}</p>}
      {action}
    </div>
  );
}

export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="ev-kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export { cx };
