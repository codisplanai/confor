import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { $, $$, h, clear, toast, fmtBytes } from './ui/dom.js';
import { renderResults } from './ui/results.js';
import { loadPdfjs } from './core/pdfBrowser.js';
import { extractPages } from './core/pdfText.js';
import { detectKind, MESES } from './core/metadata.js';
import { analyze, AppError } from './core/pipeline.js';
import { DEFAULT_ACCOUNT } from './core/parseBalancete.js';
import { buildWorkbook, nomeArquivo } from './export/excel.js';

/* ------------------------------ PWA ------------------------------ */
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('Nova versão disponível! Atualizando…');
      setTimeout(() => updateSW(true), 1200);
    },
    onOfflineReady() {
      toast('Aplicativo pronto para uso offline!');
    },
  });
}

let deferredPrompt = null;
const installBtn = $('#pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast('Aplicativo ConFor instalado com sucesso!');
    }
    deferredPrompt = null;
    installBtn.hidden = true;
  });
}

window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.hidden = true;
  deferredPrompt = null;
  toast('Aplicativo ConFor instalado!');
});

/* ------------------------------ Estado ------------------------------ */
const state = {
  files: [], // { id, file, kind: 'pending'|'balancete'|'contaCorrente'|'desconhecido'|'erro' }
  result: null,
  meta: null,
};
let seq = 0;

const KIND_LABEL = {
  balancete: 'Balancete Analítico',
  contaCorrente: 'Conta Corrente',
  desconhecido: 'Tipo não reconhecido',
  erro: 'Não foi possível ler',
  pending: 'Identificando…',
};

/* ------------------------------ Tema ------------------------------ */
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('tema', next);
  } catch (e) {
    /* armazenamento indisponível: ignora */
  }
});

/* ------------------------------ Navegação ------------------------------ */
function setStep(n) {
  const ids = { 1: 'step-upload', 2: 'step-review', 3: 'step-result' };
  Object.entries(ids).forEach(([k, id]) => $(`#${id}`).classList.toggle('is-active', Number(k) === n));
  $$('.stepper__item').forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle('is-active', s === n);
    el.classList.toggle('is-done', s < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------ Upload ------------------------------ */
const dropzone = $('#dropzone');
const input = $('#file-input');

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-over');
  }),
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-over');
  }),
);
dropzone.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
input.addEventListener('change', () => {
  addFiles([...input.files]);
  input.value = '';
});

