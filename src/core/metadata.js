/**
 * Detecção do tipo de relatório e extração de metadados (empresa, CNPJ, período, emissão).
 */

/** @returns {'balancete'|'contaCorrente'|'desconhecido'} */
export function detectKind(pages) {
  const head = pages.slice(0, 2).flat().join('\n');
  if (/Balancete\s+Anal[íi]tico/i.test(head)) return 'balancete';
  if (/CONTA\s+CORRENTE\s+FORNECEDORES/i.test(head)) return 'contaCorrente';
  return 'desconhecido';
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** "Agosto de 2026" ou "01/08/2026 a 31/08/2026" -> { mes: 'Agosto', ano: '2026' } */
export function parsePeriodo(texto) {
  if (!texto) return { mes: '', ano: '' };
  let ano = (texto.match(/\b(20\d{2}|19\d{2})\b/) || [])[1] || '';
  const alvo = semAcento(texto).toLowerCase();
  let idx = MESES.findIndex((m) => alvo.includes(semAcento(m).toLowerCase()));

  if (idx < 0) {
    // Tenta formato numérico: "08/2026" ou data completa "01/08/2026"
    const mDate = texto.match(/\b\d{2}\/(0[1-9]|1[0-2])\/(20\d{2}|19\d{2})\b/);
    if (mDate) {
      idx = parseInt(mDate[1], 10) - 1;
      if (!ano) ano = mDate[2];
    } else {
      const mMesAno = texto.match(/\b(0[1-9]|1[0-2])\/(20\d{2}|19\d{2})\b/);
      if (mMesAno) {
        idx = parseInt(mMesAno[1], 10) - 1;
        if (!ano) ano = mMesAno[2];
      }
    }
  }

  return { mes: idx >= 0 ? MESES[idx] : '', ano };
}

/** Extrai metadados dos cabeçalhos dos dois relatórios. */
export function extractMetadata(balPages, ccPages) {
  const bal = (balPages[0] || []).slice(0, 25);
  const cc = (ccPages[0] || []).slice(0, 20);

  let empresa = '';
  let codigo = '';
  let cnpj = '';
  let periodoTexto = '';
  let emissao = '';

  for (const l of bal) {
    let m;
    if (!empresa && (m = l.match(/^(.+?)\s*\((\d+)\)\s+Folha/i))) {
      empresa = m[1].trim();
      codigo = m[2];
    } else if (!cnpj && (m = l.match(/CNPJ\/CPF:\s*([\d./-]+)/i))) {
      cnpj = m[1];
    } else if (!periodoTexto && (m = l.match(/Per[íi]odo:\s*(.+)$/i))) {
      periodoTexto = m[1].trim();
    }
    if (!emissao && (m = l.match(/(?:Emitido em|Emiss[ãa]o|Data)[:\s]*(\d{2}\/\d{2}\/\d{4})/i))) emissao = m[1];
  }

  let cnpjCC = '';
  let empresaCC = '';
  for (const l of cc) {
    let m;
    if (!cnpjCC && (m = l.match(/CNPJ:\s*([\d./-]+)/i))) cnpjCC = m[1];
    if (!empresaCC && (m = l.match(/\b\d{3,5}\s+-\s+(.+?)\s+I\.E\./i))) empresaCC = m[1].trim();
    if (!emissao && (m = l.match(/(?:Emitido em|Emiss[ãa]o|Data|^)[:\s]*(\d{2}\/\d{2}\/\d{4})/i))) emissao = m[1];
  }

  const { mes, ano } = parsePeriodo(periodoTexto);
  const warnings = [];
  if (cnpj && cnpjCC && cnpj !== cnpjCC) {
    warnings.push(
      `O CNPJ do Balancete (${cnpj}) é diferente do CNPJ do Conta Corrente (${cnpjCC}). Confira se os arquivos são da mesma empresa.`,
    );
  }
  if (!mes || !ano) warnings.push('Não foi possível identificar a competência no Balancete. Informe-a manualmente.');

  return {
    meta: {
      empresa: empresa || empresaCC,
      codigo,
      cnpj: cnpj || cnpjCC,
      mes,
      ano,
      emissao,
    },
    warnings,
  };
}

export { MESES };
