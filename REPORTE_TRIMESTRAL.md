# Reporte trimestral de cumplimiento — plan de trabajo

**Fecha del pedido:** 1 de septiembre de 2026 (sección fechada "1/1/26" en el documento, por la secuencia debería ser 1/9)
**Documento fuente:** `Modificaciones PLANIA (1).docx`, párrafos 560 a 694
**Rama:** `lucas`
**Fecha comprometida por el cliente:** **viernes 25 de septiembre de 2026**

---

## 0. Qué piden

Del mensaje de contexto (el texto en magenta del documento):

> "Cada 3 meses nosotros tenemos que hacer un reporte a cada secretaría/subsecretaría
> y dirección sobre el monitoreo de sus poas. La idea es que ese reporte se descargue
> desde el PLANIA directamente para evitar errores humanos de interpretación y tipeo."

> "Nosotros en la primera semana de octubre ya tenemos que tener todos los informes
> presentados. Por eso quería consultarles si existe alguna posibilidad de resolver
> hasta el viernes 25 de sept."

Adjuntaron la plantilla completa del reporte, con cinco bloques:

| Bloque | Contenido | ¿De dónde sale? |
|---|---|---|
| 1 | Desempeño de la Secretaría en el contexto municipal + gráfico de torta | **Bloqueado** — falta la fórmula |
| 2 | Estado general de proyectos: Total / Finalizados / En Ejecución / No Iniciados / Sin Datos | PlanIA, ya lo calcula |
| 4 | Desempeño operativo por áreas: la misma tabla por subsecretaría y dirección, más "Índice de Carga" y fila TOTAL | PlanIA, salvo el Índice de Carga |
| 3 | Análisis de gestión: tres campos que completa Planificación | Se escriben en PlanIA |
| Anexo | Marco metodológico, texto fijo igual para todos | Texto fijo |

> Los bloques están numerados 1, 2, 4, 3 en el documento original. No es un error de
> lectura: la plantilla los tiene así. Se respeta el orden en que aparecen, no la
> numeración.

**Decidido el 1.09:** los tres campos de análisis se escriben **dentro de PlanIA** y
el reporte **baja en PDF**. Y el reporte tiene prioridad sobre la etapa 5 del Plan
Rector, que queda esperando las 9 definiciones.

---

## 1. El problema que bloquea el bloque 1

El texto de la plantilla dice:

> "El modelo de evaluación establece una distribución equitativa del 100% de la
> planificación entre las 8 Secretarías que integran el Gabinete, asignando a cada
> área una responsabilidad comprometida del 12.5%."

Pero el gráfico de ejemplo (Secretaría de Ambiente) muestra un **aporte real del 17,1 %**.

**Con ese modelo, 17,1 % es imposible.** Si el techo de cada secretaría es 12,5,
ninguna puede aportar más que eso ni cumpliendo al 100 %. Para llegar a 17,1 %,
Ambiente tendría que estar al 137 %.

Se intentó reconstruir el número desde la base, por si venía de otra cuenta:

| Peso de Ambiente sobre el municipio | Resultado |
|---|---|
| Proyectos (51 de 441) | 11,6 % |
| Metas (62 de 789) | 7,9 % |
| Indicadores (219 de 1404) | 15,6 % |

Ninguno da 17,1 %. El **67 % "Cumplido"** del gráfico sí es compatible con la fórmula
que ya usa el Panel Ejecutivo (`avanceGlobalPorConteo`), que al 1.09 da **63 %** —
probablemente el gráfico se hizo otro día. Pero el 17,1 % no sale de ninguna cuenta
reconstruible.

**La fórmula del aporte tiene que venir de Planificación.** Es el número que encabeza
el reporte y el que va a citar cada secretario.

---

## 2. Lo verificado contra la base (1.09.2026)

### Resuelto: sí se pueden filtrar los proyectos propios de la secretaría

Preguntaban:

> "Hay secretarías que tienen coordinaciones que no figuran así dentro del PLANIA…
> deberíamos sumar una fila que diga proyectos propios de la secretaría. Lo que no sé
> es si ustedes lo van a poder filtrar."

**Sí.** Un proyecto propio de la secretaría es el que tiene `proyecto.unidad_id` igual
al id de la secretaría, en vez de una dirección. Y son pocos:

| Secretaría | Proyectos propios |
|---|---|
| Ambiente y Desarrollo Sustentable | 19 |
| Contaduría General | 9 |
| Las otras ocho | 0 |

Confirmado además que **no existe ninguna unidad de tipo "coordinación"** en PlanIA
(0 filas), así que la fila extra que proponen es la solución correcta.

### Las secretarías sin subsecretaría son la mayoría, no la excepción

