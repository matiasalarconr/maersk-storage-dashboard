/* ============================================================================
 * calculations.js — ÚNICA FUENTE DE VERDAD para el cálculo de almacenamiento.
 *
 * Metodología (corregida):
 *   - Existe una única FECHA_INICIAL_COBRO configurable (no se usa DATE INBOUND
 *     como inicio del cobro).
 *   - Fecha de salida de una HU = la más temprana entre DATE PICKING y
 *     DATE OUTBOUND/despacho (la que exista). Si no existe ninguna, la HU sigue
 *     almacenada y se usa la fecha de corte ("hoy") como fin de cálculo.
 *   - Días almacenados = (fecha_final - FECHA_INICIAL_COBRO) + 1 (el propio día
 *     de inicio ya cuenta como día 1). Si fecha_final < FECHA_INICIAL_COBRO → 0.
 *   - Costo HU = 1,8 m² × días almacenados × tarifa diaria por m².
 *
 * Todo el resto de la app (KPIs, tabla de detalle, facturación, antigüedad,
 * proyección, gráficos "por día") consume MSD.calcularAlmacenamientoHU() para
 * que exista una sola definición de costo de almacenamiento en todo el sistema.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/* ---------------------------------------------------------------------------
 * CICLO 28→27 — se usa solo para AGRUPAR/ETIQUETAR períodos históricos
 * (ingresos, salidas, próximo cierre). NO determina el inicio del cobro.
 * -------------------------------------------------------------------------*/

MSD.periodStartFor = function (date, dayStart = 28) {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth();
  if (date.getUTCDate() < dayStart) m -= 1; // Date normaliza meses negativos automáticamente
  return new Date(Date.UTC(y, m, dayStart));
};

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

MSD.getBillingPeriod = function (date, dayStart = 28) {
  const start = MSD.periodStartFor(date, dayStart);
  const end = MSD.periodEndFor(start, dayStart);
  return { start, end, label: MSD.periodLabel(start, end), shortLabel: MSD.periodShortLabel(end) };
};

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
 * ★ FUENTE ÚNICA DE VERDAD: fecha de salida y costo de almacenamiento por HU
 * -------------------------------------------------------------------------*/

/**
 * Determina la fecha en que una HU dejó de generar almacenamiento:
 *   1. Si tiene DATE PICKING válida → candidata.
 *   2. Si tiene DATE OUTBOUND/despacho válida → candidata.
 *   3. Si existen ambas, se usa la más temprana (la primera señal real de que
 *      el producto dejó de estar almacenado).
 *   4. Si no existe ninguna, retorna null (la HU sigue almacenada).
 */
MSD.determinarFechaOutboundHU = function (hu) {
  const candidatas = [hu.datePicking, hu.dateOutbound].filter(Boolean);
  if (!candidatas.length) return null;
  return candidatas.reduce((min, d) => (d < min ? d : min));
};

/**
 * Calcula el almacenamiento de una HU entre `fechaInicio` (FECHA_INICIAL_COBRO,
 * día 1) y su fecha de salida real, o `fechaFinSiActivo` (típicamente la fecha
 * de corte / hoy) si todavía sigue almacenada.
 *
 *   dias = 0                                         si fechaFinal < fechaInicio
 *   dias = (fechaFinal - fechaInicio) + 1             en caso contrario
 *   costo = 1,8 m² × dias × tarifaDiariaM2
 */
MSD.calcularAlmacenamientoHU = function (hu, fechaInicio, fechaFinSiActivo, config) {
  const fechaSalidaReal = MSD.determinarFechaOutboundHU(hu);
  const estaAlmacenado = !fechaSalidaReal;
  // Nunca se sigue cobrando más allá de la salida real; y nunca más allá del
  // límite del período/corte que se esté evaluando.
  const fechaOutboundUtilizada = fechaSalidaReal
    ? MSD.minDate(fechaSalidaReal, fechaFinSiActivo)
    : fechaFinSiActivo;

  let dias = 0;
  if (fechaInicio && fechaOutboundUtilizada && fechaOutboundUtilizada >= fechaInicio) {
    dias = MSD.daysBetween(fechaInicio, fechaOutboundUtilizada) + 1; // fechaInicio = Día 1
  }

  const tarifaDiariaM2UF = config.tarifaUFm2mes / config.mesComercialDias;
  const tarifaDiariaM2CLP = tarifaDiariaM2UF * config.valorUF;
  const costoUF = config.m2PorHU * dias * tarifaDiariaM2UF;
  const costoCLP = costoUF * config.valorUF;

  return {
    fechaOutboundUtilizada, diasAlmacenamiento: dias,
    m2: config.m2PorHU, tarifaDiariaM2UF, tarifaDiariaM2CLP,
    costoUF, costoCLP, estaAlmacenado,
  };
};

