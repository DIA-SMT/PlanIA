# Correcciones 09.09 — plan de ejecución

**Fecha del pedido:** 9 de septiembre de 2026
**Documento fuente:** `Modificaciones PLANIA (2).docx`, párrafos 685 a 772 (página 43 y siguientes)
**Rama:** `lucas`
**Contexto:** el reporte trimestral sigue comprometido para el **viernes 25 de septiembre**

---

## 0. Lo primero: nos contestaron una pregunta

El párrafo 703 responde la **pregunta 4 del Plan Rector**, que era bloqueante:

> "Necesitamos que se realice la medición en base a los **ámbitos**, como nos propusieron (pero no saquen las líneas estratégicas, dejenlas escritas, solo no las miden)."

Eso desbloquea la etapa 5 del Plan Rector, que estaba esperando justamente el nivel al que había que medir. Y confirma nuestra recomendación: medir por ámbito y no por línea.

Piden además:

- que se vea el **porcentaje de avance de cada ámbito**;
- una opción para ver **qué proyectos contiene cada ámbito**;
- que el porcentaje "varíe en función a la cantidad de proyectos activos con los que cuente, respecto a la cantidad de proyectos de cada área" — frase ambigua, resuelta como promedio simple en §11.1;
- una **aclaración metodológica** de que se trabaja con información de 2026.

Las otras 8 preguntas del Plan Rector y las 6 del reporte trimestral **siguen sin respuesta**.

---

## 1. Son 27 pedidos. Así los agrupé

| # | Bloque | Pedidos | Depende del cliente |
|---|---|---|---|
| A | Bugs y fuga de datos | 3 | no |
| B | Plan Rector | 6 | parcialmente |
| C | Unificar Proyectos e Indicadores | 6 | no |
| D | Reportes | 7 | no |
| E | Avisos por correo | 1 | resuelto |
| F | Contraseñas | 1 | no |
| G | POA 2027 | 2 | **sí, abierto** |
| H | Menores | 1 | no |

---

## 2. Bloque A — Lo que hay que arreglar primero

> **Revisado el 10.09 contra el código y contra los datos de producción.** El
> diagnóstico original de A2 y A3 era equivocado; abajo está el verificado. Lo
> que sigue reemplaza lo que decía este documento antes.

### A1. Un director ve el reporte de toda la secretaría (párrafo 732)

> "Desde este perfil de director se puede ver este cuadro de desempeño que contiene la información de todas las subsecretarías de la Sec. Gral. Esto no puede ser así."

**Tienen razón, y la causa es nuestra.** El reporte valida el acceso con
`getScopeUnidades()`, y esa función le da al director sus descendientes **más sus
ancestros** — o sea su subsecretaría y su secretaría. Lo introdujo el commit
`4d8ca1f` del 26.08, cuando se amplió el permiso del director para que pudiera
cargar proyectos en su secretaría (pedido de la página 38).

Ampliar la **carga** hacia arriba estaba pedido. Ampliar la **lectura de
reportes** hacia arriba fue un efecto colateral que no vimos.

El alcance de lectura del reporte no es el mismo que el de carga. Lo que piden,
que además es lo correcto:

| Rol | Ve el reporte de |
|---|---|
| Director | solo su dirección (y sus departamentos) |
| Subsecretario | su subsecretaría y las direcciones a su cargo |
| Secretario | toda su secretaría |
| Intendenta / Planificación | todo |

**Arreglo:** una función propia de alcance para reportes, con
`unidades_descendientes` y **sin** ancestros. No se toca `getScopeUnidades`, que
otras pantallas usan a propósito.

