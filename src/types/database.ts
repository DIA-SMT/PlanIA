// Tipos que reflejan el schema de Supabase.
// Generados manualmente para el MVP. Cuando el schema se estabilice
// se puede usar `supabase gen types typescript` para auto-generar.

export type EstadoSemaforo = "verde" | "amarillo" | "rojo" | "gris" | "sin_datos";
export type EstadoProyecto = "borrador" | "activo" | "pausado" | "completado" | "cancelado";
export type TipoMedicion = "cuantitativo" | "cualitativo" | "hito_unico";
export type TipoUnidad = "secretaria" | "subsecretaria" | "direccion" | "departamento" | "coordinacion" | "otro";
export type FuenteAvance = "manual" | "importacion" | "chatbot" | "audio" | "correccion";
export type RolUsuario =
  | "intendenta"
  | "secretario"
  | "subsecretario"
  | "director"
  // Coordinador (30.07): mismo alcance de carga que un secretario sobre su
  // unidad + descendientes. Se creó para la Secretaría de Ambiente.
  | "coordinador"
  | "admin_funcional"
  | "admin_tecnico";
export type AccionHistorial = "carga" | "edicion" | "borrado";
export type EstadoValidacion = "pendiente" | "validado" | "observado";
export type FrecuenciaMedicion = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual" | "puntual";

