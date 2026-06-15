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

  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}\s+from\s+["'][^"']+["']/g)) {
    names.add(match[1]);
    for (const part of match[2].split(",")) {
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

function assertCareerBeatDoesNotSuppressItself() {
  const app = read("src/App.jsx");
  const careerModal = read("src/components/CareerModal.jsx");

  const careerModalCallMatch = app.match(/h\s*\(\s*CareerModal\s*,\s*\{([^]*?)\}\s*\)/);
  if (!careerModalCallMatch) {
    failures.push("src/App.jsx: CareerModal auto-beat call not found");
    return;
  }
  const propsBlock = careerModalCallMatch[1];
  if (/suppressed\s*:\s*blockingOverlayOpen/.test(propsBlock) || /suppressed\s*:\s*careerBeatOpen/.test(propsBlock)) {
    failures.push("src/App.jsx: CareerModal auto beat must not be suppressed by the same blockingOverlayOpen that includes careerBeatOpen");
  }
  const suppressMatch = propsBlock.match(/suppressAutoBeat\s*:\s*([A-Za-z_$][\w$]*)/);
  if (!suppressMatch || suppressMatch[1] !== "externalBlockingOverlayOpen") {
    failures.push("src/App.jsx: CareerModal auto beat should only yield to external blocking overlays");
  }
  if (!/suppressAutoBeat\s*=\s*false\b/.test(careerModal)) {
    failures.push("src/components/CareerModal.jsx: auto career beat suppression must default to false");
  }
  if (/const\s+beatId\s*=\s*unlocked\s*\.\s*find\s*\(\s*\(?\s*id\s*\)?\s*=>\s*!\s*dismissed\s*\.\s*has\s*\(\s*id\s*\)\s*\)/.test(careerModal)) {
    failures.push("src/components/CareerModal.jsx: auto career beat must skip unknown beat ids before selecting beatId");
  }
  if (!/const\s+beatId\s*=\s*unlocked\s*\.\s*find\s*\(\s*\(?\s*id\s*\)?\s*=>\s*BEATS\s*\[\s*id\s*\][^)]*!\s*dismissed\s*\.\s*has\s*\(\s*id\s*\)/.test(careerModal)) {
    failures.push("src/components/CareerModal.jsx: auto career beat should select the first known, undismissed beat");
  }
}

function assertPhaserGameReadyCallbackIsStable() {
  const app = read("src/App.jsx");
  const phaserGame = read("src/game/PhaserGame.js");

  const phaserGameCallMatch = app.match(/h\s*\(\s*PhaserGame\s*,\s*\{([^]*?)\}\s*\)/);
  if (!phaserGameCallMatch) {
    failures.push("src/App.jsx: PhaserGame JSX call not found");
  } else {
    const propsBlock = phaserGameCallMatch[1];
    if (/onReady\s*:\s*(?:\(\s*\)\s*=>|function\s*\(|\([^)]*\)\s*=>)/.test(propsBlock)) {
      failures.push("src/App.jsx: PhaserGame onReady must be stable; inline callbacks recreate Phaser during App timer rerenders");
    }
  }

  if (!/onReadyRef\s*\.\s*current\s*\?\.?\s*\(\s*\)\s*;?/.test(phaserGame)) {
    failures.push("src/game/PhaserGame.js: Phaser postBoot should call the latest onReady through a ref");
  }
  if (!/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^]*?gameRef\s*\.\s*current\s*=\s*new\s+Phaser\.Game\s*\(\s*config\s*\)[^]*?\}\s*,\s*\[\s*\]\s*\)/.test(phaserGame)) {
    failures.push("src/game/PhaserGame.js: Phaser lifetime effect must create the game inside an empty-deps effect");
  }
}

function assertCareerBeatIdComparisonIsNormalized() {
  const app = read("src/App.jsx");

  if (/careerStory\??\.unlockedBeats[^]*?\.some\s*\(\s*\(\s*id\s*\)\s*=>\s*!\s*\(?\s*careerStory\??\.dismissedBeats\s*\|\|\s*\[\]\s*\)?\s*\.\s*includes\s*\(\s*id\s*\)\s*\)/.test(app)) {
    failures.push("src/App.jsx: careerBeatOpen must normalize unlocked/dismissed beat ids before comparison");
  }
  const hasDismissedSet = /dismissedCareerBeats\s*=\s*new\s+Set\s*\(\s*\(\s*careerStory\??\.dismissedBeats\s*\|\|\s*\[\]\s*\)\s*\.\s*map\s*\(\s*Number\s*\)\s*\)/.test(app);
  const hasUnlockedNormalized = /unlockedBeats\s*\|\|\s*\[\]\s*\)\s*\.\s*map\s*\(\s*Number\s*\)/.test(app);
  const hasSetComparison = /!\s*dismissedCareerBeats\s*\.\s*has\s*\(\s*id\s*\)/.test(app);
  if (!hasDismissedSet || !hasUnlockedNormalized || !hasSetComparison) {
    failures.push("src/App.jsx: careerBeatOpen should compare Number-normalized dismissed beat ids");
  }
}

