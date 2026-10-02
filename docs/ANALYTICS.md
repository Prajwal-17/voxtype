# Analytics and usage estimates

`GET /v1/analytics?range=7d|30d|all` is authenticated and filters every query by the
session user. It aggregates synced desktop/mobile transcripts, words, duration,
weighted words per minute and average recording duration. Clients show 30 days.
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
