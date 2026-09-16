# MAERSK Storage Cost Dashboard

Aplicación web estática (HTML + CSS + JavaScript) para calcular, analizar y proyectar
los costos de almacenamiento del operador logístico MAERSK, a partir de las planillas
Excel de inventario (hoja `INVENTARIO`).

Todo el procesamiento ocurre **en el navegador del usuario**. Los archivos Excel
nunca se suben a un servidor, API o base de datos externa.

## Objetivo

Responder rápidamente preguntas como:

- ¿Cuánto llevamos gastado en almacenamiento?
- ¿Cuánto corresponde al período de facturación actual?
- ¿Cuánto costará llegar al próximo cierre?
- ¿Cuántos m² estamos ocupando y qué HU generan más costo?
- ¿Cuánto ahorraríamos si retiramos cierto número de HU?
- ¿Qué diferencias/inconsistencias existen en los datos de inventario?

## Características

- Pestaña **Facturación** (vista reducida): tabla por período de facturación con
  **Inbound**, **Outbound** y **Almacenamiento** en CLP, en el mismo formato usado
  para conciliar contra la factura de MAERSK. Se abre automáticamente al cargar
  ambas planillas.
- Carga y reemplazo de **dos planillas Excel** (drag & drop o selector de archivo).
- Detección automática de la hoja `INVENTARIO` y de la fila de encabezados (no asume
  una fila fija; tolera columnas con nombres levemente distintos entre planillas, p.ej.
  `PRODUCTO` vs `SKU`, `CADUCIDAD` vs `VENCIMIENTO`).
- **Consolidación por HU única**: una HU puede tener varias filas (distintos lotes,
  productos o cantidades); solo se cobra almacenamiento **una vez por HU**.
- Valor UF **editable manualmente** (con fecha UF), independiente del contenido de los Excel.
- Ciclo de facturación **día 28 → día 27** del mes siguiente.
- Días acumulados vs. días del período de facturación (dos funciones separadas).
- Fecha de corte y fecha de proyección configurables.
- Proyección de costos con botones rápidos (cierre actual, próximo cierre, +30/60/90 días).
- Simulador de costos y simulador de "qué pasa si retiro X HU".
- Panel de **Calidad de Datos**: detecta HU duplicadas, fechas inconsistentes, HU sin
  `DATE INBOUND`, HU despachadas sin `DATE OUTBOUND`, HU en ambos archivos, etc. — sin
  eliminar ningún dato automáticamente.
- 10 gráficos (Chart.js) que responden a los filtros activos.
- Tabla de detalle por HU con búsqueda, orden y paginación.
- Exportación a CSV / JSON (detalle, resumen por período, inconsistencias, proyección)
  y exportación del dashboard a PDF (impresión del navegador).
- Parámetros (UF, fechas, tarifa, metodología) persistidos en `localStorage` — el
  inventario (Excel) **nunca** se guarda; hay que volver a cargarlo en cada sesión.

## Arquitectura

Aplicación 100% estática, sin build ni backend:

```
maersk-storage-dashboard/
├── index.html              # Único punto de entrada
├── css/styles.css          # Estilos (diseño corporativo/operaciones)
├── js/
│   ├── config.js           # Configuración central y persistencia (localStorage)
│   ├── format.js           # Formato CLP/UF/fechas, utilidades de fecha en UTC
│   ├── excel.js             # Lectura Excel (SheetJS), detección de encabezados
│   ├── consolidate.js       # Consolidación de HU únicas + calidad de datos
│   ├── calculations.js      # Ciclo de facturación, días, tarifas, KPIs, proyección
│   ├── charts.js             # 10 gráficos Chart.js
│   ├── tables.js             # Tabla de detalle, calidad de datos, resumen por período
│   ├── exports.js            # Exportación CSV/JSON/PDF
│   └── app.js                 # Orquestación: pestañas, eventos, recalculateAll()
├── data/example.json        # Ejemplo del JSON normalizado (datos ficticios)
└── .gitignore                # Excluye *.xlsx/*.xls/*.csv del repositorio
```

Librerías (CDN, sin instalación):

