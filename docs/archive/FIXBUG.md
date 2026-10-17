# 🐛 UniJob — Bug Fixes & Improvements Tracker

> Auto-generated from code review on 2026-04-02.  
> Each issue is tagged with severity and current status.

---

## 🔴 Bugs (Critical)

### #1 — Brand name mismatch: "UniWork" vs "UniJob"
- **Files**: `src/pages/CVExport.tsx` (line 207), `src/services/cv.service.ts` (line 318)
- **Problem**: HTML preview footer says **"UniWork"**, but PDF canvas draws **"UniJob"**. Users see inconsistent branding.
- **Fix**: Change "UniWork" → "UniJob" in CVExport.tsx.
- **Status**: ✅ Fixed

### #2 — PDF content overflow (no multi-page support)
- **File**: `src/services/cv.service.ts`
- **Problem**: Canvas height is fixed at 1123px (A4). With 8 jobs + 5 detailed ratings + comments, the `y` cursor can exceed A4 height. Footer is pushed below canvas boundary. Everything past pixel 1123 is silently clipped.
- **Fix**: Dynamically calculate canvas height based on content instead of fixed A4_H. Only use A4_H as minimum.
- **Status**: ✅ Fixed

### #3 — Rating score double-counted on submit
- **File**: `src/services/rating.service.ts` (lines 38-49)
- **Problem**: After `addDoc()` writes the new rating to Firestore (line 32), `getRatingsByUser()` on line 38 fetches **all** ratings including the one just added. Then line 39 adds `+ score` again, and line 40 divides by `length + 1` — double-counting.
- **Fix**: Remove the `+ score` and `+ 1` since the newly added doc is already included in the query results.
- **Status**: ✅ Fixed

### #4 — Dashboard shows raw Firestore document IDs
- **File**: `src/pages/Dashboard.tsx` (line 193)
- **Problem**: In the "Đã ứng tuyển" tab, applications render `app.jobId` — a raw Firestore ID like `aBc123XyZ`. Users see gibberish instead of job titles.
- **Fix**: Resolve job titles from Firestore using `getJobById` when loading applications, or store `jobTitle` on the Application document.
- **Status**: ✅ Fixed

### #5 — Race condition in user counter operations
- **File**: `src/services/user.service.ts` (lines 34-54)
- **Problem**: `incrementActiveJobs` / `decrementActiveJobs` use a **read-then-write** pattern (`getUserById` → `updateDoc`) without a Firestore transaction. Concurrent calls can cause counts to drift.
- **Fix**: Use Firestore `increment(1)` / `increment(-1)` — atomic, no extra read needed.
- **Status**: ✅ Fixed

---

## 🟠 Inconsistencies (Medium)

### #6 — Preview shows 5 jobs, PDF shows 8
- **Files**: `src/pages/CVExport.tsx` (line 177: `slice(0, 5)`), `src/services/cv.service.ts` (line: `slice(0, 8)`)
- **Problem**: The visual preview is not representative of what the PDF will contain.
- **Fix**: Align both to show the same number (8 jobs).
- **Status**: ✅ Fixed

### #7 — `getCurrentUserProfile` doesn't attach `uid` from document ID
- **File**: `src/services/auth.service.ts` (line 73)
- **Problem**: Returns `userSnap.data() as User` without spreading `uid: userSnap.id`. The `uid` field is only present if it was explicitly stored in the document data. If it's ever missing, `userProfile.uid` becomes `undefined` throughout the app.
- **Fix**: Add `uid: userSnap.id` like `getUserById` does.
- **Status**: ✅ Fixed

### #8 — Dead `_element` parameter & unused `certificateRef`
- **Files**: `src/services/cv.service.ts` (line 102), `src/pages/CVExport.tsx` (line 24)
- **Problem**: `generateCVCertificate` accepts `_element` but never uses it (draws on an offscreen canvas). `CVExport.tsx` maintains `certificateRef` solely to pass to this function.
- **Fix**: Remove `_element` parameter from service. Remove `certificateRef` usage from CVExport.
- **Status**: ✅ Fixed

### #9 — Preview shows "5 jobs" overflow text, PDF shows "8 jobs" overflow text
- **Files**: Already covered by #6.
- **Status**: ✅ Fixed (merged with #6)

### #10 — Rating labels always say "Từ người thuê"
- **Files**: `src/pages/CVExport.tsx` area, rating display components
- **Problem**: All ratings render as "Từ người thuê" regardless of `type` field. Ratings of type `worker-to-poster` should display "Từ người làm" instead.
- **Fix**: Check `rating.type` field and display appropriate label. (Note: CVExport PDF doesn't label ratings by source, so this is primarily a UI-level concern in other pages. Deferred for now.)
- **Status**: ⏭️ Deferred (no rating display page found currently)

---

## 🟡 Improvements (Low)

### #11 — Pagination cursor never passed in jobStore
- **File**: `src/store/jobStore.ts` (line 37)
- **Problem**: `fetchJobs()` calls `getJobs(filters)` but **never passes `lastDoc`** for Firestore cursor pagination. Appending mode re-fetches the same first page and concatenates duplicates.
- **Fix**: Track the last document snapshot in the store and pass it for pagination.
- **Status**: ✅ Fixed

### #12 — Unused filter fields (`minPayment`, `maxPayment`)
- **File**: `src/types/job.ts` (lines 46-47)
- **Problem**: `minPayment` and `maxPayment` are defined on `JobFilter` but never referenced in `getJobs()` or the job store.
- **Fix**: Remove unused fields to avoid confusion.
- **Status**: ✅ Fixed

### #13 — Dashboard `useEffect` has no error handling
- **File**: `src/pages/Dashboard.tsx` (lines 22-32)
- **Problem**: The `Promise.all` has no `.catch()`. If either call fails, the promise rejects silently, `loading` stays `true` forever, and the user sees an infinite skeleton loader.
- **Fix**: Add `.catch()` with error toast and `setLoading(false)`.
- **Status**: ✅ Fixed

### #14 — Auth `onAuthStateChanged` doesn't handle async errors
- **File**: `src/store/authStore.ts` (lines 28-31)
- **Problem**: If `getCurrentUserProfile` throws inside the `onAuthChanged` callback, the error is unhandled and `isLoading` stays `true` permanently.
- **Fix**: Wrap in try/catch, set `isLoading: false` on error.
- **Status**: ✅ Fixed

### #15 — Home page stats are hardcoded
- **File**: `src/pages/Home.tsx` (lines 62-67)
- **Problem**: Stats show "50+", "500+", "4.5", "<2h" as static strings. Misleading on a fresh deployment.
- **Fix**: Add "(beta)" note or mark as placeholder. Full fix would require aggregate Firestore queries.
- **Status**: ✅ Fixed