**Y hay una segunda consecuencia del mismo commit,** que no es A1 pero conviene
arreglar en la misma pasada: `getScopeUnidades` no es el espejo de la regla de
carga que dice ser. La función SQL `usuario_puede_cargar_unidad`
(migración 042, líneas 52-58) le da al director **su unidad más sus ancestros,
sin descendientes**. La versión de la app le agrega los descendientes. Efecto: un
director con departamentos debajo ve el botón de editar habilitado
(`proyectos/page.tsx:148`), pasa el control de `actions.ts:1267`, y el UPDATE de
`editarProyecto` (`actions.ts:1282-1291`) no encuentra ninguna fila que le
corresponda y **devuelve éxito sin haber guardado nada**. El usuario cree que
guardó. Hay que hacer que esas escrituras avisen cuando no escribieron, como ya
hace `actualizarIndicador` (`actions.ts:841-854`).

### A2. Los "Finalizados" (párrafo 721) — el bug es real, pero está en otra pantalla

> "Todavía hay proyectos marcados como Finalizados (en verde), cuando tienen un
> porcentaje de avance mayor al 80%. […] este dato (72) sería incorrecto."

**Mi primer diagnóstico estaba mal.** Decía que la causa era el umbral del 80 %
en `actions.ts:219` más los indicadores sin objetivo. Verificado en el código:
`calcularSemaforo` devuelve `"sin_datos"` cuando falta el valor **o** el objetivo
(`actions.ts:212`), así que **nunca escribe verde sin objetivo**; y cuando hay
objetivo, todos los lectores usan el porcentaje real y nunca el color. Mover ese
umbral del 80 al 100 recalcularía miles de filas y **no movería ni un proyecto**.

Lo que sí está pasando, medido el 10.09 sobre los 441 proyectos activos:

**En el Panel Ejecutivo los 73 Finalizados están bien.** Ahí el estado se calcula
con `estadoDeAvance`, que exige `pct >= 100`. Trece de esos 73 llegan al 100 %
apoyados en un indicador de texto marcado verde, y revisados uno por uno **son
legítimos**: los indicadores se llaman *"Campaña realizada"*, *"Registro
elaborado"*, *"Tablero establecido"*, *"Actividad desarrollada"*, y su valor
cargado dice *"SI"*, *"Finalizado"*, *"Presentado"*, *"OPERATIVO DESDE ABRIL"*.
Son hitos binarios: *realizado = sí* **es** el 100 %. De los 28 indicadores en esa
situación, 27 son de texto y 1 es numérico.

**El bug está en la pantalla PROYECTOS,** que usa una fórmula distinta del resto
del sistema: `calcularAvancePorIndicadores` (`utils.ts:216-257`), con verde a
partir del **70 %**, rojo valuado en 10 en vez de 0, y promediando solo sobre los
indicadores que tienen dato en vez de sobre todos.

| Estado del proyecto | Panel Ejecutivo | Pantalla Proyectos |
|---|---|---|
| Finalizados | **73** | **132** |
| En ejecución | 211 | 99 |
| No iniciados | 90 | 141 |
| Sin datos | 67 | 69 |

**113 de los 441 proyectos (26 %) muestran un estado distinto según en qué
pantalla se los mire.** Y de los 132 que Proyectos llama Finalizados, **60 no
están al 100 %, y 55 de esos están justo entre el 70 % y el 99 %** — que es
textualmente lo que reportó el cliente. Ejemplos: *Talleres Invierno azul* 89 %
en verde, *Catalogación de obras* 88 % en verde, *Plan IA* 90 % en verde.

Los casos más graves son los que además discrepan fuerte entre pantallas:

| Proyecto | Proyectos dice | Panel dice |
|---|---|---|
| Un Vete en tu Barrio – Esterilizaciones | 99 % | 8 % |
| Evaluación de Desempeño y del Potencial | 90 % | 23 % |
| Intervención centrada en la familia | 100 % | 25 % |
| Digitalización de Legajos de Personal | 100 % | 50 % |

**Arreglo:** que Proyectos use la misma cascada que el Panel Ejecutivo, la TV,
Avance por Dirección, las fotos de corte y el reporte trimestral
(`avanceMetaEnPlazo` → `avanceAgregado` → `estadoDeAvance`), y borrar
`calcularAvancePorIndicadores`, que es la tercera fórmula de semáforo del sistema
y su único consumidor es esa pantalla. Esto también cierra el hallazgo §7.1 de
`PLAN_RECTOR.md`.

