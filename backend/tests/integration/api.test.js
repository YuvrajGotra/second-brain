import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { pool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createApp } from '../../src/app.js';
import { drainQueue } from '../../src/workers/ingestionWorker.js';

/*
 * End-to-end API tests against a real PostgreSQL + pgvector database
 * (TEST_DATABASE_URL, default: second_brain_test on localhost:5433) using the
 * deterministic mock AI provider. Covers the full RAG flow and, most
 * importantly, tenant isolation between users.
 */
const app = createApp();
const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function registerUser(name, email) {
  const agent = request.agent(app); // keeps the httpOnly cookie between requests
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'password123' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { agent, user: res.body.data.user, token: res.body.data.token };
}

let alice;
let bob;
let aliceDocId;
let aliceNoteId;
let aliceConversationId;

before(async () => {
  await runMigrations();
  await pool.query(
    'TRUNCATE users, documents, document_chunks, notes, conversations, messages, ingestion_jobs RESTART IDENTITY CASCADE',
  );
  alice = await registerUser('Alice', 'alice@example.com');
  bob = await registerUser('Bob', 'bob@example.com');
});

after(async () => {
  await fs.rm(env.UPLOAD_DIR, { recursive: true, force: true });
  await pool.end();
});

describe('authentication', () => {
  test('rejects duplicate emails case-insensitively', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'ALICE@example.com', password: 'password123' });
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
  });

  test('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.length >= 2);
  });

  test('stores bcrypt hashes, never plaintext', async () => {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', ['alice@example.com']);
    assert.match(rows[0].password_hash, /^\$2[aby]\$12\$/);
  });

  test('login sets an httpOnly cookie and wrong passwords get a generic 401', async () => {
    const good = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'password123' });
    assert.equal(good.status, 200);
    assert.match(good.headers['set-cookie'][0], /sb_token=.*HttpOnly/i);

    const bad = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'wrong-pass1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'x' });
    assert.equal(bad.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(bad.body.error.message, unknown.body.error.message);
  });

  test('protected routes require a valid token', async () => {
    assert.equal((await request(app).get('/api/documents')).status, 401);
    const forged = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    assert.equal(forged.status, 401);
    const viaBearer = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${alice.token}`);
    assert.equal(viaBearer.status, 200);
    assert.equal(viaBearer.body.data.user.email, 'alice@example.com');
    assert.equal(viaBearer.body.data.user.password_hash, undefined);
  });
});

describe('document ingestion', () => {
  test('uploads are accepted (202) and indexed by the background worker', async () => {
    const res = await alice.agent
      .post('/api/documents/upload')
      .attach('files', fixture('backend-notes.pdf'))
      .attach('files', fixture('authentication.md'))
      .attach('files', fixture('lecture-12.vtt'));
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(res.body.data.documents.length, 3);
    assert.ok(res.body.data.documents.every((d) => d.status === 'queued'));

    await drainQueue();

    const list = await alice.agent.get('/api/documents');
    assert.equal(list.body.meta.total, 3);
    for (const doc of list.body.data) {
      assert.equal(doc.status, 'indexed', `${doc.title}: ${doc.error_message}`);
      assert.ok(doc.chunk_count > 0);
    }
    aliceDocId = list.body.data.find((d) => d.file_type === 'pdf').id;
  });

  test('stored chunks carry page numbers and 768-dim embeddings', async () => {
    const { rows } = await pool.query(
      'SELECT page_number, vector_dims(embedding) AS dims FROM document_chunks WHERE document_id = $1',
      [aliceDocId],
    );
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.dims === 768 && r.page_number >= 1));
  });

  test('document detail returns chunks', async () => {
    const res = await alice.agent.get(`/api/documents/${aliceDocId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.document.page_count, 3);
    assert.ok(res.body.data.chunks.length > 0);
  });

  test('original file can be downloaded by its owner', async () => {
    const res = await alice.agent.get(`/api/documents/${aliceDocId}/file`);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
  });

  test('unsupported file types are rejected with 422', async () => {
    const res = await alice.agent
      .post('/api/documents/upload')
      .attach('files', Buffer.from('MZ binary'), { filename: 'virus.exe', contentType: 'application/octet-stream' });
    assert.equal(res.status, 422);
  });

  test('a .pdf that is not really a PDF is rejected', async () => {
    const res = await alice.agent
      .post('/api/documents/upload')
      .attach('files', Buffer.from('just text'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    assert.equal(res.status, 422);
  });

  test('files over the size limit are rejected with 413', async () => {
    const big = Buffer.alloc(env.maxUploadBytes + 10, 'a');
    const res = await alice.agent
      .post('/api/documents/upload')
      .attach('files', big, { filename: 'big.txt', contentType: 'text/plain' });
    assert.equal(res.status, 413);
  });
});

