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

const STATUS_LABELS = {
  productive_genius: '🧠 Продуктивный гений',
  burnt_out: '🔥 Выгорел дня',
  depression_savior: '💚 Спаситель депрессии'
};

const STATUS_COLORS = {
  productive_genius: '#4ade80',
  burnt_out: '#ef4444',
  depression_savior: '#60a5fa'
};

export default function DailySummaryPanel({ open, onClose }) {
  const { initData } = useTelegram();
  const [state, setState] = useState({
    loading: false,
    topPlayers: [],
    mySummary: null,
    history: [],
    timeUntilBattle: 0,
    error: null
  });
  const [countdown, setCountdown] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [todayRes, historyRes] = await Promise.all([
        apiRequest('/api/daily-summary/today', { initData }),
        apiRequest('/api/daily-summary/history', { initData })
      ]);
      setState({
        loading: false,
        topPlayers: todayRes?.topPlayers || [],
        mySummary: todayRes?.mySummary || null,
        timeUntilBattle: todayRes?.timeUntilBattle || 0,
        history: historyRes?.history || [],
        error: null
      });
      setCountdown(todayRes?.timeUntilBattle || 0);
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: 'Не удалось загрузить ежедневную битву' }));
    }
  }, [initData]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [open, fetchData]);

  useEffect(() => {
    if (!open || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, countdown]);

  if (!open) return null;

  const { loading, error, topPlayers, mySummary, history } = state;

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
      maxHeight: '75vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
    }
  }, [
    // Header
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('strong', null, '🏆 Ежедневная битва'),
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

    // Countdown + history toggle
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid #1f3552',
        background: '#131d33'
      }
    }, [
      h('div', null, [
        h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, 'До следующей битвы'),
        h('div', { style: { fontSize: '18px', fontWeight: 'bold', color: '#facc15', fontFamily: 'monospace' } }, formatCountdown(countdown))
      ]),
      h('button', {
        onClick: () => setHistoryOpen((v) => !v),
        style: {
          padding: '5px 10px',
          borderRadius: '6px',
          border: 'none',
          background: '#1a3a5c',
          color: '#dce9f9',
          fontSize: '11px',
          cursor: 'pointer',
          fontWeight: 600
        }
      }, historyOpen ? 'Скрыть историю' : 'История')
    ]),

    loading
      ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...')
      : error
        ? h('div', { style: { padding: '14px', color: '#fda4af' } }, error)
        : h('div', null, [
          // My result
          mySummary && h('div', {
            style: {
              margin: '10px 14px',
              padding: '10px',
              background: '#131d33',
              borderRadius: '8px',
              border: '1px solid #30527e'
            }
          }, [
            h('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }
            }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold' } }, `Твой результат: #${mySummary.rank}`),
              mySummary.status && h('span', {
                style: {
                  fontSize: '11px',
                  fontWeight: 700,
                  color: STATUS_COLORS[mySummary.status] || '#e6edf7',
                  background: 'rgba(255,255,255,0.08)',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }
              }, STATUS_LABELS[mySummary.status] || mySummary.status)
            ]),
            h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '6px' } }, `Общий score: ${mySummary.scoreTotal}`),
            // Score breakdown bars
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
              { label: 'Продуктивность', key: 'scoreProductivity', color: '#4ade80' },
              { label: 'Депрессия (инв.)', key: 'scoreDepression', color: '#60a5fa' },
              { label: 'Соц. активность', key: 'scoreSocial', color: '#c084fc' },
              { label: 'Рефералы', key: 'scoreReferral', color: '#facc15' }
            ].map(item => h('div', { key: item.key, style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
              h('span', { style: { fontSize: '10px', color: '#8ba1bb', minWidth: '100px' } }, item.label),
              h('div', {
                style: {
                  flex: 1,
                  height: '6px',
                  background: '#0f3460',
                  borderRadius: '0',
                  overflow: 'hidden'
                }
              }, h('div', {
                style: {
                  width: `${Math.min((mySummary[item.key] / 40) * 100, 100)}%`,
                  height: '100%',
                  background: item.color
                }
              })),
              h('span', { style: { fontSize: '10px', color: item.color, minWidth: '28px', textAlign: 'right' } }, mySummary[item.key])
            ])))
          ]),

          // Top players
          h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 0'
            }
          }, topPlayers.length
            ? topPlayers.map((player) => h('div', {
              key: player.userId,
              style: {
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto auto',
                gap: '8px',
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: '1px solid rgba(39, 66, 103, 0.45)'
              }
            }, [
              h('span', { style: { color: '#8fb4ff', fontWeight: 700 } }, `#${player.rank}`),
              h('div', null, [
                h('div', { style: { fontWeight: 600, fontSize: '12px' } }, player.username || player.firstName || 'Anonymous'),
                player.status && h('div', {
                  style: {
                    fontSize: '10px',
                    color: STATUS_COLORS[player.status] || '#8ba1bb',
                    marginTop: '2px'
                  }
                }, STATUS_LABELS[player.status] || player.status)
              ]),
              h('div', { style: { textAlign: 'right' } }, [
                h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, 'score'),
                h('div', { style: { fontWeight: 'bold', color: '#facc15', fontSize: '12px' } }, player.scoreTotal)
              ]),
              player.reward && Object.keys(player.reward).length > 0 && h('div', {
                style: {
                  fontSize: '10px',
                  color: '#4ade80',
                  textAlign: 'right'
                }
              }, '+награда')
            ]))
            : h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Пока нет результатов за сегодня')),

          // History section
          historyOpen && h('div', {
            style: {
              borderTop: '1px solid #1f3552',
              padding: '10px 14px',
              background: '#0d1525'
            }
          }, [
            h('div', { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' } }, 'История (7 дней)'),
            history.length
              ? history.map((entry) => h('div', {
                key: entry.date,
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(39, 66, 103, 0.3)'
                }
              }, [
                h('span', { style: { fontSize: '11px', color: '#8ba1bb' } }, entry.date),
                h('span', { style: { fontSize: '11px', fontWeight: 600 } }, `#${entry.rank || '-'}`),
                h('span', { style: { fontSize: '11px', color: '#facc15' } }, entry.scoreTotal),
                entry.status && h('span', {
                  style: {
                    fontSize: '10px',
                    color: STATUS_COLORS[entry.status] || '#8ba1bb'
                  }
                }, STATUS_LABELS[entry.status] || entry.status)
              ]))
              : h('div', { style: { fontSize: '11px', color: '#9eb6d2' } }, 'Нет истории')
          ])
        ])
  ]));
}
