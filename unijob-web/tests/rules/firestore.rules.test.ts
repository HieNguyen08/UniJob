import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  writeBatch,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-unijob',
    firestore: { rules: readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', displayName: 'Alice' });
    await setDoc(doc(db, 'users/bob'), { uid: 'bob', displayName: 'Bob' });
    await setDoc(doc(db, 'jobs/job1'), {
      title: 'Nhập liệu',
      postedBy: 'poster',
      applicants: ['carol'],
      status: 'open',
    });
    await setDoc(doc(db, 'payments/pay1'), {
      jobId: 'job1',
      payerId: 'poster',
      payeeId: 'worker',
      amount: 100_000,
      status: 'held',
    });
    await setDoc(doc(db, 'jobCompletions/c1'), {
      jobId: 'job1',
      workerConfirmed: false,
      posterConfirmed: false,
      status: 'pending',
    });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'alice', message: 'hi', read: false });
  });
});

describe('users', () => {
  it('signed-out users cannot read profiles', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });
  it('a user can update their own profile', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { displayName: 'A' }));
  });
  it("a user cannot update someone else's profile", async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/bob'), { displayName: 'pwned' }));
  });
  // Since slice 6 the server (Cloud Functions) owns reputation and job counters on users/{uid}.
  const SERVER_OWNED = ['ratingScore', 'ratingAverage', 'totalRatings', 'penaltyPoints', 'activeJobCount', 'completedJobs', 'maxJobLimit', 'xp', 'level', 'badges', 'role', 'uid'];
  // exact shape of signInWithGoogle (auth.service.ts)
  const signIn = (uid: string) => ({
    uid, email: `${uid}@hcmut.edu.vn`, displayName: uid, photoURL: '', faculty: '', department: '', studentId: '',
    phone: '', bio: '', skills: [], bookmarks: [], ratingScore: 0, totalRatings: 0, activeJobCount: 0, maxJobLimit: 2,
    isAnonymous: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const seedReputation = () =>
    env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'users/alice'), {
        ratingScore: 3.2, ratingAverage: 4.2, totalRatings: 5, penaltyPoints: 10, activeJobCount: 1, completedJobs: 4, maxJobLimit: 2,
      }),
    );

  it('the first sign-in payload (signInWithGoogle) is allowed, also without the default fields', async () => {
    await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), signIn('newbie')));
    const bare: Record<string, unknown> = signIn('newbie2');
    for (const k of ['ratingScore', 'totalRatings', 'activeJobCount', 'maxJobLimit']) delete bare[k];
    await assertSucceeds(setDoc(doc(as('newbie2'), 'users/newbie2'), bare));
  });
  it('a user cannot create a profile for someone else or with a foreign uid', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users/eve'), signIn('eve')));
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...signIn('newbie'), uid: 'bob' }));
  });
  it.each([
    ['ratingScore', 5], ['ratingAverage', 5], ['totalRatings', 10], ['penaltyPoints', -20], ['activeJobCount', -5],
    ['completedJobs', 50], ['maxJobLimit', 99], ['ratingScore', '0'],
    ['xp', 0], ['level', 1], ['badges', []], ['role', 'admin'],
  ])('first sign-in cannot seed %s = %j', async (field, value) => {
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...signIn('newbie'), [field]: value }));
    await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), signIn('newbie'))); // sanity: same doc, defaults
  });
  it.each(SERVER_OWNED)('the owner cannot change %s on their own profile', async (field) => {
    await seedReputation();
    const value = field === 'badges' ? ['fake'] : field === 'role' || field === 'uid' ? 'admin' : 0;
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { [field]: value }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', [field]: value, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', updatedAt: serverTimestamp() })); // sanity
  });
  it('the owner cannot reset penalties by deleting the field or overwriting the profile', async () => {
    await seedReputation();
    const ref = doc(as('alice'), 'users/alice');
    await assertFails(updateDoc(ref, { penaltyPoints: deleteField() }));
    await assertFails(updateDoc(ref, { ratingScore: deleteField(), totalRatings: deleteField() }));
    await assertFails(setDoc(ref, signIn('alice'))); // setDoc on an existing doc is an update that drops penaltyPoints
    await assertSucceeds(getDoc(ref)); // sanity
  });
  describe('server profile stub completion', () => {
    const asEmail = (uid: string, email: string) => env.authenticatedContext(uid, { email }).firestore();
    const seedStub = (uid: string, extra: Record<string, unknown> = {}) =>
      env.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), `users/${uid}`), { uid, stub: true, ratingScore: 3, totalRatings: 2, penaltyPoints: 10, ...extra }));
    const completion = (uid: string) => ({
      email: `${uid}@hcmut.edu.vn`, displayName: uid, photoURL: '', faculty: '', department: '', studentId: '', phone: '', bio: '',
      skills: [], bookmarks: [], isAnonymous: false, maxJobLimit: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      stub: deleteField(),
    });
    it('a stub owner completes the profile once, with their token email', async () => {
      await seedStub('stubby');
      await assertSucceeds(updateDoc(doc(asEmail('stubby', 'stubby@hcmut.edu.vn'), 'users/stubby'), completion('stubby')));
      // done: the stub flag is gone, so the path is closed (and the normal allowlist forbids createdAt/email)
      await assertFails(updateDoc(doc(asEmail('stubby', 'stubby@hcmut.edu.vn'), 'users/stubby'), { email: 'x@hcmut.edu.vn', createdAt: serverTimestamp() }));
    });
    it('stub: false also counts as completed', async () => {
      await seedStub('stubby');
      await assertSucceeds(updateDoc(doc(asEmail('stubby', 'stubby@hcmut.edu.vn'), 'users/stubby'), { ...completion('stubby'), stub: false }));
    });
    it('denies a mismatched email, a foreign maxJobLimit, a client createdAt and keeping the stub flag', async () => {
      await seedStub('stubby');
      const ref = doc(asEmail('stubby', 'stubby@hcmut.edu.vn'), 'users/stubby');
      await assertFails(updateDoc(ref, { ...completion('stubby'), email: 'other@hcmut.edu.vn' }));
      await assertFails(updateDoc(ref, { ...completion('stubby'), maxJobLimit: 99 }));
      await assertFails(updateDoc(ref, { ...completion('stubby'), createdAt: Timestamp.fromMillis(1) }));
      await assertFails(updateDoc(ref, { ...completion('stubby'), stub: true }));
    });
    it('denies touching server-owned fields or unknown keys on the stub path', async () => {
      await seedStub('stubby');
      const ref = doc(asEmail('stubby', 'stubby@hcmut.edu.vn'), 'users/stubby');
      await assertFails(updateDoc(ref, { ...completion('stubby'), penaltyPoints: 0 }));
      await assertFails(updateDoc(ref, { ...completion('stubby'), ratingScore: 5 }));
      await assertFails(updateDoc(ref, { ...completion('stubby'), isAdmin: true }));
      await assertFails(updateDoc(ref, { ...completion('stubby'), uid: 'bob' }));
    });
    it('a non-stub profile cannot use the path, and nobody completes someone else’s stub', async () => {
      const ref = doc(asEmail('alice', 'alice@hcmut.edu.vn'), 'users/alice');
      await assertFails(updateDoc(ref, { email: 'alice@hcmut.edu.vn', createdAt: serverTimestamp(), maxJobLimit: 2, updatedAt: serverTimestamp() }));
      await seedStub('stubby');
      await assertFails(updateDoc(doc(asEmail('alice', 'stubby@hcmut.edu.vn'), 'users/stubby'), completion('stubby')));
    });
  });
  it('unknown keys are denied on create and update (allowlist)', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...signIn('newbie'), isAdmin: true }));
    await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...signIn('newbie'), ratingAverage: 0 })); // not part of the sign-in payload
    await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), signIn('newbie'))); // sanity
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { isAdmin: true }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', isAdmin: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { email: 'x@hcmut.edu.vn' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', isAnonymous: true, updatedAt: serverTimestamp() })); // sanity
  });
  it('updatedAt on a profile update must be the server time', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', updatedAt: Timestamp.fromMillis(1) }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'x', updatedAt: serverTimestamp() }));
  });
  it('profile edit (Profile.handleSave) and bookmarks still work on a profile with server fields', async () => {
    await seedReputation();
    const ref = doc(as('alice'), 'users/alice');
    await assertSucceeds(updateDoc(ref, {
      displayName: 'Alice N', faculty: 'CSE', department: 'KHMT', studentId: '2212345', phone: '0901', bio: 'hi',
      skills: ['react', 'figma'], updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(ref, { bookmarks: arrayUnion('job1') }));
    await assertSucceeds(updateDoc(ref, { bookmarks: arrayRemove('job1') }));
  });
});

