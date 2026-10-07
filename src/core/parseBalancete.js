import { parseBR, parseSaldo, round2 } from './money.js';

export const DEFAULT_ACCOUNT = '2101010000';

/**
 * Extrai as contas analíticas de fornecedores do Balancete Analítico.
 * Porta de `parse_balancete` (conciliacao_fornecedores.py).
 *
 * @param {string[][]} pages linhas por página
 * @param {{account?: string}} [opts] código da conta do grupo de fornecedores
 */
export function parseBalancete(pages, opts = {}) {
  const account = (opts.account || DEFAULT_ACCOUNT).trim();
  const suppliers = new Map();
  let capturing = false;
  let groupFound = false;
  let totals = null;
  let ignored = 0;

  const rowRe =
    /^\d{5}-\d\s+(\d+)\s+(\d{10})\s*(.*?)\s+([\d.,]+(?:\s+[CD])?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+(?:\s+[CD])?)$/;

  pages.forEach((lines, pageIdx) => {
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (line.includes(account) && /FORNECEDOR/i.test(line) && !/^\d{5}-\d\s+\d+\s+\d{10}/.test(line)) {
        capturing = true;
        groupFound = true;
        continue;
      }

      if (/TOTAL\s+DA\s+CONTA/i.test(line) && line.includes(account)) {
        capturing = false;
        // Ex: TOTAL DA CONTA 2101010000 2.829.760,20 C 2.259.149,72 2.309.729,62 2.880.340,10 C
        const tail = line.slice(line.indexOf(account) + account.length).trim();
        const m = tail.match(
          /([\d.,]+(?:\s+[CD])?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+(?:\s+[CD])?)$/,
        );
        if (m) {
          totals = {
            saldoInicial: parseSaldo(m[1]),
            debito: parseBR(m[2]),
            credito: parseBR(m[3]),
            saldoFinal: parseSaldo(m[4]),
          };
        }
        continue;
      }

      if (!capturing) continue;

      const m = line.match(rowRe);
      if (m) {
        const [, terc, classif, nome, sIni, deb, cred, sFim] = m;
        suppliers.set(terc, {
          terc,
          classif,
          nome: nome.trim(),
          saldoInicial: parseSaldo(sIni),
          movDebito: parseBR(deb),
          movCredito: parseBR(cred),
          saldoFinal: parseSaldo(sFim),
          page: pageIdx + 1,
        });
      } else if (/\d{5}-\d\s+\d+\s+\d{10}/.test(line)) {
        // Parece uma conta analítica, mas não casou com o padrão esperado.
        ignored += 1;
      }
    }
  });

  return { suppliers, totals, groupFound, ignored };
}

export function sumCredito(suppliers) {
  let t = 0;
  for (const s of suppliers.values()) t += s.movCredito;
  return round2(t);
}

export function sumSaldoFinal(suppliers) {
  let t = 0;
  for (const s of suppliers.values()) t += s.saldoFinal;
  return round2(t);
}
