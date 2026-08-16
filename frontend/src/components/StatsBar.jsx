import { h } from "preact";
import { useEffect, useMemo, useState, useCallback } from "preact/hooks";
import { useGameState } from "../hooks/useGameState.js";
import { useTelegram } from "../hooks/useTelegram.js";
import { adsManager } from "../utils/AdsManager.js";
import LeaderboardPanel from "./LeaderboardPanel.jsx";
import ShopPanel from "./ShopPanel.jsx";
import BoostersPanel from "./BoostersPanel.jsx";
import ReferralPanel from "./ReferralPanel.jsx";
import DailyQuests from "./DailyQuests.jsx";
import DailyBattlePanel from "./DailyBattlePanel.jsx";
import EventPanel from "./EventPanel.jsx";
import SprintPassPanel from "./SprintPassPanel.jsx";
import TeamPanel from "./TeamPanel.jsx";
import TeamBattle from "./TeamBattle.jsx";
import MemeGenerator from "./MemeGenerator.jsx";
import SkinPanel from "./SkinPanel.jsx";
import MiniGameLauncher from "./MiniGameLauncher.jsx";
import AudioSettings from "./AudioSettings.jsx";
import AchievementsPanel from "./AchievementsPanel.jsx";
import DailySummaryPanel from "./DailySummaryPanel.jsx";
import GeneratorsPanel from './GeneratorsPanel.jsx';
import AppealPanel from './AppealPanel.jsx';
import AchievementToast from './AchievementToast.jsx';
import { useAchievements } from '../hooks/useAchievements.js';
import RankBadge from './RankBadge.jsx';
import CareerModal from './CareerModal.jsx';
import BurnoutMeter from './BurnoutMeter.jsx';
import LanguageSelector from './LanguageSelector.jsx';

