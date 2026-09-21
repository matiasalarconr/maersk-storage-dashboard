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
- **FECHA_INICIAL_COBRO configurable** (Día 1 del cobro para todas las HU, no se usa
  `DATE INBOUND`). Fecha de salida = Picking/Despacho más temprano, o "hoy" si la HU
  sigue almacenada.
- Ciclo **día 28 → día 27** del mes siguiente para agrupar ingresos/salidas por período
  y calcular la próxima factura.
- Fecha de corte (hoy) y fecha de proyección configurables.
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

**Toda la app usa una única fuente de verdad para el costo de almacenamiento:**
`MSD.calcularAlmacenamientoHU()` en `js/calculations.js`. Ningún otro lugar del
código recalcula el costo de otra manera (KPIs, tabla de Detalle, Facturación,
antigüedad, proyección y gráficos "por día" consumen esa misma función).

### Unidad de almacenamiento

- `1 HU = 1,8 m²`.
- Una misma HU puede aparecer en varias filas del Excel (distintos lotes, productos,
  cantidades). Esas filas se **consolidan en una sola HU** para efectos de ocupación
  y costo; el detalle de productos/lotes se conserva para el desglose.

### FECHA_INICIAL_COBRO — no se usa DATE INBOUND para iniciar el cobro

El cobro de almacenamiento **no** empieza a contar desde `DATE INBOUND` de cada HU.
Existe un único parámetro configurable, `FECHA_INICIAL_COBRO` (por defecto
`27-08-2026`), que es el **Día 1** del cobro para todas las HU por igual. Es editable
en la barra de parámetros y en **Configuración**.

### Fecha de salida (fin del cobro) por HU

1. Si la HU tiene `DATE PICKING` válida → candidata.
2. Si tiene `DATE OUTBOUND` (despacho) válida → candidata.
3. Si existen ambas, se usa **la más temprana** (la primera señal real de que el
   producto dejó de estar almacenado).
4. Si no existe ninguna, la HU **sigue almacenada** y se usa la fecha de corte (hoy)
   como fin de cálculo. Al presionar "Recalcular" o el botón **Hoy**, esto se
   actualiza a la fecha actual.

### Cálculo de días y costo

```
dias = 0                                  si fecha_final < FECHA_INICIAL_COBRO
dias = (fecha_final − FECHA_INICIAL_COBRO) + 1   en caso contrario  (FECHA_INICIAL_COBRO = Día 1)

costo_HU = 1,8 m² × dias × tarifa_diaria_m2
tarifa_diaria_m2 = (tarifa_UF_m2_mes / mes_comercial_dias) × valor_UF
```

Ejemplo validado en la pestaña **Pruebas de Cálculo**: HU con `FECHA_INICIAL_COBRO`
27-08-2026 y Picking 30-08-2026 → 4 días (27, 28, 29, 30) × 1,8 m² × tarifa diaria.

### Validaciones

- Días nunca negativos; si la fecha de salida es anterior a `FECHA_INICIAL_COBRO`,
  el costo es 0.
- Fechas vacías/inválidas se tratan como ausentes (no rompen el cálculo).
- El cálculo nunca modifica los datos originales del Excel; trabaja siempre sobre
  una capa derivada (HU consolidadas + resultado de `calcularAlmacenamientoHU`).
- La suma de los costos individuales de todas las HU siempre es igual al costo total
  mostrado en los KPIs (verificado en las pruebas contra datos reales).

### Ciclo 28 → 27 (solo para agrupar/etiquetar, no para calcular el cobro)

El ciclo de facturación día 28 → 27 se sigue usando para **agrupar** ingresos/salidas
de HU por período (pestaña **Resumen por Período**) y para calcular la **próxima
factura** (Situación Actual). El costo de Almacenamiento con la metodología nueva
solo puede calcularse para el período vigente (el que usa `FECHA_INICIAL_COBRO`);
los períodos ya cerrados muestran únicamente ingresos/salidas de HU, porque no existe
una fecha de inicio de cobro válida para reconstruir su costo retroactivamente.

### Facturación por período (vista reducida)

Muestra el período vigente (desde `FECHA_INICIAL_COBRO` hasta hoy) con tres montos
en CLP:

- **Inbound**: `(HU con DATE INBOUND dentro del período) × 0,076 UF/pallet × valor UF`
  (tarifa "Ingreso carga paletizada - Inbound" de la Tabla N°1 de servicios Warehouse).
- **Outbound**: `(HU con DATE OUTBOUND dentro del período) × 0,076 UF/pallet × valor UF`
  (tarifa "Despacho carga Paletizada - Outbound").
- **Almacenamiento**: `calcularAlmacenamientoHU()` sumado sobre todas las HU.

Ambas tarifas (Inbound/Outbound) son editables en **Configuración**. Como la hoja
`INVENTARIO` no siempre trae un número de pallet confiable por fila, se asume
**1 HU = 1 unidad facturable** para Inbound/Outbound.

### Proyección

Para las HU aún almacenadas a la fecha de corte, se toma su costo actual
(`calcularAlmacenamientoHU`) y se le suma el costo adicional proyectado hasta la
fecha de proyección seleccionada (con botones rápidos: cierre actual, próximo
cierre, +30/+60/+90 días, o fecha personalizada), usando la misma tarifa diaria.

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
