import { spawn, spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}
const commands = {
  dev: [
    "apps/web/node_modules/next/dist/bin/next",
    "dev",
    "apps/web",
    "--hostname",
    "127.0.0.1",
  ],
  start: [
    "apps/web/node_modules/next/dist/bin/next",
    "start",
    "apps/web",
    "--hostname",
  ],
  worker: ["--import", "tsx", "apps/worker/src/index.ts"],
  receiver: ["--import", "tsx", "apps/mock-receiver/src/index.ts"],
  seed: ["--import", "tsx", "scripts/seed.ts"],
  demo: ["--import", "tsx", "scripts/demo.ts"],
};
const command = commands[process.argv[2]];
if (!command) {
  throw new Error("Unknown application command");
}
if (["dev", "start"].includes(process.argv[2])) {
  const checked = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/check-config.ts"],
    {
      stdio: "inherit",
    },
  );
  if (checked.status !== 0) {
    process.exit(1);
  }
}
let args = process.argv.slice(3);
if (process.argv[2] === "start" && !args.length) {
  args = ["127.0.0.1"];
}
const child = spawn(process.execPath, [...command, ...args], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
