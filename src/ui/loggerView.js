import { h, $, clear, toast } from './dom.js';
import { logger } from '../core/logger.js';

/**
 * Cria e gerencia o componente visual de "Acompanhamento do Processamento".
 * Renderiza o painel exatamente com a estética da referência (ícone de pulso,
 * contadores, botões de Ver/Baixar/Limpar histórico e terminal de inspeção).
 */
export function initLoggerView() {
  const container = $('#processing-monitor');
  if (!container) return;

  let isOpen = false;
  let activeFilter = 'all';
  let searchTerm = '';

  // Elementos do Card Principal
  const statusMsg = h('div', { class: 'monitor__status' }, 'O acompanhamento começa quando você processar os relatórios.');
  const badgeCounter = h('span', { class: 'monitor__badge' }, '0');
  const btnToggle = h(
    'button',
    {
      class: 'monitor__btn monitor__btn--view',
      type: 'button',
      title: 'Ver histórico detalhado de logs',
      onclick: () => {
        isOpen = !isOpen;
        renderDrawer();
      },
    },
    h(
      'svg',
      { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      h('path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }),
      h('circle', { cx: '12', cy: '12', r: '3' }),
    ),
    h('span', {}, 'Ver histórico'),
    badgeCounter,
  );

  const btnDownload = h(
    'button',
    {
      class: 'monitor__btn monitor__btn--download',
      type: 'button',
      title: 'Baixar relatório de diagnóstico (.log)',
      onclick: () => {
        logger.download();
        toast('Relatório de diagnóstico baixado com sucesso!');
      },
    },
    h(
      'svg',
      { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
      h('polyline', { points: '7 10 12 15 17 10' }),
      h('line', { x1: '12', y1: '15', x2: '12', y2: '3' }),
    ),
    h('span', {}, 'Baixar histórico'),
  );

  const btnClear = h(
    'button',
    {
      class: 'monitor__btn-link',
      type: 'button',
      title: 'Limpar todos os logs da sessão',
      onclick: () => {
        logger.clear();
        toast('Histórico de logs limpo.');
      },
    },
    h(
      'svg',
      { viewBox: '0 0 24 24', width: '13', height: '13', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      h('polyline', { points: '3 6 5 6 21 6' }),
      h('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
    ),
    h('span', {}, 'Limpar histórico'),
  );

  // Drawer / Painel Expandido
  const drawerHost = h('div', { class: 'monitor__drawer', hidden: true });

  // Montagem do card principal
  const card = h(
    'div',
    { class: 'monitor-card' },
    h(
      'div',
      { class: 'monitor-card__main' },
      h(
        'div',
        { class: 'monitor__info' },
        h(
          'div',
          { class: 'monitor__title-row' },
          h(
            'span',
            { class: 'monitor__pulse-icon', 'aria-hidden': 'true' },
            h(
              'svg',
              { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
              h('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' }),
            ),
          ),
          h('h3', { class: 'monitor__title' }, 'Acompanhamento do processamento'),
        ),
        statusMsg,
        h('div', { class: 'monitor__note' }, 'Registros temporários mantidos apenas nesta página. Eles serão perdidos ao fechar ou recarregar.'),
      ),
      h(
        'div',
        { class: 'monitor__actions' },
        h('div', { class: 'monitor__actions-top' }, btnToggle, btnDownload),
        h('div', { class: 'monitor__actions-bottom' }, btnClear),
      ),
    ),
    drawerHost,
  );

  clear(container).append(card);

  function renderDrawer() {
    drawerHost.hidden = !isOpen;
    btnToggle.classList.toggle('is-open', isOpen);
    if (!isOpen) return;

    const snap = logger.getSnapshot();
    clear(drawerHost);

    // Barra de ferramentas do console
    const searchInput = h('input', {
      class: 'input input--sm input--mono',
      type: 'search',
      placeholder: 'Filtrar por mensagem, tag ou erro…',
      value: searchTerm,
      oninput: (e) => {
        searchTerm = e.target.value.toLowerCase();
        renderLogLines();
      },
    });

    const filterAll = h('button', { class: `pill-btn ${activeFilter === 'all' ? 'is-active' : ''}`, onclick: () => setFilter('all') }, `Todos (${snap.counts.total})`);
    const filterErr = h('button', { class: `pill-btn pill-btn--err ${activeFilter === 'error' ? 'is-active' : ''}`, onclick: () => setFilter('error') }, `Erros (${snap.counts.errors})`);
    const filterWarn = h('button', { class: `pill-btn pill-btn--warn ${activeFilter === 'warn' ? 'is-active' : ''}`, onclick: () => setFilter('warn') }, `Avisos (${snap.counts.warns})`);
    const filterInfo = h('button', { class: `pill-btn ${activeFilter === 'info' ? 'is-active' : ''}`, onclick: () => setFilter('info') }, `Info (${snap.counts.info + snap.counts.success})`);

    const btnCopy = h(
      'button',
      {
        class: 'btn btn--ghost btn--sm',
        title: 'Copiar todo o diagnóstico para a área de transferência',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(logger.exportText());
            toast('Diagnóstico copiado para a área de transferência!');
          } catch {
            toast('Não foi possível copiar automaticamente.', true);
          }
        },
      },
      h(
        'svg',
        { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
        h('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }),
        h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }),
      ),
      h('span', {}, 'Copiar diagnóstico'),
    );

    const logList = h('div', { class: 'terminal-logs', role: 'log' });

    function setFilter(lvl) {
      activeFilter = lvl;
      renderDrawer();
    }

    function renderLogLines() {
      clear(logList);
      let items = snap.entries;

      if (activeFilter !== 'all') {
        if (activeFilter === 'info') items = items.filter((x) => x.level === 'info' || x.level === 'success');
        else items = items.filter((x) => x.level === activeFilter);
      }

      if (searchTerm) {
        items = items.filter(
          (x) =>
            x.message.toLowerCase().includes(searchTerm) ||
            x.tag.toLowerCase().includes(searchTerm) ||
            (x.details && JSON.stringify(x.details).toLowerCase().includes(searchTerm)),
        );
      }

      if (!items.length) {
        logList.append(h('div', { class: 'terminal-empty' }, 'Nenhum registro encontrado para este filtro.'));
        return;
      }

      for (const item of items) {
        const timeStr = item.timestamp.toTimeString().split(' ')[0] + '.' + String(item.timestamp.getMilliseconds()).padStart(3, '0');
        const hasDetails = Boolean(item.details);
        let detailEl = null;

        if (hasDetails) {
          const formatted = JSON.stringify(item.details, null, 2);
          detailEl = h('pre', { class: 'terminal-line__details', hidden: true }, formatted);
        }

        const line = h(
          'div',
          { class: `terminal-line terminal-line--${item.level}` },
          h('span', { class: 'terminal-time' }, timeStr),
          h('span', { class: `terminal-badge terminal-badge--${item.level}` }, item.level.toUpperCase()),
          h('span', { class: 'terminal-tag' }, `[${item.tag}]`),
          h('span', { class: 'terminal-msg' }, item.message),
          hasDetails
            ? h(
                'button',
                {
                  class: 'terminal-expand-btn',
                  type: 'button',
                  title: 'Ver detalhes do evento',
                  onclick: () => {
                    detailEl.hidden = !detailEl.hidden;
                  },
                },
                '{…}',
              )
            : null,
          detailEl,
        );

        logList.append(line);
      }
    }

    renderLogLines();

    drawerHost.append(
      h(
        'div',
        { class: 'drawer-toolbar' },
        h('div', { class: 'drawer-filters' }, filterAll, filterErr, filterWarn, filterInfo),
        h('div', { class: 'drawer-actions' }, searchInput, btnCopy),
      ),
      logList,
    );
  }

  // Assina alterações no logger para sincronizar a UI em tempo real
  logger.subscribe((snap) => {
    badgeCounter.textContent = String(snap.counts.total);
    badgeCounter.classList.toggle('has-errors', snap.counts.errors > 0);

    if (snap.lastEntry) {
      const time = snap.lastEntry.timestamp.toTimeString().split(' ')[0];
      if (snap.counts.errors > 0) {
        statusMsg.innerHTML = `<span class="status-indicator status-indicator--err"></span> ${snap.counts.errors} erro(s) registrado(s) no processamento (${snap.lastEntry.message})`;
      } else if (snap.lastEntry.level === 'success') {
        statusMsg.innerHTML = `<span class="status-indicator status-indicator--ok"></span> Processamento concluído com êxito às ${time}.`;
      } else {
        statusMsg.innerHTML = `<span class="status-indicator status-indicator--busy"></span> [${time}] ${snap.lastEntry.message}`;
      }
    } else {
      statusMsg.textContent = 'O acompanhamento começa quando você processar os relatórios.';
    }

    if (isOpen) renderDrawer();
  });

  // Registra log inicial de prontidão do sistema
  logger.info('INÍCIO', 'Sistema de conciliação contábil carregado e pronto para uso.');
}
