// Local scheduler: calls the jobs endpoint every minute (production uses Cloudflare Cron Triggers).
// Run with: npm run jobs   (the dev server must be running)
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is not set in .env.local");
const once = process.argv.includes("--once");

async function tick() {
  const res = await fetch(`${origin}/api/jobs/run`, { method: "POST", headers: { "x-cron-secret": secret! } });
  console.log(new Date().toISOString(), res.status, JSON.stringify(await res.json().catch(() => ({}))));
}

await tick();
if (!once) setInterval(tick, 60_000);
