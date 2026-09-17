/* ============================================================================
 * app.js — Orquestación: pestañas, carga/drag&drop de archivos, filtros,
 * recalculateAll(), render del dashboard, simulador y configuración.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/* ---------------------------------------------------------------------------
 * TABS
 * -------------------------------------------------------------------------*/
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}
function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
}

/* ---------------------------------------------------------------------------
 * CARGA DE ARCHIVOS (input + drag & drop)
 * -------------------------------------------------------------------------*/

async function handleFile(fileKey, file) {
  if (!file) return;
  const statusEls = fileKey === 'f1'
    ? { name: 'f1Name', state: 'f1State', rows: 'f1Rows', hu: 'f1HU', err: 'f1Error' }
    : { name: 'f2Name', state: 'f2State', rows: 'f2Rows', hu: 'f2HU', err: 'f2Error' };

  document.getElementById(statusEls.name).textContent = file.name;
  document.getElementById(statusEls.state).textContent = 'Procesando...';
  document.getElementById(statusEls.err).textContent = '';

  const result = await MSD.parseExcel(file);
  const slot = MSD.state.files[fileKey];

  if (!result.ok) {
    document.getElementById(statusEls.state).textContent = slot.rows.length ? 'Error (se mantiene versión anterior)' : 'Error';
    document.getElementById(statusEls.err).textContent = result.error;
    return; // no reemplazamos la versión anterior en memoria
  }

  slot.name = file.name;
  slot.rows = result.rows;
  slot.rowCount = result.rows.length;
  slot.huCount = new Set(result.rows.map((r) => r.hu)).size;
  slot.loadedAt = new Date();
  slot.error = null;
  slot.status = 'ok';

  document.getElementById(statusEls.state).textContent = 'Cargado correctamente';
  document.getElementById(statusEls.rows).textContent = slot.rowCount.toLocaleString('es-CL');
  document.getElementById(statusEls.hu).textContent = slot.huCount.toLocaleString('es-CL');
  document.getElementById(fileKey === 'f1' ? 'headerFile1' : 'headerFile2').textContent = file.name;

  MSD.recalculateAll();
  if (MSD.state.files.f1.rows.length && MSD.state.files.f2.rows.length) activateTab('facturacion');
  const msg = document.getElementById('reloadMsg');
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 3500);
}

function setupDropzone(zoneId, inputId, buttonId, fileKey) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  document.getElementById(buttonId).addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFile(fileKey, e.target.files[0]));
  ['dragenter', 'dragover'].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(fileKey, file);
  });
}

function clearFiles() {
  for (const key of ['f1', 'f2']) {
    MSD.state.files[key] = { name: null, loadedAt: null, rowCount: 0, huCount: 0, rows: [], error: null, status: 'vacio' };
  }
  ['f1', 'f2'].forEach((k) => {
    document.getElementById(`${k}Name`).textContent = '—';
    document.getElementById(`${k}State`).textContent = 'Sin cargar';
    document.getElementById(`${k}Rows`).textContent = '—';
    document.getElementById(`${k}HU`).textContent = '—';
    document.getElementById(`${k}Error`).textContent = '';
  });
  document.getElementById('headerFile1').textContent = '—';
  document.getElementById('headerFile2').textContent = '—';
  MSD.recalculateAll();
}

/* ---------------------------------------------------------------------------
 * FILTROS
 * -------------------------------------------------------------------------*/

function getFilteredHU() {
  const f = MSD.state.filters;
  return MSD.state.consolidated.filter((hu) => {
    if (f.estado && MSD.getHUStatus(hu) !== f.estado) return false;
    if (f.producto && hu.producto !== f.producto) return false;
    if (f.location && hu.location !== f.location) return false;
    if (f.fuente && !hu.fuentes.includes(f.fuente)) return false;
    if (f.hu && !hu.hu.toUpperCase().includes(f.hu.toUpperCase())) return false;
    return true;
  });
}

