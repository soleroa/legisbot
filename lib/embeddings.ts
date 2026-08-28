import type { FeatureExtractionPipeline } from "@xenova/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    const { pipeline } = await import("@xenova/transformers");
    pipelinePromise = pipeline(
      "feature-extraction",
      EMBEDDING_MODEL
    ) as Promise<FeatureExtractionPipeline>;
  }
  return pipelinePromise;
}

/** Genera el embedding (384 dims, normalizado) de un solo texto. */
export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Float32Array.from(output.data as Float32Array);
}

/** Genera embeddings para un batch de textos, secuencialmente para no saturar memoria. */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Float32Array[]> {
  const extractor = await getPipeline();
  const results: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    const output = await extractor(texts[i], { pooling: "mean", normalize: true });
    results.push(Float32Array.from(output.data as Float32Array));
    onProgress?.(i + 1, texts.length);
  }
  return results;
}
