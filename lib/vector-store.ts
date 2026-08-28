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
  /** Fecha primaria del registro en formato ISO YYYY-MM-DD, o null si no aplica. */
  date: string | null;
}

export interface SearchResult {
  id: string;
  section: SourceSection;
  sourceId: string;
  text: string;
  citation: string;
  metadata: Record<string, string>;
  date: string | null;
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
      content_hash TEXT NOT NULL,
      date TEXT
    );
  `);
  // Migración liviana para bases creadas antes de agregar la columna `date`.
  const existingColumns = db
    .prepare<[], { name: string }>(`PRAGMA table_info(chunks)`)
    .all()
    .map((c) => c.name);
  if (!existingColumns.includes("date")) {
    db.exec(`ALTER TABLE chunks ADD COLUMN date TEXT;`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_date ON chunks(date);`);

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
        `UPDATE chunks SET section=?, source_id=?, text=?, citation=?, metadata=?, content_hash=?, date=? WHERE id=?`
      ).run(
        chunk.section,
        chunk.sourceId,
        chunk.text,
        chunk.citation,
        chunk.metadata,
        contentHash,
        chunk.date,
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
          `INSERT INTO chunks (id, section, source_id, text, citation, metadata, content_hash, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          chunk.id,
          chunk.section,
          chunk.sourceId,
          chunk.text,
          chunk.citation,
          chunk.metadata,
          contentHash,
          chunk.date
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

type ChunkRow = {
  chunk_rowid: number;
  distance: number;
  id: string;
  section: SourceSection;
  source_id: string;
  text: string;
  citation: string;
  metadata: string;
  date: string | null;
};

function rowToResult(r: ChunkRow): SearchResult {
  return {
    id: r.id,
    section: r.section,
    sourceId: r.source_id,
    text: r.text,
    citation: r.citation,
    metadata: JSON.parse(r.metadata),
    date: r.date,
    distance: r.distance,
  };
}

/**
 * Búsqueda por similitud coseno. `maxDistance`, si se pasa, descarta los
 * resultados por debajo del umbral de relevancia: sqlite-vec siempre
 * devuelve los `topK` vecinos más cercanos aunque ninguno sea realmente
 * relevante para la pregunta, y pasarle ese "ruido" al LLM como si fuera
 * contexto válido es lo que lo lleva a inventar respuestas combinando
 * fragmentos sueltos. Con la distancia coseno de sqlite-vec (rango 0-2,
 * 0 = idéntico), un umbral ~0.9 corta los vecinos que ya no comparten tema.
 */
export function searchSimilar(
  db: Database.Database,
  queryEmbedding: Float32Array,
  topK: number,
  maxDistance?: number
): SearchResult[] {
  const rows = db
    .prepare<[Buffer, number], ChunkRow>(
      `
      SELECT
        cv.chunk_rowid,
        cv.distance,
        c.id, c.section, c.source_id, c.text, c.citation, c.metadata, c.date
      FROM chunk_vectors cv
      JOIN chunks c ON c.rowid = cv.chunk_rowid
      WHERE cv.embedding MATCH ? AND k = ?
      ORDER BY cv.distance
      `
    )
    .all(float32ToBuffer(queryEmbedding), topK);

  const filtered =
    maxDistance === undefined ? rows : rows.filter((r) => r.distance <= maxDistance);

  return filtered.map(rowToResult);
}

/**
 * Busca chunks cuya fecha primaria cae dentro de [fromDate, toDate]
 * (ambos inclusive, formato ISO YYYY-MM-DD). Complementa la búsqueda
 * semántica para preguntas tipo "qué pasó la semana del 14 de agosto":
 * los embeddings no le dan peso especial a una fecha dentro del texto del
 * chunk, así que sin este filtro directo esas preguntas traen ruido.
 */
export function searchByDateRange(
  db: Database.Database,
  fromDate: string,
  toDate: string,
  limit = 20
): SearchResult[] {
  const rows = db
    .prepare<[string, string, number], ChunkRow>(
      `
      SELECT
        c.rowid as chunk_rowid,
        0 as distance,
        c.id, c.section, c.source_id, c.text, c.citation, c.metadata, c.date
      FROM chunks c
      WHERE c.date IS NOT NULL AND c.date BETWEEN ? AND ?
      ORDER BY c.date
      LIMIT ?
      `
    )
    .all(fromDate, toDate, limit);

  return rows.map(rowToResult);
}

/**
 * Busca chunks cuyo source_id (número de ley/mensaje) o texto contiene un
 * número exacto. Los embeddings de oraciones no distinguen bien "Ley 14477"
 * de "Ley 14469" — son casi idénticos semánticamente salvo por el número —
 * así que una pregunta por un número de ley/expediente/mensaje puntual
 * necesita este match exacto además de (o en vez de) la búsqueda semántica.
 */
export function searchByExactNumber(
  db: Database.Database,
  number: string,
  limit = 10
): SearchResult[] {
  const rows = db
    .prepare<[string, string, number], ChunkRow>(
      `
      SELECT
        c.rowid as chunk_rowid,
        0 as distance,
        c.id, c.section, c.source_id, c.text, c.citation, c.metadata, c.date
      FROM chunks c
      WHERE c.source_id = ? OR c.text LIKE '%' || ? || '%'
      LIMIT ?
      `
    )
    .all(number, number, limit);

  return rows.map(rowToResult);
}

export function countChunks(db: Database.Database): number {
  const row = db.prepare<[], { c: number }>(`SELECT COUNT(*) as c FROM chunks`).get();
  return row?.c ?? 0;
}

/**
 * Año más reciente presente entre las fechas guardadas. Se usa como año
 * implícito cuando la pregunta menciona una fecha sin año ("el 14 de
 * agosto"): el dataset puede no llegar hasta el año calendario actual, así
 * que asumir el año real de hoy rompería la búsqueda por fecha.
 */
export function getMostRecentYear(db: Database.Database): number | null {
  const row = db
    .prepare<[], { maxDate: string | null }>(`SELECT MAX(date) as maxDate FROM chunks WHERE date IS NOT NULL`)
    .get();
  if (!row?.maxDate) return null;
  return Number(row.maxDate.slice(0, 4));
}
