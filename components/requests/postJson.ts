// POSTs JSON and throws an Error carrying the HTTP status. Validation errors read as the field messages, not a generic line.
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = (data.issues as { message: string }[] | undefined)?.map((i) => i.message);
    throw Object.assign(new Error(issues?.length ? issues.join(" ") : (data.error ?? "That didn't work. Try again.")), { status: res.status });
  }
  return data as T;
}
