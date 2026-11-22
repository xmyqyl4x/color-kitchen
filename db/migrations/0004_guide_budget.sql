CREATE TABLE ck.guide_budget (
  bucket text NOT NULL CHECK (bucket IN ('service', 'provider')),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end > window_start),
  used bigint NOT NULL CHECK (used > 0),
  PRIMARY KEY (bucket, window_start, window_end)
);
CREATE INDEX guide_budget_expiry ON ck.guide_budget (window_end, bucket, window_start);
