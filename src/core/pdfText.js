/**
 * Extração de texto de PDFs em linhas (equivalente ao extract_text().split('\n') do pdfplumber).
 *
 * O pdf.js entrega itens de texto com coordenadas. Aqui agrupamos os itens por posição
 * vertical (y) e ordenamos por x para reconstruir as linhas visuais do relatório.
 *
 * `pdfjs` é injetado para que o mesmo código rode no navegador e em Node.
 */

const Y_TOLERANCE = 3; // pontos (medido entre os centros verticais dos itens)
const SPACE_GAP = 1.2; // pontos: abertura mínima entre itens para inserir espaço

/** Reconstrói linhas a partir dos itens de texto de uma página. */
export function itemsToLines(items) {
  const cells = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || it.str === '') continue;
    cells.push({
      str: it.str,
      x: it.transform[4],
      // Centro vertical: rótulos em fonte maior (ex.: "TOTAL MÊS") têm baseline mais baixa.
      y: it.transform[5] + (it.height || 0) / 2,
      w: it.width || 0,
    });
  }

  // De cima para baixo; dentro da mesma linha, esquerda para direita.
  cells.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const c of cells) {
    const row = rows.find((r) => Math.abs(r.y - c.y) <= Y_TOLERANCE);
    if (row) row.cells.push(c);
    else rows.push({ y: c.y, cells: [c] });
  }
  rows.sort((a, b) => b.y - a.y);

  return rows
    .map((row) => {
      row.cells.sort((a, b) => a.x - b.x);
      let out = '';
      let prevEnd = null;
      for (const c of row.cells) {
        if (prevEnd !== null) {
          const gap = c.x - prevEnd;
          const needsSpace = gap > SPACE_GAP && !out.endsWith(' ') && !c.str.startsWith(' ');
          if (needsSpace) out += ' ';
        }
        out += c.str;
        prevEnd = c.x + c.w;
      }
      return out.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

/**
 * Lê um PDF e devolve as linhas de cada página: string[][].
 * @param {ArrayBuffer|Uint8Array} data
 * @param {object} pdfjs módulo do pdf.js já configurado
 * @param {(done:number,total:number)=>void} [onProgress]
 * @param {number} [maxPages] limita a leitura às primeiras N páginas (detecção rápida)
 */
export async function extractPages(data, pdfjs, onProgress, maxPages = Infinity) {
  // Cópia: o pdf.js transfere (destaca) o buffer recebido, e o chamador pode reutilizá-lo.
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)).slice();
  const task = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  const pages = [];
  try {
    const total = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items));
      page.cleanup();
      if (onProgress) onProgress(i, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
