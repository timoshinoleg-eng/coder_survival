import { h } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { TelegramProvider } from "./hooks/useTelegram.js";
import { GameProvider, useGameState } from "./hooks/useGameState.js";
import { TonWalletProvider } from "./hooks/useTonWallet.js";
import WalletConnect from "./components/WalletConnect.jsx";
import { audioManager } from "./utils/AudioManager.js";
import StatsBar from "./components/StatsBar.jsx";
import TapArea from "./components/TapArea.jsx";
import OnboardingModal from "./components/OnboardingModal.jsx";
import LevelUpModal from "./components/LevelUpModal.jsx";
import ContextOfferBanner from "./components/ContextOfferBanner.jsx";
import EventBanner from "./components/EventBanner.jsx";
import CrunchTimeBanner from "./components/CrunchTimeBanner.jsx";
import FlashSaleBanner from "./components/FlashSaleBanner.jsx";
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
import VisualFixture from "./components/VisualFixture.jsx";
import CareerModal from "./components/CareerModal.jsx";
import MemeGenerator from "./components/MemeGenerator.jsx";
import PrestigeModal from "./components/PrestigeModal.jsx";
import ShareCardModal from "./components/ShareCardModal.jsx";
import DeathScreen from "./components/DeathScreen.jsx";
import { applyRandomEventChoice, getActiveRuntimeEvents, reduceLegacyCodeClick } from './utils/randomEventRuntime.js';
import { apiRequest } from './utils/api.js';
import { Analytics } from './utils/analytics.js';
import { useTelegram } from './hooks/useTelegram.js';

const EVENT_PUNCHLINES = {
  golden_commit: '✨ Код на секунду был красивым. Никому не рассказывай.',
  open_source_contribution: '🌍 Твой PR приняли. Теперь его будут поддерживать все, кроме тебя.',
  green_build: '🟢 CI зелёный с первого раза. Никто не трогает pipeline, пока он не передумал.',
  legacy_code: '🧹 Legacy пережит. Файл всё ещё называется final_final_v2.js.',
  deploy_friday: '📅 Пятничный deploy: потому что понедельник слишком предсказуемый.',
  bug_production: '🐛 Прод спасён. Постмортем назначен на завтра в 09:00.',
  code_review: '👀 Ревью завершено. Комментарий «небольшое замечание» оказался на 47 пунктов.',
  slack_huddle: '🎧 Созвон длился ровно две минуты. По времени Slack. В реальности — как всегда.',
  scope_creep: '📐 «Одна маленькая правка» получила отдельный epic, дедлайн и собственный эмодзи.',
  merge_conflict: '🌿 Конфликт решён. Git всё ещё помнит. Но теперь хотя бы молчит.',
  canary_rollback: '🐤 Канарейка выжила. Релиз — почти. Зато пятница снова принадлежит тебе.',
  production_500_spike: '📈 Grafana обновлена. Ошибки никуда не делись, но теперь выглядят свежее.',
  ci_pipeline_red: '🧪 Логи прочитаны. Виноват тест, который «никогда раньше не падал».',
  slack_thread_storm: '💬 Статус отправлен. Тред успокоился на 14 секунд и снова спросил ETA.',
  friday_release_outage: '🚨 Релиз откатан. Прод снова дышит. Пятница теперь — официальный участник postmortem.',
  coffee_stain: '☕ Кофе убран. Клавиатура официально снова production-ready.',
  stack_overflow_down: '📚 Stack Overflow вернулся. Самостоятельность продлилась 30 секунд.',
};

function normalizeRuntimeEventState(state = {}) {
  const source = state || {};
  return {
    legacyCodeClicksRemaining: Number(source.legacyCodeClicksRemaining || 0),
    productionAlertUntil: source.productionAlertUntil || null,
    hotStreakUntil: source.hotStreakUntil || null,
    bugProductionClicksRemaining: Number(source.bugProductionClicksRemaining || 0),
    coffeeStainClicksRemaining: Number(source.coffeeStainClicksRemaining || 0),
    deployFridayClicksRemaining: Number(source.deployFridayClicksRemaining || 0),
    goldenCommitUntil: source.goldenCommitUntil || null,
    stackOverflowDownUntil: source.stackOverflowDownUntil || null,
  };
}

