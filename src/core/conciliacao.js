import { fmtBRL, fmtNum, fmtSigned, round2, sum } from './money.js';

/**
 * Diagnóstico contábil da divergência no modo Movimento Crédito (3ª coluna).
 * Preserva 100% das regras originais de paridade com o script Python.
 *
 * @returns {{texto:string, categoria:string, tag:'exato'|'centavos'|'outro'}}
 */
export function diagnosticarDivergenciaCredito(b, ccVal) {
  const cred = b.movCredito;
  const fim = b.saldoFinal;
  const deb = b.movDebito;
  const ini = b.saldoInicial;

  const diffCred = round2(cred - ccVal);
  const diffFim = round2(fim - ccVal);

  // 1. Bate exatamente ou com centavos com o Saldo Final
  if (Math.abs(diffFim) < 0.01) {
    return {
      texto: 'Bate 100% com o Saldo Final Contábil (CC reflete saldo em aberto)',
      categoria: 'Identidade com Saldo Final',
      tag: 'exato',
    };
  }
  if (Math.abs(diffFim) <= 2.0) {
    return {
      texto: `Bate com Saldo Final Contábil (diferença de R$ ${fmtSigned(diffFim)} em centavos)`,
      categoria: 'Identidade Saldo Final (centavos)',
      tag: 'centavos',
    };
  }

  // 2. CC = Mov. Crédito - Mov. Débito
  if (Math.abs(round2(cred - deb - ccVal)) < 0.05) {
    return {
      texto: 'CC = Mov. Crédito - Mov. Débito (Compras líquidas abatidas de pagamentos do mês)',
      categoria: 'Líquido do Mês',
      tag: 'outro',
    };
  }

  // 3. Diferença para o Mov. Crédito é exatamente o Débito
  if (Math.abs(round2(diffCred - deb)) < 0.05) {
    return {
      texto: 'Diferença corresponde ao Mov. Débito (Pagamentos/Adiantamentos)',
      categoria: 'Impacto do Débito',
      tag: 'outro',
    };
  }

  // 4. Diferença para o Saldo Final é exatamente o Saldo Inicial
  if (Math.abs(round2(diffFim - ini)) < 0.05) {
    return {
      texto: 'Diferença corresponde ao Saldo Inicial pré-existente',
      categoria: 'Impacto Saldo Inicial',
      tag: 'outro',
    };
  }

  // 5. CC maior que o Mov. Crédito: inclui saldo anterior pendente
  if (ccVal > cred && Math.abs(diffFim) < Math.abs(diffCred)) {
    return {
      texto: `CC maior que Mov. Crédito: reflete títulos anteriores em aberto (próximo do Saldo Final: dif R$ ${fmtSigned(diffFim)})`,
      categoria: 'Acúmulo de Títulos em Aberto',
      tag: 'outro',
    };
  }

  // 6. CC menor que o Mov. Crédito: parte foi paga no mês
  if (ccVal < cred && deb > 0) {
    return {
      texto: `CC menor que Mov. Crédito: títulos baixados no mês (Débito de R$ ${fmtNum(deb)})`,
      categoria: 'Baixa Parcial no Mês',
      tag: 'outro',
    };
  }

  return {
    texto: 'Divergência de Composição Contábil / Títulos em Aberto',
    categoria: 'Divergência Composta',
    tag: 'outro',
  };
}

/**
 * Diagnóstico contábil da divergência no modo Saldo Final (4ª coluna).
 * Analisa as razões contábeis pelas quais o Saldo Final difere do Saldo Credor do Conta Corrente.
 *
 * @returns {{texto:string, categoria:string, tag:'exato'|'centavos'|'outro'|'alerta'}}
 */
