/* ============================================================================
 * calculations.js — Ciclo de facturación (28→27), días acumulados/período,
 * tarifas, costo por HU, KPIs, proyección, antigüedad y resumen por período.
 * Toda la lógica de fechas está centralizada aquí para poder revisarla fácil.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/* ---------------------------------------------------------------------------
 * CICLO DE FACTURACIÓN (día 28 = día 0 del nuevo período)
 * -------------------------------------------------------------------------*/

/** Inicio del período de facturación al que pertenece `date`. */
MSD.periodStartFor = function (date, dayStart = 28) {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth();
  if (date.getUTCDate() < dayStart) m -= 1; // Date normaliza meses negativos automáticamente
  return new Date(Date.UTC(y, m, dayStart));
};

/** Fin del período (día dayStart-1 del mes siguiente al inicio), dado el inicio. */
MSD.periodEndFor = function (periodStart, dayStart = 28) {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, dayStart - 1));
};

const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

MSD.periodLabel = function (start, end) {
  return `${MSD.formatDate(start)} → ${MSD.formatDate(end)}`;
};

MSD.periodShortLabel = function (end) {
  return `${MESES_ES[end.getUTCMonth()]}-${end.getUTCFullYear()}`;
};

/** Devuelve {start, end, label} del período de facturación que contiene `date`. */
MSD.getBillingPeriod = function (date, dayStart = 28) {
  const start = MSD.periodStartFor(date, dayStart);
  const end = MSD.periodEndFor(start, dayStart);
  return { start, end, label: MSD.periodLabel(start, end), shortLabel: MSD.periodShortLabel(end) };
};

/** Lista todos los períodos de facturación que cubren el rango [minDate, maxDate]. */
MSD.listPeriods = function (minDate, maxDate, dayStart = 28) {
  if (!minDate || !maxDate) return [];
  const periods = [];
  let cursor = MSD.getBillingPeriod(minDate, dayStart);
  let guard = 0;
  while (cursor.start <= maxDate && guard < 240) {
    periods.push(cursor);
    const nextStart = MSD.addDays(cursor.end, 1);
    cursor = MSD.getBillingPeriod(nextStart, dayStart);
    guard++;
  }
  return periods;
};

/* ---------------------------------------------------------------------------
 * DÍAS: acumulados (desde inbound) vs. de período (solo dentro del ciclo)
 * -------------------------------------------------------------------------*/

/** Fecha de fin "real" de una HU: outbound > picking > fechaCorte (sección 9). */
MSD.huFechaFinReal = function (hu, fechaCorte) {
  return hu.dateOutbound || hu.datePicking || fechaCorte;
};

/** Fecha de fin efectiva para el cálculo histórico: min(fin real, fecha de corte). */
MSD.huFechaFinCalculo = function (hu, fechaCorte) {
  const finReal = MSD.huFechaFinReal(hu, fechaCorte);
  return MSD.minDate(finReal, fechaCorte);
};

/** Días acumulados desde DATE INBOUND hasta fin de cálculo (recortado a fechaCorte). */
MSD.calculateAccumulatedDays = function (hu, fechaCorte) {
  if (!hu.dateInbound) return 0;
  if (hu.dateInbound > fechaCorte) return 0;
  const fin = MSD.huFechaFinCalculo(hu, fechaCorte);
  return MSD.daysBetween(hu.dateInbound, fin);
};

/** Días que corresponden únicamente al período de facturación indicado. */
MSD.calculatePeriodDays = function (hu, period, fechaCorte) {
  if (!hu.dateInbound) return 0;
  if (hu.dateInbound > fechaCorte) return 0;
  const finCalculo = MSD.huFechaFinCalculo(hu, fechaCorte);
  const effStart = MSD.maxDate(hu.dateInbound, period.start);
  const effEnd = MSD.minDate(finCalculo, period.end);
  if (effEnd <= effStart) return 0;
  return MSD.daysBetween(effStart, effEnd);
};

