/**
 * Utilitários numéricos e de formatação (padrão brasileiro).
 * Sem dependência de DOM: roda no navegador e em Node (testes).
 */

/** Arredonda para 2 casas (equivalente ao round(x, 2) do script Python, para valores monetários). */
export function round2(n) {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

/** Converte "1.234,56" em 1234.56. */
export function parseBR(str) {
  return Number(String(str).replace(/\./g, '').replace(',', '.'));
}

/**
 * Converte um valor do balancete, com sufixo opcional C/D.
 * Saldo devedor (D) vira negativo, como no script original.
 */
export function parseSaldo(str) {
  const parts = String(str).trim().split(/\s+/);
  const n = parseBR(parts[0]);
  return parts[1] === 'D' ? -n : n;
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
