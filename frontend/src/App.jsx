import { h } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
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
import WeeklySprintPanel from "./components/WeeklySprintPanel.jsx";
import PassPanel from "./components/PassPanel.jsx";
import RewardedVideo from "./components/RewardedVideo.jsx";
import TeamPanel from "./components/TeamPanel.jsx";
import BattleCard from "./components/BattleCard.jsx";
import ShareButton from "./components/ShareButton.jsx";
import AudioToggle from "./components/AudioToggle.jsx";
import CareerModal from "./components/CareerModal.jsx";
import MemeGenerator from "./components/MemeGenerator.jsx";
import PrestigeModal from "./components/PrestigeModal.jsx";
import { applyRandomEventChoice, getActiveRuntimeEvents, reduceLegacyCodeClick } from './utils/randomEventRuntime.js';
import { apiRequest } from './utils/api.js';
import { Analytics } from './utils/analytics.js';
import { useTelegram } from './hooks/useTelegram.js';

function normalizeRuntimeEventState(state = {}) {
  const source = state || {};
  return {
    legacyCodeClicksRemaining: Number(source.legacyCodeClicksRemaining || 0),
    productionAlertUntil: source.productionAlertUntil || null,
    hotStreakUntil: source.hotStreakUntil || null,
  };
}

function runtimeEventStatesEqual(left, right) {
  const normalizedLeft = normalizeRuntimeEventState(left);
  const normalizedRight = normalizeRuntimeEventState(right);
  return normalizedLeft.legacyCodeClicksRemaining === normalizedRight.legacyCodeClicksRemaining
    && normalizedLeft.productionAlertUntil === normalizedRight.productionAlertUntil
    && normalizedLeft.hotStreakUntil === normalizedRight.hotStreakUntil;
}

