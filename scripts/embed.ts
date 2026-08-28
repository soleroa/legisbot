import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildChunks } from "../lib/chunking";
import { embedBatch } from "../lib/embeddings";
import { contentHash } from "../lib/hash";
import {
  countChunks,
  deleteChunksNotIn,
  getContentHash,
  openVectorStore,
  upsertChunk,
} from "../lib/vector-store";
import type { ScrapedData } from "../lib/types";

const DATA_DIR = join(__dirname, "..", "data");
const SCRAPED_FILE = join(DATA_DIR, "scraped.json");
const DB_FILE = join(DATA_DIR, "vectors.sqlite");

const BATCH_SIZE = 32;

async function main() {
  console.log("Cargando datos scrapeados...");
  const raw = readFileSync(SCRAPED_FILE, "utf-8");
  const data: ScrapedData = JSON.parse(raw);

  console.log("Generando chunks...");
  const chunks = buildChunks(data);
  console.log(`  ${chunks.length} chunks totales.`);

  const db = openVectorStore(DB_FILE);

  const toEmbed: { chunk: (typeof chunks)[number]; hash: string }[] = [];
  let unchanged = 0;

  for (const chunk of chunks) {
    const hash = contentHash(chunk.text);
    const existingHash = getContentHash(db, chunk.id);
    if (existingHash === hash) {
      unchanged++;
      continue;
    }
    toEmbed.push({ chunk, hash });
  }

  console.log(
    `  ${unchanged} sin cambios (se saltean), ${toEmbed.length} nuevos o modificados a embeddear.`
  );

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch.map((b) => b.chunk.text));
    for (let j = 0; j < batch.length; j++) {
      const { chunk, hash } = batch[j];
      upsertChunk(
        db,
        {
          id: chunk.id,
          section: chunk.section,
          sourceId: chunk.sourceId,
          text: chunk.text,
          citation: chunk.citation,
          metadata: JSON.stringify(chunk.metadata),
        },
        hash,
        embeddings[j]
      );
    }
    console.log(
      `  embeddeados ${Math.min(i + BATCH_SIZE, toEmbed.length)}/${toEmbed.length}`
    );
  }

  const currentIds = chunks.map((c) => c.id);
  const removed = deleteChunksNotIn(db, currentIds);
  if (removed > 0) {
    console.log(`  ${removed} chunks obsoletos eliminados (ya no existen en la fuente).`);
  }

  console.log(`\nOK. Vector store en ${DB_FILE} con ${countChunks(db)} chunks.`);
  db.close();
}

main().catch((err) => {
  console.error("\nERROR en embed:", err);
  process.exit(1);
});
