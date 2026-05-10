import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { TelegramProvider } from "./hooks/useTelegram.js";
import { GameProvider, useGameState } from "./hooks/useGameState.js";
import { audioManager } from "./utils/AudioManager.js";
import StatsBar from "./components/StatsBar.jsx";
import TapArea from "./components/TapArea.jsx";
import OnboardingModal from "./components/OnboardingModal.jsx";
import LevelUpModal from "./components/LevelUpModal.jsx";
import ContextOfferBanner from "./components/ContextOfferBanner.jsx";
import EventBanner from "./components/EventBanner.jsx";
import CrunchTimeBanner from "./components/CrunchTimeBanner.jsx";
import PhaserGame from "./game/PhaserGame.js";
import StreakCalendar from "./components/StreakCalendar.jsx";
import DailyQuests from "./components/DailyQuests.jsx";
import PassPanel from "./components/PassPanel.jsx";
import RewardedVideo from "./components/RewardedVideo.jsx";
import TeamPanel from "./components/TeamPanel.jsx";
import BattleCard from "./components/BattleCard.jsx";
import ShareButton from "./components/ShareButton.jsx";
import AudioToggle from "./components/AudioToggle.jsx";
import CareerModal from "./components/CareerModal.jsx";

function AppInner() {
  const [gameReady, setGameReady] = useState(false);
  const { loading, rank, crunchTime, showOnboarding, battles } = useGameState();
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] =
    useState(false);

  useEffect(() => {
    if (!audioManager.initialized) return;
    if (crunchTime?.active) {
      audioManager.switchZoneBGM("hackathon");
    } else if (rank >= 3) {
      audioManager.switchZoneBGM("legacy");
    } else {
      audioManager.switchZoneBGM("main");
    }
  }, [rank, crunchTime?.active]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      tg.setHeaderColor("#1a1a2e");
      tg.setBackgroundColor("#1a1a2e");
      if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
    }
  }, []);

  const handleCloseOnboarding = ({ completed } = {}) => {
    if (!completed) {
      localStorage.setItem("cs_onboarding_skipped", String(Date.now()));
      setOnboardingDismissedThisSession(true);
      return;
    }
    setOnboardingDismissedThisSession(false);
  };

  const shouldShowOnboarding =
    gameReady && !loading && showOnboarding && !onboardingDismissedThisSession;

  return h(
    "div",
    { id: "app" },
    h(StreakCalendar),
    h(StatsBar),
    h(DailyQuests),
    h(PassPanel),
    h(
      "div",
      { id: "game-container" },
      h(PhaserGame, { onReady: () => setGameReady(true) }),
    ),
    h(TapArea, { active: gameReady }),
    h(RewardedVideo),
    h(TeamPanel),
    h(AudioToggle),
    (battles || []).slice(0, 1).map((battle) => h(BattleCard, { key: battle.id, battle })),
    h(ShareButton),
    h(CareerModal),
    h(OnboardingModal, {
      visible: shouldShowOnboarding,
      onClose: handleCloseOnboarding,
    }),
    h(LevelUpModal),
    h(ContextOfferBanner),
    h(EventBanner),
    h(CrunchTimeBanner),
  );
}

export default function App() {
  return h(TelegramProvider, null, h(GameProvider, null, h(AppInner)));
}
