import { parseBR, round2 } from './money.js';

const CNPJ_CPF =
  /^(\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s+(\d+)\s+(.+?)\s+(-?[\d.,]+)$/;

/**
 * Extrai fornecedores do relatório "Conta Corrente Fornecedores".
 * Porta de `parse_conta_corrente`: fornecedores repetidos (ex.: folhas de competências
 * complementares) são somados e as ocorrências ficam em `entries`.
 *
 * @param {string[][]} pages linhas por página
 */
export function parseContaCorrente(pages) {
  const suppliers = new Map();
  let totalGeral = 0;
  let totalMes = 0;
  let ignored = 0;

  pages.forEach((lines, pageIdx) => {
    // Competência impressa no cabeçalho da folha (ex.: "maio/2026 Folha: 004")
    let competencia = '';
    for (const l of lines) {
      const m = l.match(/(\p{L}+\/\d{4})\s+Folha:?\s*(\d+)/u);
      if (m) {
        competencia = m[1];
        break;
      }
    }
    const folha = (lines.join(' ').match(/Folha:?\s*(\d+)/) || [])[1] || String(pageIdx + 1);

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const mGeral = line.match(/TOTAL\s+GERAL[:\s]+(-?[\d.,]+)/i);
      if (mGeral) {
        totalGeral = parseBR(mGeral[1]);
        continue;
      }
      const mMes = line.match(/TOTAL\s+M[ÊE]S[:\s]+(-?[\d.,]+)/i);
      if (mMes) {
        totalMes += parseBR(mMes[1]);
        continue;
      }

      const m = line.match(CNPJ_CPF);
      if (m) {
        const [, cnpj, cod, nome, valStr] = m;
        const val = parseBR(valStr);
        let s = suppliers.get(cod);
        if (!s) {
          s = { cod, cnpj: '', nome: '', saldoCredor: 0, entries: [] };
          suppliers.set(cod, s);
        }
        s.cnpj = cnpj;
        s.nome = nome.trim();
        s.saldoCredor += val;
        s.entries.push({ page: pageIdx + 1, folha, competencia, valor: val });
      } else if (/^\d{2,3}\.\d{3}\.\d{3}/.test(line)) {
        ignored += 1;
      }
    }
  });

  for (const s of suppliers.values()) s.saldoCredor = round2(s.saldoCredor);

  return { suppliers, totalDeclarado: totalGeral || round2(totalMes), ignored };
}

export function sumSaldoCredor(suppliers) {
  let t = 0;
  for (const s of suppliers.values()) t += s.saldoCredor;
  return round2(t);
}
