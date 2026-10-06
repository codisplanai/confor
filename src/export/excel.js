/**
 * Geração da planilha Excel de conferência.
 * Porta fiel de `gerar_relatorio_excel` (conciliacao_fornecedores.py): mesmas 5 abas, cores,
 * larguras, fórmulas SUM e ordenações. Empresa, competência, contagens e notas são dinâmicos.
 *
 * `ExcelJS` é injetado para rodar tanto no navegador quanto em Node (testes).
 */
import { round2 } from '../core/money.js';

const COR = {
  navy: '1B365D',
  azulClaro: 'E8F1F5',
  verde: '2E7D32',
  verdeClaro: 'E8F5E9',
  vermelho: 'C62828',
  vermelhoClaro: 'FFEBEE',
  amareloClaro: 'FFFDE7',
  zebra: 'F9FAFB',
  borda: 'D1D5DB',
};

const FMT_MOEDA = 'R$ #,##0.00';

const solid = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
const side = (style, hex) => ({ style, color: { argb: `FF${hex}` } });
const font = (o) => ({ name: 'Calibri', size: 11, ...o, color: o.color ? { argb: `FF${o.color}` } : undefined });

const F = {
  titulo: font({ size: 16, bold: true, color: COR.navy }),
  subtitulo: font({ italic: true, color: '555555' }),
  secao: font({ size: 12, bold: true, color: COR.navy }),
  header: font({ bold: true, color: 'FFFFFF' }),
  bold: font({ bold: true }),
  regular: font({}),
};

const FILL = {
  navy: solid(COR.navy),
  verde: solid(COR.verde),
  vermelho: solid(COR.vermelho),
  zebra: solid(COR.zebra),
  alerta: solid(COR.amareloClaro),
  ok: solid(COR.verdeClaro),
  diff: solid(COR.vermelhoClaro),
  azulClaro: solid(COR.azulClaro),
};

const BORDER = {
  thin: { left: side('thin', COR.borda), right: side('thin', COR.borda), top: side('thin', COR.borda), bottom: side('thin', COR.borda) },
  total: { top: side('thin', COR.navy), bottom: side('double', COR.navy) },
};

const ALIGN = {
  center: { horizontal: 'center', vertical: 'middle' },
  left: { horizontal: 'left', vertical: 'middle' },
  header: { horizontal: 'center', vertical: 'middle', wrapText: true },
};

const FILL_BY_TIPO = { ok: FILL.ok, alerta: FILL.alerta, diff: FILL.diff };

function put(ws, r, c, value, style = {}) {
  const cell = ws.getCell(r, c);
  cell.value = value;
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.align) cell.alignment = style.align;
  if (style.fmt) cell.numFmt = style.fmt;
  return cell;
}

function sheetName(base, n) {
  const nome = n === undefined ? base : `${base} (${n})`;
  return nome.slice(0, 31);
}

function headerRow(ws, titles, widths, fill) {
  titles.forEach((h, i) => {
    put(ws, 1, i + 1, h, { font: F.header, fill, align: ALIGN.header });
    ws.getCell(1, i + 1).border = BORDER.thin;
    ws.getColumn(i + 1).width = widths[i];
  });
  ws.getRow(1).height = 28;
  ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
}

/** Linha de totais: rótulo mesclado + SUM nas colunas indicadas. */
function totalRow(ws, r, { label, mergeTo, lastCol, sumCols, values, fill }) {
  put(ws, r, 1, label, { font: F.bold });
  ws.mergeCells(r, 1, r, mergeTo);
  const first = 2;
  const last = r - 1;
  for (const col of sumCols) {
    const letter = ws.getColumn(col).letter;
    put(ws, r, col, { formula: `SUM(${letter}${first}:${letter}${last})`, result: values[col] }, { fmt: FMT_MOEDA });
  }
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(r, c);
    cell.font = F.bold;
    cell.border = BORDER.total;
    cell.fill = fill;
  }
}