function showError(msg) {
  const el = $('#upload-error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

function showStatus(msg) {
  $('#status').hidden = !msg;
  $('#status-text').textContent = msg || '';
}

async function addFiles(list) {
  showError('');
  const pdfs = list.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (pdfs.length < list.length) showError('Apenas arquivos PDF são aceitos. Os demais foram ignorados.');
  if (!pdfs.length) return;

  const novos = [];
  for (const file of pdfs) {
    if (state.files.length + novos.length >= 2) {
      showError('Já há 2 arquivos selecionados. Remova um deles para adicionar outro.');
      break;
    }
    novos.push({ id: ++seq, file, kind: 'pending' });
  }
  state.files.push(...novos);
  renderFiles();

  // Detecção rápida do tipo (apenas as 2 primeiras páginas)
  for (const item of novos) {
    try {
      const pdfjs = await loadPdfjs();
      const buf = await item.file.arrayBuffer();
      const pages = await extractPages(buf, pdfjs, null, 2);
      item.kind = detectKind(pages);
    } catch (e) {
      item.kind = 'erro';
    }
    renderFiles();
  }
}

function renderFiles() {
  const list = clear($('#file-list'));
  state.files.forEach((it) => {
    const ok = it.kind === 'balancete' || it.kind === 'contaCorrente';
    const bad = it.kind === 'desconhecido' || it.kind === 'erro';
    list.append(
      h(
        'li',
        { class: 'file-item' },
        h('span', { class: 'file-item__icon' }, 'PDF'),
        h('span', { class: 'file-item__name' }, h('strong', { title: it.file.name }, it.file.name), h('small', {}, fmtBytes(it.file.size))),
        h('span', { class: `badge ${ok ? 'badge--ok' : bad ? 'badge--bad' : ''}` }, KIND_LABEL[it.kind]),
        h(
          'button',
          {
            class: 'file-item__remove',
            type: 'button',
            title: 'Remover arquivo',
            'aria-label': `Remover ${it.file.name}`,
            onclick: () => {
              state.files = state.files.filter((x) => x.id !== it.id);
              showError('');
              renderFiles();
            },
          },
          '×',
        ),
      ),
    );
  });

  const has = (k) => state.files.some((f) => f.kind === k);
  $('#expect-balancete').classList.toggle('is-found', has('balancete'));
  $('#expect-cc').classList.toggle('is-found', has('contaCorrente'));

  const ready = state.files.length === 2 && has('balancete') && has('contaCorrente');
  $('#btn-process').disabled = !ready;

  const invalid = state.files.find((f) => f.kind === 'desconhecido');
  if (invalid && !$('#upload-error').textContent) {
    showError(`"${invalid.file.name}" não parece ser um Balancete Analítico nem um Conta Corrente Fornecedores.`);
  }
  if (state.files.length === 2 && state.files.every((f) => f.kind === state.files[0].kind) && state.files[0].kind !== 'pending') {
    if (ok2(state.files[0].kind)) showError(`Os dois arquivos são do tipo "${KIND_LABEL[state.files[0].kind]}". Envie um de cada.`);
  }
}

const ok2 = (k) => k === 'balancete' || k === 'contaCorrente';

$('#btn-process').addEventListener('click', async () => {
  showError('');
  const btn = $('#btn-process');
  btn.disabled = true;
  showStatus('Carregando leitor de PDF…');
  try {
    const pdfjs = await loadPdfjs();
    const files = [];
    for (const it of state.files) files.push({ name: it.file.name, data: await it.file.arrayBuffer() });
    const account = ($('#account-code').value || DEFAULT_ACCOUNT).replace(/\D/g, '') || DEFAULT_ACCOUNT;
    const result = await analyze(files, pdfjs, { account, onProgress: showStatus });
    state.result = result;
    state.meta = { ...result.meta };
    fillReview(result);
    showStatus('');
    setStep(2);
  } catch (e) {
    showStatus('');
    if (e instanceof AppError) showError(e.message);
    else {
      console.error(e);
      showError('Ocorreu um erro inesperado ao processar os PDFs. Confira se são os relatórios corretos e tente novamente.');
    }
  } finally {
    btn.disabled = false;
    renderFiles();
  }
});

/* ------------------------------ Conferência ------------------------------ */
const mesSelect = $('#meta-mes');
mesSelect.append(h('option', { value: '' }, 'Selecione…'), ...MESES.map((m) => h('option', { value: m }, m)));

function fillReview(r) {
  $('#meta-empresa').value = r.meta.empresa;
  $('#meta-codigo').value = r.meta.codigo;
  $('#meta-cnpj').value = r.meta.cnpj;
  $('#meta-mes').value = r.meta.mes;
  $('#meta-ano').value = r.meta.ano;
  $('#meta-emissao').value = r.meta.emissao;

  const checks = clear($('#checks'));
  r.checks.forEach((c) =>
    checks.append(
      h('li', {}, h('span', { class: `ico ${c.ok ? 'ico--ok' : 'ico--bad'}` }, c.ok ? '✓' : '!'), h('span', {}, c.texto)),
    ),
  );
  const w = clear($('#review-warnings'));
  r.warnings.forEach((t) => w.append(h('div', { class: 'alert alert--warn' }, t)));
}

$('#btn-back').addEventListener('click', () => setStep(1));

$('#btn-continue').addEventListener('click', () => {
  const mes = $('#meta-mes').value;
  const ano = $('#meta-ano').value.trim();
  if (!$('#meta-empresa').value.trim()) return toast('Informe o nome da empresa.', true);
  if (!mes || !/^\d{4}$/.test(ano)) return toast('Informe o mês e o ano (4 dígitos) da competência.', true);

  state.meta = {
    empresa: $('#meta-empresa').value.trim(),
    codigo: $('#meta-codigo').value.trim(),
    cnpj: $('#meta-cnpj').value.trim(),
    mes,
    ano,
    emissao: $('#meta-emissao').value.trim(),
  };
  renderResults(state.result, state.meta);
  setStep(3);
});

/* ------------------------------ Resultado ------------------------------ */
$('#btn-new').addEventListener('click', () => {
  state.files = [];
  state.result = null;
  state.meta = null;
  showError('');
  renderFiles();
  setStep(1);
});

$('#btn-download').addEventListener('click', async () => {
  const btn = $('#btn-download');
  btn.disabled = true;
  try {
    const mod = await import('exceljs');
    const ExcelJS = mod.default || mod;
    const wb = buildWorkbook(ExcelJS, state.result, state.meta);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: nomeArquivo(state.meta) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Planilha gerada: ${nomeArquivo(state.meta)}`);
  } catch (e) {
    console.error(e);
    toast('Não foi possível gerar a planilha. Tente novamente.', true);
  } finally {
    btn.disabled = false;
  }
});

renderFiles();
