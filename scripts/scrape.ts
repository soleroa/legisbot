import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { discoverDatasetsFromPage } from "../lib/bundle-extractor";
import { classifyDatasets } from "../lib/classify";
import type { ScrapedData } from "../lib/types";

const PAGES = ["/leyes", "/sesiones", "/mensajes-pe", "/legisladores"];
const DATA_DIR = join(__dirname, "..", "data");
const OUTPUT_FILE = join(DATA_DIR, "scraped.json");

const DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 800);

async function main() {
  console.log(`Monitor Legislativo SF — scraper (delay=${DELAY_MS}ms entre requests)\n`);

  const allDatasets: unknown[] = [];
  let buildId: string | null = null;

  for (const path of PAGES) {
    console.log(`> Descubriendo datasets en ${path} ...`);
    const { buildId: pageBuildId, datasets } = await discoverDatasetsFromPage(path, {
      delayMs: DELAY_MS,
    });
    buildId = buildId ?? pageBuildId;
    console.log(`  ${datasets.length} dataset(s) candidato(s) encontrados.`);
    allDatasets.push(...datasets);
  }

  console.log(`\n> Clasificando ${allDatasets.length} datasets recolectados...`);
  const classified = classifyDatasets(allDatasets);

  if (classified.leyes.length === 0) {
    throw new Error(
      "No se encontro el dataset de leyes. El sitio pudo haber cambiado de estructura " +
        "(nombres de campos distintos) — revisar lib/classify.ts."
    );
  }
  if (!classified.legisladores || !classified.asistencia) {
    console.warn(
      "  ADVERTENCIA: no se pudieron clasificar legisladores y/o asistencia. " +
        "Puede que el sitio haya cambiado su esquema."
    );
  }

  const result: ScrapedData = {
    scrapedAt: new Date().toISOString(),
    buildId,
    leyes: classified.leyes,
    mensajes: classified.mensajes,
    proyectosSesion: classified.proyectosSesion,
    legisladores: classified.legisladores ?? { diputados: {}, senado: {} },
    asistencia: classified.asistencia ?? { diputados: [], senadores: [] },
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");

  const totalLegisladores =
    Object.values(result.legisladores.diputados).flat().length +
    Object.values(result.legisladores.senado).flat().length;

  console.log(`\nOK. Guardado en ${OUTPUT_FILE}`);
  console.log(`  leyes:            ${result.leyes.length}`);
  console.log(`  mensajes PE:      ${result.mensajes.length}`);
  console.log(`  proyectos sesion: ${result.proyectosSesion.length}`);
  console.log(`  legisladores:     ${totalLegisladores}`);
  console.log(`  asistencia:       ${result.asistencia.diputados.length + result.asistencia.senadores.length} sesiones`);
  console.log(`  buildId:          ${result.buildId ?? "(no encontrado)"}`);
  if (classified.unmatched > 0) {
    console.log(`  datasets sin clasificar: ${classified.unmatched}`);
  }
}

main().catch((err) => {
  console.error("\nERROR en el scraper:", err);
  process.exit(1);
});