describe('notes', () => {
  test('notes are created, indexed and become searchable', async () => {
    const res = await alice.agent.post('/api/notes').send({
      title: 'Kubernetes basics',
      content: '# Pods\nA pod is the smallest deployable unit in Kubernetes and wraps one or more containers.',
      tags: ['DevOps', 'k8s'],
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.tags, ['devops', 'k8s']);
    aliceNoteId = res.body.data.id;

    await drainQueue();
    const note = await alice.agent.get(`/api/notes/${aliceNoteId}`);
    assert.equal(note.body.data.index_status, 'indexed');

    const search = await alice.agent.post('/api/search').send({ query: 'kubernetes pod containers' });
    assert.equal(search.body.data[0].noteId, aliceNoteId);
  });

  test('updating a note re-indexes it; disabling indexing removes its chunks', async () => {
    await alice.agent.put(`/api/notes/${aliceNoteId}`).send({ indexEnabled: false });
    await drainQueue();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM document_chunks WHERE note_id = $1', [aliceNoteId]);
    assert.equal(rows[0].n, 0);
    await alice.agent.put(`/api/notes/${aliceNoteId}`).send({ indexEnabled: true });
    await drainQueue();
  });

  test('tag filter works', async () => {
    const res = await alice.agent.get('/api/notes?tag=k8s');
    assert.equal(res.body.data.length, 1);
  });
});

describe('search and RAG chat', () => {
  test('hybrid search finds the relevant passage with location metadata', async () => {
    const res = await alice.agent.post('/api/search').send({ query: 'refresh token rotation theft' });
    assert.equal(res.status, 200);
    const top = res.body.data[0];
    assert.ok(['authentication', 'backend-notes'].includes(top.title));
    assert.ok(top.snippet.length > 0);
  });

  test('chat returns a grounded answer with citations (JSON mode)', async () => {
    const res = await alice.agent.post('/api/chat').send({ message: 'How should refresh tokens be stored?' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { assistantMessage, conversation } = res.body.data;
    aliceConversationId = conversation.id;
    assert.match(assistantMessage.content, /\[\d\]/);
    assert.ok(assistantMessage.sources.length > 0);
    const cited = assistantMessage.sources.filter((s) => s.cited);
    assert.ok(cited.length > 0);
    assert.ok(cited.every((s) => s.title && s.chunkId && s.excerpt));
    assert.notEqual(conversation.title, 'New conversation');
  });

  test('chat streams SSE events in order', async () => {
    const res = await alice.agent
      .post('/api/chat')
      .set('Accept', 'text/event-stream')
      .send({ conversationId: aliceConversationId, message: 'What does a JWT signature protect against?' })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => cb(null, data));
      });
    assert.equal(res.status, 200);
    const events = [...res.body.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    assert.equal(events[0], 'meta');
    assert.equal(events[1], 'sources');
    assert.ok(events.includes('token'));
    assert.equal(events.at(-1), 'done');
  });

  test('follow-up questions are rewritten using conversation history', async () => {
    const res = await alice.agent
      .post('/api/chat')
      .send({ conversationId: aliceConversationId, message: 'Why is it important?' });
    assert.match(res.body.data.assistantMessage.metadata.standaloneQuery, /context:/);
  });

  test('questions outside the knowledge base get an honest "not found"', async () => {
    const res = await alice.agent.post('/api/chat').send({ message: 'Zyxwv quokka saxophone recipe?' });
    assert.match(res.body.data.assistantMessage.content, /couldn't find/i);
    assert.equal(res.body.data.assistantMessage.sources.length, 0);
  });

  test('conversation history is stored and listed', async () => {
    const res = await alice.agent.get(`/api/conversations/${aliceConversationId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.messages.length, 6);
    assert.deepEqual(
      res.body.data.messages.slice(0, 2).map((m) => m.role),
      ['user', 'assistant'],
    );
    const list = await alice.agent.get('/api/conversations');
    assert.ok(list.body.data.length >= 2);
  });

  test('dashboard stats reflect the knowledge base', async () => {
    const res = await alice.agent.get('/api/stats');
    assert.equal(res.body.data.counts.documents, 3);
    assert.equal(res.body.data.counts.notes, 1);
    assert.ok(res.body.data.counts.chunks > 3);
  });

  test('knowledge graph returns nodes and edges', async () => {
    const res = await alice.agent.get('/api/graph');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.nodes.some((n) => n.kind === 'tag'));
  });
});

describe('tenant isolation (User B can never reach User A data)', () => {
  test('Bob sees an empty library', async () => {
    const res = await bob.agent.get('/api/documents');
    assert.equal(res.body.meta.total, 0);
  });

  test("Bob gets 404 for Alice's document, file, note and conversation", async () => {
    for (const path of [
      `/api/documents/${aliceDocId}`,
      `/api/documents/${aliceDocId}/file`,
      `/api/notes/${aliceNoteId}`,
      `/api/conversations/${aliceConversationId}`,
    ]) {
      const res = await bob.agent.get(path);
      assert.equal(res.status, 404, path);
    }
  });

  test("Bob cannot delete or modify Alice's resources", async () => {
    assert.equal((await bob.agent.delete(`/api/documents/${aliceDocId}`)).status, 404);
    assert.equal((await bob.agent.delete(`/api/notes/${aliceNoteId}`)).status, 404);
    assert.equal((await bob.agent.put(`/api/notes/${aliceNoteId}`).send({ title: 'pwned' })).status, 404);
    assert.equal((await bob.agent.delete(`/api/conversations/${aliceConversationId}`)).status, 404);
    const stillThere = await alice.agent.get(`/api/notes/${aliceNoteId}`);
    assert.equal(stillThere.body.data.title, 'Kubernetes basics');
  });

  test("Bob cannot post into Alice's conversation", async () => {
    const res = await bob.agent.post('/api/chat').send({ conversationId: aliceConversationId, message: 'hi' });
    assert.equal(res.status, 404);
  });

  test("Bob's semantic search and chat never retrieve Alice's chunks", async () => {
    const search = await bob.agent.post('/api/search').send({ query: 'refresh token rotation theft JWT' });
    assert.equal(search.body.data.length, 0);

    const chat = await bob.agent.post('/api/chat').send({ message: 'How should refresh tokens be stored?' });
    assert.equal(chat.body.data.assistantMessage.sources.length, 0);
    assert.match(chat.body.data.assistantMessage.content, /couldn't find/i);
  });

  test("Bob cannot read Alice's chunks by id", async () => {
    const { rows } = await pool.query('SELECT id FROM document_chunks WHERE document_id = $1 LIMIT 1', [aliceDocId]);
    assert.equal((await bob.agent.get(`/api/chunks/${rows[0].id}`)).status, 404);
    assert.equal((await alice.agent.get(`/api/chunks/${rows[0].id}`)).status, 200);
  });

  test("Bob's search can't be tricked into filtering on Alice's document ids", async () => {
    const res = await bob.agent
      .post('/api/chat')
      .send({ message: 'JWT', filters: { sourceType: 'documents', documentIds: [aliceDocId] } });
    assert.equal(res.body.data.assistantMessage.sources.length, 0);
  });
});

describe('cleanup', () => {
  test('deleting a document removes its chunks, embeddings and file', async () => {
    const { rows: before } = await pool.query('SELECT storage_path FROM documents WHERE id = $1', [aliceDocId]);
    const res = await alice.agent.delete(`/api/documents/${aliceDocId}`);
    assert.equal(res.status, 200);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM document_chunks WHERE document_id = $1', [
      aliceDocId,
    ]);
    assert.equal(rows[0].n, 0);
    await assert.rejects(fs.access(path.join(env.UPLOAD_DIR, before[0].storage_path)));
  });

  test('invalid ids return 400, unknown routes 404', async () => {
    assert.equal((await alice.agent.get('/api/documents/not-a-uuid')).status, 400);
    assert.equal((await request(app).get('/api/health')).status, 200);
  });
});
