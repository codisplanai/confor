import { extractPages } from './pdfText.js';
import { detectKind, extractMetadata } from './metadata.js';
import { parseBalancete, sumCredito, sumSaldoFinal, DEFAULT_ACCOUNT } from './parseBalancete.js';
import { parseContaCorrente, sumSaldoCredor } from './parseContaCorrente.js';
import { conciliar, ordenar, buildSummary, buildNotes } from './conciliacao.js';
import { round2, fmtBRL } from './money.js';
import { logger } from './logger.js';

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

  logger.info('PIPELINE', `Iniciando análise com ${files.length} arquivo(s). Conta alvo: ${account}`);

  if (files.length !== 2) {
    const err = `Envie exatamente 2 arquivos PDF: o Balancete Analítico e o Conta Corrente Fornecedores (recebidos: ${files.length}).`;
    logger.error('VALIDAÇÃO', err);
    throw new AppError(err);
  }

  const found = {};
  for (const f of files) {
    say(`Lendo ${f.name}…`);
    logger.info('PDF', `Iniciando leitura e extração de texto de "${f.name}"…`);
    let pages;
    try {
      pages = await extractPages(f.data, pdfjs);
    } catch (e) {
      const err = `Não foi possível ler "${f.name}". O arquivo pode estar corrompido, protegido por senha ou não ser um PDF.`;
      logger.error('PDF', err, { erroOriginal: e.message, stack: e.stack });
      throw new AppError(err);
    }
    const textLen = pages.flat().join('').length;
    logger.info('PDF', `"${f.name}": ${pages.length} página(s) lida(s), ${textLen} caracteres extraídos.`);

    if (textLen < 20) {
      const err = `"${f.name}" não possui texto selecionável (talvez seja um PDF escaneado). Gere o relatório novamente em PDF a partir do sistema contábil.`;
      logger.error('PDF', err);
      throw new AppError(err);
    }
    const kind = detectKind(pages);
    if (kind === 'desconhecido') {
      const err = `"${f.name}" não parece ser um Balancete Analítico nem um relatório Conta Corrente Fornecedores.`;
      logger.error('IDENTIFICAÇÃO', err, { amostraTexto: pages[0]?.slice(0, 5) });
      throw new AppError(err);
    }
    logger.info('IDENTIFICAÇÃO', `"${f.name}" identificado como: ${KIND_LABEL[kind]}`);

    if (found[kind]) {
      const err = `Os dois arquivos parecem ser do mesmo tipo (${KIND_LABEL[kind]}). Envie um Balancete Analítico e um Conta Corrente Fornecedores.`;
      logger.error('IDENTIFICAÇÃO', err);
      throw new AppError(err);
    }
    found[kind] = { name: f.name, pages };
  }

  say('Extraindo fornecedores do Balancete…');
  logger.info('PARSER', `Processando Balancete Analítico buscando conta ${account}…`);
  const bal = parseBalancete(found.balancete.pages, { account });
  if (!bal.groupFound) {
    const err = `A conta ${account} (Fornecedores) não foi encontrada no Balancete. Confira o código da conta nas opções avançadas.`;
    logger.error('BALANCETE', err);
    throw new AppError(err);
  }
  if (bal.suppliers.size === 0) {
    const err = `Nenhuma conta analítica de fornecedor foi extraída da conta ${account} do Balancete.`;
    logger.error('BALANCETE', err);
    throw new AppError(err);
  }
  logger.info('BALANCETE', `${bal.suppliers.size} contas analíticas de fornecedores extraídas com sucesso.`, {
    linhasIgnoradas: bal.ignored,
    totalDeclaradoImpresso: bal.totals,
  });

  say('Extraindo fornecedores do Conta Corrente…');
  logger.info('PARSER', 'Processando relatório Conta Corrente de Fornecedores…');
  const cc = parseContaCorrente(found.contaCorrente.pages);
  if (cc.suppliers.size === 0) {
    const err = 'Nenhum fornecedor foi extraído do relatório Conta Corrente Fornecedores.';
    logger.error('CONTA_CORRENTE', err);
    throw new AppError(err);
  }
  logger.info('CONTA_CORRENTE', `${cc.suppliers.size} fornecedores distintos extraídos. Total declarado no PDF: ${fmtBRL(cc.totalDeclarado)}`, {
    linhasIgnoradas: cc.ignored,
  });

  say('Conciliando…');
  logger.info('CONCILIAÇÃO', 'Iniciando cruzamento e diagnóstico contábil registro a registro…');

  const activeModo = opts.modo === 'credito' ? 'credito' : 'saldoFinal';

  // Executa a conciliação no modo Saldo Final (4ª coluna)
  const gruposSaldo = conciliar(bal.suppliers, cc.suppliers, { modo: 'saldoFinal' });
  const resumoSaldo = buildSummary(bal.suppliers, cc.suppliers, gruposSaldo, { modo: 'saldoFinal' });
  const notasSaldo = buildNotes(bal.suppliers, cc.suppliers, gruposSaldo, resumoSaldo, { modo: 'saldoFinal' });

  // Executa também no modo Movimento Crédito (3ª coluna) para permitir alternância instantânea
  const gruposCred = conciliar(bal.suppliers, cc.suppliers, { modo: 'credito' });
  const resumoCred = buildSummary(bal.suppliers, cc.suppliers, gruposCred, { modo: 'credito' });
  const notasCred = buildNotes(bal.suppliers, cc.suppliers, gruposCred, resumoCred, { modo: 'credito' });

  const active = activeModo === 'saldoFinal'
    ? { grupos: gruposSaldo, ordenado: ordenar(gruposSaldo, 'saldoFinal'), resumo: resumoSaldo, notas: notasSaldo }
    : { grupos: gruposCred, ordenado: ordenar(gruposCred, 'credito'), resumo: resumoCred, notas: notasCred };

  const { meta, warnings } = extractMetadata(found.balancete.pages, found.contaCorrente.pages);

  logger.info(
    'CONCILIAÇÃO',
    `Cruzamento concluído [Modo: ${activeModo}]: ${active.grupos.batimentos.length} batimentos exatos, ${active.grupos.divergencias.length} divergências de valores.`,
  );
  logger.info(
    'VALORES',
    `Totais apurados: Balancete ${fmtBRL(active.resumo.totBal)} | C/C ${fmtBRL(active.resumo.totCC)} | Diferença Global ${fmtBRL(active.resumo.difGlobal)} | Resíduo Matemático: ${fmtBRL(active.resumo.prova.residual)}`,
  );

  // Verificações de integridade contra os totais impressos nos próprios relatórios
  const checks = [];

  // Verificação da 4ª Coluna (Saldo Final)
  const saldoFinalSum = sumSaldoFinal(bal.suppliers);
  if (bal.totals) {
    const ok = Math.abs(round2(saldoFinalSum - bal.totals.saldoFinal)) < 0.01;
    const txt = ok
      ? `Saldo Final extraído do Balancete (${fmtBRL(saldoFinalSum)}) confere com o total impresso.`
      : `Saldo Final extraído (${fmtBRL(saldoFinalSum)}) difere do total impresso no Balancete (${fmtBRL(bal.totals.saldoFinal)}). Alguma linha pode não ter sido lida.`;
    checks.push({ ok, texto: txt });
    if (!ok) logger.warn('INTEGRIDADE', txt);
  }

  // Verificação da 3ª Coluna (Mov. Crédito)
  const credSum = sumCredito(bal.suppliers);
  if (bal.totals) {
    const ok = Math.abs(round2(credSum - bal.totals.credito)) < 0.01;
    const txt = ok
      ? `Mov. Crédito extraído do Balancete (${fmtBRL(credSum)}) confere com o total impresso.`
      : `Mov. Crédito extraído (${fmtBRL(credSum)}) difere do total impresso no Balancete (${fmtBRL(bal.totals.credito)}). Alguma linha pode não ter sido lida.`;
    checks.push({ ok, texto: txt });
    if (!ok) logger.warn('INTEGRIDADE', txt);
  } else {
    checks.push({ ok: false, texto: 'Total da conta não localizado no Balancete; integridade não verificada.' });
    logger.warn('INTEGRIDADE', 'Total impresso da conta não localizado no Balancete.');
  }

  const ccSum = sumSaldoCredor(cc.suppliers);
  if (cc.totalDeclarado) {
    const ok = Math.abs(round2(ccSum - cc.totalDeclarado)) < 0.01;
    const txt = ok
      ? `Saldo Credor extraído do Conta Corrente (${fmtBRL(ccSum)}) confere com o total impresso.`
      : `Saldo Credor extraído (${fmtBRL(ccSum)}) difere do total impresso no Conta Corrente (${fmtBRL(cc.totalDeclarado)}). Alguma linha pode não ter sido lida.`;
    checks.push({ ok, texto: txt });
    if (!ok) logger.warn('INTEGRIDADE', txt);
  } else {
    checks.push({ ok: false, texto: 'Total geral não localizado no Conta Corrente; integridade não verificada.' });
    logger.warn('INTEGRIDADE', 'Total geral impresso não localizado no Conta Corrente.');
  }

  const provaOk = Math.abs(active.resumo.prova.residual) < 0.01;
  const provaTxt = provaOk
    ? 'Prova matemática: a soma dos grupos explica 100% da diferença global (resíduo R$ 0,00).'
    : `Prova matemática: resíduo de ${fmtBRL(active.resumo.prova.residual)} não explicado.`;
  checks.push({ ok: provaOk, texto: provaTxt });
  if (!provaOk) logger.warn('PROVA_MATEMATICA', provaTxt);

  if (bal.ignored + cc.ignored > 0) {
    const txt = `${bal.ignored + cc.ignored} linha(s) pareciam registros de fornecedor mas não puderam ser lidas.`;
    checks.push({ ok: false, texto: txt });
    logger.warn('LINHAS_IGNORADAS', txt);
  }

  if (warnings.length > 0) {
    for (const w of warnings) logger.warn('METADADOS', w);
  }

  logger.success('CONCILIAÇÃO', `Processamento finalizado com sucesso para a empresa: ${meta.empresa || 'Não informada'}`);

  return {
    files: { balancete: found.balancete.name, contaCorrente: found.contaCorrente.name },
    account,
    meta,
    warnings,
    checks,
    bal: bal.suppliers,
    cc: cc.suppliers,
    modo: activeModo,
    grupos: active.grupos,
    ordenado: active.ordenado,
    resumo: active.resumo,
    notas: active.notas,
    modes: {
      saldoFinal: {
        grupos: gruposSaldo,
        ordenado: ordenar(gruposSaldo, 'saldoFinal'),
        resumo: resumoSaldo,
        notas: notasSaldo,
      },
      credito: {
        grupos: gruposCred,
        ordenado: ordenar(gruposCred, 'credito'),
        resumo: resumoCred,
        notas: notasCred,
      },
    },
  };
}