/* ---------------------------------------------------------------------------
 * TARIFAS Y COSTOS
 * -------------------------------------------------------------------------*/

/** Tarifa diaria en UF/HU dado un divisor de días (mes comercial o días reales del período). */
MSD.calculateDailyRate = function (config, divisorDias) {
  return MSD.tarifaMensualUFporHU(config) / divisorDias;
};

/** Costo completo (UF y CLP, acumulado y de período) de una HU. */
MSD.calculateHUCost = function (hu, config, period) {
  const fechaCorte = config.fechaCorte;
  const tarifaDiariaAcumUF = MSD.calculateDailyRate(config, config.mesComercialDias);

  const diasAcumulados = MSD.calculateAccumulatedDays(hu, fechaCorte);
  const costoAcumUF = diasAcumulados * tarifaDiariaAcumUF;

  let diasPeriodo = 0, costoPeriodoUF = 0, tarifaDiariaPeriodoUF = tarifaDiariaAcumUF;
  if (period) {
    diasPeriodo = MSD.calculatePeriodDays(hu, period, fechaCorte);
    let divisor = config.mesComercialDias;
    if (config.metodologiaDias === 'B') {
      divisor = MSD.daysBetween(period.start, MSD.addDays(period.end, 1)); // días reales del ciclo
    }
    tarifaDiariaPeriodoUF = MSD.calculateDailyRate(config, divisor);
    costoPeriodoUF = diasPeriodo * tarifaDiariaPeriodoUF;
  }

  return {
    m2: config.m2PorHU,
    tarifaMensualUF: MSD.tarifaMensualUFporHU(config),
    tarifaDiariaUF: tarifaDiariaAcumUF,
    diasAcumulados,
    diasPeriodo,
    costoAcumUF,
    costoAcumCLP: costoAcumUF * config.valorUF,
    costoPeriodoUF,
    costoPeriodoCLP: costoPeriodoUF * config.valorUF,
  };
};

/* ---------------------------------------------------------------------------
 * KPIs
 * -------------------------------------------------------------------------*/

/** HU "activa al corte": ya ingresó y (no tiene salida o su salida es posterior al corte). */
MSD.isActiveAtCutoff = function (hu, fechaCorte) {
  if (!hu.dateInbound || hu.dateInbound > fechaCorte) return false;
  return !hu.dateOutbound || hu.dateOutbound > fechaCorte;
};

MSD.calculateKPIs = function (consolidated, config, currentPeriod) {
  const fechaCorte = config.fechaCorte;
  let huActivas = 0, huDespachadas = 0, huEnPicking = 0, huAlmacenado = 0;
  let costoAcumUF = 0, costoAcumCLP = 0, costoPeriodoUF = 0, costoPeriodoCLP = 0;
  let ingresosHUPeriod = 0, salidasHUPeriod = 0;
  let m2Ocupados = 0, costoDiarioActualCLP = 0;
  const tarifaDiariaUF = MSD.calculateDailyRate(config, config.mesComercialDias);

  for (const hu of consolidated) {
    const estado = MSD.getHUStatus(hu);
    if (estado === 'DESPACHADO') huDespachadas++;
    else if (estado === 'EN_PICKING') huEnPicking++;
    else huAlmacenado++;
    if (estado !== 'DESPACHADO') huActivas++;

    const costo = MSD.calculateHUCost(hu, config, currentPeriod);
    costoAcumUF += costo.costoAcumUF;
    costoAcumCLP += costo.costoAcumCLP;
    costoPeriodoUF += costo.costoPeriodoUF;
    costoPeriodoCLP += costo.costoPeriodoCLP;

    if (currentPeriod && hu.dateInbound && hu.dateInbound >= currentPeriod.start && hu.dateInbound <= currentPeriod.end) ingresosHUPeriod++;
    if (currentPeriod && hu.dateOutbound && hu.dateOutbound >= currentPeriod.start && hu.dateOutbound <= currentPeriod.end) salidasHUPeriod++;
  }

  // m² ocupados y costo diario se derivan del conteo de HU activas (ALMACENADO + EN_PICKING):
  // una HU ocupa espacio físico aunque le falte DATE INBOUND (esa falta ya se reporta en
  // Calidad de Datos y hace que su costo en UF/CLP individual sea 0, sin duplicar el m²).
  m2Ocupados = huActivas * config.m2PorHU;
  costoDiarioActualCLP = huActivas * tarifaDiariaUF * config.valorUF;

  return {
    huUnicasTotales: consolidated.length,
    huActivas, huDespachadas, huEnPicking, huAlmacenado,
    m2Ocupados,
    costoAcumUF, costoAcumCLP, costoPeriodoUF, costoPeriodoCLP,
    costoDiarioActualCLP,
    ingresosHUPeriod, salidasHUPeriod,
    tarifaDiariaUF, tarifaDiariaCLP: tarifaDiariaUF * config.valorUF,
  };
};

