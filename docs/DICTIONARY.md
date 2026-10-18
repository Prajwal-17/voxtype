# Account dictionary

Desktop and Android share `GET /v1/dictionary` and `PATCH /v1/dictionary` behind the existing authentication middleware. The session determines the owner; clients cannot select another account. The D1 `account_dictionary` row is deleted with its user.

A patch contains `{base: string[], terms: string[], importId?: UUID}`. The server applies the difference between the displayed base and the edited list to its latest document. Concurrent additions survive; removing a word does not overwrite unrelated words from another device. Leaving a word unchanged in a stale view does not resurrect a remote deletion. Case-insensitive duplicates collapse, with a limit of 100 terms and 100 characters each. A revision compare-and-swap retries competing writes. Exceeding the merged limit rejects the entire patch.

Each installation claims its previous device-local dictionary for its first signed-in account. The claim and a stable import ID are persisted before the request. The backend remembers successful import IDs, so retrying a lost response cannot resurrect subsequently deleted words. Other accounts cannot import the same installation's legacy words. Original local settings remain intact for recovery.

Successful saves update the account-specific native cache. Recording, regeneration, and the Android voice bubble read that cache. Failed saves retain the previous cache and show an error; there is no silent local-only save or offline edit queue. Account changes invalidate in-flight responses. Cached data is scoped by account and API environment and hidden after sign-out.

Mobile refreshes on sign-in, foreground, dictionary opening, and every 30 seconds while active. The Android accessibility service also requests a refresh when connecting and starting keyboard input (throttled to 30 seconds), including when the React UI is closed. The persistent transcript sync job retries dictionary sync independently of history sync. Updated words invalidate idle prewarmed bubble sockets. Desktop refreshes on sign-in, its background sync cycle (120 seconds), and while its dictionary view is open (30 seconds and on focus). This is eventual synchronization, not push.

## Rollout

1. Apply `apps/api/migrations/0004_account_dictionary.sql` through the existing environment's D1 migration workflow.
2. Deploy the API with the dictionary routes.
3. Release the updated desktop and Android binaries. The Android change includes native code and cannot be delivered only as a JavaScript update. Older native clients display an update prompt when editing the new dictionary UI.

The migration is additive. Older client versions still maintain device-local vocabularies, so both devices need the updated client for shared edits. No production database migration or deployment is performed by the source change itself.

Validation covers D1 concurrent updates, stale edits and deletes, account isolation, idempotent imports after deletion, capacity rejection, and Android import ownership/cache isolation/request failures/account changes.