/* ---------------------------------------------------------------------------
 * KPIs
 * -------------------------------------------------------------------------*/

MSD.calculateKPIs = function (consolidated, config, currentPeriod) {
  const fechaInicio = config.fechaInicialCobro;
  const fechaCorte = config.fechaCorte;
  let huAlmacenadas = 0, huRetiradas = 0, huDespachadas = 0, huEnPicking = 0;
  let costoTotalUF = 0, costoTotalCLP = 0, costoAlmacenadasCLP = 0, costoRetiradasCLP = 0;
  let ingresosHUPeriod = 0, salidasHUPeriod = 0;

  for (const hu of consolidated) {
    const calc = MSD.calcularAlmacenamientoHU(hu, fechaInicio, fechaCorte, config);
    costoTotalUF += calc.costoUF;
    costoTotalCLP += calc.costoCLP;
    if (calc.estaAlmacenado) { huAlmacenadas++; costoAlmacenadasCLP += calc.costoCLP; }
    else { huRetiradas++; costoRetiradasCLP += calc.costoCLP; }

    const estado = MSD.getHUStatus(hu);
    if (estado === 'DESPACHADO') huDespachadas++;
    else if (estado === 'EN_PICKING') huEnPicking++;

    if (currentPeriod && hu.dateInbound && hu.dateInbound >= currentPeriod.start && hu.dateInbound <= currentPeriod.end) ingresosHUPeriod++;
    if (currentPeriod && hu.dateOutbound && hu.dateOutbound >= currentPeriod.start && hu.dateOutbound <= currentPeriod.end) salidasHUPeriod++;
  }

  const tarifaDiariaM2CLP = (config.tarifaUFm2mes / config.mesComercialDias) * config.valorUF;
  const tarifaDiariaHUCLP = tarifaDiariaM2CLP * config.m2PorHU;
  const m2Ocupados = huAlmacenadas * config.m2PorHU; // sección 12: HU actualmente almacenados × 1,8

  return {
    huUnicasTotales: consolidated.length,
    huAlmacenadas, huRetiradas, huDespachadas, huEnPicking,
    m2Ocupados,
    costoTotalUF, costoTotalCLP, costoAlmacenadasCLP, costoRetiradasCLP,
    costoDiarioActualCLP: huAlmacenadas * tarifaDiariaHUCLP,
    tarifaDiariaHUCLP, tarifaDiariaM2CLP,
    ingresosHUPeriod, salidasHUPeriod,
  };
};

/* ---------------------------------------------------------------------------
 * PROYECCIÓN — extiende el costo de las HU aún almacenadas desde la fecha de
 * corte hasta la fecha de proyección, con la misma tarifa diaria.
 * -------------------------------------------------------------------------*/

MSD.calculateProjection = function (consolidated, config, fechaProyeccion) {
  const fechaInicio = config.fechaInicialCobro;
  const fechaCorte = config.fechaCorte;
  const tarifaDiariaM2CLP = (config.tarifaUFm2mes / config.mesComercialDias) * config.valorUF;
  const tarifaDiariaHUCLP = tarifaDiariaM2CLP * config.m2PorHU;
  const diasProyeccion = (fechaProyeccion && fechaProyeccion > fechaCorte) ? MSD.daysBetween(fechaCorte, fechaProyeccion) : 0;

  let huActivas = 0, costoRealAcumCLP = 0, costoAdicionalCLP = 0;
  for (const hu of consolidated) {
    const calc = MSD.calcularAlmacenamientoHU(hu, fechaInicio, fechaCorte, config);
    if (!calc.estaAlmacenado) continue;
    huActivas++;
    costoRealAcumCLP += calc.costoCLP;
    costoAdicionalCLP += diasProyeccion * tarifaDiariaHUCLP;
  }
  const costoTotalCLP = costoRealAcumCLP + costoAdicionalCLP;

  return {
    fechaCorte, fechaProyeccion, diasProyeccion,
    huActivas,
    m2Ocupados: huActivas * config.m2PorHU,
    tarifaDiariaUF: tarifaDiariaHUCLP / config.valorUF, tarifaDiariaCLP: tarifaDiariaHUCLP,
    costoRealAcumCLP, costoAdicionalCLP, costoTotalCLP,
  };
};