export function diagnosticarDivergenciaSaldoFinal(b, ccVal) {
  const fim = b.saldoFinal;
  const cred = b.movCredito;
  const deb = b.movDebito;
  const ini = b.saldoInicial;
  const diffFim = round2(fim - ccVal);

  // 1. Diferença de centavos
  if (Math.abs(diffFim) <= 2.0) {
    return {
      texto: `Bate com Saldo Final Contábil (diferença de R$ ${fmtSigned(diffFim)} em centavos)`,
      categoria: 'Identidade Saldo Final (centavos)',
      tag: 'centavos',
    };
  }

  // 2. CC reflete exatamente o Movimento a Crédito do mês (compras recentes sem saldo pré-existente)
  if (Math.abs(round2(cred - ccVal)) < 0.01) {
    return {
      texto: `CC reflete o Mov. Crédito do mês (R$ ${fmtNum(cred)}), desconsiderando saldo anterior e pagamentos`,
      categoria: 'CC = Movimento Crédito',
      tag: 'outro',
    };
  }

  // 3. Diferença para o Saldo Final é exatamente o Saldo Inicial
  if (Math.abs(round2(diffFim - ini)) < 0.05) {
    return {
      texto: `Diferença corresponde ao Saldo Inicial pré-existente (R$ ${fmtNum(ini)})`,
      categoria: 'Impacto Saldo Inicial',
      tag: 'outro',
    };
  }

  // 4. Diferença decorre dos pagamentos do mês (Débito): Saldo Final + Débito = CC
  if (Math.abs(round2(diffFim + deb)) < 0.05) {
    return {
      texto: `Diferença corresponde ao Mov. Débito (pagamentos de R$ ${fmtNum(deb)} baixados no Balancete mas em aberto no CC)`,
      categoria: 'Impacto do Débito (Pagamentos)',
      tag: 'outro',
    };
  }

  // 5. Saldo Devedor no Balancete (adiantamento a fornecedor)
  if (fim < -0.01) {
    return {
      texto: `Saldo Devedor Contábil (adiantamento ou pagamento a maior: R$ ${fmtNum(Math.abs(fim))})`,
      categoria: 'Saldo Devedor Contábil',
      tag: 'alerta',
    };
  }

  // 6. Quitado no Balancete mas pendente no Conta Corrente
  if (Math.abs(fim) < 0.01 && ccVal > 0) {
    return {
      texto: `Conta quitada no Balancete (Saldo R$ 0,00), porém ainda indicada como pendente no CC (R$ ${fmtNum(ccVal)})`,
      categoria: 'Quitado no Balancete / Pendente no CC',
      tag: 'alerta',
    };
  }

  // 7. CC = Mov. Crédito - Mov. Débito (Líquido do Mês)
  if (Math.abs(round2(cred - deb - ccVal)) < 0.05) {
    return {
      texto: 'CC = Mov. Crédito - Mov. Débito (Compras líquidas abatidas de pagamentos do mês)',
      categoria: 'Líquido do Mês',
      tag: 'outro',
    };
  }

  // 8. Mais próximo de compras do mês
  if (ccVal > fim && Math.abs(round2(cred - ccVal)) < Math.abs(diffFim)) {
    return {
      texto: `CC maior que Saldo Final (próximo do Mov. Crédito do mês: dif R$ ${fmtSigned(round2(cred - ccVal))})`,
      categoria: 'Aproximação Mov. Crédito',
      tag: 'outro',
    };
  }

  return {
    texto: 'Divergência de Composição Contábil / Títulos em Aberto',
    categoria: 'Divergência Composta',
    tag: 'outro',
  };
}

/** Despacha para a função de diagnóstico apropriada conforme a modalidade. */
export function diagnosticarDivergencia(b, ccVal, modo = 'saldoFinal') {
  return modo === 'credito'
    ? diagnosticarDivergenciaCredito(b, ccVal)
    : diagnosticarDivergenciaSaldoFinal(b, ccVal);
}

/** Situação contábil de quem está somente no Balancete. */
export function statusSomenteBalancete(fim) {
  if (Math.abs(fim) < 0.01) {
    return { texto: 'Quitado no Mês (Saldo Final Zerado)', tipo: 'ok' };
  }
  if (fim < -0.01) {
    return {
      texto: `Saldo Devedor (Adiantamento/Pagamento a maior: R$ ${fmtNum(Math.abs(fim))})`,
      tipo: 'alerta',
    };
  }
  return { texto: `Saldo Credor em Aberto (R$ ${fmtNum(fim)} pendente de baixa)`, tipo: 'diff' };
}

/**
 * Cruza Balancete x Conta Corrente e classifica cada fornecedor.
 *
 * @param {Map<string, object>} bal suppliers de parseBalancete
 * @param {Map<string, object>} cc suppliers de parseContaCorrente
 * @param {{modo?: 'saldoFinal' | 'credito'}} [opts] modalidade de conferência (padrão: 'saldoFinal')
 */
