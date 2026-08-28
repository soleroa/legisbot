const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface DateRange {
  from: string; // ISO YYYY-MM-DD
  to: string; // ISO YYYY-MM-DD
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDays(y: number, m: number, d: number, delta: number): [number, number, number] {
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

/**
 * Detecta una fecha o rango de fechas mencionado en una pregunta en
 * español y lo resuelve a un rango ISO. No intenta ser un parser de
 * lenguaje natural completo: cubre los patrones más comunes para preguntas
 * legislativas ("la semana del 14 de agosto", "el 27/08/2026", "en agosto
 * de 2026"). Si no encuentra nada reconocible, devuelve null y el caller
 * debe seguir solo con búsqueda semántica.
 *
 * `referenceYear` se usa cuando la pregunta da día+mes sin año (asume el
 * año más reciente presente en los datos, no el año calendario actual,
 * porque el dataset puede no llegar hasta la fecha de hoy).
 */
export function extractDateRange(question: string, referenceYear: number): DateRange | null {
  const q = question.toLowerCase();

  // 1) Fecha explícita DD/MM/YYYY o DD-MM-YYYY
  const explicitFull = q.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (explicitFull) {
    const day = Number(explicitFull[1]);
    const month = Number(explicitFull[2]);
    const year = Number(explicitFull[3]);
    const date = iso(year, month, day);
    return { from: date, to: date };
  }

  // 2) "semana del 14 de agosto [de 2026]" -> rango de 7 días desde esa fecha
  const weekOf = q.match(
    /semana del\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?/
  );
  if (weekOf) {
    const day = Number(weekOf[1]);
    const monthName = weekOf[2];
    const month = MESES[monthName];
    if (month) {
      const year = weekOf[3] ? Number(weekOf[3]) : referenceYear;
      const [ey, em, ed] = addDays(year, month, day, 6);
      return { from: iso(year, month, day), to: iso(ey, em, ed) };
    }
  }

  // 3) "en agosto [de 2026]" / "durante agosto" -> todo el mes
  const wholeMonth = q.match(/\b(?:en|durante)\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?\b/);
  if (wholeMonth && MESES[wholeMonth[1]]) {
    const month = MESES[wholeMonth[1]];
    const year = wholeMonth[2] ? Number(wholeMonth[2]) : referenceYear;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: iso(year, month, 1), to: iso(year, month, lastDay) };
  }

  // 4) "el 14 de agosto [de 2026]" -> ese día puntual
  const singleDay = q.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?\b/);
  if (singleDay && MESES[singleDay[2]]) {
    const day = Number(singleDay[1]);
    const month = MESES[singleDay[2]];
    const year = singleDay[3] ? Number(singleDay[3]) : referenceYear;
    const date = iso(year, month, day);
    return { from: date, to: date };
  }

  return null;
}
