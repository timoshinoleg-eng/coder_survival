import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';

const PERIODS = [
  { key: 'all', label: 'Всё время' },
  { key: 'week', label: 'Неделя' },
  { key: 'today', label: 'Сегодня' }
];

export default function LeaderboardPanel({ open, onClose }) {
  const { initData, shareText } = useTelegram();
  const { rank } = useGameState();
  const [state, setState] = useState({ loading: false, players: [], myPosition: null, error: null });
  const [period, setPeriod] = useState('all');
  const [filterRank, setFilterRank] = useState(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    const params = new URLSearchParams();
    params.set('limit', '10');
    params.set('period', period);
    if (filterRank) {
      params.set('rank', String(filterRank));
    }
    params.set('aroundMe', '1');

    apiRequest(`/api/leaderboard?${params.toString()}`, { initData })
      .then((payload) => {
        if (cancelled) return;
        setState({
          loading: false,
          players: payload?.players || [],
          myPosition: payload?.myPosition || null,
          error: null
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, players: [], myPosition: null, error: 'Не удалось загрузить рейтинг' });
      });

    return () => {
      cancelled = true;
    };
  }, [initData, open, period, filterRank]);

  if (!open) return null;

  const activePlayers = state.players;
  const hasMyPosition = state.myPosition && state.myPosition.players && state.myPosition.players.length > 0;

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
      h('strong', null, 'Топ программистов'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        h('button', {
          onClick: () => {
            const myRank = state.myPosition?.rank;
            const text = myRank
              ? `🏆 Я на #${myRank} месте в Coder Survival! Попробуй обогнать меня.`
              : `🏆 Coder Survival — карьерный кликер для программистов. Заходи и соревнуйся!`;
            shareText(text);
          },
          style: {
            border: 'none',
            background: '#1a3a5c',
            color: '#dce9f9',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            fontWeight: 600
          }
        }, 'Поделиться'),
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
      ])
    ]),

    // Period tabs
    h('div', {
      style: {
        display: 'flex',
        gap: '4px',
        padding: '10px 14px 0',
        borderBottom: '1px solid #1f3552'
      }
    }, PERIODS.map(p => h('button', {
      key: p.key,
      onClick: () => setPeriod(p.key),
      style: {
        flex: 1,
        padding: '6px 0',
        borderRadius: '6px 6px 0 0',
        border: 'none',
        background: period === p.key ? '#1a3a5c' : 'transparent',
        color: period === p.key ? '#dce9f9' : '#8ba1bb',
        fontWeight: period === p.key ? 700 : 400,
        fontSize: '12px',
        cursor: 'pointer'
      }
    }, p.label))),

    // Rank filter
    h('div', {
      style: {
        display: 'flex',
        gap: '4px',
        padding: '8px 14px',
        alignItems: 'center'
      }
    }, [
      h('button', {
        onClick: () => setFilterRank(null),
        style: {
          padding: '4px 10px',
          borderRadius: '12px',
          border: '1px solid #30527e',
          background: filterRank === null ? '#1a3a5c' : '#131d33',
          color: filterRank === null ? '#dce9f9' : '#8ba1bb',
          fontSize: '11px',
          cursor: 'pointer'
        }
      }, 'Все'),
      h('button', {
        onClick: () => setFilterRank(rank || 1),
        style: {
          padding: '4px 10px',
          borderRadius: '12px',
          border: '1px solid #30527e',
          background: filterRank !== null ? '#1a3a5c' : '#131d33',
          color: filterRank !== null ? '#dce9f9' : '#8ba1bb',
          fontSize: '11px',
          cursor: 'pointer'
        }
      }, `Мой ранг (${['Junior','Middle','Senior','Lead','CTO'][(rank || 1) - 1]})`)
    ]),

    state.loading
      ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...')
      : state.error
        ? h('div', { style: { padding: '14px', color: '#fda4af' } }, state.error)
        : h('div', null, [
          // My position
          hasMyPosition && h('div', {
            style: {
              margin: '0 14px 8px',
              padding: '10px',
              background: '#131d33',
              borderRadius: '8px',
              border: '1px solid #30527e'
            }
          }, [
            h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '6px' } }, `Твоя позиция: #${state.myPosition.rank}`),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              state.myPosition.players.map((player) => h('div', {
                key: player.userId || player.telegramId || player.rank,
                style: {
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr auto',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: player.rank === state.myPosition.rank ? '#1a3a5c' : 'transparent'
                }
              }, [
                h('span', { style: { color: '#8fb4ff', fontSize: '12px' } }, `#${player.rank}`),
                h('div', null, [
                  h('div', { style: { fontWeight: 600, fontSize: '12px' } }, player.username || player.firstName || 'Anonymous'),
                  h('div', { style: { color: '#8ba1bb', fontSize: '10px' } }, `${player.tierName}`)
                ]),
                h('strong', { style: { color: '#4ade80', fontSize: '12px' } }, player.commits)
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
          }, activePlayers.length
            ? activePlayers.map((player) => h('div', {
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
                h('div', { style: { fontWeight: 600 } }, player.username || player.firstName || 'Anonymous'),
                h('div', { style: { color: '#8ba1bb', fontSize: '12px' } }, `${player.tierName}`)
              ]),
              h('strong', { style: { color: '#4ade80' } }, player.commits)
            ]))
            : h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Рейтинг пока пуст'))
        ])
  ]));
}
