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

function assertMobileScreensHaveOneOwnerAndTopmostModalLayer() {
  const app = read("src/App.jsx");
  const statsBar = read("src/components/StatsBar.jsx");
  const visualSystem = read("src/assets/visual-system-v2.css");

  for (const duplicateSurface of ["h(DailyQuests),", "h(WeeklySprintPanel),", "h(PassPanel),"]) {
    if (app.includes(duplicateSurface)) {
      failures.push(`src/App.jsx: ${duplicateSurface} duplicates a screen already opened from StatsBar`);
    }
  }
  if (app.includes("h(AudioToggle)") || app.includes("h(ShareButton)")) {
    failures.push("src/App.jsx: fixed utility controls must not cover the HUD or commit area");
  }
  if (!statsBar.includes("anyModalOpen && \"hud-v2--overlay-open\"")) {
    failures.push("src/components/StatsBar.jsx: every open screen must elevate the HUD modal owner");
  }
  if (!visualSystem.includes(".hud-v2--overlay-open") || !visualSystem.includes("position: fixed !important")) {
    failures.push("src/assets/visual-system-v2.css: open HUD screens must occupy the fixed viewport layer");
  }
}

function assertVercelPreviewUsesTheCurrentApiProxy() {
  const vercelConfig = read("vercel.json");
  const api = read("src/utils/api.js");
  const memeGenerator = read("src/components/MemeGenerator.jsx");

  if (!vercelConfig.includes("https://coder-api.chatbot24.su/api/$1") || !vercelConfig.includes("https://coder-api.chatbot24.su/health")) {
    failures.push("vercel.json: Preview /api and /health rewrites must target coder-api.chatbot24.su");
  }
  if (vercelConfig.includes("coder-survival-api.duckdns.org")) {
    failures.push("vercel.json: retired DuckDNS API rewrite must not be used by Vercel previews");
  }
  if (!api.includes("window.location.hostname.endsWith('.vercel.app')") || !memeGenerator.includes("API_BASE_URL, apiRequest")) {
    failures.push("frontend: all Vercel API consumers must use the same-origin proxy to avoid CORS");
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

function assertGeneratedHeroSpritesRemainOptionalAndComplete() {
  const boot = read("src/game/scenes/BootScene.js");
  const gameScene = read("src/game/scenes/GameScene.js");
  const requiredAssets = [
    "hero_coder_focus.png",
    "hero_coder_strained.png",
    "hero_coder_collapsed.png",
  ];

  for (const asset of requiredAssets) {
    if (!fs.existsSync(path.join(root, "src/assets/characters", asset))) {
      failures.push(`src/assets/characters: missing generated hero sprite ${asset}`);
    }
  }

  for (const key of ["hero_coder_focus", "hero_coder_strained", "hero_coder_collapsed"]) {
    if (!boot.includes(`this.load.image('${key}'`) || !gameScene.includes(`'${key}'`)) {
      failures.push(`Phaser hero art: ${key} must be preloaded and mapped to a stress pose`);
    }
  }

  if (!gameScene.includes("this.hasGeneratedHeroArt") || !gameScene.includes("avatar_energetic")) {
    failures.push("GameScene: generated hero art must remain optional with a procedural fallback");
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
  const playerPassDeclaration = source.indexOf("const playerPass =");
  const playerPassFirstUse = source.indexOf("playerPass.");
  const renderReturn = source.indexOf("return h(");

  if (rewardsDeclaration !== -1 && effectUsingRewards !== -1 && rewardsDeclaration > effectUsingRewards) {
    failures.push(`${file}: rewards is read in an effect before it is initialized`);
  }
  if (playerPassDeclaration === -1 || (playerPassFirstUse !== -1 && playerPassDeclaration > playerPassFirstUse)) {
    failures.push(`${file}: playerPass must be declared before any property access`);
  }
  if (renderReturn !== -1 && playerPassDeclaration > renderReturn) {
    failures.push(`${file}: playerPass must be initialized before component render`);
  }
}

function assertRewardedAdsUseSecureClaimFlow() {
  const ui = read("src/components/RewardedVideo.jsx");
  const state = read("src/hooks/useGameState.js");
  const legacy = "/api/rewarded-video/complete";
  if (!ui.includes("createAdSession") || !ui.includes("showRewardedAd")) {
    failures.push("src/components/RewardedVideo.jsx: rewarded UI must create a server ad session before showing an ad");
  }
  if (!state.includes("/api/rewards/ad-claim")) {
    failures.push("src/hooks/useGameState.js: rewarded claim must use /api/rewards/ad-claim");
  }
  if (ui.includes(legacy) || state.includes(legacy)) {
    failures.push("frontend: legacy trust-based rewarded-video claim must not be called");
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

function assertFridayReleaseOutageMobileTimerAndAnimation() {
  const toastFile = "src/components/RandomEventToast.jsx";
  const toast = read(toastFile);
  const engine = read("../backend/src/utils/randomEventEngine.js");
  const app = read("src/App.jsx");

  if (!engine.includes("friday_release_outage: 15")) {
    failures.push(`${toastFile}: Friday Release Outage must have an explicit 15s server timeout`);
  }
  if (!toast.includes("const timeoutSeconds = Math.max(1, Number(event.timeout || 15))")) {
    failures.push(`${toastFile}: mobile countdown must derive from the server-provided event timeout`);
  }
  if (!toast.includes("setInterval(() =>") || !toast.includes("clearInterval(interval)")) {
    failures.push(`${toastFile}: countdown interval must be cleaned up when event changes or closes`);
  }
  if (!toast.includes('animation: "pixel-fade-in 150ms step-end forwards"')) {
    failures.push(`${toastFile}: event toast must retain the short mobile-safe entry animation`);
  }
  if (!toast.includes('width: "90vw"') || !toast.includes('maxWidth: "420px"')) {
    failures.push(`${toastFile}: event toast must remain constrained for narrow mobile WebViews`);
  }
  if (!toast.includes('transition: "width 1s linear"')) {
    failures.push(`${toastFile}: countdown progress bar must animate smoothly on mobile`);
  }
  if (!app.includes("friday_release_outage:")) {
    failures.push("src/App.jsx: Friday Release Outage must have a post-resolution punchline");
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
  // The context was split into hot/cold dual contexts for tap performance. Both
  // provider values must be memoized so high-frequency hot updates never force a
  // re-render of cold consumers (and vice-versa).
  if (!source.includes("const hotValue = useMemo(") || !source.includes("const coldValue = useMemo(")) {
    failures.push(`${file}: hot/cold context values must both be created through useMemo`);
  }
}

// Telegram's iOS WebView can black-screen when Phaser selects the WebGL
// renderer. The game MUST pin the Canvas renderer; this guard fails the build if
// anyone reintroduces Phaser.AUTO or Phaser.WEBGL.
function assertPhaserUsesCanvasRenderer() {
  const file = "src/game/PhaserGame.js";
  const source = read(file);
  if (!/type:\s*Phaser\.CANVAS/.test(source)) {
    failures.push(`${file}: Phaser game config must set type: Phaser.CANVAS`);
  }
  if (/Phaser\.AUTO/.test(source) || /Phaser\.WEBGL/.test(source)) {
    failures.push(`${file}: Phaser renderer must not use Phaser.AUTO or Phaser.WEBGL (iOS WebView black screen)`);
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

/**
 * Payment kill switch — structural guard.
 *
 * Supplements (does not replace) the behavioural tests in
 * tests/payments.test.mjs. Those prove openInvoice is never called while
 * disabled; this catches a future edit that reintroduces an ungated payment
 * control or the TON placeholder, which a runtime test over today's components
 * would not notice.
 */
function assertCoffeeCosmeticProgressRemainsVisualOnly() {
  const skinPanel = read("src/components/SkinPanel.jsx");
  const gameState = read("src/hooks/useGameState.js");

  if (!skinPanel.includes("coffeeGoalSkin") || !skinPanel.includes("coffee_cosmetic_detail_viewed")) {
    failures.push("src/components/SkinPanel.jsx: Coffee Coin cosmetic progress and detail analytics must stay visible");
  }
  if (!skinPanel.includes("Косметика не влияет на тапы, рейтинг или энергию")) {
    failures.push("src/components/SkinPanel.jsx: Coffee Coin cosmetic UX must explicitly remain non-pay-to-win");
  }
  if (!gameState.includes("/api/skins/unlock-coffee")) {
    failures.push("src/hooks/useGameState.js: Coffee Coin cosmetic unlock must use the server-authoritative endpoint");
  }
}

function assertPaymentControlsAreGated() {
  const purchases = read("src/utils/purchases.js");

  // openInvoice must only be reachable past a payments check.
  if (!purchases.includes("arePaymentsEnabled")) {
    failures.push("src/utils/purchases.js: must consult arePaymentsEnabled before starting a purchase");
  }
  if (!purchases.includes("PaymentsDisabledError")) {
    failures.push("src/utils/purchases.js: must throw PaymentsDisabledError while payments are disabled");
  }

  // Every component that can start a purchase must gate its control.
  const purchaseEntryPoints = [
    "src/components/ShopPanel.jsx",
    "src/components/PassPanel.jsx",
    "src/components/SprintPassPanel.jsx",
    "src/components/ContextOfferBanner.jsx",
  ];
  for (const file of purchaseEntryPoints) {
    const source = read(file);
    const startsPurchase = /startTelegramPurchase|startDealPurchase/.test(source);
    if (startsPurchase && !source.includes("arePaymentsEnabled")) {
      failures.push(`${file}: starts a purchase but never checks arePaymentsEnabled`);
    }
  }

  // The TON payment placeholder was removed; it must not come back. (TON
  // *wallet connect* is unrelated and still allowed.)
  const shop = read("src/components/ShopPanel.jsx");
  if (/Pay with TON|TON Pay:/i.test(shop)) {
    failures.push("src/components/ShopPanel.jsx: TON payment placeholder must stay removed");
  }
  if (/currency:\s*['"]ton['"]/i.test(shop)) {
    failures.push("src/components/ShopPanel.jsx: must not emit TON purchase analytics");
  }
}

assertAppComponentReferencesAreImported();
assertMobileScreensHaveOneOwnerAndTopmostModalLayer();
assertVercelPreviewUsesTheCurrentApiProxy();
assertPaymentControlsAreGated();
assertCoffeeCosmeticProgressRemainsVisualOnly();
assertUseCallbackDepsDoNotReadLaterDeclarations();
assertPhaserLoadedAssetsExist();
assertGeneratedHeroSpritesRemainOptionalAndComplete();
assertStatsBarRuntimeLabelsAreDeclaredBeforeRender();
assertSprintPassKeyboardStateIsDeclaredBeforeEffect();
assertRewardedAdsUseSecureClaimFlow();
assertTapPathDoesNotRefreshHeavyPanelsPerTap();
assertStreakClaimDoesNotBlockOnFullStateReload();
assertRandomEventPollingIsNotAggressive();
assertFridayReleaseOutageMobileTimerAndAnimation();
assertPhaserResizeDoesNotRestartScene();
assertGameProviderValueIsMemoized();
assertPhaserUsesCanvasRenderer();
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
