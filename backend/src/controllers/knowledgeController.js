import { search as searchKnowledge } from '../services/searchService.js';
import { getDashboardStats } from '../services/statsService.js';
import { buildKnowledgeGraph } from '../services/graphService.js';
import * as chunkModel from '../models/chunkModel.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/response.js';

export async function search(req, res) {
  ok(res, await searchKnowledge(req.user.id, req.validated.body));
}

export async function stats(req, res) {
  ok(res, await getDashboardStats(req.user.id));
}

export async function graph(req, res) {
  ok(res, await buildKnowledgeGraph(req.user.id));
}

/** Used by the citation drawer to show the exact source passage. */
export async function chunk(req, res) {
  const found = await chunkModel.findById(req.user.id, req.validated.params.id);
  if (!found) throw AppError.notFound('Source passage');
  ok(res, found);
}
