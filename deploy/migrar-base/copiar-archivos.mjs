// Copia los archivos de Storage del proyecto viejo de Supabase al nuevo.
//
// El volcado de la base trae las filas de storage.buckets y storage.objects,
// pero no los archivos: esos viven aparte y hay que bajarlos de uno y subirlos
// al otro. PlanIA tiene un solo bucket, "actividad-documentos" (migración 055),
// con los documentos de las actividades en carpetas por id de actividad.
//
// Uso (desde la carpeta de PlanIA, para que encuentre @supabase/supabase-js):
//   VIEJA_URL=https://xxxx.supabase.co VIEJA_SERVICE_KEY=... \
//   NUEVA_URL=https://yyyy.supabase.co NUEVA_SERVICE_KEY=... \
//   node deploy/migrar-base/copiar-archivos.mjs
//
// Se puede correr más de una vez: sube con upsert, así que pisa lo que ya esté.

import { createClient } from "@supabase/supabase-js";

const faltan = ["VIEJA_URL", "VIEJA_SERVICE_KEY", "NUEVA_URL", "NUEVA_SERVICE_KEY"].filter(
  (k) => !process.env[k]
);
if (faltan.length) {
  console.error(`Faltan variables: ${faltan.join(", ")}`);
  process.exit(1);
}
if (process.env.VIEJA_URL === process.env.NUEVA_URL) {
  console.error("VIEJA_URL y NUEVA_URL son la misma: no hay nada que copiar.");
  process.exit(1);
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
const vieja = createClient(process.env.VIEJA_URL, process.env.VIEJA_SERVICE_KEY, opciones);
const nueva = createClient(process.env.NUEVA_URL, process.env.NUEVA_SERVICE_KEY, opciones);

/** Todos los archivos de un bucket, recorriendo las carpetas. */
async function listarTodo(cliente, bucket, carpeta = "") {
  const archivos = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await cliente.storage
      .from(bucket)
      .list(carpeta, { limit: 1000, offset: desde, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Listando ${bucket}/${carpeta}: ${error.message}`);
    for (const item of data) {
      const ruta = carpeta ? `${carpeta}/${item.name}` : item.name;
      // Las carpetas vienen sin id.
      if (item.id === null) archivos.push(...(await listarTodo(cliente, bucket, ruta)));
      else archivos.push({ ruta, tipo: item.metadata?.mimetype ?? "application/octet-stream" });
    }
    if (data.length < 1000) break;
  }
  return archivos;
}

const { data: buckets, error: errBuckets } = await vieja.storage.listBuckets();
if (errBuckets) throw new Error(`Leyendo los buckets: ${errBuckets.message}`);

let copiados = 0;
let fallidos = 0;
for (const b of buckets) {
  // El volcado ya trae el bucket; si no estuviera, se crea igual que el viejo.
  const { data: existe } = await nueva.storage.getBucket(b.id);
  if (!existe) {
    const { error } = await nueva.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.file_size_limit ?? undefined,
      allowedMimeTypes: b.allowed_mime_types ?? undefined,
    });
    if (error) throw new Error(`Creando el bucket ${b.id}: ${error.message}`);
  }

  const archivos = await listarTodo(vieja, b.id);
  console.log(`${b.id}: ${archivos.length} archivos`);
  for (const a of archivos) {
    const { data: blob, error: errBajar } = await vieja.storage.from(b.id).download(a.ruta);
    if (errBajar) {
      console.error(`  ✗ ${a.ruta}: no se pudo bajar (${errBajar.message})`);
      fallidos++;
      continue;
    }
    const { error: errSubir } = await nueva.storage
      .from(b.id)
      .upload(a.ruta, blob, { contentType: a.tipo, upsert: true });
    if (errSubir) {
      console.error(`  ✗ ${a.ruta}: no se pudo subir (${errSubir.message})`);
      fallidos++;
      continue;
    }
    copiados++;
  }

  const enLaNueva = await listarTodo(nueva, b.id);
  console.log(`  en el proyecto nuevo quedaron ${enLaNueva.length} de ${archivos.length}`);
}

console.log(`Listo: ${copiados} copiados, ${fallidos} con error.`);
process.exit(fallidos ? 1 : 0);