export interface UnidadOrganizacional {
  id: string;
  parent_id: string | null;
  nombre: string;
  nombre_corto: string | null;
  tipo: TipoUnidad;
  nivel: number;
  orden: number;
  responsable_nombre: string | null;
  activa: boolean;
  codigo: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Periodo {
  id: string;
  anio: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  configuracion: {
    umbrales_semaforo?: {
      verde_min: number;
      amarillo_min: number;
      dias_sin_actualizar_alerta: number;
    };
  };
  created_at: string;
  updated_at: string;
}

export interface Proyecto {
  id: string;
  periodo_id: string;
  unidad_id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  objetivo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: EstadoProyecto;
  peso: number | null;
  orden: number;
  observaciones: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  unidad?: UnidadOrganizacional;
  metas?: Meta[];
  hitos?: Hito[];
  _count?: { metas: number; hitos: number; avances: number };
}

export interface NivelEscala {
  clave: string;
  label: string;
  valor_numerico: number;
}

export interface Meta {
  id: string;
  proyecto_id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  tipo_medicion: TipoMedicion;
  unidad_medida: string | null;
  valor_linea_base: number | null;
  valor_meta: number | null;
  escala_cualitativa: { niveles: NivelEscala[] } | null;
  frecuencia_medicion: FrecuenciaMedicion | null;
  medio_verificacion: string | null;
  fecha_inicio: string | null;
  fecha_limite: string | null;
  peso: number | null;
  orden: number;
  // Campos materializados (derivados de avance)
  valor_actual: number | null;
  nivel_actual: string | null;
  estado_semaforo: EstadoSemaforo;
  ultima_actualizacion: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Hito {
  id: string;
  proyecto_id: string;
  nombre: string;
  descripcion: string | null;
  fecha_esperada: string | null;
  obligatorio: boolean;
  peso: number | null;
  orden: number;
  completado: boolean;
  fecha_completado: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Avance {
  id: string;
  proyecto_id: string;
  meta_id: string | null;
  hito_id: string | null;
  fecha_reporte: string;
  fuente: FuenteAvance;
  valor_numerico: number | null;
  valor_cualitativo: string | null;
  observacion: string | null;
  created_by: string | null;
  payload_original: Record<string, unknown> | null;
  reemplaza_avance_id: string | null;
  estado_validacion: EstadoValidacion;
  validado_por: string | null;
  validado_at: string | null;
  observacion_validacion: string | null;
  created_at: string;
}

export interface PerfilUsuario {
  user_id: string;
  email: string;
  nombre: string | null;
  /**
   * Contacto en formato E.164 (+5493814123456). Nullable: se cargan de a poco.
   * Se normaliza con `normalizarTelefono` antes de escribir. (24.08)
   */
  telefono: string | null;
  rol: RolUsuario;
  unidad_id: string | null;
  /**
   * Otras áreas a cargo además de `unidad_id` (27.11, migración 066), con el
   * mismo rol y el mismo alcance. Usar `unidadesDelPerfil`, que las junta.
   */
  unidades_extra?: string[] | null;
  activo: boolean;
  /**
   * Ve TODAS las unidades sin importar rol/unidad (solo lectura). No amplía
   * permisos de carga: eso sigue saliendo del rol + su unidad. (03.08)
   */
  acceso_global: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined
  unidad?: UnidadOrganizacional;
}

export interface Indicador {
  id: string;
  meta_id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  formula: string | null;
  unidad_medida: string | null;
  valor_actual: number | null;
  valor_actual_texto: string | null;
  valor_objetivo: number | null;
  valor_objetivo_texto: string | null;
  observacion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado_semaforo: EstadoSemaforo;
  ultima_actualizacion: string | null;
  orden: number;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  meta?: Meta;
}

// Historial de Carga de un indicador (30.07): una fila por operación, con el
// valor tal como quedó y quién/cuándo lo cargó.
export interface IndicadorHistorial {
  id: string;
  indicador_id: string;
  accion: AccionHistorial;
  valor_actual: number | null;
  valor_actual_texto: string | null;
  valor_objetivo: number | null;
  valor_objetivo_texto: string | null;
  unidad_medida: string | null;
  estado_semaforo: EstadoSemaforo | null;
  observacion: string | null;
  registrado_por: string | null;
  registrado_por_email: string | null;
  registrado_por_nombre: string | null;
  created_at: string;
}

export interface AgendaSemana {
  id: string;
  unidad_id: string;
  fecha_lunes: string;
  formato_libre: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined
  unidad?: UnidadOrganizacional;
  actividades?: AgendaActividad[];
}

export interface AgendaActividad {
  id: string;
  agenda_semana_id: string;
  dia_semana: number; // 1=Lunes ... 7=Domingo
  orden: number;
  es_feriado: boolean;
  actividad: string;
  lugar: string | null;
  horario: string | null;
  observacion: string | null;
  // Clave de color de la paleta (06.08). null ⇒ usa el color de la unidad.
  color: string | null;
  created_at: string;
}

export interface FichaPrisma {
  id: string;
  unidad_id: string;
  anio: number;
  codigo: string | null;
  programa: string;       // P
  relevancia: string | null;  // R
  indicador: string | null;   // I
  secretaria: string | null;  // S
  meta_anual: string | null;  // M
  ancla: string | null;       // A
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined
  unidad?: UnidadOrganizacional;
}

type TableDefinition<RowType> = {
  Row: RowType;
  Insert: Partial<RowType>;
  Update: Partial<RowType>;
  Relationships: [];
};

// Tipo helper para la DB de Supabase con el shape esperado por supabase-js.
// ---------------------------------------------------------------------------
// Alertas dentro del sistema (26.08)
// ---------------------------------------------------------------------------

/** Mensaje de alerta manual. Las automáticas no se guardan: se calculan. */
export interface Alerta {
  id: string;
  titulo: string;
  cuerpo: string;
  /** true => además de la campanita se muestra el cartel arriba de la pantalla. */
  importante: boolean;
  /** Último día en que se muestra. null = sin vencimiento. */
  vigente_hasta: string | null;
  creado_por: string | null;
  creado_por_email: string | null;
  creado_por_nombre: string | null;
  created_at: string;
}

export interface AlertaDestinatario {
  alerta_id: string;
  user_id: string;
  leida_at: string | null;
}

/** Una alerta con el estado de lectura de quien la está consultando. */
export type AlertaConLectura = Alerta & { leida_at: string | null };

/**
 * Alerta automática de indicador próximo a vencer. NO existe como fila: se
 * calcula al leer sobre `indicador.fecha_fin` y el avance del indicador, así
 * aparece cuando el problema aparece y se va cuando se resuelve.
 */
export interface IndicadorPorVencer {
  indicador_id: string;
  indicador_nombre: string;
  proyecto_id: string;
  proyecto_nombre: string;
  unidad_nombre: string | null;
  fecha_fin: string;
  /** Días desde hoy hasta fecha_fin. 0 = vence hoy. */
  dias_restantes: number;
  /** 0-100, o null si no se puede medir. */
  avance: number | null;
}

export interface Database {
  public: {
    Tables: {
      unidad_organizacional: TableDefinition<UnidadOrganizacional>;
      periodo: TableDefinition<Periodo>;
      proyecto: TableDefinition<Proyecto>;
      meta: TableDefinition<Meta>;
      hito: TableDefinition<Hito>;
      avance: TableDefinition<Avance>;
      indicador: TableDefinition<Indicador>;
      agenda_semana: TableDefinition<AgendaSemana>;
      agenda_actividad: TableDefinition<AgendaActividad>;
      perfil_usuario: TableDefinition<PerfilUsuario>;
      ficha_prisma: TableDefinition<FichaPrisma>;
      alerta: TableDefinition<Alerta>;
      alerta_destinatario: TableDefinition<AlertaDestinatario>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      estado_semaforo: EstadoSemaforo;
      estado_proyecto: EstadoProyecto;
      tipo_medicion: TipoMedicion;
      tipo_unidad: TipoUnidad;
      fuente_avance: FuenteAvance;
      frecuencia_medicion: FrecuenciaMedicion;
    };
    CompositeTypes: Record<string, never>;
  };
}
