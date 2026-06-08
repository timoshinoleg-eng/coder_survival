import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useTelegram } from '../hooks/useTelegram.js';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function severityColor(severity) {
  switch (severity) {
    case 'P0': return { bg: '#3f1a1a', border: '#ef4444', text: '#fda4af' };
    case 'P1': return { bg: '#3b2f10', border: '#f59e0b', text: '#fde68a' };
    case 'P2': return { bg: '#1a3a5c', border: '#60a5fa', text: '#bfdbfe' };
    default: return { bg: '#1a3a5c', border: '#60a5fa', text: '#bfdbfe' };
  }
}

function rewardPreview(severity) {
  switch (severity) {
    case 'P0': return '☕×2 +60 эн +25 стресс';
    case 'P1': return '☕×1 +40 эн +15 стресс';
    case 'P2': return '+20 эн +10 стресс';
    default: return '';
  }
}

function failurePreview(severity) {
  switch (severity) {
    case 'P0': return '+30 выгорания';
    case 'P1': return '+20 выгорания';
    case 'P2': return '+10 выгорания';
    default: return '';
  }
}

export default function DailyBattlePanel({ open, onClose }) {
  const { initData } = useTelegram();
  const [state, setState] = useState({
    loading: false,
    battle: null,
    myParticipation: null,
    squadProgress: null,
    error: null
  });
  const [countdown, setCountdown] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBattle = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const payload = await apiRequest('/api/daily-battle/current', { initData });
      if (!payload?.active) {
        setState({ loading: false, battle: null, myParticipation: null, squadProgress: null, error: null });
        setCountdown(0);
        return;
      }
      setState({
        loading: false,
        battle: payload.battle,
        myParticipation: payload.myParticipation,
        squadProgress: payload.squadProgress,
        error: null
      });
      setCountdown(payload.battle.timeRemainingMs || 0);
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err?.payload?.error || 'Не удалось загрузить бой' }));
    }
  }, [initData]);

  useEffect(() => {
    if (!open) return;
    fetchBattle();
  }, [open, fetchBattle]);

  useEffect(() => {
    if (!open || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, countdown]);

  const handleJoin = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest('/api/daily-battle/join', { method: 'POST', initData });
      await fetchBattle();
    } catch (err) {
      setState(s => ({ ...s, error: err?.payload?.error || 'Не удалось присоединиться' }));
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, initData, fetchBattle]);

  const handleContribute = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      // Auto-contribute a reasonable chunk (500 LOC) for arcade feel
      await apiRequest('/api/daily-battle/contribute', { method: 'POST', initData, body: { loc: 500 } });
      await fetchBattle();
    } catch (err) {
      setState(s => ({ ...s, error: err?.payload?.error || 'Не удалось внести вклад' }));
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, initData, fetchBattle]);

  const handleClaim = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest('/api/daily-battle/claim', { method: 'POST', initData });
      await fetchBattle();
    } catch (err) {
      setState(s => ({ ...s, error: err?.payload?.error || 'Не удалось забрать награду' }));
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, initData, fetchBattle]);

  if (!open) return null;

  const { loading, error, battle, myParticipation, squadProgress } = state;
  const sev = battle ? severityColor(battle.severity) : null;

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(7, 12, 24, 0.78)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '16px 12px'
    }
  }, h('div', {
    onClick: (event) => event.stopPropagation(),
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '80vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
    }
  }, [
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('strong', null, '🎫 Daily Deploy'),
      h('button', {
        onClick: onClose,
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1
        }
      }, '×')
    ]),

    loading && h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...'),

    error && h('div', { style: { padding: '14px', color: '#fda4af' } }, error),

    !loading && !battle && h('div', { style: { padding: '14px', color: '#9eb6d2', textAlign: 'center' } },
      'Сейчас нет активного боя. Следующий начнётся в 10:00 или 19:00 UTC.'
    ),

    battle && h('div', null, [
      // Ticket header
      h('div', {
        style: {
          padding: '14px',
          borderBottom: '1px solid #1f3552',
          background: '#131d33'
        }
      }, [
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } }, [
          h('span', { style: { fontSize: '24px' } }, battle.bugEmoji),
          h('div', { style: { flex: 1 } }, [
            h('div', { style: { fontWeight: 'bold', fontSize: '14px' } }, battle.bugName),
            h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, `Тип бага: ${battle.bugType}`)
          ]),
          h('span', {
            style: {
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              background: sev.bg,
              color: sev.text,
              border: `1px solid ${sev.border}`
            }
          }, battle.severity)
        ]),

        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          h('div', null, [
            h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, 'До дедлайна'),
            h('div', { style: { fontSize: '18px', fontWeight: 'bold', color: countdown <= 300000 ? '#ef4444' : '#facc15', fontFamily: 'monospace' } }, formatCountdown(countdown))
          ]),
          h('div', { style: { textAlign: 'right' } }, [
            h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, 'Дедлайн'),
            h('div', { style: { fontSize: '13px', fontWeight: 'bold' } }, `${battle.deadlineHours}ч`)
          ])
        ])
      ]),

      // Reward preview
      h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          padding: '10px 14px',
          borderBottom: '1px solid #1f3552'
        }
      }, [
        h('div', {
          style: {
            background: '#1a3f25',
            borderRadius: '6px',
            padding: '8px',
            textAlign: 'center',
            border: '1px solid #2d5a3e'
          }
        }, [
          h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, '✅ Успех'),
          h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#4ade80' } }, rewardPreview(battle.severity))
        ]),
        h('div', {
          style: {
            background: '#3f1a1a',
            borderRadius: '6px',
            padding: '8px',
            textAlign: 'center',
            border: '1px solid #5a2d2d'
          }
        }, [
          h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, '❌ Провал'),
          h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#fda4af' } }, failurePreview(battle.severity))
        ])
      ]),

      // Progress
      squadProgress && h('div', {
        style: {
          padding: '12px 14px',
          borderBottom: '1px solid #1f3552'
        }
      }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' } }, [
          h('span', null, 'Глобальный прогресс'),
          h('span', { style: { color: '#8ba1bb' } }, `${squadProgress.totalLoc.toLocaleString('ru-RU')} / ${battle.targetLoc.toLocaleString('ru-RU')} LOC`)
        ]),
        h('div', {
          style: {
            height: '10px',
            background: '#0f3460',
            borderRadius: '5px',
            overflow: 'hidden',
            marginBottom: '10px'
          }
        }, h('div', {
          style: {
            width: `${squadProgress.progressPercent}%`,
            height: '100%',
            background: squadProgress.progressPercent >= 100 ? '#4ade80' : '#3b82f6',
            transition: 'width 0.4s ease'
          }
        })),

        squadProgress.myTeamParticipants > 0 && h('div', null, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' } }, [
            h('span', null, 'Команда'),
            h('span', { style: { color: '#8ba1bb' } }, `${squadProgress.myTeamLoc.toLocaleString('ru-RU')} LOC · ${squadProgress.myTeamParticipants} чел.`)
          ]),
          h('div', {
            style: {
              height: '8px',
              background: '#0f3460',
              borderRadius: '4px',
              overflow: 'hidden'
            }
          }, h('div', {
            style: {
              width: `${battle.targetLoc > 0 ? Math.min(100, Math.round((squadProgress.myTeamLoc / battle.targetLoc) * 100)) : 0}%`,
              height: '100%',
              background: '#8b5cf6',
              transition: 'width 0.4s ease'
            }
          }))
        ]),

        h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginTop: '8px' } },
          `Участников: ${squadProgress.participants}`)
      ]),

      // My participation
      myParticipation && h('div', {
        style: {
          padding: '12px 14px',
          borderBottom: '1px solid #1f3552',
          background: '#131d33'
        }
      }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' } }, 'Твой вклад'),
        myParticipation.joined ? h('div', null, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' } }, [
            h('span', { style: { color: '#8ba1bb' } }, 'Внесено LOC'),
            h('span', { style: { color: '#4ade80', fontWeight: 'bold' } }, myParticipation.contributionLoc.toLocaleString('ru-RU'))
          ]),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' } }, [
            h('span', { style: { color: '#8ba1bb' } }, 'Статус'),
            h('span', null,
              battle.status === 'active' ? '⏳ Бой идёт'
                : myParticipation.success === true ? '✅ Победа'
                  : myParticipation.success === false ? '❌ Поражение'
                    : '—'
            )
          ]),
          myParticipation.claimed && h('div', { style: { fontSize: '12px', color: '#4ade80' } }, 'Награда забрана'),

          battle.status === 'active' && h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, [
            h('button', {
              onClick: handleContribute,
              disabled: actionLoading,
              style: {
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: actionLoading ? '#1a3a5c' : '#2563eb',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: actionLoading ? 'wait' : 'pointer',
                opacity: actionLoading ? 0.7 : 1
              }
            }, actionLoading ? '...' : '+500 LOC')
          ]),

          battle.status !== 'active' && !myParticipation.claimed && h('button', {
            onClick: handleClaim,
            disabled: actionLoading,
            style: {
              width: '100%',
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              background: actionLoading ? '#1a3a5c' : '#16a34a',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: actionLoading ? 'wait' : 'pointer'
            }
          }, actionLoading ? '...' : 'Забрать награду'),

          battle.status !== 'active' && myParticipation.claimed && h('div', {
            style: {
              marginTop: '10px',
              padding: '8px',
              borderRadius: '6px',
              background: '#1a3f25',
              color: '#4ade80',
              fontSize: '12px',
              textAlign: 'center'
            }
          }, 'Награда уже получена')
        ]) : h('div', null, [
          h('div', { style: { fontSize: '12px', color: '#8ba1bb', marginBottom: '10px' } }, 'Ты ещё не присоединился к этому бою.'),
          h('button', {
            onClick: handleJoin,
            disabled: actionLoading || countdown <= 0,
            style: {
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: 'none',
              background: countdown <= 0 ? '#1a3a5c' : '#2563eb',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: actionLoading || countdown <= 0 ? 'not-allowed' : 'pointer',
              opacity: actionLoading || countdown <= 0 ? 0.6 : 1
            }
          }, actionLoading ? '...' : 'Присоединиться к бою')
        ])
      ]),

      // Battle ended banner
      battle.status !== 'active' && h('div', {
        style: {
          padding: '10px 14px',
          textAlign: 'center',
          fontSize: '12px',
          fontWeight: 'bold',
          color: battle.status === 'completed' ? '#4ade80' : '#fda4af',
          background: battle.status === 'completed' ? '#1a3f25' : '#3f1a1a',
          borderTop: `1px solid ${battle.status === 'completed' ? '#2d5a3e' : '#5a2d2d'}`
        }
      }, battle.status === 'completed' ? '🎉 Баг пофикшен! Команда справилась.' : '💀 Деплой провалился. Баг победил.')
    ])
  ]));
}
