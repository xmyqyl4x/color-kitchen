CREATE SCHEMA ck;
REVOKE ALL ON SCHEMA ck FROM PUBLIC;

COMMENT ON SCHEMA ck IS
  'Color Kitchen application data. UTC timestamptz and application-assigned UUID values.';
