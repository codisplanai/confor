/**
 * Carrega o pdf.js (build "legacy", compatível com navegadores corporativos mais antigos)
 * sob demanda, com o worker empacotado pelo Vite.
 */
let cached = null;

export async function loadPdfjs() {
  if (!cached) {
    cached = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return cached;
}
