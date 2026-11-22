CREATE TABLE ck.project_organization (
  organization_id uuid PRIMARY KEY,
  issuer text NOT NULL CHECK (char_length(issuer) BETWEEN 1 AND 512 AND issuer = btrim(issuer)),
  external_organization text NOT NULL CHECK (char_length(external_organization) BETWEEN 1 AND 255
    AND external_organization = btrim(external_organization)),
  UNIQUE (issuer, external_organization)
);

CREATE TABLE ck.project_principal (
  organization_id uuid NOT NULL REFERENCES ck.project_organization,
  principal_id uuid NOT NULL,
  external_subject text NOT NULL CHECK (char_length(external_subject) BETWEEN 1 AND 255
    AND external_subject = btrim(external_subject)),
  PRIMARY KEY (organization_id, principal_id),
  UNIQUE (organization_id, external_subject)
);

CREATE TABLE ck.project (
  project_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES ck.project_organization,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120 AND char_length(name) <= 120),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  archived_at timestamptz CHECK (archived_at >= created_at),
  UNIQUE (organization_id, project_id),
  FOREIGN KEY (organization_id, created_by) REFERENCES ck.project_principal
);

CREATE TABLE ck.project_member (
  project_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  inactive_at timestamptz CHECK (inactive_at >= granted_at),
  PRIMARY KEY (project_id, principal_id),
  FOREIGN KEY (organization_id, project_id) REFERENCES ck.project (organization_id, project_id),
  FOREIGN KEY (organization_id, principal_id) REFERENCES ck.project_principal,
  FOREIGN KEY (organization_id, granted_by) REFERENCES ck.project_principal
);
CREATE INDEX project_member_active_principal ON ck.project_member (organization_id, principal_id, project_id)
  WHERE inactive_at IS NULL;

CREATE FUNCTION ck.serialize_project_membership() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.project_id, NEW.organization_id, NEW.principal_id)
      IS DISTINCT FROM (OLD.project_id, OLD.organization_id, OLD.principal_id) THEN
    RAISE EXCEPTION 'Project membership identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    UPDATE ck.project SET row_version = row_version + 1 WHERE project_id = OLD.project_id;
    RETURN OLD;
  END IF;
  UPDATE ck.project SET row_version = row_version + 1
    WHERE project_id = NEW.project_id AND organization_id = NEW.organization_id;
  RETURN NEW;
END $$;

CREATE TRIGGER serialize_project_membership BEFORE INSERT OR UPDATE OR DELETE ON ck.project_member
  FOR EACH ROW EXECUTE FUNCTION ck.serialize_project_membership();

CREATE FUNCTION ck.check_project_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ck.project WHERE project_id = NEW.project_id AND archived_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM ck.project_member
        WHERE project_id = NEW.project_id AND role = 'owner' AND inactive_at IS NULL) THEN
    RAISE EXCEPTION 'An active project requires an active owner' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER check_project_owner AFTER INSERT OR UPDATE ON ck.project
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ck.check_project_owner();
