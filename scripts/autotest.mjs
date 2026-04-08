import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const BASE_URL = "http://127.0.0.1:3000";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function safeExec(cmd) {
  try {
    execSync(cmd, { stdio: "ignore", cwd: ROOT });
  } catch {
    // ignore
  }
}

async function waitForReady(proc, timeoutMs = 45000) {
  const start = Date.now();
  let ready = false;
  let logs = "";

  const onData = (chunk) => {
    const s = chunk.toString();
    logs += s;
    process.stdout.write(s);
    if (s.includes("Ready")) ready = true;
  };
  const onErr = (chunk) => {
    const s = chunk.toString();
    logs += s;
    process.stderr.write(s);
    if (s.includes("Ready")) ready = true;
  };

  proc.stdout.on("data", onData);
  proc.stderr.on("data", onErr);

  while (Date.now() - start < timeoutMs) {
    if (ready) return;
    if (proc.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${proc.exitCode}`);
    }
    await sleep(250);
  }

  throw new Error(`Dev server did not become ready in ${timeoutMs}ms.\n${logs}`);
}

async function request(pathname, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function requestWithRetry(pathname, options = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await request(pathname, options, 30000);
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr ?? new Error(`Request failed: ${pathname}`);
}

async function runSmoke() {
  const checks = [];
  const push = (name, ok, code, note = "") => checks.push({ name, ok, code, note });

  // Warmup compile path
  await requestWithRetry("/", {}, 2);

  const home = await requestWithRetry("/");
  push("GET /", home.status === 200, home.status);

  const checkout = await requestWithRetry("/checkout");
  push("GET /checkout", checkout.status === 200, checkout.status);

  const login = await requestWithRetry("/admin/login");
  push("GET /admin/login", login.status === 200, login.status);

  const adminProducts = await requestWithRetry("/admin/products", {
    headers: { Cookie: "admin_ok=1" },
  });
  push("GET /admin/products (auth cookie)", adminProducts.status === 200, adminProducts.status);

  const bootstrap = await requestWithRetry("/api/bootstrap");
  const bootstrapOk = bootstrap.status === 200;
  push("GET /api/bootstrap", bootstrapOk, bootstrap.status);
  let scenarioOk = false;
  let scenarioStatus = 0;
  let scenarioNote = "";
  if (bootstrapOk) {
    const data = await bootstrap.json();
    const city = data?.cities?.[0];
    if (city?.id) {
      const scenario = await requestWithRetry("/api/checkout/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId: city.id,
          deliveryMethodCode: "courier",
        }),
      });
      scenarioStatus = scenario.status;
      scenarioOk = scenario.status === 200;
      if (!scenarioOk) {
        scenarioNote = (await scenario.text()).slice(0, 120);
      }
    } else {
      scenarioOk = true;
      scenarioNote = "пропуск — в БД нет городов (npm run db:push && npm run db:seed)";
    }
  }
  push(
    "POST /api/checkout/scenario",
    scenarioOk,
    scenarioStatus || 0,
    scenarioNote ? ` ${scenarioNote}` : "",
  );

  const failed = checks.filter((c) => !c.ok);
  console.log("\nSmoke results:");
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name} -> ${c.code}${c.note ? ` (${c.note})` : ""}`);
  }
  if (failed.length) {
    throw new Error(`Smoke checks failed: ${failed.map((f) => f.name).join(", ")}`);
  }
}

async function main() {
  console.log("==> Cleaning stale dev cache and port");
  safeExec("lsof -ti :3000 | xargs kill -9");
  rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });

  console.log("==> Running lint");
  run("npm run lint");

  console.log("==> Running split-logic checks");
  run("npm run test:logic");

  console.log("==> Running build");
  run("npm run build");

  console.log("==> Starting dev server for smoke checks");
  const dev = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  try {
    await waitForReady(dev);
    await runSmoke();
    console.log("\nAll checks passed.");
  } finally {
    dev.kill("SIGTERM");
    await sleep(700);
    if (dev.exitCode === null) dev.kill("SIGKILL");
    safeExec("lsof -ti :3000 | xargs kill -9");
  }
}

main().catch((e) => {
  console.error("\nAutotest failed:", e.message);
  process.exit(1);
});
