import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';

export default function TeamPanel({ open, onClose }) {
  const { initData } = useTelegram();
  const { team: teamData } = useGameState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLbLoading(true);
    apiRequest('/api/team/leaderboard', { initData })
      .then((payload) => {
        if (cancelled) return;
        setLeaderboard(payload?.leaderboard || []);
        setLbLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLbLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, initData]);

  const handleCreate = useCallback(async () => {
    if (!teamName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/api/team/create', {
        method: 'POST',
        initData,
        body: { name: teamName.trim() }
      });
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Не удалось создать команду');
    } finally {
      setLoading(false);
    }
  }, [teamName, initData]);

  const handleJoin = useCallback(async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/api/team/join', {
        method: 'POST',
        initData,
        body: { inviteCode: inviteCode.trim() }
      });
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Не удалось вступить');
    } finally {
      setLoading(false);
    }
  }, [inviteCode, initData]);

  const handleLeave = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/api/team/leave', { method: 'POST', initData });
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Не удалось выйти');
    } finally {
      setLoading(false);
    }
  }, [initData]);

  if (!open) return null;

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
    onClick: (e) => e.stopPropagation(),
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
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #1f3552' }
    }, [
      h('strong', null, '👥 Команда'),
      h('button', { onClick: onClose, style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 } }, '×')
    ]),

    error && h('div', { style: { margin: '10px 14px', padding: '8px', borderRadius: '6px', background: '#3f1a1a', color: '#fca5a5', fontSize: '12px' } }, error),

    // My team view
    teamData && teamData.team
      ? h('div', { style: { padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', {
          style: { background: '#131d33', borderRadius: '8px', padding: '12px', border: '1px solid #30527e' }
        }, [
          h('div', { style: { fontSize: '14px', fontWeight: 'bold', color: '#facc15', marginBottom: '4px' } }, teamData.team.name),
          h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, `Код: ${teamData.team.invite_code}`),
          h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginTop: '2px' } }, `Всего коммитов: ${teamData.team.total_commits || 0}`)
        ]),

        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#c7ddf5' } }, 'Участники'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          teamData.members.map((m) => h('div', {
            key: m.userId,
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              background: '#131d33',
              borderRadius: '6px',
              border: '1px solid #1f3552'
            }
          }, [
            h('div', null, [
              h('span', { style: { fontSize: '12px', color: '#c7ddf5' } }, m.username || m.firstName || 'Player'),
              m.role === 'leader' && h('span', { style: { fontSize: '10px', color: '#facc15', marginLeft: '6px' } }, '👑')
            ]),
            h('span', { style: { fontSize: '11px', color: '#4ade80' } }, `${m.commitsTotal} коммитов`)
          ]))
        ),

        h('button', {
          onClick: handleLeave,
          disabled: loading,
          style: {
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #5a2d2d',
            background: '#3f1a1a',
            color: '#fca5a5',
            fontSize: '12px',
            cursor: 'pointer'
          }
        }, loading ? '...' : 'Покинуть команду')
      ])

      // No team — create or join
      : h('div', { style: { padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '13px', color: '#8ba1bb' } }, 'Создай команду или присоединись по коду'),

        h('div', { style: { display: 'flex', gap: '8px' } }, [
          h('input', {
            type: 'text',
            value: teamName,
            onInput: (e) => setTeamName(e.target.value),
            placeholder: 'Название команды',
            maxLength: 32,
            style: {
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #30527e',
              background: '#0f1b30',
              color: '#e6edf7',
              fontSize: '12px'
            }
          }),
          h('button', {
            onClick: handleCreate,
            disabled: loading || !teamName.trim(),
            style: {
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              background: loading ? '#274267' : '#4ade80',
              color: loading ? '#8ba1bb' : '#0a1f12',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer'
            }
          }, 'Создать')
        ]),

        h('div', { style: { textAlign: 'center', fontSize: '12px', color: '#6b7f99' } }, 'или'),

        h('div', { style: { display: 'flex', gap: '8px' } }, [
          h('input', {
            type: 'text',
            value: inviteCode,
            onInput: (e) => setInviteCode(e.target.value),
            placeholder: 'Код приглашения',
            maxLength: 16,
            style: {
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #30527e',
              background: '#0f1b30',
              color: '#e6edf7',
              fontSize: '12px'
            }
          }),
          h('button', {
            onClick: handleJoin,
            disabled: loading || !inviteCode.trim(),
            style: {
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              background: loading ? '#274267' : '#1a3a5c',
              color: '#dce9f9',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer'
            }
          }, 'Вступить')
        ]),

        // Leaderboard
        h('div', { style: { marginTop: '8px' } }, [
          h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#c7ddf5', marginBottom: '6px' } }, '🏆 Топ команд'),
          lbLoading
            ? h('div', { style: { color: '#9eb6d2', fontSize: '12px' } }, 'Загрузка...')
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              leaderboard.map((t) => h('div', {
                key: t.teamId,
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  background: '#131d33',
                  borderRadius: '6px',
                  border: '1px solid #1f3552',
                  fontSize: '12px'
                }
              }, [
                h('span', null, [`#${t.rank} `, h('span', { style: { color: '#c7ddf5' } }, t.name)]),
                h('span', { style: { color: '#4ade80' } }, `${t.totalCommits} коммитов`)
              ]))
            )
        ])
      ])
  ]));
}
