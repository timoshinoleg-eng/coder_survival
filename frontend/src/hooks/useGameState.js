import { h, createContext } from "preact";
import { useCallback, useContext, useEffect, useRef, useState } from "preact/hooks";
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
  featureFlags: {},
  stressCohort: "control",
  contextOffer: null,
  isBurnout: false,
  isCrit: false,
  critTier: null,
  inventory: {},
  showOnboarding: false,
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
  }, [showToast]);

  const applyServerState = useCallback((payload) => {
    const game = payload?.game || payload?.state || payload?.progression;
    if (!game) return;

    const sessionId = payload?.activeSession?.sessionId || stateRef.current.sessionId || null;
    const onboardingCompleted =
      game.onboarding_completed ??
      game.onboardingCompleted ??
      payload?.onboarding_completed ??
      payload?.onboardingCompleted ??
      true;
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
      levelUp: levelUp ?? current.levelUp,
      sessionId,
      loading: false,
      syncing: false,
      error: null,
    }));
  }, []);

  const applyTapState = useCallback((payload) => {
    if (!payload) return;
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
      },
      syncing: false,
      error: null,
    }));
  }, []);

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

  const refreshBattles = useCallback(async () => {
    const payload = await apiRequest("/api/battle/active", { initData: telegram?.initData });
    setState((current) => ({
      ...current,
      battles: payload?.battles || [],
      battleHistory: payload?.history || [],
      battleUserId: payload?.userId ?? current.battleUserId,
    }));
    return payload;
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

  const loadState = useCallback(async () => {
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
  }, [applyServerState, telegram?.initData]);

  useEffect(() => {
    loadState();
  }, [loadState]);

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
      if ((stateRef.current.battles || []).length > 0) return;
      refreshBattles().catch(() => null);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshBattles]);

  useEffect(() => {
    window.__GAME_STATE__ = state;
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
          const payload = await apiRequest("/api/tap", {
            method: "POST",
            initData: telegram?.initData,
            body: { session_id: stateRef.current.sessionId },
          });

          if (Object.prototype.hasOwnProperty.call(payload || {}, "commitsDelta")) {
            applyTapState(payload);
          } else {
            applyServerState(payload);
          }
          setState((current) => ({
            ...current,
            totalTaps: current.totalTaps + (payload?.commitsDelta > 0 ? 1 : 0),
          }));
          refreshQuests().catch(() => null);
          refreshTeamHackathon().catch(() => null);
        } catch (err) {
          pendingTapsRef.current = 0;
          setState((current) => ({
            ...current,
            syncing: false,
            error: err.status === 429 ? "Слишком быстро. Подожди секунду." : "Не удалось сохранить тап",
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
  }, [applyServerState, applyTapState, refreshQuests, refreshTeamHackathon, telegram?.initData]);

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
    await Promise.all([refreshPass(), loadState()]).catch(() => null);
    return payload;
  }, [loadState, refreshPass, telegram?.initData]);

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

  const value = {
    ...state,
    tap,
    clearLevelUp,
    showToast,
    setShopOpen,
    closeShop,
    refreshQuests,
    claimQuests,
    claimDailyQuest: claimQuests,
    claimFullClear,
    refreshPass,
    refreshStreak,
    claimStreak,
    refreshRewardedVideo,
    refreshTeamHackathon,
    refreshBattles,
    refreshReferral,
    refreshLiveEvent,
    completeRewardedVideo,
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
      localStorage.setItem("cs_onboarding_completed", "1");
      return payload;
    },
    skipOnboarding: () => {
      console.log("onboarding_skipped");
      localStorage.setItem("cs_onboarding_skipped", String(Date.now()));
      setState((current) => ({ ...current, showOnboarding: true }));
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
    reset: loadState,
  };

  return h(GameContext.Provider, { value }, children);
}

export function useGameState() {
  return useContext(GameContext);
}