function populateFilterOptions() {
  const productos = new Set(), locations = new Set(), fuentes = new Set();
  for (const hu of MSD.state.consolidated) {
    if (hu.producto) productos.add(hu.producto);
    if (hu.location) locations.add(hu.location);
    hu.fuentes.forEach((f) => fuentes.add(f));
  }
  fillSelect('filterProducto', productos, 'Todos');
  fillSelect('filterLocation', locations, 'Todas');
  fillSelect('filterFuente', fuentes, 'Todas');
}
function fillSelect(id, values, allLabel) {
  const sel = document.getElementById(id);
  const current = sel.value;
  sel.innerHTML = `<option value="">${allLabel}</option>` + [...values].sort().map((v) => `<option value="${v}">${v}</option>`).join('');
  if ([...values].includes(current)) sel.value = current;
}

function initFilters() {
  ['filterEstado', 'filterProducto', 'filterLocation', 'filterFuente'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (e) => {
      const key = id.replace('filter', '').replace(/^./, (c) => c.toLowerCase());
      MSD.state.filters[key] = e.target.value;
      MSD.renderDashboard();
    });
  });
  document.getElementById('filterHU').addEventListener('input', (e) => {
    MSD.state.filters.hu = e.target.value;
    MSD.renderDashboard();
  });
  document.getElementById('btnClearFilters').addEventListener('click', () => {
    MSD.state.filters = { estado: '', producto: '', location: '', hu: '', fuente: '' };
    document.querySelectorAll('.filters-bar select').forEach((s) => (s.value = ''));
    document.getElementById('filterHU').value = '';
    MSD.renderDashboard();
  });
}

/* ---------------------------------------------------------------------------
 * PARÁMETROS DEL CÁLCULO (barra superior)
 * -------------------------------------------------------------------------*/

function syncConfigInputsFromState() {
  const c = MSD.state.config;
  document.getElementById('cfgValorUF').value = MSD.formatNumber(c.valorUF, 2);
  document.getElementById('cfgFechaUF').value = MSD.toInputDate(MSD.parseISODateInput(c.fechaUF));
  document.getElementById('cfgFechaCorte').value = c.fechaCorte ? MSD.toInputDate(c.fechaCorte) : '';
  document.getElementById('cfgFechaProyeccion').value = c.fechaProyeccion ? MSD.toInputDate(c.fechaProyeccion) : '';

  document.getElementById('cfgValorUF2').value = c.valorUF;
  document.getElementById('cfgFechaUF2').value = MSD.toInputDate(MSD.parseISODateInput(c.fechaUF));
  document.getElementById('cfgTarifaUFm2mes').value = c.tarifaUFm2mes;
  document.getElementById('cfgM2PorHU').value = c.m2PorHU;
  document.getElementById('cfgTarifaInbound').value = c.tarifaInboundUF;
  document.getElementById('cfgTarifaOutbound').value = c.tarifaOutboundUF;
  document.getElementById('cfgMesComercial').value = c.mesComercialDias;
  document.getElementById('cfgDiaInicioCiclo').value = c.diaInicioCiclo;
  document.getElementById('cfgFechaCorte2').value = c.fechaCorte ? MSD.toInputDate(c.fechaCorte) : '';
  document.getElementById('cfgFechaProyeccion2').value = c.fechaProyeccion ? MSD.toInputDate(c.fechaProyeccion) : '';
  document.getElementById('cfgMetodologia').value = c.metodologiaDias;
}

function initParamsBar() {
  document.getElementById('btnRecalcularUF').addEventListener('click', () => {
    const val = MSD.parseUFValue(document.getElementById('cfgValorUF').value);
    const errEl = document.getElementById('ufError');
    if (val === null) { errEl.textContent = 'Ingrese un valor UF válido.'; return; }
    errEl.textContent = '';
    MSD.state.config.valorUF = val;
    const fechaUFInput = document.getElementById('cfgFechaUF').value;
    if (fechaUFInput) MSD.state.config.fechaUF = fechaUFInput;
    MSD.persistConfig(MSD.state.config);
    MSD.recalculateAll();
  });
  document.getElementById('cfgFechaCorte').addEventListener('change', (e) => {
    if (!e.target.value) return;
    MSD.state.config.fechaCorte = MSD.parseISODateInput(e.target.value);
    MSD.persistConfig(MSD.state.config);
    MSD.recalculateAll();
  });
  document.getElementById('cfgFechaProyeccion').addEventListener('change', (e) => {
    if (!e.target.value) return;
    MSD.state.config.fechaProyeccion = MSD.parseISODateInput(e.target.value);
    MSD.persistConfig(MSD.state.config);
    MSD.recalculateAll();
  });
  document.getElementById('btnFechaCorteHoy').addEventListener('click', () => {
    MSD.state.config.fechaCorte = MSD.todayUTC();
    MSD.persistConfig(MSD.state.config);
    MSD.recalculateAll();
  });
}

