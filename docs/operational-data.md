# Operational data

| Data and fields | Owner | Retention and access |
| --- | --- | --- |
| Usage day: item, UTC date, action and count | Public catalog operations | An aggregate for a consented public catalog open. The purge keeps the current UTC date and the preceding 90 dates. The reader has aggregate access. |
| Usage receipt: event ID, item, action, original UTC date and replay expiry | Public catalog operations | Keep through the event's accepted retry window and clock margin. The expiry job removes due IDs. |
| Contact content: request ID, purpose, locale, encrypted address and message, encryption key ID | Support operations | The case owner sets `purge_at` from the approved policy. Use a 30-day post-closure target and a 90-day open-case review for planning. Support accesses the case through the authorized intake path. |
| Contact deduplication: keyed input digest and key ID | Contact service | Keep with the case through its 24-hour retry window. Matching retries return the case reference. |
| Contact handling and delivery: case state, creation, closure and purge times, queue state, attempts, retry time, lease, delivery time, provider reference and safe error code | Support and delivery operations | Remove with the expired case. Restrict queue changes to the delivery worker and approved support workflow. |

Run `SELECT * FROM ck.purge_expired_operations()` from the authorized maintenance job. It reports counts and takes at most 100 unlocked rows per data class by default. The job can repeat bounded batches until they are empty. Start with provider or gateway usage budgets when an approved shared limiter exists.
