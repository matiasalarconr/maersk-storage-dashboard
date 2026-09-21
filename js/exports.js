/* ============================================================================
 * exports.js — Exportación CSV / JSON / PDF (impresión). Todo ocurre en el
 * navegador: nada se sube a ningún servidor.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) v = MSD.formatDate(v);
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

MSD.arrayToCSV = function (rows, columns) {
  const header = columns.map((c) => c.label).join(';');
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(';')).join('\n');
  return '﻿' + header + '\n' + body;
};

MSD.exportCSV = function (rows, columns, filename) {
  downloadBlob(MSD.arrayToCSV(rows, columns), filename, 'text/csv;charset=utf-8;');
};

MSD.exportJSON = function (obj, filename) {
  downloadBlob(JSON.stringify(obj, null, 2), filename, 'application/json;charset=utf-8;');
};

/** Construye el JSON normalizado descrito en la sección 33 del brief. */
MSD.buildNormalizedJSON = function () {
  const config = MSD.state.config;
  return {
    config: {
      uf_clp: config.valorUF,
      fecha_uf: config.fechaUF,
      tarifa_uf_m2_mes: config.tarifaUFm2mes,
      m2_por_hu: config.m2PorHU,
      dias_mes_tarifa: config.mesComercialDias,
      dia_inicio_periodo: config.diaInicioCiclo,
      fecha_corte: MSD.toInputDate(config.fechaCorte),
      fecha_inicial_cobro: MSD.toInputDate(config.fechaInicialCobro),
      metodologia_dias: config.metodologiaDias,
    },
    hu: MSD.state.consolidated.map((hu) => ({
      hu: hu.hu,
      date_inbound: MSD.toInputDate(hu.dateInbound),
      date_picking: MSD.toInputDate(hu.datePicking),
      date_outbound: MSD.toInputDate(hu.dateOutbound),
      location: hu.location,
      producto: hu.producto,
      descripcion: hu.descripcion,
      cantidad: hu.cantidadTotal,
      estado: MSD.getHUStatus(hu),
      fuente: hu.fuentes.join(', '),
    })),
  };
};

MSD.exportDetailCSV = function (rows) {
  MSD.exportCSV(rows, MSD.DETAIL_COLUMNS, `maersk_detalle_${MSD.toInputDate(MSD.state.config.fechaCorte)}.csv`);
};

MSD.exportDetailJSON = function () {
  MSD.exportJSON(MSD.buildNormalizedJSON(), `maersk_inventario_${MSD.toInputDate(MSD.state.config.fechaCorte)}.json`);
};

MSD.exportPeriodSummaryCSV = function (summary) {
  const rows = summary.map((p) => ({
    periodo: p.period.label, huPromedio: p.huPromedio, huAlInicio: p.huAlInicio, huAlCierre: p.huAlCierre,
    m2Promedio: p.m2Promedio, ingresosHU: p.ingresosHU, salidasHU: p.salidasHU, diasHU: p.diasHU,
    costoUF: p.costoUF, costoCLP: p.costoCLP,
  }));
  const columns = [
    { key: 'periodo', label: 'Período' }, { key: 'huPromedio', label: 'HU promedio' },
    { key: 'huAlInicio', label: 'HU al inicio' }, { key: 'huAlCierre', label: 'HU al cierre' },
    { key: 'm2Promedio', label: 'm² promedio' }, { key: 'ingresosHU', label: 'Ingresos HU' },
    { key: 'salidasHU', label: 'Salidas HU' }, { key: 'diasHU', label: 'Días-HU' },
    { key: 'costoUF', label: 'Costo UF' }, { key: 'costoCLP', label: 'Costo CLP' },
  ];
  MSD.exportCSV(rows, columns, 'maersk_resumen_periodo.csv');
};

MSD.exportFacturacionCSV = function (rows) {
  const flat = rows.map((r) => ({
    periodo: `Período Facturación del ${r.label}`,
    inbound: Math.round(r.inboundCLP), outbound: Math.round(r.outboundCLP), almacenamiento: Math.round(r.almacenamientoCLP),
  }));
  const columns = [
    { key: 'periodo', label: 'Período' }, { key: 'inbound', label: 'Inbound' },
    { key: 'outbound', label: 'Outbound' }, { key: 'almacenamiento', label: 'Almacenamiento' },
  ];
  MSD.exportCSV(flat, columns, 'maersk_facturacion_periodo.csv');
};

MSD.exportQualityCSV = function (issues) {
  const columns = [
    { key: 'tipo', label: 'Tipo' }, { key: 'hu', label: 'HU' },
    { key: 'detalle', label: 'Detalle' }, { key: 'fuente', label: 'Fuente' },
  ];
  MSD.exportCSV(issues, columns, 'maersk_inconsistencias.csv');
};

MSD.exportProjectionCSV = function (projection) {
  const rows = [{
    fechaCorte: MSD.formatDate(projection.fechaCorte),
    fechaProyeccion: MSD.formatDate(projection.fechaProyeccion),
    huActivas: projection.huActivas,
    m2Ocupados: projection.m2Ocupados,
    tarifaDiariaCLP: projection.tarifaDiariaCLP,
    costoRealAcumCLP: projection.costoRealAcumCLP,
    costoAdicionalCLP: projection.costoAdicionalCLP,
    costoTotalCLP: projection.costoTotalCLP,
  }];
  const columns = Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  MSD.exportCSV(rows, columns, 'maersk_proyeccion.csv');
};

MSD.exportDashboardPDF = function () {
  window.print();
};
