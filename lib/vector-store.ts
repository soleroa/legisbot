import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { EMBEDDING_DIM } from "./embeddings";
import type { SourceSection } from "./types";

/**
 * sqlite-vec's own load() uses import.meta.resolve, and any require()/
 * require.resolve() call on the native package (even indirectly, e.g. via
 * its package.json) gets statically traced by Turbopack, which then tries
 * to bundle the .dll/.so as a JS module and fails ("Unknown module type").
 * We sidestep the bundler entirely by locating the native binary with plain
 * filesystem lookups under node_modules, never going through Node's module
 * resolution system, so there is nothing for Turpoback to trace.
 */
function resolveVecExtensionPath(): string {
  const { platform, arch } = process;
  const platformOs = platform === "win32" ? "windows" : platform;
  const suffix = platform === "win32" ? "dll" : platform === "darwin" ? "dylib" : "so";
  const packageName = `sqlite-vec-${platformOs}-${arch}`;

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "node_modules", packageName, `vec0.${suffix}`);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `No se encontró el binario nativo de sqlite-vec para ${packageName} (buscado bajo node_modules desde ${process.cwd()} hacia arriba). ¿Está instalado ${packageName}?`
  );
}

function loadVecExtension(db: Database.Database): void {
  db.loadExtension(resolveVecExtensionPath());
}

export interface StoredChunk {
  id: string;
  section: SourceSection;
  sourceId: string;
  text: string;
  citation: string;
  metadata: string; // JSON-encoded
}

export interface SearchResult {
  id: string;
  section: SourceSection;
  sourceId: string;
  text: string;
  citation: string;
  metadata: Record<string, string>;
  distance: number;
}

function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function openVectorStore(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  loadVecExtension(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      source_id TEXT NOT NULL,
      text TEXT NOT NULL,
      citation TEXT NOT NULL,
      metadata TEXT NOT NULL,
      content_hash TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
      chunk_rowid INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIM}]
    );
  `);

  return db;
}

export function upsertChunk(
  db: Database.Database,
  chunk: StoredChunk,
  contentHash: string,
  embedding: Float32Array
): void {
  const tx = db.transaction(() => {
    const existing = db
      .prepare<[string], { rowid: number }>(`SELECT rowid FROM chunks WHERE id = ?`)
      .get(chunk.id);

    if (existing) {
      db.prepare(
        `UPDATE chunks SET section=?, source_id=?, text=?, citation=?, metadata=?, content_hash=? WHERE id=?`
      ).run(
        chunk.section,
        chunk.sourceId,
        chunk.text,
        chunk.citation,
        chunk.metadata,
        contentHash,
        chunk.id
      );
      db.prepare(`DELETE FROM chunk_vectors WHERE chunk_rowid = ?`).run(existing.rowid);
      db.prepare(`INSERT INTO chunk_vectors (chunk_rowid, embedding) VALUES (?, ?)`).run(
        BigInt(existing.rowid),
        float32ToBuffer(embedding)
      );
    } else {
      const info = db
        .prepare(
          `INSERT INTO chunks (id, section, source_id, text, citation, metadata, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          chunk.id,
          chunk.section,
          chunk.sourceId,
          chunk.text,
          chunk.citation,
          chunk.metadata,
          contentHash
        );
      db.prepare(`INSERT INTO chunk_vectors (chunk_rowid, embedding) VALUES (?, ?)`).run(
        BigInt(info.lastInsertRowid),
        float32ToBuffer(embedding)
      );
    }
  });
  tx();
}

export function getContentHash(db: Database.Database, id: string): string | null {
  const row = db
    .prepare<[string], { content_hash: string }>(`SELECT content_hash FROM chunks WHERE id = ?`)
    .get(id);
  return row?.content_hash ?? null;
}

export function deleteChunksNotIn(db: Database.Database, keepIds: string[]): number {
  const placeholders = keepIds.map(() => "?").join(",");
  const toDelete = keepIds.length
    ? db
        .prepare<string[], { rowid: number; id: string }>(
          `SELECT rowid, id FROM chunks WHERE id NOT IN (${placeholders})`
        )
        .all(...keepIds)
    : db.prepare<[], { rowid: number; id: string }>(`SELECT rowid, id FROM chunks`).all();

  const tx = db.transaction(() => {
    for (const row of toDelete) {
      db.prepare(`DELETE FROM chunk_vectors WHERE chunk_rowid = ?`).run(BigInt(row.rowid));
      db.prepare(`DELETE FROM chunks WHERE id = ?`).run(row.id);
    }
  });
  tx();
  return toDelete.length;
}

export function searchSimilar(
  db: Database.Database,
  queryEmbedding: Float32Array,
  topK: number
): SearchResult[] {
  const rows = db
    .prepare<[Buffer, number], {
      chunk_rowid: number;
      distance: number;
      id: string;
      section: SourceSection;
      source_id: string;
      text: string;
      citation: string;
      metadata: string;
    }>(
      `
      SELECT
        cv.chunk_rowid,
        cv.distance,
        c.id, c.section, c.source_id, c.text, c.citation, c.metadata
      FROM chunk_vectors cv
      JOIN chunks c ON c.rowid = cv.chunk_rowid
      WHERE cv.embedding MATCH ? AND k = ?
      ORDER BY cv.distance
      `
    )
    .all(float32ToBuffer(queryEmbedding), topK);

  return rows.map((r) => ({
    id: r.id,
    section: r.section,
    sourceId: r.source_id,
    text: r.text,
    citation: r.citation,
    metadata: JSON.parse(r.metadata),
    distance: r.distance,
  }));
}

export function countChunks(db: Database.Database): number {
  const row = db.prepare<[], { c: number }>(`SELECT COUNT(*) as c FROM chunks`).get();
  return row?.c ?? 0;
}