**Efecto visible:** en la lista, Finalizados baja de 132 a 73, No iniciados de 141
a 90 y En ejecución sube de 99 a 211. Es un cambio grande y a la vista, pero hacia
la coherencia: después de esto el número de la lista y el de la tarjeta son el
mismo número.

**Y una consecuencia sobre la decisión 2:** de los 431 indicadores sin objetivo
numérico cargado, solo **52 son numéricos** — el resto son hitos de texto, donde
no tener un objetivo numérico es lo normal y correcto. Así que la campaña de
"completen los objetivos que faltan" tiene 52 casos reales, no 431: sigue
valiendo la pena, pero es una lista corta y no una campaña.

### A3. Los avisos no se van al marcarlos como leídos (párrafo 765)

> "Los avisos cuando uno toca el tilde o la opción de marcar todo como leído, no
> desaparece y dificulta la vista del buscador por área."

**También acá el primer diagnóstico estaba flojo.** No es que marcar como leído
no guarde nada: guarda bien. El problema es **quién lo reportó**.

El "buscador por área" es el selector de destinatarios de la pantalla de admin
(`nueva-alerta-form.tsx:215`), que solo abren Planificación y los técnicos. Y para
un admin, la consulta que trae los avisos (`queries.ts:542-546`) **no filtra por
usuario**: confía en la RLS, y la RLS de la migración 043 (líneas 103-108) le
deja al admin leer las filas de **todos los destinatarios**. Entonces un admin que
manda un aviso a los 72 usuarios recibe de vuelta 72 filas, 71 ajenas, todas con
`leida_at` en nulo. Y "marcar todo como leído" (`actions.ts:1553`) solo puede
tocar las propias, así que **las otras 71 no se apagan nunca**.

Eso explica las dos mitades de la queja: el aviso no desaparece, y el buscador
queda tapado — porque `cartel-alertas.tsx:20` dibuja **un cartel por fila**, hasta
el tope de 50, empujando el título y el formulario fuera de la pantalla.

**Arreglo:** filtrar la lectura por usuario en la consulta, sin depender de la
RLS para acotar lo propio. Con eso el aviso se apaga y el cartel deja de
multiplicarse. Encima va lo que ya estaba decidido: que los leídos salgan de la
vista, con un "ver leídos" para recuperarlos.

---

## 3. Bloque B — Plan Rector

| # | Pedido | Párrafo |
|---|---|---|
| B1 | **Medir por ámbito**: % de avance de cada ámbito, y ver qué proyectos contiene. Las líneas quedan escritas pero no se miden | 703 |
| B2 | Aclaración metodológica: se trabaja con información de 2026 | 703 |
| B3 | Color propio de cada ámbito (están en el sheets) y el ícono de cada ODS | 687 |
| B4 | Títulos "Objetivo Estratégico" / "Líneas Estratégicas", y **un solo texto** para el objetivo aunque sea largo | 691 |
| B5 | Los proyectos vinculados se ven **debajo** del objetivo y las líneas | 694 |
| B6 | En el selector, el **nombre al lado del código**, tanto en Ámbito como en Eje | 771 |
| B7 | La herramienta Plan Rector **solo** para Intendenta, Secretarios y Subsecretarios | 715 |

Sobre B4: en la captura se ve el texto del objetivo dos veces —truncado en la
fila y completo abajo—. Es de nuestra pantalla: la fila del objetivo muestra el
nombre recortado y al abrirse lo repite entero. Se deja uno solo.

Sobre B3: los íconos de los ODS son 14 imágenes de Naciones Unidas
(`argentina.un.org/es/sdgs`). Habría que descargarlas y servirlas desde
`public/`, no enlazarlas: si el sitio de la ONU cambia, el tablero queda con
huecos.

---

## 4. Bloque C — Unificar Proyectos e Indicadores

