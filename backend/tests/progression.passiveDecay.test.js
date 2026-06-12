import { recoverProgression } from "../src/utils/progression.js";

describe("recoverProgression passive depression decay", () => {
  test("full energy plus at least one idle hour decreases depression and persists event state", async () => {
    const queries = [];
    const client = {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };
    const now = Date.now();
    const progression = {
      user_id: 42,
      energy: 100,
      depression_level: 20,
      is_burnout: false,
      created_at: new Date(now - 2 * 60 * 60 * 1000),
      last_energy_activity_at: new Date(now - 60 * 60 * 1000),
      energy_recovery_checkpoint_at: new Date(now - 60 * 60 * 1000),
      event_state: {
        randomEventState: {
          productionAlertUntil: new Date(now - 10 * 60 * 1000).toISOString(),
          productionAlertLastAppliedAt: new Date(now - 60 * 60 * 1000).toISOString(),
        },
      },
    };

    const result = await recoverProgression(client, progression, 100);

    expect(result.energy).toBe(100);
    // DEPRESSION_PASSIVE_RECOVERY_PER_HOUR = 20, so 1 hour of idle decay brings 20 -> 0 (clamped)
    expect(result.depression_level).toBe(0);
    expect(result.event_state.randomEventState).toEqual(progression.event_state.randomEventState);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("UPDATE progression");
    // persistIdleSideEffects params: [user_id, depression, is_burnout, burnout_affliction, energy, event_state]
    expect(queries[0].params[1]).toBe(0);
    expect(queries[0].params[2]).toBe(false);
    expect(queries[0].params[3]).toBe(false);
    expect(queries[0].params[4]).toBe(100);
  });
});
