-- Second Brain — initial schema
-- Requires PostgreSQL 15+ with the pgvector extension (>= 0.5 for HNSW).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() on older PG versions

-- Keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email          text        NOT NULL CHECK (char_length(email) <= 254),
  password_hash  text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness without needing the citext extension.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- documents: uploaded files and their processing state
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  original_name  text        NOT NULL,
  file_type      text        NOT NULL CHECK (file_type IN ('pdf', 'text', 'markdown', 'transcript')),
  mime_type      text,
  size_bytes     integer     NOT NULL CHECK (size_bytes >= 0),
  storage_path   text        NOT NULL,
  status         text        NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'processing', 'indexed', 'failed')),
  error_message  text,
  page_count     integer,
  char_count     integer,
  chunk_count    integer     NOT NULL DEFAULT 0,
  processed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_user_created_idx ON documents (user_id, created_at DESC);
CREATE INDEX documents_user_status_idx  ON documents (user_id, status);
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- notes: knowledge written directly in the app
-- ---------------------------------------------------------------------------
CREATE TABLE notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content        text        NOT NULL DEFAULT '',
  tags           text[]      NOT NULL DEFAULT '{}',
  index_enabled  boolean     NOT NULL DEFAULT true,
  index_status   text        NOT NULL DEFAULT 'queued'
                   CHECK (index_status IN ('disabled', 'queued', 'processing', 'indexed', 'failed')),
  index_error    text,
  chunk_count    integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_user_updated_idx ON notes (user_id, updated_at DESC);
CREATE INDEX notes_tags_idx ON notes USING gin (tags);
-- Only user edits bump updated_at; background index-status changes don't.
CREATE OR REPLACE FUNCTION set_note_updated_at() RETURNS trigger AS $$
BEGIN
  IF (NEW.title, NEW.content, NEW.tags, NEW.index_enabled)
     IS DISTINCT FROM (OLD.title, OLD.content, OLD.tags, OLD.index_enabled) THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_note_updated_at();

-- ---------------------------------------------------------------------------
-- document_chunks: the retrieval unit. A chunk belongs to exactly one source
-- (a document OR a note). user_id is denormalised so every retrieval query can
-- filter by owner without a join — the core of tenant isolation.
-- ---------------------------------------------------------------------------
CREATE TABLE document_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id    uuid        REFERENCES documents(id) ON DELETE CASCADE,
  note_id        uuid        REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index    integer     NOT NULL,
  content        text        NOT NULL,
  page_number    integer,
  page_end       integer,
  section        text,
  token_estimate integer     NOT NULL DEFAULT 0,
  embedding      vector(768) NOT NULL,
  content_tsv    tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chunk_has_one_source CHECK ((document_id IS NULL) <> (note_id IS NULL))
);
CREATE INDEX chunks_user_idx      ON document_chunks (user_id);
CREATE INDEX chunks_document_idx  ON document_chunks (document_id, chunk_index) WHERE document_id IS NOT NULL;
CREATE INDEX chunks_note_idx      ON document_chunks (note_id, chunk_index) WHERE note_id IS NOT NULL;
CREATE INDEX chunks_tsv_idx       ON document_chunks USING gin (content_tsv);
-- Approximate nearest-neighbour index for cosine distance (<=>).
CREATE INDEX chunks_embedding_hnsw_idx ON document_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- conversations & messages
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          text        NOT NULL DEFAULT 'New conversation',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_updated_idx ON conversations (user_id, updated_at DESC);
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text        NOT NULL,
  sources          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- ingestion_jobs: durable background queue (workers claim rows with
-- FOR UPDATE SKIP LOCKED, so several API instances can process safely).
-- ---------------------------------------------------------------------------
CREATE TABLE ingestion_jobs (
  id             bigserial PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id    uuid        REFERENCES documents(id) ON DELETE CASCADE,
  note_id        uuid        REFERENCES notes(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts       integer     NOT NULL DEFAULT 0,
  max_attempts   integer     NOT NULL DEFAULT 3,
  last_error     text,
  run_after      timestamptz NOT NULL DEFAULT now(),
  locked_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_has_one_source CHECK ((document_id IS NULL) <> (note_id IS NULL))
);
CREATE INDEX ingestion_jobs_pending_idx ON ingestion_jobs (run_after) WHERE status = 'pending';
CREATE INDEX ingestion_jobs_document_idx ON ingestion_jobs (document_id);
CREATE INDEX ingestion_jobs_note_idx ON ingestion_jobs (note_id);
CREATE TRIGGER ingestion_jobs_updated_at BEFORE UPDATE ON ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
