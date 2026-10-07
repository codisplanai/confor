/**
 * Utilitários numéricos e de formatação (padrão brasileiro).
 * Sem dependência de DOM: roda no navegador e em Node (testes).
 */

/** Arredonda para 2 casas (equivalente ao round(x, 2) do script Python, para valores monetários). */
export function round2(n) {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

/** Converte "1.234,56", "(1.234,56)", "R$ 1.234,56", etc. em número float. */
export function parseBR(str) {
  if (str === null || str === undefined) return 0;
  let s = String(str).trim();
  if (!s) return 0;
  const isNeg = (s.startsWith('(') && s.endsWith(')')) || s.startsWith('-');
  s = s.replace(/[()R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (isNaN(n)) return 0;
  return isNeg ? -Math.abs(n) : n;
}

/**
 * Converte um valor do balancete, com sufixo opcional C/D (com ou sem espaço).
 * Saldo devedor (D) vira negativo, como no script original.
 */
export function parseSaldo(str) {
  if (str === null || str === undefined) return 0;
  const s = String(str).trim();
  if (!s) return 0;
  const isDevedor = /D$/i.test(s);
  const clean = s.replace(/[CDcd]$/i, '').trim();
  const n = parseBR(clean);
  return isDevedor ? -Math.abs(n) : n;
}

const nf = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 -> "1.234,50" */
export function fmtNum(n) {
  return nf.format(round2(n));
}

/** 1234.5 -> "R$ 1.234,50" (negativos: "-R$ 1.234,50") */
export function fmtBRL(n) {
  const v = round2(n);
  return (v < 0 ? '-R$ ' : 'R$ ') + nf.format(Math.abs(v));
}

/** 12.3 -> "+12,30"; -12.3 -> "-12,30" (usado nos textos de diagnóstico) */
export function fmtSigned(n) {
  const v = round2(n);
  return (v < 0 ? '-' : '+') + nf.format(Math.abs(v));
}

/** Soma com arredondamento final em centavos. */
export function sum(list, pick = (x) => x) {
  let t = 0;
  for (const item of list) t += pick(item);
  return round2(t);
}
