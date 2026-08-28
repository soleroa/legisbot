export interface Ley {
  id: string;
  numero: string;
  expedienteSenado: string;
  expedienteDiputados: string;
  descripcion: string;
  fechaSancion: string;
  fechaPromulgacion: string;
  publicacionBO: string;
  origen: string;
  leyAdjunta: string;
  linkNorma: string;
  linkSIEL: string;
  decreto: string;
  afirmativos: string;
  negativos: string;
  abstenciones: string;
  votacionDiputados: Record<string, unknown>;
}

export interface Mensaje {
  id: string;
  numero: string;
  expedienteSenado: string;
  expedienteDiputados: string;
  fechaIngreso: string;
  descripcion: string;
  camaraOrigen: string;
  estado: string;
  comision: string;
  fechaMediaSancion: string;
  fechaRevision: string;
  fechaAceptaModificaciones: string;
  fechaSancionDefinitiva: string;
  leyNumero: string;
  fechaPromulgacion: string;
  publicacionBO: string;
  mensajeAdjunto: string;
  decretoAdjunto: string;
  tema: string;
}

export interface ProyectoSesion {
  id: string;
  camara: string;
  periodoLegislativo: string;
  tipo: string;
  sesion: string;
  reunion: string;
  fecha: string;
  linkVideo: string;
  expediente: string;
  tipoProyecto: string;
  descripcion: string;
  estado: string;
}

export interface Legislador {
  nombre: string;
  apellido: string;
  camara: string;
  departamento: string;
  bloque: string;
  partido: string;
  presentismo: number;
  presentes: number;
  total: number;
  mail: string;
  instagram: string;
  twitter: string;
  facebook: string;
  foto: string;
}

export interface AsistenciaSesion {
  fecha: string;
  tipoSesion: string;
  asistencia: Record<string, string>;
}

export interface ScrapedData {
  scrapedAt: string;
  buildId: string | null;
  leyes: Ley[];
  mensajes: Mensaje[];
  proyectosSesion: ProyectoSesion[];
  legisladores: {
    diputados: Record<string, Legislador[]>;
    senado: Record<string, Legislador[]>;
  };
  asistencia: {
    diputados: AsistenciaSesion[];
    senadores: AsistenciaSesion[];
  };
}

export type SourceSection = "leyes" | "mensajes" | "sesiones" | "legisladores";

export interface Chunk {
  id: string;
  section: SourceSection;
  sourceId: string;
  /** Texto completo que se muestra al LLM como contexto (incluye metadatos: decreto, expedientes, links). */
  text: string;
  /**
   * Versión corta y densa del contenido, usada SOLO para generar el
   * embedding. Un chunk largo y heterogéneo (descripción + decreto +
   * expedientes + links) diluye su similitud semántica real: un chunk de
   * sesión que menciona el mismo hecho con menos "ruido" alrededor puede
   * terminar pareciéndose más a la pregunta que el chunk de la propia ley.
   * Si no se especifica, se usa `text` completo (comportamiento por defecto).
   */
  embeddingText?: string;
  citation: string;
  metadata: Record<string, string>;
  /** Fecha primaria del registro, ISO YYYY-MM-DD, o null si no aplica (p.ej. legisladores). */
  date: string | null;
}
