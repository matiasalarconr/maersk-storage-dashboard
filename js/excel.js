/* ============================================================================
 * excel.js — Lectura de Excel (SheetJS), detección de encabezados y
 * normalización de filas de la hoja INVENTARIO. Todo se procesa en el
 * navegador; el archivo nunca sale del equipo del usuario.
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/** Alias de encabezados conocidos (clave canónica -> lista de variantes normalizadas). */
MSD.HEADER_ALIASES = {
  hu: ['HU'],
  location: ['LOCATION'],
  personalPutAway: ['PERSONAL PUT AWAY'],
  dateInbound: ['DATE INBOUND'],
  datePicking: ['DATE PICKING'],
  dateOutbound: ['DATE OUTBOUND'],
  lote: ['LOTE'],
  cruce: ['CRUCE'],
  invTransfer: ['INV TRANSFER'],
  producto: ['PRODUCTO', 'SKU'],
  descripcion: ['DESCRIPCION'],
  loteProduccion: ['LOTE PRODUCCION'],
  cantidad: ['CANTIDAD'],
  vencimiento: ['VENCIMIENTO', 'CADUCIDAD'],
  diasVencer: ['DIAS POR VENCER', 'DIAS A VENCER', 'DUAS A VENCER', 'DUAS POR VENCER'],
  cliente: ['CLIENTE'],
  nPallet: ['N PALLET', 'NRO PALLET', 'NUMERO PALLET'],
  fecha: ['FECHA'],
};

/** Normaliza un texto de encabezado: mayúsculas, sin acentos, sin espacios extra ni símbolos. */
MSD.normalizeHeaderName = function (raw) {
  return String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[°º]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

/** Construye el mapa {campoCanonico: índiceColumna} a partir de una fila de encabezados. */
MSD.buildHeaderMap = function (headerRow) {
  const normalized = headerRow.map(MSD.normalizeHeaderName);
  const map = {};
  for (const [field, aliases] of Object.entries(MSD.HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) { map[field] = idx; break; }
    }
  }
  return { map, normalized };
};

/**
 * Detecta automáticamente la fila de encabezados dentro de las primeras filas
 * de la hoja. Requiere encontrar al menos la columna HU y 2 columnas más
 * reconocidas para considerarla válida.
 */
MSD.detectHeaderRow = function (rows, maxScan = 15) {
  let best = { idx: -1, score: 0, map: null };
  const limit = Math.min(maxScan, rows.length);
  for (let i = 0; i < limit; i++) {
    const { map } = MSD.buildHeaderMap(rows[i]);
    const score = Object.keys(map).length;
    if (map.hu !== undefined && score > best.score) {
      best = { idx: i, score, map };
    }
  }
  if (best.idx === -1 || best.score < 3) return null;
  return best;
};

/** Convierte un valor de celda de fecha (Date, serial numérico o texto) a Date UTC o null. */
MSD.normalizeDate = function (value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return MSD.toDateOnly(value);
  }
  if (typeof value === 'number') {
    // Serial de Excel (base 30-dic-1899)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return MSD.toDateOnly(d);
  }
  const s = String(value).trim();
  if (!s) return null;
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // dd-mm-yyyy o dd/mm/yyyy o d/m/yy (heurística: día primero si > 12)
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    a = +a; b = +b; y = +y;
    if (y < 100) y += 2000;
    let day, month;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { day = b; month = a; }
    else { day = a; month = b; } // ambiguo -> asume dd/mm (convención chilena)
    const d = new Date(Date.UTC(y, month - 1, day));
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }
  return null; // fecha inválida / no reconocida
};

/** Parsea CANTIDAD u otro campo numérico tolerando texto con separadores. */
MSD.normalizeNumber = function (value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const n = MSD.parseUFValue(value);
  return n === null ? 0 : n;
};

/** Normaliza una fila cruda del Excel a un objeto de campos canónicos. */
MSD.normalizeRow = function (rawRow, headerMap, fuente, rowNumber) {
  const get = (field) => {
    const idx = headerMap[field];
    return idx === undefined ? '' : rawRow[idx];
  };
  const dateErrors = [];
  const parseDateField = (field, label) => {
    const raw = get(field);
    const parsed = MSD.normalizeDate(raw);
    if (raw !== '' && raw !== null && raw !== undefined && parsed === null) {
      dateErrors.push(`${label}: "${raw}" no es una fecha válida`);
    }
    return parsed;
  };

  const hu = String(get('hu') ?? '').trim();
  return {
    hu,
    location: String(get('location') ?? '').trim(),
    personalPutAway: String(get('personalPutAway') ?? '').trim(),
    dateInbound: parseDateField('dateInbound', 'DATE INBOUND'),
    datePicking: parseDateField('datePicking', 'DATE PICKING'),
    dateOutbound: parseDateField('dateOutbound', 'DATE OUTBOUND'),
    lote: String(get('lote') ?? '').trim(),
    cruce: String(get('cruce') ?? '').trim(),
    invTransfer: String(get('invTransfer') ?? '').trim(),
    producto: String(get('producto') ?? '').trim(),
    descripcion: String(get('descripcion') ?? '').trim(),
    loteProduccion: String(get('loteProduccion') ?? '').trim(),
    cantidad: MSD.normalizeNumber(get('cantidad')),
    vencimiento: parseDateField('vencimiento', 'VENCIMIENTO/CADUCIDAD'),
    diasVencer: get('diasVencer'),
    cliente: String(get('cliente') ?? '').trim(),
    nPallet: String(get('nPallet') ?? '').trim(),
    fuente,
    rowNumber,
    dateErrors,
  };
};

MSD.normalizeRows = function (rows, headerRowInfo, fuente) {
  const { idx, map } = headerRowInfo;
  const out = [];
  for (let i = idx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c === '' || c === null || c === undefined)) continue;
    const normalized = MSD.normalizeRow(r, map, fuente, i + 1);
    if (!normalized.hu) continue; // fila sin HU no es un registro de inventario válido
    out.push(normalized);
  }
  return out;
};

/**
 * Lee un archivo Excel (File) y devuelve las filas normalizadas de la hoja INVENTARIO.
 * Retorna { ok: true, rows } o { ok: false, error }.
 */
MSD.parseExcel = async function (file) {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames.find((n) => MSD.normalizeHeaderName(n) === 'INVENTARIO');
    if (!sheetName) {
      return { ok: false, error: `El archivo no contiene una hoja llamada "INVENTARIO". Hojas encontradas: ${wb.SheetNames.join(', ')}` };
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rows.length) {
      return { ok: false, error: 'La hoja INVENTARIO está vacía.' };
    }
    const headerInfo = MSD.detectHeaderRow(rows);
    if (!headerInfo) {
      return { ok: false, error: 'No se pudo detectar una fila de encabezados válida (se requiere al menos la columna HU) en las primeras 15 filas de INVENTARIO.' };
    }
    if (headerInfo.map.dateInbound === undefined) {
      return { ok: false, error: 'No se encontró la columna DATE INBOUND en la hoja INVENTARIO. Revisa el archivo.' };
    }
    const normalizedRows = MSD.normalizeRows(rows, headerInfo, file.name);
    if (!normalizedRows.length) {
      return { ok: false, error: 'No se encontraron filas de datos con HU válida en la hoja INVENTARIO.' };
    }
    return { ok: true, rows: normalizedRows, headerRowIndex: headerInfo.idx };
  } catch (e) {
    console.error(e);
    return { ok: false, error: `No se pudo leer el archivo (¿está corrupto o no es un .xlsx válido?): ${e.message}` };
  }
};
