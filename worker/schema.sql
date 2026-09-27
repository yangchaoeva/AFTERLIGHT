CREATE TABLE IF NOT EXISTS afterlight_leaderboard_runs (
  run_id UUID PRIMARY KEY,
  player_id UUID NOT NULL,
  nickname VARCHAR(20) NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('CN', 'NA', 'EU', 'OTHER')),
  track_id TEXT NOT NULL CHECK (track_id IN ('coast', 'harbor', 'mountain')),
  mode TEXT NOT NULL CHECK (mode IN ('race', 'time')),
  theme TEXT NOT NULL CHECK (theme IN ('day', 'night')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  vehicle_id TEXT NOT NULL CHECK (vehicle_id IN ('aurora', 'kasumi', 'vesper', 'nightslash', 'tempest')),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms BETWEEN 10000 AND 1800000),
  placement SMALLINT CHECK (placement BETWEEN 1 AND 8),
  best_lap_ms INTEGER CHECK (best_lap_ms BETWEEN 3000 AND elapsed_ms),
  penalty_ms INTEGER NOT NULL DEFAULT 0 CHECK (penalty_ms BETWEEN 0 AND 300000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((mode = 'race' AND placement IS NOT NULL AND best_lap_ms IS NOT NULL)
      OR (mode = 'time' AND placement IS NULL AND best_lap_ms IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS afterlight_lb_board_idx
  ON afterlight_leaderboard_runs (track_id, mode, theme, difficulty, region, elapsed_ms, placement);
CREATE INDEX IF NOT EXISTS afterlight_lb_player_idx
  ON afterlight_leaderboard_runs (player_id, track_id, mode, theme, difficulty);
