import { randomBytes } from "crypto";
import { DEFAULTS } from '../config/balance.js';

const { SQUADS } = DEFAULTS;
const TEAM_MEMBERSHIP_CACHE_TTL_MS = Number(process.env.TEAM_MEMBERSHIP_CACHE_TTL_MS || 60000);
const teamMembershipCache = new Map();

/**
 * Teams / Squads v1
 * - Up to 5 members
 - Very simple aggregation
 - No PvP, no complex permissions
 */

function generateInviteCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function setTeamMembershipCache(userId, teamId) {
  teamMembershipCache.set(Number(userId), {
    teamId: teamId ? Number(teamId) : null,
    expiresAt: Date.now() + TEAM_MEMBERSHIP_CACHE_TTL_MS,
  });
}

function getTeamMembershipCache(userId) {
  const cached = teamMembershipCache.get(Number(userId));
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    teamMembershipCache.delete(Number(userId));
    return undefined;
  }
  return cached.teamId;
}

function clearTeamMembershipCache(userId) {
  teamMembershipCache.delete(Number(userId));
}

export function hasMissedYesterday(lastActiveAt, now = new Date()) {
  if (!lastActiveAt) return true;
  const active = new Date(lastActiveAt);
  if (Number.isNaN(active.getTime())) return true;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  return active.getTime() < yesterdayStart;
}

export function getSquadPassiveLocMultiplier({ activeMembers = 0, totalMembers = 0, joinedAt = null, missedYesterdayByAnyMember = false, now = new Date() }) {
  const active = Math.max(0, Number(activeMembers || 0));
  const total = Math.max(1, Number(totalMembers || 0));
  let multiplier = SQUADS.teamBonusTarget.baseMultiplier + (active / total) * 0.5;

  if (missedYesterdayByAnyMember) {
    multiplier *= (1 - SQUADS.socialObligation.reductionPercent / 100);
  }

  if (joinedAt) {
    const joined = new Date(joinedAt);
    if (!Number.isNaN(joined.getTime())) {
      const daysSinceJoin = Math.floor((now.getTime() - joined.getTime()) / 86400000);
      if (daysSinceJoin < 7) {
        multiplier *= SQUADS.firstSquadBonus.multiplier;
      }
    }
  }

  return Number(multiplier.toFixed(3));
}

export async function createTeam(client, userId, name) {
  // Check if user already in a team
  const existing = await client.query(
    `SELECT team_id FROM team_members WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    return { error: "Already in a team", status: 409 };
  }

  const inviteCode = generateInviteCode();
  const teamResult = await client.query(
    `INSERT INTO teams (name, invite_code)
     VALUES ($1, $2)
     RETURNING *`,
    [name.slice(0, 64), inviteCode],
  );
  const team = teamResult.rows[0];

  await client.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'leader')`,
    [team.id, userId],
  );
  setTeamMembershipCache(userId, team.id);

  return { team, status: 200 };
}

export async function joinTeam(client, userId, inviteCode) {
  const teamResult = await client.query(
    `SELECT * FROM teams WHERE invite_code = $1`,
    [inviteCode.toUpperCase()],
  );
  if (teamResult.rows.length === 0) {
    return { error: "Team not found", status: 404 };
  }
  const team = teamResult.rows[0];

  const existing = await client.query(
    `SELECT 1 FROM team_members WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    return { error: "Already in a team", status: 409 };
  }

  const memberCountResult = await client.query(
    `SELECT COUNT(*) as cnt FROM team_members WHERE team_id = $1`,
    [team.id],
  );
  const memberCount = parseInt(memberCountResult.rows[0].cnt, 10);
  if (memberCount >= 5) {
    return { error: "Team is full", status: 409 };
  }

  await client.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'member')`,
    [team.id, userId],
  );
  setTeamMembershipCache(userId, team.id);

  return { team, status: 200 };
}

