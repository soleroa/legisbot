import type {
  Legislador,
  Ley,
  Mensaje,
  ProyectoSesion,
  ScrapedData,
  Chunk,
} from "./types";

function fmtFecha(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function joinNonEmpty(parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function leyToChunk(ley: Ley): Chunk {
  const citation = `Ley ${ley.numero}`;
  const origen = ley.origen || "origen no especificado";

  const text = joinNonEmpty([
    `Ley ${ley.numero} (origen: ${origen}).`,
    `Texto/resumen: ${ley.descripcion}`,
    ley.fechaSancion && `Sancionada el ${fmtFecha(ley.fechaSancion)}.`,
    ley.fechaPromulgacion && `Promulgada el ${fmtFecha(ley.fechaPromulgacion)}.`,
    ley.publicacionBO && `Publicada en el Boletín Oficial el ${fmtFecha(ley.publicacionBO)}.`,
    ley.decreto && `Decreto de promulgación: ${ley.decreto}.`,
    ley.expedienteSenado && `Expediente Senado N° ${ley.expedienteSenado}.`,
    ley.expedienteDiputados && `Expediente Diputados N° ${ley.expedienteDiputados}.`,
    ley.linkNorma && `Texto completo de la norma: ${ley.linkNorma}`,
  ]);

  return {
    id: `ley-${ley.id}`,
    section: "leyes",
    sourceId: ley.numero,
    text,
    citation,
    metadata: {
      numero: ley.numero,
      fechaPromulgacion: ley.fechaPromulgacion,
      origen: ley.origen,
      linkNorma: ley.linkNorma,
    },
    date: ley.fechaPromulgacion || ley.fechaSancion || null,
  };
}

function mensajeToChunk(msg: Mensaje): Chunk {
  const citation = `Mensaje del Poder Ejecutivo N° ${msg.numero}`;

  const text = joinNonEmpty([
    `Mensaje del Poder Ejecutivo N° ${msg.numero}, ingresado por ${msg.camaraOrigen || "cámara no especificada"}.`,
    `Contenido: ${msg.descripcion}`,
    msg.tema && `Tema: ${msg.tema}.`,
    msg.fechaIngreso && `Ingresó a la Legislatura el ${fmtFecha(msg.fechaIngreso)}.`,
    `Estado actual del trámite: ${msg.estado || "sin datos"}.`,
    msg.comision && `En comisión: ${msg.comision}.`,
    msg.fechaMediaSancion && `Obtuvo media sanción el ${fmtFecha(msg.fechaMediaSancion)}.`,
    msg.fechaSancionDefinitiva &&
      `Obtuvo sanción definitiva el ${fmtFecha(msg.fechaSancionDefinitiva)}.`,
    msg.leyNumero && `Se convirtió en la Ley ${msg.leyNumero}.`,
    msg.fechaPromulgacion && `Promulgada el ${fmtFecha(msg.fechaPromulgacion)}.`,
    msg.expedienteSenado && `Expediente Senado N° ${msg.expedienteSenado}.`,
    msg.expedienteDiputados && `Expediente Diputados N° ${msg.expedienteDiputados}.`,
  ]);

  return {
    id: `mensaje-${msg.id}`,
    section: "mensajes",
    sourceId: msg.numero,
    text,
    citation,
    metadata: {
      numero: msg.numero,
      fechaIngreso: msg.fechaIngreso,
      estado: msg.estado,
      leyNumero: msg.leyNumero,
    },
    date: msg.fechaIngreso || null,
  };
}

function proyectoSesionToChunk(p: ProyectoSesion): Chunk {
  const citation = `${p.camara} — Sesión N° ${p.sesion}, ${fmtFecha(p.fecha)}`;

  const text = joinNonEmpty([
    `Sesión de ${p.camara}, tipo ${p.tipo || "no especificado"}, N° ${p.sesion}` +
      (p.reunion ? ` (Reunión N° ${p.reunion})` : "") +
      (p.periodoLegislativo ? `, período legislativo ${p.periodoLegislativo}` : "") +
      `, realizada el ${fmtFecha(p.fecha)}.`,
    `Proyecto tratado (${p.tipoProyecto || "sin tipo"}${p.expediente && p.expediente !== "-" ? `, expediente ${p.expediente}` : ""}): ${p.descripcion}`,
    `Resultado: ${p.estado || "sin datos"}.`,
    p.linkVideo && `Video de la sesión: ${p.linkVideo}`,
  ]);

  return {
    id: `sesion-${p.id}`,
    section: "sesiones",
    sourceId: p.id,
    text,
    citation,
    metadata: {
      camara: p.camara,
      fecha: p.fecha,
      sesion: p.sesion,
      estado: p.estado,
      linkVideo: p.linkVideo,
    },
    date: p.fecha || null,
  };
}

function legisladorToChunk(l: Legislador, camaraLabel: string): Chunk {
  const citation = `${l.nombre} (${camaraLabel})`;

  const text = joinNonEmpty([
    `${l.nombre}, ${camaraLabel} por el departamento ${l.departamento || "no especificado"}.`,
    `Bloque: ${l.bloque || "sin bloque"}.`,
    l.partido && `Partido: ${l.partido}.`,
    typeof l.presentismo === "number" &&
      `Asistencia registrada: ${l.presentismo}% (${l.presentes} de ${l.total} sesiones).`,
    l.mail && `Contacto: ${l.mail}.`,
  ]);

  return {
    id: `legislador-${camaraLabel}-${l.apellido}-${l.nombre}`.replace(/\s+/g, "_"),
    section: "legisladores",
    sourceId: l.nombre,
    text,
    citation,
    metadata: {
      nombre: l.nombre,
      camara: camaraLabel,
      bloque: l.bloque,
      departamento: l.departamento,
    },
    date: null,
  };
}

export function buildChunks(data: ScrapedData): Chunk[] {
  const chunks: Chunk[] = [];

  for (const ley of data.leyes) chunks.push(leyToChunk(ley));
  for (const msg of data.mensajes) chunks.push(mensajeToChunk(msg));
  for (const p of data.proyectosSesion) chunks.push(proyectoSesionToChunk(p));

  for (const [, legisladores] of Object.entries(data.legisladores.diputados)) {
    for (const l of legisladores) chunks.push(legisladorToChunk(l, "Diputado/a"));
  }
  for (const [, legisladores] of Object.entries(data.legisladores.senado)) {
    for (const l of legisladores) chunks.push(legisladorToChunk(l, "Senador/a"));
  }

  return chunks;
}
