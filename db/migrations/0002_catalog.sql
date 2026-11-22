CREATE DOMAIN ck.locale AS text CHECK (VALUE IN ('en', 'fr', 'es', 'pt', 'de'));

CREATE TABLE ck.catalog_item (
  item_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('palette', 'gradient', 'color', 'font', 'template', 'policy')),
  slug text NOT NULL CHECK (length(slug) <= 100 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  published_rev integer,
  featured_rank integer CHECK (featured_rank >= 0),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug),
  CHECK (kind <> 'policy' OR slug IN ('licensing', 'terms', 'privacy', 'cookies'))
);

CREATE TABLE ck.catalog_revision (
  item_id uuid NOT NULL REFERENCES ck.catalog_item,
  rev integer NOT NULL CHECK (rev > 0),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  edit_version bigint NOT NULL DEFAULT 1 CHECK (edit_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  origin text NOT NULL CHECK (origin IN ('original', 'licensed')),
  source_uri text,
  source_version text,
  license_id text NOT NULL CHECK (btrim(license_id) <> ''),
  license_uri text,
  attribution text,
  source_digest text CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz,
  sealed_at timestamptz,
  PRIMARY KEY (item_id, rev),
  CHECK (
    (origin = 'original' AND NULLIF(btrim(attribution), '') IS NOT NULL)
    OR (origin = 'licensed' AND NULLIF(btrim(source_uri), '') IS NOT NULL
        AND NULLIF(btrim(license_uri), '') IS NOT NULL
        AND (NULLIF(btrim(source_version), '') IS NOT NULL OR source_digest IS NOT NULL))
  )
);

ALTER TABLE ck.catalog_item ADD FOREIGN KEY (item_id, published_rev)
  REFERENCES ck.catalog_revision (item_id, rev) DEFERRABLE;

CREATE TABLE ck.catalog_text (
  item_id uuid NOT NULL,
  rev integer NOT NULL,
  locale ck.locale NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  summary text NOT NULL CHECK (btrim(summary) <> ''),
  body text,
  PRIMARY KEY (item_id, rev, locale),
  FOREIGN KEY (item_id, rev) REFERENCES ck.catalog_revision
);

CREATE TABLE ck.tag (
  tag_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (length(slug) <= 100 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  facet text NOT NULL CHECK (facet IN ('hue', 'mood', 'use', 'style')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ck.tag_text (
  tag_id uuid NOT NULL REFERENCES ck.tag,
  locale ck.locale NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  PRIMARY KEY (tag_id, locale)
);

CREATE TABLE ck.catalog_revision_tag (
  item_id uuid NOT NULL,
  rev integer NOT NULL,
  tag_id uuid NOT NULL REFERENCES ck.tag,
  PRIMARY KEY (item_id, rev, tag_id),
  FOREIGN KEY (item_id, rev) REFERENCES ck.catalog_revision
);
CREATE INDEX catalog_revision_tag_filter ON ck.catalog_revision_tag (tag_id, item_id, rev);
CREATE INDEX catalog_featured ON ck.catalog_item (kind, featured_rank, item_id) WHERE published_rev IS NOT NULL;

CREATE FUNCTION ck.valid_catalog_color(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE channels jsonb := value->'components';
DECLARE color_space text := value->>'space';
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object'
      OR jsonb_typeof(channels) IS DISTINCT FROM 'array'
      OR jsonb_typeof(value->'alpha') IS DISTINCT FROM 'number' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(channels) <> 3 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(channels) AS channel WHERE jsonb_typeof(channel) <> 'number'
  ) OR (value->>'alpha')::numeric NOT BETWEEN 0 AND 1 THEN
    RETURN false;
  END IF;
  IF color_space IN ('srgb', 'display-p3') THEN
    RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(channels) AS channel WHERE channel::numeric NOT BETWEEN 0 AND 1);
  END IF;
  IF color_space = 'oklch' THEN
    RETURN (channels->>0)::numeric BETWEEN 0 AND 1
      AND (channels->>1)::numeric >= 0
      AND (channels->>2)::numeric >= 0 AND (channels->>2)::numeric < 360;
  END IF;
  RETURN false;
END $$;

CREATE FUNCTION ck.check_catalog_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE item_kind text;
DECLARE stop jsonb;
DECLARE position numeric;
DECLARE previous_position numeric := -1;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sealed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Insert an unsealed revision before publication' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sealed revisions are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF (NEW.item_id, NEW.rev) IS DISTINCT FROM (OLD.item_id, OLD.rev) THEN
    RAISE EXCEPTION 'Revision identities are immutable' USING ERRCODE = '23514';
  END IF;

  SELECT i.kind INTO item_kind FROM ck.catalog_item AS i WHERE i.item_id = NEW.item_id FOR UPDATE;
  IF NEW.sealed_at IS NULL THEN
    NEW.edit_version := OLD.edit_version + 1;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'sealed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'sealed_at') THEN
    RAISE EXCEPTION 'Publication seals the reviewed content without editing it' USING ERRCODE = '23514';
  END IF;
  IF NEW.schema_version <> 1 THEN
    RAISE EXCEPTION 'Unsupported catalog schema version' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM ck.catalog_text WHERE item_id = NEW.item_id AND rev = NEW.rev) <> 5 THEN
    RAISE EXCEPTION 'Publication requires all five locales' USING ERRCODE = '23514';
  END IF;
  IF item_kind = 'policy' AND (NEW.effective_at IS NULL OR NEW.effective_at > statement_timestamp()
      OR EXISTS (SELECT 1 FROM ck.catalog_text WHERE item_id = NEW.item_id AND rev = NEW.rev
        AND NULLIF(btrim(body), '') IS NULL)) THEN
    RAISE EXCEPTION 'Policy publication requires effective time and all translated bodies' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM ck.tag
    WHERE tag_id IN (SELECT tag_id FROM ck.catalog_revision_tag WHERE item_id = NEW.item_id AND rev = NEW.rev)
    ORDER BY tag_id FOR SHARE;
  IF EXISTS (SELECT 1 FROM ck.catalog_revision_tag AS rt
      WHERE rt.item_id = NEW.item_id AND rt.rev = NEW.rev
      AND (SELECT count(*) FROM ck.tag_text WHERE tag_id = rt.tag_id) <> 5) THEN
    RAISE EXCEPTION 'Published tags require all five labels' USING ERRCODE = '23514';
  END IF;
  CASE item_kind
    WHEN 'palette' THEN
      IF jsonb_typeof(NEW.payload->'swatches') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'A palette requires swatches' USING ERRCODE = '23514';
      END IF;
      IF jsonb_array_length(NEW.payload->'swatches') NOT BETWEEN 2 AND 12 THEN
        RAISE EXCEPTION 'A palette requires between two and twelve swatches' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.payload->'swatches') AS swatch
        WHERE COALESCE(swatch->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
          OR NOT ck.valid_catalog_color(swatch->'color')
      ) OR (SELECT count(DISTINCT swatch->>'id') FROM jsonb_array_elements(NEW.payload->'swatches') AS swatch)
        <> jsonb_array_length(NEW.payload->'swatches') THEN
        RAISE EXCEPTION 'Palette swatches need valid colors and unique IDs' USING ERRCODE = '23514';
      END IF;
      IF NEW.payload ? 'roles' THEN
        IF jsonb_typeof(NEW.payload->'roles') <> 'object' OR EXISTS (
          SELECT 1 FROM jsonb_each_text(NEW.payload->'roles') AS role_binding
          WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.payload->'swatches') AS swatch WHERE swatch->>'id' = role_binding.value
          )
        ) THEN
          RAISE EXCEPTION 'Palette roles must reference its swatches' USING ERRCODE = '23514';
        END IF;
      END IF;
    WHEN 'gradient' THEN
      IF jsonb_typeof(NEW.payload->'stops') IS DISTINCT FROM 'array'
          OR COALESCE(NEW.payload->>'type', '') NOT IN ('linear', 'radial', 'conic') THEN
        RAISE EXCEPTION 'A gradient requires a supported type and stops' USING ERRCODE = '23514';
      END IF;
      IF jsonb_array_length(NEW.payload->'stops') NOT BETWEEN 2 AND 12 THEN
        RAISE EXCEPTION 'A gradient requires between two and twelve stops' USING ERRCODE = '23514';
      END IF;
      FOR stop IN SELECT * FROM jsonb_array_elements(NEW.payload->'stops') LOOP
        IF jsonb_typeof(stop->'position') IS DISTINCT FROM 'number' OR NOT ck.valid_catalog_color(stop->'color') THEN
          RAISE EXCEPTION 'Gradient stops require positions and valid colors' USING ERRCODE = '23514';
        END IF;
        position := (stop->>'position')::numeric;
        IF position NOT BETWEEN 0 AND 1 OR position < previous_position THEN
          RAISE EXCEPTION 'Gradient stops must be ordered from zero to one' USING ERRCODE = '23514';
        END IF;
        previous_position := position;
      END LOOP;
    WHEN 'color' THEN
      IF NOT ck.valid_catalog_color(NEW.payload->'color') THEN
        RAISE EXCEPTION 'A color record requires a value' USING ERRCODE = '23514';
      END IF;
    WHEN 'font' THEN
      IF NEW.origin <> 'licensed' OR NEW.source_digest IS NULL
          OR NULLIF(btrim(NEW.payload->>'family'), '') IS NULL THEN
        RAISE EXCEPTION 'A font requires licensing, family, and source checksum' USING ERRCODE = '23514';
      END IF;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END $$;