function runtimeEventStatesEqual(left, right) {
  const normalizedLeft = normalizeRuntimeEventState(left);
  const normalizedRight = normalizeRuntimeEventState(right);
  return normalizedLeft.legacyCodeClicksRemaining === normalizedRight.legacyCodeClicksRemaining
    && normalizedLeft.productionAlertUntil === normalizedRight.productionAlertUntil
    && normalizedLeft.hotStreakUntil === normalizedRight.hotStreakUntil
    && normalizedLeft.bugProductionClicksRemaining === normalizedRight.bugProductionClicksRemaining
    && normalizedLeft.coffeeStainClicksRemaining === normalizedRight.coffeeStainClicksRemaining
    && normalizedLeft.deployFridayClicksRemaining === normalizedRight.deployFridayClicksRemaining
    && normalizedLeft.goldenCommitUntil === normalizedRight.goldenCommitUntil
    && normalizedLeft.stackOverflowDownUntil === normalizedRight.stackOverflowDownUntil;
}

function getRandomEventGameStatePayload() {
  const source = window.__GAME_STATE__ || {};
  return {
    commits: Number(source.commits || 0),
  };
}

function AppInner() {
  const [gameReady, setGameReady] = useState(false);
  // Stable identity: an inline arrow gave PhaserGame a new onReady prop on
  // every render, re-triggering its ready effect each time.
  const handleGameReady = useCallback(() => setGameReady(true), []);
  const {
    loading, rank, crunchTime, showOnboarding, battles, applyEventDeltas, showToast,
    memePrompt, clearMemePrompt, randomEventState: persistedRandomEventState,
    setRandomEventState, commits, totalTaps, streakDays, isBurnout, depression,
    energy, username, rankName, levelUp, team, teamBattle, activeLanguage,
    error
  } = useGameState();
  const { user } = useTelegram();
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] =
    useState(false);
  const [randomEvent, setRandomEvent] = useState(null);
  const [randomEventBusy, setRandomEventBusy] = useState(false);
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
  const lastDrainRef = useRef(0);
  const sessionIdRef = useRef(null);
  const sessionStartTimeRef = useRef(null);
  const sessionStartScoreRef = useRef(null);
  const sessionStartTapsRef = useRef(null);
  const sessionEndTrackedRef = useRef(false);
  const commitsRef = useRef(commits);
  const totalTapsRef = useRef(totalTaps);
  const [memeOpen, setMemeOpen] = useState(false);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareCardType, setShareCardType] = useState('burnout_level');
  const [shareCardData, setShareCardData] = useState({});
  const [deathOpen, setDeathOpen] = useState(false);
  const [deathCause, setDeathCause] = useState('burnout');

  const prevStreakRef = useRef(0);
  const prevRankRef = useRef(0);
  const burnoutShownRef = useRef(false);

  useEffect(() => { commitsRef.current = commits; }, [commits]);
  useEffect(() => { totalTapsRef.current = totalTaps; }, [totalTaps]);

  useEffect(() => {
    Analytics.track('app_opened', { source: document.referrer || 'direct' });
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    Analytics.track('tma_open', {
      platform: tg?.platform || 'unknown',
      version: tg?.version || 'unknown',
      start_param: tg?.initDataUnsafe?.start_param || null,
      is_premium: tg?.initDataUnsafe?.user?.is_premium || false,
    });
  }, []);

  useEffect(() => {
    if (user) {
      (async () => {
        Analytics.init(import.meta.env.VITE_AMPLITUDE_API_KEY);
        // PII: never send raw Telegram id/username to Amplitude.
        const hashedId = await Analytics.hashedId(user.id);
        Analytics.setUserId(hashedId);
        Analytics.setUser({ is_premium: Boolean(user.is_premium) });
        Analytics.track('init_data_validated', {
          auth_method: 'telegram_init_data',
          user_id_hash: hashedId,
        });
      })();
      if (!localStorage.getItem('cs_user_registered')) {
        const tg = window.Telegram?.WebApp;
        Analytics.track('user_registered', {
          source: document.referrer || 'direct',
          country: user?.language_code || 'unknown',
          referrer_id: tg?.initDataUnsafe?.start_param || null,
        });
        localStorage.setItem('cs_user_registered', '1');
      }
    }
  }, [user]);

  useEffect(() => {
    if (gameReady && !sessionIdRef.current) {
      sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStartTimeRef.current = Date.now();
      sessionStartScoreRef.current = commitsRef.current || 0;
      sessionStartTapsRef.current = totalTapsRef.current || 0;
      Analytics.track('game_session_start', {
        game_mode: 'idle',
        level: rank,
        session_id: sessionIdRef.current,
      });
    }
  }, [gameReady, rank]);

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

  const previousBugProductionClicksRef = useRef(0);
  useEffect(() => {
    const previous = previousBugProductionClicksRef.current;
    const current = runtimeEventState.bugProductionClicksRemaining || 0;
    if (previous > 0 && current === 0) {
      showToast('🐛 Bug in Production исправлен. Продакшн спасён.', 'success', 2200);
    }
    previousBugProductionClicksRef.current = current;
  }, [runtimeEventState.bugProductionClicksRemaining, showToast]);

  const previousCoffeeStainClicksRef = useRef(0);
  useEffect(() => {
    const previous = previousCoffeeStainClicksRef.current;
    const current = runtimeEventState.coffeeStainClicksRemaining || 0;
    if (previous > 0 && current === 0) {
      showToast('☕ Coffee Stain вытерта. Клавиатура чиста.', 'success', 2200);
    }
    previousCoffeeStainClicksRef.current = current;
  }, [runtimeEventState.coffeeStainClicksRemaining, showToast]);

  const previousDeployFridayClicksRef = useRef(0);
  useEffect(() => {
    const previous = previousDeployFridayClicksRef.current;
    const current = runtimeEventState.deployFridayClicksRemaining || 0;
    if (previous > 0 && current === 0) {
      showToast('📅 Deploy Friday отменён. Выходные спасены.', 'success', 2200);
    }
    previousDeployFridayClicksRef.current = current;
  }, [runtimeEventState.deployFridayClicksRemaining, showToast]);

  const previousGoldenCommitRef = useRef(false);
  useEffect(() => {
    const active = getActiveRuntimeEvents(runtimeEventState, runtimeNow).goldenCommitActive;
    if (previousGoldenCommitRef.current && !active) {
      showToast('✨ Golden Commit завершён. Множитель LOC/s вернулся к норме.', 'info', 1800);
    }
    previousGoldenCommitRef.current = active;
  }, [runtimeEventState.goldenCommitUntil, runtimeNow, showToast]);

  const previousStackOverflowDownRef = useRef(false);
  useEffect(() => {
    const active = getActiveRuntimeEvents(runtimeEventState, runtimeNow).stackOverflowDownActive;
    if (previousStackOverflowDownRef.current && !active) {
      showToast('📉 Stack Overflow восстановлен. Можно снова копипастить.', 'success', 1800);
    }
    previousStackOverflowDownRef.current = active;
  }, [runtimeEventState.stackOverflowDownUntil, runtimeNow, showToast]);

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
      const now = Date.now();
      if (now - lastDrainRef.current < 60000) return;
      lastDrainRef.current = now;
      applyEventDeltas({ energyDelta: -8, depressionDelta: 0, commitsDelta: 0 });
    }, 60000);
    return () => clearInterval(timer);
  }, [!!runtimeEventState.productionAlertUntil, applyEventDeltas]);

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
      active.bugProductionActive
        ? `🐛 Bug in Production: ${runtimeEventState.bugProductionClicksRemaining} кликов`
        : null,
      active.coffeeStainActive
        ? `☕ Coffee Stain: ${runtimeEventState.coffeeStainClicksRemaining} кликов`
        : null,
      active.deployFridayActive
        ? `📅 Deploy Friday: ${runtimeEventState.deployFridayClicksRemaining} кликов`
        : null,
      active.goldenCommitActive
        ? `✨ Golden Commit: ${Math.max(0, Math.ceil((new Date(runtimeEventState.goldenCommitUntil).getTime() - runtimeNow) / 1000))}с`
        : null,
      active.stackOverflowDownActive
        ? `📉 Stack Overflow Down: ${Math.max(0, Math.ceil((new Date(runtimeEventState.stackOverflowDownUntil).getTime() - runtimeNow) / 1000))}с`
        : null,
    ].filter(Boolean);
  }, [runtimeEventState, runtimeNow]);

  // Poll for active random events every 15 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const payload = await apiRequest('/api/events/active', {
          initData: window.Telegram?.WebApp?.initData || '',
        });
        if (payload?.activeEvent) {
          setRandomEvent((current) => {
            if (current && current.eventId === payload.activeEvent.eventId) {
              // Update state (e.g. click counters) without replacing the whole object
              return { ...current, state: payload.activeEvent.state || {} };
            }
            return {
              eventId: payload.activeEvent.eventId,
              type: payload.activeEvent.type,
              title: payload.activeEvent.title,
              description: payload.activeEvent.description,
              options: payload.activeEvent.options,
              timeout: payload.activeEvent.timeout,
              startedAt: payload.activeEvent.startedAt,
              expiresAt: payload.activeEvent.expiresAt,
              state: payload.activeEvent.state || {},
            };
          });
        } else {
          setRandomEvent((current) => {
            if (!current) return null;
            const expired = current.expiresAt && Date.now() >= new Date(current.expiresAt).getTime();
            if (expired) return null;
            // Only clear if the current event isn't in minigame mode
            const clickEvents = ['legacy_code', 'bug_production', 'coffee_stain', 'deploy_friday'];
            const inMinigame = clickEvents.includes(current.type) && current.state && Object.keys(current.state).some(k => k.includes('ClicksRemaining') && current.state[k] > 0);
            return inMinigame ? current : null;
          });
        }
      } catch (_e) { /* ignore polling errors */ }
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, []);

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

  // Milestone: 7-day streak share card
  useEffect(() => {
    if (streakDays >= 7 && prevStreakRef.current < 7) {
      setShareCardType('standup_survivor');
      setShareCardData({
        streakDays,
        username: username?.username || username?.first_name,
      });
      setShareCardOpen(true);
      Analytics.track('share_card_triggered', { type: 'standup_survivor', streak_days: streakDays });
    }
    prevStreakRef.current = streakDays;
  }, [streakDays, username]);

  // Milestone: rank up share card
  useEffect(() => {
    if (levelUp?.isRankUp && prevRankRef.current > 0 && rank > prevRankRef.current) {
      setShareCardType('survival_days');
      setShareCardData({
        daysSurvived: streakDays,
        rankName: levelUp.rankName || rankName,
        username: username?.username || username?.first_name,
      });
      setShareCardOpen(true);
      Analytics.track('share_card_triggered', { type: 'survival_days', rank: rank });
    }
    prevRankRef.current = rank;
  }, [levelUp, rank, rankName, streakDays, username]);

  // Death screen on burnout / heart attack
  useEffect(() => {
    if (isBurnout && !burnoutShownRef.current) {
      burnoutShownRef.current = true;
      setDeathCause('burnout');
      setDeathOpen(true);
      Analytics.track('death_screen_triggered', { cause: 'burnout', streak_days: streakDays });
    }
    if (!isBurnout) {
      burnoutShownRef.current = false;
    }
  }, [isBurnout, streakDays]);

  // Also trigger death screen from heartAttack meme prompt
  useEffect(() => {
    if (memePrompt?.trigger === 'heartAttack' && !deathOpen) {
      setDeathCause('heartAttack');
      setDeathOpen(true);
      Analytics.track('death_screen_triggered', { cause: 'heart_attack', streak_days: streakDays });
    }
  }, [memePrompt, deathOpen, streakDays]);

  useEffect(() => {
    const handleEnd = () => {
      if (sessionEndTrackedRef.current || !sessionStartTimeRef.current) return;
      sessionEndTrackedRef.current = true;
      const durationSec = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);
      const scoreDelta = (commitsRef.current || 0) - (sessionStartScoreRef.current || 0);
      const tapsCount = (totalTapsRef.current || 0) - (sessionStartTapsRef.current || 0);
      Analytics.track('session_end', {
        duration_sec: durationSec,
        score_delta: scoreDelta,
        taps_count: tapsCount,
      });
      Analytics.flush();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleEnd();
      }
    };

    window.addEventListener('beforeunload', handleEnd);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleEnd);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleCloseOnboarding = ({ completed } = {}) => {
    if (!completed) {
      localStorage.setItem("cs_onboarding_skipped", String(Date.now()));
      setOnboardingDismissedThisSession(true);
      return;
    }
    setOnboardingDismissedThisSession(false);
    // Show share card after onboarding completion
    setShareCardType('commit_of_the_day');
    setShareCardData({
      commits: commits || 0,
      todayCommits: totalTaps || 0,
      rankName: rankName || 'Junior',
      username: username?.username || username?.first_name,
    });
    setShareCardOpen(true);
    Analytics.track('share_card_triggered', { type: 'commit_of_the_day', milestone: 'onboarding_complete' });
  };

  const shouldShowOnboarding =
    gameReady && !loading && showOnboarding && !onboardingDismissedThisSession;

  const themeColor = activeLanguage?.themeColor || null;

  // Error screen — показываем вместо всего UI, если бэкенд не отвечает
  if (error && !loading) {
    return h(LoadingOverlay, { visible: true, isError: true, errorMessage: error });
  }

  return h(
    "div",
    {
      // Was id="app", which produced a second #app nested inside the mount
      // container from index.html. Class-only now; .app-shell carries the
      // layout contract (see visual-system-v2.css).
      className: "app-shell",
      style: themeColor
        ? {
            background: `linear-gradient(180deg, #0b1622 0%, ${themeColor}22 40%, #0b1622 100%)`,
          }
        : undefined,
    },
    h(LoadingOverlay, { visible: loading && !error }),
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
      {
        id: "game-container",
        // minWidth: 0 overrides the default min-width: auto of a flex item.
        // Without it the Phaser canvas' intrinsic width sets a floor on this
        // box and the game area can push the shell wider than the viewport,
        // which is exactly the horizontal-overflow failure the E2E gate checks.
        style: { minWidth: 0 },
      },
      h(PhaserGame, { onReady: handleGameReady }),
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
    h(FlashSaleBanner),
    h(ContextOfferBanner),
    h(EventBanner),
    h(CrunchTimeBanner),
    h(ShareCardModal, {
      open: shareCardOpen,
      type: shareCardType,
      data: shareCardData,
      onClose: () => setShareCardOpen(false),
    }),
    h(DeathScreen, {
      open: deathOpen,
      cause: deathCause,
      onClose: () => setDeathOpen(false),
      onRestart: () => {
        setDeathOpen(false);
        window.location.reload();
      },
    }),
    h(RandomEventToast, {
      event: randomEvent,
      disabled: randomEventBusy,
      onChoice: async (eventId, type, action) => {
        if (randomEventBusy) return;
        setRandomEventBusy(true);
        try {
          const clickEvents = ['legacy_code', 'bug_production', 'coffee_stain', 'deploy_friday'];
          const isClickEvent = clickEvents.includes(type);
          const dismissAfter = !isClickEvent || action === 'ignore';

          // Apply local transition first for instant feedback
          const transition = applyRandomEventChoice(type, action, runtimeEventState, window.__GAME_STATE__ || {});
          let nextDeltas = { energyDelta: 0, depressionDelta: 0, commitsDelta: 0 };
          if (transition) {
            setRuntimeEventState(transition.nextState);
            nextDeltas = transition.nextDeltas;
          }

          let resolveFailed = false;

          // Sync to backend via /api/events/resolve
          try {
            const payload = await apiRequest('/api/events/resolve', {
              method: 'POST',
              initData: window.Telegram?.WebApp?.initData || '',
              body: { eventId, action, gameState: getRandomEventGameStatePayload() },
            });
            if (payload?.deltas) {
              nextDeltas = payload.deltas;
            }
            if (payload?.randomEventState) {
              setRuntimeEventState((latest) => {
                const next = normalizeRuntimeEventState({ ...latest, ...payload.randomEventState });
                return runtimeEventStatesEqual(latest, next) ? latest : next;
              });
            }
            if (type === 'bug_production' && action === 'ignore') {
              showToast('🚨 Production Alert активирован на 3 минуты.', 'error', 1800);
            }
            if (type === 'golden_commit' && action === 'solve') {
              showToast('✨ Golden Commit активирован! x7 LOC/s на 77 секунд.', 'success', 1800);
            }
          } catch (_e) {
            resolveFailed = true;
            showToast('Не удалось применить выбор. Попробуй ещё раз.', 'warning', 1800);
          }

          if (!resolveFailed) {
            window.__PHASER_GAME__?.events.emit('event_choice', { eventId, action, deltas: nextDeltas });
            applyEventDeltas(nextDeltas);

            const sign = (val) => (val > 0 ? `+${val}` : `${val}`);
            const parts = [];
            if (nextDeltas.commitsDelta) parts.push(`${sign(nextDeltas.commitsDelta)} коммитов`);
            if (nextDeltas.energyDelta) parts.push(`${sign(nextDeltas.energyDelta)} энергии`);
            if (nextDeltas.depressionDelta) parts.push(`${sign(nextDeltas.depressionDelta)} стресса`);
            const punchline = EVENT_PUNCHLINES[type];
            if (punchline) {
              showToast(punchline, action === 'solve' ? 'success' : 'info', 2300);
            } else if (parts.length > 0) {
              showToast(
                action === 'solve' ? `Решено: ${parts.join(', ')}` : `Игнорировано: ${parts.join(', ')}`,
                action === 'solve' ? 'success' : 'info',
                2000
              );
            }

            if (dismissAfter) {
              setRandomEvent(null);
            }
          }
        } finally {
          setRandomEventBusy(false);
        }
      },
      onTap: async (eventId, type) => {
        if (randomEventBusy) return;
        setRandomEventBusy(true);
        try {
          const payload = await apiRequest('/api/events/resolve', {
            method: 'POST',
            initData: window.Telegram?.WebApp?.initData || '',
            body: { eventId, action: 'tap', gameState: getRandomEventGameStatePayload() },
          });
          if (payload?.randomEventState) {
            setRuntimeEventState((latest) => {
              const next = normalizeRuntimeEventState({ ...latest, ...payload.randomEventState });
              return runtimeEventStatesEqual(latest, next) ? latest : next;
            });
          }
          if (payload?.resolved) {
            setRandomEvent(null);
            const sign = (val) => (val > 0 ? `+${val}` : `${val}`);
            const parts = [];
            if (payload.deltas?.commitsDelta) parts.push(`${sign(payload.deltas.commitsDelta)} коммитов`);
            if (payload.deltas?.energyDelta) parts.push(`${sign(payload.deltas.energyDelta)} энергии`);
            if (payload.deltas?.depressionDelta) parts.push(`${sign(payload.deltas.depressionDelta)} стресса`);
            const msg = parts.length > 0 ? `Мини-игра пройдена: ${parts.join(', ')}` : 'Мини-игра пройдена!';
            showToast(msg, 'success', 1500);
            if (payload?.deltas) {
              applyEventDeltas(payload.deltas);
            }
          }
        } catch (err) {
          const msg = String(err?.payload?.error || err?.payload?.message || err?.message || '').toLowerCase();
          const gone = err?.status === 404 || /not found|already resolved|уже решено|не найдено|событие не активно|event.*expired/i.test(msg);
          if (gone) {
            setRandomEvent(null);
            showToast('Событие уже завершилось.', 'info', 1500);
          } else {
            showToast('Не удалось синхронизировать событие. Повтори тап.', 'error', 1800);
          }
        } finally {
          setRandomEventBusy(false);
        }
      },
    }),
  );
}

export default function App() {
  const visualFixtureEnabled = import.meta.env.DEV
    && new URLSearchParams(window.location.search).has('visual-fixture');
  if (visualFixtureEnabled) return h(VisualFixture);
  return h(TelegramProvider, null, h(GameProvider, null, h(TonWalletProvider, null, h(AppInner))));
}
