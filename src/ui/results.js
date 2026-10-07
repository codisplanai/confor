import { h, clear, $ } from './dom.js';
import { fmtBRL } from '../core/money.js';
import { createTable } from './table.js';
import { logger } from '../core/logger.js';

const GRUPOS_CREDITO = [
  { key: 'batimentos', label: 'Batimentos exatos', color: 'hsl(152 62% 44%)' },
  { key: 'divergencias', label: 'Divergência de valores', color: 'hsl(352 78% 58%)' },
  { key: 'somenteBalCred', label: 'Somente no Balancete (c/ crédito)', color: 'hsl(40 94% 55%)' },
  { key: 'somenteBalSemCred', label: 'Somente no Balancete (sem crédito)', color: 'hsl(215 20% 58%)' },
  { key: 'somenteCC', label: 'Somente no Conta Corrente', color: 'hsl(262 70% 66%)' },
];

const GRUPOS_SALDO_FINAL = [
  { key: 'batimentos', label: 'Batimentos exatos', color: 'hsl(152 62% 44%)' },
  { key: 'divergencias', label: 'Divergência de valores', color: 'hsl(352 78% 58%)' },
  { key: 'somenteBalCredor', label: 'Saldo Credor em aberto', color: 'hsl(40 94% 55%)' },
  { key: 'somenteBalDevedor', label: 'Saldo Devedor (Adiantamento)', color: 'hsl(199 89% 58%)' },
  { key: 'somenteBalZerado', label: 'Saldo Zerado / Quitado', color: 'hsl(215 20% 58%)' },
  { key: 'somenteCC', label: 'Somente no Conta Corrente', color: 'hsl(262 70% 66%)' },
];

const nfInt = new Intl.NumberFormat('pt-BR');

/* ------------------------------ KPIs ------------------------------ */
const KPI_ICONS = {
  balancete:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  cc:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  diferenca:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 7h18M6 7l-3 7h6L6 7zm12 0l-3 7h6l-3-7z"/></svg>',
  batimentos:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
};

function renderKpis(r) {
  const s = r.resumo;
  const isSaldo = (r.modo || 'saldoFinal') === 'saldoFinal';
  const total = r.grupos.base.length;
  const pct = total ? (s.contagens.batimentos / total) * 100 : 0;
  const fechou = Math.abs(s.prova.residual) < 0.01;

  const cards = [
    {
      id: 'kpi-bal',
      label: isSaldo ? 'Saldo Final (4ª Coluna Balancete)' : 'Mov. Crédito (3ª Coluna Balancete)',
      value: fmtBRL(s.totBal),
      sub: `${nfInt.format(s.qtdFornecedores)} contas analíticas`,
      color: 'hsl(212 92% 58%)',
      iconHtml: KPI_ICONS.balancete,
    },
    {
      id: 'kpi-cc',
      label: 'Saldo Credor (Conta Corrente)',
      value: fmtBRL(s.totCC),
      sub: `${nfInt.format(s.qtdCC)} fornecedores`,
      color: 'hsl(262 70% 66%)',
      iconHtml: KPI_ICONS.cc,
    },
    {
      id: 'kpi-dif',
      label: 'Diferença global',
      value: fmtBRL(s.difGlobal),
      sub: isSaldo ? 'Saldo Final − Conta Corrente' : 'Mov. Crédito − Conta Corrente',
      color: Math.abs(s.difGlobal) < 0.01 ? 'hsl(152 62% 44%)' : 'hsl(352 78% 58%)',
      iconHtml: KPI_ICONS.diferenca,
      seal: fechou
        ? { ok: true, text: '✓ Prova fecha em R$ 0,00' }
        : { ok: false, text: `Resíduo ${fmtBRL(s.prova.residual)}` },
    },
    {
      id: 'kpi-bat',
      label: 'Batimentos exatos',
      value: `${nfInt.format(s.contagens.batimentos)} de ${nfInt.format(total)}`,
      sub: `${pct.toFixed(1).replace('.', ',')}% dos fornecedores`,
      color: 'hsl(152 62% 44%)',
      iconHtml: KPI_ICONS.batimentos,
    },
  ];

  const host = clear($('#kpis'));
  cards.forEach((c, i) => {
    host.append(
      h(
        'div',
        { class: 'kpi', id: c.id, style: `--k:${c.color}; animation-delay:${i * 70}ms` },
        h(
          'div',
          { class: 'kpi__top' },
          h('div', { class: 'kpi__label' }, c.label),
          h('div', { class: 'kpi__icon-box', html: c.iconHtml, 'aria-hidden': 'true' }),
        ),
        h('div', { class: 'kpi__value' }, c.value),
        h('div', { class: 'kpi__sub' }, c.sub),
        c.seal ? h('span', { class: `kpi__seal ${c.seal.ok ? '' : 'kpi__seal--bad'}` }, c.seal.text) : null,
      ),
    );
  });
}

