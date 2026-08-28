import { join } from "node:path";
import Database from "better-sqlite3";
import { embedText } from "./embeddings";
import {
  getMostRecentYear,
  openVectorStore,
  searchByDateRange,
  searchByExactNumber,
  searchSimilar,
  type SearchResult,
} from "./vector-store";
import { extractDateRange } from "./date-query";
import { extractReferencedNumbers } from "./entity-query";

const DB_FILE = join(process.cwd(), "data", "vectors.sqlite");

// Distancia coseno máxima (sqlite-vec: 0 = idéntico, 2 = opuesto) para
// considerar un chunk relevante. Sin este corte, la búsqueda siempre
// devuelve los `topK` vecinos más cercanos aunque ninguno tenga que ver
// con la pregunta, y ese "casi-contexto" es lo que empuja al LLM a
// inventar respuestas combinando fragmentos sueltos.
const MAX_RELEVANT_DISTANCE = 0.9;

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = openVectorStore(DB_FILE);
  }
  return db;
}

export type RetrievedChunk = SearchResult;

export async function retrieveContext(
  query: string,
  topK = 6
): Promise<RetrievedChunk[]> {
  const database = getDb();

  const semantic = searchSimilar(
    database,
    await embedText(query),
    topK,
    MAX_RELEVANT_DISTANCE
  );

  // Si la pregunta menciona una fecha/rango ("la semana del 14 de agosto"),
  // los embeddings no le dan peso especial a esa fecha dentro del texto del
  // chunk, así que complementamos con un filtro directo por columna date.
  const referenceYear = getMostRecentYear(database) ?? new Date().getFullYear();
  const dateRange = extractDateRange(query, referenceYear);
  const byDate = dateRange
    ? searchByDateRange(database, dateRange.from, dateRange.to, 15)
    : [];

  // Si la pregunta nombra un número puntual de ley/expediente/mensaje, los
  // embeddings de oraciones casi no distinguen "Ley 14477" de "Ley 14469"
  // (son casi idénticos salvo el número), así que un match exacto por texto
  // es necesario para no traer la ley "vecina" en vez de la pedida.
  const referencedNumbers = extractReferencedNumbers(query);
  const byNumber = referencedNumbers.flatMap((n) => searchByExactNumber(database, n));

  const merged = new Map<string, RetrievedChunk>();
  for (const chunk of byNumber) merged.set(chunk.id, chunk);
  for (const chunk of byDate) if (!merged.has(chunk.id)) merged.set(chunk.id, chunk);
  for (const chunk of semantic) if (!merged.has(chunk.id)) merged.set(chunk.id, chunk);

  return [...merged.values()];
}

/** Arma el bloque de contexto en texto plano para el prompt del LLM, numerado para poder citarlo. */
export function formatContextForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "(No se encontró información relevante en la base de datos legislativa para esta pregunta.)";
  }
  return chunks
    .map((c, i) => `[${i + 1}] Fuente: ${c.citation}\n${c.text}`)
    .join("\n\n");
}
