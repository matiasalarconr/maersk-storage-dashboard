/* ============================================================================
 * tables.js — Tabla de detalle interactiva, panel de calidad de datos y
 * tabla de resumen por período.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

MSD.tableState = {
  sortKey: 'costoAcumCLP', sortDir: 'desc', search: '', page: 1, pageSize: 50,
};

MSD.DETAIL_COLUMNS = [
  { key: 'hu', label: 'HU' },
  { key: 'estado', label: 'Estado' },
  { key: 'location', label: 'Location' },
  { key: 'producto', label: 'Producto' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'lote', label: 'Lote' },
  { key: 'cantidadTotal', label: 'Cantidad' },
  { key: 'dateInbound', label: 'Inbound' },
  { key: 'datePicking', label: 'Picking' },
  { key: 'dateOutbound', label: 'Outbound' },
  { key: 'finCalculo', label: 'Fin cálculo' },
  { key: 'diasAcumulados', label: 'Días acum.' },
  { key: 'diasPeriodo', label: 'Días período' },
  { key: 'm2', label: 'm²' },
  { key: 'costoPeriodoUF', label: 'Costo UF período' },
  { key: 'costoPeriodoCLP', label: 'Costo CLP período' },
  { key: 'costoAcumUF', label: 'Costo UF acum.' },
  { key: 'costoAcumCLP', label: 'Costo CLP acum.' },
  { key: 'fuentes', label: 'Fuente' },
];

/** Aplana las HU consolidadas + su costo calculado en filas planas para la tabla/exportación. */
MSD.buildDetailRows = function (hus, config, period) {
  return hus.map((hu) => {
    const costo = MSD.calculateHUCost(hu, config, period);
    return {
      hu: hu.hu,
      estado: MSD.STATUS_LABELS[MSD.getHUStatus(hu)],
      location: hu.location,
      producto: hu.producto,
      descripcion: hu.descripcion,
      lote: hu.lote,
      cantidadTotal: hu.cantidadTotal,
      dateInbound: hu.dateInbound,
      datePicking: hu.datePicking,
      dateOutbound: hu.dateOutbound,
      finCalculo: MSD.huFechaFinCalculo(hu, config.fechaCorte),
      diasAcumulados: costo.diasAcumulados,
      diasPeriodo: costo.diasPeriodo,
      m2: costo.m2,
      costoPeriodoUF: costo.costoPeriodoUF,
      costoPeriodoCLP: costo.costoPeriodoCLP,
      costoAcumUF: costo.costoAcumUF,
      costoAcumCLP: costo.costoAcumCLP,
      fuentes: hu.fuentes.join(', '),
    };
  });
};

function cellText(row, key) {
  const v = row[key];
  if (v instanceof Date) return MSD.formatDate(v);
  if (typeof v === 'number') {
    if (key.includes('UF')) return MSD.formatUF(v);
    if (key.includes('CLP')) return MSD.formatCLP(v);
    return MSD.formatNumber(v, key.startsWith('dias') ? 0 : 2);
  }
  return v ?? '';
}

