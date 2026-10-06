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

/** "Agosto de 2026" -> { mes: 'Agosto', ano: '2026' } */
export function parsePeriodo(texto) {
  if (!texto) return { mes: '', ano: '' };
  const ano = (texto.match(/\b(20\d{2}|19\d{2})\b/) || [])[1] || '';
  const alvo = semAcento(texto).toLowerCase();
  const idx = MESES.findIndex((m) => alvo.includes(semAcento(m).toLowerCase()));
  return { mes: idx >= 0 ? MESES[idx] : '', ano };
}

/** Extrai metadados dos cabeçalhos dos dois relatórios. */
export function extractMetadata(balPages, ccPages) {
  const bal = (balPages[0] || []).slice(0, 14);
  const cc = (ccPages[0] || []).slice(0, 10);

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
    if (!emissao && (m = l.match(/Emitido em:\s*(\d{2}\/\d{2}\/\d{4})/i))) emissao = m[1];
  }

  let cnpjCC = '';
  let empresaCC = '';
  for (const l of cc) {
    let m;
    if (!cnpjCC && (m = l.match(/CNPJ:\s*([\d./-]+)/))) cnpjCC = m[1];
    if (!empresaCC && (m = l.match(/\b\d{3,5}\s+-\s+(.+?)\s+I\.E\./))) empresaCC = m[1].trim();
    if (!emissao && (m = l.match(/^(\d{2}\/\d{2}\/\d{4})/))) emissao = m[1];
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
