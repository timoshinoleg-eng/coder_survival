import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

function hoursLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 3600000));
}

export default function BattleCard({ battle, suppressed = false }) {
  const game = useGameState();
  const isOpponent = Number(battle?.opponentId) === Number(game.battleUserId);
  const canAccept = isOpponent && battle.status === 'pending';
  const canResolve = battle.status === 'active' && new Date(battle.expiresAt).getTime() <= Date.now();
  const indicator = useMemo(() => {
    const challenger = Number(battle?.challengerDelta || 0);
    const opponent = Number(battle?.opponentDelta || 0);
    const myDelta = Number(game.battleUserId) === Number(battle?.challengerId) ? challenger - opponent : opponent - challenger;
    if (myDelta > 0) return `Обогнал на +${myDelta}!`;
    if (myDelta < 0) return `Отстаёшь на ${Math.abs(myDelta)}`;
    return 'Ровная гонка';
  }, [battle, game.battleUserId]);

  if (suppressed || !battle) return null;

  return h('section', {
    style: {
      position: 'fixed',
      left: 'max(12px, env(safe-area-inset-left))',
      bottom: 'max(86px, env(safe-area-inset-bottom))',
      zIndex: 22,
      width: 'min(330px, calc(100vw - 24px))',
      background: '#111d31',
      color: '#e5edf7',
      border: '1px solid #315178',
      borderRadius: '8px',
      padding: '10px',
      boxSizing: 'border-box'
    }
  }, [
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [
      h('div', {
        style: {
          width: '42px',
          height: '42px',
          borderRadius: '8px',
          background: '#21395c',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800
        }
      }, 'VS'),
      h('div', { style: { flex: 1, minWidth: 0 } }, [
        h('strong', { style: { fontSize: '13px' } }, `Ставка: ${battle.stake} энергии`),
        h('div', { style: { color: '#9fb6d0', fontSize: '12px', marginTop: '3px' } }, `${battle.status} · ${hoursLeft(battle.expiresAt)}ч`)
      ]),
      h('div', { style: { color: '#fde68a', fontSize: '12px', fontWeight: 700 } }, indicator)
    ]),
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '9px' } }, [
      canAccept && h('button', {
        onClick: () => game.acceptBattle?.(battle.id),
        style: { flex: 1, padding: '8px', border: 0, borderRadius: '6px', background: '#22c55e', color: '#06140b', fontWeight: 700 }
      }, 'Принять вызов'),
      canResolve && h('button', {
        onClick: () => game.resolveBattle?.(battle.id),
        style: { flex: 1, padding: '8px', border: 0, borderRadius: '6px', background: '#2563eb', color: '#fff', fontWeight: 700 }
      }, 'Завершить')
    ])
  ]);
}
