/* ============================================================================
 * consolidate.js — Consolidación de HU únicas (1 HU = 1 posición de almacenaje,
 * sin importar cuántas filas / lotes / productos tenga) y detección de
 * inconsistencias de calidad de datos.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/** Agrupa todas las filas (de ambos archivos) por HU y consolida sus campos. */
MSD.consolidateHU = function (allRows) {
  const groups = new Map();
  for (const row of allRows) {
    if (!groups.has(row.hu)) groups.set(row.hu, []);
    groups.get(row.hu).push(row);
  }

  const consolidated = [];
  for (const [hu, rows] of groups) {
    let dateInbound = null, datePicking = null, dateOutbound = null;
    const locations = new Set();
    const fuentes = new Set();
    const inboundValues = new Set();
    const outboundValues = new Set();
    const productosMap = new Map();
    let cantidadTotal = 0;

    for (const r of rows) {
      if (r.dateInbound) {
        dateInbound = MSD.minDate(dateInbound, r.dateInbound);
        inboundValues.add(r.dateInbound.getTime());
      }
      if (r.datePicking) datePicking = MSD.maxDate(datePicking, r.datePicking);
      if (r.dateOutbound) {
        dateOutbound = MSD.maxDate(dateOutbound, r.dateOutbound);
        outboundValues.add(r.dateOutbound.getTime());
      }
      if (r.location) locations.add(r.location);
      fuentes.add(r.fuente);
      cantidadTotal += r.cantidad || 0;

      const key = `${r.producto}|${r.lote}|${r.loteProduccion}`;
      if (!productosMap.has(key)) {
        productosMap.set(key, {
          producto: r.producto, descripcion: r.descripcion, lote: r.lote,
          loteProduccion: r.loteProduccion, cantidad: 0,
        });
      }
      productosMap.get(key).cantidad += r.cantidad || 0;
    }

    const locationsArr = [...locations];
    const location = locationsArr.includes('DESPACHADO')
      ? 'DESPACHADO'
      : (rows[rows.length - 1].location || locationsArr[0] || '');

    const productos = [...productosMap.values()];
    const productoPrincipal = productos.slice().sort((a, b) => b.cantidad - a.cantidad)[0] || null;

    consolidated.push({
      hu,
      dateInbound, datePicking, dateOutbound,
      location, locations: locationsArr,
      fuentes: [...fuentes],
      cantidadTotal,
      productos,
      producto: productoPrincipal ? productoPrincipal.producto : '',
      descripcion: productoPrincipal ? productoPrincipal.descripcion : '',
      lote: productoPrincipal ? productoPrincipal.lote : '',
      cliente: rows.find((r) => r.cliente)?.cliente || '',
      rowCount: rows.length,
      rawRows: rows,
      inboundValuesCount: inboundValues.size,
      outboundValuesCount: outboundValues.size,
    });
  }
  return consolidated;
};

/** Estado de una HU: DESPACHADO > EN_PICKING > ALMACENADO (sección 10 del brief). */
MSD.getHUStatus = function (hu) {
  if (hu.dateOutbound) return 'DESPACHADO';
  if (hu.datePicking) return 'EN_PICKING';
  return 'ALMACENADO';
};

MSD.STATUS_LABELS = {
  DESPACHADO: 'Despachado',
  EN_PICKING: 'En picking / salida',
  ALMACENADO: 'Almacenado',
};

/** Analiza cada HU consolidada y produce la lista de inconsistencias de calidad de datos. */
MSD.validateHU = function (consolidated) {
  const issues = [];
  const push = (tipo, hu, detalle) => issues.push({ tipo, hu: hu.hu, detalle, fuente: hu.fuentes.join(', ') });

  for (const hu of consolidated) {
    if (hu.rowCount > 1) {
      push('HU duplicada (varias filas)', hu, `${hu.rowCount} filas consolidadas en esta HU.`);
    }
    if (!hu.dateInbound) {
      push('HU sin DATE INBOUND', hu, 'No se encontró fecha de ingreso; no se calcula costo para esta HU.');
    }
    if (hu.dateInbound && hu.datePicking && hu.datePicking < hu.dateInbound) {
      push('DATE PICKING anterior a DATE INBOUND', hu, `Picking ${MSD.formatDate(hu.datePicking)} < Inbound ${MSD.formatDate(hu.dateInbound)}`);
    }
    if (hu.dateInbound && hu.dateOutbound && hu.dateOutbound < hu.dateInbound) {
      push('DATE OUTBOUND anterior a DATE INBOUND', hu, `Outbound ${MSD.formatDate(hu.dateOutbound)} < Inbound ${MSD.formatDate(hu.dateInbound)}`);
    }
    if (hu.datePicking && hu.dateOutbound && hu.dateOutbound < hu.datePicking) {
      push('DATE OUTBOUND anterior a DATE PICKING', hu, `Outbound ${MSD.formatDate(hu.dateOutbound)} < Picking ${MSD.formatDate(hu.datePicking)}`);
    }
    if (hu.location === 'DESPACHADO' && !hu.dateOutbound) {
      push('HU despachada sin DATE OUTBOUND', hu, 'LOCATION indica DESPACHADO pero no hay fecha de salida registrada.');
    }
    for (const r of hu.rawRows) {
      for (const err of r.dateErrors) {
        push('Fecha inválida', hu, `${err} (fuente: ${r.fuente}, fila ${r.rowNumber})`);
      }
    }
    if (hu.fuentes.length > 1) {
      push('HU presente en múltiples archivos', hu, `Aparece en: ${hu.fuentes.join(' y ')}`);
    }
    if (hu.inboundValuesCount > 1 || hu.outboundValuesCount > 1) {
      push('HU con fechas contradictorias', hu, 'Distintas filas de la misma HU tienen fechas de inbound/outbound distintas.');
    }
    if (hu.locations.length > 1) {
      push('HU con LOCATION diferente entre registros', hu, `Ubicaciones: ${hu.locations.join(', ')}`);
    }
  }
  return issues;
};
