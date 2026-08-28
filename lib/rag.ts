import { join } from "node:path";
import Database from "better-sqlite3";
import { embedText } from "./embeddings";
import { openVectorStore, searchSimilar, type SearchResult } from "./vector-store";

const DB_FILE = join(process.cwd(), "data", "vectors.sqlite");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = openVectorStore(DB_FILE);
  }
  return db;
}

export interface RetrievedChunk extends SearchResult {}

export async function retrieveContext(
  query: string,
  topK = 6
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  return searchSimilar(getDb(), queryEmbedding, topK);
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
