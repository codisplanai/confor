import { h, clear } from './dom.js';
import { fmtBRL, round2 } from '../core/money.js';

/**
 * Tabela com busca, filtro por lista, ordenação por coluna e rodapé de totais.
 *
 * columns: [{ key, label, kind: 'text'|'money'|'wrap'|'tag', tag?: (row)=>({text,type}), cls?: (row)=>string }]
 * config:  { rows, columns, searchKeys, filter?: { label, get: (row)=>string }, totals?: string[], totalLabel }
 */
export function createTable(config) {
  const { rows, columns, searchKeys, filter, totals = [], totalLabel = 'Total' } = config;
  const state = { q: '', filterVal: '', sortKey: null, sortDir: 1 };

  const searchInput = h('input', {
    class: 'input search-input',
    type: 'text',
    placeholder: 'Buscar por código, nome ou CNPJ…',
    'aria-label': 'Buscar na tabela',
    oninput: (e) => {
      state.q = e.target.value;
      clearBtn.hidden = !state.q;
      renderBody();
    },
  });

  const clearBtn = h(
    'button',
    {
      class: 'search-clear-btn',
      type: 'button',
      title: 'Limpar busca',
      'aria-label': 'Limpar busca',
      hidden: true,
      onclick: () => {
        searchInput.value = '';
        state.q = '';
        clearBtn.hidden = true;
        renderBody();
        searchInput.focus();
      },
    },
    '×',
  );

  const searchBox = h(
    'div',
    { class: 'search-box' },
    h(
      'span',
      { class: 'search-icon', 'aria-hidden': 'true' },
      h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '16',
          height: '16',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2.2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        h('circle', { cx: '11', cy: '11', r: '8' }),
        h('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' }),
      ),
    ),
    searchInput,
    clearBtn,
  );

  let select = null;
  if (filter) {
    const rawOptions = rows.map(filter.get).filter((v) => v !== undefined && v !== null && v !== '');
    const options = [...new Set(rawOptions)].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    select = h(
      'select',
      {
        class: 'input select-input',
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
          const isSorted = state.sortKey === c.key;
          const th = h(
            'th',
            {
              class: `${c.kind === 'money' ? 'num' : ''} ${isSorted ? 'is-sorted' : ''}`.trim(),
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
            h('span', { class: 'arrow' }, isSorted ? (state.sortDir === 1 ? ' ▲' : ' ▼') : ''),
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
      const isFiltered = Boolean(state.q || state.filterVal);
      const emptyContent = h(
        'div',
        { class: 'table-empty' },
        h(
          'div',
          { class: 'table-empty__icon', 'aria-hidden': 'true' },
          h(
            'svg',
            {
              viewBox: '0 0 24 24',
              width: '36',
              height: '36',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.8',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            },
            h('circle', { cx: '11', cy: '11', r: '8' }),
            h('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' }),
            h('line', { x1: '8', y1: '11', x2: '14', y2: '11' }),
          ),
        ),
        h('p', { class: 'table-empty__title' }, isFiltered ? 'Nenhum registro encontrado' : 'Nenhum registro nesta categoria'),
        h(
          'p',
          { class: 'table-empty__desc' },
          isFiltered
            ? 'Tente ajustar os termos da busca ou redefinir os filtros aplicados.'
            : 'Não constam fornecedores listados com esta classificação.',
        ),
        isFiltered
          ? h(
              'button',
              {
                class: 'btn btn--ghost btn--sm table-empty__btn',
                type: 'button',
                onclick: () => {
                  state.q = '';
                  state.filterVal = '';
                  searchInput.value = '';
                  clearBtn.hidden = true;
                  if (select) select.value = '';
                  renderBody();
                },
              },
              'Limpar busca e filtros',
            )
          : null,
      );
      tbody.append(h('tr', {}, h('td', { colspan: columns.length, class: 'table-empty-cell' }, emptyContent)));
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
          const s = round2(list.reduce((t, r) => t + (Number(r[c.key]) || 0), 0));
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

  const scrollHint = h(
    'div',
    { class: 'table-scroll-hint', 'aria-hidden': 'true' },
    h(
      'svg',
      { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      h('path', { d: 'M18 8L22 12L18 16' }),
      h('path', { d: 'M6 8L2 12L6 16' }),
      h('path', { d: 'M2 12H22' }),
    ),
    h('span', {}, 'Deslize horizontalmente para visualizar todas as colunas'),
  );

  return h(
    'div',
    { class: 'table-container' },
    h('div', { class: 'toolbar' }, searchBox, select, count),
    scrollHint,
    h('div', { class: 'table-scroll' }, table),
  );
}

