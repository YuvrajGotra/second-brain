import * as noteService from '../services/noteService.js';
import { ok, created } from '../utils/response.js';

export async function list(req, res) {
  const { limit, offset, q, tag } = req.validated.query;
  const { items, total } = await noteService.listNotes(req.user.id, { limit, offset, q, tag });
  ok(res, items, { meta: { total, limit, offset } });
}

export async function tags(req, res) {
  ok(res, await noteService.listTags(req.user.id));
}

export async function create(req, res) {
  created(res, await noteService.createNote(req.user.id, req.validated.body));
}

export async function get(req, res) {
  ok(res, await noteService.getNote(req.user.id, req.validated.params.id));
}

export async function update(req, res) {
  ok(res, await noteService.updateNote(req.user.id, req.validated.params.id, req.validated.body));
}

export async function remove(req, res) {
  await noteService.deleteNote(req.user.id, req.validated.params.id);
  ok(res, { deleted: true });
}
