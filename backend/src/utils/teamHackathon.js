import { STAGE3 } from '../config/balance.js';

const { TEAM_HACKATHON } = STAGE3;

export function getWeekId(date = new Date(), timezoneOffset = 0) {
  const local = new Date(new Date(date).getTime() + Number(timezoneOffset || 0) * 60000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() + 4 - (local.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return `${local.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function calculateHackathonTarget(activeMemberCount) {
  const members = Math.max(Number(activeMemberCount || 0), TEAM_HACKATHON.MIN_ACTIVE_MEMBERS);
  return members * TEAM_HACKATHON.COMMITS_PER_ACTIVE_MEMBER;
}

export function getHackathonTier(progress, target) {
  if (!target || target <= 0) return null;
  const ratio = Number(progress || 0) / target;
  if (ratio >= TEAM_HACKATHON.REWARD_TIERS.GOLD.threshold) return 'GOLD';
  if (ratio >= TEAM_HACKATHON.REWARD_TIERS.SILVER.threshold) return 'SILVER';
  if (ratio >= TEAM_HACKATHON.REWARD_TIERS.BRONZE.threshold) return 'BRONZE';
  return null;
}

export function addHackathonContribution(state, userId, commitsDelta) {
  const safeDelta = Math.max(0, Number(commitsDelta || 0));
  const contributions = { ...(state?.contributions || {}) };
  contributions[userId] = Number(contributions[userId] || 0) + safeDelta;

  const totalProgress = Object.values(contributions).reduce((sum, value) => sum + Number(value || 0), 0);
  const target = Number(state?.target || calculateHackathonTarget(TEAM_HACKATHON.MIN_ACTIVE_MEMBERS));
  const tier = getHackathonTier(totalProgress, target);

  return {
    ...(state || {}),
    target,
    contributions,
    progress: totalProgress,
    currentTier: tier
  };
}

export function getHoursUntilNextLocalMonday(timezoneOffset = 0, now = new Date()) {
  const local = new Date(now.getTime() + Number(timezoneOffset || 0) * 60000);
  const day = local.getUTCDay() || 7;
  const nextMonday = new Date(local);
  nextMonday.setUTCDate(local.getUTCDate() + (8 - day));
  nextMonday.setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((nextMonday.getTime() - local.getTime()) / 3600000));
}

export function buildHackathonFinalMessage(teamName, progress, target, tier, members, success) {
  const progressPct = target > 0 ? Math.round((progress / target) * 100) : 0;
  const memberLines = members.map(m => `• ${m.username || m.firstName || 'Anonymous'} — ${m.contribution || 0} коммитов`).join('\n');

  if (success) {
    return `🏆 *Результаты командного хакатона*\n\n` +
      `Команда "${teamName}" покорила хакатон!\n` +
      `Прогресс: *${progressPct}%* (${progress} / ${target} коммитов)\n` +
      `Тир: *${tier}*\n\n` +
      `Участники:\n${memberLines}\n\n` +
      `Всем членам команды выдан скин *"Чемпион хакатона"*!`;
  }

  return `😅 *Результаты командного хакатона*\n\n` +
    `Команда "${teamName}" не дотянула до цели.\n` +
    `Прогресс: *${progressPct}%* (${progress} / ${target} коммитов)\n\n` +
    `Участники:\n${memberLines}\n\n` +
    `Менеджер уже знает. #мы_старались`;
}
