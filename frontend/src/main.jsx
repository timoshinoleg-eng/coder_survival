import { h, render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { TelegramProvider } from "./hooks/useTelegram.js";
import { GameProvider, useGameState } from "./hooks/useGameState.js";
import { audioManager } from "./utils/AudioManager.js";
import StatsBar from "./components/StatsBar.jsx";
import TapArea from "./components/TapArea.jsx";
import OnboardingOverlay from "./components/OnboardingOverlay.jsx";
import LevelUpModal from "./components/LevelUpModal.jsx";
import ContextOfferBanner from "./components/ContextOfferBanner.jsx";
import EventBanner from "./components/EventBanner.jsx";
import CrunchTimeBanner from "./components/CrunchTimeBanner.jsx";
import DeathScreen from "./components/DeathScreen.jsx";
import PhaserGame from "./game/PhaserGame.js";

function AppInner() {
  const [gameReady, setGameReady] = useState(false);
  const { loading } = useGameState();
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    return localStorage.getItem("cs_onboarding_v2") === "1";
  });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
      }
      tg.setHeaderColor("#1a1a2e");
      tg.setBackgroundColor("#1a1a2e");
      if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
      }
    }
  }, []);

  useEffect(() => {
    const unlockAudio = async () => {
      const success = await audioManager.init().catch(() => false);
      if (success && !audioManager.isMuted()) {
        audioManager.playBGM("bgm_main");
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  const handleDismissOnboarding = () => {
    localStorage.setItem("cs_onboarding_v2", "1");
    setOnboardingDismissed(true);
  };

  // First-session onboarding: show once per device unless dismissed
  const showOnboarding = gameReady && !loading && !onboardingDismissed;

  return h(
    "div",
    { id: "app" },
    h(StatsBar),
    h(
      "div",
      { id: "game-container" },
      h(PhaserGame, { onReady: () => setGameReady(true) }),
    ),
    h(TapArea, { active: gameReady }),
    h(OnboardingOverlay, {
      visible: showOnboarding,
      onDismiss: handleDismissOnboarding,
    }),
    h(LevelUpModal),
    h(ContextOfferBanner),
    h(EventBanner),
    h(CrunchTimeBanner),
    h(DeathScreen),
  );
}

function App() {
  return h(TelegramProvider, null, h(GameProvider, null, h(AppInner)));
}

render(h(App), document.getElementById("app"));
