import { h } from 'preact';
import { useEffect, useMemo, useState, useCallback } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { apiRequest } from '../utils/api.js';
import { formatRewardPayload } from '../utils/rewardFormatting.js';

function formatCountdown(iso) {
  if (!iso) return '—';
  const diffMs = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Завершается';
  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${hours}ч ${minutes}м`;
}

export default function TeamBattle({ open, onClose }) {
  const { initData } = useTelegram();
  const { teamBattle: stateBattle, showToast } = useGameState();
  const [remoteBattle, setRemoteBattle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (stateBattle) {
      setRemoteBattle(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    apiRequest('/api/team-battle/current', { initData })
      .then((payload) => {
        if (cancelled) return;
        setRemoteBattle(payload || null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setError(err?.status === 404 ? 'Командная битва ещё не включена' : (err?.message || 'Не удалось загрузить командную битву'));
      });

    return () => { cancelled = true; };
  }, [open, initData, stateBattle]);

  const battle = useMemo(() => {
    if (stateBattle) return stateBattle;
    if (!remoteBattle) return null;
    if (remoteBattle.myTeam) {
      return {
        active: remoteBattle.active,
        seasonNumber: remoteBattle.season?.seasonNumber,
        endDate: remoteBattle.season?.endDate,
        reward: remoteBattle.season?.reward,
        teamCommits: remoteBattle.myTeam.teamCommits,
        targetCommits: remoteBattle.myTeam.targetCommits,
        teamRank: remoteBattle.myTeam.teamRank,
        personalContribution: remoteBattle.myTeam.personalContribution,
        claimed: remoteBattle.myTeam.rewardClaimed,
        progressPercent: remoteBattle.myTeam.progressPercent,
      };
    }
    return remoteBattle.teamBattle || remoteBattle;
  }, [remoteBattle, stateBattle]);

  const progressPct = useMemo(() => {
    const current = Number(battle?.teamCommits ?? 0);
    const target = Number(battle?.targetCommits ?? 0);
    if (target <= 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  }, [battle]);

  const canClaim = battle?.active && progressPct >= 100;

  const handleClaim = useCallback(async () => {
    setClaiming(true);
    try {
      const payload = await apiRequest('/api/team-battle/claim', {
        method: 'POST',
        initData
      });
      showToast(`Награда команды: ${formatRewardPayload(payload?.reward)}`, 'success', 2500);
      setRemoteBattle((current) => current ? {
        ...current,
        myTeam: current.myTeam
          ? { ...current.myTeam, rewardClaimed: true, claimed: true }
          : current.myTeam,
        teamBattle: current.teamBattle ? { ...current.teamBattle, claimed: true } : current
      } : current);
    } catch (err) {
      showToast(err?.message || 'Не удалось забрать награду команды', 'error', 2500);
    } finally {
      setClaiming(false);
    }
  }, [initData, showToast]);

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
      h('strong', null, '🛡️ Team Battle'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 }
      }, '×')
    ]),

    loading
      ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...')
      : error
        ? h('div', { style: { padding: '14px', color: '#fda4af' } }, error)
        : !battle?.active
          ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Сейчас нет активной командной битвы.')
          : h('div', { style: { padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' } }, [
            h('div', {
              style: { background: '#131d33', borderRadius: '8px', padding: '12px', border: '1px solid #1f3552' }
            }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' } }, [
                h('div', null, [
                  h('div', { style: { color: '#facc15', fontWeight: 700, fontSize: '14px' } }, `Сезон #${battle.seasonNumber || '—'}`),
                  h('div', { style: { color: '#8ba1bb', fontSize: '11px' } }, `Ранг команды: #${battle.teamRank || '—'}`)
                ]),
                h('div', { style: { color: '#8ba1bb', fontSize: '11px', textAlign: 'right' } }, `До конца: ${formatCountdown(battle.endsAt || battle.endDate)}`)
              ]),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' } }, [
                h('span', { style: { color: '#8ba1bb' } }, 'Прогресс команды'),
                h('span', { style: { color: '#c7ddf5', fontWeight: 'bold' } }, `${battle.teamCommits || 0} / ${battle.targetCommits || 0}`)
              ]),
              h('div', { style: { height: '10px', background: '#0f3460', borderRadius: '5px', overflow: 'hidden' } },
                h('div', {
                  style: {
                    width: `${progressPct}%`,
                    height: '100%',
                    background: progressPct >= 100 ? '#4ade80' : '#60a5fa',
                    transition: 'width 0.4s ease'
                  }
                })
              ),
              h('div', { style: { marginTop: '6px', textAlign: 'right', color: '#8ba1bb', fontSize: '11px' } }, `${progressPct}%`)
            ]),
            h('div', {
              style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }
            }, [
              h('div', { style: { background: '#131d33', border: '1px solid #1f3552', borderRadius: '8px', padding: '10px' } }, [
                h('div', { style: { color: '#8ba1bb', fontSize: '11px' } }, 'Личный вклад'),
                h('div', { style: { color: '#c7ddf5', fontWeight: 700, marginTop: '4px' } }, `${battle.personalContribution ?? 0} коммитов`)
              ]),
              h('div', { style: { background: '#131d33', border: '1px solid #1f3552', borderRadius: '8px', padding: '10px' } }, [
                h('div', { style: { color: '#8ba1bb', fontSize: '11px' } }, 'Средний вклад'),
                h('div', { style: { color: '#c7ddf5', fontWeight: 700, marginTop: '4px' } }, `${battle.teamAverageCommits ?? battle.averageCommits ?? 0} коммитов`)
              ])
            ]),
            h('div', {
              style: { background: '#131d33', borderRadius: '8px', padding: '12px', border: '1px solid #1f3552' }
            }, [
              h('div', { style: { color: '#8ba1bb', fontSize: '12px', marginBottom: '4px' } }, 'Награда сезона'),
              h('div', { style: { color: '#c7ddf5', fontSize: '13px' } }, formatRewardPayload(battle.reward))
            ]),
            canClaim && !battle.claimed
              ? h('button', {
                onClick: handleClaim,
                disabled: claiming,
                style: {
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: claiming ? '#274267' : '#4ade80',
                  color: claiming ? '#8ba1bb' : '#0a1f12',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: claiming ? 'not-allowed' : 'pointer'
                }
              }, claiming ? '...' : 'Забрать награду команды')
              : h('div', { style: { textAlign: 'center', color: battle.claimed ? '#4ade80' : '#8ba1bb', fontSize: '12px', fontWeight: battle.claimed ? 700 : 400 } }, battle.claimed ? '✅ Награда уже получена' : 'Продолжайте вместе, чтобы дойти до цели')
          ])
  ]));
}