| # | Pedido | Párrafo |
|---|---|---|
| C1 | Toda la edición de indicadores pasa a **Proyectos**. El botón EDITAR de cada indicador despliega la herramienta de Indicadores tal cual está | 707, 710 |
| C2 | El botón "+ cargar avance" — **ojo, sí escribe** (ver nota) | 711 |
| C3 | **Eliminar la herramienta Indicadores** | 713 |
| C4 | **Eliminar Estructura** del tablero | 713 |
| C5 | Click en un indicador desde Proyectos lleva a su detalle | 768 |
| C6 | Los directores ven: Panel Ejecutivo, Proyectos, Avance por Dirección, Reportes, Agenda, POA 2027 | 717 |

Sobre C2: **el botón no está muerto.** Abre el formulario de avance de la meta,
que inserta en la tabla `avance` (`actions.ts:346-353`) y actualiza el valor de
la meta (`:382-385`); hay **231 avances** ya cargados por esa vía, y es lo que
alimenta "Últimos avances" y la pantalla de validaciones. Lo que no hace es mover
el porcentaje **cuando la meta tiene indicadores**, porque en ese caso el
porcentaje sale de los indicadores (`utils.ts:493-495`) — y el propio cartel lo
avisa. De las 789 metas vivas, **18 no tienen indicadores** y para ésas es el
único modo de reportar avance. **Propuesta:** no borrarlo; mostrarlo solo en las
metas sin indicadores, donde sí sirve, y esconderlo en las demás, que es donde el
cliente lo vio "sin efecto".

Sobre C3 y C4: **decidido en §11.3, confirmado por el cliente**. Se sacan del
menú y la pantalla de detalle del indicador queda viva, porque es a donde lleva el
click que pide C5 y porque el asistente del sistema tiene funciones que consultan
indicadores. Queda por contestarle al cliente desde dónde va a editar: ver §11.3.

---

## 5. Bloque D — Reportes

| # | Pedido | Párrafo |
|---|---|---|
| D1 | Alcance por rol | 732 → es A1 |
| D2 | **Numeración 1, 2, 3**: hoy salta del 2 al 4 | 752 |
| D3 | Sin saltos grandes de página. Todo continuado; **solo el anexo** en hoja aparte | 755 |
| D4 | La palabra "área" por "Secretaría" | 760 |
| D5 | Un asterisco en la fase con su definición al pie, para no tener que ir al anexo | 761 |
| D6 | "No iniciado" en **rojo**, no celeste. En todos los datos | 729 |
| D7 | Que Planificación pueda imprimir borradores y publicaciones, no solo el secretario | 748, 749 |

Sobre D2: la numeración 1-2-4-3 la copiamos de su plantilla, que los numera así.
Ahora piden corregirla, así que pasa a 1, 2, 3.

Sobre D6: verificado el 10.09. En las pantallas de datos **no hay nada celeste
que cambiar**: el token `--color-info` ya vale `#EF4444` (globals.css:16 y :21,
el mismo rojo que `danger`), fijado el 30.07 por pedido suyo. Lo único celeste que
queda son **cuatro emojis** del documento del reporte
(`reporte-documento.tsx:151, :210, :271` y `anexo-metodologico.tsx:56`). Cambiar
clases `bg-info` por `bg-danger` en las pantallas no cambiaría ni un píxel y
rompería el único punto de control del color, así que no se toca.

Sobre D7: **resuelto sin necesidad de preguntar.** El botón de imprimir no tiene
ningún control de rol: es `{reporte && <BotonImprimir />}` (`reportes/page.tsx:202`)
y `boton-imprimir.tsx` no recibe ni consulta permisos. Planificación ve todas las
áreas, así que **ya puede imprimir todo**. Lo que falla es otra cosa: cuando
imprime Planificación se le imprimen los **cuadros de texto editables**, el
contador de caracteres y los botones, porque la versión limpia del análisis
(`analisis-form.tsx:90-107`) está detrás de `!puedeEditar` **y** publicado. O sea
que quien puede editar nunca ve la versión imprimible. **Arreglo:** que al
imprimir salga siempre el texto limpio, sin controles. Ponerle un permiso de rol
al botón sería una regresión: hoy imprimen secretarios y directores.

