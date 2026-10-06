import { extractPages } from './pdfText.js';
import { detectKind, extractMetadata } from './metadata.js';
import { parseBalancete, sumCredito, DEFAULT_ACCOUNT } from './parseBalancete.js';
import { parseContaCorrente, sumSaldoCredor } from './parseContaCorrente.js';
import { conciliar, ordenar, buildSummary, buildNotes } from './conciliacao.js';
import { round2, fmtBRL } from './money.js';

export class AppError extends Error {}

const KIND_LABEL = {
  balancete: 'Balancete Analítico',
  contaCorrente: 'Conta Corrente Fornecedores',
};

/**
 * Pipeline completo: PDFs -> linhas -> parsers -> conciliação.
 *
 * @param {{name:string, data:ArrayBuffer|Uint8Array}[]} files
 * @param {object} pdfjs módulo pdf.js configurado
 * @param {{account?:string, onProgress?:(msg:string)=>void}} [opts]
 */
export async function analyze(files, pdfjs, opts = {}) {
  const account = (opts.account || DEFAULT_ACCOUNT).trim();
  const say = opts.onProgress || (() => {});

  if (files.length !== 2) {
    throw new AppError(
      `Envie exatamente 2 arquivos PDF: o Balancete Analítico e o Conta Corrente Fornecedores (recebidos: ${files.length}).`,
    );
  }

  const found = {};
  for (const f of files) {
    say(`Lendo ${f.name}…`);
    let pages;
    try {
      pages = await extractPages(f.data, pdfjs);
    } catch (e) {
      throw new AppError(`Não foi possível ler "${f.name}". O arquivo pode estar corrompido, protegido por senha ou não ser um PDF.`);
    }
    const textLen = pages.flat().join('').length;
    if (textLen < 20) {
      throw new AppError(
        `"${f.name}" não possui texto selecionável (talvez seja um PDF escaneado). Gere o relatório novamente em PDF a partir do sistema contábil.`,
      );
    }
    const kind = detectKind(pages);
    if (kind === 'desconhecido') {
      throw new AppError(
        `"${f.name}" não parece ser um Balancete Analítico nem um relatório Conta Corrente Fornecedores.`,
      );
    }
    if (found[kind]) {
      throw new AppError(
        `Os dois arquivos parecem ser do mesmo tipo (${KIND_LABEL[kind]}). Envie um Balancete Analítico e um Conta Corrente Fornecedores.`,
      );
    }
    found[kind] = { name: f.name, pages };
  }

  say('Extraindo fornecedores do Balancete…');
  const bal = parseBalancete(found.balancete.pages, { account });
  if (!bal.groupFound) {
    throw new AppError(
      `A conta ${account} (Fornecedores) não foi encontrada no Balancete. Confira o código da conta nas opções avançadas.`,
    );
  }
  if (bal.suppliers.size === 0) {
    throw new AppError(`Nenhuma conta analítica de fornecedor foi extraída da conta ${account} do Balancete.`);
  }

  say('Extraindo fornecedores do Conta Corrente…');
  const cc = parseContaCorrente(found.contaCorrente.pages);
  if (cc.suppliers.size === 0) {
    throw new AppError('Nenhum fornecedor foi extraído do relatório Conta Corrente Fornecedores.');
  }

  say('Conciliando…');
  const grupos = conciliar(bal.suppliers, cc.suppliers);
  const resumo = buildSummary(bal.suppliers, cc.suppliers, grupos);
  const notas = buildNotes(bal.suppliers, cc.suppliers, grupos, resumo);
  const { meta, warnings } = extractMetadata(found.balancete.pages, found.contaCorrente.pages);

  // Verificações de integridade contra os totais impressos nos próprios relatórios
  const checks = [];
  const credSum = sumCredito(bal.suppliers);
  if (bal.totals) {
    const ok = Math.abs(round2(credSum - bal.totals.credito)) < 0.01;
    checks.push({
      ok,
      texto: ok
        ? `Mov. Crédito extraído do Balancete (${fmtBRL(credSum)}) confere com o total impresso.`
        : `Mov. Crédito extraído (${fmtBRL(credSum)}) difere do total impresso no Balancete (${fmtBRL(bal.totals.credito)}). Alguma linha pode não ter sido lida.`,
    });
  } else {
    checks.push({ ok: false, texto: 'Total da conta não localizado no Balancete; integridade não verificada.' });
  }
  const ccSum = sumSaldoCredor(cc.suppliers);
  if (cc.totalDeclarado) {
    const ok = Math.abs(round2(ccSum - cc.totalDeclarado)) < 0.01;
    checks.push({
      ok,
      texto: ok
        ? `Saldo Credor extraído do Conta Corrente (${fmtBRL(ccSum)}) confere com o total impresso.`
        : `Saldo Credor extraído (${fmtBRL(ccSum)}) difere do total impresso no Conta Corrente (${fmtBRL(cc.totalDeclarado)}). Alguma linha pode não ter sido lida.`,
    });
  } else {
    checks.push({ ok: false, texto: 'Total geral não localizado no Conta Corrente; integridade não verificada.' });
  }
  checks.push({
    ok: Math.abs(resumo.prova.residual) < 0.01,
    texto:
      Math.abs(resumo.prova.residual) < 0.01
        ? 'Prova matemática: a soma dos grupos explica 100% da diferença global (resíduo R$ 0,00).'
        : `Prova matemática: resíduo de ${fmtBRL(resumo.prova.residual)} não explicado.`,
  });
  if (bal.ignored + cc.ignored > 0) {
    checks.push({
      ok: false,
      texto: `${bal.ignored + cc.ignored} linha(s) pareciam registros de fornecedor mas não puderam ser lidas.`,
    });
  }

  return {
    files: { balancete: found.balancete.name, contaCorrente: found.contaCorrente.name },
    account,
    meta,
    warnings,
    checks,
    bal: bal.suppliers,
    cc: cc.suppliers,
    grupos,
    ordenado: ordenar(grupos),
    resumo,
    notas,
  };
}
