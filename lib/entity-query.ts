/**
 * Extrae números de ley/mensaje/expediente mencionados literalmente en la
 * pregunta. Los embeddings de oraciones no distinguen bien "Ley 14477" de
 * "Ley 14469" (son casi idénticos salvo el número), así que cuando la
 * pregunta pide un dato sobre un número puntual conviene complementar la
 * búsqueda semántica con un match exacto por ese número.
 */
export function extractReferencedNumbers(question: string): string[] {
  const numbers = new Set<string>();

  // "Ley 14477", "ley N° 14477", "ley nro 14477"
  for (const m of question.matchAll(/\bley\s+(?:n[°ºo]?\.?\s*)?(\d{3,6})\b/gi)) {
    numbers.add(m[1]);
  }
  // "expediente 53384", "expte 59696"
  for (const m of question.matchAll(/\bexp(?:ediente|te)?\.?\s+(?:n[°ºo]?\.?\s*)?(\d{3,6})\b/gi)) {
    numbers.add(m[1]);
  }
  // "mensaje 020-2026", "mensaje N° 5065"
  for (const m of question.matchAll(/\bmensaje\s+(?:n[°ºo]?\.?\s*)?(\d{1,4}-?\d{0,4})\b/gi)) {
    numbers.add(m[1]);
  }

  return [...numbers];
}
