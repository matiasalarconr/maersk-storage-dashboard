/* ============================================================================
 * config.js — Configuración central, estado global y persistencia (localStorage)
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/** Valores por defecto de los parámetros del cálculo. */
MSD.DEFAULT_CONFIG = {
  valorUF: 40864.55,
  fechaUF: '2026-08-24',
  tarifaUFm2mes: 0.26,
  m2PorHU: 1.8,
  tarifaInboundUF: 0.076,   // Tabla N°1: Ingreso carga paletizada - Inbound (UF/Pallet)
  tarifaOutboundUF: 0.076,  // Tabla N°1: Despacho carga Paletizada - Outbound (UF/pallet)
  mesComercialDias: 30,
  diaInicioCiclo: 28,
  metodologiaDias: 'A', // 'A' = mes comercial 30 días, 'B' = días reales del período
  fechaCorte: null,        // se fija a "hoy" (o última fecha de datos) al cargar inventario
  fechaProyeccion: null,   // se fija al próximo cierre al cargar inventario
  fechaInicialCobro: null, // FECHA_INICIAL_COBRO — única fecha de inicio de cobro (día 1). Se fija por defecto al cargar.
};

/** Valor por defecto de FECHA_INICIAL_COBRO si nunca se ha configurado: 27-08-2026. */
MSD.DEFAULT_FECHA_INICIAL_COBRO = () => new Date(Date.UTC(2026, 7, 27));

MSD.LS_KEY = 'msd_config_v1';

/** Carga configuración persistida (solo parámetros, nunca inventario/Excel). */
MSD.loadPersistedConfig = function () {
  let merged;
  try {
    const raw = localStorage.getItem(MSD.LS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    merged = { ...MSD.DEFAULT_CONFIG, ...saved };
  } catch (e) {
    console.warn('No se pudo leer configuración persistida:', e);
    merged = { ...MSD.DEFAULT_CONFIG };
  }
  // JSON.stringify serializa los Date como texto ISO; hay que reconstruirlos.
  if (merged.fechaCorte) merged.fechaCorte = new Date(merged.fechaCorte);
  if (merged.fechaProyeccion) merged.fechaProyeccion = new Date(merged.fechaProyeccion);
  merged.fechaInicialCobro = merged.fechaInicialCobro ? new Date(merged.fechaInicialCobro) : MSD.DEFAULT_FECHA_INICIAL_COBRO();
  return merged;
};

MSD.persistConfig = function (config) {
  try {
    const toSave = {
      valorUF: config.valorUF,
      fechaUF: config.fechaUF,
      tarifaUFm2mes: config.tarifaUFm2mes,
      m2PorHU: config.m2PorHU,
      tarifaInboundUF: config.tarifaInboundUF,
      tarifaOutboundUF: config.tarifaOutboundUF,
      mesComercialDias: config.mesComercialDias,
      diaInicioCiclo: config.diaInicioCiclo,
      metodologiaDias: config.metodologiaDias,
      fechaCorte: config.fechaCorte,
      fechaProyeccion: config.fechaProyeccion,
      fechaInicialCobro: config.fechaInicialCobro,
    };
    localStorage.setItem(MSD.LS_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('No se pudo guardar configuración:', e);
  }
};

/** Estado global de la aplicación (inventario, resultados calculados, etc). */
MSD.state = {
  config: MSD.loadPersistedConfig(),
  files: {
    f1: { name: null, loadedAt: null, rowCount: 0, huCount: 0, rows: [], error: null, status: 'vacio' },
    f2: { name: null, loadedAt: null, rowCount: 0, huCount: 0, rows: [], error: null, status: 'vacio' },
  },
  consolidated: [],     // array de HU consolidadas
  quality: [],           // inconsistencias detectadas
  kpis: null,
  projection: null,
  periodSummary: [],
  aging: [],
  dailySeries: null,
  charts: {},
  filters: {
    estado: '', producto: '', location: '', hu: '', fuente: '',
  },
};

/** Tarifa mensual en UF por HU, derivada de config. */
MSD.tarifaMensualUFporHU = function (config) {
  return config.m2PorHU * config.tarifaUFm2mes;
};

/** Tarifa diaria "base" (mes comercial fijo) en UF por HU. */
MSD.tarifaDiariaUFporHU = function (config) {
  return MSD.tarifaMensualUFporHU(config) / config.mesComercialDias;
};
