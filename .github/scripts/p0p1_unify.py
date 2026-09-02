from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


def sub_exact(text, pattern, replacement, label, expected=1, flags=re.S):
    updated, count = re.subn(pattern, replacement, text, flags=flags)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} replacements, got {count}")
    return updated


# P0 D4-008: one source of truth for passive stress recovery.
balance_path = Path("backend/src/config/balance.js")
balance = balance_path.read_text()
balance = replace_once(
    balance,
    "export const DEPRESSION_PASSIVE_RECOVERY_PER_HOUR = 20;",
    "export const DEPRESSION_PASSIVE_RECOVERY_PER_HOUR = 5;",
    "passive depression constant",
)

# P1 D4-009: make legacy/compatibility pass math match the production DB curve.
pass_levels = """MAX_LEVEL: 20,
    LEVELS: [
      { level: 1, requiredXp: 20 },
      { level: 2, requiredXp: 20 },
      { level: 3, requiredXp: 25 },
      { level: 4, requiredXp: 25 },
      { level: 5, requiredXp: 30 },
      { level: 6, requiredXp: 30 },
      { level: 7, requiredXp: 35 },
      { level: 8, requiredXp: 35 },
      { level: 9, requiredXp: 40 },
      { level: 10, requiredXp: 45 },
      { level: 11, requiredXp: 45 },
      { level: 12, requiredXp: 50 },
      { level: 13, requiredXp: 50 },
      { level: 14, requiredXp: 55 },
      { level: 15, requiredXp: 60 },
      { level: 16, requiredXp: 60 },
      { level: 17, requiredXp: 65 },
      { level: 18, requiredXp: 70 },
      { level: 19, requiredXp: 75 },
      { level: 20, requiredXp: 80 }
    ],"""
balance = sub_exact(
    balance,
    r"MAX_LEVEL: 50,\n\s+LEVELS: \(\(\) => \{.*?\n\s+\}\)\(\),",
    pass_levels,
    "pass curve",
)
balance = replace_once(
    balance,
    "totalStage2PassXp === 10000",
    "totalStage2PassXp === 915",
    "pass total assertion",
)
balance = replace_once(
    balance,
    "STAGE2.PASS.LEVELS.length === 50",
    "STAGE2.PASS.LEVELS.length === 20",
    "pass level assertion",
)
balance_path.write_text(balance)

progression_path = Path("backend/src/utils/progression.js")
progression = progression_path.read_text()
progression = replace_once(
    progression,
    "import {\n  MIN_IDLE_THRESHOLD_SECONDS,",
    "import {\n  DEPRESSION_PASSIVE_RECOVERY_PER_HOUR,\n  MIN_IDLE_THRESHOLD_SECONDS,",
    "progression balance import",
)
progression = replace_once(
    progression,
    "// P0 / D4-008: this is a product invariant, not an experiment. Keep the\n"
    "// passive stress relief independent from energy recovery and feature flags.\n"
    "export const DEPRESSION_PASSIVE_RECOVERY_PER_HOUR = 5;",
    "// P0 / D4-008: the product invariant lives in balance.js and is re-exported\n"
    "// here for compatibility with existing callers/tests.\n"
    "export { DEPRESSION_PASSIVE_RECOVERY_PER_HOUR };",
    "progression local passive constant",
)
progression_path.write_text(progression)

pass_path = Path("backend/src/utils/pass.js")
pass_src = pass_path.read_text()
pass_src = sub_exact(
    pass_src,
    r"export function getPassRequiredXp\(level\) \{.*?\n\}\n\nexport function calculateCatchUpXp",
    """export function getPassRequiredXp(level) {
  const normalizedLevel = Number(level || 0);
  if (!Number.isInteger(normalizedLevel) || normalizedLevel < 1 || normalizedLevel > PASS.MAX_LEVEL) {
    return null;
  }
  return PASS.LEVELS.find((entry) => entry.level === normalizedLevel)?.requiredXp ?? null;
}

export function calculateCatchUpXp""",
    "pass helper curve",
)
pass_path.write_text(pass_src)

