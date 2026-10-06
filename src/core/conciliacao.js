import { fmtBRL, fmtNum, fmtSigned, round2, sum } from './money.js';

/**
 * Diagnóstico contábil da divergência entre Mov. Crédito (Balancete) e Saldo Credor (Conta Corrente).
 * Porta fiel de `diagnosticar_divergencia` (mesmas regras, ordem e limiares).
 * Os números dentro dos textos usam o padrão brasileiro.
 *
 * @returns {{texto:string, categoria:string, tag:'exato'|'centavos'|'outro'}}
 */
export function diagnosticarDivergencia(b, ccVal) {
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

/** Situação contábil de quem está somente no Balancete (com crédito). */
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
 */
export function conciliar(bal, cc) {
  const codes = [...new Set([...cc.keys(), ...bal.keys()])].sort();

  const batimentos = [];
  const divergencias = [];
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
    const ccVal = c ? c.saldoCredor : 0;
    const diff = round2(balCred - ccVal);

    const row = {
      cod,
      cnpj: c ? c.cnpj : '',
      nome: b ? b.nome : c.nome,
      classif: b ? b.classif : '',
      balCred,
      ccVal,
      diff,
      ini: b ? b.saldoInicial : 0,
      deb: b ? b.movDebito : 0,
      fim: b ? b.saldoFinal : 0,
      inBal,
      inCC,
    };

    if (inCC && inBal) {
      if (Math.abs(diff) < 0.01) {
        row.situacao = 'Batimento Exato (100%)';
        row.grupo = 'batimento';
        batimentos.push(row);
      } else {
        const d = diagnosticarDivergencia(b, ccVal);
        row.diag = d.texto;
        row.categoria = d.categoria;
        row.tag = d.tag;
        row.diffFim = round2(b.saldoFinal - ccVal);
        row.situacao = 'Divergência de Valores';
        row.grupo = 'divergencia';
        divergencias.push(row);
      }
    } else if (inBal) {
      if (b.movCredito > 0) {
        const st = statusSomenteBalancete(b.saldoFinal);
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
    } else {
      row.situacao = 'Somente no Conta Corrente';
      row.grupo = 'somenteCC';
      somenteCC.push(row);
    }
    base.push(row);
  }

  return { batimentos, divergencias, somenteBalCred, somenteBalSemCred, somenteCC, base };
}

/** Ordenações usadas nas abas (idênticas ao script original). Ordenação estável. */
export function ordenar(grupos) {
  return {
    ...grupos,
    divergencias: [...grupos.divergencias].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    somenteBalCred: [...grupos.somenteBalCred].sort((a, b) => b.balCred - a.balCred),
    batimentos: [...grupos.batimentos].sort((a, b) => b.balCred - a.balCred),
  };
}

/** Totais, prova matemática e causa-raiz. */
export function buildSummary(bal, cc, grupos) {
  const totBal = sum([...bal.values()], (b) => b.movCredito);
  const totCC = sum([...cc.values()], (c) => c.saldoCredor);
  const difGlobal = round2(totBal - totCC);

  const sBal = sum(grupos.somenteBalCred, (r) => r.balCred);
  const sCC = sum(grupos.somenteCC, (r) => r.ccVal);
  const difDiverg = sum(grupos.divergencias, (r) => r.diff);

  // Diferença global = (somente Balancete) + (divergências) - (somente Conta Corrente)
  const explicado = round2(sBal + difDiverg - sCC);
  const residual = round2(difGlobal - explicado);

  // Causa-raiz, na ordem em que as categorias aparecem
  const causas = new Map();
  for (const d of grupos.divergencias) {
    let g = causas.get(d.categoria);
    if (!g) {
      g = { categoria: d.categoria, count: 0, bal: 0, cc: 0, diff: 0 };
      causas.set(d.categoria, g);
    }
    g.count += 1;
    g.bal += d.balCred;
    g.cc += d.ccVal;
    g.diff += d.diff;
  }
  const causaRaiz = [...causas.values()].map((g) => ({
    ...g,
    bal: round2(g.bal),
    cc: round2(g.cc),
    diff: round2(g.diff),
  }));

  return {
    qtdFornecedores: bal.size,
    qtdCC: cc.size,
    totBal,
    totCC,
    difGlobal,
    quadro: [
      {
        desc: 'TOTAL GERAL DECLARADO NOS RELATÓRIOS',
        qtd: bal.size,
        bal: totBal,
        cc: totCC,
        diff: difGlobal,
      },
      {
        desc: '(-) Fornecedores com Mov. Crédito Somente no Balancete',
        qtd: grupos.somenteBalCred.length,
        bal: sBal,
        cc: 0,
        diff: sBal,
      },
      {
        desc: '(-) Fornecedores Comuns com Divergência de Valores',
        qtd: grupos.divergencias.length,
        bal: sum(grupos.divergencias, (r) => r.balCred),
        cc: sum(grupos.divergencias, (r) => r.ccVal),
        diff: difDiverg,
      },
      {
        desc: '(=) Fornecedores Comuns com Batimento Exato (100%)',
        qtd: grupos.batimentos.length,
        bal: sum(grupos.batimentos, (r) => r.balCred),
        cc: sum(grupos.batimentos, (r) => r.ccVal),
        diff: 0,
      },
    ],
    prova: { sBal, sCC, difDiverg, explicado, residual },
    causaRaiz,
    contagens: {
      batimentos: grupos.batimentos.length,
      divergencias: grupos.divergencias.length,
      somenteBalCred: grupos.somenteBalCred.length,
      somenteBalSemCred: grupos.somenteBalSemCred.length,
      somenteCC: grupos.somenteCC.length,
    },
  };
}

const plural = (n, s, p) => (n === 1 ? s : p);

/** Notas técnicas e parecer, geradas a partir dos números reais da conciliação. */
export function buildNotes(bal, cc, grupos, summary) {
  const notas = [];
  const c = summary.contagens;

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

  if (c.somenteCC > 0) {
    notas.push(
      `Fornecedores Somente no Conta Corrente: ${c.somenteCC} ${plural(c.somenteCC, 'fornecedor aparece', 'fornecedores aparecem')} no Conta Corrente sem conta analítica correspondente no Balancete (total ${fmtBRL(summary.prova.sCC)}). Verifique cadastro e classificação contábil.`,
    );
  } else {
    notas.push(
      'Cadastro: Nenhum fornecedor do Conta Corrente ficou de fora do Balancete (0 pendências de cadastro).',
    );
  }

  // Ocorrências múltiplas no Conta Corrente (ex.: folhas de competências complementares)
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
    'Recomendação: Para conferência de compras do mês (entradas fiscais), confrontar o Mov. Crédito com o Livro de Registro de Entradas / Mapa de Compras. Para conferência de saldo em aberto a pagar, confrontar o Saldo Final com a Posição de Contas a Pagar.',
  );

  return notas;
}