describe('jobs', () => {
  it('signed-in users can read jobs; signed-out cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'jobs/job1')));
    await assertFails(getDoc(doc(anon(), 'jobs/job1')));
  });
  it('the poster can edit their job', async () => {
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/job1'), { title: 'Mới' }));
  });
  it('a non-poster cannot edit job fields other than applicants', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'jobs/job1'), { title: 'pwned' }));
  });
  it('a non-poster can apply (applicants + updatedAt only)', async () => {
    await assertSucceeds(
      updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: ['carol', 'alice'], updatedAt: serverTimestamp() }),
    );
  });
  // same shape as createJob: createdAt is the server time
  const newJob = (postedBy: string, extra: Record<string, unknown> = {}) => ({
    title: 'x',
    postedBy,
    status: 'open',
    applicants: [],
    assignedTo: [],
    createdAt: serverTimestamp(),
    ...extra,
  });
  const fbUrl = (jobId: string, n: number | string = 0) =>
    `https://firebasestorage.googleapis.com/v0/b/unijob-ad6eb.appspot.com/o/jobs%2F${jobId}%2Fattachments%2F1761400000000_f${n}.pdf?alt=media&token=0a1b2c3d-4e5f-6789-abcd-ef0123456789`;
  const urlsFor = (jobId: string, n: number) => Array.from({ length: n }, (_, i) => fbUrl(jobId, i));
  const inFuture = () => Timestamp.fromMillis(Date.now() + 86_400_000);
  const inPast = () => Timestamp.fromMillis(Date.now() - 60_000);
  it('job create must set postedBy to the caller', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/mine'), newJob('alice')));
    await assertFails(setDoc(doc(as('alice'), 'jobs/forged'), newJob('bob')));
  });
  it('job create must start open with no applicants or assignees', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/j2'), newJob('alice', { status: 'completed' })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/j3'), newJob('alice', { assignedTo: ['bob'] })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/j4'), newJob('alice', { applicants: ['bob'] })));
  });
  it('the poster cannot change postedBy', async () => {
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { postedBy: 'alice' }));
  });
  it('a non-poster cannot add another uid to applicants', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: ['carol', 'bob'], updatedAt: serverTimestamp() }));
  });
  it('a non-poster cannot remove other applicants', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: [] }));
  });
  it('an applicant can withdraw themselves', async () => {
    await assertSucceeds(updateDoc(doc(as('carol'), 'jobs/job1'), { applicants: [], updatedAt: serverTimestamp() }));
  });
  it('a non-poster cannot change status alongside applicants', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), 'jobs/job1'), {
        applicants: ['carol', 'alice'],
        status: 'completed',
        updatedAt: serverTimestamp(),
      }),
    );
  });
  const seedJob = async (id: string, extra: Record<string, unknown>) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `jobs/${id}`), {
        title: 'x',
        postedBy: 'poster',
        applicants: ['carol'],
        assignedTo: [],
        status: 'open',
        ...extra,
      });
    });
  };
  it('the poster cannot edit the applicants list', async () => {
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { applicants: ['carol', 'mallory'] }));
  });
  it('the poster can only assign a uid with an accepted application', async () => {
    const j = doc(as('poster'), 'jobs/job1');
    await assertFails(updateDoc(j, { assignedTo: ['mallory'] }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_carol'), {
        jobId: 'job1',
        applicantId: 'carol',
        status: 'pending',
      });
    });
    await assertFails(updateDoc(j, { assignedTo: ['carol'] }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_carol'), {
        jobId: 'job1',
        applicantId: 'carol',
        status: 'accepted',
      });
    });
    await assertSucceeds(updateDoc(j, { assignedTo: ['carol'] }));
    await assertFails(updateDoc(j, { assignedTo: ['carol', 'bob'] }));
    await assertSucceeds(updateDoc(j, { assignedTo: [] }));
  });
  it("assignment requires the accepted application to belong to this job and this uid", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'applications/job1_x'), { jobId: 'other', applicantId: 'x', status: 'accepted' });
      await setDoc(doc(db, 'applications/job1_y'), { jobId: 'job1', applicantId: 'z', status: 'accepted' });
    });
    const j = doc(as('poster'), 'jobs/job1');
    await assertFails(updateDoc(j, { assignedTo: ['x'] }));
    await assertFails(updateDoc(j, { assignedTo: ['y'] }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_x'), { jobId: 'job1', applicantId: 'x', status: 'accepted' });
    });
    await assertSucceeds(updateDoc(j, { assignedTo: ['x'] }));
  });
  it('assignment is frozen once the job leaves open', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/ipj_carol'), { jobId: 'ipj', applicantId: 'carol', status: 'accepted' });
      await setDoc(doc(ctx.firestore(), 'applications/cj_carol'), { jobId: 'cj', applicantId: 'carol', status: 'accepted' });
    });
    await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
    await seedJob('cj', { status: 'completed', assignedTo: ['carol'] });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { assignedTo: [] }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/cj'), { assignedTo: [] }));
  });
  it('poster cannot swap the assignee of an in-progress or completed job', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/ipj_bob'), { jobId: 'ipj', applicantId: 'bob', status: 'accepted' });
      await setDoc(doc(ctx.firestore(), 'applications/cj_bob'), { jobId: 'cj', applicantId: 'bob', status: 'accepted' });
    });
    await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
    await seedJob('cj', { status: 'completed', assignedTo: ['carol'] });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { assignedTo: ['bob'] }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/cj'), { assignedTo: ['bob'] }));
  });
  it('the accept write (assignedTo + in-progress + updatedAt) is allowed on an open job', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_carol'), { jobId: 'job1', applicantId: 'carol', status: 'accepted' });
    });
    await assertSucceeds(
      updateDoc(doc(as('poster'), 'jobs/job1'), { assignedTo: ['carol'], status: 'in-progress', updatedAt: serverTimestamp() }),
    );
  });
  it('poster cannot mark a job completed directly (only the confirmCompletion callable)', async () => {
    await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { status: 'completed' }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { status: 'completed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('carol'), 'jobs/ipj'), { status: 'completed', updatedAt: serverTimestamp() }));
    // sanity: other poster edits on the same in-progress job still work
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/ipj'), { title: 'Mới', updatedAt: serverTimestamp() }));
  });
  it('poster cannot cancel an in-progress job while escrow is held (only the cancelJob callable)', async () => {
    await seedJob('paid', { status: 'in-progress', assignedTo: ['carol'], paymentStatus: 'held' });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments/paidpay'), {
        jobId: 'paid', payerId: 'poster', payeeId: 'carol', amount: 100_000, status: 'held',
      });
    });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/paid'), { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/paid'), { status: 'cancelled' }));
    // sanity: the same poster still cancels an open job in the same setup, and still edits the in-progress one
    await seedJob('paidopen', { status: 'open' });
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/paidopen'), { status: 'cancelled', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/paid'), { title: 'Mới', updatedAt: serverTimestamp() }));
  });
  describe('poster status transitions', () => {
    const setStatus = (id: string, status: string) =>
      updateDoc(doc(as('poster'), `jobs/${id}`), { status, updatedAt: serverTimestamp() });
    it('in-progress -> open is denied', async () => {
      await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
      await assertFails(setStatus('ipj', 'open'));
    });
    it('completed -> open is denied', async () => {
      await seedJob('cj', { status: 'completed', assignedTo: ['carol'] });
      await assertFails(setStatus('cj', 'open'));
    });
    it('cancelled -> open is denied', async () => {
      await seedJob('xj', { status: 'cancelled' });
      await assertFails(setStatus('xj', 'open'));
    });
    it('open -> cancelled is allowed (posterCancelJob)', async () => {
      await assertSucceeds(setStatus('job1', 'cancelled'));
      await seedJob('exp', { status: 'open' });
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/exp'), { status: 'cancelled', updatedAt: serverTimestamp() })); // updateJob shape
    });
    it('in-progress -> cancelled is denied (only the cancelJob callable)', async () => {
      await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
      await assertFails(setStatus('ipj', 'cancelled'));
      await assertSucceeds(setStatus('job1', 'cancelled')); // sanity
    });
    it('only the server sets cancelReason: a poster cancel with it is denied, without it allowed', async () => {
      // the server expiry job writes cancelReason 'expired', which suppresses the "cancelled by poster" notification
      await seedJob('cr', { status: 'open' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cr'), { status: 'cancelled', cancelReason: 'expired' }));
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cr'), { cancelReason: 'expired' }));
      await assertFails(setDoc(doc(as('poster'), 'jobs/cr-new'), { title: 'x', postedBy: 'poster', status: 'open', applicants: [], assignedTo: [], cancelReason: 'expired' }));
      // sanity (posterCancelJob): the same cancel without cancelReason succeeds
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/cr'), { status: 'cancelled' }));
    });
    it('the poster cannot change or remove a server-set cancelReason', async () => {
      await seedJob('crx', { status: 'cancelled', cancelReason: 'expired' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/crx'), { cancelReason: 'poster' }));
      await assertFails(updateDoc(doc(as('poster'), 'jobs/crx'), { cancelReason: deleteField() }));
      // sanity: other poster edits on that job still work
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/crx'), { title: 'Mới' }));
    });
    it('only the server sets cancelledBy', async () => {
      await seedJob('cb', { status: 'open' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cb'), { status: 'cancelled', cancelledBy: 'worker' }));
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cb'), { cancelledBy: 'poster' }));
      await seedJob('cbx', { status: 'cancelled', cancelledBy: 'poster' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cbx'), { cancelledBy: deleteField() }));
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/cbx'), { title: 'Mới' })); // sanity
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/cb'), { status: 'cancelled' })); // sanity
    });
    it('only the server sets cancelledAt', async () => {
      await seedJob('ca', { status: 'open' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/ca'), { status: 'cancelled', cancelledAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(as('poster'), 'jobs/ca'), { cancelledAt: serverTimestamp() }));
      await assertFails(setDoc(doc(as('poster'), 'jobs/ca-new'), newJob('poster', { cancelledAt: serverTimestamp() })));
      await seedJob('cax', { status: 'cancelled', cancelledAt: inPast() });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/cax'), { cancelledAt: deleteField() }));
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/cax'), { title: 'Mới' })); // sanity
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/ca'), { status: 'cancelled' })); // sanity
    });
    it('open -> cancelled cannot change assignedTo in the same write', async () => {
      await seedJob('oc', { status: 'open' });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/oc'), { status: 'cancelled', assignedTo: ['carol'] }));
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/oc'), { status: 'cancelled' })); // sanity
    });
    it('once the job is not open the poster may only extend the deadline (the penalty is computed from it)', async () => {
      const soon = Timestamp.fromMillis(Date.now() + 3_600_000);
      const later = Timestamp.fromMillis(Date.now() + 2 * 86_400_000);
      await seedJob('dl', { status: 'in-progress', assignedTo: ['carol'], deadline: inFuture() });
      const ref = doc(as('poster'), 'jobs/dl');
      await assertFails(updateDoc(ref, { deadline: soon })); // shorten -> inflates the worker's penalty
      await assertFails(updateDoc(ref, { deadline: Timestamp.fromMillis(Date.now() + 1000) }));
      await assertSucceeds(updateDoc(ref, { deadline: later })); // extend
      await assertSucceeds(updateDoc(ref, { deadline: null })); // remove the deadline
      await seedJob('dl0', { status: 'in-progress', assignedTo: ['carol'], deadline: null });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/dl0'), { deadline: later })); // old null: only null
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/dl0'), { title: 'Mới' })); // sanity
      // while open the deadline can still be shortened (to a future time)
      await seedJob('dlo', { status: 'open', applicants: [], deadline: inFuture() });
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/dlo'), { deadline: soon }));
    });
    it('with applicants the poster cannot shorten the deadline even while open (forced max cancel penalty)', async () => {
      const soon = Timestamp.fromMillis(Date.now() + 3_600_000);
      const later = Timestamp.fromMillis(Date.now() + 2 * 86_400_000);
      await seedJob('dlap', { status: 'open', applicants: ['carol'], deadline: inFuture() });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/dlap'), { deadline: soon }));
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/dlap'), { deadline: later })); // extend
      await seedJob('dlap0', { status: 'open', applicants: ['carol'], deadline: null });
      await assertFails(updateDoc(doc(as('poster'), 'jobs/dlap0'), { deadline: soon })); // old null: only null
      await seedJob('dlna', { status: 'open', applicants: [], deadline: inFuture() });
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/dlna'), { deadline: soon })); // sanity: no applicants yet
    });
    it('assigning a worker cannot shorten the deadline in the same write', async () => {
      await seedJob('dla', { status: 'open', deadline: inFuture() });
      await env.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), 'applications/dla_carol'), { jobId: 'dla', applicantId: 'carol', status: 'accepted' }));
      await assertFails(updateDoc(doc(as('poster'), 'jobs/dla'), { assignedTo: ['carol'], status: 'in-progress', deadline: Timestamp.fromMillis(Date.now() + 1000) }));
      await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/dla'), { assignedTo: ['carol'], status: 'in-progress' })); // sanity
    });
    it('open -> in-progress without assigning in the same write is denied', async () => {
      await assertFails(setStatus('job1', 'in-progress'));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'applications/aj_carol'), { jobId: 'aj', applicantId: 'carol', status: 'accepted' });
      });
      await seedJob('aj', { status: 'open', assignedTo: ['carol'] });
      await assertFails(setStatus('aj', 'in-progress'));
    });
    it('open -> in-progress with an empty assignedTo is denied', async () => {
      await seedJob('ej', { status: 'open', assignedTo: ['carol'] });
      await assertFails(
        updateDoc(doc(as('poster'), 'jobs/ej'), { assignedTo: [], status: 'in-progress', updatedAt: serverTimestamp() }),
      );
    });
    it('open -> completed is denied', async () => {
      await assertFails(setStatus('job1', 'completed'));
    });
    it('cancelled and completed jobs cannot change status', async () => {
      await seedJob('xj', { status: 'cancelled' });
      await seedJob('cj', { status: 'completed', assignedTo: ['carol'] });
      await assertFails(setStatus('xj', 'in-progress'));
      await assertFails(setStatus('xj', 'completed'));
      await assertFails(setStatus('cj', 'cancelled'));
      await assertFails(setStatus('cj', 'in-progress'));
    });
    it('an unknown status is denied', async () => {
      await assertFails(setStatus('job1', 'weird'));
    });
  });
  it('poster can change payment and paymentType only while the job is open', async () => {
    await seedJob('ipay', { status: 'in-progress', assignedTo: ['carol'], payment: 100000, paymentType: 'fixed' });
    const ip = doc(as('poster'), 'jobs/ipay');
    await assertFails(updateDoc(ip, { payment: 1 }));
    await assertFails(updateDoc(ip, { paymentType: 'hourly' }));
    await assertFails(updateDoc(ip, { payment: 1, paymentType: 'hourly', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ip, { title: 'Mới', updatedAt: serverTimestamp() }));
    // not together with the assignment (the price must not change in the accept batch)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'jobs/swap'), { title: 'x', postedBy: 'poster', applicants: ['alice'], assignedTo: [], status: 'open', payment: 100000, paymentType: 'fixed' });
      await setDoc(doc(ctx.firestore(), 'applications/swap_alice'), { jobId: 'swap', applicantId: 'alice', status: 'pending' });
    });
    const pdb = as('poster');
    const swap = writeBatch(pdb);
    swap.update(doc(pdb, 'applications/swap_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
    swap.update(doc(pdb, 'jobs/swap'), { assignedTo: ['alice'], status: 'in-progress', payment: 1, updatedAt: serverTimestamp() });
    await assertFails(swap.commit());
    await assertFails(updateDoc(doc(pdb, 'jobs/swap'), { payment: 1, status: 'cancelled', updatedAt: serverTimestamp() }));
    const ok = writeBatch(pdb);
    ok.update(doc(pdb, 'applications/swap_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
    ok.update(doc(pdb, 'jobs/swap'), { assignedTo: ['alice'], status: 'in-progress', updatedAt: serverTimestamp() });
    await assertSucceeds(ok.commit());
    await seedJob('opay', { status: 'open', applicants: [], payment: 100000, paymentType: 'fixed' });
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/opay'), { payment: 150000, paymentType: 'hourly', updatedAt: serverTimestamp() }));
  });
  describe('price bait', () => {
    const seedBait = async (id: string, extra: Record<string, unknown>) => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `jobs/${id}`), {
          title: 'x', postedBy: 'poster', applicants: ['alice'], assignedTo: [], status: 'open', payment: 100000, paymentType: 'fixed', ...extra,
        });
        await setDoc(doc(ctx.firestore(), `applications/${id}_alice`), { jobId: id, applicantId: 'alice', status: 'pending' });
      });
    };
    it('with applicants: lowering the price is denied, then the accept batch has nothing to exploit', async () => {
      await seedBait('b1', {});
      const db = as('poster');
      await assertFails(updateDoc(doc(db, 'jobs/b1'), { payment: 1, updatedAt: serverTimestamp() }));
      const ok = writeBatch(db);
      ok.update(doc(db, 'applications/b1_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
      ok.update(doc(db, 'jobs/b1'), { assignedTo: ['alice'], status: 'in-progress', updatedAt: serverTimestamp() });
      await assertSucceeds(ok.commit());
    });
    it('with applicants: a single batch that lowers the price and accepts is denied', async () => {
      await seedBait('b2', {});
      const db = as('poster');
      const batch = writeBatch(db);
      batch.update(doc(db, 'jobs/b2'), { payment: 1, updatedAt: serverTimestamp() });
      batch.update(doc(db, 'applications/b2_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
      batch.update(doc(db, 'jobs/b2'), { assignedTo: ['alice'], status: 'in-progress', updatedAt: serverTimestamp() });
      await assertFails(batch.commit());
    });
    it('with applicants: switching paymentType is denied, raising the price is allowed', async () => {
      await seedBait('b3', {});
      const j = doc(as('poster'), 'jobs/b3');
      await assertFails(updateDoc(j, { paymentType: 'volunteer', updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(j, { paymentType: 'volunteer', payment: 0, updatedAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(j, { payment: 150000, updatedAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(j, { payment: 150000, title: 'Mới', updatedAt: serverTimestamp() }));
    });
    it('without applicants: lowering the price and switching type are allowed', async () => {
      await seedBait('b4', { applicants: [] });
      const j = doc(as('poster'), 'jobs/b4');
      await assertSucceeds(updateDoc(j, { payment: 1, updatedAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(j, { paymentType: 'volunteer', updatedAt: serverTimestamp() }));
    });
  });
  describe('job delete', () => {
    it.each([
      ['open', {}, true],
      ['cancelled', {}, true],
      ['cancelled', { paymentStatus: 'released' }, true],
      ['in-progress', { assignedTo: ['carol'] }, false],
      ['completed', { assignedTo: ['carol'] }, false],
      ['cancelled', { paymentStatus: 'held' }, false],
      ['cancelled', { paymentStatus: 'disputed' }, false],
    ])('poster deleting a %s job %j -> %s', async (status, extra, allowed) => {
      await seedJob('del', { status, ...extra });
      const op = deleteDoc(doc(as('poster'), 'jobs/del'));
      await (allowed ? assertSucceeds(op) : assertFails(op));
    });
    it('a non-owner cannot delete an open job', async () => {
      await seedJob('del2', { status: 'open' });
      await assertFails(deleteDoc(doc(as('carol'), 'jobs/del2')));
    });
  });
  it('poster cannot set paymentStatus directly (only the server escrow writes it)', async () => {
    await seedJob('ps', { status: 'in-progress', assignedTo: ['carol'], paymentStatus: 'held' });
    const j = doc(as('poster'), 'jobs/ps');
    await assertFails(updateDoc(j, { paymentStatus: 'released' }));
    await assertFails(updateDoc(j, { paymentStatus: 'refunded', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { paymentStatus: deleteField() }));
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { paymentStatus: 'held' }));
    await assertFails(updateDoc(doc(as('carol'), 'jobs/ps'), { paymentStatus: 'released' }));
    // sanity: other poster edits on the same job still work while the server-set paymentStatus stays
    await assertSucceeds(updateDoc(j, { title: 'Mới', updatedAt: serverTimestamp() }));
  });
  it('job create accepts deadline null (no deadline) or a future timestamp, and a payload without the key', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/d1'), newJob('alice', { deadline: null })));
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/d2'), newJob('alice', { deadline: inFuture() })));
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/d3'), newJob('alice')));
  });
  it('job create denies a deadline in the past (the scheduler would cancel it at once)', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/d7'), newJob('alice', { deadline: inPast() })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/d8'), newJob('alice', { deadline: Timestamp.fromMillis(0) })));
  });
  it('job create requires createdAt to be the server time', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/c1'), newJob('alice', { createdAt: Timestamp.fromMillis(Date.now() - 30 * 86_400_000) })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/c2'), newJob('alice', { createdAt: inFuture() })));
    const withoutCreatedAt: Record<string, unknown> = newJob('alice');
    delete withoutCreatedAt.createdAt;
    await assertFails(setDoc(doc(as('alice'), 'jobs/c3'), withoutCreatedAt));
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/c4'), newJob('alice')));
  });
  it('the poster can move the deadline to the future or clear it, never into the past or to a non-timestamp', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'jobs/job1'), { applicants: [] })); // with applicants only extending is allowed
    const j = doc(as('poster'), 'jobs/job1');
    await assertSucceeds(updateDoc(j, { deadline: inFuture() }));
    await assertSucceeds(updateDoc(j, { deadline: null }));
    await assertFails(updateDoc(j, { deadline: inPast() }));
    await assertFails(updateDoc(j, { deadline: '2099-01-01' }));
  });
  it('a poster edit that leaves a legacy past deadline untouched is still allowed', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'jobs/job1'), { deadline: inPast() }));
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/job1'), { title: 'Mới' }));
  });
  it('the poster cannot rewrite createdAt (the scheduler and sorting trust it)', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'jobs/job1'), { createdAt: Timestamp.fromMillis(Date.now() - 86_400_000) }));
    const j = doc(as('poster'), 'jobs/job1');
    await assertFails(updateDoc(j, { createdAt: Timestamp.fromMillis(0) }));
    await assertFails(updateDoc(j, { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { createdAt: deleteField() }));
    await assertSucceeds(updateDoc(j, { title: 'Mới', updatedAt: serverTimestamp() })); // sanity: same doc, normal edit
  });
  it('the poster cannot forge updatedAt; a serverTimestamp updatedAt is allowed', async () => {
    const j = doc(as('poster'), 'jobs/job1');
    await assertFails(updateDoc(j, { title: 'Mới', updatedAt: Timestamp.fromMillis(Date.now() + 86_400_000) }));
    await assertFails(updateDoc(j, { title: 'Mới', updatedAt: Timestamp.fromMillis(0) }));
    await assertFails(updateDoc(j, { title: 'Mới', updatedAt: 'hôm nay' }));
    await assertSucceeds(updateDoc(j, { title: 'Mới', updatedAt: serverTimestamp() }));
  });
  it('existing client poster writes still pass (updateJob attachments, open cancel)', async () => {
    const j = doc(as('poster'), 'jobs/job1');
    await assertSucceeds(updateDoc(j, { attachments: [fbUrl('job1')], updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(j, { status: 'cancelled', updatedAt: serverTimestamp() }));
  });
  it('attachments: a list of at most 10 strings on create', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/a10'), newJob('alice', { attachments: urlsFor('a10', 10) })));
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/a0'), newJob('alice'))); // field absent
    await assertFails(setDoc(doc(as('alice'), 'jobs/a11'), newJob('alice', { attachments: urlsFor('a11', 11) })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/anum'), newJob('alice', { attachments: [...urlsFor('anum', 9), 7] })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/astr'), newJob('alice', { attachments: fbUrl('astr') })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/amap'), newJob('alice', { attachments: [{ url: 'x' }] })));
  });
  it('attachments: every entry must be a download URL of its own job storage folder', async () => {
    const good = fbUrl('u1');
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/u1'), newJob('alice', { attachments: [good] })));
    const newBucket = fbUrl('u2').replace('unijob-ad6eb.appspot.com', 'unijob-ad6eb.firebasestorage.app');
    await assertSucceeds(setDoc(doc(as('alice'), 'jobs/u2'), newJob('alice', { attachments: [newBucket] })));
    const bad = (id: string) => {
      const g = fbUrl(id);
      return [
        g.replace('firebasestorage.googleapis.com', 'evil.example.com'),
        g.replace('unijob-ad6eb.appspot.com', 'attacker-project.appspot.com'),
        g.replace('unijob-ad6eb.appspot.com', 'unijob-ad6eb.evil.com'),
        g.replace('unijob-ad6eb.appspot.com', 'unijob-ad6eb.appspot.com.evil.com'),
        fbUrl('otherJob'),
        'javascript:alert(1)',
        'https://example.com/a.pdf',
        g.replace('https://', 'http://'),
        g.replace('alt=media&token=0a1b2c3d-4e5f-6789-abcd-ef0123456789', 'alt=media&token=zzz'),
        g.replace(`jobs%2F${id}`, `jobs%2F${id}x`),
      ];
    };
    for (let i = 0; i < bad('ub').length; i++) {
      await assertFails(setDoc(doc(as('alice'), `jobs/ub${i}`), newJob('alice', { attachments: [bad(`ub${i}`)[i]] })));
    }
    // update path: same binding to the job id
    const j = doc(as('poster'), 'jobs/job1');
    await assertSucceeds(updateDoc(j, { attachments: [fbUrl('job1')], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { attachments: [fbUrl('u1')], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { attachments: ['javascript:alert(1)'], updatedAt: serverTimestamp() }));
  });
  it('attachments: the poster update (updateJob after upload) must keep the same shape', async () => {
    const j = doc(as('poster'), 'jobs/job1');
    await assertSucceeds(updateDoc(j, { attachments: urlsFor('job1', 10), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { attachments: urlsFor('job1', 11), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { attachments: [null], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(j, { attachments: 'x', updatedAt: serverTimestamp() }));
  });
  it('a legacy job with more than 10 attachments can still be edited when attachments do not change', async () => {
    await seedJob('legacyAtt', { attachments: Array.from({ length: 12 }, (_, i) => `u${i}`) });
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/legacyAtt'), { title: 'Mới', updatedAt: serverTimestamp() }));
  });
  it('job create rejects a deadline that is not a timestamp (string, number, map)', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/d4'), newJob('alice', { deadline: '2026-10-17' })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/d5'), newJob('alice', { deadline: 1_760_000_000_000 })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/d6'), newJob('alice', { deadline: { seconds: 1 } })));
  });
  it('job create rejects paymentStatus (server-only) and unknown keys', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/p1'), newJob('alice', { paymentStatus: 'held' })));
    await assertFails(setDoc(doc(as('alice'), 'jobs/p2'), newJob('alice', { extra: 1 })));
  });
  it('job create accepts a realistic full payload', async () => {
    await assertSucceeds(
      setDoc(doc(as('alice'), 'jobs/full'), {
        title: 'Nhập liệu',
        description: 'mô tả',
        category: 'other',
        faculty: 'CSE',
        location: 'online',
        payment: 100000,
        paymentType: 'fixed',
        duration: '2h',
        deadline: inFuture(),
        maxApplicants: 3,
        isUrgent: false,
        isAnonymous: false,
        tags: ['a'],
        attachments: [],
        postedBy: 'alice',
        postedByName: 'Alice',
        postedByPhoto: '',
        status: 'open',
        applicants: [],
        assignedTo: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it('applying requires an open job; withdrawing works in any status', async () => {
    await seedJob('done', { status: 'completed' });
    await seedJob('busy', { status: 'in-progress' });
    await assertFails(
      updateDoc(doc(as('alice'), 'jobs/done'), { applicants: ['carol', 'alice'], updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(doc(as('carol'), 'jobs/busy'), { applicants: [], updatedAt: serverTimestamp() }),
    );
  });
  it('a non-poster cannot forge updatedAt', async () => {
    await assertFails(
      updateDoc(doc(as('alice'), 'jobs/job1'), {
        applicants: ['carol', 'alice'],
        updatedAt: Timestamp.fromMillis(Date.now() + 86_400_000),
      }),
    );
  });
  it('applicants list must be exactly old +/- the caller', async () => {
    const j = doc(as('alice'), 'jobs/job1');
    await assertFails(updateDoc(j, { applicants: ['carol', 'alice', 'alice'] }));
    await assertFails(updateDoc(doc(as('carol'), 'jobs/job1'), { applicants: ['carol', 'carol'] }));
    await assertFails(updateDoc(j, { applicants: ['alice'] }));
    await assertFails(updateDoc(j, { applicants: ['alice', 'bob'] }));
  });
  it('only the poster can delete a job', async () => {
    await assertFails(deleteDoc(doc(as('alice'), 'jobs/job1')));
    await assertSucceeds(deleteDoc(doc(as('poster'), 'jobs/job1')));
  });
});

describe('applications', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    jobId: 'job1',
    applicantId: 'alice',
    applicantName: 'Alice',
    applicantPhoto: '',
    message: 'Em muốn làm',
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  });
  const ref = (uid: string, id: string) => doc(as(uid), `applications/${id}`);
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'jobs/done'), { title: 'Xong', postedBy: 'poster', applicants: [], status: 'completed' });
      await setDoc(doc(db, 'applications/job1_alice'), { jobId: 'job1', applicantId: 'alice', status: 'pending' });
      await setDoc(doc(db, 'applications/job1_bob'), { jobId: 'job1', applicantId: 'bob', status: 'rejected' });
    });
  });
  it('a user can create a pending application with id jobId_uid', async () => {
    await assertSucceeds(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol' })));
  });
  it('a wrong or auto-generated document id is denied', async () => {
    await assertFails(setDoc(ref('carol', 'random1'), body({ applicantId: 'carol' })));
    await assertFails(setDoc(ref('carol', 'job1_alice'), body({ applicantId: 'carol' })));
  });
  it('a second create on the same id is denied', async () => {
    await assertSucceeds(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol' })));
    await assertFails(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol' })));
  });
  it('a user cannot create an application on behalf of someone else', async () => {
    await assertFails(setDoc(ref('carol', 'job1_bob2'), body({ applicantId: 'bob' })));
    await assertFails(setDoc(ref('carol', 'job1_bob'), body({ applicantId: 'bob' })));
  });
  it('create with a status other than pending is denied', async () => {
    await assertFails(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', status: 'accepted' })));
    await assertFails(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', status: 'rejected' })));
    const noStatus: Record<string, unknown> = body({ applicantId: 'carol' });
    delete noStatus.status;
    await assertFails(setDoc(ref('carol', 'job1_carol'), noStatus));
  });
  it('an application to a non-existent job is denied', async () => {
    await assertFails(setDoc(ref('carol', 'nope_carol'), body({ applicantId: 'carol', jobId: 'nope' })));
  });
  it('an application to a job that is not open is denied', async () => {
    await assertFails(setDoc(ref('carol', 'done_carol'), body({ applicantId: 'carol', jobId: 'done' })));
  });
  it('the poster cannot apply to their own job', async () => {
    await assertFails(setDoc(ref('poster', 'job1_poster'), body({ applicantId: 'poster' })));
  });
  it('create with an extra key is denied', async () => {
    await assertFails(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', isAdmin: true })));
  });
  it('create with a message over 1000 chars is denied', async () => {
    await assertSucceeds(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', message: 'a'.repeat(1000) })));
    await assertFails(setDoc(ref('dave', 'job1_dave'), body({ applicantId: 'dave', message: 'a'.repeat(1001) })));
  });
  it('create with an applicantName over 100 chars or a non-string is denied', async () => {
    await assertSucceeds(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', applicantName: 'a'.repeat(100) })));
    await assertFails(setDoc(ref('dave', 'job1_dave'), body({ applicantId: 'dave', applicantName: 'a'.repeat(101) })));
    await assertFails(setDoc(ref('dave', 'job1_dave'), body({ applicantId: 'dave', applicantName: 5 })));
  });
  it('create with an applicantPhoto over 2048 chars or a non-string is denied', async () => {
    await assertSucceeds(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', applicantPhoto: 'https://x.co/' + 'a'.repeat(2035) })));
    await assertFails(setDoc(ref('dave', 'job1_dave'), body({ applicantId: 'dave', applicantPhoto: 'https://x.co/' + 'a'.repeat(2036) })));
    await assertFails(setDoc(ref('dave', 'job1_dave'), body({ applicantId: 'dave', applicantPhoto: 5 })));
  });
  it('applicantPhoto must be empty or an https url', async () => {
    await assertSucceeds(setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', applicantPhoto: '' })));
    await assertSucceeds(setDoc(ref('dave', 'job1_dave'), body({ applicantId: 'dave', applicantPhoto: 'https://x.co/a.png' })));
    await assertFails(setDoc(ref('erin', 'job1_erin'), body({ applicantId: 'erin', applicantPhoto: 'javascript:alert(1)' })));
    await assertFails(setDoc(ref('erin', 'job1_erin'), body({ applicantId: 'erin', applicantPhoto: 'http://x.co/a.png' })));
  });
  it('a user can get their own missing application id but not another users', async () => {
    await assertSucceeds(getDoc(ref('carol', 'job1_carol')));
    await assertFails(getDoc(ref('carol', 'job1_bob2')));
    await assertFails(getDoc(ref('carol', 'job1_dave')));
  });
  it('apply batch (application create + applicants arrayUnion) succeeds on an open job', async () => {
    const db = as('dave');
    const batch = writeBatch(db);
    batch.set(doc(db, 'applications/job1_dave'), body({ applicantId: 'dave' }));
    batch.update(doc(db, 'jobs/job1'), { applicants: ['carol', 'dave'], updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });
  it('apply batch on a completed job is denied entirely', async () => {
    const db = as('dave');
    const batch = writeBatch(db);
    batch.set(doc(db, 'applications/done_dave'), body({ applicantId: 'dave', jobId: 'done' }));
    batch.update(doc(db, 'jobs/done'), { applicants: ['dave'], updatedAt: serverTimestamp() });
    await assertFails(batch.commit());
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'applications/done_dave'));
      if (snap.exists()) throw new Error('application must not be written');
    });
  });
  it('accept batch (application accepted + job assigned) by the poster succeeds', async () => {
    const db = as('poster');
    const batch = writeBatch(db);
    batch.update(doc(db, 'applications/job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
    batch.update(doc(db, 'jobs/job1'), { assignedTo: ['alice'], status: 'in-progress', updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });
  it('accept batch that also rejects the other pending applications succeeds', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'applications/job1_dave'), { jobId: 'job1', applicantId: 'dave', status: 'pending' });
      await setDoc(doc(db, 'applications/job1_erin'), { jobId: 'job1', applicantId: 'erin', status: 'pending' });
    });
    const db = as('poster');
    const batch = writeBatch(db);
    batch.update(doc(db, 'applications/job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
    batch.update(doc(db, 'jobs/job1'), { assignedTo: ['alice'], status: 'in-progress', updatedAt: serverTimestamp() });
    batch.update(doc(db, 'applications/job1_dave'), { status: 'rejected', updatedAt: serverTimestamp() });
    batch.update(doc(db, 'applications/job1_erin'), { status: 'rejected', updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
  });
  it("accept batch that rejects an application of a job the caller does not own, or that is not open, is denied", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'jobs/theirs'), { title: 'x', postedBy: 'mallory', applicants: ['dave'], status: 'open' });
      await setDoc(doc(db, 'applications/theirs_dave'), { jobId: 'theirs', applicantId: 'dave', status: 'pending' });
      await setDoc(doc(db, 'jobs/busy'), { title: 'x', postedBy: 'poster', applicants: [], assignedTo: ['bob'], status: 'in-progress' });
      await setDoc(doc(db, 'applications/busy_dave'), { jobId: 'busy', applicantId: 'dave', status: 'pending' });
    });
    for (const other of ['theirs_dave', 'busy_dave']) {
      const db = as('poster');
      const batch = writeBatch(db);
      batch.update(doc(db, 'applications/job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
      batch.update(doc(db, 'jobs/job1'), { assignedTo: ['alice'], status: 'in-progress', updatedAt: serverTimestamp() });
      batch.update(doc(db, `applications/${other}`), { status: 'rejected', updatedAt: serverTimestamp() });
      await assertFails(batch.commit());
    }
  });
  it('accept batch assigning a uid whose application is not accepted in the batch is denied', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_zed'), { jobId: 'job1', applicantId: 'zed', status: 'pending' });
    });
    const db = as('poster');
    const batch = writeBatch(db);
    batch.update(doc(db, 'applications/job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() });
    batch.update(doc(db, 'jobs/job1'), { assignedTo: ['zed'], status: 'in-progress', updatedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });
  it('create with a forged updatedAt is denied', async () => {
    await assertFails(
      setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', updatedAt: Timestamp.fromDate(new Date('2020-01-01')) }))
    );
  });
  it('create with a forged createdAt is denied', async () => {
    await assertFails(
      setDoc(ref('carol', 'job1_carol'), body({ applicantId: 'carol', createdAt: Timestamp.fromDate(new Date('2020-01-01')) }))
    );
  });
  it('the poster can accept a pending application', async () => {
    await assertSucceeds(updateDoc(ref('poster', 'job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() }));
  });
  it('the poster cannot change a decided application', async () => {
    await assertFails(updateDoc(ref('poster', 'job1_bob'), { status: 'accepted', updatedAt: serverTimestamp() }));
  });
  it('the poster cannot forge updatedAt', async () => {
    await assertFails(
      updateDoc(ref('poster', 'job1_alice'), { status: 'accepted', updatedAt: Timestamp.fromDate(new Date('2020-01-01')) })
    );
  });
  it('the poster cannot change applicantId together with status', async () => {
    await assertFails(
      updateDoc(ref('poster', 'job1_alice'), { status: 'accepted', applicantId: 'bob', updatedAt: serverTimestamp() })
    );
  });
  it('the poster cannot set an invalid status', async () => {
    await assertFails(updateDoc(ref('poster', 'job1_alice'), { status: 'pending', updatedAt: serverTimestamp() }));
  });
  it('the poster cannot decide an application on an in-progress or completed job', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'jobs/busy'), { title: 'Dang lam', postedBy: 'poster', applicants: [], assignedTo: ['bob'], status: 'in-progress' });
      await setDoc(doc(db, 'applications/busy_alice'), { jobId: 'busy', applicantId: 'alice', status: 'pending' });
      await setDoc(doc(db, 'applications/done_alice'), { jobId: 'done', applicantId: 'alice', status: 'pending' });
    });
    for (const id of ['busy_alice', 'done_alice']) {
      await assertFails(updateDoc(ref('poster', id), { status: 'rejected', updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref('poster', id), { status: 'accepted', updatedAt: serverTimestamp() }));
    }
  });
  it('the poster can reject a pending application on an open job', async () => {
    await assertSucceeds(updateDoc(ref('poster', 'job1_alice'), { status: 'rejected', updatedAt: serverTimestamp() }));
  });
  it('the applicant and outsiders cannot update the application', async () => {
    await assertFails(updateDoc(ref('alice', 'job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref('mallory', 'job1_alice'), { status: 'accepted', updatedAt: serverTimestamp() }));
  });
  it('the applicant and the poster can read; outsiders cannot', async () => {
    await assertSucceeds(getDoc(ref('alice', 'job1_alice')));
    await assertSucceeds(getDoc(ref('poster', 'job1_alice')));
    await assertFails(getDoc(ref('mallory', 'job1_alice')));
  });
});

describe('payments', () => {
  // Since slice 4 only the server writes payments (escrow triggers, disputePayment callable).
  const pay = (uid: string, id = 'pay1') => doc(as(uid), `payments/${id}`);
  const forged = { jobId: 'job1', payerId: 'poster', payeeId: 'mallory', amount: 9_999_999, status: 'released' };

  it('a third party cannot read a payment', async () => {
    await assertFails(getDoc(pay('mallory')));
  });
  it('payer and payee can read the payment', async () => {
    await assertSucceeds(getDoc(pay('poster')));
    await assertSucceeds(getDoc(pay('worker')));
  });
  it('the payee cannot release escrow to themselves', async () => {
    await assertSucceeds(getDoc(pay('worker'))); // sanity: worker is the payee of pay1
    await assertFails(updateDoc(pay('worker'), { status: 'released' }));
    await assertFails(updateDoc(pay('worker'), { status: 'released', releasedAt: serverTimestamp() }));
  });
  it('clients cannot create payments for other people', async () => {
    await assertFails(setDoc(pay('mallory', 'forged'), forged));
    await assertFails(setDoc(pay('mallory', 'job1_mallory'), { ...forged, status: 'held' }));
    // sanity: the same document written server-side is valid and readable by its payee
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'payments/job1_mallory'), { ...forged, status: 'held', source: 'server' }),
    );
    await assertSucceeds(getDoc(pay('mallory', 'job1_mallory')));
  });
  it('the payload the old web client sent (createPayment) is denied, even for the payer', async () => {
    await assertFails(
      setDoc(pay('poster', 'job1_carol'), {
        jobId: 'job1', jobTitle: 'Nhập liệu', payerId: 'poster', payeeId: 'carol', amount: 100_000,
        platformFee: 5_000, netAmount: 95_000, status: 'held', method: 'platform_escrow', note: '',
        createdAt: serverTimestamp(), heldAt: serverTimestamp(), releasedAt: null,
      }),
    );
  });
  it('the payer cannot change status or amount', async () => {
    await assertSucceeds(getDoc(pay('poster'))); // sanity
    await assertFails(updateDoc(pay('poster'), { status: 'refunded' }));
    await assertFails(updateDoc(pay('poster'), { status: 'released' }));
    await assertFails(updateDoc(pay('poster'), { amount: 1 }));
  });
  it('neither side can mark a payment disputed directly (only the disputePayment callable)', async () => {
    await assertFails(updateDoc(pay('worker'), { status: 'disputed' }));
    await assertFails(updateDoc(pay('poster'), { status: 'disputed', disputeReason: 'Không làm đúng yêu cầu' }));
  });
  it('nobody deletes a payment', async () => {
    await assertSucceeds(getDoc(pay('poster'))); // sanity
    for (const uid of ['poster', 'worker', 'mallory']) await assertFails(deleteDoc(pay(uid)));
  });
  it('payer and payee can list their own payments (getPaymentsByUser, legacy fallback in getPaymentForJob)', async () => {
    const col = (uid: string) => collection(as(uid), 'payments');
    await assertSucceeds(getDocs(query(col('poster'), where('payerId', '==', 'poster'))));
    await assertSucceeds(getDocs(query(col('poster'), where('jobId', '==', 'job1'), where('payerId', '==', 'poster'))));
    await assertSucceeds(getDocs(query(col('worker'), where('jobId', '==', 'job1'), where('payeeId', '==', 'worker'))));
  });
  it('a jobId-only query is denied (rules are not filters), and a missing payment reads as denied', async () => {
    await assertFails(getDocs(query(collection(as('poster'), 'payments'), where('jobId', '==', 'job1'))));
    await assertFails(getDoc(pay('poster', 'job1_nobody')));
  });
});

describe('jobCompletions', () => {
  // Since slice 5 only the confirmCompletion callable writes completions (Admin SDK). Clients only get jobCompletions/{jobId}.
  const fresh = (jobId: string) => ({ jobId, workerConfirmed: false, posterConfirmed: false, completedAt: null, status: 'pending' });
  const server = (jobId: string) => ({ ...fresh(jobId), source: 'server', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const job = (status: string) => ({ title: 'x', postedBy: 'poster', applicants: ['worker'], assignedTo: ['worker'], status });
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'jobs/cjob'), job('in-progress'));
      await setDoc(doc(db, 'jobs/newjob'), job('in-progress'));
      await setDoc(doc(db, 'jobs/pdjob'), job('in-progress'));
      await setDoc(doc(db, 'jobs/wdjob'), job('in-progress'));
      await setDoc(doc(db, 'jobs/donejob'), job('completed'));
      await setDoc(doc(db, 'jobs/xjob'), job('cancelled'));
      await setDoc(doc(db, 'jobCompletions/cjob'), fresh('cjob'));
      await setDoc(doc(db, 'jobCompletions/pdjob'), { ...fresh('pdjob'), posterConfirmed: true });
      await setDoc(doc(db, 'jobCompletions/wdjob'), { ...fresh('wdjob'), workerConfirmed: true });
      await setDoc(doc(db, 'jobCompletions/xjob'), { ...fresh('xjob'), posterConfirmed: true });
    });
  });

  it('no client can create a completion, not even the assigned worker (the old createJobCompletion payload)', async () => {
    for (const uid of ['worker', 'poster', 'mallory']) {
      await assertFails(setDoc(doc(as(uid), 'jobCompletions/newjob'), fresh('newjob')));
      await assertFails(setDoc(doc(as(uid), 'jobCompletions/newjob'), server('newjob')));
    }
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/newjob'), { ...fresh('newjob'), workerConfirmed: true }));
    await assertSucceeds(getDoc(doc(as('worker'), 'jobCompletions/newjob'))); // sanity: the worker is a member of newjob
  });
  it('neither side can confirm its own flag (the old confirmCompletion first-confirmer writes)', async () => {
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { workerConfirmed: true }));
    await assertFails(updateDoc(doc(as('poster'), 'jobCompletions/cjob'), { posterConfirmed: true }));
    await assertSucceeds(getDoc(doc(as('worker'), 'jobCompletions/cjob'))); // sanity
    await assertSucceeds(getDoc(doc(as('poster'), 'jobCompletions/cjob'))); // sanity
  });
  it('the old second-confirmer writes are denied (worker last and poster last)', async () => {
    await assertFails(
      updateDoc(doc(as('worker'), 'jobCompletions/pdjob'), { workerConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as('poster'), 'jobCompletions/wdjob'), { posterConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
    await assertSucceeds(getDoc(doc(as('poster'), 'jobCompletions/wdjob'))); // sanity
  });
  it('outsiders cannot confirm or forge a completion', async () => {
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/cjob'), { posterConfirmed: true, status: 'confirmed' }));
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/c1'), { workerConfirmed: true }));
    await assertFails(setDoc(doc(as('mallory'), 'jobCompletions/random-id'), fresh('newjob')));
  });
  it('a server-written completion cannot be reopened, re-stamped or have source changed', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'jobCompletions/cjob'), { ...server('cjob'), workerConfirmed: true, posterConfirmed: true, status: 'confirmed' }),
    );
    const ref = doc(as('poster'), 'jobCompletions/cjob');
    await assertSucceeds(getDoc(ref)); // sanity
    await assertFails(updateDoc(ref, { status: 'pending' }));
    await assertFails(updateDoc(ref, { completedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { source: 'client' }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { posterConfirmed: false }));
  });
  it('only the poster and the assigned worker can get a completion (getJobCompletion)', async () => {
    await assertFails(getDoc(doc(as('mallory'), 'jobCompletions/cjob')));
    await assertFails(getDoc(doc(anon(), 'jobCompletions/cjob')));
    await assertSucceeds(getDoc(doc(as('worker'), 'jobCompletions/cjob')));
    await assertSucceeds(getDoc(doc(as('poster'), 'jobCompletions/cjob')));
    // a member can check that no completion exists yet (getJobCompletion returns null)
    await assertSucceeds(getDoc(doc(as('worker'), 'jobCompletions/newjob')));
    await assertFails(getDoc(doc(as('mallory'), 'jobCompletions/newjob')));
  });
  it('listing completions is denied, even filtered by jobId', async () => {
    await assertFails(getDocs(collection(as('poster'), 'jobCompletions')));
    await assertFails(getDocs(query(collection(as('poster'), 'jobCompletions'), where('jobId', '==', 'cjob'))));
  });
  it('nobody can delete a completion', async () => {
    await assertFails(deleteDoc(doc(as('poster'), 'jobCompletions/cjob')));
    await assertFails(deleteDoc(doc(as('worker'), 'jobCompletions/cjob')));
  });
});

describe('workHistory', () => {
  // Since slice 5 only the confirmCompletion callable writes workHistory/{jobId}_{worker}.
  const entry = { user1: 'poster', user2: 'worker', jobId: 'cjob', jobTitle: 'x', category: 'it' };
  beforeEach(async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'workHistory/cjob_worker'), { ...entry, completedAt: serverTimestamp(), source: 'server' }),
    );
  });
  it('no client can create work history (the old recordWorkHistory payload, any id)', async () => {
    for (const uid of ['poster', 'worker', 'mallory']) {
      await assertFails(setDoc(doc(as(uid), `workHistory/forged_${uid}`), { ...entry, completedAt: Timestamp.now() }));
      await assertFails(setDoc(doc(as(uid), 'workHistory/newjob_worker'), { ...entry, jobId: 'newjob', completedAt: serverTimestamp(), source: 'server' }));
    }
  });
  it('signed-in users read work history; signed-out cannot', async () => {
    await assertSucceeds(getDoc(doc(as('mallory'), 'workHistory/cjob_worker')));
    await assertSucceeds(getDocs(query(collection(as('poster'), 'workHistory'), where('user1', '==', 'poster'))));
    await assertFails(getDoc(doc(anon(), 'workHistory/cjob_worker')));
  });
  it('nobody updates or deletes work history', async () => {
    await assertFails(updateDoc(doc(as('poster'), 'workHistory/cjob_worker'), { jobTitle: 'sửa' }));
    await assertFails(deleteDoc(doc(as('worker'), 'workHistory/cjob_worker')));
  });
});

