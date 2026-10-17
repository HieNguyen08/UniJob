# UniJob Cloud Functions

Cloud Functions for Firebase v2 (TypeScript, Node 22, region `asia-southeast1`). Every trusted write (money, escrow, completion, work history, reputation, notifications to other users) belongs here, not in the web client.

- `src/config.ts`: `REGION`, `DATABASE_ID` (`kirigitejkf8095h`).
- `src/admin.ts`: the Admin app and `db` bound to the named database. Firestore triggers must pass `database: DATABASE_ID`.
- `src/lib/`: shared helpers (`requireAuth`, `assertMember`, `writeNotification`, `calculatePlatformFee`).
- `tests/unit/`: Vitest, no emulator (`npm test`).
- `tests/emulator/`: Vitest against the Firestore emulator. Run from `unijob-web/` with `npm run test:functions` (needs Java ≥ 11). Project is always `demo-unijob`.

Install: `npm ci` here as well as in `unijob-web/`.

firebase-admin is pinned to 14.5.0 (firebase-functions 7.4.0 accepts ^14). `firebase-functions-test` is not used: tests call v2 callables through `fn.run(request)`; it only peers on firebase-admin ^13, so adding it back would force 13.x.

## Deploying functions

- Deploying needs the Blaze (pay-as-you-go) plan on the Firebase project. The owner does this. PRs only add code and tests.
- From `unijob-web/`: `npx firebase deploy --only functions` (the predeploy step runs `npm run build`).
- When a PR moves a write server-side and tightens the rules, deploy the functions first, then the rules (`npx firebase deploy --only firestore:rules`). Otherwise the client loses the write before the server can make it.
