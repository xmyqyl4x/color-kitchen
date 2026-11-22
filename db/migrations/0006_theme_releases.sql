CREATE TABLE ck.asset (
  asset_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('palette', 'theme')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120 AND name ~ '[^[:space:]]'),
  head_rev integer,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz CHECK (archived_at >= created_at),
  UNIQUE (organization_id, project_id, asset_id),
  FOREIGN KEY (organization_id, project_id) REFERENCES ck.project (organization_id, project_id)
);
CREATE INDEX asset_project_list ON ck.asset (organization_id, project_id, archived_at, asset_id);

CREATE FUNCTION ck.valid_asset_snapshot(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE swatches jsonb := value->'swatches';
DECLARE roles jsonb := value->'roles';
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR jsonb_typeof(swatches) IS DISTINCT FROM 'array'
      OR jsonb_typeof(roles) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(swatches) NOT BETWEEN 1 AND 12 OR (value - ARRAY['swatches','roles']) <> '{}'::jsonb
    THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(swatches) AS swatch
    WHERE CASE WHEN jsonb_typeof(swatch) = 'object' AND jsonb_typeof(swatch->'color') = 'object' THEN
      jsonb_typeof(swatch->'id') IS DISTINCT FROM 'string'
        OR (swatch->>'id') !~ '^[A-Za-z0-9_-]{1,64}$' OR (swatch - ARRAY['id','color']) <> '{}'::jsonb
        OR ck.valid_catalog_color(swatch->'color') IS DISTINCT FROM true
        OR ((swatch->'color') - ARRAY['space','components','alpha']) <> '{}'::jsonb
      ELSE true END
  ) AND (SELECT count(DISTINCT swatch->>'id') FROM jsonb_array_elements(swatches) AS swatch) = jsonb_array_length(swatches)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(roles) AS role(key, target)
      WHERE key !~ '^[a-z][a-z0-9.-]{0,63}$' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(swatches) AS swatch WHERE swatch->'id' = target
      )
    );
END $$;

CREATE FUNCTION ck.theme_role_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
RETURN ARRAY['scene.background', 'tile.text', 'selection.fill', 'selection.outline', 'action.primary', 'action.label'];

CREATE TABLE ck.asset_revision (
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  rev integer NOT NULL CHECK (rev > 0),
  schema_version smallint NOT NULL CHECK (schema_version = 1),
  payload jsonb NOT NULL CHECK (ck.valid_asset_snapshot(payload)),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  author_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  source_item_id uuid,
  source_rev integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, project_id, asset_id, rev),
  UNIQUE (asset_id, operation_id),
  FOREIGN KEY (organization_id, project_id, asset_id) REFERENCES ck.asset (organization_id, project_id, asset_id),
  FOREIGN KEY (organization_id, author_id) REFERENCES ck.project_principal,
  FOREIGN KEY (source_item_id, source_rev) REFERENCES ck.catalog_revision (item_id, rev) MATCH FULL
);
ALTER TABLE ck.asset ADD FOREIGN KEY (organization_id, project_id, asset_id, head_rev)
  REFERENCES ck.asset_revision DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION ck.check_asset_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Asset revisions are immutable' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(NEW.payload->'roles') = 'object'
      AND EXISTS (SELECT 1 FROM ck.asset WHERE asset_id = NEW.asset_id AND kind = 'theme')
      AND EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.payload->'roles') AS role WHERE role <> ALL(ck.theme_role_keys())) THEN
    RAISE EXCEPTION 'Theme revision has an unknown role' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_asset_revision BEFORE INSERT OR UPDATE OR DELETE ON ck.asset_revision
  FOR EACH ROW EXECUTE FUNCTION ck.check_asset_revision();