function initConfigTab() {
  document.getElementById('btnGuardarConfig').addEventListener('click', () => {
    const c = MSD.state.config;
    const val = MSD.parseUFValue(document.getElementById('cfgValorUF2').value);
    if (val !== null) c.valorUF = val;
    const fUF = document.getElementById('cfgFechaUF2').value;
    if (fUF) c.fechaUF = fUF;
    c.tarifaUFm2mes = Number(document.getElementById('cfgTarifaUFm2mes').value) || c.tarifaUFm2mes;
    c.m2PorHU = Number(document.getElementById('cfgM2PorHU').value) || c.m2PorHU;
    c.tarifaInboundUF = Number(document.getElementById('cfgTarifaInbound').value) || c.tarifaInboundUF;
    c.tarifaOutboundUF = Number(document.getElementById('cfgTarifaOutbound').value) || c.tarifaOutboundUF;
    c.mesComercialDias = Number(document.getElementById('cfgMesComercial').value) || c.mesComercialDias;
    c.diaInicioCiclo = Number(document.getElementById('cfgDiaInicioCiclo').value) || c.diaInicioCiclo;
    const fc = document.getElementById('cfgFechaCorte2').value;
    if (fc) c.fechaCorte = MSD.parseISODateInput(fc);
    const fp = document.getElementById('cfgFechaProyeccion2').value;
    if (fp) c.fechaProyeccion = MSD.parseISODateInput(fp);
    c.metodologiaDias = document.getElementById('cfgMetodologia').value;
    MSD.persistConfig(c);
    MSD.recalculateAll();
    syncConfigInputsFromState();
  });
}

/* ---------------------------------------------------------------------------
 * RECALCULATE ALL — función central que orquesta todo el pipeline
 * -------------------------------------------------------------------------*/

MSD.recalculateAll = function () {
  const allRows = [...MSD.state.files.f1.rows, ...MSD.state.files.f2.rows];
  MSD.state.consolidated = MSD.consolidateHU(allRows);
  MSD.state.quality = MSD.validateHU(MSD.state.consolidated);

  const config = MSD.state.config;
  if (MSD.state.consolidated.length) {
    let maxInbound = null;
    for (const hu of MSD.state.consolidated) if (hu.dateInbound) maxInbound = MSD.maxDate(maxInbound, hu.dateInbound);
    if (!config.fechaCorte) config.fechaCorte = MSD.todayUTC();
    if (!config.fechaProyeccion) {
      const period = MSD.getBillingPeriod(config.fechaCorte, config.diaInicioCiclo);
      config.fechaProyeccion = period.end;
    }
  }
  MSD.persistConfig(config);
  syncConfigInputsFromState();
  populateFilterOptions();
  MSD.renderDashboard();
  document.getElementById('lastUpdate').textContent = MSD.formatDateTime(new Date());
};

/* ---------------------------------------------------------------------------
 * RENDER DASHBOARD
 * -------------------------------------------------------------------------*/

function kpiCard(label, value, cls) {
  return `<div class="kpi-card ${cls || ''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`;
}