/* ---------------------------------------------------------------------------
 * PROYECCIÓN
 * -------------------------------------------------------------------------*/

MSD.calculateProjection = function (consolidated, config, fechaProyeccion) {
  const fechaCorte = config.fechaCorte;
  const tarifaDiariaUF = MSD.calculateDailyRate(config, config.mesComercialDias);
  let huActivas = 0, costoRealAcumUF = 0, costoAdicionalUF = 0;

  const diasProyeccion = fechaProyeccion > fechaCorte ? MSD.daysBetween(fechaCorte, fechaProyeccion) : 0;

  for (const hu of consolidated) {
    if (!MSD.isActiveAtCutoff(hu, fechaCorte)) continue;
    huActivas++;
    costoRealAcumUF += MSD.calculateAccumulatedDays(hu, fechaCorte) * tarifaDiariaUF;
    costoAdicionalUF += diasProyeccion * tarifaDiariaUF;
  }

  const costoTotalUF = costoRealAcumUF + costoAdicionalUF;
  return {
    fechaCorte, fechaProyeccion, diasProyeccion,
    huActivas,
    m2Ocupados: huActivas * config.m2PorHU,
    tarifaDiariaUF, tarifaDiariaCLP: tarifaDiariaUF * config.valorUF,
    costoRealAcumUF, costoRealAcumCLP: costoRealAcumUF * config.valorUF,
    costoAdicionalUF, costoAdicionalCLP: costoAdicionalUF * config.valorUF,
    costoTotalUF, costoTotalCLP: costoTotalUF * config.valorUF,
  };
};

/* ---------------------------------------------------------------------------
 * ANTIGÜEDAD (aging) de inventario activo
 * -------------------------------------------------------------------------*/

MSD.AGING_BUCKETS = [
  { key: '0-7', label: '0-7 días', min: 0, max: 7 },
  { key: '8-15', label: '8-15 días', min: 8, max: 15 },
  { key: '16-30', label: '16-30 días', min: 16, max: 30 },
  { key: '31-60', label: '31-60 días', min: 31, max: 60 },
  { key: '61-90', label: '61-90 días', min: 61, max: 90 },
  { key: '90+', label: 'Más de 90 días', min: 91, max: Infinity },
];

MSD.calculateAging = function (consolidated, config) {
  const fechaCorte = config.fechaCorte;
  const buckets = MSD.AGING_BUCKETS.map((b) => ({ ...b, count: 0, m2: 0, costoAcumUF: 0, costoAcumCLP: 0 }));
  for (const hu of consolidated) {
    if (!MSD.isActiveAtCutoff(hu, fechaCorte)) continue;
    const dias = MSD.calculateAccumulatedDays(hu, fechaCorte);
    const bucket = buckets.find((b) => dias >= b.min && dias <= b.max);
    if (!bucket) continue;
    const costo = MSD.calculateHUCost(hu, config, null);
    bucket.count++;
    bucket.m2 += config.m2PorHU;
    bucket.costoAcumUF += costo.costoAcumUF;
    bucket.costoAcumCLP += costo.costoAcumCLP;
  }
  return buckets;
};