describe('notifications', () => {
  it('the owner can read their notification; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'notifications/n1')));
    await assertFails(getDoc(doc(as('bob'), 'notifications/n1')));
  });
  it('users cannot create notifications for other users', async () => {
    const payload = { userId: 'alice', type: 'new_application', message: 'spam', read: false };
    await assertFails(setDoc(doc(as('mallory'), 'notifications/spam'), payload));
    // sanity: the same document written server-side (Admin SDK bypasses rules) is valid and readable by its owner
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'notifications/spam'), { ...payload, source: 'server' }));
    await assertSucceeds(getDoc(doc(as('alice'), 'notifications/spam')));
  });
  it('clients cannot create notifications, not even for themselves (the server sends every notification)', async () => {
    await assertFails(setDoc(doc(as('bob'), 'notifications/client-made'), { userId: 'alice', message: 'hi', read: false }));
    await assertFails(setDoc(doc(as('alice'), 'notifications/self-made'), { userId: 'alice', message: 'hi', read: false }));
  });
  it('clients can never set source on create (reserved for server-written notifications)', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'notifications/forged'), { userId: 'alice', message: 'x', read: false, source: 'server' }));
    await assertFails(setDoc(doc(as('alice'), 'notifications/forged-own'), { userId: 'alice', message: 'x', read: false, source: 'client' }));
  });
  it('the payload the old web client sent is denied', async () => {
    await assertFails(
      setDoc(doc(as('bob'), 'notifications/client-shaped'), {
        userId: 'alice',
        type: 'new_application',
        message: 'Có ứng viên mới',
        read: false,
        jobId: 'job1',
        jobTitle: 'Nhập liệu',
        fromName: 'Bob',
        createdAt: serverTimestamp(),
      }),
    );
  });
  it('clients cannot set source even to null', async () => {
    await assertFails(setDoc(doc(as('bob'), 'notifications/null-source'), { userId: 'alice', message: 'x', read: false, source: null }));
  });
  it('a client cannot squat a server id {type}_{id}, and cannot add source to a legacy squatted doc', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'notifications/new_application_app8'), { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: false }));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'notifications/new_application_app9'), { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: false }),
    );
    const squat = doc(as('mallory'), 'notifications/new_application_app9');
    await assertSucceeds(getDoc(squat)); // sanity: the legacy doc is mallory's
    await assertFails(updateDoc(squat, { source: 'server' }));
    await assertFails(updateDoc(squat, { read: true, source: 'server' }));
    await assertFails(setDoc(squat, { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: true, source: 'server' }));
  });
  it('the owner cannot add source through an update', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'notifications/n1'), { read: true, source: 'server' }));
  });
  it('the owner can mark their notification read', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'notifications/n1'), { read: true }));
  });
  it('the owner cannot change message or userId, or un-read', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'notifications/n1'), { message: 'edited' }));
    await assertFails(updateDoc(doc(as('alice'), 'notifications/n1'), { userId: 'bob' }));
    await assertFails(updateDoc(doc(as('alice'), 'notifications/n1'), { read: true, message: 'edited' }));
    await assertFails(updateDoc(doc(as('alice'), 'notifications/n1'), { read: false }));
  });
  it('deleting the read field is denied', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'notifications/n1'), { read: deleteField() }));
  });
  it('another user cannot mark it read', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'notifications/n1'), { read: true }));
  });

});