MSD.renderDashboard = function () {
  const hasFiles = MSD.state.files.f1.rows.length > 0 || MSD.state.files.f2.rows.length > 0;
  const hasData = MSD.state.consolidated.length > 0;
  document.getElementById('welcomeBox').style.display = hasFiles ? 'none' : 'block';

  // Consolidado (pestaña Actualizar)
  const dupEntre = MSD.state.consolidated.filter((h) => h.fuentes.length > 1).length;
  const conflictos = new Set(MSD.state.quality.map((q) => q.hu)).size;
  document.getElementById('csHUTotal').textContent = MSD.state.consolidated.length.toLocaleString('es-CL');
  document.getElementById('csHUActivas').textContent = MSD.state.consolidated.filter((h) => MSD.getHUStatus(h) !== 'DESPACHADO').length.toLocaleString('es-CL');
  document.getElementById('csHUDespachadas').textContent = MSD.state.consolidated.filter((h) => MSD.getHUStatus(h) === 'DESPACHADO').length.toLocaleString('es-CL');
  document.getElementById('csDuplicadas').textContent = dupEntre.toLocaleString('es-CL');
  document.getElementById('csConflictos').textContent = conflictos.toLocaleString('es-CL');

  ['facturacion', 'dashboard', 'detalle', 'periodo', 'calidad'].forEach((t) => {
    document.getElementById(`${t}Empty`).style.display = hasData ? 'none' : 'block';
    document.getElementById(`${t}Content`).style.display = hasData ? 'block' : 'none';
  });

  if (!hasData) return;

  const config = MSD.state.config;
  const currentPeriod = MSD.getBillingPeriod(config.fechaCorte, config.diaInicioCiclo);
  const filtered = getFilteredHU();

  renderSituacionActual(config);
  MSD.renderFacturacionTable(MSD.calculateFacturacionPeriodo(MSD.state.consolidated, config));
  MSD.renderFacturacionDetailTable(MSD.buildFacturacionDetailRows(MSD.state.consolidated, config));

  renderInfoBoxes(config, currentPeriod);
  renderSupuestos(config);
  renderQuickRefs(config);

  const kpis = MSD.calculateKPIs(filtered, config, currentPeriod);
  MSD.state.kpis = kpis;
  document.getElementById('kpiGrid').innerHTML = [
    kpiCard('HU únicas totales', kpis.huUnicasTotales.toLocaleString('es-CL')),
    kpiCard('HU activas', kpis.huActivas.toLocaleString('es-CL'), 'accent'),
    kpiCard('HU despachadas', kpis.huDespachadas.toLocaleString('es-CL')),
    kpiCard('HU en picking', kpis.huEnPicking.toLocaleString('es-CL')),
    kpiCard('m² ocupados', MSD.formatNumber(kpis.m2Ocupados, 1)),
    kpiCard('Costo acumulado UF', MSD.formatUF(kpis.costoAcumUF)),
    kpiCard('Costo acumulado CLP', MSD.formatCLP(kpis.costoAcumCLP), 'success'),
    kpiCard('Costo período UF', MSD.formatUF(kpis.costoPeriodoUF)),
    kpiCard('Costo período CLP', MSD.formatCLP(kpis.costoPeriodoCLP), 'success'),
    kpiCard('Costo diario actual CLP', MSD.formatCLP(kpis.costoDiarioActualCLP)),
    kpiCard('Ingresos HU período', kpis.ingresosHUPeriod.toLocaleString('es-CL')),
    kpiCard('Salidas HU período', kpis.salidasHUPeriod.toLocaleString('es-CL'), 'danger'),
  ].join('');

  renderProjectionGrid(filtered, config, config.fechaProyeccion);

  MSD.state.periodSummary = MSD.calculatePeriodSummary(MSD.state.consolidated, config);
  MSD.state.aging = MSD.calculateAging(filtered, config);
  MSD.state.dailySeries = MSD.calculateDailySeries(filtered, config);

  MSD.renderCharts(filtered, config, MSD.state.dailySeries, MSD.state.periodSummary, MSD.state.aging);
  MSD.renderAgingTable(MSD.state.aging);

  const detailRows = MSD.buildDetailRows(filtered, config, currentPeriod);
  MSD.renderDetailTable(detailRows);
  MSD.renderQualityPanel(MSD.state.quality);
  MSD.renderPeriodSummaryTable(MSD.state.periodSummary);

  renderTestCases(config);
};

