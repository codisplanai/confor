import { h, clear } from './dom.js';
import { fmtBRL } from '../core/money.js';

/**
 * Tabela com busca, filtro por lista, ordenação por coluna e rodapé de totais.
 *
 * columns: [{ key, label, kind: 'text'|'money'|'wrap'|'tag', tag?: (row)=>({text,type}), cls?: (row)=>string }]
 * config:  { rows, columns, searchKeys, filter?: { label, get: (row)=>string }, totals?: string[], totalLabel }
 */
export function createTable(config) {
  const { rows, columns, searchKeys, filter, totals = [], totalLabel = 'Total' } = config;
  const state = { q: '', filterVal: '', sortKey: null, sortDir: 1 };

  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Buscar por código, nome ou CNPJ…',
    'aria-label': 'Buscar na tabela',
    oninput: (e) => {
      state.q = e.target.value;
      renderBody();
    },
  });

  let select = null;
  if (filter) {
    const options = [...new Set(rows.map(filter.get))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select = h(
      'select',
      {
        class: 'input',
        'aria-label': filter.label,
        onchange: (e) => {
          state.filterVal = e.target.value;
          renderBody();
        },
      },
      h('option', { value: '' }, `${filter.label}: todos`),
      options.map((o) => h('option', { value: o }, o)),
    );
  }

  const count = h('span', { class: 'toolbar__count' });
  const thead = h('thead');
  const tbody = h('tbody');
  const tfoot = h('tfoot');
  const table = h('table', { class: 'data' }, thead, tbody, tfoot);

  function renderHead() {
    clear(thead);
    thead.append(
      h(
        'tr',
        {},
        columns.map((c) => {
          const th = h(
            'th',
            {
              class: c.kind === 'money' ? 'num' : '',
              scope: 'col',
              title: 'Clique para ordenar',
              onclick: () => {
                if (state.sortKey === c.key) state.sortDir *= -1;
                else {
                  state.sortKey = c.key;
                  state.sortDir = c.kind === 'money' ? -1 : 1;
                }
                renderHead();
                renderBody();
              },
            },
            c.label,
            h('span', { class: 'arrow' }, state.sortKey === c.key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : ''),
          );
          return th;
        }),
      ),
    );
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let out = rows;
    if (state.filterVal) out = out.filter((r) => filter.get(r) === state.filterVal);
    if (q) out = out.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    if (state.sortKey) {
      const k = state.sortKey;
      const d = state.sortDir;
      out = [...out].sort((a, b) => {
        const va = a[k] ?? '';
        const vb = b[k] ?? '';
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d;
        return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * d;
      });
    }
    return out;
  }

  function cell(c, r) {
    const v = r[c.key];
    if (c.kind === 'money') {
      const extra = c.cls ? c.cls(r) : v < 0 ? 'neg' : '';
      return h('td', { class: `num ${extra}`.trim() }, fmtBRL(v));
    }
    if (c.kind === 'tag') {
      const t = c.tag(r);
      return h('td', {}, h('span', { class: `tag tag--${t.type}` }, t.text));
    }
    if (c.kind === 'wrap') return h('td', { class: 'wrap' }, v);
    return h('td', {}, v ?? '');
  }

  function renderBody() {
    const list = filtered();
    clear(tbody);
    clear(tfoot);

    if (!list.length) {
      tbody.append(h('tr', {}, h('td', { colspan: columns.length, class: 'table-empty' }, 'Nenhum registro encontrado.')));
    } else {
      const frag = document.createDocumentFragment();
      for (const r of list) frag.append(h('tr', {}, columns.map((c) => cell(c, r))));
      tbody.append(frag);
    }

    if (totals.length && list.length) {
      const tr = h('tr');
      let labeled = false;
      columns.forEach((c) => {
        if (totals.includes(c.key)) {
          const s = list.reduce((t, r) => t + (r[c.key] || 0), 0);
          tr.append(h('td', { class: 'num' }, fmtBRL(s)));
        } else if (!labeled) {
          tr.append(h('td', {}, state.q || state.filterVal ? `${totalLabel} (filtrado)` : totalLabel));
          labeled = true;
        } else tr.append(h('td'));
      });
      tfoot.append(tr);
    }

    count.textContent = `${list.length} de ${rows.length} registro${rows.length === 1 ? '' : 's'}`;
  }

  renderHead();
  renderBody();

  return h(
    'div',
    {},
    h('div', { class: 'toolbar' }, search, select, count),
    h('div', { class: 'table-scroll' }, table),
  );
}
