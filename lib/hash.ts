import { createHash } from "node:crypto";

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}
