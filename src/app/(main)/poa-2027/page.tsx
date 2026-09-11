import { getPerfilActual } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";

export const revalidate = 0;

export default async function Poa2027Landing() {
  const perfil = await getPerfilActual();
  let cantidadFichas = 0;
  if (perfil?.unidad_id) {
    const sb = await getSupabaseServer();
    const { count } = await sb
      .from("ficha_prisma")
      .select("*", { count: "exact", head: true })
      .eq("unidad_id", perfil.unidad_id)
      .is("deleted_at", null);
    cantidadFichas = count ?? 0;
  }

  const esDirector = perfil?.rol === "director" || perfil?.rol === "admin_funcional";

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">POA 2027 — Ficha PRISMA</h1>
        <p className="text-sm text-muted mt-1">
          Planificación de proyectos para el Plan Operativo Anual 2027 mediante la metodología PRISMA.
        </p>
      </div>

      {/* 11.09 — "lo que hay que sacar es esa tabla prisma que sigue figurando
          en el botón. Ya no abajo pero si en el botón".
          Acá estaba el botón "Ficha PRISMA + Instructivo", que abría el PDF con
          la tabla. El bloque de abajo —la sigla explicada letra por letra— ya se
          había sacado el 09.09; esto es lo que quedaba.
          El archivo sigue en public/poa2027/ pero ya no está enlazado desde
          ninguna pantalla: borrarlo es de ellos, no nuestro. */}

      {/* Acciones del director */}
      {esDirector ? (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/poa-2027/cargar"
            className="rounded-xl border border-primary/30 bg-primary/5 p-5 hover:bg-primary/10 transition-colors text-center"
          >
            <div className="text-2xl mb-2">➕</div>
            <p className="text-sm font-semibold text-foreground">Cargar ficha nueva</p>
            <p className="text-[10px] text-muted mt-1">Crear una ficha PRISMA</p>
          </Link>
          <Link
            href="/poa-2027/mis-fichas"
            className="rounded-xl border border-border bg-surface p-5 hover:border-primary/40 transition-colors text-center"
          >
            <div className="text-2xl mb-2">📑</div>
            <p className="text-sm font-semibold text-foreground">Mis fichas</p>
            <p className="text-[10px] text-muted mt-1">
              {cantidadFichas} {cantidadFichas === 1 ? "ficha cargada" : "fichas cargadas"} · ver y editar
            </p>
          </Link>
          <Link
            href="/poa-2027/exportar"
            className="rounded-xl border border-border bg-surface p-5 hover:border-primary/40 transition-colors text-center"
          >
            <div className="text-2xl mb-2">📥</div>
            <p className="text-sm font-semibold text-foreground">Generar POA 2027</p>
            <p className="text-[10px] text-muted mt-1">Documento editable con todas tus fichas</p>
          </Link>
        </section>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            La carga de fichas PRISMA está disponible para los Directores. Con tu rol actual podés ver
            los documentos de referencia.
          </p>
        </div>
      )}

      {/* 09.09, párrafo 744: "eliminar lo que dice ¿Qué es PRISMA?".
          Era un bloque que desplegaba la sigla letra por letra (Programa,
          Relevancia, Indicador, Secretaría, Meta anual, Ancla). Se saca de acá
          nomás: la explicación de cómo llenar la ficha está en el instructivo,
          que es el PDF de arriba.

          Ojo con el alcance de este pedido, que es más chico de lo que parece.
          El mismo párrafo dice que el duplicado editable del POA 2026
          "reemplazaría el PRISMA", pero lo que piden borrar hoy es este texto,
          no las cinco pantallas. Y hay fichas cargadas de verdad, una del 10.09,
          así que sacar el flujo entero se decide aparte y con ellos. */}
    </div>
  );
}
