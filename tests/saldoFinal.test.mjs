import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseBalancete, sumSaldoFinal } from '../src/core/parseBalancete.js';
import { parseContaCorrente, sumSaldoCredor } from '../src/core/parseContaCorrente.js';
import { conciliar, buildSummary, buildNotes, ordenar } from '../src/core/conciliacao.js';
import { round2 } from '../src/core/money.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));

test('Conferência Saldo Final (4ª Coluna): apura batimentos, divergências e prova matemática', () => {
  const bal = parseBalancete(golden.linhasBalancete);
  const cc = parseContaCorrente(golden.linhasContaCorrente);

  assert.equal(bal.suppliers.size, 324);
  assert.equal(cc.suppliers.size, 152);

  const totBal = sumSaldoFinal(bal.suppliers);
  const totCC = sumSaldoCredor(cc.suppliers);
  assert.equal(totBal, 2880340.1);
  assert.equal(totCC, 1519919.53);

  const grupos = conciliar(bal.suppliers, cc.suppliers, { modo: 'saldoFinal' });
  assert.equal(grupos.modo, 'saldoFinal');

  // 71 batimentos exatos e 81 divergências de valores no Saldo Final
  assert.equal(grupos.batimentos.length, 71, 'Deve ter 71 batimentos exatos');
  assert.equal(grupos.divergencias.length, 81, 'Deve ter 81 divergências de valores');

  // Categorização de quem está apenas no Balancete
  assert.equal(grupos.somenteBalCredor.length, 17, 'Deve ter 17 com Saldo Credor em aberto');
  assert.equal(grupos.somenteBalDevedor.length, 88, 'Deve ter 88 com Saldo Devedor');
  assert.equal(grupos.somenteBalZerado.length, 67, 'Deve ter 67 com Saldo Zerado');

  // Nenhum fornecedor do C/C ausente no Balancete
  assert.equal(grupos.somenteCC.length, 0);

  // Prova Matemática
  const resumo = buildSummary(bal.suppliers, cc.suppliers, grupos, { modo: 'saldoFinal' });
  assert.equal(resumo.totBal, 2880340.1);
  assert.equal(resumo.totCC, 1519919.53);
  assert.equal(resumo.difGlobal, 1360420.57);
  assert.equal(round2(resumo.prova.residual), 0.0, 'Resíduo matemático deve ser zero');

  // Notas Técnicas
  const notas = buildNotes(bal.suppliers, cc.suppliers, grupos, resumo, { modo: 'saldoFinal' });
  assert.ok(notas.length >= 4);
  assert.ok(notas.some((n) => n.includes('4ª COLUNA DO BALANCETE')));
  assert.ok(notas.some((n) => n.includes('71')));

  // Ordenação
  const ord = ordenar(grupos, 'saldoFinal');
  assert.ok(Math.abs(ord.divergencias[0].diff) >= Math.abs(ord.divergencias[1].diff));
});

test('Geração da planilha Excel: valida abas, integridade e buffers em ambos os modos', async () => {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const { buildWorkbook, nomeArquivo } = await import('../src/export/excel.js');
  const { extractMetadata } = await import('../src/core/metadata.js');

  const bal = parseBalancete(golden.linhasBalancete);
  const cc = parseContaCorrente(golden.linhasContaCorrente);
  const { meta } = extractMetadata(golden.linhasBalancete, golden.linhasContaCorrente);

  const gruposSaldo = conciliar(bal.suppliers, cc.suppliers, { modo: 'saldoFinal' });
  const resumoSaldo = buildSummary(bal.suppliers, cc.suppliers, gruposSaldo, { modo: 'saldoFinal' });
  const notasSaldo = buildNotes(bal.suppliers, cc.suppliers, gruposSaldo, resumoSaldo, { modo: 'saldoFinal' });

  const gruposCred = conciliar(bal.suppliers, cc.suppliers, { modo: 'credito' });
  const resumoCred = buildSummary(bal.suppliers, cc.suppliers, gruposCred, { modo: 'credito' });
  const notasCred = buildNotes(bal.suppliers, cc.suppliers, gruposCred, resumoCred, { modo: 'credito' });

  const rSaldo = {
    modo: 'saldoFinal',
    grupos: gruposSaldo,
    ordenado: ordenar(gruposSaldo, 'saldoFinal'),
    resumo: resumoSaldo,
    notas: notasSaldo,
    modes: {
      saldoFinal: { modo: 'saldoFinal', grupos: gruposSaldo, ordenado: ordenar(gruposSaldo, 'saldoFinal'), resumo: resumoSaldo, notas: notasSaldo },
      credito: { modo: 'credito', grupos: gruposCred, ordenado: ordenar(gruposCred, 'credito'), resumo: resumoCred, notas: notasCred },
    },
  };

  const wbSaldo = buildWorkbook(ExcelJS, rSaldo, meta);
  assert.ok(wbSaldo.worksheets.length >= 5);
  const sheetNamesSaldo = wbSaldo.worksheets.map((s) => s.name);
  assert.ok(sheetNamesSaldo.includes('Resumo Saldo Final'));
  assert.ok(sheetNamesSaldo.includes('Resumo Mov. Crédito'));
  assert.ok(sheetNamesSaldo.some((n) => n.startsWith('Divergências de Valores')));
  assert.ok(sheetNamesSaldo.some((n) => n.startsWith('Batimentos Exatos')));
  assert.ok(sheetNamesSaldo.some((n) => n.startsWith('Somente no Balancete')));
  assert.ok(sheetNamesSaldo.includes('Base Consolidada Geral'));

  // Confere que a aba Somente no Balancete incluiu todos os 17 + 88 + 67 = 172 fornecedores
  const wsSomente = wbSaldo.worksheets.find((s) => s.name.startsWith('Somente no Balancete'));
  assert.ok(wsSomente, 'Aba Somente no Balancete deve existir');
  assert.equal(wsSomente.actualRowCount, 172 + 2, 'Deve ter 172 fornecedores + cabeçalho + total');

  const bufSaldo = await wbSaldo.xlsx.writeBuffer();
  assert.ok(bufSaldo.byteLength > 10000);
  assert.equal(nomeArquivo(meta), 'Conciliacao_Fornecedores_Agosto_2026.xlsx');

  // Teste no modo Crédito
  const rCred = {
    ...rSaldo,
    modo: 'credito',
    grupos: gruposCred,
    ordenado: ordenar(gruposCred, 'credito'),
    resumo: resumoCred,
    notas: notasCred,
  };
  const wbCred = buildWorkbook(ExcelJS, rCred, meta);
  assert.ok(wbCred.worksheets.length >= 5);
  const bufCred = await wbCred.xlsx.writeBuffer();
  assert.ok(bufCred.byteLength > 10000);
});
