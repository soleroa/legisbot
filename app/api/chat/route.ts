import { groq } from "@ai-sdk/groq";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import { formatContextForPrompt, retrieveContext } from "@/lib/rag";

/**
 * gpt-oss-120b a veces ignora la instrucción del prompt y usa corchetes
 * unicode "fullwidth" (【1】) en vez de ASCII ([1]) para las citas — es
 * inconsistente entre corridas, así que lo normalizamos acá en vez de
 * depender solo del prompt. Seguro de aplicar delta a delta porque 【 y 】
 * son cada uno un único code point: nunca quedan cortados a la mitad entre
 * dos chunks del stream.
 */
function normalizeCitationBrackets<TOOLS extends ToolSet>() {
  return () =>
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "text-delta") {
          controller.enqueue({
            ...part,
            text: part.text.replace(/【/g, "[").replace(/】/g, "]"),
          });
        } else {
          controller.enqueue(part);
        }
      },
    });
}

export const maxDuration = 30;

const MODEL_ID = "openai/gpt-oss-120b";
// Un mismo hecho legislativo suele mencionarse en varias secciones (la ley,
// el mensaje del PE que la originó, la sesión donde se aprobó), y a veces
// esos chunks "vecinos" son semánticamente más parecidos a la pregunta que
// el propio chunk de la entidad preguntada (por ejemplo, el chunk de una
// ley es largo y heterogéneo — decreto, expedientes, links — lo que diluye
// su similitud, mientras que el chunk de sesión que la menciona puede tener
// texto casi idéntico a la pregunta). Un top-k chico deja afuera esos casos;
// 15 da margen para que el LLM elija bien sin inflar demasiado el prompt.
const TOP_K = 15;

const SYSTEM_PROMPT = `Sos LegisBot, un asistente que responde preguntas sobre la actividad legislativa de la Provincia de Santa Fe (Argentina), basándote exclusivamente en el CONTEXTO recuperado de la base de datos del Monitor Legislativo de la Secretaría de Asuntos Legislativos.

REGLAS ESTRICTAS:
1. Respondé únicamente con información presente en el CONTEXTO provisto. No inventes ni completes con conocimiento general sobre leyes o política argentina.
2. SIEMPRE citá la fuente de cada afirmación usando exactamente el formato ASCII entre corchetes que aparece en el contexto (por ejemplo [1], con corchetes rectos normales "[" y "]", nunca corchetes angulares ni caracteres unicode decorativos) inmediatamente después de la afirmación correspondiente. Al final de la respuesta no hace falta repetir la lista de fuentes: ya se muestran aparte.
3. Si el contexto no tiene información suficiente para responder la pregunta (o no es relevante), decilo explícitamente ("No encontré información suficiente en la base de datos del Monitor Legislativo para responder esto con precisión") en vez de adivinar o usar conocimiento externo.
4. Sé preciso con números de ley, fechas, expedientes y nombres — son datos legales, no los aproximes. Si el contexto no trae explícitamente un dato (por ejemplo un número de expediente o una fecha de sesión), no lo deduzcas combinando otros fragmentos: decí que no está disponible.
5. Cuando la pregunta es sobre una entidad puntual (una ley, un mensaje, un expediente con número específico), priorizá SIEMPRE el fragmento del contexto que describe esa entidad exacta (por su número) para sacar sus datos (fecha, expediente, resultado). No tomes un dato de un fragmento distinto solo porque comparte un número con la entidad preguntada (por ejemplo, no confundas "Sesión N° 13" de una fecha con el expediente o la fecha de sanción de una ley, aunque el número "13" coincida por casualidad) — son entidades distintas del sistema legislativo y una coincidencia de número entre ellas no implica relación.
6. El CONTEXTO es siempre una muestra parcial (los fragmentos más relevantes encontrados), nunca la base de datos completa. Si te preguntan un conteo o total sobre TODO el sistema (ej. "cuántas leyes hay en total", "cuántas sesiones tuvo tal cámara"), NO cuentes los fragmentos del contexto como si fueran el total: aclará que solo tenés a la vista una muestra relevante y no podés dar un número exacto de todo el conjunto.
7. Respondé en español rioplatense, de forma clara y completa: no te limites a tirar una tabla o una lista pelada. Antes o después de cualquier tabla, sumá un párrafo breve que explique qué se encontró, cuántos resultados hay, y cualquier patrón o detalle relevante (temas recurrentes, cámara de origen, estado del trámite, etc.) que ayude a entender el panorama sin tener que leer cada fila. Si la pregunta lo amerita, desarrollá con más de una oración por afirmación en vez de responder en telegrama.
8. Cuando uses tablas Markdown: nunca metas más de un dato por celda. Si un bloque tiene varios legisladores o varios ítems, poné cada uno en su propia fila (repitiendo la celda de bloque si hace falta) en vez de juntarlos con "<br>" o saltos de línea dentro de una celda — eso no se renderiza bien. Mantené las tablas simples: pocas columnas, celdas cortas.
9. "Conciso" no significa "escueto": evitá relleno y repetición, pero no sacrifiques contexto útil solo por acortar. Preferí una respuesta completa de varios párrafos/oraciones antes que una tabla sin ningún texto alrededor.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const query = lastUserMessage
    ? lastUserMessage.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
    : "";

  const retrieved = query ? await retrieveContext(query, TOP_K) : [];
  const contextBlock = formatContextForPrompt(retrieved);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Abrimos el mensaje nosotros primero: si las source-url parts se
      // escriben antes de que exista un mensaje "abierto", useChat las
      // interpreta como perteneciendo a un UIMessage separado (duplicando
      // la respuesta en la UI: una entrada solo con fuentes y otra con el
      // texto). Por eso emitimos "start" acá y le decimos a streamText que
      // no mande el suyo (sendStart: false).
      writer.write({ type: "start" });

      // Varios chunks del top-K suelen pertenecer a la misma fuente (la
      // misma ley o sesión partida en varias secciones); sin deduplicar acá
      // se repite un pill por chunk en vez de uno por fuente citable.
      const seenCitations = new Set<string>();
      for (const chunk of retrieved) {
        if (seenCitations.has(chunk.citation)) continue;
        seenCitations.add(chunk.citation);

        writer.write({
          type: "source-url",
          sourceId: chunk.id,
          url: chunk.metadata.linkNorma || chunk.metadata.linkVideo || `legisbot://${chunk.section}/${chunk.sourceId}`,
          title: chunk.citation,
        });
      }

      const priorMessages = await convertToModelMessages(messages.slice(0, -1));

      const result = streamText({
        model: groq(MODEL_ID),
        system: SYSTEM_PROMPT,
        messages: [
          ...priorMessages,
          {
            role: "user",
            content: `CONTEXTO:\n${contextBlock}\n\nPREGUNTA: ${query}`,
          },
        ],
        experimental_transform: normalizeCitationBrackets(),
      });

      writer.merge(result.toUIMessageStream({ sendStart: false }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