export default function StatsBar({ runtimeNow }) {
  const gameState = useGameState();
  const {
    commits,
    energy,
    maxEnergy,
    recoveryIntervalSeconds,
    recoveryEtaSeconds,
    depression,
    streakDays,
    todayTaps,
    daily,
    error: gameError,
    rankName,
    levelInRank,
    xpProgress,
    xpRequiredForNext,
    progressionUpdatedAt,
    serverClockOffsetMs,
    toast,
    shopOpen,
    setShopOpen,
    closeShop,
    boostersOpen,
    setBoostersOpen,
    closeBoosters,
    featureFlags,
    user,
    drinkCoffee,
    achievements,
    generatorState,
    randomEventState,
    dailyFarm,
    antiCheat,
    passiveLocRecovery,
    dailyBattle,
    activeLanguage,
    inventory,
  } = gameState;

  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [battleOpen, setBattleOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [memeOpen, setMemeOpen] = useState(false);
  const [skinOpen, setSkinOpen] = useState(false);
  const [miniGameOpen, setMiniGameOpen] = useState(false);
  const [teamBattleOpen, setTeamBattleOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false);
  const [generatorsOpen, setGeneratorsOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [careerOpen, setCareerOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [adLoading, setAdLoading] = useState(false);

  // Telegram BackButton: closing the topmost modal instead of exiting the app.
  // Last entry wins (reverse iteration). Shop/boosters use their closers.
  const modalControllers = [
    [leaderboardOpen, () => setLeaderboardOpen(false)],
    [referralOpen, () => setReferralOpen(false)],
    [questsOpen, () => setQuestsOpen(false)],
    [battleOpen, () => setBattleOpen(false)],
    [eventOpen, () => setEventOpen(false)],
    [passOpen, () => setPassOpen(false)],
    [teamOpen, () => setTeamOpen(false)],
    [memeOpen, () => setMemeOpen(false)],
    [skinOpen, () => setSkinOpen(false)],
    [miniGameOpen, () => setMiniGameOpen(false)],
    [teamBattleOpen, () => setTeamBattleOpen(false)],
    [achievementsOpen, () => setAchievementsOpen(false)],
    [dailySummaryOpen, () => setDailySummaryOpen(false)],
    [generatorsOpen, () => setGeneratorsOpen(false)],
    [appealOpen, () => setAppealOpen(false)],
    [careerOpen, () => setCareerOpen(false)],
    [languageOpen, () => setLanguageOpen(false)],
    [shopOpen, () => (typeof closeShop === 'function' ? closeShop() : setShopOpen(false))],
    [boostersOpen, () => (typeof closeBoosters === 'function' ? closeBoosters() : setBoostersOpen(false))],
  ];
  const anyModalOpen = modalControllers.some(([open]) => open);

  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton;
    if (!backButton?.onClick || !backButton?.offClick) return undefined;
    const handleBack = () => {
      for (let i = modalControllers.length - 1; i >= 0; i -= 1) {
        if (modalControllers[i][0]) {
          modalControllers[i][1]();
          haptic?.('light');
          return;
        }
      }
    };
    backButton.onClick(handleBack);
    if (anyModalOpen) {
      backButton.show?.();
    } else {
      backButton.hide?.();
    }
    return () => backButton.offClick(handleBack);
  });
  const { initData, haptic } = useTelegram();
  const {
    achievements: newAchievements,
    unreadCount,
    toastQueue,
    dismissToast,
    fetchMyAchievements,
    markRead,
  } = useAchievements(initData);

  const countdownNowMs = runtimeNow || Date.now();

  const unseenAchievementsCount = unreadCount;

  const energyPercent =
    maxEnergy > 0 ? Math.round((energy / maxEnergy) * 100) : 0;
  const energyColor =
    energyPercent > 50 ? "var(--accent-green)" : energyPercent > 20 ? "var(--accent-gold)" : "var(--danger)";
  const depressionColor =
    depression < 50 ? "var(--accent-green)" : depression < 100 ? "var(--accent-gold)" : depression < 150 ? "var(--accent-orange)" : "var(--danger)";
  const isLowEnergy = energyPercent <= 20;
  const isHighStress = depression >= 150;

  const displayLevel = levelInRank || 1;

  const levelProgress = useMemo(
    () =>
      xpRequiredForNext && xpRequiredForNext > 0
        ? Math.min(100, Math.round((xpProgress / xpRequiredForNext) * 100))
        : 100,
    [xpProgress, xpRequiredForNext],
  );

  const energyCountdownLabel = useMemo(() => {
    const productionAlertActive = randomEventState?.productionAlertUntil && new Date(randomEventState.productionAlertUntil).getTime() > countdownNowMs;
    if (productionAlertActive) {
      const secondsLeft = Math.max(0, Math.ceil((new Date(randomEventState.productionAlertUntil).getTime() - countdownNowMs) / 1000));
      return `Production Alert: -8 энергии/мин ещё ${secondsLeft}с`;
    }

    if (energy >= maxEnergy) {
      return "Энергия полна";
    }

    if (Number.isFinite(Number(recoveryEtaSeconds))) {
      const eta = Math.max(0, Number(recoveryEtaSeconds));
      const minutes = Math.floor(eta / 60);
      const seconds = eta % 60;
      const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      return `+1 энергия через ${formatted}, если не тапать`;
    }

    const baselineMs = progressionUpdatedAt
      ? new Date(progressionUpdatedAt).getTime()
      : NaN;
    const intervalSeconds = Number(recoveryIntervalSeconds || 60);
    if (Number.isNaN(baselineMs) || intervalSeconds <= 0) {
      return `+1 эн / ${intervalSeconds || 60} сек простоя`;
    }

    const serverNowMs = countdownNowMs + Number(serverClockOffsetMs || 0);
    const elapsedMs = Math.max(0, serverNowMs - baselineMs);
    const intervalMs = intervalSeconds * 1000;
    const elapsedRemainderMs = elapsedMs % intervalMs;
    const remainingMs =
      elapsedMs > 0 && elapsedRemainderMs === 0
        ? 0
        : Math.max(0, intervalMs - elapsedRemainderMs);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    return `+1 энергия через ${formatted}, если не тапать`;
  }, [
    countdownNowMs,
    energy,
    maxEnergy,
    progressionUpdatedAt,
    recoveryEtaSeconds,
    recoveryIntervalSeconds,
    randomEventState?.productionAlertUntil,
    serverClockOffsetMs,
  ]);

  const runtimeModeLabel = useMemo(() => {
    const hotStreakActive = randomEventState?.hotStreakUntil && new Date(randomEventState.hotStreakUntil).getTime() > countdownNowMs;
    const productionAlertActive = randomEventState?.productionAlertUntil && new Date(randomEventState.productionAlertUntil).getTime() > countdownNowMs;
    if (hotStreakActive) return { text: '🔥 Hot Streak active: повышенный темп', color: 'var(--accent-green)' };
    if (productionAlertActive) return { text: '🚨 Production Alert active: энергия убывает', color: 'var(--danger-light)' };
    return null;
  }, [countdownNowMs, randomEventState?.hotStreakUntil, randomEventState?.productionAlertUntil]);

  const hotStreakActive = randomEventState?.hotStreakUntil && new Date(randomEventState.hotStreakUntil).getTime() > countdownNowMs;
  const productionAlertActive = randomEventState?.productionAlertUntil && new Date(randomEventState.productionAlertUntil).getTime() > countdownNowMs;
  const miniGamesEnabled = featureFlags?.minigameEnabled !== false;

  const handleWatchAd = useCallback(async () => {
    if (adLoading || energy >= maxEnergy) return;
    setAdLoading(true);
    try {
      const session = await adsManager.requestSession(initData);
      await adsManager.showRewardedAd(initData, session.nonce);
      await adsManager.claimReward(initData, session.nonce);
      window.location.reload();
    } catch (err) {
      console.error("Ad reward failed:", err);
    } finally {
      setAdLoading(false);
    }
  }, [adLoading, energy, maxEnergy, initData]);

  return h(
    "div",
    {
      className: "pixel-panel",
      style: {
        position: "relative",
        zIndex: 10,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        fontSize: "var(--text-base)",
        color: "#e0e0e0",
        userSelect: "none",
        fontFamily: "var(--font-pixel)",
      },
    },
    [
      // Top row: tier badge + commits + action buttons
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          },
        },
        [
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            [
              user?.photoUrl &&
                h("img", {
                  src: user.photoUrl,
                  alt: "",
                  style: {
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.2)",
                    objectFit: "cover",
                  },
                }),
              h(RankBadge, { onClick: () => setCareerOpen(true) }),
              streakDays > 0 &&
                h(
                  "span",
                  {
                    style: {
                      fontSize: "var(--text-md)",
                      display: "flex",
                      alignItems: "center",
                      gap: "2px",
                    },
                  },
                  [
                    "🔥",
                    h(
                      "span",
                      { style: { color: "var(--accent-gold)", fontWeight: "bold" } },
                      streakDays,
                    ),
                  ],
                ),
              Number(inventory?.coffee_coins || 0) > 0 &&
                h(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      color: "#fde68a",
                      fontWeight: "bold",
                      border: "1px solid #8a6a10",
                      padding: "2px 6px",
                      borderRadius: "6px",
                      background: "#2d2a1a",
                    },
                    title: "Coffee Coins: earned from incidents, quests and rewarded ads",
                  },
                  `☕${Number(inventory.coffee_coins || 0)}`
                ),
              gameState?.prestige?.muCurrency > 0 &&
                h(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      color: "var(--accent-purple)",
                      fontWeight: "bold",
                      border: "1px solid #5b21b6",
                      padding: "2px 6px",
                      borderRadius: "6px",
                      background: "#1e1b4b",
                    },
                    title: `\u03bc currency: ${gameState.prestige.muCurrency}`,
                  },
                  `\u03bc${gameState.prestige.muCurrency}`
                ),
              antiCheat?.banScore >= 20 &&
                h(
                  "span",
                  {
                    style: {
                      fontSize: "var(--text-sm)",
                      color: antiCheat.banScore >= 50 ? "#fda4af" : "#fde68a",
                      border: `1px solid ${antiCheat.banScore >= 50 ? 'var(--danger)' : 'var(--warning)'}`,
                      padding: "3px 6px",
                      background: antiCheat.banScore >= 50 ? "#3f1a1a" : "#3b2f10",
                    },
                    title: antiCheat.appealAvailable
                      ? `Anti-cheat: ${antiCheat.sanctionTier}. Appeal: ${antiCheat.appealLocation}`
                      : `Anti-cheat: ${antiCheat.sanctionTier}`,
                  },
                  antiCheat.appealAvailable ? `⚠ ${antiCheat.banScore}` : `! ${antiCheat.banScore}`,
                ),
            ],
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            [
              h("div", { style: { textAlign: "right" } }, [
                h(
                  "div",
                  {
                  style: {
                    fontWeight: "bold",
                    color: hotStreakActive ? "var(--accent-gold)" : "var(--accent-green)",
                    fontSize: "var(--text-md)",
                  },
                },
                `${commits}`,
              ),
              hotStreakActive && h(
                "div",
                { style: { fontSize: "var(--text-sm)", color: "var(--accent-gold)" } },
                'Hot Streak',
              ),
                h(
                  "div",
                  { style: { fontSize: "var(--text-sm)", color: "#8ba1bb" } },
                  "коммитов",
                ),
              ]),
              h("div", { style: { display: "flex", gap: "4px" } }, [
                h(
                  "button",
                  {
                    onClick: () => setQuestsOpen(true),
                    className: "pixel-button",
                    style: {
                      background: daily?.claimable ? "var(--bg-button-active)" : "var(--bg-button-hover)",
                      animation: daily?.claimable
                        ? "pulse 1.6s infinite"
                        : "none",
                      position: "relative",
                    },
                  },
                  daily?.claimable ? `📋 ${daily.claimable}` : "📋",
                ),
                h(
                  "button",
                  {
                    onClick: () => setShopOpen(true),
                    className: isLowEnergy ? "pixel-button pixel-button--danger" : "pixel-button",
                    style: {
                      background: isLowEnergy || isHighStress ? "var(--bg-button-active)" : "var(--bg-button-hover)",
                      animation: isLowEnergy ? "pulse 1.6s infinite" : "none",
                    },
                  },
                  "🛒",
                ),
                h(
                  "button",
                  {
                    onClick: () => setBoostersOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🚀",
                ),
                h(
                  "button",
                  {
                    onClick: () => setGeneratorsOpen(true),
                    className: "pixel-button",
                    style: {
                      background: generatorState?.passiveLocPerSecond > 0 ? "#163255" : "var(--bg-button-hover)",
                    },
                  },
                  "⚙",
                ),
                h(
                  "button",
                  {
                    onClick: () => setReferralOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🔗",
                ),
                h(
                  "button",
                  {
                    onClick: () => setBattleOpen(true),
                    className: "pixel-button",
                    style: {
                      background: dailyBattle?.active ? 'var(--bg-button-active)' : 'var(--bg-button-hover)',
                      position: 'relative',
                    },
                  },
                  [
                    "⚔️",
                    dailyBattle?.active && !dailyBattle?.myParticipation?.joined && h('span', {
                      key: 'battle-badge',
                      style: {
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: 'var(--danger)',
                        boxShadow: '0 0 6px rgba(239,68,68,0.8)',
                        animation: 'pulse 1.5s infinite',
                      }
                    }),
                  ]
                ),
                h(
                  "button",
                  {
                    onClick: () => setDailySummaryOpen(true),
                    className: "pixel-button",
                    title: "Ежедневная сводка",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "📊",
                ),
                h(
                  "button",
                  {
                    onClick: () => setEventOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "⚡",
                ),
                h(
                  "button",
                  {
                    onClick: () => setPassOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🎯",
                ),
                h(
                  "button",
                  {
                    onClick: () => setAchievementsOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                      position: "relative",
                    },
                  },
                  [
                    "🎖️",
                    unseenAchievementsCount > 0 && h('span', {
                      key: 'badge',
                      style: {
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        minWidth: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: 'var(--danger)',
                        color: '#fff',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px',
                      },
                    }, unseenAchievementsCount),
                  ]
                ),
                h(
                  "button",
                  {
                    onClick: () => setTeamOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "👥",
                ),
                h(
                  "button",
                  {
                    onClick: () => setTeamBattleOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🛡️",
                ),
                h(
                  "button",
                  {
                    onClick: () => setLeaderboardOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🏆",
                ),
                h(
                  "button",
                  {
                    onClick: () => { haptic('light'); setMemeOpen(true); },
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🎨",
                ),
                h(
                  "button",
                  {
                    onClick: () => setSkinOpen(true),
                    className: "pixel-button",
                    style: {
                      background: "var(--bg-button-hover)",
                    },
                  },
                  "🎭",
                ),
                miniGamesEnabled &&
                  h(
                    "button",
                    {
                      onClick: () => setMiniGameOpen(true),
                      className: "pixel-button",
                      title: "Мини-игры",
                      style: {
                        border: "1px solid #30527e",
                        background: depression >= 60 ? 'var(--bg-button-active)' : 'var(--bg-button-hover)',
                        color: '#dce9f9',
                        borderRadius: '8px',
                        padding: '5px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        animation: depression >= 60 ? 'pulse 1.6s infinite' : 'none'
                      }
                    },
                    '🎮'
                  ),
                antiCheat?.banScore >= 20 &&
                  h(
                    "button",
                    {
                      onClick: () => setAppealOpen(true),
                      className: "pixel-button",
                      style: {
                        background: antiCheat.appealAvailable ? "#3f1a1a" : "#3b2f10",
                        color: antiCheat.appealAvailable ? "#fda4af" : "#fde68a",
                      },
                    },
                    antiCheat.appealAvailable ? '📝' : '⚠️',
                  ),
                h(
                  "button",
                  {
                    onClick: () => setLanguageOpen(true),
                    className: "pixel-button",
                    style: {
                      background: activeLanguage ? "var(--bg-button-active)" : "var(--bg-button-hover)",
                      fontSize: "var(--text-md)",
                      position: "relative",
                    },
                    title: activeLanguage
                      ? `${activeLanguage.name} — ${activeLanguage.effectType}`
                      : "Языки программирования",
                  },
                  activeLanguage?.icon || "💻"
                ),
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      marginLeft: "2px",
                    },
                  },
                  h(AudioSettings),
                ),
              ]),
            ],
          ),
        ],
      ),

      // Level progress
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        [
          h(
            "span",
            { style: { minWidth: "50px", fontSize: "11px", color: "#8ba1bb" } },
            `Уровень ${displayLevel}`,
          ),
          h(
            "div",
            {
              style: {
                flex: 1,
                height: "6px",
                background: "var(--bg-button)",
                borderRadius: "0",
                overflow: "hidden",
              },
            },
            h("div", {
              style: {
                width: `${levelProgress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                transition: "width 0.4s ease",
              },
            }),
          ),
          h(
            "span",
            {
              style: {
                minWidth: "36px",
                textAlign: "right",
                fontSize: "11px",
                color: "#8ba1bb",
              },
            },
            `${levelProgress}%`,
          ),
        ],
      ),

      generatorState && h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            fontSize: "11px",
            color: "#8ba1bb",
            borderTop: "1px solid #17304f",
            paddingTop: "6px",
          },
        },
        [
          h("span", { style: { color: "var(--accent-blue)" } }, `⚙ ${generatorState.passiveLocPerSecond || 0} LOC/сек`),
          h("span", null, `FTUE: ${generatorState.ftueAcceleration?.id || 'after_60min'}`),
          dailyFarm?.avgDailyFarm ? h("span", { style: { color: "#8ba1bb" } }, `Ø ${dailyFarm.avgDailyFarm}/день`) : null,
          passiveLocRecovery?.locEarned
            ? h("span", { style: { color: "var(--accent-green)" } }, `+${passiveLocRecovery.locEarned} offline`)
            : null,
        ],
      ),

      runtimeModeLabel && h(
        "div",
        {
          style: {
            fontSize: "11px",
            color: runtimeModeLabel.color,
            borderTop: "1px solid #17304f",
            paddingTop: "6px",
          },
        },
        runtimeModeLabel.text,
      ),

      dailyBattle?.active && !dailyBattle?.myParticipation?.joined && h(
        "div",
        {
          style: {
            fontSize: "11px",
            color: "var(--accent-gold)",
            borderTop: "1px solid #17304f",
            paddingTop: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
          },
          onClick: () => setBattleOpen(true),
        },
        [
          h("span", null, "🎫"),
          h("span", null, `Daily Deploy активен: ${dailyBattle.battle.bugEmoji} ${dailyBattle.battle.bugName} (${dailyBattle.battle.severity})`),
        ]
      ),

      // Energy bar
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        [
          h(
            "span",
            {
              style: {
                minWidth: "50px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              },
            },
            ["⚡", "Энергия"],
          ),
          h(
            "div",
            {
              style: {
                flex: 1,
                height: "8px",
                background: "var(--bg-button)",
                borderRadius: "0",
                overflow: "hidden",
              },
            },
            h("div", {
              style: {
                width: `${energyPercent}%`,
                height: "100%",
                background: productionAlertActive ? 'var(--danger-light)' : energyColor,
                transition: "width 0.25s ease, background 0.3s ease",
                boxShadow: isLowEnergy
                  ? "0 0 10px rgba(239,68,68,0.55)"
                  : "none",
              },
            }),
          ),
          h(
            "span",
            {
              style: {
                minWidth: "46px",
                textAlign: "right",
                fontWeight: "bold",
                color: energyColor,
                fontSize: "11px",
              },
            },
            `${Math.round(energy)}/${maxEnergy}`,
          ),
        ],
      ),

      // Burnout Meter
      h(BurnoutMeter, { runtimeNow }),

      // Warnings
      (isLowEnergy || isHighStress) &&
        h(
          "div",
          {
            style: {
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
            },
          },
          [
            isLowEnergy &&
              h(
                "span",
                {
                  style: {
                    fontSize: "var(--text-sm)",
                    color: "var(--danger)",
                    fontWeight: 700,
                    animation: "pulse 1.2s infinite",
                  },
                },
                "⚠️ Энергия на исходе!",
              ),
            isHighStress &&
              h(
                "span",
                {
                  style: {
                    fontSize: "var(--text-sm)",
                    color: "var(--danger)",
                    fontWeight: 700,
                    animation: "pulse 1.2s infinite",
                  },
                },
                "⚠️ Высокий стресс — эффективность снижена",
              ),
          ],
        ),

      // Recovery + today taps + ad button
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "10px",
            color: "#6b7f99",
            marginTop: "2px",
          },
        },
        [
          h("span", null, energyCountdownLabel),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            [
              todayTaps > 0 && h("span", null, `Сегодня тапов: ${todayTaps}`),
              adsManager.isAvailable() &&
                energy < maxEnergy &&
                h(
                  "button",
                  {
                    onClick: handleWatchAd,
                    disabled: adLoading,
                    style: {
                      fontSize: "var(--text-sm)",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      border: "1px solid #30527e",
                      background: adLoading ? "var(--bg-button-active)" : "var(--bg-button)",
                      color: "var(--accent-blue)",
                      cursor: adLoading ? "wait" : "pointer",
                      opacity: adLoading ? 0.7 : 1,
                    },
                  },
                  adLoading ? "Загрузка..." : "▶️ +50% энергии",
                ),
              energy < maxEnergy &&
                h(
                  "button",
                  {
                    onClick: drinkCoffee,
                    style: {
                      fontSize: "var(--text-sm)",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      border: "1px solid #5a3e2d",
                      background: "#2d2a1a",
                      color: "var(--accent-gold)",
                      cursor: "pointer",
                    },
                  },
                  "☕ Кофе",
                ),
            ],
          ),
        ],
      ),

      // Error banner
      gameError &&
        h(
          "div",
          {
            style: {
              marginTop: "4px",
              padding: "6px 10px",
              borderRadius: "6px",
              background: "#3f1a1a",
              color: "var(--danger)",
              fontSize: "11px",
              fontWeight: 600,
              border: "1px solid #5a2d2d",
              textAlign: "center",
            },
          },
          gameError,
        ),

      // Toast (Stage 3)
      toast &&
        toast.visible &&
        h(
          "div",
          {
            className: "pixel-toast pixel-fade-in",
            style: {
              marginTop: "4px",
              padding: "8px 12px",
              fontSize: "10px",
              fontWeight: 600,
              textAlign: "center",
              ...(toast.type === "success"
                ? {
                    background: "linear-gradient(90deg, #1a3f25, #2d5a3e)",
                    color: "var(--accent-green)",
                  }
                : toast.type === "error"
                  ? {
                      background: "linear-gradient(90deg, #3f1a1a, #5a2d2d)",
                      color: "#fca5a5",
                    }
                  : {
                      background: "linear-gradient(90deg, #1a3a5c, #274267)",
                      color: "#c7ddf5",
                    }),
            },
          },
          toast.message,
        ),

      h(LeaderboardPanel, {
        open: leaderboardOpen,
        onClose: () => setLeaderboardOpen(false),
      }),
      h(DailyQuests, {
        modal: true,
        open: questsOpen,
        onClose: () => setQuestsOpen(false),
      }),
      h(ShopPanel),
      h(BoostersPanel),
      h(ReferralPanel, {
        open: referralOpen,
        onClose: () => setReferralOpen(false),
      }),
      h(DailyBattlePanel, {
        open: battleOpen,
        onClose: () => setBattleOpen(false),
      }),
      h(EventPanel, {
        open: eventOpen,
        onClose: () => setEventOpen(false),
      }),
      h(SprintPassPanel, {
        open: passOpen,
        onClose: () => setPassOpen(false),
      }),
      h(TeamPanel, {
        open: teamOpen,
        onClose: () => setTeamOpen(false),
      }),
      h(TeamBattle, {
        open: teamBattleOpen,
        onClose: () => setTeamBattleOpen(false),
      }),
      h(MemeGenerator, {
        open: memeOpen,
        onClose: () => setMemeOpen(false),
      }),
      h(SkinPanel, {
        open: skinOpen,
        onClose: () => setSkinOpen(false),
      }),
      h(AchievementsPanel, {
        open: achievementsOpen,
        onClose: () => {
          setAchievementsOpen(false);
          // Mark earned achievements as read when closing panel
          const earnedSlugs = newAchievements
            .filter((a) => a.earned_at && !a.notification_sent)
            .map((a) => a.slug);
          if (earnedSlugs.length > 0) {
            markRead(earnedSlugs);
          }
        },
      }),
      h(GeneratorsPanel, {
        open: generatorsOpen,
        onClose: () => setGeneratorsOpen(false),
      }),
      h(AppealPanel, {
        open: appealOpen,
        onClose: () => setAppealOpen(false),
      }),
      h(DailySummaryPanel, {
        open: dailySummaryOpen,
        onClose: () => setDailySummaryOpen(false),
      }),
      h(CareerModal, {
        open: careerOpen,
        onClose: () => setCareerOpen(false),
      }),
      miniGamesEnabled &&
        h(MiniGameLauncher, {
          open: miniGameOpen,
          onClose: () => setMiniGameOpen(false),
        }),
      h(LanguageSelector, {
        open: languageOpen,
        onClose: () => setLanguageOpen(false),
      }),

      // Achievement toasts
      toastQueue.map((slug, index) => {
        const ach = newAchievements.find((a) => a.slug === slug);
        if (!ach) return null;
        return h(AchievementToast, {
          key: `${slug}-${index}`,
          slug: ach.slug,
          name: ach.name,
          rarity: ach.rarity,
          reward: ach.reward,
          onDismiss: () => dismissToast(),
        });
      }),
  ],
  );
}
