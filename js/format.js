/* ============================================================================
 * format.js — Formato chileno (CLP, UF, fechas) y utilidades de fecha en UTC
 * ==========================================================================*/

var MSD = window.MSD || (window.MSD = {});

/** Trunca un Date a medianoche UTC (elimina ruido horario de las celdas Excel). */
MSD.toDateOnly = function (d) {
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

MSD.todayUTC = function () {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

/** Días entre dos fechas (a <= b), convención "noches almacenadas". */
MSD.daysBetween = function (a, b) {
  if (!a || !b) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
};

MSD.addDays = function (d, n) {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
};

MSD.minDate = function (a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
};

MSD.maxDate = function (a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

/** dd-mm-yyyy -> Date (UTC) | null */
MSD.parseISODateInput = function (str) {
  if (!str) return null;
  const parts = String(str).split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

/** Date -> yyyy-mm-dd (para <input type=date>) */
MSD.toInputDate = function (d) {
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Date -> dd-mm-yyyy (para mostrar) */
MSD.formatDate = function (d) {
  if (!d) return '—';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}-${m}-${y}`;
};

MSD.formatDateTime = function (d) {
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${m}-${y} ${hh}:${mm}`;
};

/** Formatea número como CLP: $ 1.234.567 */
MSD.formatCLP = function (n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const rounded = Math.round(n);
  return '$ ' + rounded.toLocaleString('es-CL');
};

/** Formatea número como UF: 1.234,567 UF */
MSD.formatUF = function (n, decimals = 3) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' UF';
};

MSD.formatNumber = function (n, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/**
 * Convierte texto de valor UF en distintos formatos a número:
 * "40864,55" | "40.864,55" | "40864.55" | "$40.864,55" -> 40864.55
 * Retorna null si el valor es inválido (vacío, cero, negativos, texto no numérico).
 */
MSD.parseUFValue = function (input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/\$/g, '').replace(/\s/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // formato chileno: punto = miles, coma = decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // "40864,55" -> decimal con coma
    s = s.replace(',', '.');
  } else if (hasDot && !hasComma) {
    // ambiguo: "40864.55" (decimal) vs "40.864" (miles). Si hay más de un punto o
    // el grupo final tiene 3 dígitos exactos y el primero <=3 dígitos, tratamos como miles.
    const dotParts = s.split('.');
    if (dotParts.length > 2) {
      s = dotParts.join(''); // varios puntos -> todos son separadores de miles
    } else if (dotParts[1] && dotParts[1].length === 3 && dotParts[0].length <= 3) {
      s = dotParts.join(''); // "40.864" -> 40864
    }
    // si no, se asume punto decimal tal cual ("40864.55")
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};
