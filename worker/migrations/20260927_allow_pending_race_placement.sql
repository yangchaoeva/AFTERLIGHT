-- Race results are submitted as soon as the player finishes. AI placement may
-- still be unknown, so retain elapsed time while allowing a NULL placement.
ALTER TABLE afterlight_leaderboard_runs
  DROP CONSTRAINT IF EXISTS afterlight_leaderboard_runs_check1,
  ADD CONSTRAINT afterlight_leaderboard_race_placement_check
    CHECK (
      (mode = 'race' AND (placement IS NULL OR placement BETWEEN 1 AND 8) AND best_lap_ms IS NOT NULL)
      OR (mode = 'time' AND placement IS NULL AND best_lap_ms IS NOT NULL)
    );
