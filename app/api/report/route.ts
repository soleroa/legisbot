import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import { formatContextForPrompt, retrieveContext } from "@/lib/rag";

export const maxDuration = 60;

const MODEL_ID = "openai/gpt-oss-120b";

// Un informe temático cubre un tema entero, no una sola pregunta puntual,
// así que en principio conviene bastante más contexto que el chat
// (TOP_K=15). Pero el proyecto corre en el tier gratuito de Groq, con un
// límite duro de 8000 tokens/minuto: un TOP_K más alto (se probó con 40,
// ~9900 tokens) devuelve 413 "Request too large" de la API. 20 deja margen
// para el system prompt + la salida generada sin pasarse del límite.
const TOP_K = 20;

const reportSchema = z.object({
  title: z.string().describe("Título breve y descriptivo del informe, en español"),
  summary: z
    .string()
    .describe("Resumen ejecutivo de 2-4 oraciones sobre lo que cubre el informe"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("Título de la sección"),
        content: z
          .string()
          .describe(
            "Contenido de la sección en párrafos de texto plano (sin markdown). Citá las fuentes usando [n] igual que en el contexto."
          ),
      })
    )
    .describe("Secciones del informe, organizadas temática o cronológicamente"),
});

export type ReportData = z.infer<typeof reportSchema> & {
  sources: { index: number; citation: string; url: string }[];
};

const SYSTEM_PROMPT = `Sos LegisBot, un asistente que redacta informes sobre la actividad legislativa de la Provincia de Santa Fe (Argentina), basándote exclusivamente en el CONTEXTO recuperado de la base de datos del Monitor Legislativo de la Secretaría de Asuntos Legislativos.

REGLAS ESTRICTAS:
1. Usá únicamente información presente en el CONTEXTO provisto. No inventes ni completes con conocimiento general.
2. Organizá el informe en secciones claras (por tema, cámara, o cronología, según lo que mejor ordene el material disponible).
3. SIEMPRE citá la fuente de cada afirmación con el formato ASCII [n] (donde n es el número de fuente del contexto) inmediatamente después de la afirmación.
4. Sé preciso con números de ley, fechas, expedientes y nombres. Si un dato no está explícito en el contexto, no lo deduzcas: omitilo.
5. El CONTEXTO es una muestra parcial, nunca la base de datos completa. Si no hay suficiente información sobre el tema pedido, decilo en el resumen en vez de rellenar con generalidades.
6. Redactá en español rioplatense, en tono de informe formal (no conversacional).`;

export async function POST(req: Request) {
  const { topic }: { topic?: string } = await req.json();

  if (!topic || !topic.trim()) {
    return Response.json({ error: "Falta el tema del informe." }, { status: 400 });
  }

  const retrieved = await retrieveContext(topic, TOP_K);

  if (retrieved.length === 0) {
    return Response.json(
      { error: "No se encontró información relevante en la base de datos para ese tema." },
      { status: 404 }
    );
  }

  const contextBlock = formatContextForPrompt(retrieved);

  // gpt-oss-120b vía Groq ocasionalmente no cumple el json_schema pedido en
  // un intento (falla con AI_APICallError "Failed to generate JSON") aunque
  // el mismo prompt funcione al reintentar; un reintento cubre ese caso
  // transitorio sin tener que degradar el schema.
  let object: z.infer<typeof reportSchema> | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2 && !object; attempt++) {
    try {
      const result = await generateObject({
        model: groq(MODEL_ID),
        schema: reportSchema,
        system: SYSTEM_PROMPT,
        prompt: `TEMA DEL INFORME: ${topic}\n\nCONTEXTO:\n${contextBlock}`,
      });
      object = result.object;
    } catch (err) {
      lastError = err;
    }
  }

  if (!object) {
    console.error("Error generando informe:", lastError);
    return Response.json(
      { error: "No se pudo generar el informe. Probá de nuevo en unos segundos." },
      { status: 502 }
    );
  }

  // Igual que en el chat: varios chunks del top-K suelen pertenecer a la
  // misma fuente citable, así que se deduplica antes de armar la lista de
  // fuentes que acompaña al informe.
  const seenCitations = new Map<string, number>();
  const sources: ReportData["sources"] = [];
  retrieved.forEach((chunk, i) => {
    if (seenCitations.has(chunk.citation)) return;
    seenCitations.set(chunk.citation, i + 1);
    sources.push({
      index: i + 1,
      citation: chunk.citation,
      url:
        chunk.metadata.linkNorma ||
        chunk.metadata.linkVideo ||
        `legisbot://${chunk.section}/${chunk.sourceId}`,
    });
  });

  const report: ReportData = { ...object, sources };
  return Response.json(report);
}