export function conciliar(bal, cc, opts = {}) {
  const modo = opts.modo === 'credito' ? 'credito' : 'saldoFinal';
  const codes = [...new Set([...cc.keys(), ...bal.keys()])].sort();

  const batimentos = [];
  const divergencias = [];
  const somenteBalCredor = [];
  const somenteBalDevedor = [];
  const somenteBalZerado = [];
  const somenteBalCred = [];
  const somenteBalSemCred = [];
  const somenteCC = [];
  const base = [];

  for (const cod of codes) {
    const inCC = cc.has(cod);
    const inBal = bal.has(cod);
    const b = inBal ? bal.get(cod) : null;
    const c = inCC ? cc.get(cod) : null;

    const balCred = b ? b.movCredito : 0;
    const fim = b ? b.saldoFinal : 0;
    const ini = b ? b.saldoInicial : 0;
    const deb = b ? b.movDebito : 0;
    const ccVal = c ? c.saldoCredor : 0;

    // Valor alvo do Balancete conforme o modo
    const balTarget = modo === 'saldoFinal' ? fim : balCred;
    const diff = round2(balTarget - ccVal);

    const row = {
      cod,
      cnpj: c ? c.cnpj : '',
      nome: b ? b.nome : c.nome,
      classif: b ? b.classif : '',
      balTarget,
      balCred,
      ccVal,
      diff,
      ini,
      deb,
      fim,
      inBal,
      inCC,
    };

    if (inCC && inBal) {
      if (Math.abs(diff) < 0.01) {
        row.situacao = 'Batimento Exato (100%)';
        row.grupo = 'batimento';
        batimentos.push(row);
      } else {
        const d = diagnosticarDivergencia(b, ccVal, modo);
        row.diag = d.texto;
        row.categoria = d.categoria;
        row.tag = d.tag;
        row.diffFim = round2(fim - ccVal);
        row.diffCred = round2(balCred - ccVal);
        row.situacao = 'Divergência de Valores';
        row.grupo = 'divergencia';
        divergencias.push(row);
      }
    } else if (inBal) {
      if (modo === 'saldoFinal') {
        if (fim > 0.009) {
          row.situacao = 'Somente no Balancete (Saldo Credor em Aberto)';
          row.status = `Saldo Credor em Aberto (R$ ${fmtNum(fim)} pendente de baixa)`;
          row.statusTipo = 'diff';
          row.grupo = 'somenteBalCredor';
          somenteBalCredor.push(row);
        } else if (fim < -0.009) {
          row.situacao = 'Somente no Balancete (Saldo Devedor / Adiantamentos)';
          row.status = `Saldo Devedor (Adiantamento/Pagamento a maior: R$ ${fmtNum(Math.abs(fim))})`;
          row.statusTipo = 'alerta';
          row.grupo = 'somenteBalDevedor';
          somenteBalDevedor.push(row);
        } else {
          row.situacao = 'Somente no Balancete (Saldo Zerado)';
          row.status = 'Quitado no Mês (Saldo Final Zerado)';
          row.statusTipo = 'ok';
          row.grupo = 'somenteBalZerado';
          somenteBalZerado.push(row);
        }
      } else {
        if (b.movCredito > 0) {
          const st = statusSomenteBalancete(fim);
          row.status = st.texto;
          row.statusTipo = st.tipo;
          row.situacao = 'Somente no Balancete (c/ Crédito)';
          row.grupo = 'somenteBalCred';
          somenteBalCred.push(row);
        } else {
          row.situacao = 'Somente no Balancete (sem Crédito)';
          row.grupo = 'somenteBalSemCred';
          somenteBalSemCred.push(row);
        }
      }
    } else {
      row.situacao = 'Somente no Conta Corrente';
      row.grupo = 'somenteCC';
      somenteCC.push(row);
    }
    base.push(row);
  }

  // Manter coleções auxiliares para máxima compatibilidade
  const somenteBalAtivo =
    modo === 'saldoFinal'
      ? [...somenteBalCredor, ...somenteBalDevedor]
      : somenteBalCred;

  return {
    modo,
    batimentos,
    divergencias,
    somenteBalCredor,
    somenteBalDevedor,
    somenteBalZerado,
    somenteBalCred: modo === 'saldoFinal' ? somenteBalAtivo : somenteBalCred,
    somenteBalSemCred: modo === 'saldoFinal' ? somenteBalZerado : somenteBalSemCred,
    somenteCC,
    base,
  };
}