/* ------------------------------ Donut ------------------------------ */
function renderDonut(r) {
  const isSaldo = (r.modo || 'saldoFinal') === 'saldoFinal';
  const gruposDef = isSaldo ? GRUPOS_SALDO_FINAL : GRUPOS_CREDITO;
  const total = r.grupos.base.length || 1;
  const R = 70;
  const C = 2 * Math.PI * R;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('width', '190');
  svg.setAttribute('height', '190');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Distribuição dos fornecedores por situação');

  const track = document.createElementNS(NS, 'circle');
  Object.entries({ cx: 100, cy: 100, r: R, fill: 'none', 'stroke-width': 22, stroke: 'currentColor', opacity: 0.08 }).forEach(
    ([k, v]) => track.setAttribute(k, v),
  );
  svg.append(track);

  const segs = [];
  let offset = 0;
  for (const g of gruposDef) {
    const list = r.grupos[g.key] || [];
    const n = list.length;
    if (!n) continue;
    const len = (n / total) * C;
    const c = document.createElementNS(NS, 'circle');
    Object.entries({
      class: 'seg',
      'data-key': g.key,
      cx: 100,
      cy: 100,
      r: R,
      fill: 'none',
      stroke: g.color,
      'stroke-width': 22,
      'stroke-dasharray': `0 ${C}`,
      'stroke-dashoffset': -offset,
    }).forEach(([k, v]) => c.setAttribute(k, v));
    const t = document.createElementNS(NS, 'title');
    t.textContent = `${g.label}: ${n}`;
    c.append(t);
    svg.append(c);
    segs.push({ c, key: g.key, len: Math.max(len - 2, 0.5) });
    offset += len;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => segs.forEach(({ c, len }) => c.setAttribute('stroke-dasharray', `${len} ${C}`))),
  );

  const legend = h(
    'ul',
    { class: 'legend' },
    gruposDef
      .filter((g) => (r.grupos[g.key] || []).length > 0)
      .map((g) => {
        const n = (r.grupos[g.key] || []).length;
        const item = h(
          'li',
          {
            class: 'legend__item',
            onmouseenter: () => {
              segs.forEach(({ c, key }) => {
                if (key === g.key) {
                  c.style.strokeWidth = '28';
                  c.style.filter = 'drop-shadow(0 0 6px currentColor)';
                } else {
                  c.style.opacity = '0.35';
                }
              });
            },
            onmouseleave: () => {
              segs.forEach(({ c }) => {
                c.style.strokeWidth = '22';
                c.style.filter = '';
                c.style.opacity = '1';
              });
            },
          },
          h('span', { class: 'sw', style: `background:${g.color}` }),
          h('span', { class: 'legend__label' }, g.label),
          h('span', { class: 'n' }, nfInt.format(n)),
        );
        return item;
      }),
  );

  clear($('#chart-donut')).append(
    h('div', { class: 'donut' }, svg, h('div', { class: 'donut__center' }, h('strong', {}, nfInt.format(r.grupos.base.length)), h('small', {}, 'fornecedores'))),
    legend,
  );
}

/* ------------------------------ Notas Técnicas ------------------------------ */
function renderNotes(r) {
  const host = clear($('#notes'));
  r.notas.forEach((nota, idx) => {
    const parts = nota.split(': ');
    let title = '';
    let body = nota;
    if (parts.length > 1) {
      title = parts[0].trim();
      body = parts.slice(1).join(': ').trim();
    }
    host.append(
      h(
        'li',
        { class: 'note-card' },
        h(
          'div',
          { class: 'note-card__header' },
          h('span', { class: 'note-card__badge' }, String(idx + 1)),
          title ? h('strong', { class: 'note-card__title' }, title) : null,
        ),
        h('p', { class: 'note-card__text' }, body),
      ),
    );
  });
}

/* ------------------------------ Causas ------------------------------ */
function renderCausas(r) {
  const host = clear($('#chart-causas'));
  const causas = r.resumo.causaRaiz;
  if (!causas.length) {
    host.append(h('p', { class: 'empty' }, 'Sem divergências de valores entre os relatórios.'));
    return;
  }
  const max = Math.max(...causas.map((c) => c.count));
  const bars = [];
  [...causas]
    .sort((a, b) => b.count - a.count)
    .forEach((c) => {
      const bar = h('i');
      bars.push({ bar, w: (c.count / max) * 100 });
      host.append(
        h(
          'div',
          { class: 'cause' },
          h('div', { class: 'cause__row' }, h('span', {}, c.categoria), h('span', {}, `${c.count} · dif ${fmtBRL(c.diff)}`)),
          h('div', { class: 'cause__bar' }, bar),
        ),
      );
    });
  requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(({ bar, w }) => (bar.style.width = `${w}%`))));
}

