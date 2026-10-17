import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { writeBatch, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
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
  const newJob = (postedBy: string, extra: Record<string, unknown> = {}) => ({
    title: 'x',
    postedBy,
    status: 'open',
    applicants: [],
    assignedTo: [],
    ...extra,
  });
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
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { status: 'completed' }));
  });
  it.fails('KNOWN HOLE (fix in slice 4): poster cannot set paymentStatus directly', async () => {
    await assertFails(updateDoc(doc(as('poster'), 'jobs/job1'), { paymentStatus: 'released' }));
  });
  it('job create rejects paymentStatus and unknown keys', async () => {
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
        deadline: Timestamp.now(),
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
  it('clients can still create a notification without source (current client flows)', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'notifications/client-made'), { userId: 'alice', message: 'hi', read: false }));
  });
  it('clients can never set source on create (reserved for server-written notifications)', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'notifications/forged'), { userId: 'alice', message: 'x', read: false, source: 'server' }));
    await assertFails(setDoc(doc(as('alice'), 'notifications/forged-own'), { userId: 'alice', message: 'x', read: false, source: 'client' }));
  });
  it('clients can create a notification with exactly the keys the web client sends', async () => {
    await assertSucceeds(
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
  it('a client can squat a server id {type}_{id} without source but can never add source to it afterwards', async () => {
    const squat = doc(as('mallory'), 'notifications/new_application_app9');
    await assertSucceeds(setDoc(squat, { userId: 'mallory', type: 'new_application', message: 'giả mạo', read: false }));
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
      updateDoc(doc(as('poster'), 'jobs/job1'), { assignedTo: ['carol'], status: 'completed' }),
    );
    await assertFails(rate('poster', 'job1_poster_carol', { jobId: 'job1', toUserId: 'carol' }));
  });
  it('denies rating before the job is completed', async () => {
    await assertFails(rate('poster', 'ipjob_poster_worker', { jobId: 'ipjob' }));
  });
});
