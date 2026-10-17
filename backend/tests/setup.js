// Loaded via `node --import` before any test module, so env is set before config/env.js runs.
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://secondbrain:secondbrain@localhost:5433/second_brain_test';
process.env.AI_PROVIDER = 'mock';
process.env.WORKER_ENABLED = 'false';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.MAX_UPLOAD_MB = '1';
process.env.RAG_RERANK = 'true';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `second-brain-test-uploads-${process.pid}`);