CREATE TRIGGER catalog_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON ck.catalog_revision
  FOR EACH ROW EXECUTE FUNCTION ck.check_catalog_revision();

CREATE FUNCTION ck.check_catalog_child() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE target_item uuid;
DECLARE target_rev integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.item_id, NEW.rev) IS DISTINCT FROM (OLD.item_id, OLD.rev) THEN
    RAISE EXCEPTION 'Catalog children cannot move between revisions' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    target_item := OLD.item_id;
    target_rev := OLD.rev;
  ELSE
    target_item := NEW.item_id;
    target_rev := NEW.rev;
  END IF;
  PERFORM 1 FROM ck.catalog_item WHERE item_id = target_item FOR UPDATE;
  UPDATE ck.catalog_revision
    SET edit_version = edit_version + 1
    WHERE item_id = target_item AND rev = target_rev AND sealed_at IS NULL;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM ck.catalog_revision WHERE item_id = target_item AND rev = target_rev) THEN
      RAISE EXCEPTION 'Children of sealed revisions are immutable' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'Catalog revision does not exist' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER catalog_text_guard BEFORE INSERT OR UPDATE OR DELETE ON ck.catalog_text
  FOR EACH ROW EXECUTE FUNCTION ck.check_catalog_child();
CREATE TRIGGER catalog_tag_guard BEFORE INSERT OR UPDATE OR DELETE ON ck.catalog_revision_tag
  FOR EACH ROW EXECUTE FUNCTION ck.check_catalog_child();