/* ------------------------------ Tabelas ------------------------------ */
const STATUS_LABEL = {
  ok: 'Quitado no mês (Saldo Zero)',
  diff: 'Saldo credor em aberto',
  alerta: 'Saldo devedor / Adiantamento',
};

function tabelas(r) {
  const o = r.ordenado;
  const isSaldo = (r.modo || 'saldoFinal') === 'saldoFinal';

  const T = {
    cod: { key: 'cod', label: 'Código' },
    cnpj: { key: 'cnpj', label: 'CNPJ / CPF' },
    nome: { key: 'nome', label: 'Fornecedor' },
    classif: { key: 'classif', label: 'Classificação' },
    ini: { key: 'ini', label: 'Saldo Inicial', kind: 'money' },
    deb: { key: 'deb', label: 'Mov. Débito', kind: 'money', cls: () => '' },
    balCred: { key: 'balCred', label: 'Mov. Crédito', kind: 'money', cls: () => '' },
    fim: { key: 'fim', label: isSaldo ? 'Saldo Final (4ª Col)' : 'Saldo Final', kind: 'money' },
    ccVal: { key: 'ccVal', label: 'Saldo Credor (CC)', kind: 'money', cls: () => '' },
    diff: {
      key: 'diff',
      label: isSaldo ? 'Diferença (SF - CC)' : 'Diferença (Créd - CC)',
      kind: 'money',
      cls: (x) => (Math.abs(x.diff) > 0.01 ? 'pos-bad' : ''),
    },
  };
  const searchKeys = ['cod', 'nome', 'cnpj'];

  const tabs = [];

  // 1. Aba Divergências
  const colDiverg = isSaldo
    ? [
        T.cod, T.cnpj, T.nome, T.ini, T.deb, T.balCred, T.fim, T.ccVal, T.diff,
        { key: 'diffCred', label: 'Dif. vs Mov. Créd', kind: 'money' },
        { key: 'diag', label: 'Diagnóstico contábil', kind: 'wrap' },
      ]
    : [
        T.cod, T.cnpj, T.nome, T.balCred, T.ccVal, T.diff, T.ini, T.deb, T.fim,
        { key: 'diffFim', label: 'Dif. vs Saldo Final', kind: 'money' },
        { key: 'diag', label: 'Diagnóstico contábil', kind: 'wrap' },
      ];

  tabs.push({
    id: 'divergencias',
    label: 'Divergências',
    rows: o.divergencias,
    columns: colDiverg,
    filter: { label: 'Causa', get: (x) => x.categoria },
    totals: isSaldo ? ['ini', 'deb', 'balCred', 'fim', 'ccVal', 'diff'] : ['balCred', 'ccVal', 'diff', 'ini', 'deb', 'fim'],
    totalLabel: 'Total divergências',
  });

  // 2. Aba Batimentos Exatos
  tabs.push({
    id: 'batimentos',
    label: 'Batimentos exatos',
    rows: o.batimentos,
    columns: [T.cod, T.cnpj, T.nome, T.ini, T.deb, T.balCred, T.fim, T.ccVal],
    totals: ['ini', 'deb', 'balCred', 'fim', 'ccVal'],
    totalLabel: 'Total batimentos',
  });

  // 3. Aba Somente no Balancete
  const rowsBalancete = isSaldo
    ? [...(o.somenteBalCredor || []), ...(o.somenteBalDevedor || []), ...(o.somenteBalZerado || [])]
    : o.somenteBalCred;

  tabs.push({
    id: 'somenteBal',
    label: 'Somente no Balancete',
    rows: rowsBalancete,
    columns: [
      T.cod, T.nome, T.ini, T.deb, T.balCred, T.fim,
      { key: 'status', label: 'Posição no fechamento', kind: 'tag', tag: (x) => ({ text: x.status, type: x.statusTipo }) },
    ],
    filter: { label: 'Status', get: (x) => STATUS_LABEL[x.statusTipo] || x.status },
    totals: ['ini', 'deb', 'balCred', 'fim'],
    totalLabel: 'Total somente no Balancete',
  });

  // 4. Somente no Conta Corrente (se houver)
  if (r.grupos.somenteCC.length) {
    tabs.push({
      id: 'somenteCC',
      label: 'Somente no Conta Corrente',
      rows: r.grupos.somenteCC,
      columns: [T.cod, T.cnpj, T.nome, T.ccVal],
      totals: ['ccVal'],
      totalLabel: 'Total',
    });
  }

  // 5. Base Consolidada Geral
  const SIT_TIPO = {
    batimento: 'ok',
    divergencia: 'diff',
    somenteBalCred: 'alerta',
    somenteBalCredor: 'diff',
    somenteBalDevedor: 'alerta',
    somenteBalZerado: 'neutral',
    somenteBalSemCred: 'neutral',
    somenteCC: 'diff',
  };

  tabs.push({
    id: 'base',
    label: 'Base consolidada',
    rows: r.grupos.base,
    columns: [
      T.cod, T.cnpj, T.classif, T.nome, T.ini, T.deb, T.balCred, T.fim, T.ccVal, T.diff,
      { key: 'situacao', label: 'Situação', kind: 'tag', tag: (x) => ({ text: x.situacao, type: SIT_TIPO[x.grupo] || 'neutral' }) },
    ],
    filter: { label: 'Situação', get: (x) => x.situacao },
    totals: ['ini', 'deb', 'balCred', 'fim', 'ccVal', 'diff'],
    totalLabel: 'Total geral',
  });

  return tabs.map((t) => ({ ...t, searchKeys }));
}

