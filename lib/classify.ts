import type {
  AsistenciaSesion,
  Legislador,
  Ley,
  Mensaje,
  ProyectoSesion,
  ScrapedData,
} from "./types";

/**
 * Los 5 datasets embebidos en el bundle no vienen etiquetados: los
 * distinguimos por la forma de sus objetos (presencia de campos unicos
 * de cada seccion del sitio).
 */

function isArrayOf(value: unknown, requiredKeys: string[]): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const sample = value[0];
  if (typeof sample !== "object" || sample === null) return false;
  const keys = new Set(Object.keys(sample));
  return requiredKeys.every((k) => keys.has(k));
}

function isLeyesArray(value: unknown): value is Ley[] {
  return isArrayOf(value, ["numero", "fechaPromulgacion", "decreto", "linkNorma"]);
}

function isMensajesArray(value: unknown): value is Mensaje[] {
  return isArrayOf(value, ["numero", "fechaIngreso", "mensajeAdjunto", "tema"]);
}

function isProyectosSesionArray(value: unknown): value is ProyectoSesion[] {
  return isArrayOf(value, ["camara", "sesion", "reunion", "tipoProyecto"]);
}

function isLegisladoresGroups(
  value: unknown
): value is Record<string, Record<string, Legislador[]>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const cameras = Object.values(obj);
  if (cameras.length < 2) return false;
  return cameras.every((camaraGroup) => {
    if (typeof camaraGroup !== "object" || camaraGroup === null) return false;
    const blocs = Object.values(camaraGroup as Record<string, unknown>);
    return blocs.some(
      (bloc) =>
        Array.isArray(bloc) &&
        bloc.length > 0 &&
        typeof bloc[0] === "object" &&
        bloc[0] !== null &&
        "presentismo" in (bloc[0] as object) &&
        "bloque" in (bloc[0] as object)
    );
  });
}

function isAsistenciaGroups(
  value: unknown
): value is Record<string, AsistenciaSesion[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const groups = Object.values(obj);
  if (groups.length < 2) return false;
  return groups.every(
    (g) =>
      Array.isArray(g) &&
      g.length > 0 &&
      typeof g[0] === "object" &&
      g[0] !== null &&
      "asistencia" in (g[0] as object) &&
      "tipoSesion" in (g[0] as object)
  );
}

export interface ClassificationResult {
  leyes: Ley[];
  mensajes: Mensaje[];
  proyectosSesion: ProyectoSesion[];
  legisladores: ScrapedData["legisladores"] | null;
  asistencia: ScrapedData["asistencia"] | null;
  unmatched: number;
}

export function classifyDatasets(datasets: unknown[]): ClassificationResult {
  const result: ClassificationResult = {
    leyes: [],
    mensajes: [],
    proyectosSesion: [],
    legisladores: null,
    asistencia: null,
    unmatched: 0,
  };

  for (const ds of datasets) {
    if (isLeyesArray(ds)) {
      result.leyes = ds;
    } else if (isMensajesArray(ds)) {
      result.mensajes = ds;
    } else if (isProyectosSesionArray(ds)) {
      result.proyectosSesion = ds;
    } else if (isLegisladoresGroups(ds)) {
      const keys = Object.keys(ds);
      const diputadosKey = keys.find((k) => /diputad/i.test(k)) ?? keys[0];
      const senadoKey = keys.find((k) => k !== diputadosKey) ?? keys[1];
      result.legisladores = {
        diputados: ds[diputadosKey] as Record<string, Legislador[]>,
        senado: ds[senadoKey] as Record<string, Legislador[]>,
      };
    } else if (isAsistenciaGroups(ds)) {
      const keys = Object.keys(ds);
      const diputadosKey = keys.find((k) => /diputad/i.test(k)) ?? keys[0];
      const senadoresKey = keys.find((k) => k !== diputadosKey) ?? keys[1];
      result.asistencia = {
        diputados: ds[diputadosKey] as AsistenciaSesion[],
        senadores: ds[senadoresKey] as AsistenciaSesion[],
      };
    } else {
      result.unmatched++;
    }
  }

  return result;
}
