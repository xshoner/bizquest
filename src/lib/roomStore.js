// Firestore write helpers for rooms and students.
// Every helper writes with field paths or per-document batches so concurrent edits from students
// and the teacher never overwrite each other (no whole-map `teams` / `students` writes).
import { deleteField, getDocs, setDoc, updateDoc, writeBatch, db } from "../firebase.js";
import { roomDocRef, studentDocRef, studentsCollectionRef } from "../hooks/useRoom.js";
import { makeInitialRoom } from "./game.js";

const BATCH_LIMIT = 450;

async function commitInChunks(operations) {
  let batch = writeBatch(db);
  let count = 0;
  for (const operation of operations) {
    operation(batch);
    count += 1;
    if (count === BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

/** Deletes every student record of a room (Firestore never cascades sub-collection deletes). */
export async function deleteRoomStudents(ownerUid, roomId) {
  const snapshot = await getDocs(studentsCollectionRef(ownerUid, roomId));
  await commitInChunks(snapshot.docs.map((item) => (batch) => batch.delete(item.ref)));
  return snapshot.size;
}

/** Deletes a room together with its students sub-collection. */
export async function deleteRoomDeep(ownerUid, roomId) {
  await deleteRoomStudents(ownerUid, roomId);
  await commitInChunks([(batch) => batch.delete(roomDocRef(ownerUid, roomId))]);
}

/** Resets a room to its initial state and clears all student records. */
export async function resetRoomDeep(ownerUid, roomId, roomTitle) {
  await deleteRoomStudents(ownerUid, roomId);
  // Non-merge set replaces the whole document, which also drops any legacy inline `students` map.
  await setDoc(roomDocRef(ownerUid, roomId), { ...makeInitialRoom(roomId, roomTitle), ownerUid });
}

/** Upserts a student record (teacher side). Pass the merged in-memory student so legacy inline records migrate. */
export async function upsertStudent(ownerUid, roomId, uid, student, patch = {}) {
  await setDoc(studentDocRef(ownerUid, roomId, uid), { ...(student || {}), uid, ...patch, updatedAt: Date.now() }, { merge: true });
}

/** Teacher: move a student to another team, clearing leadership of the previous team when needed. */
export async function moveStudent({ ownerUid, roomId, uid, student, teams, teamKey, sysMessage }) {
  const previousTeam = student?.team;
  // Legacy rooms may still carry the student inline; drop that copy so the sub-collection wins.
  const roomPatch = { updatedAt: Date.now(), [`students.${uid}`]: deleteField() };
  if (sysMessage) roomPatch.sysMessage = sysMessage;
  if (previousTeam && previousTeam !== teamKey && teams?.[previousTeam]?.leaderId === uid) {
    roomPatch[`teams.${previousTeam}.leaderId`] = null;
  }
  await commitInChunks([
    (batch) => batch.set(studentDocRef(ownerUid, roomId, uid), { ...(student || {}), uid, team: teamKey, updatedAt: Date.now() }, { merge: true }),
    (batch) => batch.update(roomDocRef(ownerUid, roomId), roomPatch)
  ]);
}

/** Teacher: remove a student from the room and clear any leadership they held. */
export async function removeStudentDeep({ ownerUid, roomId, uid, teams, sysMessage }) {
  const roomPatch = { updatedAt: Date.now(), [`students.${uid}`]: deleteField() };
  if (sysMessage) roomPatch.sysMessage = sysMessage;
  for (const [key, team] of Object.entries(teams || {})) {
    if (team.leaderId === uid) roomPatch[`teams.${key}.leaderId`] = null;
  }
  await commitInChunks([
    (batch) => batch.delete(studentDocRef(ownerUid, roomId, uid)),
    (batch) => batch.update(roomDocRef(ownerUid, roomId), roomPatch)
  ]);
}

/** Teacher: delete a team and send its members back to the waiting room. */
export async function deleteTeamDeep({ ownerUid, roomId, teamKey, students, sysMessage }) {
  const operations = [];
  for (const [uid, student] of Object.entries(students || {})) {
    if (student.team === teamKey) {
      operations.push((batch) => batch.set(studentDocRef(ownerUid, roomId, uid), { ...student, uid, team: null, updatedAt: Date.now() }, { merge: true }));
    }
  }
  const roomPatch = { [`teams.${teamKey}`]: deleteField(), updatedAt: Date.now() };
  if (sysMessage) roomPatch.sysMessage = sysMessage;
  operations.push((batch) => batch.update(roomDocRef(ownerUid, roomId), roomPatch));
  await commitInChunks(operations);
}

/** Student: update own record with a field patch. */
export async function updateOwnStudent(ownerUid, roomId, uid, patch) {
  await updateDoc(studentDocRef(ownerUid, roomId, uid), { ...patch, updatedAt: Date.now() });
}

/** Student (leader/member): update fields of own team using field paths only. */
export async function updateOwnTeam(ownerUid, roomId, teamKey, patch, sysMessage) {
  const roomPatch = { updatedAt: Date.now() };
  for (const [field, value] of Object.entries(patch)) {
    roomPatch[`teams.${teamKey}.${field}`] = value;
  }
  if (sysMessage) roomPatch.sysMessage = sysMessage;
  await updateDoc(roomDocRef(ownerUid, roomId), roomPatch);
}
