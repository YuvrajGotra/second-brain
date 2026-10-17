import { withTransaction } from '../config/database.js';
import * as noteModel from '../models/noteModel.js';
import * as jobModel from '../models/jobModel.js';
import { notifyNewJob } from '../workers/ingestionWorker.js';
import { AppError } from '../utils/AppError.js';

export async function createNote(userId, input) {
  const note = await withTransaction(async (client) => {
    const created = await noteModel.create(client, userId, input);
    if (created.index_enabled) await jobModel.enqueue(client, { userId, noteId: created.id });
    return created;
  });
  if (note.index_enabled) notifyNewJob();
  return note;
}

export const listNotes = (userId, opts) => noteModel.list(userId, opts);
export const listTags = (userId) => noteModel.listTags(userId);

export async function getNote(userId, id) {
  const note = await noteModel.findById(userId, id);
  if (!note) throw AppError.notFound('Note');
  return note;
}

/** Any edit re-queues indexing (or removes chunks when indexing is switched off). */
export async function updateNote(userId, id, input) {
  const note = await withTransaction(async (client) => {
    const updated = await noteModel.update(client, userId, id, input);
    if (!updated) throw AppError.notFound('Note');
    await jobModel.enqueue(client, { userId, noteId: id });
    return updated;
  });
  notifyNewJob();
  return note;
}

export async function deleteNote(userId, id) {
  if (!(await noteModel.remove(userId, id))) throw AppError.notFound('Note');
}