function renderSituacionActual(config) {
  const s = MSD.calculateSituacionActual(MSD.state.consolidated, config);
  document.getElementById('situacionFechaLabel').textContent = `— al ${MSD.formatDate(s.fechaCorte)} (día ${s.diaCiclo} del ciclo, inicia el ${config.diaInicioCiclo})`;
  document.getElementById('situacionActualGrid').innerHTML = [
    kpiCard('HU activas', s.huActivas.toLocaleString('es-CL'), 'accent'),
    kpiCard('m² ocupados', MSD.formatNumber(s.m2Ocupados, 1)),
    kpiCard('Costo del período a hoy (CLP)', MSD.formatCLP(s.costoPeriodoCLP), 'success'),
    kpiCard('Costo acumulado histórico (CLP)', MSD.formatCLP(s.costoAcumCLP)),
    kpiCard('Costo diario actual (CLP)', MSD.formatCLP(s.costoDiarioActualCLP)),
  ].join('');
  document.getElementById('proximaFacturaGrid').innerHTML = [
    kpiCard('Próxima factura (día 28)', MSD.formatDate(s.fechaProximaFactura)),
    kpiCard('Días restantes del ciclo', s.diasRestantesPeriodo.toLocaleString('es-CL')),
    kpiCard('Proyección costo período (UF)', MSD.formatUF(s.costoProyectadoPeriodoUF)),
    kpiCard('Proyección costo período (CLP)', MSD.formatCLP(s.costoProyectadoPeriodoCLP), 'success'),
  ].join('');
}

function renderInfoBoxes(config, currentPeriod) {
  const f1 = MSD.state.files.f1, f2 = MSD.state.files.f2;
  document.getElementById('infoInventario').innerHTML = `
    <div>Última carga: <b>${MSD.formatDateTime(new Date())}</b></div>
    <div>Archivo 1: <b>${f1.name || '—'}</b> (${f1.rowCount || 0} filas, ${f1.huCount || 0} HU)</div>
    <div>Archivo 2: <b>${f2.name || '—'}</b> (${f2.rowCount || 0} filas, ${f2.huCount || 0} HU)</div>
    <div>HU consolidadas: <b>${MSD.state.consolidated.length.toLocaleString('es-CL')}</b></div>`;
  document.getElementById('infoFinanciero').innerHTML = `
    <div>UF utilizada: <b>${MSD.formatCLP(config.valorUF)}</b></div>
    <div>Fecha UF: <b>${MSD.formatDate(MSD.parseISODateInput(config.fechaUF))}</b></div>
    <div>Fecha de corte: <b>${MSD.formatDate(config.fechaCorte)}</b></div>
    <div>Fecha de proyección: <b>${MSD.formatDate(config.fechaProyeccion)}</b></div>
    <div>Período actual: <b>${currentPeriod.label}</b></div>
    <div>Tarifa: <b>${config.tarifaUFm2mes} UF/m²/mes</b></div>`;
}

function renderSupuestos(config) {
  const tarifaMensual = MSD.tarifaMensualUFporHU(config);
  const tarifaDiaria = MSD.tarifaDiariaUFporHU(config);
  document.getElementById('supuestosGrid').innerHTML = `
    <div>1 HU = <b>${config.m2PorHU} m²</b></div>
    <div>Tarifa almacenamiento = <b>${config.tarifaUFm2mes} UF/m²/mes</b></div>
    <div>Tarifa mensual HU = <b>${MSD.formatUF(tarifaMensual)}</b></div>
    <div>Tarifa diaria HU = <b>${MSD.formatUF(tarifaDiaria, 4)}</b></div>
    <div>Mes tarifario = <b>${config.mesComercialDias} días</b></div>
    <div>Ciclo = <b>día ${config.diaInicioCiclo} al ${config.diaInicioCiclo - 1}</b></div>
    <div>Día ${config.diaInicioCiclo} = <b>inicio del nuevo período</b></div>
    <div>Metodología de días = <b>${config.metodologiaDias === 'A' ? 'A) Mes comercial 30 días' : 'B) Días reales del período'}</b></div>`;
}

