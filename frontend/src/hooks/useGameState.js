import { h, createContext } from 'preact';
import { useState, useContext, useCallback, useEffect, useRef } from 'preact/hooks';
import { useTelegram } from './useTelegram.js';
import { apiRequest } from '../utils/api.js';

const DEFAULT_STATE = {
  commits: 0,
  energy: 100,
  maxEnergy: 100,
  recoveryIntervalSeconds: 60,
  progressionUpdatedAt: null,
  serverNow: null,
  serverClockOffsetMs: 0,
  depression: 0,
  level: 1,
  exp: 0,
  totalTaps: 0,
  coffeeCups: 0,
  streakDays: 0,
  tierName: '',
  todayTaps: 0,
  sessionId: null,
  loading: true,
  syncing: false,
  error: null,
  // Career level fields
  rank: 1,
  rankName: '',
  levelInRank: 1,
  xpTotal: 0,
  xpProgress: 0,
  xpRequiredForNext: null,
  daily: null,
  lastTapDelta: null,
  levelUp: null,
  // Stage 3: toast + purchase feedback + shared UI state
  toast: null,
  purchaseStatus: null,
  shopOpen: false,
  // Stage 4: retention systems
  event: null,
  pass: null,
  team: null,
  contextOffer: null
};

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const telegram = useTelegram();
  const [state, setState] = useState(DEFAULT_STATE);
  const stateRef = useRef(DEFAULT_STATE);
  const pendingTapsRef = useRef(0);
  const processingTapRef = useRef(false);
  const prevLevelRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = 'info', duration = 2500) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setState((current) => ({ ...current, toast: { message, type, visible: true } }));
    toastTimerRef.current = setTimeout(() => {
      setState((current) => ({ ...current, toast: null }));
    }, duration);
  }, []);

  const applyServerState = useCallback((payload) => {
    const game = payload?.game || payload?.state || payload?.progression;
    const sessionId = payload?.activeSession?.sessionId || state.sessionId || null;

    if (!game) return;

    const newRank = payload?.level?.rank ?? stateRef.current.rank ?? 1;
    const newLevelInRank = payload?.level?.levelInRank ?? payload?.level?.level_in_rank ?? stateRef.current.levelInRank ?? 1;
    const newRankName = payload?.level?.rankName || payload?.level?.rank_name || stateRef.current.rankName || '';

    let levelUp = null;
    const prev = prevLevelRef.current;
    if (prev && (newRank > prev.rank || newLevelInRank > prev.levelInRank)) {
      levelUp = {
        rank: newRank,
        rankName: newRankName,
        levelInRank: newLevelInRank,
        rankMeta: {
          commitsPerTap: payload?.level?.commitsPerTap ?? null,
          maxEnergy: payload?.level?.maxEnergy ?? stateRef.current.maxEnergy ?? null
        },
        isRankUp: newRank > prev.rank
      };
    }
    prevLevelRef.current = { rank: newRank, levelInRank: newLevelInRank };

    const hasContextOffer = Object.prototype.hasOwnProperty.call(payload || {}, 'contextOffer');

    setState((current) => ({
      ...current,
      commits: Number(game.commits_total ?? game.commitsTotal ?? current.commits),
      energy: Number(game.energy ?? current.energy),
      maxEnergy: payload?.maxEnergy ?? payload?.level?.maxEnergy ?? current.maxEnergy,
      recoveryIntervalSeconds: payload?.recoveryIntervalSeconds ?? current.recoveryIntervalSeconds,
      progressionUpdatedAt: payload?.progressionUpdatedAt
        ?? game?.updated_at
        ?? game?.updatedAt
        ?? current.progressionUpdatedAt,
      serverNow: payload?.serverNow ?? current.serverNow,
      serverClockOffsetMs: payload?.serverNow
        ? (new Date(payload.serverNow).getTime() - Date.now())
        : current.serverClockOffsetMs,
      depression: Number(game.depression_level ?? game.depressionLevel ?? current.depression),
      level: Number(game.tier ?? current.level),
      exp: Number(game.commits_current ?? game.commitsCurrent ?? current.exp),
      streakDays: Number(game.streak_days ?? game.streakDays ?? current.streakDays),
      tierName: game.tierName || current.tierName || '',
      todayTaps: Number(payload?.today?.taps ?? current.todayTaps ?? 0),
      // Career ladder from payload.level — falls back to current state if absent
      rank: newRank,
      rankName: newRankName,
      levelInRank: newLevelInRank,
      xpTotal: payload?.level?.xpTotal ?? payload?.level?.xp_total ?? current.xpTotal ?? 0,
      xpProgress: payload?.level?.progressInLevel ?? payload?.level?.progress_in_level ?? current.xpProgress ?? 0,
      xpRequiredForNext: payload?.level?.requiredForNextLevel ?? payload?.level?.required_for_next_level ?? current.xpRequiredForNext ?? null,
      daily: payload?.daily ?? current.daily ?? null,
      event: payload?.event ?? current.event ?? null,
      pass: payload?.pass ?? current.pass ?? null,
      team: payload?.team ?? current.team ?? null,
      contextOffer: hasContextOffer ? payload.contextOffer : current.contextOffer,
      lastTapDelta: payload?.delta ? {
        commits: payload.delta.commits,
        energy: payload.delta.energy,
        depression: payload.delta.depression,
        xp: payload.xpDelta ?? null
      } : current.lastTapDelta,
      levelUp: levelUp ?? current.levelUp,
      sessionId,
      loading: false,
      syncing: false,
      error: null
    }));
  }, [state.sessionId]);

  const loadState = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await apiRequest('/api/state', { initData: telegram?.initData });
      applyServerState(payload);
    } catch (err) {
      setState((current) => ({
        ...current,
        loading: false,
        syncing: false,
        error: err.status === 401 || err.status === 403
          ? 'Telegram авторизация не прошла'
          : 'Сервер недоступен'
      }));
    }
  }, [applyServerState, telegram?.initData]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    window.__GAME_STATE__ = state;
    stateRef.current = state;
  }, [state]);

  const flushTapQueue = useCallback(async () => {
    if (processingTapRef.current) return;
    processingTapRef.current = true;

    try {
      while (pendingTapsRef.current > 0) {
        const currentState = stateRef.current;
        if (currentState.energy <= 0) {
          pendingTapsRef.current = 0;
          setState((current) => ({ ...current, syncing: false }));
          break;
        }

        setState((current) => ({ ...current, syncing: true, error: null }));
        pendingTapsRef.current -= 1;

        try {
          const payload = await apiRequest('/api/tap', {
            method: 'POST',
            initData: telegram?.initData,
            body: { session_id: stateRef.current.sessionId }
          });

          applyServerState(payload);
          setState((current) => ({
            ...current,
            totalTaps: current.totalTaps + 1
          }));
        } catch (err) {
          pendingTapsRef.current = 0;
          setState((current) => ({
            ...current,
            syncing: false,
            error: err.status === 429 ? 'Слишком быстро. Подожди секунду.' : 'Не удалось сохранить тап'
          }));
          break;
        }
      }
    } finally {
      processingTapRef.current = false;
      if (pendingTapsRef.current === 0) {
        setState((current) => ({ ...current, syncing: false }));
      }
    }
  }, [applyServerState, telegram?.initData]);

  const tap = useCallback(() => {
    const currentState = stateRef.current;
    if (currentState.energy <= 0) return;

    pendingTapsRef.current += 1;
    flushTapQueue();
  }, [flushTapQueue]);

  const clearLevelUp = useCallback(() => {
    setState((current) => ({ ...current, levelUp: null }));
  }, []);

  const setShopOpen = useCallback((open) => {
    setState((current) => ({ ...current, shopOpen: Boolean(open) }));
  }, []);

  const closeShop = useCallback(() => {
    setState((current) => ({ ...current, shopOpen: false }));
  }, []);

  const value = {
    ...state,
    tap,
    clearLevelUp,
    showToast,
    setShopOpen,
    closeShop,
    dismissContextOffer: async (offerType) => {
      if (!offerType) return;
      await apiRequest('/api/offers/dismiss', {
        method: 'POST',
        initData: telegram?.initData,
        body: { offerType }
      });
      setState((current) => ({ ...current, contextOffer: null }));
    },
    claimDailyQuest: async (questId) => {
      const payload = await apiRequest('/api/quests/claim', {
        method: 'POST',
        initData: telegram?.initData,
        body: { questId }
      });

      setState((current) => ({
        ...current,
        daily: payload?.daily ?? current.daily
      }));

      if (
        (payload?.reward && Object.keys(payload.reward).length > 0)
        || (payload?.bonusReward && Object.keys(payload.bonusReward).length > 0)
      ) {
        await loadState();
      }

      return payload;
    },
    drinkCoffee: () => {},
    reset: loadState
  };

  return h(GameContext.Provider, { value }, children);
}

export function useGameState() {
  return useContext(GameContext);
}
