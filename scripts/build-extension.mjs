import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");
const command = process.platform === "win32" ? "npx.cmd" : "npx";

function runViteBuild(args = []) {
  execFileSync(command, ["vite", "build", ...args], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

rmSync(distDir, { force: true, recursive: true });
runViteBuild();
runViteBuild(["--config", "vite.content.config.ts"]);

mkdirSync(distDir, { recursive: true });
cpSync(resolve(rootDir, "manifest.json"), resolve(distDir, "manifest.json"));

for (const iconName of ["icon.png", "icon16.png", "icon48.png", "icon128.png"]) {
  cpSync(resolve(rootDir, iconName), resolve(distDir, iconName));
}