# Quest/sprint pass XP must update player_passes, not progression.pass_state.
quests_path = Path("backend/src/routes/quests.js")
quests = quests_path.read_text()
quests = sub_exact(
    quests,
    r"\s*let passState = progression\.pass_state \|\| \{\};\n\s*let passUpdate = null;\n\n\s*if \(Number\(rewards\.passXp \|\| 0\) > 0\) \{\n\s*passUpdate = addPassXp\(passState, Number\(rewards\.passXp \|\| 0\)\);\n\s*passState = passUpdate\.newState;\n\s*\}",
    """
  let passUpdate = null;

  if (Number(rewards.passXp || 0) > 0) {
    passUpdate = await addPassXp(client, userId, Number(rewards.passXp || 0));
  }""",
    "quest DB pass award",
)
quests = sub_exact(
    quests,
    r"`UPDATE progression\n\s+SET energy = LEAST\(\$2, energy \+ \$3\),\n\s+commits_current = commits_current \+ \$4,\n\s+inventory = \$5,\n\s+pass_state = \$6\n\s+WHERE user_id = \$1`,\n\s*\[\n\s*userId,\n\s*maxEnergy,\n\s*Number\(rewards\.energy \|\| 0\),\n\s*Number\(rewards\.commitsCurrent \|\| 0\),\n\s*JSON\.stringify\(inventory\),\n\s*JSON\.stringify\(passState\)\n\s*\]",
    """`UPDATE progression
     SET energy = LEAST($2, energy + $3),
         commits_current = commits_current + $4,
         inventory = $5
     WHERE user_id = $1`,
    [
      userId,
      maxEnergy,
      Number(rewards.energy || 0),
      Number(rewards.commitsCurrent || 0),
      JSON.stringify(inventory)
    ]""",
    "quest reward progression update",
)
quests = replace_once(
    quests,
    "return { passState, passUpdate, inventory, appliedRewards: rewards };",
    "return { passUpdate, inventory, appliedRewards: rewards };",
    "quest reward return",
)
quests = sub_exact(
    quests,
    r"`UPDATE progression\n\s+SET daily_quests_state = \$2,\n\s+pass_state = \$3\n\s+WHERE user_id = \$1`,\n\s*\[userId, JSON\.stringify\(state\), JSON\.stringify\(rewardResult\.passState\)\]",
    """`UPDATE progression
       SET daily_quests_state = $2
       WHERE user_id = $1`,
      [userId, JSON.stringify(state)]""",
    "daily quest pass_state updates",
    expected=2,
)
quests = sub_exact(
    quests,
    r"`UPDATE progression\n\s+SET weekly_sprint_quest_state = \$2,\n\s+pass_state = \$3\n\s+WHERE user_id = \$1`,\n\s*\[userId, JSON\.stringify\(state\), JSON\.stringify\(rewardResult\.passState\)\]",
    """`UPDATE progression
       SET weekly_sprint_quest_state = $2
       WHERE user_id = $1`,
      [userId, JSON.stringify(state)]""",
    "weekly sprint pass_state update",
)
quests_path.write_text(quests)

# Daily login pass XP uses the same DB pass.
streak_path = Path("backend/src/routes/streak.js")
streak = streak_path.read_text()
streak = replace_once(
    streak,
    "`SELECT streak_state, pass_state, inventory",
    "`SELECT streak_state, inventory",
    "streak legacy pass select",
)
streak = sub_exact(
    streak,
    r"\s*let passState = progression\.pass_state \|\| \{\};\n\s*let passUpdate = null;\n\s*if \(Number\(rewards\.passXp \|\| 0\) > 0\) \{\n\s*passUpdate = addPassXp\(passState, Number\(rewards\.passXp \|\| 0\)\);\n\s*passState = passUpdate\.newState;\n\s*\}",
    """
    let passUpdate = null;
    if (Number(rewards.passXp || 0) > 0) {
      passUpdate = await addPassXp(client, userId, Number(rewards.passXp || 0));
    }""",
    "streak DB pass award",
)
streak = sub_exact(
    streak,
    r"`UPDATE progression\n\s+SET streak_state = \$2,\n\s+pass_state = \$3,\n\s+energy = LEAST\(\$4, energy \+ \$5\),\n\s+depression_level = GREATEST\(0, depression_level - \$6\),\n\s+is_burnout = GREATEST\(0, depression_level - \$6\) >= \$8,\n\s+inventory = \$7\n\s+WHERE user_id = \$1`,\n\s*\[\n\s*userId,\n\s*JSON\.stringify\(result\.streakState\),\n\s*JSON\.stringify\(passState\),\n\s*levelRow\.resolved\.maxEnergy,\n\s*Number\(rewards\.energy \|\| 0\),\n\s*Number\(rewards\.depressionRelief \|\| 0\),\n\s*JSON\.stringify\(inventory\),\n\s*DEPRESSION_SCALE\.HEART_ATTACK_THRESHOLD\n\s*\]",
    """`UPDATE progression
       SET streak_state = $2,
           energy = LEAST($3, energy + $4),
           depression_level = GREATEST(0, depression_level - $5),
           is_burnout = GREATEST(0, depression_level - $5) >= $7,
           inventory = $6
       WHERE user_id = $1`,
      [
        userId,
        JSON.stringify(result.streakState),
        levelRow.resolved.maxEnergy,
        Number(rewards.energy || 0),
        Number(rewards.depressionRelief || 0),
        JSON.stringify(inventory),
        DEPRESSION_SCALE.HEART_ATTACK_THRESHOLD
      ]""",
    "streak progression update",
)
streak_path.write_text(streak)

