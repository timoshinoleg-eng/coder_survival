export function formatRewardPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) return '—';

  const parts = [];
  if (payload.energy) parts.push(`+${payload.energy} эн`);
  if (payload.commits) parts.push(`+${payload.commits} коммитов`);
  if (payload.commitsCurrent) parts.push(`+${payload.commitsCurrent} прог`);
  if (payload.xpTotal) parts.push(`+${payload.xpTotal} XP`);
  if (payload.xp) parts.push(`+${payload.xp} XP`);
  if (payload.stars) parts.push(`+${payload.stars} Stars`);
  if (payload.skin) parts.push(`скин ${payload.skin}`);
  if (payload.skinFragment) parts.push(`фрагмент ${payload.skinFragment}`);
  if (payload.depressionRelief) parts.push(`-${payload.depressionRelief} стресс`);
  if (payload.inventory?.coffee_cups) parts.push(`+${payload.inventory.coffee_cups} кофе`);
  if (payload.title) parts.push(`титул ${payload.title}`);

  return parts.join(', ') || 'Награда';
}

export function formatQuestTitle(questType, targetValue) {
  switch (questType) {
    case 'tap_count':
      return `Сделай ${targetValue} тапов`;
    case 'commit_count':
      return `Набери ${targetValue} коммитов`;
    case 'login':
      return 'Зайди в игру сегодня';
    default:
      return questType;
  }
}