---

## 6. Bloque E — Avisos por correo o SMS (párrafo 735)

> "Nos gusta cómo se visualiza desde el sistema, pero notamos que no llega
> notificación al celular, al correo electrónico vinculado. […] Ustedes díganos
> qué es más viable de hacer."

Nos preguntaron directamente y **está decidido: correo ahora, SMS después** (§11.4).
El correo es viable y barato; el SMS cuesta plata por mensaje y necesita
una cuenta con un proveedor, más los teléfonos cargados: hoy hay **0 de 73**
perfiles con teléfono, aunque el campo existe desde la migración 041. En cambio
los **73 de 73 tienen correo cargado**, así que el correo funciona desde el día
uno y el SMS exige primero pedirle el celular a cada usuario.

---

## 7. Bloque F — Contraseñas (párrafo 737)

> "Agregar la función para modificar las contraseñas, desde el perfil de cada
> usuario y también una herramienta para que nosotros podamos ayudarlos."

Las dos cosas se resuelven con el reset por correo que la plataforma ya provee, sin
infraestructura nueva ni manipular contraseñas de nadie. **Decidido en §11.5.**

---

## 8. Bloque G — POA 2027 (párrafos 743, 744)

> "¿Se podrá hacer un duplicado editable de la POA 2026 en el PLANIA? […] La idea
> es que el director revise 'una poa a medias, ya avanzada' para que sea menos
> trabajo cargar la poa."
>
> "Esto reemplazaría el PRISMA que no debe figurar en el PLANIA."

Es el pedido más grande del lote: duplicar 441 proyectos con sus 789 metas y 1404
indicadores a un período nuevo, que Planificación pode, y que después el director
complete. **No entra antes del 25 de septiembre** sin arriesgar el reporte
trimestral, y ese es el default asumido mientras no haya definición: ver §12.

El pedido de eliminar PRISMA sí es corto.

---

## 9. Bloque H — Menores (párrafo 740)

Que diga la fecha exacta de última carga en vez de un relativo tipo "hace 3
días".

---

## 10. Orden de ejecución propuesto

| Etapa | Qué | Por qué ahí | Esfuerzo |
|---|---|---|---|
| **1** | A1 (fuga de datos del reporte) | Es una fuga de información entre áreas, y la causamos nosotros | ~2 h |
| **2** | A2 (unificar la fórmula de Proyectos) + A3 (avisos) | 26 % de los proyectos muestra un estado distinto según la pantalla | ~1 día |
| **3** | Bloque D completo (reportes) | El reporte tiene fecha del 25 y son todos cambios chicos | ~1 día |
| **4** | Bloque C (unificar Proyectos e Indicadores) | Es el cambio de estructura más grande que sí podemos hacer sin esperar | ~2 días |
| **5** | Bloque B (Plan Rector, ahora desbloqueado) | Ya tenemos la definición que faltaba | ~2 días |
| **6** | F (contraseñas) + H (fecha de carga) | Chicos y sueltos | ~medio día |
| **7** | E (avisos por correo) | Ya decidido el canal (§11.4) | ~1 día |
| **8** | G (POA 2027) | Después del 25, es un proyecto en sí mismo | ~1 semana |

Las etapas 1 a 3 primero porque son las que están mal a la vista de los usuarios
hoy. El bloque G queda para después del reporte trimestral a propósito.

La etapa 2 creció respecto de la primera versión: unificar la fórmula de Proyectos
toca una pantalla central y cambia números que el cliente ya vio, así que va con
su propia verificación contra los datos de producción antes y después.

---

## 11. Decisiones tomadas

Respondidas el 10.09. Las que quedan abiertas están al final.

### 1. El porcentaje de cada ámbito → **promedio simple** ✔

