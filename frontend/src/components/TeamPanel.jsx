import { h } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { Analytics } from '../utils/analytics.js';

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#c084fc'];

const TIER_REWARDS = {
  BRONZE: { threshold: 50, energy: 30, xp: 20, passXp: 10, skin: null, label: 'BRONZE 50%' },
  SILVER: { threshold: 75, energy: 50, xp: 40, passXp: 20, skin: 'hackathon_contender', label: 'SILVER 75%' },
  GOLD: { threshold: 100, energy: 100, xp: 80, passXp: 50, skin: 'hackathon_winner', label: 'GOLD 100%' }
};

const TIER_COLORS = { BRONZE: '#cd7f32', SILVER: '#cbd5e1', GOLD: '#facc15' };

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

function TeamHealthBar({ healthPercent }) {
  const color = healthPercent >= 80 ? '#22c55e' : healthPercent >= 50 ? '#eab308' : '#ef4444';
  const label = healthPercent >= 80 ? 'Отлично' : healthPercent >= 50 ? 'Средне' : 'Критично';
  return h('div', { style: { padding: '8px', borderRadius: '6px', background: '#13263d' } }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#b8c7db', marginBottom: '5px' } }, [
      h('span', null, 'Здоровье команды'),
      h('span', { style: { color } }, `${label} · ${Math.round(healthPercent)}%`)
    ]),
    h('div', { style: { height: '6px', background: '#1c2b43', borderRadius: '3px', overflow: 'hidden' } },
      h('div', { style: { width: `${Math.min(100, healthPercent)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s' } })
    )
  ]);
}

function CountdownTimer({ hoursRemaining }) {
  const daysLeft = Math.max(0, Math.ceil((hoursRemaining || 0) / 24));
  const hoursLeft = Math.max(0, (hoursRemaining || 0) % 24);
  const urgent = daysLeft <= 1;
  return h('div', {
    style: {
      padding: '6px 10px',
      borderRadius: '6px',
      background: urgent ? '#3b1a0a' : '#13263d',
      color: urgent ? '#fb923c' : '#93c5fd',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, [
    h('span', null, urgent ? '🔥' : '⏳'),
    h('span', null, daysLeft > 0
      ? `Осталось ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'} ${hoursLeft}ч`
      : `Осталось ${hoursLeft}ч`)
  ]);
}

function TierRewardsPanel({ currentTier }) {
  const tiers = ['BRONZE', 'SILVER', 'GOLD'];
  const tierOrder = { BRONZE: 0, SILVER: 1, GOLD: 2 };
  const achieved = tierOrder[currentTier] ?? -1;

  return h('div', {
    style: { padding: '8px', borderRadius: '6px', background: '#13263d', display: 'grid', gap: '6px' }
  }, [
    h('div', { style: { fontSize: '11px', color: '#b8c7db', fontWeight: 600 } }, 'Награды за tiers'),
    ...tiers.map((tier, i) => {
      const info = TIER_REWARDS[tier];
      const isActive = i <= achieved;
      const isCurrent = tierOrder[currentTier] === i;
      return h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 8px',
          borderRadius: '5px',
          background: isActive ? '#1a2d47' : '#0e1a2b',
          border: isCurrent ? `1px solid ${TIER_COLORS[tier]}` : '1px solid transparent',
          opacity: isActive ? 1 : 0.45,
          fontSize: '11px'
        }
      }, [
        h('span', { style: { color: TIER_COLORS[tier], fontWeight: 700, minWidth: '58px' } }, info.label),
        h('span', { style: { color: '#b8c7db', flex: 1 } }, [
          `${info.energy}⚡ ${info.xp}xp`,
          info.skin ? ` · скин ${info.skin}` : ''
        ].join('')),
        isCurrent && h('span', { style: { color: '#facc15', fontSize: '10px' } }, '✓')
      ]);
    })
  ]);
}

function MemberRow({ member, index, fairShare, maxCommits }) {
  const commits = member.commits || 0;
  const ratio = fairShare > 0 ? commits / fairShare : 0;
  const barWidth = maxCommits > 0 ? (commits / maxCommits) * 100 : 0;
  const targetWidth = maxCommits > 0 ? (fairShare / maxCommits) * 100 : 0;
  const color = COLORS[index % COLORS.length];
  const status = ratio >= 1.2 ? 'leader' : ratio < 0.5 ? 'behind' : null;

  return h('div', {
    style: {
      padding: '7px 8px',
      background: '#14233a',
      borderRadius: '6px',
      display: 'grid',
      gap: '4px'
    }
  }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' } }, [
      h('span', { style: { color } }, member.username || member.firstName || 'Player'),
      h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
        h('span', null, `${commits}/${Math.round(fairShare)}`),
        status === 'leader' && h('span', { style: { color: '#facc15', fontSize: '10px' } }, '⭐ лидер'),
        status === 'behind' && h('span', { style: { color: '#fb923c', fontSize: '10px' } }, '⚠️ отстаёт')
      ])
    ]),
    h('div', { style: { position: 'relative', height: '5px', background: '#1c2b43', borderRadius: '3px', overflow: 'hidden' } }, [
      h('div', { style: { position: 'absolute', left: 0, top: 0, height: '100%', width: `${barWidth}%`, background: color, borderRadius: '3px', transition: 'width 0.3s' } }),
      h('div', { style: { position: 'absolute', left: `${Math.min(100, targetWidth)}%`, top: '-1px', width: '2px', height: '7px', background: '#fff', opacity: 0.5, borderRadius: '1px' } })
    ])
  ]);
}