CREATE FUNCTION ck.check_tag_label() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM ck.tag WHERE tag_id = OLD.tag_id FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.tag_id, NEW.locale) IS DISTINCT FROM (OLD.tag_id, OLD.locale) THEN
      RAISE EXCEPTION 'Tag label identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM ck.catalog_revision_tag AS rt JOIN ck.catalog_revision AS r USING (item_id, rev)
      WHERE rt.tag_id = OLD.tag_id AND r.sealed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Sealed revisions require complete tag labels' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER tag_text_guard BEFORE UPDATE OR DELETE ON ck.tag_text
  FOR EACH ROW EXECUTE FUNCTION ck.check_tag_label();

CREATE FUNCTION ck.check_catalog_pointer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.item_id, NEW.kind, NEW.slug) IS DISTINCT FROM (OLD.item_id, OLD.kind, OLD.slug) THEN
    RAISE EXCEPTION 'Public catalog identities are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.published_rev IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ck.catalog_revision WHERE item_id = NEW.item_id AND rev = NEW.published_rev AND sealed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The public pointer must reference a sealed revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_pointer_guard BEFORE INSERT OR UPDATE ON ck.catalog_item
  FOR EACH ROW EXECUTE FUNCTION ck.check_catalog_pointer();

CREATE FUNCTION ck.publish_catalog_revision(target_item uuid, target_rev integer,
    expected_item_version bigint, expected_edit_version bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE item ck.catalog_item%ROWTYPE;
DECLARE revision ck.catalog_revision%ROWTYPE;
DECLARE result bigint;
BEGIN
  SELECT * INTO STRICT item FROM ck.catalog_item WHERE item_id = target_item FOR UPDATE;
  SELECT * INTO STRICT revision FROM ck.catalog_revision WHERE item_id = target_item AND rev = target_rev FOR UPDATE;
  IF item.row_version IS DISTINCT FROM expected_item_version OR revision.edit_version IS DISTINCT FROM expected_edit_version THEN
    RAISE EXCEPTION 'Catalog revision precondition failed' USING ERRCODE = 'P0412';
  END IF;
  IF item.published_rev = target_rev THEN RETURN item.row_version; END IF;
  IF revision.sealed_at IS NULL THEN
    UPDATE ck.catalog_revision SET sealed_at = statement_timestamp() WHERE item_id = target_item AND rev = target_rev;
  END IF;
  UPDATE ck.catalog_item SET published_rev = target_rev, row_version = row_version + 1
    WHERE item_id = target_item RETURNING row_version INTO result;
  RETURN result;
END $$;

CREATE VIEW ck.published_catalog AS
  SELECT i.item_id, i.kind, i.slug, i.featured_rank, r.rev, r.schema_version, r.payload,
    r.origin, r.source_uri, r.source_version, r.source_digest, r.license_id, r.license_uri,
    r.attribution, r.effective_at, t.locale, t.title, t.summary, t.body
  FROM ck.catalog_item AS i
  JOIN ck.catalog_revision AS r ON (r.item_id, r.rev) = (i.item_id, i.published_rev) AND r.sealed_at IS NOT NULL
  JOIN ck.catalog_text AS t ON (t.item_id, t.rev) = (r.item_id, r.rev);
