import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScrapedData } from "../lib/types";

/**
 * Re-scrapea el sitio completo y re-embeddea solo lo nuevo/modificado.
 *
 * El sitio no expone un timestamp de "última modificación" por registro, así
 * que no podemos pedir solo los cambios: siempre traemos el dataset completo
 * (es liviano, ~2 minutos con el delay respetuoso). El ahorro de costo real
 * pasa en embed.ts, que compara el hash de contenido de cada chunk contra lo
 * que ya está en SQLite y solo re-embeddea (llama al modelo local) los que
 * cambiaron — grafica ese diff acá antes de correrlo.
 */

const DATA_DIR = join(__dirname, "..", "data");
const SCRAPED_FILE = join(DATA_DIR, "scraped.json");

function countBySection(data: ScrapedData) {
  const totalLegisladores =
    Object.values(data.legisladores.diputados).flat().length +
    Object.values(data.legisladores.senado).flat().length;
  return {
    leyes: data.leyes.length,
    mensajes: data.mensajes.length,
    proyectosSesion: data.proyectosSesion.length,
    legisladores: totalLegisladores,
  };
}

async function run(cmd: string, args: string[]) {
  const { spawn } = await import("node:child_process");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} salió con código ${code}`));
    });
  });
}

async function main() {
  const previousCounts = existsSync(SCRAPED_FILE)
    ? countBySection(JSON.parse(readFileSync(SCRAPED_FILE, "utf-8")))
    : null;

  console.log("=== 1/2: re-scrapeando el sitio ===\n");
  await run("npx", ["tsx", "scripts/scrape.ts"]);

  const newCounts = countBySection(JSON.parse(readFileSync(SCRAPED_FILE, "utf-8")));

  if (previousCounts) {
    console.log("\n=== Diferencia de cantidades por sección ===");
    for (const key of Object.keys(newCounts) as (keyof typeof newCounts)[]) {
      const delta = newCounts[key] - previousCounts[key];
      const sign = delta > 0 ? "+" : "";
      console.log(`  ${key}: ${previousCounts[key]} -> ${newCounts[key]} (${sign}${delta})`);
    }
  }

  console.log("\n=== 2/2: re-embeddeando solo lo nuevo o modificado ===\n");
  await run("npx", ["tsx", "scripts/embed.ts"]);

  console.log("\nOK. Refresh completo.");
}

main().catch((err) => {
  console.error("\nERROR en refresh:", err);
  process.exit(1);
});