Su nota decía "suponiendo que la secretaría no tenga subsecretarías, como por ejemplo
Ambiente, deberíamos cambiar de subsecretaría directamente a dirección". Medido:
**6 de 10 secretarías no tienen ninguna subsecretaría.** Hay 9 subsecretarías en total
y 4 unidades de nivel 3 (departamentos). La tabla tiene que soportar las dos formas
por defecto.

### PlanIA tiene 10 secretarías, el modelo dice 8

| Código | Secretaría | Proyectos |
|---|---|---|
| SEC01 | Secretaría General | 217 |
| SEC02 | Gobierno | 60 |
| SEC03 | Innovación Tecnológica | 35 |
| SEC04 | Ingresos Municipales | 9 |
| SEC05 | Contaduría General | 9 |
| SEC06 | Atención Ciudadana | 8 |
| SEC07 | Ambiente y Desarrollo Sustentable | 51 |
| SEC08 | Servicios Públicos | 40 |
| SEC09 | Ordenamiento y Convivencia | 12 |
| SEC10 | Movilidad Urbana | **0** |

Hipótesis: las 8 del Gabinete excluyen Contaduría General (no es secretaría) y
Movilidad Urbana (es nueva y no tiene proyectos cargados). **Hay que confirmarlo: el
12,5 % depende del denominador.**

### Las cuatro columnas de estado ya existen

