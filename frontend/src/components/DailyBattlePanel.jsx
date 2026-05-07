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

export default function DailyBattlePanel({ open, onClose }) {
  const { initData } = useTelegram();
  const { shareText } = useTelegram();
  const [state, setState] = useState({
    loading: false,
    topPlayers: [],
    myPosition: null,
    timeUntilReset: 0,
    rewardPreview: null,
    error: null
  });
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    apiRequest('/api/battle/today', { initData })
      .then((payload) => {
        if (cancelled) return;
        setState({
          loading: false,
          topPlayers: payload?.topPlayers || [],
          myPosition: payload?.myPosition || null,
          timeUntilReset: payload?.timeUntilReset || 0,
          rewardPreview: payload?.rewardPreview || null,
          error: null
        });
        setCountdown(payload?.timeUntilReset || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: 'Не удалось загрузить битву дня' }));
      });

    return () => { cancelled = true; };
  }, [open, initData]);

  useEffect(() => {
    if (!open || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, countdown]);

  const handleShare = useCallback(() => {
    const myRank = state.myPosition?.rank;
    const myCommits = state.myPosition?.commitsToday;
    const text = myRank
      ? `⚔️ Ежедневная битва в Coder Survival! Я на #${myRank} месте с ${myCommits} коммитами. Попробуй обогнать меня!`
      : `⚔️ Ежедневная битва в Coder Survival! Присоединяйся и соревнуйся за топ.`;
    shareText(text);
  }, [state.myPosition, shareText]);

  if (!open) return null;

  const { loading, error, topPlayers, myPosition, rewardPreview } = state;

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
      maxHeight: '70vh',
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
      h('strong', null, '⚔️ Битва дня'),
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

    // Timer + rewards
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
        h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, 'До подведения итогов'),
        h('div', { style: { fontSize: '18px', fontWeight: 'bold', color: '#facc15', fontFamily: 'monospace' } }, formatCountdown(countdown))
      ]),
      h('button', {
        onClick: handleShare,
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
      }, 'Поделиться')
    ]),

    // Reward preview
    rewardPreview && h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
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
        h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, '🥇 Топ-1'),
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#4ade80' } }, `+${rewardPreview.top1.energy} эн`)
      ]),
      h('div', {
        style: {
          background: '#1a3a5c',
          borderRadius: '6px',
          padding: '8px',
          textAlign: 'center',
          border: '1px solid #30527e'
        }
      }, [
        h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, '🥈 Топ-2'),
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#60a5fa' } }, `+${rewardPreview.top2.energy} эн`)
      ]),
      h('div', {
        style: {
          background: '#1a3a5c',
          borderRadius: '6px',
          padding: '8px',
          textAlign: 'center',
          border: '1px solid #30527e'
        }
      }, [
        h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, '🥉 Топ-3'),
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#c084fc' } }, `+${rewardPreview.top3.energy} эн`)
      ])
    ]),

    loading
      ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...')
      : error
        ? h('div', { style: { padding: '14px', color: '#fda4af' } }, error)
        : h('div', null, [
          // My position
          myPosition && h('div', {
            style: {
              margin: '0 14px 8px',
              padding: '10px',
              background: '#131d33',
              borderRadius: '8px',
              border: '1px solid #30527e'
            }
          }, [
            h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '6px' } }, `Твоя позиция: #${myPosition.rank} · ${myPosition.commitsToday} коммитов`),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              myPosition.players.map((player) => h('div', {
                key: player.userId || player.telegramId || player.rank,
                style: {
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr auto',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: player.isMe ? '#1a3a5c' : 'transparent'
                }
              }, [
                h('span', { style: { color: '#8fb4ff', fontSize: '12px' } }, `#${player.rank}`),
                h('div', null, [
                  h('div', { style: { fontWeight: 600, fontSize: '12px' } }, player.username || player.firstName || 'Anonymous')
                ]),
                h('strong', { style: { color: '#4ade80', fontSize: '12px' } }, player.commitsToday)
              ]))
            )
          ]),

          // Top list
          h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 0'
            }
          }, topPlayers.length
            ? topPlayers.map((player) => h('div', {
              key: player.userId || player.telegramId || player.rank,
              style: {
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                gap: '10px',
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: '1px solid rgba(39, 66, 103, 0.45)'
              }
            }, [
              h('span', { style: { color: '#8fb4ff' } }, `#${player.rank}`),
              h('div', null, [
                h('div', { style: { fontWeight: 600 } }, player.username || player.firstName || 'Anonymous')
              ]),
              h('strong', { style: { color: '#4ade80' } }, player.commitsToday)
            ]))
            : h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Пока нет результатов за сегодня'))
        ])
  ]));
}