/** Ordenações usadas nas abas. Ordenação estável. */
export function ordenar(grupos, modo = 'saldoFinal') {
  const isSaldo = (grupos.modo || modo) === 'saldoFinal';
  return {
    ...grupos,
    divergencias: [...grupos.divergencias].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    batimentos: [...grupos.batimentos].sort((a, b) => (isSaldo ? b.fim - a.fim : b.balCred - a.balCred)),
    somenteBalCredor: grupos.somenteBalCredor
      ? [...grupos.somenteBalCredor].sort((a, b) => b.fim - a.fim)
      : [],
    somenteBalDevedor: grupos.somenteBalDevedor
      ? [...grupos.somenteBalDevedor].sort((a, b) => Math.abs(b.fim) - Math.abs(a.fim))
      : [],
    somenteBalZerado: grupos.somenteBalZerado ? [...grupos.somenteBalZerado] : [],
    somenteBalCred: [...grupos.somenteBalCred].sort((a, b) => (isSaldo ? b.fim - a.fim : b.balCred - a.balCred)),
    somenteCC: [...grupos.somenteCC].sort((a, b) => b.ccVal - a.ccVal),
  };
}

/** Totais, prova matemática e causa-raiz adaptados à modalidade selecionada. */
export function buildSummary(bal, cc, grupos, opts = {}) {
  const modo = opts.modo || grupos.modo || 'saldoFinal';
  const isSaldo = modo === 'saldoFinal';

  const totBal = sum([...bal.values()], (b) => (isSaldo ? b.saldoFinal : b.movCredito));
  const totCC = sum([...cc.values()], (c) => c.saldoCredor);
  const difGlobal = round2(totBal - totCC);

  // No modo Saldo Final, consideramos os grupos Credor e Devedor
  const sBalCredor = sum(grupos.somenteBalCredor || [], (r) => r.fim);
  const sBalDevedor = sum(grupos.somenteBalDevedor || [], (r) => r.fim);
  const sBalZerado = sum(grupos.somenteBalZerado || [], (r) => r.fim);
  const sBal = isSaldo ? round2(sBalCredor + sBalDevedor) : sum(grupos.somenteBalCred || [], (r) => r.balCred);

  const sCC = sum(grupos.somenteCC || [], (r) => r.ccVal);
  const difDiverg = sum(grupos.divergencias, (r) => r.diff);

  // Prova matemática: Soma(Diferenças de todos os grupos) = Diferença Global
  const explicado = round2(sBal + difDiverg - sCC);
  const residual = round2(difGlobal - explicado);

  // Causa-raiz das divergências
  const causas = new Map();
  for (const d of grupos.divergencias) {
    let g = causas.get(d.categoria);
    if (!g) {
      g = { categoria: d.categoria, count: 0, bal: 0, cc: 0, diff: 0 };
      causas.set(d.categoria, g);
    }
    g.count += 1;
    g.bal += d.balTarget;
    g.cc += d.ccVal;
    g.diff += d.diff;
  }
  const causaRaiz = [...causas.values()].map((g) => ({
    ...g,
    bal: round2(g.bal),
    cc: round2(g.cc),
    diff: round2(g.diff),
  }));

  const labelBal = isSaldo ? 'Saldo Final (4ª Coluna)' : 'Mov. Crédito (3ª Coluna)';

  return {
    modo,
    labelBal,
    qtdFornecedores: bal.size,
    qtdCC: cc.size,
    totBal,
    totCC,
    difGlobal,
    quadro: [
      {
        desc: `TOTAL GERAL DECLARADO (${isSaldo ? 'Saldo Final Contábil' : 'Movimento Crédito'})`,
        qtd: bal.size,
        bal: totBal,
        cc: totCC,
        diff: difGlobal,
      },
      {
        desc: isSaldo
          ? '(-) Fornecedores com Saldo Somente no Balancete (Credor + Devedor)'
          : '(-) Fornecedores com Mov. Crédito Somente no Balancete',
        qtd: isSaldo ? (grupos.somenteBalCredor?.length || 0) + (grupos.somenteBalDevedor?.length || 0) : grupos.somenteBalCred.length,
        bal: sBal,
        cc: 0,
        diff: sBal,
      },
      {
        desc: '(-) Fornecedores Comuns com Divergência de Valores',
        qtd: grupos.divergencias.length,
        bal: sum(grupos.divergencias, (r) => r.balTarget),
        cc: sum(grupos.divergencias, (r) => r.ccVal),
        diff: difDiverg,
      },
      {
        desc: '(=) Fornecedores Comuns com Batimento Exato (100%)',
        qtd: grupos.batimentos.length,
        bal: sum(grupos.batimentos, (r) => r.balTarget),
        cc: sum(grupos.batimentos, (r) => r.ccVal),
        diff: 0,
      },
    ],
    prova: { sBal, sBalCredor, sBalDevedor, sBalZerado, sCC, difDiverg, explicado, residual },
    causaRaiz,
    contagens: {
      batimentos: grupos.batimentos.length,
      divergencias: grupos.divergencias.length,
      somenteBalCredor: grupos.somenteBalCredor?.length || 0,
      somenteBalDevedor: grupos.somenteBalDevedor?.length || 0,
      somenteBalZerado: grupos.somenteBalZerado?.length || 0,
      somenteBalCred: grupos.somenteBalCred.length,
      somenteBalSemCred: grupos.somenteBalSemCred.length,
      somenteCC: grupos.somenteCC.length,
    },
  };
}

