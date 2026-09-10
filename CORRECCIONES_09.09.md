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

### A2. Trece proyectos dicen "Finalizado" sin estar al 100 % (párrafo 721)

> "Todavía hay proyectos marcados como Finalizados (en verde), cuando tienen un
> porcentaje de avance mayor al 80%. […] este dato (72) sería incorrecto."

**Confirmado, medido el 10.09:**

| | |
|---|---|
| Proyectos que el sistema marca Finalizados | **73** |
| De esos, con todos sus indicadores realmente al 100 % | **60** |
| **Marcados Finalizados sin estarlo** | **13** |

La causa no es solo el umbral. Son dos cosas encadenadas:

1. [`actions.ts:219`](src/lib/actions.ts#L219) guarda el `estado_semaforo` del
   indicador como **verde desde el 80 %**. Como semáforo eso es razonable: dice
   "va bien".
2. Pero **357 de los 1404 indicadores vivos (25 %) no tienen `valor_objetivo`
   cargado**, así que el sistema no puede calcular su avance real. En ese caso
   [`avanceIndicador`](src/lib/utils.ts#L287) usa el semáforo guardado como
   sustituto, y traduce **verde → 100**.

Resultado: un proyecto cuyo único indicador está al 85 % del objetivo llega a un
promedio de 100 y sale "Finalizado — completados al 100 %".

Ejemplos reales: *Indumentaria institucional* dice 100 % y sin ese atajo da 75 %.
*Registro de Autoridades Protocolares* dice 100 % y da 50 %.

**Y hay un problema debajo del problema:** en **11 de los 13**, el único
indicador no tiene objetivo, así que **no se puede saber su avance real**. No es
que el sistema calcula mal: es que no tiene con qué calcular. Sacarlos de verde
es correcto, pero hay que decidir a qué estado van. **Decidido en §11.2:** pasan a
En ejecución, y cada director recibe la lista de sus indicadores sin objetivo.

### A3. Los avisos no se van al marcarlos como leídos (párrafo 765)

> "Los avisos cuando uno toca el tilde o la opción de marcar todo como leído, no
> desaparece y dificulta la vista del buscador por área."

Es de la campanita que hicimos el 24.08. Marcar como leído guarda la fecha pero
la lista sigue mostrando el aviso. **Arreglo:** que los leídos salgan de la
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
| C2 | Borrar el botón "+ cargar avance" (hoy no hace nada) | 711 |
| C3 | **Eliminar la herramienta Indicadores** | 713 |
| C4 | **Eliminar Estructura** del tablero | 713 |
| C5 | Click en un indicador desde Proyectos lleva a su detalle | 768 |
| C6 | Los directores ven: Panel Ejecutivo, Proyectos, Avance por Dirección, Reportes, Agenda, POA 2027 | 717 |

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

Sobre D6: coincide con lo que ya habíamos marcado — el sistema pinta "No
iniciado" en rojo (`--color-info: #EF4444`, fijado el 30.07 por pedido suyo) y la
plantilla usaba el círculo azul. Queda todo rojo.

Sobre D7: hoy el botón de imprimir aparece para cualquiera que vea el reporte, y
Planificación ve todos, así que la falla no está donde parece. Sigue abierto: ver §12.

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
| **2** | A2 (los 13 Finalizados) + A3 (avisos leídos) | Números incorrectos que ya vieron, en la pantalla que más se mira | ~4 h |
| **3** | Bloque D completo (reportes) | El reporte tiene fecha del 25 y son todos cambios chicos | ~1 día |
| **4** | Bloque C (unificar Proyectos e Indicadores) | Es el cambio de estructura más grande que sí podemos hacer sin esperar | ~2 días |
| **5** | Bloque B (Plan Rector, ahora desbloqueado) | Ya tenemos la definición que faltaba | ~2 días |
| **6** | F (contraseñas) + H (fecha de carga) | Chicos y sueltos | ~medio día |
| **7** | E (avisos por correo) | Ya decidido el canal (§11.4) | ~1 día |
| **8** | G (POA 2027) | Después del 25, es un proyecto en sí mismo | ~1 semana |

Las etapas 1 a 3 primero porque son las que están mal a la vista de los usuarios
hoy. El bloque G queda para después del reporte trimestral a propósito.

---

## 11. Decisiones tomadas

Respondidas el 10.09. Las que quedan abiertas están al final.

### 1. El porcentaje de cada ámbito → **promedio simple** ✔

El porcentaje de un ámbito es el promedio de avance de los proyectos imputados a
ese ámbito, sin ponderar por cantidad. Es lo que ya hace el resto del sistema, así
que el número del Plan Rector va a coincidir con el del Panel Ejecutivo — que es
la propiedad que más importa para que nadie pierda confianza en el tablero.

### 2. Los 13 falsos "Finalizados" → **a En ejecución, y se ataca la causa** ✔

Dos cosas, no una:

1. Los 13 dejan de figurar Finalizados y pasan a **En ejecución**. No se inventa
   un estado nuevo: la lista de estados es la que el cliente conoce.
2. Cada director recibe la **lista de sus indicadores sin objetivo cargado** para
   que los complete. Son 357 de 1404 (25 %), así que esto no es un detalle de
   estos 13 proyectos: es un cuarto del POA midiéndose sin vara.

Sin el punto 2 el arreglo tapa el síntoma: los proyectos salen de verde pero su
avance sigue siendo indeterminable.

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

**Imprimir reportes (D7).** Hay que preguntarle a Planificación **qué vieron
exactamente** cuando el botón no les apareció. Hoy el botón está para cualquiera
que vea el reporte, y Planificación ve todos, así que la falla no está donde
parece. Sospecha: estaban en un reporte cuyo análisis todavía era borrador y lo
que faltaba era el bloque del análisis, no el botón. Mientras no haya respuesta,
el arreglo se hace defensivo: se revisa el gate igual y se deja explícito que
Planificación imprime borrador y publicación.

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