El porcentaje de un ámbito es el promedio de avance de los proyectos imputados a
ese ámbito, sin ponderar por cantidad. Es lo que ya hace el resto del sistema, así
que el número del Plan Rector va a coincidir con el del Panel Ejecutivo — que es
la propiedad que más importa para que nadie pierda confianza en el tablero.

### 2. Los "Finalizados" → **la premisa cambió, ver §2/A2** ⚠

Esta decisión se tomó sobre un diagnóstico mío equivocado. Lo verificado el 10.09:

- Los **73 Finalizados del Panel Ejecutivo están bien**. Los 13 que yo había
  señalado son legítimos: son hitos de texto que dicen "SI", "Finalizado",
  "Presentado", sobre indicadores llamados "Campaña realizada" o "Registro
  elaborado". No hay nada que mover a En ejecución.
- El bug real está en la **pantalla Proyectos**, que usa otra fórmula y llama
  Finalizado a todo lo que pasa el 70 %: **132 en verde, 60 de ellos por debajo
  del 100 %, y 55 entre el 70 % y el 99 %**. Eso es literalmente lo que reportó
  el cliente.
- El arreglo es unificar la fórmula, no cambiarle el estado a 13 proyectos.
- La segunda mitad de la decisión (mandarle a cada director sus indicadores sin
  objetivo) **sigue valiendo pero es mucho más chica**: de 431 sin objetivo, solo
  **52 son numéricos**. En los 379 de texto, no tener objetivo numérico es lo
  correcto para un hito.

**Queda por confirmar con Lucas:** si se unifica la fórmula (recomendado) o si
hay que consultar al cliente antes, porque el número que ve en la lista cambia
mucho.

### 3. Indicadores y Estructura → **fuera del menú, la pantalla de detalle queda viva** ✔

Confirmado por Planificación por WhatsApp el 10.09 a las 9:39:

> "Dale, nos sirve. Habíamos pensado mover toda la función de la herramienta
> indicadores a proyectos, porque desde proyectos se editan las metas también.
> Pero me gusta tu propuesta."

Y repreguntaron, con razón:

> "Si lo sacás del menú y dejás la pantalla del detalle viva para que el click
> funcione, ¿desde dónde lo editaremos?"

**Respuesta pendiente de enviar.** Está en preparación con el mapa de qué ofrece
hoy cada pantalla, porque la respuesta honesta depende de si hay alguna función de
la herramienta actual que no tenga lugar natural dentro de Proyectos. Si hay
alguna, se dice, no se tapa.

### 4. Avisos → **correo ahora, SMS después** ✔

Se implementa el correo. El SMS queda documentado como "se puede sumar después".
Razón: los 73 usuarios tienen correo cargado y ninguno tiene celular, así que el
correo funciona desde el día uno y el SMS arrancaría con una campaña de carga de
datos más un costo por mensaje.

### 5. Contraseñas → **reset por correo** ✔

Cada usuario pide "olvidé mi contraseña", recibe un enlace y la cambia solo.
Planificación tiene un botón para dispararle ese correo a quien lo necesite.
Nadie —ni nosotros— ve ni escribe la contraseña de otro en el medio.

---

## 12. Lo que sigue abierto

**Imprimir reportes (D7): cerrado el 10.09 sin necesidad de preguntar.** El botón
no tiene ningún control de rol y Planificación ya imprime todo. Lo que falla es
que a quien puede editar se le imprimen los cuadros de texto editables en vez del
texto limpio. Detalle y arreglo en §5/D7.

**POA 2027 (bloque G).** Sin definir si entra en este lote. **Default asumido:
queda para después del 25 de septiembre**, para no arriesgar el reporte
trimestral. Si el cliente lo necesita antes, hay que decidir qué se corre de
lugar.

**Para Planificación**, junto con las 8 preguntas del Plan Rector y las 6 del
reporte que siguen sin respuesta:

- Los **colores de cada ámbito**: dicen que están en el sheets, pero el archivo
  que nos pasaron no los traía.
- Si la **aclaración de que se trabaja con datos de 2026** va en la pantalla del
  Plan Rector o solo en el reporte.
