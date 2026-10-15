# DM registry and chat selector fixes

Cached individual-message buckets could lack a chat registry entry. `getChats()` enumerates that registry (plus freshly fetched groups), so such DMs were omitted from `chats --dms` even though their messages existed.

The fix repairs only missing `@s.whatsapp.net` / `@lid` entries when a cache loads or a message arrives. Existing registry metadata is preserved. Empty buckets and other namespaces are not promoted. Message deduplication, limits and group behavior remain unchanged. This is registry recovery, not new history retrieval or identity reconciliation.

Synthetic regressions exercise incoming and duplicate messages, older/newer timestamps, legacy cache loading without writes, mocked `getChats()`, contact fallback, LID classification, preservation of existing names/groups, and exclusion of empty/other buckets. All fixtures use a temporary HOME; no authentication, network or private data is used.

Run `npm test`, `npm run build`, and `npx tsc --noEmit` after installing repository dependencies. Existing installed dependencies were reused locally without changing the global installation. Before the fix, incoming and legacy registry assertions failed with `undefined` instead of `false`.

The initial actual-cache check of registered individual chats did not reproduce an ID/name exclusion. A separately approved group check subsequently reproduced it: the CLI populated both `chatId` and `chatName`, so an ID match was rejected by an unrelated display name. The missing group suffix was not the rejection cause, because ID substring matching already accepted bare IDs.

The CLI now uses one `chat` selector. Exact cached IDs take precedence, then an exact bare group ID resolves to its stored `@g.us` ID. Otherwise the selector matches an ID substring or case-insensitive name substring. Explicit programmatic `chatId` and `chatName` filters retain their existing independent AND semantics. This does not reconcile phone/LID identities.

Four additional synthetic tests cover full/bare group IDs, names, nonmatches, exact-ID priority over overlapping IDs/names, time/type/limit filters, and individual IDs. The old CLI-equivalent synthetic group filter returned no result before this fix. No private identifiers, fixtures or cache measurements are committed here.

## Separate follow-up work (recorded, not implemented)

- CI: canonical repository has zero GitHub Actions workflows. Add dependency installation, synthetic tests, typecheck and build checks in a separately approved change.
- Release: no tags or GitHub Releases were present at inspection. Define version/tag ownership, release gating and distribution artifacts before adding automation. Current package has only a build-on-npm-publish hook; this is not GitHub release automation.
- Installer: README prescribes clone, npm install/build and npm link; no release-download installer exists. Select supported platforms, Node dependency strategy, checksums and safe upgrade behavior before implementing one.

Sickrat provides a concrete comparison: its CI checks TypeScript/tests/builds; its release workflow accepts semantic version tags reachable from main and publishes platform binaries plus SHA256SUMS. Do not copy that process blindly into this Node/Baileys CLI.

Tracking remains the existing owner task: https://app.notion.com/p/3facc1568189816fa964f73f485cbb87 . No duplicate task was created and no Notion edits were attempted during parent reconciliation. Parent should record these follow-ups there.

Publication is a draft PR only. No merge, release, cache write, installed executable patch or bridge restart is part of this change. Independent review is deferred under the owner's sole-worker instruction; checks here are self-checks.

## Name lookup and ambiguity follow-up

Name selectors match Unicode-normalized partial registry/contact names. More than one distinct matching chat raises `AmbiguousChatError` before message filtering, even if time/search/limit would leave messages from only one chat. No aliases are merged. Exact full/bare group IDs still select one identity. The CLI prints safely quoted names/IDs and a narrowing instruction on stderr (or a standard `--json` error object on stdout), then exits 1 without message output. Control characters in choices are escaped. Ordinary message rendering and the existing raw RPC transport are unchanged.

Synthetic regressions cover unique contact/group names, Hebrew, composed/decomposed Unicode, case, empty/no matches, duplicate names across phone/LID identities, escaped choices without message bodies, type narrowing, and failure before time/limit filtering. Read-only real-cache verification used only in-memory name queries and emitted aggregate counts, never labels or messages; no private values are stored in this note. Notion remains untouched.
