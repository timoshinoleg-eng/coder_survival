const TAP_HISTORY_SIZE = 30;
const ENTROPY_SOFT_THRESHOLD = 2.5;
const ENTROPY_HARD_THRESHOLD = 1.5;
const CV_SOFT_THRESHOLD = 0.15;
const CV_HARD_THRESHOLD = 0.05;
const MIN_TAPS_FOR_ANALYSIS = 10;
const BAN_COOLDOWN_MS = 60 * 1000;
const INTERVAL_BUCKET_MS = 50;

const tapHistory = new Map();

function getOrCreate(userId) {
  if (!tapHistory.has(userId)) {
    tapHistory.set(userId, { timestamps: [], bannedUntil: 0 });
  }
  return tapHistory.get(userId);
}

function shannonEntropy(intervals) {
  if (intervals.length === 0) return 0;
  const counts = {};
  for (const interval of intervals) {
    const bucket = Math.floor(interval / INTERVAL_BUCKET_MS);
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  const total = intervals.length;
  let entropy = 0;
  for (const count of Object.values(counts)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function coefficientOfVariation(intervals) {
  if (intervals.length < 2) return 1;
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean === 0) return 0;
  const variance = intervals.reduce((sum, x) => sum + (x - mean) ** 2, 0) / intervals.length;
  return Math.sqrt(variance) / mean;
}

export function analyzeAndRecordTap(userId) {
  const now = Date.now();
  const history = getOrCreate(userId);

  if (now < history.bannedUntil) {
    return {
      allowed: false,
      reason: 'pattern_ban',
      retryAfter: Math.ceil((history.bannedUntil - now) / 1000)
    };
  }

  history.timestamps.push(now);
  if (history.timestamps.length > TAP_HISTORY_SIZE) {
    history.timestamps.shift();
  }

  if (history.timestamps.length < MIN_TAPS_FOR_ANALYSIS) {
    return { allowed: true };
  }

  const intervals = [];
  for (let i = 1; i < history.timestamps.length; i++) {
    intervals.push(history.timestamps[i] - history.timestamps[i - 1]);
  }

  const entropy = shannonEntropy(intervals);
  const cv = coefficientOfVariation(intervals);

  const isHardBlock = entropy < ENTROPY_HARD_THRESHOLD || cv < CV_HARD_THRESHOLD;
  const isSoftFlag = !isHardBlock && (entropy < ENTROPY_SOFT_THRESHOLD || cv < CV_SOFT_THRESHOLD);

  if (isHardBlock) {
    history.bannedUntil = now + BAN_COOLDOWN_MS;
    console.warn('[AntiCheat] Pattern ban:', { userId, entropy: entropy.toFixed(3), cv: cv.toFixed(3) });
    return {
      allowed: false,
      reason: 'pattern_ban',
      retryAfter: BAN_COOLDOWN_MS / 1000,
      metrics: { entropy, cv }
    };
  }

  return {
    allowed: true,
    suspicious: isSoftFlag,
    metrics: isSoftFlag ? { entropy, cv } : undefined
  };
}

export function clearUserTapHistory(userId) {
  tapHistory.delete(userId);
}
