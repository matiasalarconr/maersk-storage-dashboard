/* ============================================================================
 * charts.js — Gráficos Chart.js. Todos responden a los filtros aplicados en
 * el estado global (MSD.state.filters) porque reciben el set ya filtrado.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

MSD.CHART_COLORS = {
  primary: '#0b5394', primary2: '#3d85c6', accent: '#e08a1e', danger: '#c0392b',
  neutral: '#6b7280', success: '#2e7d4f', grid: 'rgba(0,0,0,0.06)',
  palette: ['#0b5394', '#3d85c6', '#6fa8dc', '#e08a1e', '#2e7d4f', '#c0392b', '#8e44ad', '#16a085', '#7f8c8d', '#d35400'],
};

MSD.destroyChart = function (key) {
  if (MSD.state.charts[key]) { MSD.state.charts[key].destroy(); delete MSD.state.charts[key]; }
};

function baseOptions(extra) {
  return Object.assign({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { grid: { display: false } }, y: { grid: { color: MSD.CHART_COLORS.grid } } },
  }, extra || {});
}

/** Recibe el set de HU ya filtrado y todos los datos calculados; (re)dibuja los 10 gráficos. */
MSD.renderCharts = function (hus, config, dailySeries, periodSummary, aging) {
  MSD.renderChartActivasPorDia(dailySeries);
  MSD.renderChartM2PorDia(dailySeries);
  MSD.renderChartCostoAcumPorDia(dailySeries);
  MSD.renderChartCostoPorPeriodo(periodSummary);
  MSD.renderChartIngresosVsSalidas(periodSummary);
  MSD.renderChartCostoPorProducto(hus, config);
  MSD.renderChartCostoPorLocation(hus, config);
  MSD.renderChartProyeccion(config);
  MSD.renderChartAntiguedad(aging);
  MSD.renderChartHUPorEstado(hus);
};

MSD.renderChartActivasPorDia = function (s) {
  MSD.destroyChart('activasPorDia');
  const ctx = document.getElementById('chartActivasPorDia');
  if (!ctx) return;
  MSD.state.charts.activasPorDia = new Chart(ctx, {
    type: 'line',
    data: { labels: s.labels, datasets: [{ label: 'HU activas', data: s.huActivas, borderColor: MSD.CHART_COLORS.primary, backgroundColor: 'rgba(11,83,148,0.08)', fill: true, pointRadius: 0, tension: 0.15 }] },
    options: baseOptions(),
  });
};

MSD.renderChartM2PorDia = function (s) {
  MSD.destroyChart('m2PorDia');
  const ctx = document.getElementById('chartM2PorDia');
  if (!ctx) return;
  MSD.state.charts.m2PorDia = new Chart(ctx, {
    type: 'line',
    data: { labels: s.labels, datasets: [{ label: 'm² ocupados', data: s.m2, borderColor: MSD.CHART_COLORS.accent, backgroundColor: 'rgba(224,138,30,0.08)', fill: true, pointRadius: 0, tension: 0.15 }] },
    options: baseOptions(),
  });
};

MSD.renderChartCostoAcumPorDia = function (s) {
  MSD.destroyChart('costoAcumPorDia');
  const ctx = document.getElementById('chartCostoAcumPorDia');
  if (!ctx) return;
  MSD.state.charts.costoAcumPorDia = new Chart(ctx, {
    type: 'line',
    data: { labels: s.labels, datasets: [{ label: 'Costo acumulado (CLP)', data: s.costoAcumCLP, borderColor: MSD.CHART_COLORS.success, backgroundColor: 'rgba(46,125,79,0.08)', fill: true, pointRadius: 0, tension: 0.15 }] },
    options: baseOptions({ scales: { x: { grid: { display: false } }, y: { grid: { color: MSD.CHART_COLORS.grid }, ticks: { callback: (v) => MSD.formatCLP(v) } } } }),
  });
};

MSD.renderChartCostoPorPeriodo = function (periodSummary) {
  MSD.destroyChart('costoPorPeriodo');
  const ctx = document.getElementById('chartCostoPorPeriodo');
  if (!ctx) return;
  MSD.state.charts.costoPorPeriodo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: periodSummary.map((p) => p.period.shortLabel),
      datasets: [{ label: 'Costo del período (CLP)', data: periodSummary.map((p) => Math.round(p.costoCLP)), backgroundColor: MSD.CHART_COLORS.primary2 }],
    },
    options: baseOptions({ scales: { x: { grid: { display: false } }, y: { grid: { color: MSD.CHART_COLORS.grid }, ticks: { callback: (v) => MSD.formatCLP(v) } } } }),
  });
};

MSD.renderChartIngresosVsSalidas = function (periodSummary) {
  MSD.destroyChart('ingresosSalidas');
  const ctx = document.getElementById('chartIngresosSalidas');
  if (!ctx) return;
  MSD.state.charts.ingresosSalidas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: periodSummary.map((p) => p.period.shortLabel),
      datasets: [
        { label: 'Ingresos HU', data: periodSummary.map((p) => p.ingresosHU), backgroundColor: MSD.CHART_COLORS.success },
        { label: 'Salidas HU', data: periodSummary.map((p) => p.salidasHU), backgroundColor: MSD.CHART_COLORS.danger },
      ],
    },
    options: baseOptions(),
  });
};

