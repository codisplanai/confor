import { h, clear, $ } from './dom.js';
import { fmtBRL } from '../core/money.js';
import { createTable } from './table.js';

const GRUPOS = [
  { key: 'batimentos', label: 'Batimentos exatos', color: 'hsl(152 62% 44%)' },
  { key: 'divergencias', label: 'Divergência de valores', color: 'hsl(352 78% 58%)' },
  { key: 'somenteBalCred', label: 'Somente no Balancete (c/ crédito)', color: 'hsl(40 94% 55%)' },
  { key: 'somenteBalSemCred', label: 'Somente no Balancete (sem crédito)', color: 'hsl(215 20% 58%)' },
  { key: 'somenteCC', label: 'Somente no Conta Corrente', color: 'hsl(262 70% 66%)' },
];

const nfInt = new Intl.NumberFormat('pt-BR');

/* ------------------------------ KPIs ------------------------------ */
function renderKpis(r) {
  const s = r.resumo;
  const total = r.grupos.base.length;
  const pct = total ? (s.contagens.batimentos / total) * 100 : 0;
  const fechou = Math.abs(s.prova.residual) < 0.01;

  const cards = [
    {
      label: 'Mov. Crédito (Balancete)',
      value: fmtBRL(s.totBal),
      sub: `${nfInt.format(s.qtdFornecedores)} fornecedores`,
      color: 'hsl(212 92% 58%)',
    },
    {
      label: 'Saldo Credor (Conta Corrente)',
      value: fmtBRL(s.totCC),
      sub: `${nfInt.format(s.qtdCC)} fornecedores`,
      color: 'hsl(262 70% 66%)',
    },
    {
      label: 'Diferença global',
      value: fmtBRL(s.difGlobal),
      sub: 'Balancete − Conta Corrente',
      color: Math.abs(s.difGlobal) < 0.01 ? 'hsl(152 62% 44%)' : 'hsl(352 78% 58%)',
      seal: fechou
        ? { ok: true, text: '✓ Prova fecha em R$ 0,00' }
        : { ok: false, text: `Resíduo ${fmtBRL(s.prova.residual)}` },
    },
    {
      label: 'Batimentos exatos',
      value: `${nfInt.format(s.contagens.batimentos)} de ${nfInt.format(total)}`,
      sub: `${pct.toFixed(1).replace('.', ',')}% dos fornecedores`,
      color: 'hsl(152 62% 44%)',
    },
  ];

  const host = clear($('#kpis'));
  cards.forEach((c, i) => {
    host.append(
      h(
        'div',
        { class: 'kpi', style: `--k:${c.color}; animation-delay:${i * 70}ms` },
        h('div', { class: 'kpi__label' }, c.label),
        h('div', { class: 'kpi__value' }, c.value),
        h('div', { class: 'kpi__sub' }, c.sub),
        c.seal ? h('span', { class: `kpi__seal ${c.seal.ok ? '' : 'kpi__seal--bad'}` }, c.seal.text) : null,
      ),
    );
  });
}

