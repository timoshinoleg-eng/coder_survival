import { h, createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useTelegram } from "./useTelegram.js";
import { apiRequest } from "../utils/api.js";

const DEFAULT_STATE = {
  commits: 0,
  energy: 100,
  maxEnergy: 100,
  recoveryIntervalSeconds: 60,
  recoveryEtaSeconds: null,
  progressionUpdatedAt: null,
  serverNow: null,
  serverClockOffsetMs: 0,
  depression: 0,
  level: 1,
  exp: 0,
  totalTaps: 0,
  coffeeCups: 0,
  streakDays: 0,
  tierName: "",
  user: null,
  todayTaps: 0,
  sessionId: null,
  loading: true,
  syncing: false,
  error: null,
  rank: 1,
  rankName: "",
  levelInRank: 1,
  xpTotal: 0,
  xpProgress: 0,
  xpRequiredForNext: null,
  daily: null,
  quests: null,
  loginReward: null,
  lastTapDelta: null,
  levelUp: null,
  toast: null,
  purchaseStatus: null,
  shopOpen: false,
  boostersOpen: false,
  event: null,
  pass: null,
  streak: null,
  rewardedVideo: null,
  team: null,
  teamHackathon: null,
  battles: [],
  battleHistory: [],
  battleUserId: null,
  referral: null,
  liveEvent: null,
  careerStory: null,
  teamBattle: null,
  crunchTime: null,
  referralChain: null,
  achievements: [],
  skins: null,
  activeEffects: {},
  featureFlags: {},
  stressCohort: "control",
  contextOffer: null,
  isBurnout: false,
  burnoutAffliction: false,
  forcedBreakUntil: null,
  isCrit: false,
  critTier: null,
  inventory: {},
  showOnboarding: false,
  memePrompt: null,
  weeklySprint: null,
  generatorState: null,
  randomEventState: null,
  dailyFarm: null,
  passiveLocRecovery: null,
  antiCheat: null,
  prestige: null,
  dailyBattle: null,
  activeLanguage: null,
};

const GameContext = createContext(null);

function withTimezoneBody(body = {}) {
  const offset = new Date().getTimezoneOffset() * -1;
  return { ...body, timezoneOffset: offset };
}

function timezoneQuery() {
  return `timezoneOffset=${encodeURIComponent(String(new Date().getTimezoneOffset() * -1))}`;
}

function normalizeQuestPayload(payload) {
  if (!payload) return null;
  return {
    date: payload.date,
    quests: payload.quests || payload.daily?.quests || [],
    avgDailyFarm: payload.avgDailyFarm ?? payload.daily?.avgDailyFarm ?? null,
    accountAgeDays: payload.accountAgeDays ?? payload.daily?.accountAgeDays ?? null,
    fullClearAvailable: payload.fullClearAvailable ?? payload.daily?.fullClearAvailable ?? false,
    fullClearClaimed: payload.fullClearClaimed ?? payload.daily?.fullClearClaimed ?? false,
    total: payload.daily?.total ?? (payload.quests || []).length,
    completed: payload.daily?.completed ?? (payload.quests || []).filter((quest) => quest.completed).length,
    claimable: payload.daily?.claimable ?? (payload.quests || []).filter((quest) => quest.completed && !quest.claimed).length,
  };
}

function mergeMinimalEvent(currentEvent, minimalEvent) {
  if (!minimalEvent || !currentEvent) return minimalEvent || currentEvent || null;
  return {
    ...currentEvent,
    myContribution: {
      ...currentEvent.myContribution,
      commitsContributed:
        minimalEvent.contributed ??
        currentEvent.myContribution?.commitsContributed ??
        0,
      claimed: minimalEvent.claimed ?? currentEvent.myContribution?.claimed ?? false,
      progressPercent: minimalEvent.target
        ? Math.min(100, Math.round((minimalEvent.contributed / minimalEvent.target) * 100))
        : currentEvent.myContribution?.progressPercent ?? 0,
    },
  };
}

