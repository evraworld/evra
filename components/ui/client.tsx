"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { cx } from "./index";

// Submit button that shows progress while a server action runs, so nobody taps twice.
export function SubmitButton({ children, pendingText, variant, block, small }: { children: ReactNode; pendingText?: ReactNode; variant?: "secondary" | "soft" | "danger" | "violet"; block?: boolean; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cx("ev-btn", variant && `ev-btn--${variant}`, block && "ev-btn--block", small && "ev-btn--small")}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ev-dialog" onClose={onClose} aria-labelledby="ev-dialog-title">
      <div className="ev-stack">
        <h2 id="ev-dialog-title" className="ev-h2">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

export function CopyButton({ text, label = "Copy", done = "Copied" }: { text: string; label?: string; done?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ev-btn ev-btn--secondary ev-btn--small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      <span aria-live="polite">{copied ? done : label}</span>
    </button>
  );
}

// Calls a JSON route and refreshes the page's server data on success; errors are shown in plain words.
export function ActionButton({ url, body, children, confirm, variant, small, block, onDone }: { url: string; body?: unknown; children: ReactNode; confirm?: string; variant?: "secondary" | "soft" | "danger" | "violet"; small?: boolean; block?: boolean; onDone?: (data: unknown) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="ev-stack" style={{ ["--gap" as string]: "6px" }}>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        className={cx("ev-btn", variant && `ev-btn--${variant}`, small && "ev-btn--small", block && "ev-btn--block")}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
            onDone?.(data);
            if (data.next) router.push(data.next);
            else router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && (
        <span className="ev-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="ev-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function useJson() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function post<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
      return data as T;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, post };
}

export type ButtonProps = ComponentProps<"button">;
