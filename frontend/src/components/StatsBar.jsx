import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import LeaderboardPanel from './LeaderboardPanel.jsx';
import ShopPanel from './ShopPanel.jsx';
import ReferralPanel from './ReferralPanel.jsx';
import DailyQuestsPanel from './DailyQuestsPanel.jsx';
import DailyBattlePanel from './DailyBattlePanel.jsx';
import EventPanel from './EventPanel.jsx';
import SprintPassPanel from './SprintPassPanel.jsx';
import TeamPanel from './TeamPanel.jsx';
import AudioSettings from './AudioSettings.jsx';

export default function StatsBar() {
  const {
    commits, energy, maxEnergy, recoveryIntervalSeconds, depression,
    streakDays, todayTaps, daily, error: gameError,
    rankName, levelInRank, xpProgress, xpRequiredForNext,
    progressionUpdatedAt, serverClockOffsetMs,
    toast, shopOpen, setShopOpen, closeShop
  } = useGameState();

  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [battleOpen, setBattleOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());

  const energyPercent = maxEnergy > 0 ? Math.round((energy / maxEnergy) * 100) : 0;
  const energyColor = energyPercent > 50 ? '#4ade80' : energyPercent > 20 ? '#facc15' : '#ef4444';
  const depressionColor = depression < 30 ? '#4ade80' : depression < 70 ? '#facc15' : '#ef4444';
  const isLowEnergy = energyPercent <= 20;
  const isHighStress = depression >= 70;

  const displayRank = rankName || 'Junior';
  const displayLevel = levelInRank || 1;

  useEffect(() => {
    const updateNow = () => setCountdownNowMs(Date.now());
    updateNow();

    const intervalId = window.setInterval(updateNow, 1000);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const levelProgress = useMemo(() => (
    xpRequiredForNext && xpRequiredForNext > 0
      ? Math.min(100, Math.round((xpProgress / xpRequiredForNext) * 100))
      : 100
  ), [xpProgress, xpRequiredForNext]);

  const rankBadgeGradient = useMemo(() => {
    const map = {
      Junior: 'linear-gradient(135deg, #30527e, #4a7ab8)',
      Middle: 'linear-gradient(135deg, #2d5a3e, #4ade80)',
      Senior: 'linear-gradient(135deg, #5a3e2d, #facc15)',
      Lead: 'linear-gradient(135deg, #5a2d5a, #c084fc)',
      CTO: 'linear-gradient(135deg, #7a1a1a, #ef4444)'
    };
    return map[displayRank] || map.Junior;
  }, [displayRank]);

  const energyCountdownLabel = useMemo(() => {
    if (energy >= maxEnergy) {
      return 'Энергия полна';
    }

    const baselineMs = progressionUpdatedAt ? new Date(progressionUpdatedAt).getTime() : NaN;
    const intervalSeconds = Number(recoveryIntervalSeconds || 60);
    if (Number.isNaN(baselineMs) || intervalSeconds <= 0) {
      return `+1 эн / ${intervalSeconds || 60} сек простоя`;
    }

    const serverNowMs = countdownNowMs + Number(serverClockOffsetMs || 0);
    const elapsedMs = Math.max(0, serverNowMs - baselineMs);
    const intervalMs = intervalSeconds * 1000;
    const elapsedRemainderMs = elapsedMs % intervalMs;
    const remainingMs = elapsedMs > 0 && elapsedRemainderMs === 0
      ? 0
      : Math.max(0, intervalMs - elapsedRemainderMs);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    return `+1 энергия через ${formatted}, если не тапать`;
  }, [countdownNowMs, energy, maxEnergy, progressionUpdatedAt, recoveryIntervalSeconds, serverClockOffsetMs]);

  return h('div', {
    style: {
      position: 'relative',
      zIndex: 10,
      background: 'linear-gradient(180deg, #0f1b30 0%, #16213e 100%)',
      borderBottom: '1px solid #1a3a5c',
      padding: '10px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '12px',
      color: '#e0e0e0',
      userSelect: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.25)'
    }
  }, [
    // Top row: tier badge + commits + action buttons
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        h('span', {
          style: {
            background: rankBadgeGradient,
            color: '#fff',
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '0.5px',
            border: '1px solid rgba(255,255,255,0.15)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
          }
        }, displayRank.toUpperCase()),
        streakDays > 0 && h('span', {
          style: { fontSize: '13px', display: 'flex', alignItems: 'center', gap: '2px' }
        }, ['🔥', h('span', { style: { color: '#facc15', fontWeight: 'bold' } }, streakDays)])
      ]),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
        h('div', { style: { textAlign: 'right' } }, [
          h('div', { style: { fontWeight: 'bold', color: '#4ade80', fontSize: '13px' } }, `${commits}`),
          h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, 'коммитов')
        ]),
        h('div', { style: { display: 'flex', gap: '4px' } }, [
          h('button', {
            onClick: () => setQuestsOpen(true),
            style: {
              border: '1px solid #30527e',
              background: daily?.claimable ? '#1a3a5c' : '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
              animation: daily?.claimable ? 'pulse 1.6s infinite' : 'none',
              position: 'relative'
            }
          }, daily?.claimable ? `📋 ${daily.claimable}` : '📋'),
          h('button', {
            onClick: () => setShopOpen(true),
            style: {
              border: '1px solid #30527e',
              background: isLowEnergy || isHighStress ? '#1a3a5c' : '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
              animation: isLowEnergy ? 'pulse 1.6s infinite' : 'none'
            }
          }, '🛒'),
          h('button', {
            onClick: () => setReferralOpen(true),
            style: {
              border: '1px solid #30527e',
              background: '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }
          }, '🔗'),
          h('button', {
            onClick: () => setBattleOpen(true),
            style: {
              border: '1px solid #30527e',
              background: '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }
          }, '⚔️'),
          h('button', {
            onClick: () => setEventOpen(true),
            style: {
              border: '1px solid #30527e',
              background: '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }
          }, '⚡'),
          h('button', {
            onClick: () => setPassOpen(true),
            style: {
              border: '1px solid #30527e',
              background: '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }
          }, '🎯'),
          h('button', {
            onClick: () => setTeamOpen(true),
            style: {
              border: '1px solid #30527e',
              background: '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }
          }, '👥'),
          h('button', {
            onClick: () => setLeaderboardOpen(true),
            style: {
              border: '1px solid #30527e',
              background: '#122642',
              color: '#dce9f9',
              borderRadius: '8px',
              padding: '5px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600
            }
          }, '🏆'),
          h('div', { style: { display: 'flex', alignItems: 'center', marginLeft: '2px' } }, h(AudioSettings))
        ])
      ])
    ]),

    // Level progress
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
      h('span', { style: { minWidth: '50px', fontSize: '11px', color: '#8ba1bb' } }, `Уровень ${displayLevel}`),
      h('div', {
        style: {
          flex: 1,
          height: '6px',
          background: '#0f3460',
          borderRadius: '3px',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: `${levelProgress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          transition: 'width 0.4s ease'
        }
      })),
      h('span', { style: { minWidth: '36px', textAlign: 'right', fontSize: '11px', color: '#8ba1bb' } }, `${levelProgress}%`)
    ]),

    // Energy bar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
      h('span', { style: { minWidth: '50px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' } }, [
        '⚡', 'Энергия'
      ]),
      h('div', {
        style: {
          flex: 1,
          height: '8px',
          background: '#0f3460',
          borderRadius: '4px',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: `${energyPercent}%`,
          height: '100%',
          background: energyColor,
          transition: 'width 0.25s ease, background 0.3s ease',
          boxShadow: isLowEnergy ? '0 0 10px rgba(239,68,68,0.55)' : 'none'
        }
      })),
      h('span', { style: { minWidth: '46px', textAlign: 'right', fontWeight: 'bold', color: energyColor, fontSize: '11px' } }, `${Math.round(energy)}/${maxEnergy}`)
    ]),

    // Depression bar
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
      h('span', { style: { minWidth: '50px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' } }, [
        '💀', 'Стресс'
      ]),
      h('div', {
        style: {
          flex: 1,
          height: '8px',
          background: '#0f3460',
          borderRadius: '4px',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: `${depression}%`,
          height: '100%',
          background: depressionColor,
          transition: 'width 0.25s ease, background 0.3s ease',
          boxShadow: isHighStress ? '0 0 10px rgba(239,68,68,0.45)' : 'none'
        }
      })),
      h('span', { style: { minWidth: '34px', textAlign: 'right', fontWeight: 'bold', color: depressionColor } }, `${Math.round(depression)}%`)
    ]),

    // Warnings
    (isLowEnergy || isHighStress) && h('div', {
      style: {
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap'
      }
    }, [
      isLowEnergy && h('span', {
        style: {
          fontSize: '10px',
          color: '#ef4444',
          fontWeight: 700,
          animation: 'pulse 1.2s infinite'
        }
      }, '⚠️ Энергия на исходе!'),
      isHighStress && h('span', {
        style: {
          fontSize: '10px',
          color: '#ef4444',
          fontWeight: 700,
          animation: 'pulse 1.2s infinite'
        }
      }, '⚠️ Высокий стресс — эффективность снижена')
    ]),

    // Recovery + today taps
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#6b7f99', marginTop: '2px' }
    }, [
      h('span', null, energyCountdownLabel),
      todayTaps > 0 && h('span', null, `Сегодня тапов: ${todayTaps}`)
    ]),

    // Error banner
    gameError && h('div', {
      style: {
        marginTop: '4px',
        padding: '6px 10px',
        borderRadius: '6px',
        background: '#3f1a1a',
        color: '#ef4444',
        fontSize: '11px',
        fontWeight: 600,
        border: '1px solid #5a2d2d',
        textAlign: 'center'
      }
    }, gameError),

    // Toast (Stage 3)
    toast && toast.visible && h('div', {
      style: {
        marginTop: '4px',
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 600,
        textAlign: 'center',
        animation: 'fade-in-up 0.25s ease-out',
        border: '1px solid rgba(255,255,255,0.1)',
        ...(toast.type === 'success' ? {
          background: 'linear-gradient(90deg, #1a3f25, #2d5a3e)',
          color: '#4ade80'
        } : toast.type === 'error' ? {
          background: 'linear-gradient(90deg, #3f1a1a, #5a2d2d)',
          color: '#fca5a5'
        } : {
          background: 'linear-gradient(90deg, #1a3a5c, #274267)',
          color: '#c7ddf5'
        })
      }
    }, toast.message),

    h(LeaderboardPanel, {
      open: leaderboardOpen,
      onClose: () => setLeaderboardOpen(false)
    }),
    h(DailyQuestsPanel, {
      open: questsOpen,
      onClose: () => setQuestsOpen(false)
    }),
    h(ShopPanel),
    h(ReferralPanel, {
      open: referralOpen,
      onClose: () => setReferralOpen(false)
    }),
    h(DailyBattlePanel, {
      open: battleOpen,
      onClose: () => setBattleOpen(false)
    }),
    h(EventPanel, {
      open: eventOpen,
      onClose: () => setEventOpen(false)
    }),
    h(SprintPassPanel, {
      open: passOpen,
      onClose: () => setPassOpen(false)
    }),
    h(TeamPanel, {
      open: teamOpen,
      onClose: () => setTeamOpen(false)
    })
  ]);
}
