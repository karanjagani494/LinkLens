ALTER TABLE scan ADD COLUMN state text NOT NULL DEFAULT 'completed' CHECK (state IN ('queued','running','completed','failed'));
ALTER TABLE scan ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX scan_work_state_idx ON scan(state,updated_at) WHERE state IN ('queued','running');
