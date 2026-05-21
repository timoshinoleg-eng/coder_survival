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
import LoadingOverlay from "./components/LoadingOverlay.jsx";
import RandomEventToast from "./components/RandomEventToast.jsx";
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
  const { loading, rank, crunchTime, showOnboarding, battles, applyEventDeltas, showToast } = useGameState();
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] =
    useState(false);
  const [randomEvent, setRandomEvent] = useState(null);

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
    const game = window.__PHASER_GAME__;
    if (!game) return;

    const handler = (payload) => {
      setRandomEvent(payload);
    };
    game.events.on('random_event', handler);
    return () => {
      game.events.off('random_event', handler);
    };
  }, []);

  // Deferred backend sync after event: next tap or natural polling will sync state

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
    h(RandomEventToast, {
      event: randomEvent,
      onChoice: (eventId, action, deltas) => {
        window.__PHASER_GAME__?.events.emit('event_choice', { eventId, action, deltas });
        applyEventDeltas(deltas);
        const sign = (val) => (val > 0 ? `+${val}` : `${val}`);
        const parts = [];
        if (deltas.commitsDelta) parts.push(`${sign(deltas.commitsDelta)} коммитов`);
        if (deltas.energyDelta) parts.push(`${sign(deltas.energyDelta)} энергии`);
        if (deltas.depressionDelta) parts.push(`${sign(deltas.depressionDelta)} стресса`);
        showToast(
          action === 'solve' ? `Решено: ${parts.join(', ')}` : `Игнорировано: ${parts.join(', ')}`,
          action === 'solve' ? 'success' : 'info',
          2000
        );
        setRandomEvent(null);
      },
    }),
  );
}

export default function App() {
  return h(TelegramProvider, null, h(GameProvider, null, h(AppInner)));
}
