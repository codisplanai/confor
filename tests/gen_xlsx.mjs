/**
 * Gera tests/out/Conciliacao_gerada.xlsx pelo mesmo código usado no webapp.
 * Depois execute: python webapp/tests/excel_parity.py
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import ExcelJS from 'exceljs';

import { analyze } from '../src/core/pipeline.js';
import { buildWorkbook, nomeArquivo } from '../src/export/excel.js';

const here = dirname(fileURLToPath(import.meta.url));
const raiz = join(here, '..', '..');
const load = (p) => new Uint8Array(readFileSync(p));

const r = await analyze(
  [
    { name: 'BALANCO.PDF', data: load(join(raiz, 'Amostras', 'BALANCO0093-0108A3108DE2026JULIANA.PDF')) },
    { name: 'cprccforn.pdf', data: load(join(raiz, 'Amostras', 'cprccforn.pdf')) },
  ],
  pdfjs,
);

mkdirSync(join(here, 'out'), { recursive: true });
const wb = buildWorkbook(ExcelJS, r, r.meta);
const saida = join(here, 'out', 'Conciliacao_gerada.xlsx');
await wb.xlsx.writeFile(saida);
console.log('Gerado:', saida, '| nome sugerido:', nomeArquivo(r.meta));
