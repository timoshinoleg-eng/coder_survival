import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function collectImportedNames(source) {
  const names = new Set();

  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["']/g)) {
    names.add(match[1]);
  }

  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+["'][^"']+["']/g)) {
    for (const part of match[1].split(",")) {
      const localName = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (localName) names.add(localName);
    }
  }

  return names;
}

function assertAppComponentReferencesAreImported() {
  const file = "src/App.jsx";
  const source = read(file);
  const importedNames = collectImportedNames(source);
  const localNames = new Set(
    [...source.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9_$]*)\b/g)].map((match) => match[1]),
  );
  const componentRefs = new Set(
    [...source.matchAll(/\bh\(\s*([A-Z][A-Za-z0-9_$]*)\b/g)].map((match) => match[1]),
  );

  for (const ref of componentRefs) {
    if (!importedNames.has(ref) && !localNames.has(ref)) {
      failures.push(`${file}: h(${ref}) is rendered but ${ref} is not imported`);
    }
  }
}

function assertUseCallbackDepsDoNotReadLaterDeclarations() {
  const file = "src/hooks/useGameState.js";
  const source = read(file);
  const callbacks = [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*useCallback\(/g)].map((match) => ({
    name: match[1],
    index: match.index,
  }));
  const declarationIndex = new Map(callbacks.map((callback) => [callback.name, callback.index]));

  for (const callback of callbacks) {
    const afterDeclaration = source.slice(callback.index);
    const dependencyMatch = afterDeclaration.match(/\},\s*\[([^\]]*)\]\);/);
    if (!dependencyMatch) continue;

    const deps = dependencyMatch[1]
      .split(",")
      .map((dep) => dep.trim())
      .filter(Boolean);

    for (const dep of deps) {
      const depIndex = declarationIndex.get(dep);
      if (depIndex !== undefined && depIndex >= callback.index) {
        failures.push(
          `${file}: ${callback.name} useCallback dependency reads ${dep} before it is initialized`,
        );
      }
    }
  }
}

function assertPhaserLoadedAssetsExist() {
  const srcDir = path.join(root, "src");
  const files = [];
  const stack = [srcDir];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  const loadCall = /\bthis\.load\.(?:image|spritesheet|audio|json|atlas)\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/g;
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(loadCall)) {
      const assetPath = match[1];
      if (/^(?:https?:)?\/\//.test(assetPath)) continue;

      const publicPath = path.join(root, "public", assetPath);
      const sourceRelativePath = path.resolve(path.dirname(filePath), assetPath);
      if (!fs.existsSync(publicPath) && !fs.existsSync(sourceRelativePath)) {
        failures.push(
          `${path.relative(root, filePath)}: loaded Phaser asset ${assetPath} does not exist`,
        );
      }
    }
  }
}

function assertStatsBarRuntimeLabelsAreDeclaredBeforeRender() {
  const file = "src/components/StatsBar.jsx";
  const source = read(file);
  const renderIndex = source.indexOf("return h(");
  const labelIndex = source.indexOf("const runtimeModeLabel");

  if (labelIndex !== -1 && renderIndex !== -1 && labelIndex > renderIndex) {
    failures.push(`${file}: runtimeModeLabel is declared after the component render return`);
  }
}

function assertSprintPassKeyboardStateIsDeclaredBeforeEffect() {
  const file = "src/components/SprintPassPanel.jsx";
  const source = read(file);
  const rewardsDeclaration = source.indexOf("const rewards");
  const effectUsingRewards = source.indexOf("if (!open || !rewards)");

  if (rewardsDeclaration !== -1 && effectUsingRewards !== -1 && rewardsDeclaration > effectUsingRewards) {
    failures.push(`${file}: rewards is read in an effect before it is initialized`);
  }
}

function assertTapPathDoesNotRefreshHeavyPanelsPerTap() {
  const file = "src/hooks/useGameState.js";
  const source = read(file);

  if (!source.includes("const schedulePostTapRefresh = useCallback")) {
    failures.push(`${file}: tap follow-up refreshes must be throttled through schedulePostTapRefresh`);
  }

  const flushStart = source.indexOf("const flushTapQueue = useCallback");
  const flushEnd = source.indexOf("const tap = useCallback", flushStart);
  const flushBody = flushStart !== -1 && flushEnd !== -1 ? source.slice(flushStart, flushEnd) : "";

  if (flushBody.includes("refreshQuests().catch") || flushBody.includes("refreshTeamHackathon().catch")) {
    failures.push(`${file}: flushTapQueue must not fire heavy refresh requests after every tap`);
  }
}

function assertStreakClaimDoesNotBlockOnFullStateReload() {
  const file = "src/hooks/useGameState.js";
  const source = read(file);
  const claimStart = source.indexOf("const claimStreak = useCallback");
  const claimEnd = source.indexOf("const recoverStreak = useCallback", claimStart);
  const claimBody = claimStart !== -1 && claimEnd !== -1 ? source.slice(claimStart, claimEnd) : "";

  if (claimBody.includes("await Promise.all") || claimBody.includes("await loadState()")) {
    failures.push(`${file}: claimStreak must not keep the streak button waiting for a full state reload`);
  }
}

function assertRandomEventPollingIsNotAggressive() {
  const file = "src/App.jsx";
  const source = read(file);
  if (!source.includes("const interval = setInterval(poll, 15000)")) {
    failures.push(`${file}: random event polling must stay at 15s or slower and be owned by App.jsx`);
  }
}

