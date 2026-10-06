/**
 * Teste de paridade: o pipeline JS (pdf.js) deve reproduzir exatamente o resultado
 * do script Python original (pdfplumber), registrado em tests/golden.json.
 *
 * Uso:  npm test   (gere o golden antes: python webapp/scripts/dump_golden.py)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { extractPages } from '../src/core/pdfText.js';
import { analyze } from '../src/core/pipeline.js';
import { fmtNum, round2 } from '../src/core/money.js';

const here = dirname(fileURLToPath(import.meta.url));
const raiz = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));

const pdfBal = join(raiz, 'Amostras', 'BALANCO0093-0108A3108DE2026JULIANA.PDF');
const pdfCC = join(raiz, 'Amostras', 'cprccforn.pdf');

let falhas = 0;
async function teste(nome, fn) {
  try {
    await fn();
    console.log(`  ✔ ${nome}`);
  } catch (e) {
    falhas += 1;
    console.log(`  ✘ ${nome}\n    ${String(e.message).split('\n').join('\n    ')}`);
  }
}

const load = (p) => new Uint8Array(readFileSync(p));
const files = [
  { name: 'cprccforn.pdf', data: load(pdfCC) }, // ordem trocada de propósito
  { name: 'BALANCO.PDF', data: load(pdfBal) },
];

console.log('\nParidade JS x Python');

await teste('linhas extraídas pelo pdf.js = linhas do pdfplumber (Balancete)', async () => {
  const pages = await extractPages(load(pdfBal), pdfjs);
  compararLinhas(pages, golden.linhasBalancete, 'Balancete');
});

await teste('linhas extraídas pelo pdf.js = linhas do pdfplumber (Conta Corrente)', async () => {
  const pages = await extractPages(load(pdfCC), pdfjs);
  compararLinhas(pages, golden.linhasContaCorrente, 'Conta Corrente');
});

function compararLinhas(pages, esperado, rotulo) {
  assert.equal(pages.length, esperado.length, `${rotulo}: nº de páginas`);
  const dif = [];
  pages.forEach((p, i) => {
    const max = Math.max(p.length, esperado[i].length);
    for (let j = 0; j < max; j++) {
      if (p[j] !== esperado[i][j]) dif.push(`p${i + 1} l${j + 1}\n  JS: ${p[j]}\n  PY: ${esperado[i][j]}`);
    }
  });
  assert.equal(dif.length, 0, `${rotulo}: ${dif.length} linha(s) diferentes:\n${dif.slice(0, 8).join('\n')}`);
}

const r = await analyze(files, pdfjs);

await teste('Balancete: mesmos fornecedores e valores', () => {
  assert.equal(r.bal.size, Object.keys(golden.balancete).length);
  for (const [cod, g] of Object.entries(golden.balancete)) {
    const b = r.bal.get(cod);
    assert.ok(b, `fornecedor ${cod} ausente`);
    assert.equal(b.nome, g.nome, `nome ${cod}`);
    assert.equal(b.classif, g.classif);
    for (const k of ['saldoInicial', 'movDebito', 'movCredito', 'saldoFinal']) {
      assert.equal(round2(b[k]), round2(g[k]), `${k} ${cod}`);
    }
  }
});

await teste('Conta Corrente: mesmos fornecedores, CNPJ e saldos', () => {
  assert.equal(r.cc.size, Object.keys(golden.contaCorrente).length);
  for (const [cod, g] of Object.entries(golden.contaCorrente)) {
    const c = r.cc.get(cod);
    assert.ok(c, `fornecedor ${cod} ausente`);
    assert.equal(c.cnpj, g.cnpj);
    assert.equal(c.nome, g.nome);
    assert.equal(c.saldoCredor, g.saldoCredor, `saldo ${cod}`);
    assert.equal(c.entries.length, g.ocorrencias, `ocorrências ${cod}`);
  }
});

await teste('Grupos: 69 / 83 / 56 / 116 / 0, com os mesmos fornecedores', () => {
  const g = r.grupos;
  for (const k of Object.keys(golden.grupos)) {
    assert.deepEqual(g[k].map((x) => x.cod), golden.grupos[k], `grupo ${k}`);
  }
});

await teste('Diagnóstico das 83 divergências idêntico (categoria e texto sem números)', () => {
  const soTexto = (t) => t.replace(/[-+]?[\d.,]+/g, '#');
  for (const d of r.grupos.divergencias) {
    const g = golden.diagnosticos[d.cod];
    assert.equal(d.categoria, g.categoria, `categoria ${d.cod}`);
    assert.equal(soTexto(d.diag), soTexto(g.texto), `texto ${d.cod}`);
  }
});

await teste('Totais: crédito, conta corrente e diferença global', () => {
  assert.equal(r.resumo.totBal, 2309729.62);
  assert.equal(r.resumo.totCC, 1519919.53);
  assert.equal(r.resumo.difGlobal, 789810.09);
  assert.equal(r.resumo.qtdFornecedores, 324);
  assert.equal(r.resumo.prova.sBal, 491935.53);
  assert.equal(r.resumo.prova.difDiverg, 297874.56);
  assert.equal(r.resumo.prova.residual, 0);
  assert.equal(r.resumo.totBal, golden.totaisBalancete.credito);
  assert.equal(r.resumo.totCC, golden.totalContaCorrente);
});

await teste('Metadados: empresa, CNPJ, competência e emissão', () => {
  assert.match(r.meta.empresa, /MERCADAO DE CARNES CARMO/);
  assert.equal(r.meta.cnpj, '10.993.105/0001-42');
  assert.equal(r.meta.mes, 'Agosto');
  assert.equal(r.meta.ano, '2026');
  assert.equal(r.meta.emissao, '05/10/2026');
  assert.equal(r.meta.codigo, '0093');
});

await teste('Verificações de integridade todas OK', () => {
  const ruins = r.checks.filter((c) => !c.ok).map((c) => c.texto);
  assert.deepEqual(ruins, []);
});

await teste('Notas dinâmicas mencionam UNIFRIO (ocorrência múltipla) e contagens reais', () => {
  const txt = r.notas.join('\n');
  assert.match(txt, /UNIFRIO/);
  assert.match(txt, /4\.900,00/);
  assert.match(txt, /56 fornecedores/);
});

await teste('Erros claros: arquivo único, PDF repetido', async () => {
  await assert.rejects(analyze([files[0]], pdfjs), /exatamente 2/);
  await assert.rejects(analyze([files[0], { name: 'copia.pdf', data: load(pdfCC) }], pdfjs), /mesmo tipo/);
  await assert.rejects(analyze(files, pdfjs, { account: '9999999999' }), /não foi encontrada/);
});

console.log(
  `\nTotais: ${fmtNum(r.resumo.totBal)} | ${fmtNum(r.resumo.totCC)} | dif ${fmtNum(r.resumo.difGlobal)}`,
);
if (falhas) {
  console.log(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
