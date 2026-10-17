import * as conversationService from '../services/conversationService.js';
import { ok, created } from '../utils/response.js';

export async function list(req, res) {
  const { limit, offset, q } = req.validated.query;
  const { items, total } = await conversationService.listConversations(req.user.id, { limit, offset, q });
  ok(res, items, { meta: { total, limit, offset } });
}

export async function create(req, res) {
  created(res, await conversationService.createConversation(req.user.id, req.validated.body.title));
}

export async function get(req, res) {
  ok(res, await conversationService.getConversation(req.user.id, req.validated.params.id));
}

export async function rename(req, res) {
  ok(res, await conversationService.renameConversation(req.user.id, req.validated.params.id, req.validated.body.title));
}

export async function remove(req, res) {
  await conversationService.deleteConversation(req.user.id, req.validated.params.id);
  ok(res, { deleted: true });
}