/** Tabla genérica con búsqueda por HU, orden por columna y paginación. */
MSD.renderGenericTable = function (containerId, rows, columns, state, onRendered) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const search = state.search.trim().toUpperCase();

  let filtered = rows;
  if (search) filtered = rows.filter((r) => String(r.hu).toUpperCase().includes(search));

  const { sortKey, sortDir } = state;
  filtered = filtered.slice().sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (va instanceof Date || vb instanceof Date) { va = va ? va.getTime() : -Infinity; vb = vb ? vb.getTime() : -Infinity; }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    va = va ?? -Infinity; vb = vb ?? -Infinity;
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = filtered.slice(start, start + state.pageSize);

  const thead = columns.map((c) => {
    const active = c.key === sortKey;
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th data-key="${c.key}" class="sortable${active ? ' active' : ''}">${c.label}${arrow}</th>`;
  }).join('');

  const tbody = pageRows.map((r) => {
    const tds = columns.map((c) => `<td>${cellText(r, c.key)}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody || `<tr><td colspan="${columns.length}" class="empty-cell">Sin resultados</td></tr>`}</tbody>
    </table>
    <div class="table-footer">
      <span>${total.toLocaleString('es-CL')} HU · página ${state.page} de ${pageCount}</span>
      <div class="pager">
        <button data-page="prev" ${state.page <= 1 ? 'disabled' : ''}>‹ Anterior</button>
        <button data-page="next" ${state.page >= pageCount ? 'disabled' : ''}>Siguiente ›</button>
      </div>
    </div>`;

  container.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = 'desc'; }
      MSD.renderGenericTable(containerId, rows, columns, state, onRendered);
    });
  });
  container.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.page += btn.dataset.page === 'next' ? 1 : -1;
      MSD.renderGenericTable(containerId, rows, columns, state, onRendered);
    });
  });

  if (onRendered) onRendered(filtered);
};

MSD.renderDetailTable = function (rows) {
  MSD.renderGenericTable('detailTableWrap', rows, MSD.DETAIL_COLUMNS, MSD.tableState, (filtered) => {
    MSD._lastDetailRows = filtered; // para exportar según filtro/búsqueda actual
  });
};

/* ---------------------------------------------------------------------------
 * FACTURACIÓN — tabla compacta por HU: tarifa, inbound y salida/picking
 * -------------------------------------------------------------------------*/

MSD.FACTURACION_DETAIL_COLUMNS = [
  { key: 'hu', label: 'HU' },
  { key: 'dateInbound', label: 'Fecha Inbound' },
  { key: 'dateSalida', label: 'Fecha Salida / Picking' },
  { key: 'estado', label: 'Estado' },
  { key: 'costoAcumCLP', label: 'Tarifa (costo acumulado)' },
];

MSD.facturacionTableState = { sortKey: 'costoAcumCLP', sortDir: 'desc', search: '', page: 1, pageSize: 50 };

MSD.buildFacturacionDetailRows = function (hus, config) {
  return hus.map((hu) => {
    const costo = MSD.calculateHUCost(hu, config, null);
    return {
      hu: hu.hu,
      dateInbound: hu.dateInbound,
      dateSalida: hu.dateOutbound || hu.datePicking || null,
      estado: MSD.STATUS_LABELS[MSD.getHUStatus(hu)],
      costoAcumCLP: costo.costoAcumCLP,
    };
  });
};

MSD.renderFacturacionDetailTable = function (rows) {
  MSD.renderGenericTable('facturacionDetailWrap', rows, MSD.FACTURACION_DETAIL_COLUMNS, MSD.facturacionTableState, (filtered) => {
    MSD._lastFacturacionDetailRows = filtered;
  });
};

/* ---------------------------------------------------------------------------
 * CALIDAD DE DATOS
 * -------------------------------------------------------------------------*/

MSD.renderQualityPanel = function (issues) {
  const summaryEl = document.getElementById('qualitySummary');
  const listEl = document.getElementById('qualityList');
  if (!summaryEl || !listEl) return;

  if (!issues.length) {
    summaryEl.innerHTML = '<p class="ok-msg">No se detectaron inconsistencias en el inventario cargado.</p>';
    listEl.innerHTML = '';
    return;
  }

  const byType = new Map();
  for (const i of issues) byType.set(i.tipo, (byType.get(i.tipo) || 0) + 1);

  summaryEl.innerHTML = `<p>${issues.length.toLocaleString('es-CL')} inconsistencias detectadas en ${new Set(issues.map((i) => i.hu)).size.toLocaleString('es-CL')} HU. No se eliminó ningún dato automáticamente.</p>
    <div class="quality-chips">${[...byType.entries()].map(([t, n]) => `<span class="chip">${t}: <b>${n}</b></span>`).join('')}</div>`;

  listEl.innerHTML = `<table class="data-table">
    <thead><tr><th>Tipo</th><th>HU</th><th>Detalle</th><th>Fuente</th></tr></thead>
    <tbody>${issues.slice(0, 500).map((i) => `<tr><td>${i.tipo}</td><td>${i.hu}</td><td>${i.detalle}</td><td>${i.fuente}</td></tr>`).join('')}</tbody>
  </table>${issues.length > 500 ? `<p class="hint">Mostrando las primeras 500 de ${issues.length}. Exporta el CSV para ver el listado completo.</p>` : ''}`;
};

/* ---------------------------------------------------------------------------
 * RESUMEN POR PERÍODO
 * -------------------------------------------------------------------------*/

MSD.renderPeriodSummaryTable = function (summary) {
  const el = document.getElementById('periodSummaryWrap');
  if (!el) return;
  if (!summary.length) { el.innerHTML = '<p class="hint">Sin datos suficientes para calcular períodos.</p>'; return; }
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Período</th><th>HU promedio</th><th>HU al inicio</th><th>HU al cierre</th><th>m² promedio</th>
      <th>Ingresos HU</th><th>Salidas HU</th><th>Días-HU</th><th>Costo UF</th><th>Costo CLP</th></tr></thead>
    <tbody>${summary.map((p) => `<tr>
        <td>${p.period.label}</td>
        <td>${MSD.formatNumber(p.huPromedio, 1)}</td>
        <td>${p.huAlInicio}</td>
        <td>${p.huAlCierre}</td>
        <td>${MSD.formatNumber(p.m2Promedio, 1)}</td>
        <td>${p.ingresosHU}</td>
        <td>${p.salidasHU}</td>
        <td>${MSD.formatNumber(p.diasHU, 0)}</td>
        <td>${MSD.formatUF(p.costoUF)}</td>
        <td>${MSD.formatCLP(p.costoCLP)}</td>
      </tr>`).join('')}</tbody>
  </table>`;
};

/* ---------------------------------------------------------------------------
 * FACTURACIÓN POR PERÍODO (vista reducida: Inbound / Outbound / Almacenamiento)
 * -------------------------------------------------------------------------*/

MSD.renderFacturacionTable = function (rows) {
  const el = document.getElementById('facturacionWrap');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<p class="hint">Sin datos suficientes para calcular la facturación por período.</p>'; return; }
  el.innerHTML = rows.map((r) => `
    <table class="invoice-table">
      <thead><tr><th colspan="2">Período Facturación del ${r.label}</th></tr></thead>
      <tbody>
        <tr><td>Inbound</td><td>${MSD.formatCLPInvoice(r.inboundCLP)}</td></tr>
        <tr><td>Outbound</td><td>${MSD.formatCLPInvoice(r.outboundCLP)}</td></tr>
        <tr><td>Almacenamiento</td><td>${MSD.formatCLPInvoice(r.almacenamientoCLP)}</td></tr>
      </tbody>
    </table>`).join('');
};

MSD.renderAgingTable = function (aging) {
  const el = document.getElementById('agingTableWrap');
  if (!el) return;
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Rango</th><th>HU</th><th>m²</th><th>Costo acumulado UF</th><th>Costo acumulado CLP</th></tr></thead>
    <tbody>${aging.map((b) => `<tr><td>${b.label}</td><td>${b.count}</td><td>${MSD.formatNumber(b.m2, 1)}</td><td>${MSD.formatUF(b.costoAcumUF)}</td><td>${MSD.formatCLP(b.costoAcumCLP)}</td></tr>`).join('')}</tbody>
  </table>`;
};
