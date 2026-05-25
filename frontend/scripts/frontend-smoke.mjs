import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assertPhaserCanvasOnly() {
  const file = "src/game/PhaserGame.js";
  const source = read(file);

  if (!source.includes("type: Phaser.CANVAS")) {
    failures.push(`${file}: Phaser must use CANVAS renderer for Telegram/iOS WebView`);
  }

  if (/type:\s*Phaser\.(AUTO|WEBGL)\b/.test(source)) {
    failures.push(`${file}: Phaser.AUTO/WEBGL can render a black screen in Telegram WebView`);
  }
}

assertPhaserCanvasOnly();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("frontend smoke checks passed");
