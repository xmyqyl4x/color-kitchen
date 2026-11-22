CREATE TABLE ck.connector_grant (
  organization_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 255 AND client_id = btrim(client_id)),
  scope text NOT NULL DEFAULT 'project:read' CHECK (scope = 'project:read'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  revoked_at timestamptz CHECK (revoked_at >= issued_at),
  sealed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, grant_id),
  FOREIGN KEY (organization_id, actor_id) REFERENCES ck.project_principal
);
CREATE INDEX connector_grant_actor ON ck.connector_grant (organization_id, actor_id, client_id);

CREATE TABLE ck.connector_grant_project (
  organization_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  PRIMARY KEY (organization_id, grant_id, project_id),
  FOREIGN KEY (organization_id, grant_id) REFERENCES ck.connector_grant,
  FOREIGN KEY (organization_id, project_id) REFERENCES ck.project (organization_id, project_id)
);

CREATE FUNCTION ck.require_selected_grant_project() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ck.connector_grant_project WHERE organization_id = NEW.organization_id AND grant_id = NEW.grant_id) THEN
    RAISE EXCEPTION 'A grant must select at least one project' USING ERRCODE = '23514';
  END IF;
  UPDATE ck.connector_grant SET sealed = true WHERE organization_id = NEW.organization_id AND grant_id = NEW.grant_id AND NOT sealed;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_selected_grant_project AFTER INSERT ON ck.connector_grant
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ck.require_selected_grant_project();
CREATE FUNCTION ck.preserve_selected_grant_projects() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE grant_sealed boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'A grant project selection is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT sealed INTO grant_sealed FROM ck.connector_grant
    WHERE organization_id = NEW.organization_id AND grant_id = NEW.grant_id FOR UPDATE;
  IF grant_sealed THEN
    RAISE EXCEPTION 'A grant project selection is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_selected_grant_projects BEFORE INSERT OR UPDATE OR DELETE ON ck.connector_grant_project
  FOR EACH ROW EXECUTE FUNCTION ck.preserve_selected_grant_projects();

CREATE FUNCTION ck.revoke_connector_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT OLD.sealed AND NEW.sealed AND (to_jsonb(OLD) - 'sealed') = (to_jsonb(NEW) - 'sealed') THEN RETURN NEW; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
      OR (to_jsonb(OLD) - 'revoked_at') IS DISTINCT FROM (to_jsonb(NEW) - 'revoked_at') THEN
    RAISE EXCEPTION 'A connector grant may only be revoked once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revoke_connector_grant BEFORE UPDATE ON ck.connector_grant
  FOR EACH ROW EXECUTE FUNCTION ck.revoke_connector_grant();

CREATE VIEW ck.current_connector_grant AS
  SELECT g.organization_id, g.grant_id, g.actor_id, g.client_id, g.scope, p.project_id
  FROM ck.connector_grant AS g JOIN ck.connector_grant_project AS p USING (organization_id, grant_id)
  WHERE g.sealed AND g.revoked_at IS NULL AND g.issued_at <= statement_timestamp() AND g.expires_at > statement_timestamp();