export function GameProvider({ children }) {
  const telegram = useTelegram();
  const [state, setState] = useState(DEFAULT_STATE);
  const stateRef = useRef(DEFAULT_STATE);
  const pendingTapsRef = useRef(0);
  const processingTapRef = useRef(false);
  const tapRetryTimerRef = useRef(null);
  const tapRetryAttemptsRef = useRef(0);
  const loadStatePromiseRef = useRef(null);
  const postTapRefreshTimerRef = useRef(null);
  const fetchingBattlesRef = useRef(false);
  const fetchingGeneratorsRef = useRef(false);
  const equippingSkinRef = useRef(false);
  const battlePollingStartedAtRef = useRef(Date.now());
  const prevLevelRef = useRef(null);
  const toastTimerRef = useRef(null);
  const previousAchievementsRef = useRef(null);

  const showToast = useCallback((message, type = "info", duration = 2500) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setState((current) => ({ ...current, toast: { message, type, visible: true } }));
    toastTimerRef.current = setTimeout(() => {
      setState((current) => ({ ...current, toast: null }));
    }, duration);
  }, []);

  const applyServerState = useCallback((payload) => {
    const game = payload?.game || payload?.state || payload?.progression;
    if (!game) return;

    const sessionId = payload?.activeSession?.sessionId || stateRef.current.sessionId || null;
    const rawOnboardingCompleted =
      game?.onboarding_completed ??
      game?.onboardingCompleted ??
      payload?.onboarding_completed ??
      payload?.onboardingCompleted;

    // Fail-open: if the backend does not tell us the onboarding state, assume
    // the player still needs onboarding rather than silently hiding it.
    const onboardingCompleted = rawOnboardingCompleted === true;

    if (rawOnboardingCompleted === undefined) {
      console.warn('[useGameState] onboarding field missing from server payload; defaulting to show onboarding');
    }
    const inventory = game.inventory || payload?.inventory || {};
    const newRank = payload?.level?.rank ?? stateRef.current.rank ?? 1;
    const newLevelInRank =
      payload?.level?.levelInRank ??
      payload?.level?.level_in_rank ??
      stateRef.current.levelInRank ??
      1;
    const newRankName =
      payload?.level?.rankName ||
      payload?.level?.rank_name ||
      stateRef.current.rankName ||
      "";

    let levelUp = null;
    const previous = prevLevelRef.current;
    if (previous && (newRank > previous.rank || newLevelInRank > previous.levelInRank)) {
      levelUp = {
        rank: newRank,
        rankName: newRankName,
        levelInRank: newLevelInRank,
        rankMeta: {
          commitsPerTap: payload?.level?.commitsPerTap ?? null,
          maxEnergy: payload?.level?.maxEnergy ?? stateRef.current.maxEnergy ?? null,
        },
        isRankUp: newRank > previous.rank,
      };
    }
    prevLevelRef.current = { rank: newRank, levelInRank: newLevelInRank };

    const hasContextOffer = Object.prototype.hasOwnProperty.call(payload || {}, "contextOffer");

    if (payload?.idleRecovery?.energy > 0) {
      showToast(
        `⚡ Восстановлено +${payload.idleRecovery.energy} энергии за время отсутствия`,
        "success",
        1500
      );
    }

    if (payload?.passiveLocRecovery?.locEarned > 0) {
      showToast(
        `🤖 Генераторы принесли +${payload.passiveLocRecovery.locEarned} LOC`,
        "success",
        1800
      );
    }

    setState((current) => ({
      ...current,
      user: payload?.user ?? current.user ?? null,
      commits: Number(game.commits_total ?? game.commitsTotal ?? current.commits),
      energy: Number(game.energy ?? current.energy),
      maxEnergy: payload?.maxEnergy ?? payload?.level?.maxEnergy ?? current.maxEnergy,
      recoveryIntervalSeconds: payload?.recoveryIntervalSeconds ?? current.recoveryIntervalSeconds,
      recoveryEtaSeconds: payload?.recoveryEtaSeconds ?? current.recoveryEtaSeconds,
      progressionUpdatedAt:
        payload?.progressionUpdatedAt ??
        game?.updated_at ??
        game?.updatedAt ??
        current.progressionUpdatedAt,
      serverNow: payload?.serverNow ?? current.serverNow,
      serverClockOffsetMs: payload?.serverNow
        ? new Date(payload.serverNow).getTime() - Date.now()
        : current.serverClockOffsetMs,
      depression: Number(game.depression_level ?? game.depressionLevel ?? current.depression),
      level: Number(game.tier ?? current.level),
      exp: Number(game.commits_current ?? game.commitsCurrent ?? current.exp),
      streakDays: Number(game.streak_days ?? game.streakDays ?? current.streakDays),
      tierName: game.tierName || current.tierName || "",
      todayTaps: Number(payload?.today?.taps ?? current.todayTaps ?? 0),
      rank: newRank,
      rankName: newRankName,
      levelInRank: newLevelInRank,
      xpTotal: payload?.level?.xpTotal ?? payload?.level?.xp_total ?? current.xpTotal ?? 0,
      xpProgress:
        payload?.level?.progressInLevel ??
        payload?.level?.progress_in_level ??
        current.xpProgress ??
        0,
      xpRequiredForNext:
        payload?.level?.requiredForNextLevel ??
        payload?.level?.required_for_next_level ??
        current.xpRequiredForNext ??
        null,
      daily: payload?.daily ? normalizeQuestPayload(payload) : current.daily,
      loginReward: payload?.loginReward ?? current.loginReward ?? null,
      event: payload?.event ? mergeMinimalEvent(current.event, payload.event) : current.event,
      pass: payload?.pass ?? payload?.status ?? current.pass,
      team: payload?.team ?? current.team ?? null,
      teamBattle: payload?.teamBattle ?? payload?.team_battle ?? current.teamBattle ?? null,
      crunchTime: payload?.crunchTime ?? payload?.crunch_time ?? current.crunchTime ?? null,
      referralChain: payload?.referralChain ?? payload?.referral_chain ?? current.referralChain ?? null,
      achievements: payload?.achievements ?? current.achievements ?? [],
      skins: payload?.skins ?? current.skins ?? null,
      activeEffects: payload?.activeEffects ?? payload?.active_effects ?? current.activeEffects ?? {},
      generatorState: payload?.generatorState ?? payload?.generator_state ?? current.generatorState ?? null,
      randomEventState: payload?.randomEventState ?? payload?.random_event_state ?? current.randomEventState ?? null,
      dailyFarm: payload?.dailyFarm ?? payload?.daily_farm ?? current.dailyFarm ?? null,
      passiveLocRecovery: payload?.passiveLocRecovery ?? payload?.passive_loc_recovery ?? current.passiveLocRecovery ?? null,
      antiCheat: payload?.antiCheat ?? payload?.anti_cheat ?? current.antiCheat ?? null,
      activeLanguage: payload?.activeLanguage ?? payload?.active_language ?? current.activeLanguage ?? null,
      prestige: payload?.prestige
        ? {
            level: payload.prestige.level ?? 0,
            currency: payload.prestige.currency ?? 0,
            available: payload.prestige.available ?? false,
            requiredXp: payload.prestige.requiredXp ?? 3100,
            shopPurchases: payload.prestige.shopPurchases ?? [],
            bonuses: payload.prestige.bonuses ?? {},
            lifetimeLoc: payload.prestige.lifetimeLoc ?? 0,
            prestigeCount: payload.prestige.prestigeCount ?? 0,
            muCurrency: payload.prestige.muCurrency ?? 0,
            muAvailable: payload.prestige.muAvailable ?? false,
          }
        : current.prestige,
      featureFlags: payload?.featureFlags ?? payload?.feature_flags ?? current.featureFlags ?? {},
      stressCohort: payload?.stressCohort ?? payload?.stress_cohort ?? current.stressCohort ?? "control",
      contextOffer: hasContextOffer ? payload.contextOffer : current.contextOffer,
      isBurnout:
        payload?.isBurnout ??
        payload?.is_burnout ??
        game.is_burnout ??
        game.isBurnout ??
        current.isBurnout ??
        false,
      burnoutAffliction:
        payload?.burnoutAffliction ??
        payload?.burnout_affliction ??
        game.burnout_affliction ??
        game.burnoutAffliction ??
        current.burnoutAffliction ??
        false,
      forcedBreakUntil:
        payload?.forcedBreakUntil ??
        payload?.forced_break_until ??
        game.forced_break_until ??
        game.forcedBreakUntil ??
        current.forcedBreakUntil ??
        null,
      isCrit: payload?.isCrit ?? current.isCrit ?? false,
      critTier: Object.prototype.hasOwnProperty.call(payload || {}, "critTier")
        ? payload.critTier
        : current.critTier,
      inventory,
      coffeeCups: Number(inventory.coffee_cups ?? inventory.coffeeCups ?? current.coffeeCups ?? 0),
      showOnboarding: onboardingCompleted === false,
      lastTapDelta: payload?.delta
        ? {
            commits: payload.delta.commits,
            energy: payload.delta.energy,
            depression: payload.delta.depression,
            xp: payload.xpDelta ?? null,
            isCrit: payload?.isCrit ?? false,
            critTier: payload?.critTier ?? null,
            isBurnout: payload?.isBurnout ?? false,
          }
        : current.lastTapDelta,
      levelUp: levelUp ?? null,
      memePrompt: levelUp
        ? { trigger: 'levelUp', rankName: newRankName }
        : current.memePrompt,
      sessionId,
      loading: false,
      syncing: false,
      error: null,
    }));
  }, []);

  const applyTapState = useCallback((payload) => {
    if (!payload) return;
    if (payload?.heartAttackReset) {
      showToast('💥 Heart Attack! Сессия сброшена, но прогресс карьеры сохранён.', 'error', 2800);
    }
    setState((current) => ({
      ...current,
      commits: Number(payload.totalCommits ?? current.commits),
      energy: Number(payload.energy ?? current.energy),
      depression: Number(payload.depression ?? current.depression),
      rankName: payload.rank ?? current.rankName,
      isBurnout: payload.isBurnout ?? current.isBurnout ?? false,
      isCrit: payload.isCrit ?? false,
      critTier: payload.critTier ?? null,
      lastTapDelta: {
        commits: Number(payload.commitsDelta ?? 0),
        energy: payload.commitsDelta > 0 ? -1 : 0,
        depression: null,
        xp: null,
        isCrit: payload.isCrit ?? false,
        critTier: payload.critTier ?? null,
        isBurnout: payload.isBurnout ?? false,
        achievementsEarned: payload.achievements_earned || [],
      },
      syncing: false,
      memePrompt: payload?.heartAttackReset
        ? { trigger: 'heartAttack', rankName: current.rankName }
        : current.memePrompt,
      error: null,
    }));
  }, [showToast]);

  const refreshQuests = useCallback(async () => {
    const payload = await apiRequest(`/api/quests?${timezoneQuery()}`, {
      initData: telegram?.initData,
    });
    const daily = normalizeQuestPayload(payload);
    setState((current) => ({ ...current, quests: daily?.quests || [], daily }));
    return payload;
  }, [telegram?.initData]);

  const refreshPass = useCallback(async () => {
    const payload = await apiRequest("/api/pass", { initData: telegram?.initData });
    setState((current) => ({ ...current, pass: payload }));
    return payload;
  }, [telegram?.initData]);

  const refreshStreak = useCallback(async () => {
    const payload = await apiRequest(`/api/streak?${timezoneQuery()}`, {
      initData: telegram?.initData,
    });
    setState((current) => ({
      ...current,
      streak: payload,
      streakDays: Number(payload?.currentStreak ?? current.streakDays),
    }));
    return payload;
  }, [telegram?.initData]);

  const refreshRewardedVideo = useCallback(async () => {
    const payload = await apiRequest(`/api/rewarded-video/status?${timezoneQuery()}`, {
      initData: telegram?.initData,
    });
    setState((current) => ({ ...current, rewardedVideo: payload }));
    return payload;
  }, [telegram?.initData]);

  const refreshTeamHackathon = useCallback(async () => {
    const payload = await apiRequest(`/api/team/hackathon?${timezoneQuery()}`, {
      initData: telegram?.initData,
    });
    setState((current) => ({ ...current, teamHackathon: payload }));
    return payload;
  }, [telegram?.initData]);

  const schedulePostTapRefresh = useCallback(() => {
    if (postTapRefreshTimerRef.current) {
      clearTimeout(postTapRefreshTimerRef.current);
    }
    postTapRefreshTimerRef.current = window.setTimeout(() => {
      postTapRefreshTimerRef.current = null;
      refreshQuests().catch(() => null);
      refreshTeamHackathon().catch(() => null);
    }, 2500);
  }, [refreshQuests, refreshTeamHackathon]);

  const refreshBattles = useCallback(async () => {
    if (fetchingBattlesRef.current) return null;
    fetchingBattlesRef.current = true;
    try {
      const payload = await apiRequest("/api/battle/active", { initData: telegram?.initData });
      setState((current) => ({
        ...current,
        battles: payload?.battles || [],
        battleHistory: payload?.history || [],
        battleUserId: payload?.userId ?? current.battleUserId,
      }));
      return payload;
    } finally {
      fetchingBattlesRef.current = false;
    }
  }, [telegram?.initData]);

  const refreshReferral = useCallback(async () => {
    const payload = await apiRequest("/api/referral/status", { initData: telegram?.initData });
    setState((current) => ({ ...current, referral: payload }));
    return payload;
  }, [telegram?.initData]);

  const refreshLiveEvent = useCallback(async () => {
    const payload = await apiRequest(`/api/events?${timezoneQuery()}`, {
      initData: telegram?.initData,
    });
    setState((current) => ({
      ...current,
      liveEvent: payload,
      careerStory: payload?.careerStory ?? current.careerStory,
      quests: payload?.bonusQuestAvailable ? current.quests : current.quests,
    }));
    return payload;
  }, [telegram?.initData]);

  const refreshWeeklySprint = useCallback(async () => {
    const payload = await apiRequest(`/api/quests/weekly?${timezoneQuery()}`, {
      initData: telegram?.initData,
    });
    setState((current) => ({ ...current, weeklySprint: payload }));
    return payload;
  }, [telegram?.initData]);

  const refreshDailyBattle = useCallback(async () => {
    try {
      const payload = await apiRequest('/api/daily-battle/current', { initData: telegram?.initData });
      setState((current) => ({ ...current, dailyBattle: payload }));
      return payload;
    } catch (_e) {
      return null;
    }
  }, [telegram?.initData]);

  const refreshGenerators = useCallback(async () => {
    if (fetchingGeneratorsRef.current) return null;
    fetchingGeneratorsRef.current = true;
    try {
      const payload = await apiRequest('/api/generators', { initData: telegram?.initData });
      setState((current) => ({
        ...current,
        commits: Number(payload?.commitsTotal ?? current.commits),
        exp: Number(payload?.commitsCurrent ?? current.exp),
        generatorState: payload?.generatorState ?? current.generatorState,
        passiveLocRecovery: payload?.passiveLocRecovery ?? current.passiveLocRecovery,
      }));
      if (payload?.passiveLocRecovery?.locEarned > 0) {
        showToast(`🤖 Генераторы принесли +${payload.passiveLocRecovery.locEarned} LOC`, 'success', 1800);
      }
      return payload;
    } finally {
      fetchingGeneratorsRef.current = false;
    }
  }, [showToast, telegram?.initData]);

  const loadState = useCallback(() => {
    if (loadStatePromiseRef.current) {
      return loadStatePromiseRef.current;
    }

    const promise = (async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
      const [
        statePayload,
        questsPayload,
        streakPayload,
        passPayload,
        rewardedPayload,
        hackathonPayload,
        battlesPayload,
        referralPayload,
        liveEventPayload,
        weeklySprintPayload,
        dailyBattlePayload,
      ] =
        await Promise.all([
          apiRequest("/api/state", { initData: telegram?.initData }),
          apiRequest(`/api/quests?${timezoneQuery()}`, { initData: telegram?.initData }),
          apiRequest(`/api/streak?${timezoneQuery()}`, { initData: telegram?.initData }),
          apiRequest("/api/pass", { initData: telegram?.initData }),
          apiRequest(`/api/rewarded-video/status?${timezoneQuery()}`, { initData: telegram?.initData }),
          apiRequest(`/api/team/hackathon?${timezoneQuery()}`, { initData: telegram?.initData }).catch(() => null),
          apiRequest("/api/battle/active", { initData: telegram?.initData }).catch(() => null),
          apiRequest("/api/referral/status", { initData: telegram?.initData }).catch(() => null),
          apiRequest(`/api/events?${timezoneQuery()}`, { initData: telegram?.initData }).catch(() => null),
          apiRequest(`/api/quests/weekly?${timezoneQuery()}`, { initData: telegram?.initData }).catch(() => null),
          apiRequest('/api/daily-battle/current', { initData: telegram?.initData }).catch(() => null),
        ]);

      applyServerState(statePayload);
      const daily = normalizeQuestPayload(questsPayload);
      setState((current) => ({
        ...current,
        quests: daily?.quests || [],
        daily,
        streak: streakPayload,
        streakDays: Number(streakPayload?.currentStreak ?? current.streakDays),
        pass: passPayload,
        rewardedVideo: rewardedPayload,
        teamHackathon: hackathonPayload,
        battles: battlesPayload?.battles || current.battles || [],
        battleHistory: battlesPayload?.history || current.battleHistory || [],
        battleUserId: battlesPayload?.userId ?? current.battleUserId,
        referral: referralPayload,
        liveEvent: liveEventPayload,
        careerStory: liveEventPayload?.careerStory ?? current.careerStory,
        weeklySprint: weeklySprintPayload,
        dailyBattle: dailyBattlePayload,
        loading: false,
        syncing: false,
        error: null,
      }));
      } catch (err) {
      setState((current) => ({
        ...current,
        loading: false,
        syncing: false,
        error:
          err.status === 401 || err.status === 403
            ? "Telegram авторизация не прошла"
            : "Сервер недоступен",
      }));
      }
    })();

    loadStatePromiseRef.current = promise;
    promise.finally(() => {
      if (loadStatePromiseRef.current === promise) {
        loadStatePromiseRef.current = null;
      }
    });

    return promise;
  }, [applyServerState, telegram?.initData]);

  const claimPassReward = useCallback(async (level, track = 'free') => {
    const payload = await apiRequest('/api/pass/claim', {
      method: 'POST',
      initData: telegram?.initData,
      body: { level, track },
    });
    await refreshPass().catch(() => null);
    await loadState().catch(() => null);
    return payload;
  }, [loadState, refreshPass, telegram?.initData]);

  const claimWeeklySprintTier = useCallback(async (tier) => {
    const payload = await apiRequest('/api/quests/weekly/claim', {
      method: 'POST',
      initData: telegram?.initData,
      body: withTimezoneBody({ tier }),
    });
    setState((current) => ({
      ...current,
      weeklySprint: current.weeklySprint
        ? {
            ...current.weeklySprint,
            tierClaimed: payload?.claimedTier ?? current.weeklySprint.tierClaimed,
            narrative: payload?.narrative ?? current.weeklySprint.narrative,
          }
        : current.weeklySprint,
    }));
    await loadState().catch(() => null);
    return payload;
  }, [loadState, telegram?.initData]);

  const setRandomEventState = useCallback((randomEventState) => {
    setState((current) => ({ ...current, randomEventState }));
  }, []);

  useEffect(() => {
    if (!telegram?.isLocalDev && (telegram?.isPending || (telegram?.tg && !telegram?.initData))) return;
    loadState();
  }, [loadState, telegram?.isLocalDev, telegram?.isPending, telegram?.tg, telegram?.initData]);

  // Сбрасываем loadStatePromise когда initData меняется (Telegram загрузился)
  useEffect(() => {
    loadStatePromiseRef.current = null;
  }, [telegram?.initData]);

  // Clean up any pending tap/refresh/toast timers if the provider ever unmounts.
  useEffect(() => {
    return () => {
      if (tapRetryTimerRef.current) {
        clearTimeout(tapRetryTimerRef.current);
        tapRetryTimerRef.current = null;
      }
      if (postTapRefreshTimerRef.current) {
        clearTimeout(postTapRefreshTimerRef.current);
        postTapRefreshTimerRef.current = null;
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    const getDelay = () => {
      const battles = stateRef.current.battles || [];
      if (battles.some((battle) => {
        const hoursLeft = (new Date(battle.expiresAt).getTime() - Date.now()) / 3600000;
        return battle.status === "active" && hoursLeft <= 1;
      })) {
        return 5 * 60 * 1000;
      }

      const elapsed = Date.now() - battlePollingStartedAtRef.current;
      if (elapsed < 5 * 60 * 1000) return 10 * 1000;
      if (elapsed < 30 * 60 * 1000) return 30 * 1000;
      return 2 * 60 * 1000;
    };

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await refreshBattles().catch(() => null);
        schedule();
      }, getDelay());
    };

    if ((state.battles || []).length > 0) {
      schedule();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshBattles, state.battles?.length]);

  useEffect(() => {
    if ((state.battles || []).length === 0) {
      battlePollingStartedAtRef.current = Date.now();
      return;
    }
    if (!battlePollingStartedAtRef.current) {
      battlePollingStartedAtRef.current = Date.now();
    }
  }, [state.battles?.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      refreshGenerators().catch(() => null);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshGenerators]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      refreshDailyBattle().catch(() => null);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshDailyBattle]);

  useEffect(() => {
    // Expose an immutable snapshot so Phaser cannot mutate React state directly.
    window.__GAME_STATE__ = JSON.parse(JSON.stringify(state));
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state.loginReward?.claimed) {
      const rewardText = state.loginReward.reward ? `+${state.loginReward.reward.energy || 0} энергии` : "";
      showToast(`День ${state.loginReward.streak} подряд! ${rewardText}`.trim(), "success", 3000);
    }
  }, [state.loginReward?.claimed, state.loginReward?.streak, showToast]);

  useEffect(() => {
    if (!state.achievements || state.achievements.length === 0) return;

    if (!previousAchievementsRef.current) {
      previousAchievementsRef.current = new Map(
        state.achievements.map((achievement) => [achievement.id, achievement.completed === true]),
      );
      return;
    }

    const previousAchievements = previousAchievementsRef.current;
    state.achievements.forEach((achievement) => {
      const wasCompleted = previousAchievements.get(achievement.id) === true;
      if (achievement.completed && !wasCompleted) {
        showToast(`🏆 Достижение: ${achievement.name || achievement.id}!`, "success", 4000);
      }
    });

    previousAchievementsRef.current = new Map(
      state.achievements.map((achievement) => [achievement.id, achievement.completed === true]),
    );
  }, [state.achievements, showToast]);

  const flushTapQueue = useCallback(async () => {
    if (processingTapRef.current) return;
    processingTapRef.current = true;
    let retryScheduled = false;

    try {
      const currentState = stateRef.current;
      if (currentState.energy <= 0) {
        pendingTapsRef.current = 0;
        setState((current) => ({ ...current, syncing: false }));
        return;
      }

      const tapCount = Math.min(20, pendingTapsRef.current, Math.max(1, Math.floor(currentState.energy || 1)));
      if (tapCount <= 0) {
        setState((current) => ({ ...current, syncing: false }));
        return;
      }
      pendingTapsRef.current -= tapCount;
      setState((current) => ({ ...current, syncing: true, error: null }));

      try {
        const payload = await apiRequest("/api/tap", {
          method: "POST",
          initData: telegram?.initData,
          body: { session_id: stateRef.current.sessionId, tapCount },
        });

        if (Object.prototype.hasOwnProperty.call(payload || {}, "commitsDelta")) {
          applyTapState(payload);
        } else {
          applyServerState(payload);
        }
        setState((current) => ({
          ...current,
          totalTaps: current.totalTaps + (payload?.commitsDelta > 0 ? tapCount : 0),
        }));
        tapRetryAttemptsRef.current = 0;
        schedulePostTapRefresh();
      } catch (err) {
        pendingTapsRef.current += tapCount;
        const rawRetryAfterSeconds = Number(err?.payload?.retryAfter);
        const isRateLimit = err.status === 429;
        // Only retry short server-side cool-downs (burst_limit). Long bans (anti-cheat,
        // soft-ban) outlast our retry window and would leave the queue stuck retrying
        // while the user sees no feedback. For those we drop the batch and surface a
        // clear recoverable message so the user can tap again after the real cooldown.
        const shortCooldown = !isRateLimit || !Number.isFinite(rawRetryAfterSeconds) || rawRetryAfterSeconds <= 10;
        const retryDelayMs = isRateLimit
          ? Math.max(1000, Math.min(10000, (Number.isFinite(rawRetryAfterSeconds) ? rawRetryAfterSeconds : 1) * 1000))
          : Math.min(5000, 750 * (2 ** tapRetryAttemptsRef.current));
        const retryable = isRateLimit || err.status >= 500 || err.status == null;
        const maxAttempts = isRateLimit ? 4 : 3;
        const nextAttempt = tapRetryAttemptsRef.current + 1;
        const retryMessage = isRateLimit
          ? "Слишком быстро. Повторяю сохранение..."
          : "Не удалось сохранить тап. Повторяю...";
        tapRetryAttemptsRef.current = nextAttempt;
        if (retryable && nextAttempt <= maxAttempts && shortCooldown && typeof window !== "undefined") {
          retryScheduled = true;
          if (nextAttempt === 1) {
            showToast(retryMessage, "warning", 1600);
          }
          if (tapRetryTimerRef.current) clearTimeout(tapRetryTimerRef.current);
          tapRetryTimerRef.current = window.setTimeout(() => {
            tapRetryTimerRef.current = null;
            flushTapQueue();
          }, retryDelayMs);
        } else {
          pendingTapsRef.current = 0;
          tapRetryAttemptsRef.current = 0;
          if (isRateLimit && Number.isFinite(rawRetryAfterSeconds) && rawRetryAfterSeconds > 10) {
            showToast(`Слишком быстро. Попробуй снова через ${rawRetryAfterSeconds} сек.`, "warning", 2500);
          } else {
            showToast("Не удалось сохранить тап", "error", 2000);
          }
        }
        setState((current) => ({
          ...current,
          syncing: false,
          error: null,
        }));
      }
    } finally {
      processingTapRef.current = false;
      if (pendingTapsRef.current === 0) {
        setState((current) => ({ ...current, syncing: false }));
      } else if (!retryScheduled) {
        window.setTimeout(() => flushTapQueue(), 0);
      }
    }
  }, [applyServerState, applyTapState, schedulePostTapRefresh, showToast, telegram?.initData]);

  const tap = useCallback(() => {
    const currentState = stateRef.current;
    if (currentState.energy <= 0) return;
    pendingTapsRef.current += 1;
    if (tapRetryTimerRef.current) return;
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

  const setBoostersOpen = useCallback((open) => {
    setState((current) => ({ ...current, boostersOpen: Boolean(open) }));
  }, []);

  const closeBoosters = useCallback(() => {
    setState((current) => ({ ...current, boostersOpen: false }));
  }, []);

  const mergeSkinState = useCallback((nextSkins) => {
    if (!nextSkins) return;
    setState((current) => ({
      ...current,
      skins: {
        ...current.skins,
        ...nextSkins,
        catalog: nextSkins.catalog ?? current.skins?.catalog ?? [],
        unlocked: nextSkins.unlocked ?? current.skins?.unlocked ?? [],
      },
    }));
  }, []);

  const claimQuests = useCallback(async (questId) => {
    const payload = await apiRequest("/api/quests/claim", {
      method: "POST",
      initData: telegram?.initData,
      body: withTimezoneBody(questId ? { questId } : {}),
    });
    const daily = normalizeQuestPayload(payload);
    setState((current) => ({
      ...current,
      quests: daily?.quests || current.quests,
      daily: daily || current.daily,
      pass: payload?.passUpdate ? current.pass : current.pass,
    }));
    await Promise.all([refreshPass(), loadState()]).catch(() => null);
    return payload;
  }, [loadState, refreshPass, telegram?.initData]);

  const claimFullClear = useCallback(async () => {
    const payload = await apiRequest("/api/quests/full-clear", {
      method: "POST",
      initData: telegram?.initData,
      body: withTimezoneBody(),
    });
    await Promise.all([refreshQuests(), refreshPass(), loadState()]).catch(() => null);
    return payload;
  }, [loadState, refreshPass, refreshQuests, telegram?.initData]);

  const claimStreak = useCallback(async () => {
    const payload = await apiRequest("/api/streak/claim", {
      method: "POST",
      initData: telegram?.initData,
      body: withTimezoneBody(),
    });
    setState((current) => ({
      ...current,
      streak: { ...current.streak, ...payload },
      streakDays: Number(payload?.currentStreak ?? current.streakDays),
    }));
    refreshPass().catch(() => null);
    window.setTimeout(() => {
      loadState().catch(() => null);
    }, 500);
    return payload;
  }, [loadState, refreshPass, telegram?.initData]);

  const recoverStreak = useCallback(async () => {
    const payload = await apiRequest("/api/streak/recover", {
      method: "POST",
      initData: telegram?.initData,
      body: withTimezoneBody(),
    });
    setState((current) => ({
      ...current,
      streak: { ...current.streak, ...payload },
      streakDays: Number(payload?.currentStreak ?? current.streakDays),
    }));
    await loadState().catch(() => null);
    return payload;
  }, [loadState, telegram?.initData]);

  const refreshAchievements = useCallback(async () => {
    const payload = await apiRequest("/api/achievements", {
      initData: telegram?.initData,
    });
    setState((current) => ({ ...current, achievements: payload?.achievements || [] }));
    return payload;
  }, [telegram?.initData]);

  const shareAchievement = useCallback(async (achievementId) => {
    const payload = await apiRequest(`/api/meme/achievement?achievementId=${encodeURIComponent(achievementId)}`, {
      initData: telegram?.initData,
    });
    return payload;
  }, [telegram?.initData]);

  const completeRewardedVideo = useCallback(async () => {
    const payload = await apiRequest("/api/rewarded-video/complete", {
      method: "POST",
      initData: telegram?.initData,
      body: withTimezoneBody(),
    });
    setState((current) => ({
      ...current,
      energy: Number(payload?.newEnergy ?? current.energy),
      rewardedVideo: {
        ...current.rewardedVideo,
        remainingToday: payload?.remainingToday ?? current.rewardedVideo?.remainingToday,
      },
    }));
    return payload;
  }, [telegram?.initData]);

  const buyGenerator = useCallback(async (tierId) => {
    const payload = await apiRequest('/api/generators/buy', {
      method: 'POST',
      initData: telegram?.initData,
      body: { tierId },
    });
    setState((current) => ({
      ...current,
      generatorState: payload?.generatorState ?? current.generatorState,
      exp: Number(payload?.progression?.commits_current ?? current.exp),
    }));
    await loadState().catch(() => null);
    return payload;
  }, [loadState, telegram?.initData]);

  const applyEventDeltas = useCallback((deltas) => {
    setState((current) => {
      const nextEnergy = Math.min(
        current.maxEnergy || 100,
        Math.max(0, (current.energy || 0) + (deltas.energyDelta || 0))
      );
      const nextDepression = Math.min(
        100,
        Math.max(0, (current.depression || 0) + (deltas.depressionDelta || 0))
      );
      const nextCommits = Math.max(0, (current.commits || 0) + (deltas.commitsDelta || 0));
      return {
        ...current,
        energy: nextEnergy,
        depression: nextDepression,
        commits: nextCommits,
      };
    });
  }, []);

  const value = useMemo(() => ({
    ...state,
    tap,
    applyEventDeltas,
    clearLevelUp,
    showToast,
    setShopOpen,
    closeShop,
    setBoostersOpen,
    closeBoosters,
    refreshQuests,
    claimQuests,
    claimDailyQuest: claimQuests,
    claimFullClear,
    refreshPass,
    claimPassReward,
    refreshStreak,
    claimStreak,
    recoverStreak,
    refreshAchievements,
    shareAchievement,
    refreshRewardedVideo,
    refreshTeamHackathon,
    refreshBattles,
    refreshReferral,
    refreshLiveEvent,
    refreshWeeklySprint,
    refreshGenerators,
    claimWeeklySprintTier,
    setRandomEventState,
    completeRewardedVideo,
    buyGenerator,
    acceptBattle: async (battleId) => {
      const payload = await apiRequest("/api/battle/accept", {
        method: "POST",
        initData: telegram?.initData,
        body: { battleId },
      });
      await refreshBattles().catch(() => null);
      return payload;
    },
    resolveBattle: async (battleId) => {
      const payload = await apiRequest("/api/battle/resolve", {
        method: "POST",
        initData: telegram?.initData,
        body: { battleId },
      });
      await Promise.all([refreshBattles(), loadState()]).catch(() => null);
      return payload;
    },
    challengeBattle: async (opponentId, stake) => {
      const payload = await apiRequest("/api/battle/challenge", {
        method: "POST",
        initData: telegram?.initData,
        body: { opponentId, stake },
      });
      await refreshBattles().catch(() => null);
      return payload;
    },
    dismissCareerBeat: async (beatId) => {
      const payload = await apiRequest("/api/events/career/dismiss", {
        method: "POST",
        initData: telegram?.initData,
        body: { beatId },
      });
      setState((current) => ({
        ...current,
        careerStory: payload?.careerStory ?? current.careerStory,
      }));
      return payload;
    },
    dismissContextOffer: async (offerType) => {
      if (!offerType) return;
      await apiRequest("/api/offers/dismiss", {
        method: "POST",
        initData: telegram?.initData,
        body: { offerType },
      });
      setState((current) => ({ ...current, contextOffer: null }));
    },
    drinkCoffee: async () => {
      try {
        const payload = await apiRequest("/api/coffee", {
          method: "POST",
          initData: telegram?.initData,
        });
        if (payload?.success) {
          showToast(`☕ Кофе восстановил ${payload.restored} энергии`, "success", 2000);
          await loadState();
        }
        return payload;
      } catch (err) {
        showToast(err?.message || "Кофе пока недоступен", "error", 2000);
        return null;
      }
    },
    completeOnboarding: async () => {
      const payload = await apiRequest("/api/onboarding/complete", {
        method: "POST",
        initData: telegram?.initData,
      });
      applyServerState(payload);
      setState((current) => ({ ...current, showOnboarding: false }));
      return payload;
    },
    skipOnboarding: async () => {
      console.log("onboarding_skipped");
      const payload = await apiRequest("/api/onboarding/skip", {
        method: "POST",
        initData: telegram?.initData,
      });
      applyServerState(payload);
      setState((current) => ({ ...current, showOnboarding: false }));
      return payload;
    },
    equipSkin: async (skinId) => {
      if (equippingSkinRef.current) return stateRef.current.skins ?? null;
      equippingSkinRef.current = true;
      try {
        const payload = await apiRequest("/api/skins/equip", {
          method: "POST",
          initData: telegram?.initData,
          body: { skinId },
        });
        mergeSkinState(payload?.skins);
        showToast("Скин экипирован", "success", 1500);
        return payload?.skins ?? null;
      } catch (err) {
        showToast(err?.message || "Не удалось экипировать скин", "error", 2000);
        return null;
      } finally {
        equippingSkinRef.current = false;
      }
    },
    setMemePrompt: (prompt) => setState((current) => ({ ...current, memePrompt: prompt })),
    clearMemePrompt: () => setState((current) => ({ ...current, memePrompt: null })),
    refreshLanguages: async () => {
      const payload = await apiRequest("/api/languages/my", { initData: telegram?.initData });
      setState((current) => ({ ...current, activeLanguage: payload?.languages?.find((l) => l.is_active) || current.activeLanguage }));
      return payload;
    },
    equipLanguage: async (languageSlug) => {
      const payload = await apiRequest("/api/languages/equip", {
        method: "POST",
        initData: telegram?.initData,
        body: { languageSlug },
      });
      if (payload?.success) {
        setState((current) => ({
          ...current,
          activeLanguage: payload?.languages?.find((l) => l.is_active) || current.activeLanguage,
        }));
      }
      return payload;
    },
    reset: loadState,
  }), [
    state,
    tap,
    applyEventDeltas,
    clearLevelUp,
    showToast,
    setShopOpen,
    closeShop,
    setBoostersOpen,
    closeBoosters,
    refreshQuests,
    claimQuests,
    claimFullClear,
    refreshPass,
    claimPassReward,
    refreshStreak,
    claimStreak,
    recoverStreak,
    refreshAchievements,
    shareAchievement,
    refreshRewardedVideo,
    refreshTeamHackathon,
    refreshBattles,
    refreshReferral,
    refreshLiveEvent,
    refreshWeeklySprint,
    refreshGenerators,
    claimWeeklySprintTier,
    setRandomEventState,
    completeRewardedVideo,
    buyGenerator,
    refreshDailyBattle,
    loadState,
    telegram?.initData,
  ]);

  return h(GameContext.Provider, { value }, children);
}

export function useGameState() {
  return useContext(GameContext);
}
