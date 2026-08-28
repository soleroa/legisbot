import { politeFetch } from "./fetcher";

const SITE_ORIGIN = "https://monitorlegislativosf.vercel.app";

/**
 * El sitio es una SPA (Next.js/Turbopack) sin API pública: los datasets
 * completos de cada seccion vienen embebidos como JSON.parse('[...]')
 * dentro de los chunks JS estaticos referenciados por el HTML de la
 * pagina. El nombre de esos chunks cambia en cada build de Vercel, asi
 * que los descubrimos dinamicamente en vez de hardcodearlos.
 */

export interface JsonLiteral {
  /** Texto ya des-escapado, listo para JSON.parse */
  json: string;
  /** Contexto de ~80 chars antes del literal, util para debug */
  context: string;
}

export function extractChunkUrls(html: string): string[] {
  const matches = html.matchAll(/"(\/_next\/static\/chunks\/[^"]+\.js)"/g);
  const urls = new Set<string>();
  for (const m of matches) {
    urls.add(SITE_ORIGIN + m[1]);
  }
  return [...urls];
}

export function extractBuildId(html: string): string | null {
  const m = html.match(/"buildId":"([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Busca todas las llamadas JSON.parse('...') en el codigo fuente de un
 * chunk y devuelve el contenido ya des-escapado (listo para JSON.parse).
 * Se parsea manualmente (no con regex greedy) porque el string puede
 * contener comillas escapadas.
 */
export function extractJsonParseLiterals(src: string): JsonLiteral[] {
  const results: JsonLiteral[] = [];
  const marker = "JSON.parse('";
  let searchFrom = 0;

  while (true) {
    const start = src.indexOf(marker, searchFrom);
    if (start === -1) break;

    let i = start + marker.length;
    const out: string[] = [];
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") {
        out.push(ch, src[i + 1]);
        i += 2;
        continue;
      }
      if (ch === "'") break;
      out.push(ch);
      i++;
    }

    const jsStringLiteral = "'" + out.join("") + "'";
    let unescaped: string;
    try {
      // eslint-disable-next-line no-eval -- unescaping our own downloaded JS string literal, not user input
      unescaped = eval(jsStringLiteral);
    } catch {
      searchFrom = i + 1;
      continue;
    }

    results.push({
      json: unescaped,
      context: src.slice(Math.max(0, start - 80), start),
    });
    searchFrom = i + 1;
  }

  return results;
}

export interface DiscoveredDatasets {
  buildId: string | null;
  /** Cada literal JSON parseado exitosamente, en orden de aparicion */
  datasets: unknown[];
}

/**
 * Descarga el HTML de una pagina del sitio, descubre los chunks JS
 * referenciados, los baja, y extrae todos los datasets JSON embebidos.
 */
export async function discoverDatasetsFromPage(
  path: string,
  fetchOpts?: { delayMs?: number }
): Promise<DiscoveredDatasets> {
  const html = await politeFetch(SITE_ORIGIN + path, fetchOpts);
  const buildId = extractBuildId(html);
  const chunkUrls = extractChunkUrls(html);

  const datasets: unknown[] = [];
  for (const url of chunkUrls) {
    const src = await politeFetch(url, fetchOpts);
    const literals = extractJsonParseLiterals(src);
    for (const lit of literals) {
      try {
        const parsed = JSON.parse(lit.json);
        // Solo nos interesan arrays de objetos u objetos con arrays anidados
        // de tamano no trivial (descarta configs, traducciones cortas, etc.)
        if (Array.isArray(parsed) && parsed.length > 5) {
          datasets.push(parsed);
        } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          // Acepta objetos cuyos valores son arrays no vacios (p.ej. {diputados:[...], senadores:[...]})
          // o cuyos valores son a su vez objetos agrupadores con arrays no vacios adentro
          // (p.ej. {diputados:{bloque1:[...], bloque2:[...]}, Senado:{...}}).
          const values = Object.values(parsed as Record<string, unknown>);
          const hasDirectArrays = values.some((v) => Array.isArray(v) && v.length > 0);
          const hasNestedArrays = values.some(
            (v) =>
              v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              Object.values(v as Record<string, unknown>).some(
                (nested) => Array.isArray(nested) && nested.length > 0
              )
          );
          if (hasDirectArrays || hasNestedArrays) {
            datasets.push(parsed);
          }
        }
      } catch {
        // no era JSON valido (probablemente un modulo no relacionado con datos)
      }
    }
  }

  return { buildId, datasets };
}
