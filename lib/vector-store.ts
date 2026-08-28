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

  // Búsqueda de texto completo (BM25) como señal complementaria a la
  // semántica: un chunk en lenguaje jurídico formal ("DECLARA... ESTADO DE
  // EMERGENCIA HÍDRICA") a veces rankea peor por similitud de embedding que
  // otro chunk que repite las mismas palabras en un contexto distinto, pero
  // FTS5 encuentra por coincidencia léxica directa independientemente de eso.
  // Tabla independiente (no `content=chunks`) para no depender de que el
  // rowid de `chunks` sea estable entre updates/deletes.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      id UNINDEXED,
      text
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

    db.prepare(`DELETE FROM chunks_fts WHERE id = ?`).run(chunk.id);
    db.prepare(`INSERT INTO chunks_fts (id, text) VALUES (?, ?)`).run(chunk.id, chunk.text);
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
      db.prepare(`DELETE FROM chunks_fts WHERE id = ?`).run(row.id);
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

function rowToResult(r: Omit<ChunkRow, "chunk_rowid">): SearchResult {
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

type LoadedRow = Omit<ChunkRow, "distance" | "chunk_rowid"> & { embedding: Float32Array };

interface EmbeddingCache {
  rowCount: number;
  rows: LoadedRow[];
}

const embeddingCacheByDb = new WeakMap<Database.Database, EmbeddingCache>();

/**
 * sqlite-vec 0.1.9 (todavía pre-1.0) devuelve resultados de similitud
 * incorrectos/inconsistentes en esta instalación: tanto el índice KNN
 * (`MATCH ... AND k = ?`) como el cálculo de distancia en un `ORDER BY`
 * sobre toda la tabla dan números distintos entre sí y distintos al
 * cálculo de una sola fila (que sí coincide con la distancia coseno
 * calculada a mano) — confirmado comparando manualmente. Por eso el
 * ranking real se hace acá en JS puro, no con el índice de la extensión.
 * Es perfectamente viable en este volumen (unos pocos miles de filas,
 * milisegundos) y elimina el bug de raíz en vez de trabajarlo alrededor.
 */
function loadAllEmbeddings(db: Database.Database): LoadedRow[] {
  const rowCount = countChunks(db);
  const cached = embeddingCacheByDb.get(db);
  if (cached && cached.rowCount === rowCount) return cached.rows;

  const rawRows = db
    .prepare<[], Omit<ChunkRow, "distance" | "chunk_rowid"> & { embedding: Buffer }>(
      `
      SELECT c.id, c.section, c.source_id, c.text, c.citation, c.metadata, c.date, cv.embedding
      FROM chunks c JOIN chunk_vectors cv ON cv.chunk_rowid = c.rowid
      `
    )
    .all();

  const rows: LoadedRow[] = rawRows.map((r) => ({
    ...r,
    embedding: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
  }));

  embeddingCacheByDb.set(db, { rowCount, rows });
  return rows;
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  // Los embeddings ya vienen normalizados (norma 1) desde @xenova/transformers
  // con { normalize: true }, así que la distancia coseno es 1 - dot(a, b).
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}

/**
 * Búsqueda por similitud coseno, calculada en JS. `maxDistance`, si se
 * pasa, descarta los resultados por debajo del umbral de relevancia: sin
 * este corte siempre se devuelven los `topK` vecinos más cercanos aunque
 * ninguno sea realmente relevante para la pregunta, y pasarle ese "ruido"
 * al LLM como si fuera contexto válido es lo que lo lleva a inventar
 * respuestas combinando fragmentos sueltos. Rango de distancia: 0
 * (idéntico) a 2 (opuesto); un umbral ~0.9 corta los vecinos que ya no
 * comparten tema.
 */
export function searchSimilar(
  db: Database.Database,
  queryEmbedding: Float32Array,
  topK: number,
  maxDistance?: number
): SearchResult[] {
  const rows = loadAllEmbeddings(db);

  const scored = rows
    .map((r) => ({ ...r, distance: cosineDistance(queryEmbedding, r.embedding) }))
    .sort((a, b) => a.distance - b.distance);

  const filtered =
    maxDistance === undefined ? scored : scored.filter((r) => r.distance <= maxDistance);

  return filtered.slice(0, topK).map(rowToResult);
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

/**
 * Convierte una pregunta en lenguaje natural a una query FTS5 segura:
 * separa en palabras (ignorando signos de puntuación que rompen la sintaxis
 * de FTS5 como ?, ¿, comillas), descarta las muy cortas, y las une con OR
 * entre comillas dobles para que cada palabra se busque literal.
 */
function toFtsQuery(text: string): string | null {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca tildes: FTS5 tokeniza sin acentos por defecto
    .match(/[a-z0-9]+/g);
  if (!words) return null;

  const significant = words.filter((w) => w.length >= 4);
  if (significant.length === 0) return null;

  return significant.map((w) => `"${w}"`).join(" OR ");
}

/**
 * Búsqueda de texto completo (BM25) sobre el contenido de los chunks.
 * Complementa la búsqueda semántica: un chunk en lenguaje jurídico formal
 * puede rankear peor por similitud de embedding que lo esperado, pero si
 * comparte palabras clave literales con la pregunta ("emergencia",
 * "hídrica"), FTS5 lo encuentra por coincidencia léxica directa.
 */
export function searchByFullText(
  db: Database.Database,
  query: string,
  limit = 10
): SearchResult[] {
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return [];

  const rows = db
    .prepare<[string, number], ChunkRow>(
      `
      SELECT
        c.rowid as chunk_rowid,
        0 as distance,
        c.id, c.section, c.source_id, c.text, c.citation, c.metadata, c.date
      FROM chunks_fts f
      JOIN chunks c ON c.id = f.id
      WHERE chunks_fts MATCH ?
      ORDER BY bm25(chunks_fts)
      LIMIT ?
      `
    )
    .all(ftsQuery, limit);

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
