export async function applyHeartAttackReset(client, userId, { sessionId = null } = {}) {
  await client.query(
    `UPDATE progression
     SET active_effects = '{}',
         session_started_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );

  if (sessionId) {
    await client.query(
      `UPDATE sessions
       SET commits_earned = 0
       WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
  } else {
    await client.query(
      `UPDATE sessions
       SET commits_earned = 0
       WHERE user_id = $1
         AND ended_at IS NULL`,
      [userId]
    );
  }

  return {
    resetFields: ['session.loc_earned_this_session', 'session.active_boosters', 'session.temporary_multipliers'],
    preserveFields: ['lifetime.loc_total', 'lifetime.prestige_currency', 'lifetime.generators_owned', 'lifetime.unlocked_skins', 'battle_pass.xp_total', 'battle_pass.claimed_rewards', 'streak.days', 'squads.membership', 'inventory.consumables']
  };
}
