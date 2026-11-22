CREATE TABLE ck.catalog_staff (
  organization_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('editor', 'publisher')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  inactive_at timestamptz CHECK (inactive_at >= granted_at),
  PRIMARY KEY (organization_id, principal_id, role),
  FOREIGN KEY (organization_id, principal_id) REFERENCES ck.project_principal
);

CREATE TABLE ck.catalog_review (
  review_id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  rev integer NOT NULL,
  edit_version bigint NOT NULL CHECK (edit_version > 0),
  organization_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  reviewer_role text GENERATED ALWAYS AS ('publisher'::text) STORED,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (item_id, rev) REFERENCES ck.catalog_revision,
  FOREIGN KEY (organization_id, reviewer_id, reviewer_role) REFERENCES ck.catalog_staff
);
CREATE INDEX catalog_review_revision ON ck.catalog_review (item_id, rev, edit_version, reviewed_at DESC);

CREATE VIEW ck.catalog_translation_coverage AS
  SELECT r.item_id, r.rev, r.edit_version,
    ARRAY(SELECT needed.locale FROM unnest(ARRAY['en','fr','es','pt','de']) WITH ORDINALITY AS needed(locale, position)
      WHERE NOT EXISTS (SELECT 1 FROM ck.catalog_text AS t
        WHERE t.item_id = r.item_id AND t.rev = r.rev AND t.locale = needed.locale)
      ORDER BY needed.position) AS missing_locales
  FROM ck.catalog_revision AS r;

CREATE TABLE ck.catalog_publication (
  item_id uuid NOT NULL REFERENCES ck.catalog_item,
  item_version bigint NOT NULL CHECK (item_version > 0),
  previous_rev integer,
  revision integer,
  action text NOT NULL CHECK (action IN ('baseline', 'publish', 'rollback', 'withdraw')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, item_version),
  CHECK (previous_rev IS DISTINCT FROM revision),
  FOREIGN KEY (item_id, previous_rev) REFERENCES ck.catalog_revision,
  FOREIGN KEY (item_id, revision) REFERENCES ck.catalog_revision
);

INSERT INTO ck.catalog_publication (item_id, item_version, revision, action)
  SELECT item_id, row_version, published_rev, 'baseline' FROM ck.catalog_item WHERE published_rev IS NOT NULL;

CREATE FUNCTION ck.record_catalog_pointer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE previous_rev integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN previous_rev := OLD.published_rev; END IF;
  IF NEW.published_rev IS DISTINCT FROM previous_rev THEN
    INSERT INTO ck.catalog_publication (item_id, item_version, previous_rev, revision, action)
    VALUES (NEW.item_id, NEW.row_version, previous_rev, NEW.published_rev,
      CASE WHEN NEW.published_rev IS NULL THEN 'withdraw'
           WHEN NEW.published_rev < previous_rev THEN 'rollback' ELSE 'publish' END);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER record_catalog_pointer AFTER INSERT OR UPDATE OF published_rev ON ck.catalog_item
  FOR EACH ROW EXECUTE FUNCTION ck.record_catalog_pointer();

CREATE FUNCTION ck.preserve_publication_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Publication and audit history is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER preserve_catalog_review BEFORE UPDATE OR DELETE ON ck.catalog_review
  FOR EACH ROW EXECUTE FUNCTION ck.preserve_publication_history();
CREATE TRIGGER preserve_catalog_publication BEFORE UPDATE OR DELETE ON ck.catalog_publication
  FOR EACH ROW EXECUTE FUNCTION ck.preserve_publication_history();
CREATE TRIGGER preserve_audit_history BEFORE UPDATE OR DELETE ON ck.audit_event
  FOR EACH ROW EXECUTE FUNCTION ck.preserve_publication_history();