# Paid Streak Saver must arm against the player's local calendar date.
buy_path = Path("backend/src/routes/buy.js")
buy = buy_path.read_text()
buy = replace_once(
    buy,
    "`SELECT streak_state FROM progression WHERE user_id = $1 FOR UPDATE`",
    "`SELECT streak_state, timezone_offset FROM progression WHERE user_id = $1 FOR UPDATE`",
    "streak saver timezone select",
)
buy = sub_exact(
    buy,
    r"const streakState = streakResult\.rows\[0\]\?\.streak_state \|\| \{\};\n\s*const todayDate = new Date\(\)\.toISOString\(\)\.slice\(0, 10\);\n\s*const nextState = armStreakSaver\(streakState, todayDate, new Date\(\)\);",
    """const streakState = streakResult.rows[0]?.streak_state || {};
      const timezoneOffset = Number(streakResult.rows[0]?.timezone_offset ?? 180);
      const now = new Date();
      const localNow = new Date(now.getTime() + timezoneOffset * 60000);
      const todayDate = localNow.toISOString().slice(0, 10);
      const nextState = armStreakSaver(streakState, todayDate, now);""",
    "streak saver local date",
)
buy_path.write_text(buy)

# Update legacy oracle expectations to the production curve.
oracle_path = Path("backend/tests/stage2.oracles.test.js")
oracle = oracle_path.read_text()
oracle = replace_once(
    oracle,
    """test('Oracle 2: pass XP conservation', () => {
  const result = addPassXp({ currentXp: 0, claimedLevels: [] }, 21000);
  assert.strictEqual(calculatePassLevel(result.newState).currentLevel, 50);
  assert.strictEqual(calculatePassLevel(result.newState).progressToNext, 1.0);
});""",
    """test('Oracle 2: pass XP conservation', () => {
  const result = addPassXp({ currentXp: 0, claimedLevels: [] }, 915);
  assert.strictEqual(calculatePassLevel(result.newState).currentLevel, 20);
  assert.strictEqual(calculatePassLevel(result.newState).progressToNext, 1.0);
});""",
    "pass conservation oracle",
)
oracle = replace_once(
    oracle,
    """test('pass boundary: 99/100 XP plus 2 XP unlocks level 1 claimable reward', () => {
  const result = addPassXp({ currentXp: 99, claimedLevels: [] }, 2);""",
    """test('pass boundary: 19/20 XP plus 2 XP unlocks level 1 claimable reward', () => {
  const result = addPassXp({ currentXp: 19, claimedLevels: [] }, 2);""",
    "pass boundary oracle",
)
oracle = sub_exact(
    oracle,
    r"test\('sprint pass config uses 50-level tiered XP curve', \(\) => \{.*?\n\}\);",
    """test('sprint pass config mirrors the production 20-level DB curve', () => {
  assert.strictEqual(STAGE2.PASS.SEASON_DAYS, 30);
  assert.strictEqual(STAGE2.PASS.LEVELS.length, 20);
  assert.deepStrictEqual(STAGE2.PASS.LEVELS.map((level) => level.requiredXp), [
    20, 20, 25, 25, 30, 30, 35, 35, 40, 45,
    45, 50, 50, 55, 60, 60, 65, 70, 75, 80
  ]);
  assert.strictEqual(getPassRequiredXp(1), 20);
  assert.strictEqual(getPassRequiredXp(20), 80);
  assert.strictEqual(getPassRequiredXp(21), null);
});""",
    "pass config oracle",
)
oracle_path.write_text(oracle)

# Strengthen the audit regression: distinguish configured sum from actual 1→20 unlock cost.
audit_path = Path("backend/tests/p0p1AuditRequirements.test.js")
audit = audit_path.read_text()
audit = replace_once(
    audit,
    """    const requiredXp = tuples.reduce((sum, entry) => sum + entry.requiredXp, 0);
    const baselineThirtyDayXp = 120 * 30; // 1 XP/tap, excludes quests/weekend bonuses.
    expect(requiredXp).toBe(915);
    expect(requiredXp).toBeLessThanOrEqual(baselineThirtyDayXp);""",
    """    const configuredXp = tuples.reduce((sum, entry) => sum + entry.requiredXp, 0);
    // player_passes starts at level 1. Reaching level 20 consumes thresholds
    // 1..19; level 20's stored threshold would be a nonexistent 20→21 step.
    const xpToUnlockLevel20 = tuples.slice(0, -1).reduce((sum, entry) => sum + entry.requiredXp, 0);
    const baselineThirtyDayXp = 120 * 30; // 1 XP/tap, excludes quests/weekend bonuses.
    expect(configuredXp).toBe(915);
    expect(xpToUnlockLevel20).toBe(835);
    expect(xpToUnlockLevel20).toBeLessThanOrEqual(baselineThirtyDayXp);

    const questsSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/quests.js'), 'utf8');
    const streakSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/streak.js'), 'utf8');
    const buySource = fs.readFileSync(path.resolve(__dirname, '../src/routes/buy.js'), 'utf8');
    expect(questsSource).toContain('await addPassXp(client, userId');
    expect(streakSource).toContain('await addPassXp(client, userId');
    expect(questsSource).not.toContain('pass_state =');
    expect(streakSource).not.toContain('pass_state =');
    expect(buySource).toContain('streak_state, timezone_offset');
    expect(buySource).toContain('now.getTime() + timezoneOffset * 60000');""",
    "audit pass pacing assertion",
)
audit_path.write_text(audit)

for path in (
    balance_path,
    progression_path,
    pass_path,
    quests_path,
    streak_path,
    buy_path,
    oracle_path,
    audit_path,
):
    print(f"UPDATED {path}")