function renderQuickRefs(config) {
  const tarifaDiariaCLP = MSD.tarifaDiariaUFporHU(config) * config.valorUF;
  document.getElementById('quickRefs').innerHTML = [100, 500, 1000].map((n) =>
    `<div>${n} HU/día: <b>${MSD.formatCLP(tarifaDiariaCLP * n)}</b></div>`).join('')
    + `<div>Tarifa diaria CLP/HU: <b>${MSD.formatCLP(tarifaDiariaCLP)}</b></div>`;
}

function renderProjectionGrid(hus, config, fechaProyeccion) {
  const proy = MSD.calculateProjection(hus, config, fechaProyeccion);
  MSD.state.projection = proy;
  document.getElementById('projectionGrid').innerHTML = [
    kpiCard('HU activas', proy.huActivas.toLocaleString('es-CL')),
    kpiCard('m² ocupados', MSD.formatNumber(proy.m2Ocupados, 1)),
    kpiCard('UF/día actual', MSD.formatUF(proy.tarifaDiariaUF, 4)),
    kpiCard('CLP/día actual', MSD.formatCLP(proy.tarifaDiariaCLP)),
    kpiCard('Costo real acumulado', MSD.formatCLP(proy.costoRealAcumCLP)),
    kpiCard('Costo proyectado adicional', MSD.formatCLP(proy.costoAdicionalCLP), 'accent'),
    kpiCard('Costo total proyectado', MSD.formatCLP(proy.costoTotalCLP), 'success'),
  ].join('');
}

function initProjectionButtons() {
  document.querySelectorAll('[data-proy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const config = MSD.state.config;
      if (!config.fechaCorte) return;
      const type = btn.dataset.proy;
      let fecha;
      if (type === 'cierre-actual') fecha = MSD.getBillingPeriod(config.fechaCorte, config.diaInicioCiclo).end;
      else if (type === 'proximo-cierre') {
        const actual = MSD.getBillingPeriod(config.fechaCorte, config.diaInicioCiclo);
        fecha = MSD.getBillingPeriod(MSD.addDays(actual.end, 1), config.diaInicioCiclo).end;
      } else fecha = MSD.addDays(config.fechaCorte, Number(type));
      config.fechaProyeccion = fecha;
      MSD.persistConfig(config);
      syncConfigInputsFromState();
      MSD.renderDashboard();
    });
  });
}

/* ---------------------------------------------------------------------------
 * EXPORTS
 * -------------------------------------------------------------------------*/
function initExportButtons() {
  document.getElementById('detailSearch').addEventListener('input', (e) => {
    MSD.tableState.search = e.target.value; MSD.tableState.page = 1;
    const config = MSD.state.config;
    const currentPeriod = MSD.getBillingPeriod(config.fechaCorte, config.diaInicioCiclo);
    MSD.renderDetailTable(MSD.buildDetailRows(getFilteredHU(), config, currentPeriod));
  });
  document.getElementById('facturacionSearch').addEventListener('input', (e) => {
    MSD.facturacionTableState.search = e.target.value; MSD.facturacionTableState.page = 1;
    MSD.renderFacturacionDetailTable(MSD.buildFacturacionDetailRows(MSD.state.consolidated, MSD.state.config));
  });
  document.getElementById('btnExportDetailCSV').addEventListener('click', () => MSD.exportDetailCSV(MSD._lastDetailRows || []));
  document.getElementById('btnExportDetailJSON').addEventListener('click', () => MSD.exportDetailJSON());
  document.getElementById('btnExportPDF').addEventListener('click', () => MSD.exportDashboardPDF());
  document.getElementById('btnExportPeriodCSV').addEventListener('click', () => MSD.exportPeriodSummaryCSV(MSD.state.periodSummary));
  document.getElementById('btnExportQualityCSV').addEventListener('click', () => MSD.exportQualityCSV(MSD.state.quality));
  document.getElementById('btnExportFacturacionCSV').addEventListener('click', () => MSD.exportFacturacionCSV(MSD.calculateFacturacionPeriodo(MSD.state.consolidated, MSD.state.config)));
}

/* ---------------------------------------------------------------------------
 * SIMULADOR
 * -------------------------------------------------------------------------*/
