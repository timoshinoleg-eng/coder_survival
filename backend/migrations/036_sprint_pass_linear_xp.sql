-- Prompt v11.1 Task 4.2: Sprint Pass linear XP curve.
-- Keeps existing rewards but aligns required XP to 100, 200, ..., 2000.

UPDATE pass_rewards
SET required_xp = level * 100
WHERE level BETWEEN 1 AND 20;