CREATE TABLE ck.asset_release (
  release_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  rev integer NOT NULL,
  audience text NOT NULL DEFAULT 'project' CHECK (audience IN ('project', 'public')),
  released_by uuid NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_by uuid,
  withdrawn_at timestamptz CHECK (withdrawn_at >= released_at),
  CHECK ((withdrawn_by IS NULL) = (withdrawn_at IS NULL)),
  FOREIGN KEY (organization_id, project_id, asset_id, rev) REFERENCES ck.asset_revision,
  FOREIGN KEY (organization_id, released_by) REFERENCES ck.project_principal,
  FOREIGN KEY (organization_id, withdrawn_by) REFERENCES ck.project_principal
);
CREATE UNIQUE INDEX asset_one_active_release ON ck.asset_release (asset_id) WHERE withdrawn_at IS NULL;

CREATE FUNCTION ck.check_asset_release() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.withdrawn_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM ck.asset_revision AS r JOIN ck.asset AS a USING (organization_id, project_id, asset_id)
      WHERE (r.organization_id, r.project_id, r.asset_id, r.rev) = (NEW.organization_id, NEW.project_id, NEW.asset_id, NEW.rev)
        AND (a.kind <> 'theme' OR NOT ((r.payload->'roles') ?& ck.theme_role_keys()))
    ) THEN
      RAISE EXCEPTION 'A new release requires a complete theme revision' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'DELETE' OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
      OR (to_jsonb(NEW) - 'withdrawn_by' - 'withdrawn_at') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawn_by' - 'withdrawn_at') THEN
    RAISE EXCEPTION 'A release may only be withdrawn once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_asset_release BEFORE INSERT OR UPDATE OR DELETE ON ck.asset_release
  FOR EACH ROW EXECUTE FUNCTION ck.check_asset_release();

CREATE TABLE ck.audit_event (
  event_id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('member', 'staff')),
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  resource_kind text NOT NULL CHECK (resource_kind IN ('project','theme','catalog')),
  resource_id uuid NOT NULL,
  project_id uuid,
  correlation_id uuid NOT NULL,
  before_rev integer CHECK (before_rev > 0),
  after_rev integer CHECK (after_rev > 0),
  reason_code text CHECK (reason_code ~ '^[a-z][a-z0-9_-]{0,63}$'),
  FOREIGN KEY (organization_id, actor_id) REFERENCES ck.project_principal,
  FOREIGN KEY (organization_id, project_id) REFERENCES ck.project (organization_id, project_id)
);
CREATE INDEX audit_resource_history ON ck.audit_event (resource_kind, resource_id, occurred_at DESC, event_id DESC);

CREATE TABLE ck.command_receipt (
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  command text NOT NULL CHECK (command ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  resource_kind text NOT NULL CHECK (resource_kind IN ('project','theme','catalog')),
  resource_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at >= created_at + interval '48 hours'),
  http_status smallint CHECK (http_status BETWEEN 200 AND 299),
  result jsonb CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 1024),
  CHECK ((http_status IS NULL) = (result IS NULL)),
  PRIMARY KEY (organization_id, actor_id, operation_id),
  FOREIGN KEY (organization_id, actor_id) REFERENCES ck.project_principal
);
CREATE INDEX command_receipt_expiry ON ck.command_receipt (expires_at);

CREATE FUNCTION ck.preserve_command_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.expires_at <= now() THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND OLD.http_status IS NULL AND NEW.http_status IS NOT NULL
      AND (to_jsonb(OLD) - ARRAY['http_status','result']) = (to_jsonb(NEW) - ARRAY['http_status','result']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A command receipt may only be completed once or removed after expiry' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER preserve_command_receipt BEFORE UPDATE OR DELETE ON ck.command_receipt
  FOR EACH ROW EXECUTE FUNCTION ck.preserve_command_receipt();

CREATE FUNCTION ck.check_command_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ck.command_receipt
      WHERE (organization_id, actor_id, operation_id) = (NEW.organization_id, NEW.actor_id, NEW.operation_id)
        AND http_status IS NULL) THEN
    RAISE EXCEPTION 'A command receipt must complete before commit' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_command_completion AFTER INSERT OR UPDATE ON ck.command_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ck.check_command_completion();
