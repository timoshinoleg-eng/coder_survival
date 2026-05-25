import { DEFAULTS } from '../config/balance.js';

export function getFtueAdRule(accountAgeMinutes = 0) {
  const age = Math.max(0, Number(accountAgeMinutes || 0));
  return DEFAULTS.ADS.ftueAdRules.find((rule) => age >= rule.minMinutes && age < rule.maxMinutes)
    || DEFAULTS.ADS.ftueAdRules[DEFAULTS.ADS.ftueAdRules.length - 1];
}

export function getAccountAgeMinutes(createdAt, now = new Date()) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60000));
}

export function evaluateFtueAdAvailability({ createdAt, adsClaimedToday = 0, now = new Date() }) {
  const accountAgeMinutes = getAccountAgeMinutes(createdAt, now);
  const rule = getFtueAdRule(accountAgeMinutes);

  if (rule.rule === 'no_ads_shown') {
    return {
      allowed: false,
      reason: 'ftue_ads_blocked',
      accountAgeMinutes,
      rule: rule.rule
    };
  }

  if (rule.rule === 'max_1_ad' && Number(adsClaimedToday || 0) >= 1) {
    return {
      allowed: false,
      reason: 'ftue_ads_limited',
      accountAgeMinutes,
      rule: rule.rule
    };
  }

  return {
    allowed: true,
    reason: null,
    accountAgeMinutes,
    rule: rule.rule
  };
}
