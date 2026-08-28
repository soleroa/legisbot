import { groq } from "@ai-sdk/groq";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { formatContextForPrompt, retrieveContext } from "@/lib/rag";

export const maxDuration = 30;

const MODEL_ID = "openai/gpt-oss-120b";
const TOP_K = 6;

const SYSTEM_PROMPT = `Sos LegisBot, un asistente que responde preguntas sobre la actividad legislativa de la Provincia de Santa Fe (Argentina), basándote exclusivamente en el CONTEXTO recuperado de la base de datos del Monitor Legislativo de la Secretaría de Asuntos Legislativos.

REGLAS ESTRICTAS:
1. Respondé únicamente con información presente en el CONTEXTO provisto. No inventes ni completes con conocimiento general sobre leyes o política argentina.
2. SIEMPRE citá la fuente de cada afirmación usando exactamente el formato ASCII entre corchetes que aparece en el contexto (por ejemplo [1], con corchetes rectos normales "[" y "]", nunca corchetes angulares ni caracteres unicode decorativos) inmediatamente después de la afirmación correspondiente. Al final de la respuesta no hace falta repetir la lista de fuentes: ya se muestran aparte.
3. Si el contexto no tiene información suficiente para responder la pregunta (o no es relevante), decilo explícitamente ("No encontré información suficiente en la base de datos del Monitor Legislativo para responder esto con precisión") en vez de adivinar o usar conocimiento externo.
4. Sé preciso con números de ley, fechas, expedientes y nombres — son datos legales, no los aproximes.
5. Respondé en español rioplatense, de forma clara y concisa.`;

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

      for (const chunk of retrieved) {
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
      });

      writer.merge(result.toUIMessageStream({ sendStart: false }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