/* ---------------------------------------------------------------------------
 * RESUMEN POR PERÍODO
 * -------------------------------------------------------------------------*/

MSD.calculatePeriodSummary = function (consolidated, config) {
  if (!consolidated.length) return [];
  let minInbound = null, maxRelevant = config.fechaCorte;
  for (const hu of consolidated) {
    if (hu.dateInbound) minInbound = MSD.minDate(minInbound, hu.dateInbound);
  }
  if (config.fechaProyeccion) maxRelevant = MSD.maxDate(maxRelevant, config.fechaProyeccion);
  if (!minInbound) return [];

  const periods = MSD.listPeriods(minInbound, maxRelevant, config.diaInicioCiclo);
  return periods.map((period) => {
    let huAlInicio = 0, huAlCierre = 0, ingresos = 0, salidas = 0, diasHU = 0, costoUF = 0;
    for (const hu of consolidated) {
      if (hu.dateInbound && hu.dateInbound < period.start && (!hu.dateOutbound || hu.dateOutbound >= period.start)) huAlInicio++;
      if (hu.dateInbound && hu.dateInbound <= period.end && (!hu.dateOutbound || hu.dateOutbound > period.end) && hu.dateInbound <= config.fechaCorte) huAlCierre++;
      if (hu.dateInbound && hu.dateInbound >= period.start && hu.dateInbound <= period.end) ingresos++;
      if (hu.dateOutbound && hu.dateOutbound >= period.start && hu.dateOutbound <= period.end) salidas++;
      const costo = MSD.calculateHUCost(hu, config, period);
      diasHU += costo.diasPeriodo;
      costoUF += costo.costoPeriodoUF;
    }
    const huPromedio = (huAlInicio + huAlCierre) / 2;
    return {
      period,
      huPromedio, huAlInicio, huAlCierre,
      m2Promedio: huPromedio * config.m2PorHU,
      ingresosHU: ingresos, salidasHU: salidas,
      diasHU, costoUF, costoCLP: costoUF * config.valorUF,
    };
  });
};

/* ---------------------------------------------------------------------------
 * SERIE DIARIA (para gráficos "por día")
 * -------------------------------------------------------------------------*/

MSD.MAX_CHART_DAYS = 400;

MSD.calculateDailySeries = function (consolidated, config) {
  let minInbound = null;
  for (const hu of consolidated) if (hu.dateInbound) minInbound = MSD.minDate(minInbound, hu.dateInbound);
  const fechaFin = config.fechaCorte;
  if (!minInbound || !fechaFin) return { labels: [], huActivas: [], m2: [], costoAcumCLP: [] };

  let totalDays = MSD.daysBetween(minInbound, fechaFin) + 1;
  let start = minInbound;
  if (totalDays > MSD.MAX_CHART_DAYS) {
    start = MSD.addDays(fechaFin, -MSD.MAX_CHART_DAYS);
    totalDays = MSD.MAX_CHART_DAYS;
  }

  const tarifaDiariaUF = MSD.calculateDailyRate(config, config.mesComercialDias);
  const labels = [], huActivas = [], m2 = [], costoAcumCLP = [];

  for (let i = 0; i < totalDays; i++) {
    const day = MSD.addDays(start, i);
    let active = 0, cost = 0;
    for (const hu of consolidated) {
      if (!hu.dateInbound || hu.dateInbound > day) continue;
      if (hu.dateOutbound && hu.dateOutbound <= day) {
        // ya despachada a esta fecha: igual acumula costo hasta su salida
        cost += MSD.daysBetween(hu.dateInbound, hu.dateOutbound) * tarifaDiariaUF * config.valorUF;
        continue;
      }
      active++;
      cost += MSD.daysBetween(hu.dateInbound, day) * tarifaDiariaUF * config.valorUF;
    }
    labels.push(MSD.formatDate(day));
    huActivas.push(active);
    m2.push(active * config.m2PorHU);
    costoAcumCLP.push(Math.round(cost));
  }
  return { labels, huActivas, m2, costoAcumCLP };
};
