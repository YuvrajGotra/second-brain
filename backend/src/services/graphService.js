import { query } from '../config/database.js';
import { cosineSimilarity } from '../rag/vectorMath.js';

const MAX_SOURCES = 200;
const NEIGHBOURS = 3;
const MIN_SIMILARITY = 0.1;

/**
 * Knowledge graph built from the embedding space:
 *  - one node per indexed document / note, positioned by its centroid embedding
 *    (pgvector's avg() aggregate over the source's chunks)
 *  - "similar" edges connect each source to its nearest neighbours by cosine similarity
 *  - tag nodes connect notes that share a tag
 */
export async function buildKnowledgeGraph(userId) {
  const { rows } = await query(
    `SELECT c.document_id, c.note_id, COALESCE(d.title, n.title) AS title,
            CASE WHEN c.document_id IS NOT NULL THEN d.file_type ELSE 'note' END AS file_type,
            n.tags, count(*)::int AS chunk_count, avg(c.embedding)::text AS centroid
       FROM document_chunks c
       LEFT JOIN documents d ON d.id = c.document_id
       LEFT JOIN notes n ON n.id = c.note_id
      WHERE c.user_id = $1
      GROUP BY c.document_id, c.note_id, d.title, n.title, d.file_type, n.tags
      ORDER BY count(*) DESC
      LIMIT ${MAX_SOURCES}`,
    [userId],
  );

  const nodes = rows.map((r) => ({
    id: r.document_id ?? r.note_id,
    kind: r.document_id ? 'document' : 'note',
    label: r.title,
    fileType: r.file_type,
    size: r.chunk_count,
    vector: JSON.parse(r.centroid),
    tags: r.tags ?? [],
  }));

  // Absolute similarity values differ a lot between embedding models, so edges use a
  // relative threshold: the 70th percentile of all pairwise similarities. Every node
  // also keeps its single nearest neighbour so related clusters never float alone.
  const sims = nodes.map((a, i) => nodes.map((b, j) => (i === j ? -1 : cosineSimilarity(a.vector, b.vector))));
  const pairwise = sims.flatMap((row, i) => row.slice(i + 1)).sort((x, y) => x - y);
  const threshold = Math.max(MIN_SIMILARITY, pairwise[Math.floor(pairwise.length * 0.7)] ?? 1);
  const [lo, hi] = [pairwise[0] ?? 0, pairwise.at(-1) ?? 1];

  const edges = [];
  const seen = new Set();
  nodes.forEach((a, i) => {
    const ranked = sims[i]
      .map((sim, j) => ({ j, sim }))
      .filter((x) => x.j !== i && x.sim >= MIN_SIMILARITY)
      .sort((x, y) => y.sim - x.sim);
    const chosen = ranked.filter((x, k) => k === 0 || x.sim >= threshold).slice(0, NEIGHBOURS);
    for (const { j, sim } of chosen) {
      const key = [a.id, nodes[j].id].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        source: a.id,
        target: nodes[j].id,
        kind: 'similar',
        weight: Number(sim.toFixed(3)),
        strength: hi > lo ? Number(((sim - lo) / (hi - lo)).toFixed(3)) : 1, // 0..1 within this graph
      });
    }
  });

  const tagNodes = new Map();
  for (const node of nodes) {
    for (const tag of node.tags) {
      const id = `tag:${tag}`;
      if (!tagNodes.has(id)) tagNodes.set(id, { id, kind: 'tag', label: `#${tag}`, size: 1 });
      else tagNodes.get(id).size++;
      edges.push({ source: node.id, target: id, kind: 'tag', weight: 1 });
    }
  }

  return {
    nodes: [...nodes.map(({ vector: _v, ...n }) => n), ...tagNodes.values()],
    edges,
  };
}
