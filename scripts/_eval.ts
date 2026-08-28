interface EvalQuestion {
  category: string;
  question: string;
}

const QUESTIONS: EvalQuestion[] = [
  { category: "Leyes — dato puntual", question: "¿Qué ley declaró la emergencia hídrica en Santa Fe y cuándo se promulgó?" },
  { category: "Leyes — conteo/agregado", question: "¿Cuántas leyes de origen Poder Ejecutivo hay en la base de datos?" },
  { category: "Sesiones — dato puntual", question: "¿Qué pasó en la sesión de la Cámara de Senadores del 27 de agosto de 2026?" },
  { category: "Sesiones — agregado", question: "¿Cuántas sesiones tuvo la Cámara de Diputados en total?" },
  { category: "Mensajes PE", question: "¿Qué mensajes del Poder Ejecutivo están todavía en trámite (sin sanción definitiva)?" },
  { category: "Legisladores — dato puntual", question: "¿A qué bloque pertenece la diputada Celia Arena?" },
  { category: "Legisladores — ranking (débil para RAG puro)", question: "¿Cuál es el legislador con mayor porcentaje de asistencia?" },
  { category: "Ambigua / requiere desambiguar", question: "Contame sobre la ley de expropiación." },
  { category: "Fuera de dominio", question: "¿Cuál es la capital de Francia?" },
  { category: "Fuera de dominio pero adyacente", question: "¿Qué opinás de la gestión del gobernador Pullaro?" },
  { category: "Pregunta con dato inventado (trampa)", question: "¿Por qué se derogó la Ley 99999?" },
  { category: "Multi-hop (ley <- mensaje <- sesión)", question: "¿Qué expediente dio origen a la Ley 14477 y en qué sesión se aprobó?" },
];

async function askOne(q: EvalQuestion) {
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: q.question }] }],
    }),
  });

  const raw = await res.text();
  const lines = raw.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");

  let text = "";
  const sources: string[] = [];
  for (const line of lines) {
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.type === "text-delta") text += evt.delta;
      if (evt.type === "source-url") sources.push(evt.title);
    } catch {
      // ignore malformed line
    }
  }

  return { text, sources };
}

async function main() {
  console.log(`Evaluando ${QUESTIONS.length} preguntas contra http://localhost:3000/api/chat\n`);
  console.log("=".repeat(100));

  for (const q of QUESTIONS) {
    const start = Date.now();
    const { text, sources } = await askOne(q);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n[${q.category}]`);
    console.log(`P: ${q.question}`);
    console.log(`R (${elapsed}s): ${text}`);
    console.log(`Fuentes citadas (${sources.length}): ${sources.join(" | ") || "(ninguna)"}`);
    console.log("-".repeat(100));
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