function AppInner() {
  const [gameReady, setGameReady] = useState(false);
  const { loading, rank, crunchTime, showOnboarding, battles, applyEventDeltas, showToast, memePrompt, clearMemePrompt, randomEventState: persistedRandomEventState, setRandomEventState } = useGameState();
  const { user } = useTelegram();
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] =
    useState(false);
  const [randomEvent, setRandomEvent] = useState(null);
  const [runtimeEventState, setRuntimeEventState] = useState({
    legacyCodeClicksRemaining: 0,
    productionAlertUntil: null,
    hotStreakUntil: null,
  });
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  const previousLegacyClicksRef = useRef(0);
  const legacyTapSyncRef = useRef(false);
  const previousHotStreakActiveRef = useRef(false);
  const previousProductionAlertActiveRef = useRef(false);
  const [memeOpen, setMemeOpen] = useState(false);

  useEffect(() => {
    Analytics.track('app_opened', { source: document.referrer || 'direct' });
  }, []);

  useEffect(() => {
    if (user) {
      Analytics.init(import.meta.env.VITE_AMPLITUDE_API_KEY);
      Analytics.setUser({ telegram_id: user.id, username: user.username });
    }
  }, [user]);

  useEffect(() => {
    if (!persistedRandomEventState) return;
    setRuntimeEventState((current) => {
      const next = normalizeRuntimeEventState({ ...current, ...persistedRandomEventState });
      return runtimeEventStatesEqual(current, next) ? current : next;
    });
  }, [persistedRandomEventState]);

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

  const showEventToast = useCallback((action, deltas) => {
    const sign = (val) => (val > 0 ? `+${val}` : `${val}`);
    const parts = [];
    if (deltas.commitsDelta) parts.push(`${sign(deltas.commitsDelta)} коммитов`);
    if (deltas.energyDelta) parts.push(`${sign(deltas.energyDelta)} энергии`);
    if (deltas.depressionDelta) parts.push(`${sign(deltas.depressionDelta)} стресса`);
    if (parts.length > 0) {
      showToast(
        action === 'solve' ? `Решено: ${parts.join(', ')}` : `Игнорировано: ${parts.join(', ')}`,
        action === 'solve' ? 'success' : 'info',
        2000
      );
    }
  }, [showToast]);

  useEffect(() => {
    const game = window.__PHASER_GAME__;
    if (!game) return undefined;
    const onTap = () => {
      setRuntimeEventState((current) => {
        const next = reduceLegacyCodeClick(current);
        if (current.legacyCodeClicksRemaining > 0 && !legacyTapSyncRef.current) {
          legacyTapSyncRef.current = true;
          apiRequest('/api/events/random/tap', {
            method: 'POST',
            initData: window.Telegram?.WebApp?.initData || '',
            body: {},
          }).then((payload) => {
            if (payload?.randomEventState) {
              setRuntimeEventState((latest) => {
                const next = normalizeRuntimeEventState({ ...latest, ...payload.randomEventState });
                return runtimeEventStatesEqual(latest, next) ? latest : next;
              });
            }
          }).catch(() => null).finally(() => {
            legacyTapSyncRef.current = false;
          });
        }
        return next;
      });
    };
    game.events.on('tap', onTap);
    return () => game.events.off('tap', onTap);
  }, []);

  useEffect(() => {
    const next = normalizeRuntimeEventState(runtimeEventState);
    if (window.__GAME_STATE__) {
      window.__GAME_STATE__.runtimeEventState = next;
    }
    if (!runtimeEventStatesEqual(persistedRandomEventState, next)) {
      setRandomEventState(next);
    }
  }, [persistedRandomEventState, runtimeEventState, setRandomEventState]);

  useEffect(() => {
    const previous = previousLegacyClicksRef.current;
    const current = runtimeEventState.legacyCodeClicksRemaining || 0;
    if (previous > 0 && current === 0) {
      showToast('🧹 Legacy Code отрефакторен. Цены вернулись в норму.', 'success', 2200);
    }
    previousLegacyClicksRef.current = current;
  }, [runtimeEventState.legacyCodeClicksRemaining, showToast]);

  useEffect(() => {
    const active = getActiveRuntimeEvents(runtimeEventState, runtimeNow).hotStreakActive;
    if (previousHotStreakActiveRef.current && !active) {
      showToast('🔥 Hot Streak завершён. Темп вернулся к норме.', 'info', 1800);
    }
    previousHotStreakActiveRef.current = active;
  }, [runtimeEventState.hotStreakUntil, runtimeNow, showToast]);

  useEffect(() => {
    const active = getActiveRuntimeEvents(runtimeEventState, runtimeNow).productionAlertActive;
    if (previousProductionAlertActiveRef.current && !active) {
      showToast('🚨 Production Alert погашен. Утечка энергии остановлена.', 'success', 1800);
    }
    previousProductionAlertActiveRef.current = active;
  }, [runtimeEventState.productionAlertUntil, runtimeNow, showToast]);

  // Deferred backend sync after event: next tap or natural polling will sync state

  useEffect(() => {
    if (!runtimeEventState.productionAlertUntil) return undefined;
    const timer = setInterval(() => {
      const until = new Date(runtimeEventState.productionAlertUntil).getTime();
      if (Date.now() >= until) {
        setRuntimeEventState((current) => ({ ...current, productionAlertUntil: null }));
        clearInterval(timer);
        return;
      }
      applyEventDeltas({ energyDelta: -8, depressionDelta: 0, commitsDelta: 0 });
    }, 60000);
    return () => clearInterval(timer);
  }, [applyEventDeltas, runtimeEventState.productionAlertUntil]);

  useEffect(() => {
    const timer = setInterval(() => setRuntimeNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeRuntimeEvents = useMemo(() => {
    const active = getActiveRuntimeEvents(runtimeEventState, runtimeNow);
    return [
      active.hotStreakActive
        ? `🔥 Hot Streak: ${Math.max(0, Math.ceil((new Date(runtimeEventState.hotStreakUntil).getTime() - runtimeNow) / 1000))}с`
        : null,
      active.productionAlertActive
        ? `🚨 Production Alert: ${Math.max(0, Math.ceil((new Date(runtimeEventState.productionAlertUntil).getTime() - runtimeNow) / 1000))}с`
        : null,
      active.legacyCodeActive
        ? `🧹 Legacy Code: ${runtimeEventState.legacyCodeClicksRemaining} кликов до рефакторинга`
        : null,
    ].filter(Boolean);
  }, [runtimeEventState, runtimeNow]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      tg.setHeaderColor("#1a1a2e");
      tg.setBackgroundColor("#1a1a2e");
    }
  }, []);

  useEffect(() => {
    if (memePrompt && !memeOpen) {
      setMemeOpen(true);
    }
  }, [memePrompt]);

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
    h(StatsBar, { runtimeNow }),
    activeRuntimeEvents.length > 0 && h(
      "div",
      {
        className: "pixel-panel",
        style: {
          marginTop: '8px',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          color: '#e6edf7',
          fontSize: '11px',
        },
      },
      activeRuntimeEvents.map((line) => h('div', { key: line, style: { color: '#facc15' } }, line)),
    ),
    h(DailyQuests),
    h(WeeklySprintPanel),
    h(PassPanel),
    h(
      "div",
      { id: "game-container" },
      h(PhaserGame, { onReady: () => setGameReady(true) }),
    ),
    h(TapArea, { active: gameReady }),
    activeRuntimeEvents.length > 0 && h(
      "div",
      {
        style: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '300px',
          zIndex: 28,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        },
      },
      h(
        "div",
        {
          className: 'pixel-panel',
          style: {
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: 'min(320px, 80vw)',
            textAlign: 'center',
            color: '#e6edf7',
            fontSize: '11px',
            background: 'rgba(16, 25, 45, 0.92)',
          },
        },
        activeRuntimeEvents.map((line) => h('div', { key: line, style: { color: '#facc15' } }, line)),
      ),
    ),
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
    h(PrestigeModal),
    h(MemeGenerator, {
      open: memeOpen,
      onClose: () => {
        setMemeOpen(false);
        clearMemePrompt?.();
      },
    }),
    h(ContextOfferBanner),
    h(EventBanner),
    h(CrunchTimeBanner),
    h(RandomEventToast, {
      event: randomEvent,
      onChoice: (eventId, type, action, deltas) => {
        let nextDeltas = { ...deltas };
        const transition = applyRandomEventChoice(type, action, runtimeEventState, window.__GAME_STATE__ || {});
        if (transition) {
          setRuntimeEventState(transition.nextState);
          apiRequest('/api/events/random/choice', {
            method: 'POST',
            initData: window.Telegram?.WebApp?.initData || '',
            body: { type, action },
          }).catch(() => null);
          if (type === 'production_alert' && action === 'ignore') {
            showToast('🚨 Production Alert активирован на 3 минуты.', 'error', 1800);
          }
          if (type === 'hot_streak' && action === 'solve') {
            showToast('🔥 Hot Streak активирован на 60 секунд.', 'success', 1800);
          }
          nextDeltas = transition.nextDeltas;
        }
        window.__PHASER_GAME__?.events.emit('event_choice', { eventId, action, deltas: nextDeltas });
        applyEventDeltas(nextDeltas);
        const sign = (val) => (val > 0 ? `+${val}` : `${val}`);
        const parts = [];
        if (nextDeltas.commitsDelta) parts.push(`${sign(nextDeltas.commitsDelta)} коммитов`);
        if (nextDeltas.energyDelta) parts.push(`${sign(nextDeltas.energyDelta)} энергии`);
        if (nextDeltas.depressionDelta) parts.push(`${sign(nextDeltas.depressionDelta)} стресса`);
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
