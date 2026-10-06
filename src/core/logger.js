/**
 * Sistema de Logging e Diagnóstico para o ConFor.
 * Captura eventos de processamento, avisos, erros estruturados e exceções globais.
 */

const MAX_LOGS = 500;

class Logger {
  constructor() {
    this.entries = [];
    this.listeners = new Set();
    this.initGlobalHandlers();
  }

  initGlobalHandlers() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.error('SISTEMA', `Erro não tratado: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.error('PROMISE', `Rejeição não tratada: ${reason?.message || String(reason)}`, {
        stack: reason?.stack || null,
      });
    });
  }

  log(level, tag, message, details = null) {
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      level, // 'info' | 'warn' | 'error' | 'success'
      tag: String(tag).toUpperCase(),
      message: String(message),
      details: details ? (typeof details === 'object' ? details : { raw: details }) : null,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_LOGS) {
      this.entries.shift();
    }

    // Também imprime no console do desenvolvedor
    const prefix = `[${entry.tag}]`;
    if (level === 'error') console.error(prefix, message, details || '');
    else if (level === 'warn') console.warn(prefix, message, details || '');
    else console.log(prefix, message, details || '');

    this.notify();
    return entry;
  }

  info(tag, message, details) {
    return this.log('info', tag, message, details);
  }

  warn(tag, message, details) {
    return this.log('warn', tag, message, details);
  }

  error(tag, message, details) {
    return this.log('error', tag, message, details);
  }

  success(tag, message, details) {
    return this.log('success', tag, message, details);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => this.listeners.delete(fn);
  }

  notify() {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch (err) {
        console.error('Erro no listener do logger:', err);
      }
    }
  }

  clear() {
    this.entries = [];
    this.info('SISTEMA', 'Histórico de diagnóstico limpo pelo usuário.');
  }

  getSnapshot() {
    const total = this.entries.length;
    const errors = this.entries.filter((e) => e.level === 'error').length;
    const warns = this.entries.filter((e) => e.level === 'warn').length;
    const lastEntry = this.entries[this.entries.length - 1] || null;

    return {
      entries: [...this.entries],
      counts: {
        total,
        errors,
        warns,
        info: this.entries.filter((e) => e.level === 'info').length,
        success: this.entries.filter((e) => e.level === 'success').length,
      },
      lastEntry,
    };
  }

  exportText() {
    const lines = [];
    lines.push('================================================================');
    lines.push('          RELATÓRIO DE DIAGNÓSTICO E LOGS - CONFOR              ');
    lines.push('================================================================');
    lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
    lines.push(`URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`);
    lines.push(`Navegador: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}`);
    lines.push(`Resolução: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}`);
    lines.push(`Plataforma: ${typeof navigator !== 'undefined' ? navigator.platform : 'N/A'}`);
    lines.push(`Total de eventos registrados: ${this.entries.length}`);
    lines.push('----------------------------------------------------------------\n');

    if (this.entries.length === 0) {
      lines.push('Nenhum registro no histórico de logs.');
    } else {
      for (const e of this.entries) {
        const time = e.timestamp.toISOString().split('T')[1].replace('Z', '');
        lines.push(`[${time}] [${e.level.toUpperCase().padEnd(7)}] [${e.tag}] ${e.message}`);
        if (e.details) {
          try {
            const pretty = JSON.stringify(e.details, null, 2);
            lines.push(
              pretty
                .split('\n')
                .map((l) => `    ${l}`)
                .join('\n'),
            );
          } catch {
            lines.push(`    ${String(e.details)}`);
          }
        }
      }
    }

    lines.push('\n================================================================');
    lines.push('                      FIM DO DIAGNÓSTICO                        ');
    lines.push('================================================================');
    return lines.join('\n');
  }

  download() {
    const content = this.exportText();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `confor-diagnostico-${dateStr}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export const logger = new Logger();