`estadoDeAvance()` en [`src/lib/utils.ts:276`](src/lib/utils.ts#L276) ya clasifica.
Al 1.09, sobre los 441 proyectos activos:

| Estado | Proyectos |
|---|---|
| 🟢 Finalizados (verde) | 71 |
| 🟡 En Ejecución (amarillo) | 208 |
| 🔵 No Iniciados (rojo) | 160 |
| ⚪ Sin Datos | 2 |

> Detalle cosmético: la plantilla usa 🔵 para "No Iniciados" y PlanIA lo pinta en
> **rojo** (`--color-info: #EF4444`, fijado el 30.07 por pedido del cliente). Hay que
> alinear el color del reporte con el del sistema, o el mismo dato se va a ver de dos
> colores distintos en la misma reunión.

---

## 3. Dos problemas de fondo

### 3.1 No se puede reconstruir un corte trimestral pasado

`indicador_historial` arranca el **31 de julio de 2026** y cubre **229 de 1896
indicadores** (441 filas en total). O sea:

- **Sirve** para el tercer trimestre si el reporte se genera a fin de septiembre o
  la primera semana de octubre: el estado actual es prácticamente el del corte.
- **No sirve** para reconstruir "cómo estaba al 30 de junio".
- **No va a servir** para el cuarto trimestre si el reporte se genera en enero.

**Por eso la etapa 1 del plan es guardar una foto en cada corte, y tiene que estar
andando antes del 30 de septiembre.** Es la única parte con una fecha más apretada que
la del entregable: si el 30 de septiembre pasa sin foto, el reporte del tercer
trimestre queda atado a generarse esa misma semana y para siempre.

### 3.2 Hay tres universos distintos de "los proyectos del período"

Según se filtre por proyecto activo, por meta viva o por indicador vivo, los totales
no son subconjuntos consistentes: 441 proyectos activos, 789 metas vivas bajo esos
proyectos, 1404 indicadores vivos bajo esas metas — pero hay 1896 indicadores vivos en
total, o sea **492 cuelgan de metas o proyectos que ya no están activos**.

Para un reporte que firma Planificación y llega a un secretario, hay que fijar **un
solo** universo y usarlo en todo el documento. Si no, la suma de la tabla del bloque 4
no va a coincidir con el total del bloque 2, y el reporte pierde credibilidad en la
primera lectura.

**Propuesta:** el universo del reporte es `proyecto.deleted_at IS NULL AND
proyecto.estado = 'activo' AND proyecto.periodo_id = <período>`, y todo lo demás
cuelga de ahí. Es el mismo criterio del Panel Ejecutivo.

---

## 4. Formato de salida: la decisión técnica

Se decidió PDF. Hay dos caminos y la diferencia importa por la fecha:

| | Página lista para imprimir | PDF armado en el servidor |
|---|---|---|
| **Cómo** | Una pantalla con hoja A4 y `@media print`; el usuario hace Imprimir → Guardar como PDF | Un endpoint que devuelve el `.pdf` |
| **El gráfico de torta** | SVG en línea, sale gratis y perfecto | Hay que rasterizarlo o dibujarlo con una librería de PDF |
| **Riesgo en producción** | Ninguno: es una página más | Alto: Chromium en Vercel roza el límite de tamaño de función |
| **Esfuerzo** | ~1 día | ~3 a 4 días, con riesgo de no cerrar |
| **Fidelidad** | La misma: el PDF lo genera el navegador | La misma |

**Recomendación: arrancar por la página lista para imprimir.** Es un clic más para el
usuario (Imprimir → Guardar como PDF) y a cambio llega seguro al 25 de septiembre, sin
tocar la infraestructura de despliegue. Si después quieren el botón "Descargar PDF" de
verdad, se agrega encima sin rehacer nada: el HTML ya está.

---

## 5. Plan por etapas

| # | Qué | Depende del cliente | Esfuerzo | Fecha tope propia |
|---|---|---|---|---|
| **1** | **Foto del corte trimestral.** Tabla `corte_trimestral` + `corte_trimestral_detalle` con el estado de cada proyecto/meta/indicador al momento del corte, y un job que la toma. Idempotente por (período, trimestre). | no | ~1 día | **antes del 30.09** |
| **2** | Capa de datos del reporte: el árbol de la secretaría con las 4 columnas por unidad, la fila de proyectos propios, y los totales. Un solo universo de proyectos. | no | ~1,5 días | — |
| **3** | Los tres campos de análisis: tabla `reporte_analisis` por (secretaría, trimestre), con RLS para que los escriba solo `admin_funcional`, y su historial. | no | ~1 día | — |
| **4** | Pantalla `/reportes`: elegir secretaría y trimestre, ver el reporte en pantalla, escribir los tres campos, imprimir. Con el anexo metodológico fijo. | no | ~2 días | — |
| **5** | Bloque 1: el porcentaje de aporte y el gráfico de torta | **sí — preguntas 1 y 2** | ~1 día | — |
| **6** | Columna "Índice de Carga" | **sí — pregunta 3** | ~medio día | — |
| **7** | Reportes de subsecretaría y de dirección (el mismo reporte, otro alcance) | no | ~1 día | — |

**Se puede construir todo menos las etapas 5 y 6 sin ninguna respuesta.** Y son las
dos más chicas: entre las dos, un día y medio. La estrategia es dejar los dos huecos
marcados en la pantalla ("falta la definición de Planificación") y taparlos el día que
contesten.

---

## 6. Preguntas para Planificación

Las cuatro primeras bloquean parte del reporte. Las dos últimas son para no equivocar
el alcance.

1. **¿Cómo se calcula el "aporte real" de una secretaría al consolidado municipal?**
   Con 8 secretarías a 12,5 % cada una, el 17,1 % del ejemplo de Ambiente es
   matemáticamente imposible: el techo por secretaría es 12,5. Necesitamos la cuenta,
   o que confirmen que el número del ejemplo está mal.
   *Bloquea:* el bloque 1 completo, que es el que encabeza el reporte.

2. **¿Cuáles son las 8 secretarías del Gabinete?** PlanIA tiene 10 unidades de primer
   nivel. Suponemos que quedan afuera Contaduría General y Movilidad Urbana, pero el
   12,5 % sale de ese denominador.
   *Bloquea:* el bloque 1.

3. **¿Qué es el "Índice de Carga"?** Es una columna de la tabla del bloque 4 y no está
   definida. Nuestra lectura es que mide qué proporción de los proyectos del área
   tiene datos cargados —o sea, lo contrario de "Sin Datos"— pero es una suposición.
   *Bloquea:* una columna.

4. **¿A qué fecha corta el trimestre?** ¿Al 30 de septiembre, o al día en que se
   genera el reporte? Importa porque hoy no podemos reconstruir el pasado: si el corte
   es el 30, necesitamos dejar el sistema tomando la foto ese día.

5. **El reporte va a secretaría, subsecretaría y dirección. ¿Los tres campos de
   análisis se escriben una vez por secretaría, o uno por cada área?** Son 10
   secretarías, 9 subsecretarías y 56 direcciones: la diferencia es escribir 30 textos
   o 225.

6. **¿El gráfico de torta va en los tres niveles, o solo en el de secretaría?** El
   modelo del 12,5 % es entre secretarías; no hay un equivalente definido para
   comparar direcciones entre sí.

---

## 7. Sobre la fecha

Del 1 al 25 de septiembre hay 18 días hábiles. Las etapas 1 a 4 y 7 suman ~6,5 días de
trabajo y no dependen de nadie. Las etapas 5 y 6 suman 1,5 días y dependen de las
respuestas.

**Llega, con margen** — siempre que las cuatro preguntas bloqueantes se contesten
antes del 15 de septiembre. Si llegan después, se entrega el reporte completo con los
dos huecos marcados y se cierra en cuanto contesten.

Lo único que no admite corrimiento es la **etapa 1 antes del 30 de septiembre**.
