import type { Firestore } from 'firebase-admin/firestore';

/** Read-only fake: `collection(c).doc(id).get()` over a map keyed `${c}/${id}`. */
export function fakeDb(docs: Record<string, Record<string, unknown>> = {}): Firestore {
  const get = (path: string, id: string) =>
    Promise.resolve({ id, exists: path in docs, data: () => docs[path] });
  return {
    collection: (c: string) => ({
      doc: (id: string) => ({ id, path: `${c}/${id}`, get: () => get(`${c}/${id}`, id) }),
    }),
  } as unknown as Firestore;
}