function initSimulators() {
  document.getElementById('btnSim1Calc').addEventListener('click', () => {
    const n = Number(document.getElementById('sim1HU').value) || 0;
    const dias = Number(document.getElementById('sim1Dias').value) || 0;
    const m2 = Number(document.getElementById('sim1M2').value) || 0;
    const tarifa = Number(document.getElementById('sim1Tarifa').value) || 0;
    const uf = MSD.parseUFValue(document.getElementById('sim1UF').value) || 0;

    const m2Totales = n * m2;
    const ufMensual = n * m2 * tarifa;
    const ufDiaria = ufMensual / 30;
    const costoUF = dias * ufDiaria;
    const costoCLP = costoUF * uf;

    document.getElementById('sim1Output').innerHTML = `<table>
      <tr><td>m² totales</td><td><b>${MSD.formatNumber(m2Totales, 1)}</b></td></tr>
      <tr><td>UF mensual (total)</td><td><b>${MSD.formatUF(ufMensual)}</b></td></tr>
      <tr><td>UF diaria (total)</td><td><b>${MSD.formatUF(ufDiaria, 4)}</b></td></tr>
      <tr><td>Costo UF</td><td><b>${MSD.formatUF(costoUF)}</b></td></tr>
      <tr><td>Costo CLP</td><td><b>${MSD.formatCLP(costoCLP)}</b></td></tr>
    </table>`;
  });

  document.getElementById('btnSim2Calc').addEventListener('click', () => {
    const config = MSD.state.config;
    const n = Number(document.getElementById('sim2HUActuales').value) || 0;
    const x = Number(document.getElementById('sim2HURetirar').value) || 0;
    const fechaRetiroStr = document.getElementById('sim2FechaRetiro').value;
    const fechaProyStr = document.getElementById('sim2FechaProy').value;
    if (!fechaRetiroStr || !fechaProyStr || !config.fechaCorte) {
      document.getElementById('sim2Output').innerHTML = '<p class="field-error">Completa fecha de retiro y fecha de proyección.</p>';
      return;
    }
    const fechaRetiro = MSD.parseISODateInput(fechaRetiroStr);
    const fechaProy = MSD.parseISODateInput(fechaProyStr);
    const tarifaDiariaUF = MSD.tarifaDiariaUFporHU(config);

    const diasTotal = MSD.daysBetween(config.fechaCorte, fechaProy);
    const costoSinRetiroUF = n * tarifaDiariaUF * diasTotal;

    const diasHastaRetiro = MSD.daysBetween(config.fechaCorte, MSD.minDate(fechaRetiro, fechaProy));
    const diasRetiroAProy = MSD.daysBetween(MSD.minDate(fechaRetiro, fechaProy), fechaProy);
    const costoConRetiroUF = n * tarifaDiariaUF * diasHastaRetiro + Math.max(n - x, 0) * tarifaDiariaUF * diasRetiroAProy;

    const ahorroUF = costoSinRetiroUF - costoConRetiroUF;
    const ahorroCLP = ahorroUF * config.valorUF;

    document.getElementById('sim2Output').innerHTML = `<table>
      <tr><td>Costo proyectado sin retiro</td><td><b>${MSD.formatUF(costoSinRetiroUF)}</b> / ${MSD.formatCLP(costoSinRetiroUF * config.valorUF)}</td></tr>
      <tr><td>Costo proyectado con retiro</td><td><b>${MSD.formatUF(costoConRetiroUF)}</b> / ${MSD.formatCLP(costoConRetiroUF * config.valorUF)}</td></tr>
      <tr><td>Ahorro UF</td><td><b>${MSD.formatUF(ahorroUF)}</b></td></tr>
      <tr><td>Ahorro CLP</td><td><b>${MSD.formatCLP(ahorroCLP)}</b></td></tr>
    </table>`;
  });
}

/* ---------------------------------------------------------------------------
 * PRUEBAS DE CÁLCULO (casos en vivo, sección 13/49/50 del brief)
 * -------------------------------------------------------------------------*/