export async function getMyTeam(client, userId) {
  const memberResult = await client.query(
    `SELECT team_id, role FROM team_members WHERE user_id = $1`,
    [userId],
  );
  if (memberResult.rows.length === 0) return null;

  const { team_id, role } = memberResult.rows[0];

  const teamResult = await client.query(`SELECT * FROM teams WHERE id = $1`, [
    team_id,
  ]);
  const team = teamResult.rows[0];

  const membersResult = await client.query(
    `SELECT tm.user_id, tm.role, tm.joined_at, tm.last_active_at,
            u.username, u.first_name,
            COALESCE(p.commits_total, 0) as commits_total
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     LEFT JOIN progression p ON p.user_id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`,
    [team_id],
  );

  const now = new Date();
  const activeMembers = membersResult.rows.filter((row) => row.last_active_at && !hasMissedYesterday(row.last_active_at, now)).length;
  const missedYesterdayByAnyMember = membersResult.rows.some((row) => hasMissedYesterday(row.last_active_at, now));
  const joinedAt = membersResult.rows.find((row) => row.user_id === userId)?.joined_at || null;
  const passiveLocMultiplier = getSquadPassiveLocMultiplier({
    activeMembers,
    totalMembers: membersResult.rows.length,
    joinedAt,
    missedYesterdayByAnyMember,
    now
  });

  return {
    team,
    myRole: role,
    passiveLocMultiplier,
    socialObligationActive: missedYesterdayByAnyMember,
    activeMembers,
    timezone: SQUADS.timezone,
    members: membersResult.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      firstName: r.first_name,
      role: r.role,
      joinedAt: r.joined_at,
      lastActiveAt: r.last_active_at,
      commitsTotal: parseInt(r.commits_total, 10),
    })),
  };
}

export async function leaveTeam(client, userId) {
  const memberResult = await client.query(
    `SELECT team_id, role FROM team_members WHERE user_id = $1`,
    [userId],
  );
  if (memberResult.rows.length === 0) {
    return { error: "Not in a team", status: 404 };
  }

  const { team_id, role } = memberResult.rows[0];

  await client.query(`DELETE FROM team_members WHERE user_id = $1`, [userId]);
  clearTeamMembershipCache(userId);

  // If leader left, promote oldest member or delete empty team
  if (role === "leader") {
    const remaining = await client.query(
      `SELECT user_id FROM team_members WHERE team_id = $1 ORDER BY joined_at ASC LIMIT 1`,
      [team_id],
    );
    if (remaining.rows.length > 0) {
      await client.query(
        `UPDATE team_members SET role = 'leader' WHERE user_id = $1`,
        [remaining.rows[0].user_id],
      );
    } else {
      await client.query(`DELETE FROM teams WHERE id = $1`, [team_id]);
    }
  }

  return { status: 200 };
}

export async function getTeamLeaderboard(client) {
  const result = await client.query(
    `SELECT t.id, t.name, t.invite_code, t.total_commits,
            COUNT(tm.user_id) as member_count
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     GROUP BY t.id
     ORDER BY t.total_commits DESC
     LIMIT 20`,
  );

  return result.rows.map((r, idx) => ({
    rank: idx + 1,
    teamId: r.id,
    name: r.name,
    inviteCode: r.invite_code,
    totalCommits: parseInt(r.total_commits, 10),
    memberCount: parseInt(r.member_count, 10),
  }));
}

export async function updateTeamProgress(client, userId, commitsDelta) {
  if (!Number.isFinite(commitsDelta) || commitsDelta <= 0) {
    return null;
  }

  let teamId = getTeamMembershipCache(userId);
  if (teamId === null) return null;

  if (teamId === undefined) {
    const memberResult = await client.query(
      `SELECT team_id FROM team_members WHERE user_id = $1`,
      [userId],
    );
    if (memberResult.rows.length === 0) {
      setTeamMembershipCache(userId, null);
      return null;
    }
    teamId = memberResult.rows[0].team_id;
    setTeamMembershipCache(userId, teamId);
  }

  await client.query(
    `UPDATE teams
     SET total_commits = total_commits + $2,
         created_at = created_at
     WHERE id = $1`,
    [teamId, commitsDelta],
  );

  await client.query(
    `UPDATE team_members
     SET last_active_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );

  const seasonResult = await client.query(
    `SELECT id
     FROM team_battle_seasons
     WHERE status = 'active'
       AND start_date <= NOW()
       AND end_date >= NOW()
     ORDER BY start_date DESC
     LIMIT 1`,
    [],
  );

  if (seasonResult.rows.length > 0) {
    const seasonId = seasonResult.rows[0].id;
    await client.query(
      `INSERT INTO team_battle_contributions (season_id, team_id, user_id, commits_contributed, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (season_id, user_id) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         commits_contributed = team_battle_contributions.commits_contributed + EXCLUDED.commits_contributed,
         updated_at = NOW()`,
      [seasonId, teamId, userId, commitsDelta],
    );
  }

  return { teamId, commitsDelta, seasonId: seasonResult.rows[0]?.id || null };
}
