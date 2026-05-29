export function formatRewardPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) return '—';

  const parts = [];
  if (payload.energy) parts.push(`+${payload.energy} эн`);
  if (payload.commitsCurrent) parts.push(`+${payload.commitsCurrent} прог`);
  if (payload.xpTotal) parts.push(`+${payload.xpTotal} XP`);
  if (payload.depressionRelief) parts.push(`-${payload.depressionRelief} стресс`);

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