/* ------------------------------ Donut ------------------------------ */
function renderDonut(r) {
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
  for (const g of GRUPOS) {
    const n = r.grupos[g.key].length;
    if (!n) continue;
    const len = (n / total) * C;
    const c = document.createElementNS(NS, 'circle');
    Object.entries({
      class: 'seg',
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
    segs.push({ c, len: Math.max(len - 2, 0.5) });
    offset += len;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => segs.forEach(({ c, len }) => c.setAttribute('stroke-dasharray', `${len} ${C}`))),
  );

  const legend = h(
    'ul',
    { class: 'legend' },
    GRUPOS.map((g) => {
      const n = r.grupos[g.key].length;
      return h(
        'li',
        {},
        h('span', { class: 'sw', style: `background:${g.color}` }),
        g.label,
        h('span', { class: 'n' }, nfInt.format(n)),
      );
    }),
  );

  clear($('#chart-donut')).append(
    h('div', { class: 'donut' }, svg, h('div', { class: 'donut__center' }, h('strong', {}, nfInt.format(r.grupos.base.length)), h('small', {}, 'fornecedores'))),
    legend,
  );
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
const STATUS_LABEL = { ok: 'Quitado no mês', diff: 'Saldo credor em aberto', alerta: 'Saldo devedor' };

function tabelas(r) {
  const o = r.ordenado;
  const T = {
    cod: { key: 'cod', label: 'Código' },
    cnpj: { key: 'cnpj', label: 'CNPJ / CPF' },
    nome: { key: 'nome', label: 'Fornecedor' },
    classif: { key: 'classif', label: 'Classificação' },
    balCred: { key: 'balCred', label: 'Mov. Crédito (Bal)', kind: 'money', cls: () => '' },
    ccVal: { key: 'ccVal', label: 'Saldo Credor (CC)', kind: 'money', cls: () => '' },
    diff: { key: 'diff', label: 'Diferença', kind: 'money', cls: (x) => (Math.abs(x.diff) > 0.01 ? 'pos-bad' : '') },
    ini: { key: 'ini', label: 'Saldo Inicial', kind: 'money' },
    deb: { key: 'deb', label: 'Mov. Débito', kind: 'money', cls: () => '' },
    fim: { key: 'fim', label: 'Saldo Final', kind: 'money' },
  };
  const searchKeys = ['cod', 'nome', 'cnpj'];

  const tabs = [
    {
      id: 'divergencias',
      label: 'Divergências',
      rows: o.divergencias,
      columns: [
        T.cod, T.cnpj, T.nome, T.balCred, T.ccVal, T.diff, T.ini, T.deb, T.fim,
        { key: 'diffFim', label: 'Dif. vs Saldo Final', kind: 'money' },
        { key: 'diag', label: 'Diagnóstico contábil', kind: 'wrap' },
      ],
      filter: { label: 'Causa', get: (x) => x.categoria },
      totals: ['balCred', 'ccVal', 'diff', 'ini', 'deb', 'fim', 'diffFim'],
      totalLabel: 'Total divergências',
    },
    {
      id: 'somenteBal',
      label: 'Somente no Balancete',
      rows: o.somenteBalCred,
      columns: [
        T.cod, T.nome, T.balCred, T.deb, T.ini, T.fim,
        { key: 'status', label: 'Status ao término do mês', kind: 'tag', tag: (x) => ({ text: x.status, type: x.statusTipo }) },
      ],
      filter: { label: 'Status', get: (x) => STATUS_LABEL[x.statusTipo] },
      totals: ['balCred', 'deb', 'ini', 'fim'],
      totalLabel: 'Total somente no Balancete',
    },
    {
      id: 'batimentos',
      label: 'Batimentos exatos',
      rows: o.batimentos,
      columns: [T.cod, T.cnpj, T.nome, T.balCred, T.ccVal, T.ini, T.deb, T.fim],
      totals: ['balCred', 'ccVal', 'ini', 'deb', 'fim'],
      totalLabel: 'Total batimentos',
    },
  ];
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
  const SIT_TIPO = {
    batimento: 'ok',
    divergencia: 'diff',
    somenteBalCred: 'alerta',
    somenteBalSemCred: 'neutral',
    somenteCC: 'diff',
  };
  tabs.push({
    id: 'base',
    label: 'Base consolidada',
    rows: r.grupos.base,
    columns: [
      T.cod, T.cnpj, T.classif, T.nome, T.balCred, T.ccVal, T.diff, T.ini, T.deb, T.fim,
      { key: 'situacao', label: 'Situação', kind: 'tag', tag: (x) => ({ text: x.situacao, type: SIT_TIPO[x.grupo] }) },
    ],
    filter: { label: 'Situação', get: (x) => x.situacao },
    totals: ['balCred', 'ccVal', 'diff', 'ini', 'deb', 'fim'],
    totalLabel: 'Total geral',
  });

  return tabs.map((t) => ({ ...t, searchKeys }));
}

function renderTabs(r) {
  const tabs = tabelas(r);
  const bar = clear($('#tabs'));
  const host = clear($('#table-host'));
  const cache = new Map();

  const show = (id) => {
    [...bar.children].forEach((b) => {
      const on = b.dataset.id === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    clear(host);
    if (!cache.has(id)) cache.set(id, createTable(tabs.find((t) => t.id === id)));
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
  show(tabs[0].id);
}

/* ------------------------------ API ------------------------------ */
export function renderResults(r, meta) {
  const periodo = [meta.mes, meta.ano].filter(Boolean).join('/');
  $('#result-meta').textContent = [
    meta.empresa,
    meta.cnpj ? `CNPJ ${meta.cnpj}` : '',
    periodo ? `Competência ${periodo}` : '',
    meta.emissao ? `Emissão ${meta.emissao}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  renderKpis(r);
  renderDonut(r);
  renderCausas(r);
  clear($('#notes')).append(...r.notas.map((n) => h('li', {}, n)));
  renderTabs(r);
}
