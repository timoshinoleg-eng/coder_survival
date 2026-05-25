import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

export default function GeneratorsPanel({ open, onClose }) {
  const { generatorState, randomEventState, dailyFarm, passiveLocRecovery, team, antiCheat, buyGenerator, refreshGenerators, showToast } = useGameState();
  const [buyingTier, setBuyingTier] = useState(null);

  useEffect(() => {
    if (!open) return;
    refreshGenerators?.().catch(() => null);
  }, [open, refreshGenerators]);

  if (!open) return null;

  async function handleBuy(tierId) {
    if (buyingTier) return;
    setBuyingTier(tierId);
    try {
      const result = await buyGenerator(tierId);
      showToast?.(`Куплен ${tierId}: -${result.cost} LOC`, 'success', 1800);
    } catch (err) {
      showToast?.(err?.message || 'Не удалось купить генератор', 'error', 2200);
    } finally {
      setBuyingTier(null);
    }
  }

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 42,
      background: 'rgba(7, 12, 24, 0.82)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
    },
  }, h('div', {
    onClick: (event) => event.stopPropagation(),
    className: 'pixel-panel',
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '80vh',
      overflowY: 'auto',
      background: '#10192d',
      color: '#e6edf7',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '14px',
    },
  }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('strong', null, 'Генераторы'),
      h('button', { onClick: onClose, style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer' } }, 'x'),
    ]),
    h('div', { style: { fontSize: '12px', color: '#9eb6d2' } }, `Пассивный доход: ${generatorState?.passiveLocPerSecond || 0} LOC/сек`),
    h('div', { style: { fontSize: '12px', color: '#c7ddf5' } }, `FTUE: ${generatorState?.ftueAcceleration?.id || 'after_60min'}`),
    generatorState?.costMultiplier > 1 && h('div', { style: { fontSize: '12px', color: '#f87171' } }, `Event cost multiplier: x${generatorState.costMultiplier}`),
    team?.passiveLocMultiplier && h('div', { style: { fontSize: '12px', color: '#8ba1bb' } }, `Squad multiplier: x${team.passiveLocMultiplier}${team.socialObligationActive ? ' (social obligation active)' : ''}`),
    antiCheat?.banScore >= 20 && h('div', { style: { fontSize: '12px', color: '#fda4af' } }, `Anti-cheat penalty active: tier ${antiCheat.sanctionTier}, passive LOC reduced.`),
    passiveLocRecovery?.locEarned && h('div', {
      style: {
        border: '1px solid #274267',
        borderRadius: '8px',
        background: '#12203a',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      },
    }, [
      h('div', { style: { fontSize: '12px', color: '#4ade80' } }, `Последний passive accrual: +${passiveLocRecovery.locEarned} LOC`),
      h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, `${passiveLocRecovery.elapsedSeconds || 0}с · ${passiveLocRecovery.passiveLocPerSecond || 0} LOC/сек`),
    ]),
    dailyFarm && h('div', {
      style: {
        border: '1px solid #274267',
        borderRadius: '8px',
        background: '#12203a',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      },
    }, [
      h('div', { style: { fontSize: '12px', color: '#8ba1bb' } }, `Средний дневной фарм: ${dailyFarm.avgDailyFarm || 0} LOC`),
      h('div', { style: { fontSize: '11px', color: '#c7ddf5' } }, 'Основано на rolling 7-day ledger. Для новых игроков сначала используются FTUE fallback значения.'),
      ...(dailyFarm.recent || []).slice(0, 4).map((row) => h('div', {
        key: row.date,
        style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#c7ddf5' },
      }, [
        h('span', null, row.date),
        h('span', { style: { color: '#60a5fa' } }, `${row.locEarned} LOC`),
      ])),
    ]),
    ...(generatorState?.tiers || []).map((tier) => h('div', {
      key: tier.id,
      style: {
        border: '1px solid #274267',
        borderRadius: '8px',
        padding: '10px',
        background: tier.unlocked ? '#12203a' : '#0f1728',
        opacity: tier.unlocked ? 1 : 0.65,
      },
    }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } }, [
        h('div', null, [
          h('div', { style: { fontWeight: 800, color: '#f8fafc', marginBottom: '4px' } }, tier.id),
          h('div', { style: { fontSize: '11px', color: '#9eb6d2' } }, `Owned: ${tier.owned} · ${tier.outputPerSecond} LOC/сек`),
          randomEventState?.legacyCodeClicksRemaining > 0 && h('div', { style: { fontSize: '11px', color: '#f87171', marginTop: '4px' } }, `Legacy Code: x2 стоимость · осталось ${randomEventState.legacyCodeClicksRemaining} кликов`),
        ]),
        h('button', {
          type: 'button',
          disabled: !tier.unlocked || buyingTier === tier.id,
          onClick: () => handleBuy(tier.id),
          className: 'pixel-button',
          style: { minWidth: '120px', opacity: !tier.unlocked ? 0.6 : 1 },
        }, !tier.unlocked ? 'Locked' : buyingTier === tier.id ? 'Покупка...' : `Купить · ${tier.nextCost}`),
      ]),
      tier.requires && h('div', { style: { fontSize: '11px', color: '#60a5fa', marginTop: '6px' } }, `Unlock: ${tier.requires.owned} x ${tier.requires.tier}`),
    ])),
  ]));
}