function topN(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

MSD.renderChartCostoPorProducto = function (hus, config) {
  MSD.destroyChart('costoPorProducto');
  const ctx = document.getElementById('chartCostoPorProducto');
  if (!ctx) return;
  const map = new Map();
  for (const hu of hus) {
    const key = hu.producto || hu.descripcion || 'Sin producto';
    const costo = MSD.calcularAlmacenamientoHU(hu, config.fechaInicialCobro, config.fechaCorte, config).costoCLP;
    map.set(key, (map.get(key) || 0) + costo);
  }
  const top = topN(map);
  MSD.state.charts.costoPorProducto = new Chart(ctx, {
    type: 'bar',
    data: { labels: top.map((t) => t[0]), datasets: [{ label: 'Costo acumulado (CLP)', data: top.map((t) => Math.round(t[1])), backgroundColor: MSD.CHART_COLORS.palette }] },
    options: baseOptions({ indexAxis: 'y', scales: { x: { grid: { color: MSD.CHART_COLORS.grid }, ticks: { callback: (v) => MSD.formatCLP(v) } }, y: { grid: { display: false } } } }),
  });
};

MSD.renderChartCostoPorLocation = function (hus, config) {
  MSD.destroyChart('costoPorLocation');
  const ctx = document.getElementById('chartCostoPorLocation');
  if (!ctx) return;
  const map = new Map();
  for (const hu of hus) {
    const key = hu.location || 'Sin ubicación';
    const costo = MSD.calcularAlmacenamientoHU(hu, config.fechaInicialCobro, config.fechaCorte, config).costoCLP;
    map.set(key, (map.get(key) || 0) + costo);
  }
  const top = topN(map);
  MSD.state.charts.costoPorLocation = new Chart(ctx, {
    type: 'bar',
    data: { labels: top.map((t) => t[0]), datasets: [{ label: 'Costo acumulado (CLP)', data: top.map((t) => Math.round(t[1])), backgroundColor: MSD.CHART_COLORS.palette }] },
    options: baseOptions({ indexAxis: 'y', scales: { x: { grid: { color: MSD.CHART_COLORS.grid }, ticks: { callback: (v) => MSD.formatCLP(v) } }, y: { grid: { display: false } } } }),
  });
};

MSD.renderChartProyeccion = function (config) {
  MSD.destroyChart('proyeccion');
  const ctx = document.getElementById('chartProyeccion');
  if (!ctx || !MSD.state.consolidated.length) return;
  const fechaCorte = config.fechaCorte;
  const fechaProy = config.fechaProyeccion || fechaCorte;
  const proy = MSD.calculateProjection(MSD.state.consolidated, config, fechaProy);
  MSD.state.charts.proyeccion = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Real acumulado', 'Adicional proyectado', 'Total proyectado'],
      datasets: [{ label: 'CLP', data: [Math.round(proy.costoRealAcumCLP), Math.round(proy.costoAdicionalCLP), Math.round(proy.costoTotalCLP)], backgroundColor: [MSD.CHART_COLORS.primary, MSD.CHART_COLORS.accent, MSD.CHART_COLORS.success] }],
    },
    options: baseOptions({ scales: { x: { grid: { display: false } }, y: { grid: { color: MSD.CHART_COLORS.grid }, ticks: { callback: (v) => MSD.formatCLP(v) } } } }),
  });
};

MSD.renderChartAntiguedad = function (aging) {
  MSD.destroyChart('antiguedad');
  const ctx = document.getElementById('chartAntiguedad');
  if (!ctx) return;
  MSD.state.charts.antiguedad = new Chart(ctx, {
    type: 'bar',
    data: { labels: aging.map((b) => b.label), datasets: [{ label: 'HU activas', data: aging.map((b) => b.count), backgroundColor: MSD.CHART_COLORS.palette }] },
    options: baseOptions(),
  });
};

MSD.renderChartHUPorEstado = function (hus) {
  MSD.destroyChart('huPorEstado');
  const ctx = document.getElementById('chartHUPorEstado');
  if (!ctx) return;
  const counts = { ALMACENADO: 0, EN_PICKING: 0, DESPACHADO: 0 };
  for (const hu of hus) counts[MSD.getHUStatus(hu)]++;
  MSD.state.charts.huPorEstado = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Almacenado', 'En picking / salida', 'Despachado'],
      datasets: [{ data: [counts.ALMACENADO, counts.EN_PICKING, counts.DESPACHADO], backgroundColor: [MSD.CHART_COLORS.primary, MSD.CHART_COLORS.accent, MSD.CHART_COLORS.neutral] }],
    },
    options: baseOptions({ scales: undefined }),
  });
};