describe('ratings', () => {
  const rid = 'rjob_poster_worker';
  const base = {
    jobId: 'rjob',
    fromUserId: 'poster',
    toUserId: 'worker',
    score: 5,
    comment: 'tot',
    type: 'poster-to-worker',
  };
  const rate = (uid: string, id: string, over: Record<string, unknown> = {}) =>
    setDoc(doc(as(uid), `ratings/${id}`), { ...base, createdAt: serverTimestamp(), ...over });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'jobs/rjob'), {
        title: 'Xong',
        postedBy: 'poster',
        applicants: ['worker'],
        assignedTo: ['worker'],
        status: 'completed',
      });
      await setDoc(doc(db, 'workHistory/rjob_worker'), { jobId: 'rjob', userId: 'worker', source: 'server', serverVersion: 'completion-v1' });
      // completed under the old rules by the client: no server work history
      await setDoc(doc(db, 'jobs/legacyjob'), {
        title: 'Cu',
        postedBy: 'poster',
        applicants: ['worker'],
        assignedTo: ['worker'],
        status: 'completed',
      });
      await setDoc(doc(db, 'jobs/ipjob'), {
        title: 'Dang lam',
        postedBy: 'poster',
        applicants: ['worker'],
        assignedTo: ['worker'],
        status: 'in-progress',
      });
    });
  });

  it('poster rates worker with the correct id', async () => {
    await assertSucceeds(rate('poster', rid));
  });
  it('denies rating a completed job without server work history (completed by the client under old rules)', async () => {
    await assertFails(rate('poster', 'legacyjob_poster_worker', { jobId: 'legacyjob' }));
    await assertFails(
      rate('worker', 'legacyjob_worker_poster', { jobId: 'legacyjob', fromUserId: 'worker', toUserId: 'poster', type: 'worker-to-poster' }),
    );
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'workHistory/legacyjob_worker'), { serverVersion: 'old' }));
    await assertFails(rate('poster', 'legacyjob_poster_worker', { jobId: 'legacyjob' })); // wrong version
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'workHistory/legacyjob_worker'), { serverVersion: 'completion-v1' }));
    await assertSucceeds(rate('poster', 'legacyjob_poster_worker', { jobId: 'legacyjob' })); // sanity
  });
  it('worker rates poster', async () => {
    await assertSucceeds(
      rate('worker', 'rjob_worker_poster', { fromUserId: 'worker', toUserId: 'poster', type: 'worker-to-poster' }),
    );
  });
  it('denies a wrong document id', async () => {
    await assertFails(rate('poster', 'r1'));
  });
  it('denies forging the sender', async () => {
    await assertFails(rate('worker', rid));
  });
  it('denies an outsider rating the worker', async () => {
    await assertFails(rate('mallory', 'rjob_mallory_worker', { fromUserId: 'mallory' }));
  });
  it('denies scores outside 1..5 or non-integer', async () => {
    await assertFails(rate('poster', rid, { score: 6 }));
    await assertFails(rate('poster', rid, { score: 0 }));
    await assertFails(rate('poster', rid, { score: 4.5 }));
  });
  it('denies rating yourself', async () => {
    await assertFails(rate('poster', 'rjob_poster_poster', { toUserId: 'poster' }));
  });
  it('denies a second create on the same id', async () => {
    await assertSucceeds(rate('poster', rid));
    await assertFails(rate('poster', rid, { score: 1 }));
  });
  it('denies extra keys, long comments, wrong type, client createdAt', async () => {
    await assertFails(rate('poster', rid, { extra: 1 }));
    await assertFails(rate('poster', rid, { comment: 'x'.repeat(1001) }));
    await assertFails(rate('poster', rid, { comment: 5 }));
    await assertFails(rate('poster', rid, { type: 'worker-to-poster' }));
    await assertFails(rate('poster', rid, { createdAt: Timestamp.fromMillis(0) }));
  });
  it('denies worker-to-poster by a non-assignee', async () => {
    await assertFails(
      rate('mallory', 'rjob_mallory_poster', { fromUserId: 'mallory', toUserId: 'poster', type: 'worker-to-poster' }),
    );
  });
  it('denies poster-to-worker aimed at a non-assignee', async () => {
    await assertFails(rate('poster', 'rjob_poster_mallory', { toUserId: 'mallory' }));
  });
  it('denies worker-to-poster aimed at someone other than the poster', async () => {
    await assertFails(
      rate('worker', 'rjob_worker_mallory', { fromUserId: 'worker', toUserId: 'mallory', type: 'worker-to-poster' }),
    );
  });
  it('denies a rating on a nonexistent job', async () => {
    await assertFails(rate('poster', 'nojob_poster_worker', { jobId: 'nojob' }));
  });
  it('denies a rating without a comment key', async () => {
    const noComment: Record<string, unknown> = { ...base };
    delete noComment.comment;
    await assertFails(setDoc(doc(as('poster'), `ratings/${rid}`), { ...noComment, createdAt: serverTimestamp() }));
  });
  it('denies a poster rating on a completed job they did not post', async () => {
    await assertFails(rate('mallory', 'rjob_mallory_worker', { fromUserId: 'mallory' }));
  });
  it('a poster-fabricated completion cannot unlock rating', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_carol'), { jobId: 'job1', applicantId: 'carol', status: 'accepted' });
    });
    await assertSucceeds(
      updateDoc(doc(as('poster'), 'jobs/job1'), { assignedTo: ['carol'], status: 'in-progress' }),
    );
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { status: 'completed' }));
    await assertFails(rate('poster', 'job1_poster_carol', { jobId: 'job1', toUserId: 'carol' }));
    // sanity: once the server completes the job (status + work history), the same rating is allowed
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'jobs/job1'), { status: 'completed' });
      await setDoc(doc(ctx.firestore(), 'workHistory/job1_carol'), { serverVersion: 'completion-v1' });
    });
    await assertSucceeds(rate('poster', 'job1_poster_carol', { jobId: 'job1', toUserId: 'carol' }));
  });
  it('denies rating before the job is completed', async () => {
    await assertFails(rate('poster', 'ipjob_poster_worker', { jobId: 'ipjob' }));
  });
});