const colSum = (rows, pick) => round2(rows.reduce((t, x) => t + pick(x), 0));

/**
 * @param {object} ExcelJS biblioteca exceljs
 * @param {object} r resultado de analyze()
 * @param {{empresa:string,codigo:string,cnpj:string,mes:string,ano:string,emissao:string}} meta
 */
export function buildWorkbook(ExcelJS, r, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Conciliação Contábil';
  wb.created = new Date();

  const { divergencias, somenteBalCred, batimentos } = r.ordenado;
  const base = r.grupos.base;
  const resumo = r.resumo;

  // ----------------------------------------------------
  // ABA 1: RESUMO EXECUTIVO
  // ----------------------------------------------------
  const ws1 = wb.addWorksheet('Resumo Executivo', { views: [{ showGridLines: true }] });
  [4, 45, 20, 22, 22, 40].forEach((w, i) => (ws1.getColumn(i + 1).width = w));

  put(ws1, 2, 2, 'CONCILIAÇÃO CONTÁBIL: BALANCETE x CONTA CORRENTE FORNECEDORES', { font: F.titulo });
  const partesSub = [
    `Empresa: ${meta.empresa}${meta.codigo ? ` (${meta.codigo})` : ''}`,
    meta.cnpj ? `CNPJ: ${meta.cnpj}` : '',
    `Competência: ${[meta.mes, meta.ano].filter(Boolean).join('/')}`,
    meta.emissao ? `Emissão: ${meta.emissao}` : '',
  ].filter(Boolean);
  put(ws1, 3, 2, partesSub.join(' | '), { font: F.subtitulo });

  put(ws1, 5, 2, '1. QUADRO GERAL COMPARATIVO', { font: F.secao });

  const hdrQ1 = ['Métrica / Fonte de Dados', 'Qtd Fornecedores', 'Valor Balancete', 'Valor Conta Corrente', 'Diferença Líquida'];
  hdrQ1.forEach((h, i) => {
    const cell = put(ws1, 6, i + 2, h, { font: F.header, fill: FILL.navy, align: ALIGN.header });
    cell.border = BORDER.thin;
  });
  ws1.getRow(6).height = 25;

  let row = 7;
  for (const q of resumo.quadro) {
    put(ws1, row, 2, q.desc, { font: row === 7 ? F.bold : F.regular });
    put(ws1, row, 3, q.qtd, { align: ALIGN.center });
    put(ws1, row, 4, q.bal, { fmt: FMT_MOEDA });
    put(ws1, row, 5, q.cc, { fmt: FMT_MOEDA });
    put(ws1, row, 6, q.diff, { fmt: FMT_MOEDA, font: F.bold, fill: Math.abs(q.diff) > 0.01 ? FILL.diff : FILL.ok });
    for (let c = 2; c <= 6; c++) {
      ws1.getCell(row, c).border = BORDER.thin;
      if (row === 7) ws1.getCell(row, c).fill = FILL.azulClaro;
    }
    row += 1;
  }

  row += 2;
  put(ws1, row, 2, `2. ANÁLISE DE CAUSA-RAIZ DAS ${r.grupos.divergencias.length} DIVERGÊNCIAS`, { font: F.secao });
  row += 1;
  const hdrQ2 = ['Comportamento Contábil Identificado', 'Qtd Fornec.', 'Soma Mov. Crédito (Bal)', 'Soma Saldo Credor (CC)', 'Diferença Líquida'];
  hdrQ2.forEach((h, i) => {
    const cell = put(ws1, row, i + 2, h, { font: F.header, fill: FILL.navy, align: ALIGN.header });
    cell.border = BORDER.thin;
  });
  ws1.getRow(row).height = 25;
  row += 1;

  for (const g of resumo.causaRaiz) {
    put(ws1, row, 2, g.categoria, { font: F.regular });
    put(ws1, row, 3, g.count, { align: ALIGN.center });
    put(ws1, row, 4, g.bal, { fmt: FMT_MOEDA });
    put(ws1, row, 5, g.cc, { fmt: FMT_MOEDA });
    put(ws1, row, 6, g.diff, { fmt: FMT_MOEDA, font: F.bold });
    for (let c = 2; c <= 6; c++) ws1.getCell(row, c).border = BORDER.thin;
    row += 1;
  }

  row += 2;
  put(ws1, row, 2, '3. NOTAS TÉCNICAS E PARECER CONTÁBIL', { font: F.secao });
  row += 1;
  r.notas.forEach((nota, i) => {
    put(ws1, row, 2, `${i + 1}. ${nota}`, { font: F.regular, align: { vertical: 'top', wrapText: true } });
    ws1.mergeCells(row, 2, row, 6);
    // ~ 130 caracteres por linha na largura mesclada (B:F)
    ws1.getRow(row).height = Math.max(1, Math.ceil(nota.length / 120)) * 15 + 3;
    row += 1;
  });

  // ----------------------------------------------------
  // ABA 2: DIVERGÊNCIAS DE VALORES
  // ----------------------------------------------------
  const ws2 = wb.addWorksheet(sheetName('Divergências de Valores', divergencias.length));
  headerRow(
    ws2,
    [
      'Código Terc', 'CNPJ / CPF', 'Razão Social Fornecedor',
      'Balancete Mov. Crédito (A)', 'Conta Corrente Saldo Credor (B)', 'Diferença Bruta (A - B)',
      'Balancete Saldo Inicial', 'Balancete Mov. Débito', 'Balancete Saldo Final',
      'Diferença vs Saldo Final (SF - B)', 'Diagnóstico Contábil da Divergência',
    ],
    [14, 20, 35, 18, 18, 18, 18, 18, 18, 18, 48],
    FILL.vermelho,
  );

  divergencias.forEach((d, i) => {
    const rr = i + 2;
    put(ws2, rr, 1, d.cod, { align: ALIGN.center });
    put(ws2, rr, 2, d.cnpj, { align: ALIGN.center });
    put(ws2, rr, 3, d.nome, { align: ALIGN.left });
    put(ws2, rr, 4, d.balCred, { fmt: FMT_MOEDA });
    put(ws2, rr, 5, d.ccVal, { fmt: FMT_MOEDA });
    put(ws2, rr, 6, d.diff, { fmt: FMT_MOEDA, font: F.bold, fill: FILL.diff });
    put(ws2, rr, 7, d.ini, { fmt: FMT_MOEDA });
    put(ws2, rr, 8, d.deb, { fmt: FMT_MOEDA });
    put(ws2, rr, 9, d.fim, { fmt: FMT_MOEDA });
    const cFim = put(ws2, rr, 10, d.diffFim, { fmt: FMT_MOEDA });
    if (Math.abs(d.diffFim) < 0.01) cFim.fill = FILL.ok;
    else if (Math.abs(d.diffFim) <= 2.0) cFim.fill = FILL.alerta;
    const cDiag = put(ws2, rr, 11, d.diag, { font: F.regular });
    if (d.tag === 'exato') cDiag.fill = FILL.ok;
    else if (d.tag === 'centavos') cDiag.fill = FILL.alerta;
    for (let c = 1; c <= 11; c++) {
      const cell = ws2.getCell(rr, c);
      cell.border = BORDER.thin;
      if (rr % 2 === 1 && !cell.fill) cell.fill = FILL.zebra;
    }
  });
  {
    const rt = divergencias.length + 2;
    const v = {
      4: colSum(divergencias, (x) => x.balCred), 5: colSum(divergencias, (x) => x.ccVal),
      6: colSum(divergencias, (x) => x.diff), 7: colSum(divergencias, (x) => x.ini),
      8: colSum(divergencias, (x) => x.deb), 9: colSum(divergencias, (x) => x.fim),
      10: colSum(divergencias, (x) => x.diffFim),
    };
    totalRow(ws2, rt, { label: 'TOTAL DIVERGÊNCIAS', mergeTo: 3, lastCol: 11, sumCols: [4, 5, 6, 7, 8, 9, 10], values: v, fill: FILL.azulClaro });
  }

  // ----------------------------------------------------
  // ABA 3: SOMENTE NO BALANCETE
  // ----------------------------------------------------
  const ws3 = wb.addWorksheet(sheetName('Somente no Balancete', somenteBalCred.length));
  headerRow(
    ws3,
    ['Código Terc', 'Razão Social Fornecedor', 'Mov. Crédito Balancete', 'Mov. Débito Balancete', 'Saldo Inicial', 'Saldo Final', 'Status Contábil ao Término do Mês'],
    [14, 38, 20, 20, 18, 18, 38],
    FILL.navy,
  );
  somenteBalCred.forEach((s, i) => {
    const rr = i + 2;
    put(ws3, rr, 1, s.cod, { align: ALIGN.center });
    put(ws3, rr, 2, s.nome, { align: ALIGN.left });
    put(ws3, rr, 3, s.balCred, { fmt: FMT_MOEDA });
    put(ws3, rr, 4, s.deb, { fmt: FMT_MOEDA });
    put(ws3, rr, 5, s.ini, { fmt: FMT_MOEDA });
    put(ws3, rr, 6, s.fim, { fmt: FMT_MOEDA });
    put(ws3, rr, 7, s.status, { font: F.regular, fill: FILL_BY_TIPO[s.statusTipo] });
    for (let c = 1; c <= 7; c++) {
      const cell = ws3.getCell(rr, c);
      cell.border = BORDER.thin;
      if (rr % 2 === 1 && c < 7) cell.fill = FILL.zebra;
    }
  });
  {
    const rt = somenteBalCred.length + 2;
    const v = {
      3: colSum(somenteBalCred, (x) => x.balCred), 4: colSum(somenteBalCred, (x) => x.deb),
      5: colSum(somenteBalCred, (x) => x.ini), 6: colSum(somenteBalCred, (x) => x.fim),
    };
    totalRow(ws3, rt, { label: 'TOTAL SOMENTE NO BALANCETE', mergeTo: 2, lastCol: 7, sumCols: [3, 4, 5, 6], values: v, fill: FILL.azulClaro });
  }

  // ----------------------------------------------------
  // ABA 4: BATIMENTOS EXATOS
  // ----------------------------------------------------
  const ws4 = wb.addWorksheet(sheetName('Batimentos Exatos', batimentos.length));
  headerRow(
    ws4,
    ['Código Terc', 'CNPJ / CPF', 'Razão Social Fornecedor', 'Mov. Crédito Balancete', 'Saldo Credor Conta Corrente', 'Diferença', 'Saldo Inicial', 'Mov. Débito', 'Saldo Final', 'Status da Conciliação'],
    [14, 20, 38, 20, 20, 14, 18, 18, 18, 25],
    solid(COR.verde),
  );
  batimentos.forEach((b, i) => {
    const rr = i + 2;
    put(ws4, rr, 1, b.cod, { align: ALIGN.center });
    put(ws4, rr, 2, b.cnpj, { align: ALIGN.center });
    put(ws4, rr, 3, b.nome, { align: ALIGN.left });
    put(ws4, rr, 4, b.balCred, { fmt: FMT_MOEDA });
    put(ws4, rr, 5, b.ccVal, { fmt: FMT_MOEDA });
    put(ws4, rr, 6, 0, { fmt: FMT_MOEDA });
    put(ws4, rr, 7, b.ini, { fmt: FMT_MOEDA });
    put(ws4, rr, 8, b.deb, { fmt: FMT_MOEDA });
    put(ws4, rr, 9, b.fim, { fmt: FMT_MOEDA });
    put(ws4, rr, 10, '100% Batido Exato', { font: F.bold, align: ALIGN.center, fill: FILL.ok });
    for (let c = 1; c <= 10; c++) {
      const cell = ws4.getCell(rr, c);
      cell.border = BORDER.thin;
      if (rr % 2 === 1 && c < 10) cell.fill = FILL.zebra;
    }
  });
  {
    const rt = batimentos.length + 2;
    const v = {
      4: colSum(batimentos, (x) => x.balCred), 5: colSum(batimentos, (x) => x.ccVal),
      7: colSum(batimentos, (x) => x.ini), 8: colSum(batimentos, (x) => x.deb),
      9: colSum(batimentos, (x) => x.fim),
    };
    totalRow(ws4, rt, { label: 'TOTAL BATIMENTOS EXATOS', mergeTo: 3, lastCol: 10, sumCols: [4, 5, 7, 8, 9], values: v, fill: solid(COR.verdeClaro) });
    put(ws4, rt, 6, 0, { fmt: FMT_MOEDA });
  }

  // ----------------------------------------------------
  // ABA 5: BASE CONSOLIDADA GERAL
  // ----------------------------------------------------
  const ws5 = wb.addWorksheet('Base Consolidada Geral');
  headerRow(
    ws5,
    [
      'Código Terc', 'CNPJ / CPF', 'Classificação Contábil', 'Razão Social Fornecedor',
      'Mov. Crédito Balancete', 'Saldo Credor Conta Corrente', 'Diferença Bruta (Bal - CC)',
      'Saldo Inicial Balancete', 'Mov. Débito Balancete', 'Saldo Final Balancete', 'Situação na Conciliação',
    ],
    [14, 20, 16, 38, 18, 18, 18, 18, 18, 18, 30],
    FILL.navy,
  );
  const FILL_SIT = {
    batimento: FILL.ok,
    divergencia: FILL.diff,
    somenteBalCred: FILL.alerta,
    somenteBalSemCred: FILL.zebra,
    somenteCC: FILL.diff,
  };
  base.forEach((b, i) => {
    const rr = i + 2;
    put(ws5, rr, 1, b.cod, { align: ALIGN.center });
    put(ws5, rr, 2, b.cnpj, { align: ALIGN.center });
    put(ws5, rr, 3, b.classif, { align: ALIGN.center });
    put(ws5, rr, 4, b.nome, { align: ALIGN.left });
    put(ws5, rr, 5, b.balCred, { fmt: FMT_MOEDA });
    put(ws5, rr, 6, b.ccVal, { fmt: FMT_MOEDA });
    put(ws5, rr, 7, b.diff, { fmt: FMT_MOEDA, font: F.bold });
    put(ws5, rr, 8, b.ini, { fmt: FMT_MOEDA });
    put(ws5, rr, 9, b.deb, { fmt: FMT_MOEDA });
    put(ws5, rr, 10, b.fim, { fmt: FMT_MOEDA });
    put(ws5, rr, 11, b.situacao, { font: F.regular, fill: FILL_SIT[b.grupo] });
    for (let c = 1; c <= 11; c++) ws5.getCell(rr, c).border = BORDER.thin;
  });
  {
    const rt = base.length + 2;
    const v = {
      5: colSum(base, (x) => x.balCred), 6: colSum(base, (x) => x.ccVal), 7: colSum(base, (x) => x.diff),
      8: colSum(base, (x) => x.ini), 9: colSum(base, (x) => x.deb), 10: colSum(base, (x) => x.fim),
    };
    totalRow(ws5, rt, { label: 'TOTAL GERAL', mergeTo: 4, lastCol: 11, sumCols: [5, 6, 7, 8, 9, 10], values: v, fill: FILL.azulClaro });
  }

  return wb;
}

/** Nome do arquivo: Conciliacao_Fornecedores_<Mes>_<Ano>.xlsx (sem acentos). */
export function nomeArquivo(meta) {
  const limpa = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  const partes = ['Conciliacao_Fornecedores', limpa(meta.mes), limpa(meta.ano)].filter(Boolean);
  return `${partes.join('_')}.xlsx`;
}
