import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
      updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: ['carol', 'alice'], updatedAt: 1 }),
    );
  });
  it.fails('KNOWN HOLE (fix in B): job create must set postedBy to the caller', async () => {
    await assertFails(setDoc(doc(as('alice'), 'jobs/forged'), { title: 'x', postedBy: 'bob' }));
  });
  it.fails('KNOWN HOLE (fix in B): a non-poster cannot remove other applicants', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'jobs/job1'), { applicants: [] }));
  });
});

describe('applications', () => {
  it('a user can create an application for themselves', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'applications/a1'), { jobId: 'job1', applicantId: 'alice' }));
  });
  it('a user cannot create an application on behalf of someone else', async () => {
    await assertFails(setDoc(doc(as('alice'), 'applications/a2'), { jobId: 'job1', applicantId: 'bob' }));
  });
});

describe('payments', () => {
  it('a third party cannot read a payment', async () => {
    await assertFails(getDoc(doc(as('mallory'), 'payments/pay1')));
  });
  it('payer and payee can read the payment', async () => {
    await assertSucceeds(getDoc(doc(as('poster'), 'payments/pay1')));
    await assertSucceeds(getDoc(doc(as('worker'), 'payments/pay1')));
  });
  it.fails('KNOWN HOLE (fix in B): the payee cannot release escrow to themselves', async () => {
    await assertFails(updateDoc(doc(as('worker'), 'payments/pay1'), { status: 'released' }));
  });
  it.fails('KNOWN HOLE (fix in B): clients cannot create payments for other people', async () => {
    await assertFails(
      setDoc(doc(as('mallory'), 'payments/forged'), {
        jobId: 'job1', payerId: 'poster', payeeId: 'mallory', amount: 9_999_999, status: 'released',
      }),
    );
  });
});

describe('jobCompletions', () => {
  it.fails('KNOWN HOLE (fix in B): outsiders cannot confirm a completion', async () => {
    await assertFails(updateDoc(doc(as('mallory'), 'jobCompletions/c1'), { posterConfirmed: true, status: 'confirmed' }));
  });
});

describe('notifications', () => {
  it('the owner can read their notification; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'notifications/n1')));
    await assertFails(getDoc(doc(as('bob'), 'notifications/n1')));
  });
  it.fails('KNOWN HOLE (fix in B): users cannot create notifications for other users', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'notifications/spam'), { userId: 'alice', message: 'spam', read: false }));
  });
});

describe('ratings', () => {
  it('a user can create a rating as themselves', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'ratings/r1'), { fromUserId: 'alice', toUserId: 'bob', score: 5 }));
  });
  it('a user cannot forge a rating from someone else', async () => {
    await assertFails(setDoc(doc(as('alice'), 'ratings/r2'), { fromUserId: 'bob', toUserId: 'alice', score: 5 }));
  });
});
