import { getPerfilActual } from "@/lib/auth";
import { unidadesDelPerfil } from "@/lib/utils";
import { getSupabaseServer } from "@/lib/supabase/server";
import { BackButton } from "@/components/layout/back-button";
import { FichaForm } from "@/components/prisma/ficha-form";
import { redirect, notFound } from "next/navigation";
import type { FichaPrisma, UnidadOrganizacional } from "@/types/database";

export const revalidate = 0;

export default async function EditarFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");

  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("ficha_prisma")
    .select("*, unidad:unidad_organizacional(id, nombre, nombre_corto)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !data) notFound();
  const ficha = data as FichaPrisma & { unidad?: UnidadOrganizacional };

  const puedeEditar =
    perfil.rol === "admin_funcional" ||
    (perfil.rol === "director" && unidadesDelPerfil(perfil).includes(ficha.unidad_id));

  if (!puedeEditar) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">No tenés permiso para editar esta ficha.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback="/poa-2027/mis-fichas" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Editar Ficha PRISMA</h1>
        <p className="text-sm text-muted mt-1">Planificación POA 2027</p>
      </div>
      <FichaForm
        direccionNombre={ficha.unidad?.nombre ?? "—"}
        ficha={ficha}
      />
    </div>
  );
}
