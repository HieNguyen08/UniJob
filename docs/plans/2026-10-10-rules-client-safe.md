---
title: Rules that need no server (security hardening slice 1)
status: approved
spec: docs/specs/2026-10-10-security-hardening.md
branch: fix/rules-client-safe
---

# Slice 1 — client-safe Firestore rules + two broken flows

All paths below are relative to the worktree root. Rules tests: `unijob-web/tests/rules/firestore.rules.test.ts` (run with `npm run test:rules` in `unijob-web/`). Unit tests: `unijob-web/src/**/*.test.ts` (`npm test`). Each task ends with a green `node scripts/ci-local.mjs --quick` and one Conventional Commit ending in `[task:N]`.

Conventions for every rules task:
- Write the deny test(s) first and watch them fail against the current rules, then change `unijob-web/firestore.rules`.
- Every deny test sits next to an allow test (`assertSucceeds`) built on the same fixture, so a broken fixture cannot make a deny test pass.
- A flipped `it.fails('KNOWN HOLE …')` becomes a normal `it` with the same intent.
- Update `docs/backlog/security-holes.md`: delete the entries this task closes.
- Rules helpers may be added at the top of `firestore.rules` (e.g. `function changedKeys() { return request.resource.data.diff(resource.data).affectedKeys(); }`).

### Task 1: jobs create/update/delete rules

Rules:
- `jobs.create`: signed in, `request.resource.data.postedBy == request.auth.uid`, `status == 'open'`, `applicants == []`, `assignedTo == []`.
- `jobs.update`: the poster may update anything except `postedBy` (must stay unchanged). A non-poster may change only `applicants` and `updatedAt`, and the new `applicants` must equal the old list plus the caller's uid (apply, caller not already in it) or the old list minus the caller's uid (withdraw). Use `request.resource.data.applicants.toSet().difference(resource.data.applicants.toSet())` and the reverse to check both directions and sizes.
- `jobs.delete`: poster only (unchanged; add tests).

Tests (allow + deny pairs):
- create with `postedBy` = caller, `status: 'open'`, empty arrays → allowed; `postedBy` = someone else → denied (flips KNOWN HOLE 1); `status: 'completed'` → denied; non-empty `assignedTo` → denied.
- poster changes `postedBy` → denied; poster edits `title` → allowed (existing).
- non-poster appends own uid → allowed (existing test, keep); appends another uid → denied; removes another applicant (`applicants: []` when list is `['carol']`) → denied (flips KNOWN HOLE 2); `carol` removes herself → allowed; non-poster changes `status` alongside `applicants` → denied.
- poster deletes job → allowed; non-poster deletes → denied.

Client impact: `createJob` already writes `status: 'open'`, `applicants: []`, `assignedTo: []` and `CreateJob.tsx` passes `postedBy: userProfile.uid`. Read `CreateJob.tsx` around the `createJob` call and confirm; if any other field breaks the rule, stop and report.

### Task 2: applications create/update rules

Rules:
- `applications.create`: `applicantId == auth.uid`, `status == 'pending'`, the job `jobs/{jobId}` exists, and its `postedBy != auth.uid`.
- `applications.update`: only the job's poster; only `status` and `updatedAt` change; new `status` in `['accepted', 'rejected']`.

Tests: self-application pending → allowed (existing, update its fixture to include `status: 'pending'`); `status: 'accepted'` on create → denied (self-accept); application to a non-existent job → denied; poster applying to own job → denied; poster sets `status: 'accepted'` → allowed; poster changes `applicantId` → denied; applicant updates own application → denied.

Note: `workerCancelJob` currently calls `updateApplicationStatus` as the worker; that was already denied before this task (only the poster may update). It is fixed server-side in slice 6 — do not loosen the rule for it.

### Task 3: notifications.update and ratings.create rules

Rules:
- `notifications.update`: owner only, only the `read` key changes, and `request.resource.data.read == true`.
- `ratings.create`: document id == `jobId + '_' + fromUserId + '_' + toUserId`; `fromUserId == auth.uid`; `toUserId != fromUserId`; `score is int && score >= 1 && score <= 5`; with `job = get(jobs/{jobId}).data`: either (`job.postedBy == fromUserId` and `toUserId in job.assignedTo`) or (`fromUserId in job.assignedTo` and `job.postedBy == toUserId`).

Tests: owner marks read → allowed; owner changes `message` or `userId` → denied; other user marks read → denied. Ratings (fixture: `jobs/job1` with `postedBy: 'poster'`, `assignedTo: ['worker']`): poster rates worker with correct id → allowed; worker rates poster → allowed; wrong id → denied; outsider rates worker → denied; score 6 or 0 or 4.5 → denied; rating yourself → denied; second create on the same id → denied (create of an existing doc is an update and updates are denied). Update the two existing rating tests to the new fixture and id format.

Client: `src/services/rating.service.ts` `submitRating` uses `setDoc(doc(db, 'ratings', `${jobId}_${fromUserId}_${toUserId}`), …)` instead of `addDoc`. Its follow-up write to the rated user's profile stays for now (slice 6 moves it server-side) — leave a one-line comment saying so.

### Task 4: fix the apply and accept flows

Two client bugs:
1. `applyForJob` (`src/services/job.service.ts`) never adds the applicant to `jobs/{jobId}.applicants`, so `JobDetail.tsx` thinks the user has not applied after a reload and lets them apply again. After creating the application, `updateDoc(jobRef, { applicants: arrayUnion(applicantId), updatedAt: serverTimestamp() })`. Also refuse to create a second application: if the job's `applicants` already contains the caller, throw `new Error('Bạn đã ứng tuyển công việc này rồi')` before writing.
2. Accepting a candidate (`MyJobCandidates.tsx` `handleAccept`) never sets `assignedTo` or the job status, so completion can never record work history or release the payment. Add `acceptApplication(jobId, applicationId, applicantId)` to `job.service.ts`: `updateApplicationStatus(applicationId, 'accepted')`, then `updateJob(jobId, { assignedTo: [applicantId], status: 'in-progress' })`. `handleAccept` calls it (it already knows the job id and the application).

Unit tests in `src/services/job.service.test.ts` with `vi.mock('firebase/firestore')` and `vi.mock('@/lib/firebase')`: apply writes the application and then arrayUnion of the caller; apply when already listed throws and writes nothing; accept updates the application then the job with `assignedTo` and `in-progress`. Keep the mocks minimal (assert the calls and arguments).

Rules check: both writes are allowed by Task 1's rules (applicant adds own uid; poster updates own job). Add a rules test "applicant adds own uid with updatedAt" if not already covered.