const plural = (n, s, p) => (n === 1 ? s : p);

/** Notas técnicas e parecer, geradas a partir dos números reais da conciliação. */
export function buildNotes(bal, cc, grupos, summary, opts = {}) {
  const modo = opts.modo || summary.modo || 'saldoFinal';
  const isSaldo = modo === 'saldoFinal';
  const notas = [];
  const c = summary.contagens;

  if (isSaldo) {
    notas.push(
      "Natureza da Conferência: Confronto direto entre a 4ª COLUNA DO BALANCETE (Saldo Final Contábil / Posição Acumulada em Aberto) e o SALDO CREDOR DO CONTA CORRENTE FORNECEDORES.",
    );

    const totalComuns = c.batimentos + c.divergencias;
    const pctComuns = totalComuns > 0 ? Math.round((c.batimentos / totalComuns) * 100) : 0;
    notas.push(
      `Resultado Geral: De ${totalComuns} fornecedores em comum, ${c.batimentos} (${pctComuns}%) apresentam BATIMENTO EXATO (100% de conferência no Saldo Final), demonstrando integridade entre o razão contábil e os títulos em aberto.`,
    );

    if (c.divergencias > 0) {
      const centavos = grupos.divergencias.filter((d) => d.tag === 'centavos').length;
      const creditRef = grupos.divergencias.filter((d) => d.categoria === 'CC = Movimento Crédito').length;
      let t = `Divergências Identificadas (${c.divergencias} fornecedores): `;
      const sub = [];
      if (centavos > 0) sub.push(`${centavos} ${plural(centavos, 'caso difere', 'casos diferem')} apenas em centavos`);
      if (creditRef > 0) sub.push(`em ${creditRef} casos o C/C espelhou apenas as compras do mês (Mov. Crédito) sem somar o saldo inicial`);
      t += sub.join(' e ') + '.';
      notas.push(t);
    }

    if (c.somenteBalCredor > 0 || c.somenteBalDevedor > 0 || c.somenteBalZerado > 0) {
      notas.push(
        `Fornecedores Somente no Balancete: ${c.somenteBalCredor} ${plural(c.somenteBalCredor, 'fornecedor possui', 'fornecedores possuem')} Saldo Credor em aberto (${fmtBRL(summary.prova.sBalCredor)} a pagar); ${c.somenteBalDevedor} ${plural(c.somenteBalDevedor, 'possui', 'possuem')} Saldo Devedor (${fmtBRL(Math.abs(summary.prova.sBalDevedor))} em adiantamentos/pagamentos a maior); e ${c.somenteBalZerado} ${plural(c.somenteBalZerado, 'está quitado', 'estão quitados')} com saldo zero no período.`,
      );
    }
  } else {
    notas.push(
      "Natureza dos Relatórios: O relatório 'CONTA CORRENTE FORNECEDORES' expressa a POSIÇÃO DE TÍTULOS EM ABERTO (saldo credor a pagar), enquanto o Balancete reflete a MOVIMENTAÇÃO BRUTA A CRÉDITO do mês (compras/entradas).",
    );

    const exatos = grupos.divergencias.filter((d) => d.tag === 'exato').length;
    const centavos = grupos.divergencias.filter((d) => d.tag === 'centavos').length;
    if (c.divergencias > 0) {
      let t = `Identidade com o Saldo Final: Em ${exatos} ${plural(exatos, 'fornecedor', 'fornecedores')} das ${c.divergencias} ${plural(c.divergencias, 'divergência', 'divergências')}, o valor do Conta Corrente bate com exatidão com o 'Saldo Final' do Balancete (e não com o Mov. Crédito). Isso indica que, para esses fornecedores, o sistema listou o saldo a pagar pendente no fim do mês.`;
      if (centavos > 0) {
        t += ` Outros ${centavos} diferem do Saldo Final apenas em centavos.`;
      }
      notas.push(t);
    }

    if (c.somenteBalCred > 0) {
      const quitados = grupos.somenteBalCred.filter((r) => Math.abs(r.fim) < 0.01);
      const exemplos = [...quitados]
        .sort((a, b) => b.balCred - a.balCred)
        .slice(0, 3)
        .map((r) => `${r.nome.trim()} (${fmtBRL(r.balCred)})`);
      let t = `Fornecedores Somente no Balancete: Dos ${c.somenteBalCred} fornecedores com movimento de crédito que não aparecem no Conta Corrente (total ${fmtBRL(summary.prova.sBal)}), ${quitados.length} ${plural(quitados.length, 'foi quitado', 'foram quitados')} dentro do próprio mês (Saldo Final = R$ 0,00), razão pela qual o relatório de títulos em aberto não os lista.`;
      if (exemplos.length) t += ` Maiores exemplos: ${exemplos.join('; ')}.`;
      notas.push(t);
    }
  }

  if (c.somenteCC > 0) {
    notas.push(
      `Fornecedores Somente no Conta Corrente: ${c.somenteCC} ${plural(c.somenteCC, 'fornecedor aparece', 'fornecedores aparecem')} no Conta Corrente sem conta analítica correspondente no Balancete (total ${fmtBRL(summary.prova.sCC)}). Verifique cadastro e classificação contábil.`,
    );
  } else {
    notas.push(
      'Cadastro: Nenhum fornecedor do Conta Corrente ficou de fora do Balancete (0 pendências de cadastro).',
    );
  }

  // Ocorrências múltiplas no Conta Corrente
  const multiplos = [...cc.values()].filter((s) => s.entries.length > 1);
  for (const s of multiplos) {
    const partes = s.entries
      .map((e) => `${fmtBRL(e.valor)} na folha ${e.folha}${e.competencia ? ` (${e.competencia})` : ''}`)
      .join(' + ');
    const b = bal.get(s.cod);
    let fecho = '';
    if (b) {
      const dif = round2(b.saldoFinal - s.saldoCredor);
      fecho =
        Math.abs(dif) < 0.01
          ? ` No Balancete, o Saldo Final é ${fmtBRL(b.saldoFinal)}, o que confere exatamente com a soma.`
          : ` No Balancete, o Saldo Final é ${fmtBRL(b.saldoFinal)} (diferença de ${fmtBRL(dif)} em relação à soma).`;
    }
    notas.push(
      `Ocorrência múltipla no Conta Corrente (${s.nome.trim()}, código ${s.cod}): ${partes}, somando ${fmtBRL(s.saldoCredor)}.${fecho}`,
    );
  }

  notas.push(
    'Recomendação Técnica: Utilize o modo "Saldo Final" para auditar os valores pendentes de quitação contra a posição de Contas a Pagar, e o modo "Mov. Crédito" para conciliar o volume de notas fiscais/compras escrituradas no mês contábil.',
  );

  return notas;
}