- [SheetJS / xlsx](https://sheetjs.com/) — lectura de archivos Excel en el navegador.
- [Chart.js](https://www.chartjs.org/) — gráficos.

No se utiliza Flask, Django, Node como servidor, backend en Python, bases de datos
externas ni APIs privadas.

## Cómo usar

1. Abre `index.html` (localmente o en GitHub Pages).
2. En la pestaña **Actualizar Inventario**, carga la **Planilla 1** y la **Planilla 2**
   (botón o arrastrando el archivo).
3. La aplicación detecta la hoja `INVENTARIO`, normaliza las columnas y consolida
   ambas planillas por HU única automáticamente.
4. En la barra superior **VALOR UF DEL CÁLCULO**, ingresa la fecha UF y el valor UF
   que quieres usar, y presiona **RECALCULAR CON ESTA UF**.
5. Ajusta la **fecha de corte** y la **fecha de proyección** según necesites.
6. Explora el **Dashboard** (KPIs, gráficos, proyección), el **Detalle** por HU, el
   **Resumen por período**, la **Calidad de datos** y el **Simulador**.
7. Exporta los resultados que necesites (CSV/JSON/PDF).

### Reemplazar las planillas

En cualquier momento puedes volver a la pestaña **Actualizar Inventario** y usar
"Cargar / reemplazar archivo 1/2". La aplicación valida el nuevo archivo (hoja
`INVENTARIO`, encabezados) antes de reemplazar la versión anterior en memoria: si el
nuevo archivo tiene un error, se mantiene la planilla anterior y se muestra el mensaje
de error. Al reemplazar exitosamente, **todo** se recalcula automáticamente (HU,
fechas, costos, m², proyecciones, KPIs, tablas, gráficos y calidad de datos).

## Lógica de negocio

### Unidad de almacenamiento

- `1 HU = 1,8 m²`.
- Una misma HU puede aparecer en varias filas del Excel (distintos lotes, productos,
  cantidades). Esas filas se **consolidan en una sola HU** para efectos de ocupación
  y costo; el detalle de productos/lotes se conserva para el desglose.

### Tarifa

- Almacenamiento Warehouse: `0,26 UF / m² / mes`.
- Tarifa mensual por HU: `1,8 × 0,26 = 0,468 UF/HU/mes`.
- Tarifa diaria (mes comercial de 30 días): `0,468 / 30 = 0,0156 UF/HU/día`.
- El **valor UF es siempre editable** en la aplicación; los costos en UF nunca cambian
  al modificar el valor UF, solo cambian los montos en CLP.

### `DATE INBOUND`, `DATE PICKING`, `DATE OUTBOUND`

- `DATE INBOUND`: inicio del almacenamiento de la HU.
- Fecha de fin (histórica), en orden de prioridad: `DATE OUTBOUND` → `DATE PICKING` →
  fecha de corte.
- Para el cálculo histórico, la fecha de fin efectiva es siempre
  `mínimo(fecha_fin_real, fecha_de_corte)`. Si `DATE INBOUND` es posterior a la fecha
  de corte, la HU no genera costo.

### Ciclo de facturación (día 28 → 27)

El día 28 de cada mes es el **día 0** del nuevo período de facturación. Por ejemplo:

- Período septiembre: `28-08-2026 → 27-09-2026`
- Período octubre: `28-09-2026 → 27-10-2026`

La lógica está centralizada en `getBillingPeriod()` (`js/calculations.js`). La pestaña
**Pruebas de Cálculo** de la aplicación muestra en vivo el resultado de evaluar los
días 27, 28 y 29 de un mes, para validar que no hay errores de +1 día.

### Dos tipos de días

- **Días acumulados**: desde `DATE INBOUND` hasta la fecha de fin efectiva (sin
  restringir al período de facturación actual).
- **Días del período**: solo los días que caen dentro del período de facturación
  seleccionado (intersección entre la estadía de la HU y `[período.start, período.end]`).

Ambas se calculan con funciones separadas (`calculateAccumulatedDays` y
`calculatePeriodDays`) para que sean fáciles de auditar por separado.

### Metodología de días

- **A) Mes comercial de 30 días** (por defecto): la tarifa diaria siempre se calcula
  como `tarifa mensual / 30`, independientemente de cuántos días reales tenga el mes o
  el período.
- **B) Días reales del período**: para el costo del período, la tarifa diaria se
  recalcula como `tarifa mensual / (días reales del período de facturación)`.

### Facturación por período (vista reducida)

Muestra, por cada período de facturación (día 28 → 27), tres montos en CLP:

- **Inbound**: `(HU con DATE INBOUND dentro del período) × 0,076 UF/pallet × valor UF`
  (tarifa "Ingreso carga paletizada - Inbound" de la Tabla N°1 de servicios Warehouse).
- **Outbound**: `(HU con DATE OUTBOUND dentro del período) × 0,076 UF/pallet × valor UF`
  (tarifa "Despacho carga Paletizada - Outbound").
- **Almacenamiento**: el mismo costo del período calculado en el resto de la app
  (días del período × tarifa diaria × valor UF).

Ambas tarifas (Inbound/Outbound) son editables en **Configuración**. Como la hoja
`INVENTARIO` no siempre trae un número de pallet confiable por fila, se asume
**1 HU = 1 unidad facturable** para Inbound/Outbound; si tu operación cuenta pallets
de forma distinta a las HU, ajusta la tarifa o pide agregar el conteo real de pallets.

El primer período de la lista muestra como fecha de inicio la fecha real de la
primera HU ingresada (no el día 28 teórico) cuando no había nada almacenado antes de
esa fecha, igual que en una factura real.

### Proyección

Para las HU activas a la fecha de corte, se calcula el costo real acumulado hasta el
corte y se le suma el costo adicional proyectado hasta la fecha de proyección
seleccionada (con botones rápidos: cierre actual, próximo cierre, +30/+60/+90 días, o
fecha personalizada).

## Ejecutar localmente

No requiere instalación ni servidor. Basta con abrir `index.html` en el navegador
(doble clic, o "Abrir con" tu navegador). También puedes servirlo con cualquier
servidor estático simple, por ejemplo:

```bash
npx serve .
```

## Publicar en GitHub Pages

1. Sube el proyecto a un repositorio de GitHub (rama `main`).
2. En **Settings → Pages**, selecciona **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. La aplicación queda disponible en `https://<usuario>.github.io/<repositorio>/`.

Todas las rutas del proyecto son relativas (`./css/...`, `./js/...`), por lo que
funciona igual en local y en GitHub Pages.

## Privacidad

- Los archivos Excel de inventario **no se incluyen en el repositorio** (`.gitignore`
  excluye `*.xlsx`, `*.xls`, `*.csv`).
- Los Excel cargados por el usuario se procesan solo en memoria del navegador; no se
  envían a GitHub, servidores externos ni APIs.
- No hay tokens, contraseñas ni credenciales en el código.

## Evolución futura

La arquitectura deja espacio para agregar, sin romper lo existente, una sección de
**Validación de Factura MAERSK** (comparación: cobro MAERSK vs. cálculo interno vs.
diferencia), reutilizando `calculateHUCost()` y `calculatePeriodSummary()` como base.