function assertTapAreaDoesNotCoverReadableContent() {
  const app = read("src/App.jsx");
  const tapArea = read("src/components/TapArea.jsx");
  const index = read("index.html");

  const firstPositionMatch = tapArea.match(/position\s*:\s*['"]([^'"]+)['"]/);
  if (!firstPositionMatch || firstPositionMatch[1] === "absolute" || firstPositionMatch[1] === "fixed") {
    failures.push("src/components/TapArea.jsx: tap area root must stay in document flow instead of covering readable panels");
  }
  if (/id\s*:\s*["']app["']/.test(app)) {
    failures.push("src/App.jsx: rendered app shell must not reuse the root id=app");
  }
  if (!/#app\s*\{[^}]*overflow-y\s*:\s*auto\b/.test(index)) {
    failures.push("index.html: root #app must be vertically scrollable so panels below the tap area stay reachable in Telegram WebView");
  }
  if (/preventDefault\s*\(\s*\)/.test(tapArea)) {
    failures.push("src/components/TapArea.jsx: tap area must not call preventDefault on pointer gestures because it blocks scroll");
  }
  if (!/touchAction\s*:\s*['"]pan-y manipulation['"]/.test(tapArea)) {
    failures.push("src/components/TapArea.jsx: tap target should allow vertical pan gestures");
  }
  if (/height\s*:\s*tapSize\b/.test(tapArea) || /width\s*:\s*tapSize\b/.test(tapArea)) {
    failures.push("src/components/TapArea.jsx: mobile tap target should not be a large square that pushes readable panels away");
  }
  if (!/height\s*:\s*tapHeight\b/.test(tapArea) || !/width\s*:\s*tapWidth\b/.test(tapArea)) {
    failures.push("src/components/TapArea.jsx: tap target should use compact action-bar dimensions");
  }
  const appReturnStart = app.lastIndexOf("OverlayProvider");
  const appReturnBlock = appReturnStart >= 0 ? app.slice(appReturnStart) : app;
  const tapIndex = appReturnBlock.search(/h\s*\(\s*TapArea\s*,/);
  const questsIndex = appReturnBlock.search(/h\s*\(\s*DailyQuests\s*\)/);
  if (tapIndex === -1 || questsIndex === -1 || questsIndex < tapIndex) {
    failures.push("src/App.jsx: DailyQuests should render after the game/tap block so tap UI does not obscure it");
  }
  if (!/#game-container\s*\{[^}]*flex\s*:\s*0\s+0\s+auto\b/.test(index)) {
    failures.push("index.html: game-container must not flex-fill the viewport above readable panels");
  }
}

function assertTapHotPathDoesNotShakeCamera() {
  const gameScene = read("src/game/scenes/GameScene.js");
  const onTapMatch = gameScene.match(/onTap\s*\([^)]*\)\s*\{([^]*?)\n  \}/);
  if (!onTapMatch) {
    failures.push("src/game/scenes/GameScene.js: onTap handler not found");
    return;
  }
  if (/cameras\.main\.shake\s*\(/.test(onTapMatch[1])) {
    failures.push("src/game/scenes/GameScene.js: tap hot path must not shake the whole camera; use local desk/keyboard feedback instead");
  }
  if (/energyPercent\s*<=\s*20[^]*cameras\.main\.shake\s*\(/.test(gameScene) && !/allowCameraShake/.test(gameScene)) {
    failures.push("src/game/scenes/GameScene.js: low-energy camera tremor must be gated for compact/reduced-motion viewports");
  }
}

function assertOnboardingCoachHandlesCompleteErrors() {
  const file = "src/components/OnboardingCoach.jsx";
  const source = read(file);
  const start = source.indexOf("const handleComplete = useCallback");
  const end = source.indexOf("const { rect }", start);
  const body = start !== -1 && end !== -1 ? source.slice(start, end) : "";

  if (!body) {
    failures.push(`${file}: handleComplete not found`);
    return;
  }

  const catchMatch = body.match(/catch\s*\(\s*err\s*\)\s*\{/);
  if (!catchMatch) {
    failures.push(`${file}: handleComplete must catch (err)`);
  } else {
    const catchStart = catchMatch.index;
    const catchEnd = body.indexOf("finally", catchStart);
    const catchBody = catchEnd !== -1 ? body.slice(catchStart, catchEnd) : body.slice(catchStart);
    if (!catchBody.includes("showToast")) {
      failures.push(`${file}: handleComplete catch block must call showToast`);
    }
  }

  const gameState = read("src/hooks/useGameState.js");
  if (gameState.includes("cs_onboarding_completed") || gameState.includes("cs_onboarding_skipped")) {
    failures.push("src/hooks/useGameState.js: must not reference cs_onboarding_completed or cs_onboarding_skipped");
  }

  const app = read("src/App.jsx");
  if (app.includes("cs_onboarding_skipped") || app.includes("cs_onboarding_completed")) {
    failures.push("src/App.jsx: must not reference cs_onboarding_skipped or cs_onboarding_completed");
  }
}

function assertDreamInterviewUsesServerResultState() {
  const file = "src/components/MiniGameDreamInterview.jsx";
  const source = read(file);

  if (!source.includes("finishedRef")) {
    failures.push(`${file}: finishGame must guard against duplicate completion requests`);
  }
  if (!source.includes("const [success, setSuccess] = useState(false)")) {
    failures.push(`${file}: result screen must track backend success separately from client score`);
  }
  if (!/payload\?\.success\s*===\s*true/.test(source) || !source.includes("setSuccess(")) {
    failures.push(`${file}: result screen must use payload.success from the backend response`);
  }
  const resultStart = source.indexOf("phase === 'result'");
  const resultBlock = resultStart !== -1 ? source.slice(resultStart) : "";
  if (/correctCount\s*>=\s*4/.test(resultBlock)) {
    failures.push(`${file}: result screen must not infer success from correctCount >= 4`);
  }
}

function assertTelegramInitDataRaceIsGuarded() {
  const apiFile = "src/utils/api.js";
  const api = read(apiFile);
  if (/initData\s*\|\|\s*createDevInitData\(\)/.test(api)) {
    failures.push(`${apiFile}: apiRequest must not substitute dev initData when Telegram WebApp exists but initData is still empty`);
  }
  if (!api.includes("window.Telegram?.WebApp") || !api.includes("hasTelegramScript") || !api.includes("isLocalDevHost")) {
    failures.push(`${apiFile}: dev initData fallback should only be used for local dev or pages without Telegram WebApp script`);
  }

  const stateFile = "src/hooks/useGameState.js";
  const state = read(stateFile);
  if (!state.includes("telegram?.isPending") || !state.includes("telegram?.tg && !telegram?.initData")) {
    failures.push(`${stateFile}: initial loadState must wait while Telegram WebApp exists but initData is empty`);
  }
}

function assertPurchasesRefreshStateAfterSuccess() {
  const shopFile = "src/components/ShopPanel.jsx";
  const shop = read(shopFile);
  if (!/\breset\b/.test(shop) || !/\brefreshPass\b/.test(shop)) {
    failures.push(`${shopFile}: successful purchases must refresh game state and pass state`);
  }
  if (!shop.includes("reset().catch(() => null)") || !shop.includes("refreshPass().catch(() => null)")) {
    failures.push(`${shopFile}: handleBuy must refresh state after successful paid purchases`);
  }

  const offerFile = "src/components/ContextOfferBanner.jsx";
  const offer = read(offerFile);
  if (!offer.includes("reset().catch(() => null)")) {
    failures.push(`${offerFile}: successful context-offer purchases must refresh game state`);
  }
}

function assertHelloWorldHasMobileControls() {
  const file = "src/components/MiniGameHelloWorld.jsx";
  const source = read(file);
  if (!source.includes("handleInputKey")) {
    failures.push(`${file}: keyboard and touch input should share one input handler`);
  }
  if (!source.includes("onClick: () => handleInputKey(key)") || !source.includes("onTouchStart:")) {
    failures.push(`${file}: rendered key boxes must be clickable/touchable for mobile Telegram users`);
  }
}

function assertDeployWorkflowsAreRunnable() {
  const stagingFile = "../.github/workflows/deploy-staging.yml";
  const staging = read(stagingFile);
  const migrateIndex = staging.indexOf("npm run migrate");
  const stopIndex = staging.indexOf("docker stop coder-survival-staging");
  if (migrateIndex === -1 || stopIndex === -1 || migrateIndex > stopIndex) {
    failures.push(`${stagingFile}: staging deploy must run migrations before replacing the running container`);
  }

  const manualFile = "../.github/workflows/manual-release.yml";
  const manual = read(manualFile);
  if (manual.includes("pwsh-lang/pwsh")) {
    failures.push(`${manualFile}: manual release must not use the non-existent pwsh-lang/pwsh action`);
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
assertCareerBeatDoesNotSuppressItself();
assertPhaserGameReadyCallbackIsStable();
assertCareerBeatIdComparisonIsNormalized();
assertTapAreaDoesNotCoverReadableContent();
assertTapHotPathDoesNotShakeCamera();
assertOnboardingCoachHandlesCompleteErrors();
assertDreamInterviewUsesServerResultState();
assertTelegramInitDataRaceIsGuarded();
assertPurchasesRefreshStateAfterSuccess();
assertHelloWorldHasMobileControls();
assertDeployWorkflowsAreRunnable();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("frontend smoke checks passed");