let currentTabId = 'divergencias';

function renderTabs(r, preferredId) {
  const tabs = tabelas(r);
  const bar = clear($('#tabs'));
  const host = clear($('#table-host'));
  const cache = new Map();

  const show = (id) => {
    currentTabId = id;
    [...bar.children].forEach((b) => {
      const on = b.dataset.id === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    clear(host);
    const targetTab = tabs.find((t) => t.id === id) || tabs[0];
    if (!cache.has(id)) cache.set(id, createTable(targetTab));
    host.append(cache.get(id));
  };

  tabs.forEach((t) =>
    bar.append(
      h(
        'button',
        { class: 'tab', type: 'button', role: 'tab', id: `tab-${t.id}`, dataset: { id: t.id }, onclick: () => show(t.id) },
        t.label,
        h('em', {}, nfInt.format(t.rows.length)),
      ),
    ),
  );
  const targetId = tabs.some((t) => t.id === preferredId)
    ? preferredId
    : tabs.some((t) => t.id === currentTabId)
      ? currentTabId
      : tabs[0].id;
  show(targetId);
}

/* ------------------------------ API ------------------------------ */
export function renderResults(r, meta, onModeChange) {
  const periodo = [meta.mes, meta.ano].filter(Boolean).join('/');
  $('#result-meta').textContent = [
    meta.empresa,
    meta.cnpj ? `CNPJ ${meta.cnpj}` : '',
    periodo ? `Competência ${periodo}` : '',
    meta.emissao ? `Emissão ${meta.emissao}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  function updateModeUI(modo) {
    const isSaldo = modo === 'saldoFinal';
    const descEl = $('#result-mode-desc');
    if (descEl) {
      descEl.textContent = isSaldo
        ? 'Exibindo conciliação pela 4ª coluna (Saldo Final acumulado x Saldo Credor C/C)'
        : 'Exibindo conciliação pela 3ª coluna (Mov. Crédito bruto x Saldo Credor C/C)';
    }

    const pills = document.querySelectorAll('#mode-selector-step3 .segmented-pill');
    pills.forEach((p) => {
      const active = p.dataset.mode === modo;
      p.classList.toggle('is-active', active);
      p.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function applyMode(modo) {
    if (r.modes && r.modes[modo]) {
      r.modo = modo;
      const target = r.modes[modo];
      r.grupos = target.grupos;
      r.ordenado = target.ordenado;
      r.resumo = target.resumo;
      r.notas = target.notas;
      logger.info('MODO', `Visualização alternada instantaneamente para: ${modo === 'saldoFinal' ? 'Saldo Final (4ª Coluna)' : 'Movimento Crédito (3ª Coluna)'}`);
      if (typeof onModeChange === 'function') {
        onModeChange(modo);
      }
    }

    updateModeUI(r.modo || 'saldoFinal');
    renderKpis(r);
    renderDonut(r);
    renderCausas(r);
    clear($('#notes')).append(...r.notas.map((n) => h('li', {}, n)));
    renderTabs(r, currentTabId);
  }

  // Registra eventos no seletor de modalidade de Step 3
  const selectorStep3 = $('#mode-selector-step3');
  if (selectorStep3) {
    selectorStep3.querySelectorAll('.segmented-pill').forEach((btn) => {
      btn.onclick = () => {
        const modo = btn.dataset.mode;
        if (modo !== r.modo) {
          applyMode(modo);
        }
      };
    });
  }

  applyMode(r.modo || 'saldoFinal');
}
