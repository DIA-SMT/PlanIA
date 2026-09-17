/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Carga en la base lo que leyó el 700 de los libros del POA 2026.
 *
 *   npx tsx supabase/import/710_cargar_libros_poa.ts            (ensayo, no escribe)
 *   npx tsx supabase/import/710_cargar_libros_poa.ts --aplicar
 *   npx tsx supabase/import/710_cargar_libros_poa.ts --aplicar --con-dudosos
 *
 * Por defecto NO escribe: imprime lo que haría. Y por defecto carga solo los
 * emparejamientos de confianza alta; los dudosos entran con `--con-dudosos`,
 * después de que Planificación los mire en LIBROS_POA_REVISAR.md.
 *
 * NUNCA PISA LO QUE YA ESTÁ. Cada campo se vuelve a mirar contra la base en el
 * momento de escribir y se completa solo si está vacío, así entre que se generó
 * el archivo y se aplica alguien pudo cargar algo a mano sin perderlo.
 *
 * DÓNDE VA CADA COSA DEL LIBRO:
 *   Descripción y objetivo  -> proyecto.descripcion
 *   Objetivo (solo Ingresos Municipales, que lo titula aparte) -> proyecto.objetivo
 *   Período de trabajo      -> proyecto.fecha_inicio / fecha_fin
 *   Línea de base, Meta,    -> proyecto.metadata.libro_poa
 *   Hito, Responsable
 *
 * Las cuatro últimas no tienen columna propia y no se les inventa una: son
 * texto del libro, no datos que el sistema calcule. Van juntas en `metadata`,
 * que ya se usa para la procedencia de la importación, y la pantalla del
 * proyecto las muestra en el bloque "Ficha del POA". Mezclar y no reemplazar:
 * 416 proyectos ya tienen algo ahí.
 *
 * Es idempotente: volver a correrlo no cambia nada, porque lo que ya se cargó
 * deja de estar vacío.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ARCHIVO = "supabase/import/libros-poa.json";

interface Fila {
  proyecto_id: string;
  nombre_en_base: string;
  area: string;
  archivo: string;
  direccion_en_libro: string | null;
  descripcion: string | null;
  objetivo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  campos_del_libro: Record<string, string | undefined>;
}

const vacio = (v: unknown) => !String(v ?? "").trim();

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const conDudosos = process.argv.includes("--con-dudosos");

  const j = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  const filas: Fila[] = [...j.seguros, ...(conDudosos ? j.dudosos : [])];
  console.log(
    `${filas.length} proyectos a completar` +
      `${conDudosos ? " (incluye los dudosos)" : ` (los ${j.dudosos.length} dudosos quedan afuera)`}` +
      `${aplicar ? "" : "  — ENSAYO, no se escribe nada"}\n`
  );

  const env = readFileSync(".env", "utf8");
  const g = (k: string) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const sb = createClient(g("NEXT_PUBLIC_SUPABASE_URL")!, g("SUPABASE_SERVICE_ROLE_KEY")!);

  const cuenta = { descripcion: 0, objetivo: 0, fechas: 0, ficha: 0, sinCambios: 0, errores: 0 };

  for (const f of filas) {
    const { data: actual, error } = await sb
      .from("proyecto")
      .select("id, descripcion, objetivo, fecha_inicio, fecha_fin, metadata")
      .eq("id", f.proyecto_id)
      .single();
    if (error || !actual) {
      console.log(`  ! no se pudo leer ${f.nombre_en_base.slice(0, 50)}: ${error?.message}`);
      cuenta.errores++;
      continue;
    }
    const a = actual as any;

    const cambios: Record<string, unknown> = {};
    if (f.descripcion && vacio(a.descripcion)) { cambios.descripcion = f.descripcion; cuenta.descripcion++; }
    if (f.objetivo && vacio(a.objetivo)) { cambios.objetivo = f.objetivo; cuenta.objetivo++; }
    if (f.fecha_inicio && vacio(a.fecha_inicio)) {
      cambios.fecha_inicio = f.fecha_inicio;
      if (f.fecha_fin && vacio(a.fecha_fin)) cambios.fecha_fin = f.fecha_fin;
      cuenta.fechas++;
    }

    // La ficha del libro: lo que no tiene columna. Se escribe una sola vez.
    const ficha = {
      linea_base: f.campos_del_libro.linea_base ?? null,
      meta: f.campos_del_libro.meta ?? null,
      hito: f.campos_del_libro.hito ?? null,
      responsable: f.campos_del_libro.responsable ?? null,
      periodo: f.campos_del_libro.periodo ?? null,
      direccion: f.direccion_en_libro,
      libro: f.archivo,
    };
    const tieneAlgo = Object.values(ficha).some((v) => v !== null);
    if (tieneAlgo && !a.metadata?.libro_poa) {
      cambios.metadata = { ...(a.metadata ?? {}), libro_poa: ficha };
      cuenta.ficha++;
    }

    if (Object.keys(cambios).length === 0) { cuenta.sinCambios++; continue; }

    if (aplicar) {
      const { error: eUp } = await sb.from("proyecto").update(cambios).eq("id", f.proyecto_id);
      if (eUp) { console.log(`  ! ${f.nombre_en_base.slice(0, 50)}: ${eUp.message}`); cuenta.errores++; }
    }
  }

  console.log("Descripción completada     :", cuenta.descripcion);
  console.log("Objetivo completado        :", cuenta.objetivo);
  console.log("Fechas completadas         :", cuenta.fechas);
  console.log("Ficha del libro guardada   :", cuenta.ficha);
  console.log("Sin nada que completar     :", cuenta.sinCambios);
  console.log("Errores                    :", cuenta.errores);
  if (!aplicar) console.log("\nEnsayo. Para escribir de verdad: --aplicar");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
