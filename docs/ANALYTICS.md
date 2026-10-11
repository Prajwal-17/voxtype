# Analytics and usage estimates

`GET /v1/analytics?range=7d|30d|all&timezone=<IANA zone>` is authenticated and filters every query by the
session user. It aggregates synced desktop/mobile transcripts, words, duration,
weighted words per minute and average recording duration. Home shows 30 days; Insights supports all three ranges.
Offline transcripts enter this overview after their existing upload queue succeeds.
Idempotent transcript PUTs never increase counts twice.

Costs are **USD estimates, not invoices**:

- Deepgram: saved recording duration multiplied by a range of Nova-3 streaming
  list rates ($0.0048–$0.0071/min). The upper end includes multilingual recognition
  and keyterm prompting. This is deliberately a range because older transcripts
  do not store their language and vocabulary configuration. Voice detection can
  send less audio than the recorded duration. Failed, canceled and unsaved takes,
  provider credits, discounts and taxes are excluded. Deleting a synced transcript
  removes its duration from this estimate.
- DeepSeek: actual prompt/cache/output token counts from successful cleanup API
  responses, priced at Flash peak rates ($0.30/$0.006/$1.20 per million tokens).
  Off-peak rates and public holidays may make the bill lower. Missing usage is
  recorded as unknown and returned as `unmeteredRequests`, never fabricated from
  word count. Tracking begins with this migration; older cleanup calls cannot be
  reconstructed. Each provider call counts, including a repeated cleanup request.

Rates verified on 2026-10-02 against [Deepgram pricing](https://deepgram.com/pricing)
and [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing).
Update `analytics.costs.ts` when these change. DeepSeek cost is stored with each
usage row so future rate changes do not rewrite those historical estimates.

The `speech_usage` ledger stores no transcript or audio. It is independent of
transcript deletion and cascades on account deletion. Usage persistence failure
is logged without failing the optional cleanup result.

Apply migration `0003_speech_usage.sql` before deploying the API. Local migration
and runtime tests are safe; production migration/deployment are separate release steps.

## Calendar and export contract

7d/30d mean local calendar dates including today. Clients send the device's IANA
timezone, falling back to UTC when unavailable; invalid zones fail validation.
SQLite uses numeric UTC-offset transition boundaries computed with Intl to group
records by local date, including DST and fractional offsets. Aggregation runs over
account-scoped records in SQL, without transferring raw transcripts into JavaScript.
Future-dated records are excluded until their timestamp arrives.

The response includes `period`, `timezone`, `summary.activeDays`, full-history
`streaks`, an independent Monday-aligned 14-week `activity` window and `trend` with
explicit day/week/month/year bins. Missing dates in a successful period are zeros.
The longest streak uses all completed account history; current streak ends today,
or yesterday if today is inactive. Speed is weighted by total recorded duration.
Trend bins are bounded to roughly 120; the compatibility `daily` field is limited
to the recent 98 dates of the selected range, keeping JSON below the native 256KB cap.

`format=csv` exports daily values over the selected period, including zero days,
range and timezone columns. All-time export includes older dates even when the
JSON daily field does not. Both native clients limit CSV files to 8MB. Costs remain
compatible in the response but are absent from the primary UI.

No new database migration is needed for this analytics extension. Deploying the API
and releasing the clients remain separate release steps; the new clients require
this response contract. Local D1 tests cover midnight, DST, fractional offsets,
account isolation, duplicate uploads, deletion, streak scope and export/payload bounds.
