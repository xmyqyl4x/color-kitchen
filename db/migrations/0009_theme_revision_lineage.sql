ALTER TABLE ck.asset_revision
  ADD COLUMN source_asset_id uuid,
  ADD COLUMN source_asset_rev integer,
  ADD CONSTRAINT theme_lineage_pair CHECK ((source_asset_id IS NULL) = (source_asset_rev IS NULL)),
  ADD CONSTRAINT theme_lineage_order CHECK (source_asset_id IS DISTINCT FROM asset_id OR source_asset_rev < rev),
  ADD FOREIGN KEY (organization_id, project_id, source_asset_id, source_asset_rev)
    REFERENCES ck.asset_revision (organization_id, project_id, asset_id, rev);
