import { redirect } from "next/navigation";

/**
 * 03.11: "esa ficha ya no se utiliza". Esta pantalla era el formulario PRISMA
 * (P, R, I, S, M...) de "+ Cargar un proyecto nuevo". Ahora el proyecto nuevo
 * se carga en Editar mi POA, con el mismo formato que las demás fichas; si
 * alguien llega acá por un link viejo, va para allá.
 */
export default function CargarFichaPage() {
  redirect("/poa-2027/mis-fichas");
}