/* ---------------------------------------------------------------------------
 * ANTIGÜEDAD (aging) de HU actualmente almacenadas
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
  const buckets = MSD.AGING_BUCKETS.map((b) => ({ ...b, count: 0, m2: 0, costoUF: 0, costoCLP: 0 }));
  for (const hu of consolidated) {
    const calc = MSD.calcularAlmacenamientoHU(hu, config.fechaInicialCobro, config.fechaCorte, config);
    if (!calc.estaAlmacenado) continue;
    const bucket = buckets.find((b) => calc.diasAlmacenamiento >= b.min && calc.diasAlmacenamiento <= b.max);
    if (!bucket) continue;
    bucket.count++;
    bucket.m2 += config.m2PorHU;
    bucket.costoUF += calc.costoUF;
    bucket.costoCLP += calc.costoCLP;
  }
  return buckets;
};

/* ---------------------------------------------------------------------------
 * RESUMEN POR PERÍODO (histórico, agrupado por ciclo 28→27)
 *
 * El costo de Almacenamiento SOLO puede calcularse con la metodología nueva
 * para el período vigente (el que usa FECHA_INICIAL_COBRO): para períodos ya
 * cerrados no existe una fecha de inicio de cobro válida en este sistema
 * (backdatarla al inicio automático del ciclo 28→27 cobraría días en que las
 * HU todavía no existían en bodega), así que esos períodos solo muestran
 * ingresos/salidas de HU (eventos reales, no afectados por la metodología).
 * -------------------------------------------------------------------------*/

MSD.calculatePeriodSummary = function (consolidated, config) {
  if (!consolidated.length) return [];
  let minInbound = null, maxRelevant = config.fechaCorte;
  for (const hu of consolidated) {
    if (hu.dateInbound) minInbound = MSD.minDate(minInbound, hu.dateInbound);
  }
  if (config.fechaProyeccion) maxRelevant = MSD.maxDate(maxRelevant, config.fechaProyeccion);
  if (!minInbound) return [];

  const currentPeriod = MSD.getBillingPeriod(config.fechaCorte, config.diaInicioCiclo);
  const periods = MSD.listPeriods(minInbound, maxRelevant, config.diaInicioCiclo);
  return periods.map((period) => {
    const esPeriodoActual = period.start.getTime() === currentPeriod.start.getTime();
    const fechaFinCap = MSD.minDate(config.fechaCorte, period.end);
    let huAlInicio = 0, huAlCierre = 0, ingresos = 0, salidas = 0, diasHU = 0, costoUF = 0, costoCLP = 0;
    for (const hu of consolidated) {
      if (hu.dateInbound && hu.dateInbound < period.start && (!hu.dateOutbound || hu.dateOutbound >= period.start)) huAlInicio++;
      if (hu.dateInbound && hu.dateInbound <= period.end && (!hu.dateOutbound || hu.dateOutbound > period.end) && hu.dateInbound <= config.fechaCorte) huAlCierre++;
      if (hu.dateInbound && hu.dateInbound >= period.start && hu.dateInbound <= period.end) ingresos++;
      if (hu.dateOutbound && hu.dateOutbound >= period.start && hu.dateOutbound <= period.end) salidas++;
      if (esPeriodoActual) {
        const calc = MSD.calcularAlmacenamientoHU(hu, config.fechaInicialCobro, fechaFinCap, config);
        diasHU += calc.diasAlmacenamiento;
        costoUF += calc.costoUF;
        costoCLP += calc.costoCLP;
      }
    }
    const huPromedio = (huAlInicio + huAlCierre) / 2;
    return {
      period, esPeriodoActual,
      fechaInicioEfectivo: esPeriodoActual ? config.fechaInicialCobro : null,
      huPromedio, huAlInicio, huAlCierre,
      m2Promedio: huPromedio * config.m2PorHU,
      ingresosHU: ingresos, salidasHU: salidas,
      diasHU: esPeriodoActual ? diasHU : null,
      costoUF: esPeriodoActual ? costoUF : null,
      costoCLP: esPeriodoActual ? costoCLP : null,
    };
  });
};

/* ---------------------------------------------------------------------------
 * SITUACIÓN ACTUAL Y PROYECCIÓN A LA PRÓXIMA FACTURA (día 28)
 * -------------------------------------------------------------------------*/

