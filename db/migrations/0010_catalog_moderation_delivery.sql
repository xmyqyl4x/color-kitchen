CREATE TABLE ck.catalog_translation_source (
  item_id uuid NOT NULL,
  rev integer NOT NULL,
  locale ck.locale NOT NULL CHECK (locale <> 'en'),
  source_digest text NOT NULL CHECK (source_digest = '' OR source_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (item_id, rev, locale),
  FOREIGN KEY (item_id, rev, locale) REFERENCES ck.catalog_text ON DELETE CASCADE
);

CREATE TABLE ck.catalog_invalidation (
  item_id uuid NOT NULL,
  item_version bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  finished_at timestamptz,
  last_failure_at timestamptz,
  PRIMARY KEY (item_id, item_version),
  FOREIGN KEY (item_id, item_version) REFERENCES ck.catalog_publication,
  CHECK (finished_at IS NULL OR lease_id IS NULL)
);
CREATE INDEX catalog_invalidation_due ON ck.catalog_invalidation (available_at, item_id, item_version)
  WHERE finished_at IS NULL;