function assertPhaserResizeDoesNotRestartScene() {
  const file = "src/game/scenes/GameScene.js";
  const source = read(file);
  const resizeStart = source.indexOf("onResize(");
  const resizeEnd = source.indexOf("updateGlow(", resizeStart);
  const resizeBody = resizeStart !== -1 && resizeEnd !== -1 ? source.slice(resizeStart, resizeEnd) : "";

  if (resizeBody.includes("scene.restart")) {
    failures.push(`${file}: resize must not restart the scene because it leaks emitters and stalls WebView`);
  }

  if (source.includes("EventManager")) {
    failures.push(`${file}: must not reference EventManager; polling is owned by App.jsx`);
  }

  if (!source.includes("this.depressionOverlay?.destroy?.()") || !source.includes("this.glow?.destroy?.()")) {
    failures.push(`${file}: Phaser graphics must be destroyed during scene shutdown`);
  }

  if (!source.includes("resizeTimer")) {
    failures.push(`${file}: resize handling must be debounced for mobile WebView stability`);
  }
}

function assertGameProviderValueIsMemoized() {
  const file = "src/hooks/useGameState.js";
  const source = read(file);
  if (!source.includes("useMemo")) {
    failures.push(`${file}: GameProvider value must be memoized`);
  }
  if (!source.includes("const value = useMemo(() =>")) {
    failures.push(`${file}: context value must be created through useMemo`);
  }
}

function assertBatchTapsAreUsed() {
  const file = "src/hooks/useGameState.js";
  const source = read(file);
  const flushStart = source.indexOf("const flushTapQueue = useCallback");
  const flushEnd = source.indexOf("const tap = useCallback", flushStart);
  const flushBody = flushStart !== -1 && flushEnd !== -1 ? source.slice(flushStart, flushEnd) : "";

  if (flushBody.includes("while (pendingTapsRef.current > 0)")) {
    failures.push(`${file}: flushTapQueue must batch pending taps instead of sending a serial request queue`);
  }
  if (!flushBody.includes("tapCount")) {
    failures.push(`${file}: batched tap request must send tapCount`);
  }
}

function assertSingleOwnerRandomEventPolling() {
  const app = read("src/App.jsx");
  const gameScene = read("src/game/scenes/GameScene.js");

  const appPolls = [...app.matchAll(/apiRequest\(['"]\/api\/events\/active['"]/g)].length;
  if (appPolls !== 1) {
    failures.push(`src/App.jsx: must contain exactly one /api/events/active poll call (found ${appPolls})`);
  }

  if (gameScene.includes("EventManager") || gameScene.includes("/api/events/active")) {
    failures.push("src/game/scenes/GameScene.js: must not poll /api/events/active or reference EventManager; App.jsx owns polling");
  }
}

function assertTimerAndPollingDeduplication() {
  const statsBar = read("src/components/StatsBar.jsx");
  const gameState = read("src/hooks/useGameState.js");

  if (statsBar.includes("setInterval(updateNow, 1000)")) {
    failures.push("src/components/StatsBar.jsx: remove duplicate 1s timer; consume runtimeNow from App");
  }
  if (gameState.includes("setInterval(() => {\n      if ((stateRef.current.battles || []).length > 0) return;")) {
    failures.push("src/hooks/useGameState.js: remove duplicate battle polling interval");
  }
  if (!gameState.includes("fetchingGeneratorsRef")) {
    failures.push("src/hooks/useGameState.js: generator polling must have an in-flight guard");
  }
}

function assertPostTapRefreshDebouncesToBurstEnd() {
  const file = "src/hooks/useGameState.js";
  const source = read(file);
  const start = source.indexOf("const schedulePostTapRefresh = useCallback");
  const end = source.indexOf("const refreshBattles = useCallback", start);
  const body = start !== -1 && end !== -1 ? source.slice(start, end) : "";

  if (!body.includes("clearTimeout(postTapRefreshTimerRef.current)")) {
    failures.push(`${file}: post-tap refresh must reset debounce window on each tap burst`);
  }
}

function assertDailyQuestClaimDoesNotDoubleRefresh() {
  const file = "src/components/DailyQuests.jsx";
  const source = read(file);
  const claimStart = source.indexOf("async function handleClaim()");
  const claimEnd = source.indexOf("async function handleFullClear()", claimStart);
  const claimBody = claimStart !== -1 && claimEnd !== -1 ? source.slice(claimStart, claimEnd) : "";

  if (claimBody.includes("await refreshQuests()")) {
    failures.push(`${file}: handleClaim must not refresh quests after claimQuests already syncs state`);
  }
}

function assertInlineRuntimeObjectsAreMemoized() {
  const app = read("src/App.jsx");
  const confetti = read("src/components/Confetti.jsx");

  if (!app.includes("const activeRuntimeEvents = useMemo")) {
    failures.push("src/App.jsx: activeRuntimeEvents must be memoized");
  }
  if (!confetti.includes("useMemo")) {
    failures.push("src/components/Confetti.jsx: confetti pieces must be memoized for each render burst");
  }
}

assertAppComponentReferencesAreImported();
assertUseCallbackDepsDoNotReadLaterDeclarations();
assertPhaserLoadedAssetsExist();
assertStatsBarRuntimeLabelsAreDeclaredBeforeRender();
assertSprintPassKeyboardStateIsDeclaredBeforeEffect();
assertTapPathDoesNotRefreshHeavyPanelsPerTap();
assertStreakClaimDoesNotBlockOnFullStateReload();
assertRandomEventPollingIsNotAggressive();
assertPhaserResizeDoesNotRestartScene();
assertGameProviderValueIsMemoized();
assertBatchTapsAreUsed();
assertSingleOwnerRandomEventPolling();
assertTimerAndPollingDeduplication();
assertPostTapRefreshDebouncesToBurstEnd();
assertDailyQuestClaimDoesNotDoubleRefresh();
assertInlineRuntimeObjectsAreMemoized();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("frontend smoke checks passed");
