# Classroom reliability and dashboard update

- Room codes resolve through `roomCodes/{code}`; creation reserves the code and creates the room in one transaction. QR addresses continue to work. Existing rooms register when their owner opens the dashboard; the migration script backfills unopened rooms.
- Platform operators have `platformAdmins/{Firebase UID}` with `enabled: true`. Clients cannot create or change these documents. Firestore enforces operator-only global settings writes and teacher-registry access. Ordinary teachers retain their own classroom controls. The old browser passcode is no longer an authorization mechanism.
- Settings cache updates only after a successful server save. Server settings take precedence on reload. Starting a simulation freezes its settings; the dashboard shows the active snapshot.
- Wide dashboards show three teams per row, with phase status, incomplete/approval filters, expandable details, and links from pending progress items. Small displays use two or one columns.
- Evaluation displays actual progress and distinguishes fallback results. Retry targets only missing/fallback evaluations. Autosave shows offline/local retention and last confirmed server save, and offers local draft/server choices on restoration.
- Investment amounts use ten-thousand-won units. Direct input is applied explicitly in 100-man-won increments. Zero pivot multipliers remain zero.

## Deployment order

1. Run `npm test`, `npm run test:browser`, `npm run build`.
2. With Firebase CLI and Java 21+ available, run `npm run test:rules` (demo emulator only).
3. Verify the intended operator UID. Run `node scripts/migrate-classroom-access.cjs` to inspect the room directory migration without writing.
4. Deploy `firestore.rules` with `firebase deploy --only firestore:rules`.
5. Run `node scripts/migrate-classroom-access.cjs --apply --admin-uid FIREBASE_UID` using the project owner's Firebase CLI session. This verifies the teacher account, grants the role, backfills codes, and removes only the obsolete passcode fields.
6. Publish the application. Verify room-code and QR entry and operator settings access.

Never put credentials or passcodes in role documents, source code, or browser storage. The migration script does not print authentication tokens or account details.