MSD.calculateSituacionActual = function (consolidated, config) {
  const fechaInicio = config.fechaInicialCobro;
  const fechaCorte = config.fechaCorte;
  const currentPeriod = MSD.getBillingPeriod(fechaCorte, config.diaInicioCiclo);
  const kpis = MSD.calculateKPIs(consolidated, config, currentPeriod);

  const diasTranscurridos = (fechaInicio && fechaCorte && fechaCorte >= fechaInicio)
    ? MSD.daysBetween(fechaInicio, fechaCorte) + 1 : 0;

  const fechaProximaFactura = MSD.addDays(currentPeriod.end, 1); // próximo día 28
  const diasRestantesPeriodo = MSD.daysBetween(fechaCorte, fechaProximaFactura);
  const costoProyectadoCLP = kpis.costoTotalCLP + kpis.huAlmacenadas * kpis.tarifaDiariaHUCLP * diasRestantesPeriodo;

  return {
    fechaCorte, fechaInicio, diasTranscurridos,
    huAlmacenadas: kpis.huAlmacenadas, huRetiradas: kpis.huRetiradas, huDespachadas: kpis.huDespachadas,
    m2Ocupados: kpis.m2Ocupados,
    costoTotalCLP: kpis.costoTotalCLP, costoAlmacenadasCLP: kpis.costoAlmacenadasCLP, costoRetiradasCLP: kpis.costoRetiradasCLP,
    costoDiarioActualCLP: kpis.costoDiarioActualCLP,
    fechaProximaFactura, diasRestantesPeriodo, costoProyectadoCLP,
  };
};

/* ---------------------------------------------------------------------------
 * FACTURACIÓN POR PERÍODO (vista reducida: Inbound / Outbound / Almacenamiento)
 * Inbound/Outbound: tarifas de la Tabla N°1 de servicios Warehouse, aplicadas
 * por evento (HU con DATE INBOUND / DATE OUTBOUND dentro del período).
 * Almacenamiento: MSD.calcularAlmacenamientoHU() — misma fuente que el resto.
 * -------------------------------------------------------------------------*/

MSD.calculateFacturacionPeriodo = function (consolidated, config) {
  // Solo el período vigente (el que usa FECHA_INICIAL_COBRO) tiene un costo de
  // Almacenamiento calculable con esta metodología; ver nota en calculatePeriodSummary.
  const summary = MSD.calculatePeriodSummary(consolidated, config).filter((row) => row.esPeriodoActual);
  if (!summary.length) return [];
  return summary.map((row) => {
    const inboundUF = row.ingresosHU * config.tarifaInboundUF;
    const outboundUF = row.salidasHU * config.tarifaOutboundUF;
    return {
      period: row.period,
      label: `${MSD.formatDate(row.fechaInicioEfectivo)} → ${MSD.formatDate(row.period.end)}`,
      inboundUF, inboundCLP: inboundUF * config.valorUF,
      outboundUF, outboundCLP: outboundUF * config.valorUF,
      almacenamientoUF: row.costoUF, almacenamientoCLP: row.costoCLP,
    };
  });
};

/* ---------------------------------------------------------------------------
 * SERIE DIARIA (para gráficos "por día"), anclada en FECHA_INICIAL_COBRO
 * -------------------------------------------------------------------------*/

MSD.MAX_CHART_DAYS = 400;

MSD.calculateDailySeries = function (consolidated, config) {
  const fechaInicio = config.fechaInicialCobro;
  const fechaFin = config.fechaCorte;
  if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) return { labels: [], huActivas: [], m2: [], costoAcumCLP: [] };

  let totalDays = MSD.daysBetween(fechaInicio, fechaFin) + 1;
  let start = fechaInicio;
  if (totalDays > MSD.MAX_CHART_DAYS) {
    start = MSD.addDays(fechaFin, -(MSD.MAX_CHART_DAYS - 1));
    totalDays = MSD.MAX_CHART_DAYS;
  }

  const tarifaDiariaHUCLP = (config.tarifaUFm2mes / config.mesComercialDias) * config.valorUF * config.m2PorHU;
  const salidas = consolidated.map((hu) => MSD.determinarFechaOutboundHU(hu));
  const labels = [], huActivas = [], m2 = [], costoAcumCLP = [];

  for (let i = 0; i < totalDays; i++) {
    const day = MSD.addDays(start, i);
    let active = 0, cost = 0;
    for (let idx = 0; idx < consolidated.length; idx++) {
      const salida = salidas[idx];
      const activaHoy = !salida || salida > day;
      const outboundEfectivo = activaHoy ? day : salida;
      if (outboundEfectivo >= fechaInicio) cost += (MSD.daysBetween(fechaInicio, outboundEfectivo) + 1) * tarifaDiariaHUCLP;
      if (activaHoy) active++;
    }
    labels.push(MSD.formatDate(day));
    huActivas.push(active);
    m2.push(active * config.m2PorHU);
    costoAcumCLP.push(Math.round(cost));
  }
  return { labels, huActivas, m2, costoAcumCLP };
};