export default function TeamPanel({ open: controlledOpen, onClose }) {
  const game = useGameState();
  const { initData, shareUrl } = useTelegram();
  const [localOpen, setLocalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const open = controlledOpen ?? localOpen;
  const hackathon = game.teamHackathon;
  const teamMeta = game.team;
  const inTeam = hackathon?.inTeam === true;
  const progressPercent = Number(hackathon?.progressPercent || 0);

  const memberCount = hackathon?.memberCount || hackathon?.members?.length || 1;
  const target = hackathon?.target || 0;
  const fairShare = memberCount > 0 ? target / memberCount : 0;
  const members = hackathon?.members || [];
  const maxCommits = Math.max(1, ...members.map((m) => m.commits || 0));

  const teamHealthPercent = useMemo(() => {
    if (!members.length || !fairShare) return 100;
    const ratios = members.map((m) => Math.min((m.commits || 0) / fairShare, 2));
    const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    return Math.min(100, Math.max(0, avg * 100));
  }, [members, fairShare]);

  const close = useCallback(() => {
    if (onClose) onClose();
    setLocalOpen(false);
  }, [onClose]);

  const copyInviteCode = useCallback(() => {
    if (!teamMeta?.team?.invite_code) return;
    navigator.clipboard?.writeText(teamMeta.team.invite_code).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 1500);
    }).catch(() => null);
  }, [teamMeta?.team?.invite_code]);

  const shareInviteCode = useCallback(() => {
    if (!teamMeta?.team?.invite_code) return;
    try { Analytics.track('share_team_clicked', { teamId: teamMeta?.team?.id || null }); } catch (_) {}
    shareUrl(window.location.href, `Вступай в мою команду Coder Survival по коду: ${teamMeta.team.invite_code}`);
  }, [shareUrl, teamMeta?.team?.invite_code]);

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
        teamMeta?.passiveLocMultiplier && h('div', {
          style: {
            padding: '8px',
            borderRadius: '6px',
            background: teamMeta.socialObligationActive ? '#3b2b11' : '#13263d',
            color: teamMeta.socialObligationActive ? '#fde68a' : '#93c5fd',
            fontSize: '12px'
          }
        }, [
          h('div', null, `Пассивный squad bonus: x${teamMeta.passiveLocMultiplier}${teamMeta.socialObligationActive ? ' · social obligation active' : ''}`),
          h('div', { style: { marginTop: '4px', fontSize: '11px', color: '#b8c7db' } }, `Активных участников: ${teamMeta.activeMembers || 0}/${teamMeta.members?.length || 0} · timezone: ${teamMeta.timezone || 'UTC'}`),
          h('div', { style: { marginTop: '4px', fontSize: '11px', color: '#b8c7db', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [
            h('span', null, `Твоя роль: ${teamMeta.myRole || 'member'}`),
            teamMeta.team?.invite_code && h('span', null, `код: ${teamMeta.team.invite_code}`),
            teamMeta.team?.invite_code && h('button', {
              onClick: copyInviteCode,
              style: {
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid #315178',
                background: copiedInvite ? '#1a3f25' : '#0f1b30',
                color: copiedInvite ? '#4ade80' : '#dbeafe',
                fontSize: '10px',
                cursor: 'pointer',
              }
            }, copiedInvite ? 'Скопировано' : 'Копировать'),
            teamMeta.team?.invite_code && h('button', {
              onClick: shareInviteCode,
              style: {
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid #315178',
                background: '#0f1b30',
                color: '#dbeafe',
                fontSize: '10px',
                cursor: 'pointer',
              }
            }, 'Поделиться'),
          ]),
        ]),
        h(TeamHealthBar, { healthPercent: teamHealthPercent }),
        h(CountdownTimer, { hoursRemaining: hackathon?.hoursRemaining }),
        hackathon.behindAverage && h('div', {
          style: { padding: '8px', borderRadius: '6px', background: '#3b2b11', color: '#fde68a', fontSize: '12px' }
        }, `Команда на ${progressPercent}%. Твой вклад: ${hackathon.myContribution || 0}. Не подведи!`),
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, [
          h(PieChart, { members, total: hackathon.progress || 0 }),
          h('div', { style: { flex: 1, minWidth: 0 } }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#b8c7db' } }, [
              h('span', null, 'Хакатон недели'),
              h('span', null, `${hackathon.hoursRemaining || 0}ч`)
            ]),
            h('div', { style: { height: '10px', background: '#1c2b43', borderRadius: '6px', overflow: 'hidden', margin: '7px 0' } },
              h('div', { style: { width: `${progressPercent}%`, height: '100%', background: '#38bdf8' } })
            ),
            h('div', { style: { fontSize: '12px', color: '#dbeafe' } }, `${hackathon.progress || 0}/${target} коммитов · fair share: ${Math.round(fairShare)}/чел`)
          ])
        ]),
        h(TierRewardsPanel, { currentTier: hackathon?.currentTier }),
        h('div', { style: { display: 'grid', gap: '6px' } },
          members.map((member, index) => h(MemberRow, {
            key: member.userId,
            member,
            index,
            fairShare,
            maxCommits
          }))
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
