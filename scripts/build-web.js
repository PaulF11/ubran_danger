// File note: This file handles build-web.js.
const { spawnSync } = require("node:child_process");

const apiBaseUrl =
  process.env.API_BASE_URL || "https://urbandangerintel.netlify.app";
const parsedApiBaseUrl = new URL(apiBaseUrl);
if (
  parsedApiBaseUrl.protocol !== "https:" ||
  parsedApiBaseUrl.origin !== "https://urbandangerintel.netlify.app"
) {
  throw new Error("API_BASE_URL must be the production public site origin.");
}

const result = spawnSync(
  "flutter",
  [
    "build",
    "web",
    "--release",
    "--no-wasm-dry-run",
    `--dart-define=API_BASE_URL=${parsedApiBaseUrl.origin}`,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
