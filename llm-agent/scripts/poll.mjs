const agentUrl = process.env.AGENT_URL || "http://localhost:3002";
const secret = process.env.AGENT_SECRET;
const interval = Number(process.env.POLL_INTERVAL_MS || 7000);

let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    const response = await fetch(`${agentUrl}/api/poll`, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const body = await response.text();
    console.log(new Date().toISOString(), response.status, body);
  } catch (error) {
    console.error(new Date().toISOString(), "poll failed", error.message);
  } finally {
    running = false;
  }
}

await tick();
setInterval(tick, interval);
