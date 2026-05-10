import { h } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#c084fc'];

function PieChart({ members, total }) {
  const slices = useMemo(() => {
    let acc = 0;
    return (members || []).map((member, index) => {
      const value = Number(member.commits || 0);
      const start = acc;
      const ratio = total > 0 ? value / total : 0;
      acc += ratio;
      return `${COLORS[index % COLORS.length]} ${start * 100}% ${acc * 100}%`;
    });
  }, [members, total]);

  return h('div', {
    title: (members || []).map((m) => `${m.username || m.firstName || 'Player'}: ${m.commits || 0}`).join('\n'),
    style: {
      width: '76px',
      height: '76px',
      borderRadius: '50%',
      background: total > 0 ? `conic-gradient(${slices.join(',')})` : '#22314b',
      border: '1px solid #315178',
      flex: '0 0 auto'
    }
  });
}

function TierBadge({ label, active }) {
  const palette = { BRONZE: '#cd7f32', SILVER: '#cbd5e1', GOLD: '#facc15' };
  return h('span', {
    style: {
      color: active ? palette[label] : '#607086',
      filter: active ? 'none' : 'grayscale(1)',
      fontSize: '12px',
      fontWeight: 700
    }
  }, label);
}

export default function TeamPanel({ open: controlledOpen, onClose }) {
  const game = useGameState();
  const { initData } = useTelegram();
  const [localOpen, setLocalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const open = controlledOpen ?? localOpen;
  const hackathon = game.teamHackathon;
  const inTeam = hackathon?.inTeam === true;
  const progressPercent = Number(hackathon?.progressPercent || 0);

  const close = useCallback(() => {
    if (onClose) onClose();
    setLocalOpen(false);
  }, [onClose]);

  const mutateTeam = useCallback(async (path, body) => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(path, { method: 'POST', initData, body });
      await game.refreshTeamHackathon?.();
      await game.reset?.();
    } catch (err) {
      setError(err?.message || 'Команда недоступна');
    } finally {
      setBusy(false);
    }
  }, [game, initData]);

  return h('div', null, [
    controlledOpen === undefined && h('button', {
      onClick: () => setLocalOpen(true),
      style: {
        position: 'fixed',
        right: '12px',
        top: '84px',
        zIndex: 24,
        width: '42px',
        height: '42px',
        borderRadius: '8px',
        border: '1px solid #315178',
        background: '#10203a',
        color: '#dbeafe',
        fontWeight: 800
      },
      title: 'Команда'
    }, '👥'),
    open && h('div', {
      onClick: close,
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        background: 'rgba(6, 12, 22, 0.76)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '16px 10px'
      }
    }, h('section', {
      onClick: (event) => event.stopPropagation(),
      style: {
        width: 'min(430px, 100%)',
        maxHeight: '74vh',
        overflowY: 'auto',
        background: '#0f1b2e',
        border: '1px solid #29476d',
        borderRadius: '8px',
        color: '#e5edf7',
        padding: '14px',
        boxSizing: 'border-box'
      }
    }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
        h('strong', null, 'Команда'),
        h('button', { onClick: close, style: { background: 'transparent', border: 0, color: '#9fb6d0', fontSize: '18px' } }, '×')
      ]),
      error && h('div', { style: { color: '#fca5a5', fontSize: '12px', marginBottom: '10px' } }, error),
      inTeam ? h('div', { style: { display: 'grid', gap: '12px' } }, [
        hackathon.behindAverage && h('div', {
          style: { padding: '8px', borderRadius: '6px', background: '#3b2b11', color: '#fde68a', fontSize: '12px' }
        }, `Команда на ${progressPercent}%. Твой вклад: ${hackathon.myContribution || 0}. Не подведи!`),
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, [
          h(PieChart, { members: hackathon.members || [], total: hackathon.progress || 0 }),
          h('div', { style: { flex: 1, minWidth: 0 } }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#b8c7db' } }, [
              h('span', null, 'Хакатон недели'),
              h('span', null, `${hackathon.hoursRemaining || 0}ч`)
            ]),
            h('div', { style: { height: '10px', background: '#1c2b43', borderRadius: '6px', overflow: 'hidden', margin: '7px 0' } },
              h('div', { style: { width: `${progressPercent}%`, height: '100%', background: '#38bdf8' } })
            ),
            h('div', { style: { fontSize: '12px', color: '#dbeafe' } }, `${hackathon.progress || 0}/${hackathon.target || 0} коммитов`),
            h('div', { style: { display: 'flex', gap: '12px', marginTop: '8px' } }, [
              h(TierBadge, { label: 'BRONZE', active: ['BRONZE', 'SILVER', 'GOLD'].includes(hackathon.currentTier) }),
              h(TierBadge, { label: 'SILVER', active: ['SILVER', 'GOLD'].includes(hackathon.currentTier) }),
              h(TierBadge, { label: 'GOLD', active: hackathon.currentTier === 'GOLD' })
            ])
          ])
        ]),
        h('div', { style: { display: 'grid', gap: '6px' } },
          (hackathon.members || []).map((member, index) => h('div', {
            key: member.userId,
            style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 8px', background: '#14233a', borderRadius: '6px' }
          }, [
            h('span', { style: { color: COLORS[index % COLORS.length] } }, member.username || member.firstName || 'Player'),
            h('span', null, `${member.commits || 0}`)
          ]))
        ),
        h('button', {
          onClick: () => mutateTeam('/api/team/hackathon/claim', {}),
          disabled: busy || !hackathon.currentTier || hackathon.tierClaimed,
          style: { padding: '9px', border: 0, borderRadius: '6px', background: '#2563eb', color: '#fff', opacity: !hackathon.currentTier || hackathon.tierClaimed ? 0.5 : 1 }
        }, hackathon.tierClaimed ? 'Награда получена' : 'Забрать награду')
      ]) : h('div', { style: { display: 'grid', gap: '10px' } }, [
        h('div', { style: { color: '#b8c7db', fontSize: '13px' } }, 'Присоединись к команде'),
        h('input', {
          value: teamName,
          onInput: (event) => setTeamName(event.target.value),
          placeholder: 'Название команды',
          style: { padding: '9px', borderRadius: '6px', border: '1px solid #315178', background: '#0b1628', color: '#e5edf7' }
        }),
        h('button', {
          onClick: () => mutateTeam('/api/team/create', { name: teamName.trim() }),
          disabled: busy || !teamName.trim(),
          style: { padding: '9px', border: 0, borderRadius: '6px', background: '#22c55e', color: '#06140b', fontWeight: 700 }
        }, 'Создать'),
        h('input', {
          value: inviteCode,
          onInput: (event) => setInviteCode(event.target.value),
          placeholder: 'Код приглашения',
          style: { padding: '9px', borderRadius: '6px', border: '1px solid #315178', background: '#0b1628', color: '#e5edf7' }
        }),
        h('button', {
          onClick: () => mutateTeam('/api/team/join', { inviteCode: inviteCode.trim() }),
          disabled: busy || !inviteCode.trim(),
          style: { padding: '9px', border: 0, borderRadius: '6px', background: '#2563eb', color: '#fff', fontWeight: 700 }
        }, 'Вступить')
      ])
    ]))
  ]);
}
