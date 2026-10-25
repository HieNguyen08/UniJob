import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
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
  it.fails('KNOWN HOLE (fix in slice 5): poster cannot mark a job completed directly', async () => {
    await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/ipj'), { status: 'completed' }));
  });
  it.fails('KNOWN HOLE (fix in slice 6): poster cannot cancel an in-progress job while escrow is held', async () => {
    await seedJob('paid', { status: 'in-progress', assignedTo: ['carol'], paymentStatus: 'held' });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments/paidpay'), {
        jobId: 'paid', payerId: 'poster', payeeId: 'carol', amount: 100_000, status: 'held',
      });
    });
    await assertFails(updateDoc(doc(as('poster'), 'jobs/paid'), { status: 'cancelled', updatedAt: serverTimestamp() }));
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
    it('in-progress -> cancelled is allowed', async () => {
      await seedJob('ipj', { status: 'in-progress', assignedTo: ['carol'] });
      await assertSucceeds(setStatus('ipj', 'cancelled'));
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
  it('existing client poster writes still pass (updateJob attachments, posterCancelJob)', async () => {
    const j = doc(as('poster'), 'jobs/job1');
    await assertSucceeds(updateDoc(j, { attachments: ['https://example.com/a.pdf'], updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(j, { status: 'cancelled', updatedAt: serverTimestamp() }));
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
  // Mirrors the web client (rating.service.ts): one completion per job at jobCompletions/{jobId}.
  // The assigned worker calls createJobCompletion (MyJobs.tsx) with exactly these keys, then
  // confirmCompletion(jobId, 'worker'); the poster calls confirmCompletion(jobId, 'poster') (MyJobAcceptance.tsx),
  // which also sets status 'confirmed' + completedAt when the other side already confirmed.
  // getJobCompletion reads jobCompletions/{jobId} with a get (no list query).
  const fresh = (jobId: string) => ({ jobId, workerConfirmed: false, posterConfirmed: false, completedAt: null, status: 'pending' });
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

  it('outsiders cannot confirm a completion', async () => {
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/cjob'), { posterConfirmed: true, status: 'confirmed' }));
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/cjob'), { workerConfirmed: true }));
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/c1'), { posterConfirmed: true, status: 'confirmed' }));
    // sanity (confirmCompletion 'worker'): the assigned worker can confirm the same doc
    await assertSucceeds(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { workerConfirmed: true }));
  });
  it('only an assigned worker of an in-progress job can create its completion (createJobCompletion)', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'jobCompletions/newjob'), fresh('newjob')));
    await assertFails(setDoc(doc(as('poster'), 'jobCompletions/newjob'), fresh('newjob')));
    await assertSucceeds(setDoc(doc(as('worker'), 'jobCompletions/newjob'), fresh('newjob')));
  });
  it('the completion id must be the jobId (one completion per job)', async () => {
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/random-id'), fresh('newjob')));
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/newjob_2'), fresh('newjob')));
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/cjob'), fresh('newjob')));
    // sanity: the same payload at jobCompletions/{jobId} is allowed
    await assertSucceeds(setDoc(doc(as('worker'), 'jobCompletions/newjob'), fresh('newjob')));
  });
  it('a second completion for the same job cannot reset the existing one', async () => {
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/wdjob'), fresh('wdjob')));
    await assertFails(setDoc(doc(as('poster'), 'jobCompletions/pdjob'), fresh('pdjob')));
  });
  it('creating a completion on a job that is not in-progress (or does not exist) is denied', async () => {
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/donejob'), fresh('donejob')));
    await assertFails(setDoc(doc(as('worker'), 'jobCompletions/nojob'), fresh('nojob')));
  });
  it('a completion must be created pending and unconfirmed, with exactly the client keys', async () => {
    const ref = doc(as('worker'), 'jobCompletions/newjob');
    await assertFails(setDoc(ref, { ...fresh('newjob'), extra: 1 }));
    await assertFails(setDoc(ref, { ...fresh('newjob'), workerConfirmed: true }));
    await assertFails(setDoc(ref, { ...fresh('newjob'), posterConfirmed: true }));
    await assertFails(setDoc(ref, { ...fresh('newjob'), status: 'confirmed' }));
    await assertFails(setDoc(ref, { ...fresh('newjob'), completedAt: serverTimestamp() }));
    const missing: Record<string, unknown> = { ...fresh('newjob') };
    delete missing.completedAt;
    await assertFails(setDoc(ref, missing));
  });
  it('a worker cannot set posterConfirmed; the poster cannot set workerConfirmed', async () => {
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { posterConfirmed: true }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { workerConfirmed: true, posterConfirmed: true }));
    await assertFails(updateDoc(doc(as('poster'), 'jobCompletions/cjob'), { workerConfirmed: true }));
    // sanity (confirmCompletion 'poster' before the worker): the poster can confirm their own side
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobCompletions/cjob'), { posterConfirmed: true }));
  });
  it('the worker confirming after the poster sets status confirmed (confirmCompletion, worker last)', async () => {
    await assertSucceeds(
      updateDoc(doc(as('worker'), 'jobCompletions/pdjob'), { workerConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
  });
  it('the poster confirming after the worker sets status confirmed (confirmCompletion, poster last)', async () => {
    await assertSucceeds(
      updateDoc(doc(as('poster'), 'jobCompletions/wdjob'), { posterConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
  });
  it('a completion cannot be updated once its job is no longer in progress', async () => {
    await assertFails(
      updateDoc(doc(as('worker'), 'jobCompletions/xjob'), { workerConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/xjob'), { workerConfirmed: true }));
    // sanity: the same worker-last confirm on an in-progress job is allowed
    await assertSucceeds(
      updateDoc(doc(as('worker'), 'jobCompletions/pdjob'), { workerConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
  });
  it('a completion whose id is not its jobId (legacy random id) cannot be updated', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'jobCompletions/legacy-random'), fresh('cjob')));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/legacy-random'), { workerConfirmed: true }));
  });
  it('status confirmed with only one confirmation is denied', async () => {
    await assertFails(
      updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { workerConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(as('poster'), 'jobCompletions/cjob'), { posterConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }),
    );
  });
  it('confirming needs completedAt set to the request time together with status', async () => {
    const ref = doc(as('worker'), 'jobCompletions/pdjob');
    await assertFails(updateDoc(ref, { workerConfirmed: true, status: 'confirmed' }));
    await assertFails(updateDoc(ref, { workerConfirmed: true, status: 'confirmed', completedAt: Timestamp.fromMillis(0) }));
    await assertFails(updateDoc(ref, { workerConfirmed: true, completedAt: serverTimestamp() }));
  });
  it('nothing goes back to false or pending, and jobId and other keys cannot change', async () => {
    await assertFails(updateDoc(doc(as('poster'), 'jobCompletions/pdjob'), { posterConfirmed: false }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/wdjob'), { workerConfirmed: false }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/wdjob'), { status: 'pending', completedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { jobId: 'newjob' }));
    await assertFails(updateDoc(doc(as('worker'), 'jobCompletions/cjob'), { workerConfirmed: true, extra: 1 }));
  });
  it('a confirmed completion cannot be reopened or re-stamped', async () => {
    const ref = doc(as('poster'), 'jobCompletions/wdjob');
    await assertSucceeds(updateDoc(ref, { posterConfirmed: true, status: 'confirmed', completedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'pending' }));
    await assertFails(updateDoc(ref, { completedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { posterConfirmed: false, status: 'pending', completedAt: null }));
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
  it.fails('KNOWN HOLE (fix in slice 5): a poster-fabricated completion cannot unlock rating', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'applications/job1_carol'), { jobId: 'job1', applicantId: 'carol', status: 'accepted' });
    });
    await assertSucceeds(
      updateDoc(doc(as('poster'), 'jobs/job1'), { assignedTo: ['carol'], status: 'in-progress' }),
    );
    await assertSucceeds(updateDoc(doc(as('poster'), 'jobs/job1'), { status: 'completed' }));
    await assertFails(rate('poster', 'job1_poster_carol', { jobId: 'job1', toUserId: 'carol' }));
  });
  it('denies rating before the job is completed', async () => {
    await assertFails(rate('poster', 'ipjob_poster_worker', { jobId: 'ipjob' }));
  });
});