function renderCycleTests(dayStart) {
  const cases = [
    { label: '27 del mes (día final del ciclo anterior)', date: new Date(Date.UTC(2026, 8, 27)) },
    { label: '28 del mes (día 0 del nuevo ciclo)', date: new Date(Date.UTC(2026, 8, 28)) },
    { label: '29 del mes (día 1 del nuevo ciclo)', date: new Date(Date.UTC(2026, 8, 29)) },
  ];
  document.getElementById('cycleTestOutput').innerHTML = `<table class="data-table"><thead><tr><th>Fecha evaluada</th><th>Período resultante</th></tr></thead><tbody>
    ${cases.map((c) => `<tr><td>${c.label} — ${MSD.formatDate(c.date)}</td><td>${MSD.getBillingPeriod(c.date, dayStart).label}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderTestCases(config) {
  renderCycleTests(config.diaInicioCiclo);

  const corte = new Date(Date.UTC(2026, 8, 10));
  const casoA = { dateInbound: new Date(Date.UTC(2026, 8, 1)), datePicking: null, dateOutbound: null };
  const casoB = { dateInbound: new Date(Date.UTC(2026, 8, 1)), datePicking: new Date(Date.UTC(2026, 8, 8)), dateOutbound: null };
  const casoC = { dateInbound: new Date(Date.UTC(2026, 8, 1)), datePicking: new Date(Date.UTC(2026, 8, 8)), dateOutbound: new Date(Date.UTC(2026, 8, 9)) };
  const casoD = { dateInbound: new Date(Date.UTC(2026, 7, 20)), datePicking: null, dateOutbound: null };
  const periodoSep = MSD.getBillingPeriod(corte, config.diaInicioCiclo);

  const rows = [
    ['A: Inbound 01-09, sin picking/outbound, corte 10-09', MSD.calculateAccumulatedDays(casoA, corte), '—'],
    ['B: Inbound 01-09, Picking 08-09, sin outbound (corte en fin de cálculo = picking)', MSD.calculateAccumulatedDays(casoB, corte), '—'],
    ['C: Inbound 01-09, Picking 08-09, Outbound 09-09 (prioriza outbound)', MSD.calculateAccumulatedDays(casoC, corte), '—'],
    ['D: Inbound 20-08, corte 10-09 — acumulado desde 20-08', MSD.calculateAccumulatedDays(casoD, corte), MSD.calculatePeriodDays(casoD, periodoSep, corte) + ' (días período, desde 28-08)'],
  ];

  const ufA = 40864.55, ufB = 41250.36;
  const diasE = 25;
  const tarifaDiaria = MSD.tarifaDiariaUFporHU(config);
  const costoUFCasoE = diasE * tarifaDiaria;

  document.getElementById('calcTestOutput').innerHTML = `<table class="data-table"><thead><tr><th>Caso</th><th>Días acumulados</th><th>Nota</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
    </tbody></table>
    <p class="hint" style="margin-top:12px;">Caso E — el costo en UF no cambia si cambia la UF, solo cambia el CLP:
    ${diasE} días × ${MSD.formatUF(tarifaDiaria, 4)}/día = <b>${MSD.formatUF(costoUFCasoE)}</b> →
    con UF=${MSD.formatCLP(ufA)}: <b>${MSD.formatCLP(costoUFCasoE * ufA)}</b> · con UF=${MSD.formatCLP(ufB)}: <b>${MSD.formatCLP(costoUFCasoE * ufB)}</b></p>`;
}

/* ---------------------------------------------------------------------------
 * INIT
 * -------------------------------------------------------------------------*/
function init() {
  initTabs();
  initParamsBar();
  initFilters();
  initConfigTab();
  initProjectionButtons();
  initExportButtons();
  initSimulators();
  setupDropzone('dropzone1', 'fileInput1', 'btnChoose1', 'f1');
  setupDropzone('dropzone2', 'fileInput2', 'btnChoose2', 'f2');
  document.getElementById('btnRecalcular').addEventListener('click', () => MSD.recalculateAll());
  document.getElementById('btnLimpiar').addEventListener('click', clearFiles);

  syncConfigInputsFromState();
  renderTestCases(MSD.state.config);
  MSD.renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
