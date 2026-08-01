# SDD ledger — plan: docs/superpowers/plans/2026-07-29-foundation-identity-profile.md

Task 1: decision — generated scaffold and configuration are a user-approved TDD exception; domain smoke test remained RED→GREEN.
Task 1: complete (commits 0500e4e..900a6dc, review clean)
Task 2: minor (deferred): ProfileDraftSchema and PublicProfileSchema duplicate the same safe field definitions.
Task 2: fix round 1/5 (1 addressed, 0 open — PublicProfile active-eligibility boundary; commits bfb058b..121a74d)
Task 2: complete (commits 900a6dc..121a74d, review clean; 1 deferred minor)
Task 3: minor (addressed): own-media pgTAP assertion now verifies an exact object count.
Task 3: minor (deferred): own-draft pgTAP uses lives_ok instead of asserting the expected row.
Task 3: minor (deferred): has_active_access(uuid) exposes another member's invitation-redemption state as a boolean oracle.
Task 3: minor (deferred): invitation capacity locking lacks a true concurrent-session regression test.
Task 3: follow-up: the later signed-URL signer must re-check active/profile/media eligibility before issuing a URL.
Task 3: fix round 1/5 (5 addressed, 0 open — Data API schemas; signed-only approved media access; media moderation grants; DB/domain profile constraints; invitation retry/state safety; commits e822808..9b6e54d)
Task 3: complete (commits 121a74d..9b6e54d, review clean; 3 deferred minor, 1 signer follow-up)
Task 4: fix round 1/5 (1 addressed, 0 open — invitation cohort snapshot prevents fail-open after redemption context disappears; commits 7166365..73f78ca)
Task 4: complete (commits 9b6e54d..73f78ca, review clean)
Task 5: review CHANGES_REQUIRED (3 Important, 1 conditional Important — NULL media boundary; deep-link member-state gate; retryable media deletion; identity callback scheme contract; review c02a639)
Task 5: fix round 1/5 (4 addressed, 0 open — media array validation; deep-link state gate; retryable media cleanup; callback scheme contract; commit 2ccd6b1)
Task 5: complete (commits 73f78ca..2ccd6b1, review clean; 1 deferred non-blocking app foreground revalidation risk)
Task 6: review CHANGES_REQUIRED (3 Important — reviewer Storage signing, stale submitted case mutation, CI DB contract gap; review 2bd433e)
Task 6: fix round 1/5 (3 addressed, 0 open — server-only short-TTL signer, latest-case lock/guard, Supabase DB contract CI; commit 934edf5)
Task 6: re-review CHANGES_REQUIRED (1 Important — service-role signer trusted arbitrary media path due missing path/owner boundary; 1 Minor — timestamp tie-break; review 934edf5)
Task 6: fix round 2/5 (2 addressed, 0 open — media path prefix/storage owner RLS and latest-case tie-break; commit cb1bb8f)
Task 6: complete (commits 2bd433e..cb1bb8f; final re-review approved; DB contracts and root verification passed)
