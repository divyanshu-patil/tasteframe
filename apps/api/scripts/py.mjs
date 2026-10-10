// Cross-platform helper so pnpm/Turbo can drive the Python API without shell-specific syntax.
// Usage: node scripts/py.mjs <setup|dev|start|test|lint|format>
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const win = process.platform === "win32";
const venvPy = join(".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");
const host = process.env.API_HOST ?? "127.0.0.1";
const port = process.env.API_PORT ?? "8000";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) console.error(r.error.message);
  process.exit(r.status ?? 1);
};
const needVenv = () => {
  if (!existsSync(venvPy)) {
    console.error("apps/api/.venv missing. Run: pnpm api:setup");
    process.exit(1);
  }
};

const task = process.argv[2];
if (task === "setup") {
  const sys = process.env.PYTHON ?? (win ? "python" : "python3");
  if (!existsSync(venvPy)) {
    const r = spawnSync(sys, ["-m", "venv", ".venv"], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  run(venvPy, ["-m", "pip", "install", "-q", "-r", "requirements-dev.txt"]);
}
needVenv();
const tasks = {
  dev: ["-m", "uvicorn", "app.main:app", "--reload", "--no-access-log", "--host", host, "--port", port],
  start: ["-m", "uvicorn", "app.main:app", "--host", host, "--port", port, "--proxy-headers", "--no-access-log"],
  test: ["-m", "pytest", ...process.argv.slice(3)],
  lint: ["-m", "ruff", "check", "."],
  format: ["-m", "ruff", "format", "."],
};
if (!tasks[task]) {
  console.error(`Unknown task: ${task}`);
  process.exit(1);
}
if (task === "lint") {
  const r = spawnSync(venvPy, ["-m", "ruff", "format", "--check", "."], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run(venvPy, tasks[task]);
