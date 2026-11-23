"use client";

export function SignOut({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="ev-btn ev-btn--secondary ev-btn--small"
      onClick={async () => {
        await fetch("/api/auth/signout", { method: "POST" });
        // A full reload drops every signed-in page the router has cached.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/";
      }}
    >
      {label}
    </button>
  );
}
