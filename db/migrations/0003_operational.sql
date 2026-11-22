CREATE TABLE ck.usage_day (
  item_id uuid NOT NULL REFERENCES ck.catalog_item,
  day_utc date NOT NULL,
  action text NOT NULL CHECK (action = 'open_in_studio'),
  event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (item_id, day_utc, action)
);
CREATE INDEX usage_day_window ON ck.usage_day (day_utc, action, item_id);

CREATE TABLE ck.usage_receipt (
  event_id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES ck.catalog_item,
  action text NOT NULL CHECK (action = 'open_in_studio'),
  occurred_day date NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > (occurred_day::timestamp AT TIME ZONE 'UTC'))
);
CREATE INDEX usage_receipt_expiry ON ck.usage_receipt (expires_at, event_id);

CREATE TABLE ck.contact_request (
  request_id uuid PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('support', 'accessibility', 'advertising', 'privacy', 'licensing')),
  locale ck.locale NOT NULL,
  reply_email_cipher bytea NOT NULL CHECK (octet_length(reply_email_cipher) BETWEEN 1 AND 2048),
  message_cipher bytea NOT NULL CHECK (octet_length(message_cipher) BETWEEN 1 AND 65536),
  key_id text NOT NULL CHECK (length(key_id) BETWEEN 1 AND 120),
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received', 'in_progress', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  purge_at timestamptz NOT NULL,
  input_hmac bytea NOT NULL CHECK (octet_length(input_hmac) = 32),
  hmac_key_id text NOT NULL CHECK (length(hmac_key_id) BETWEEN 1 AND 120),
  delivery_state text NOT NULL DEFAULT 'queued' CHECK (delivery_state IN ('queued', 'sending', 'retry', 'sent', 'needs_review')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  provider_ref text CHECK (length(provider_ref) <= 240),
  last_error_code text CHECK (last_error_code ~ '^[a-z0-9_]{1,64}$'),
  CHECK ((state = 'closed') = (closed_at IS NOT NULL)),
  CHECK (closed_at IS NULL OR closed_at >= created_at),
  CHECK (purge_at >= created_at + interval '24 hours' AND (closed_at IS NULL OR purge_at >= closed_at)),
  CHECK ((delivery_state = 'sending') = (lease_token IS NOT NULL) AND
         (delivery_state = 'sending') = (lease_until IS NOT NULL)),
  CHECK (lease_until IS NULL OR lease_until <= purge_at),
  CHECK ((delivery_state IN ('queued', 'retry')) = (next_attempt_at IS NOT NULL)),
  CHECK ((delivery_state = 'sent') = (delivered_at IS NOT NULL))
);
CREATE INDEX contact_support_queue ON ck.contact_request (state, created_at, request_id);
CREATE INDEX contact_expiry ON ck.contact_request (purge_at, request_id);
CREATE INDEX contact_claim ON ck.contact_request (next_attempt_at, request_id)
  WHERE delivery_state IN ('queued', 'retry');
CREATE INDEX contact_lease_expiry ON ck.contact_request (lease_until, request_id)
  WHERE delivery_state = 'sending';

CREATE FUNCTION ck.purge_expired_operations(cutoff timestamptz DEFAULT transaction_timestamp(), batch_size integer DEFAULT 100)
RETURNS TABLE (contact_count bigint, receipt_count bigint, usage_count bigint)
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF cutoff IS NULL OR batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'A cutoff and batch size between 1 and 1000 are required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    WITH contacts AS (
      DELETE FROM ck.contact_request AS row
      USING (SELECT request_id FROM ck.contact_request WHERE purge_at <= cutoff
        ORDER BY purge_at, request_id LIMIT batch_size FOR UPDATE SKIP LOCKED) AS expired
      WHERE row.request_id = expired.request_id RETURNING 1
    ), receipts AS (
      DELETE FROM ck.usage_receipt AS row
      USING (SELECT event_id FROM ck.usage_receipt WHERE expires_at <= cutoff
        ORDER BY expires_at, event_id LIMIT batch_size FOR UPDATE SKIP LOCKED) AS expired
      WHERE row.event_id = expired.event_id RETURNING 1
    ), usage AS (
      DELETE FROM ck.usage_day AS row
      USING (SELECT item_id, day_utc, action FROM ck.usage_day
        WHERE day_utc < (cutoff AT TIME ZONE 'UTC')::date - 90
        ORDER BY day_utc, action, item_id LIMIT batch_size FOR UPDATE SKIP LOCKED) AS expired
      WHERE (row.item_id, row.day_utc, row.action) = (expired.item_id, expired.day_utc, expired.action) RETURNING 1
    )
    SELECT (SELECT count(*) FROM contacts), (SELECT count(*) FROM receipts), (SELECT count(*) FROM usage);
END $$;
