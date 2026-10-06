import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logger } from '../src/core/logger.js';

test('Logger: registra eventos em diferentes níveis', () => {
  logger.clear();

  logger.info('TEST_TAG', 'Mensagem informativa', { foo: 'bar' });
  logger.warn('TEST_WARN', 'Mensagem de aviso');
  logger.error('TEST_ERR', 'Mensagem de erro crítico', { codigo: 500 });
  logger.success('TEST_OK', 'Operação concluída com sucesso');

  const snap = logger.getSnapshot();
  // +1 porque clear() adiciona 1 log informativo de reset
  assert.ok(snap.counts.total >= 4, 'Deve conter pelo menos 4 eventos');
  assert.equal(snap.counts.errors, 1, 'Deve ter exatamente 1 erro');
  assert.equal(snap.counts.warns, 1, 'Deve ter exatamente 1 aviso');
  assert.equal(snap.counts.success, 1, 'Deve ter exatamente 1 sucesso');

  const last = snap.lastEntry;
  assert.equal(last.level, 'success');
  assert.equal(last.tag, 'TEST_OK');
  assert.equal(last.message, 'Operação concluída com sucesso');
});

test('Logger: notifica subscribers reativamente', () => {
  let chamado = 0;
  let ultimoTotal = 0;

  const unsubscribe = logger.subscribe((snap) => {
    chamado++;
    ultimoTotal = snap.counts.total;
  });

  // O subscribe invoca imediatamente o snapshot inicial
  assert.equal(chamado, 1);

  logger.info('EVENTO_REATIVO', 'Teste reativo');
  assert.equal(chamado, 2);

  unsubscribe();
  logger.info('EVENTO_DEPOIS', 'Não deve notificar');
  assert.equal(chamado, 2);
});

test('Logger: exporta relatório de diagnóstico em texto formatado', () => {
  logger.clear();
  logger.info('DIAG', 'Evento para exportação', { chave: 'valor123' });
  logger.error('CRIT', 'Falha simulada');

  const text = logger.exportText();
  assert.ok(text.includes('RELATÓRIO DE DIAGNÓSTICO E LOGS - CONFOR'));
  assert.ok(text.includes('[DIAG] Evento para exportação'));
  assert.ok(text.includes('chave'));
  assert.ok(text.includes('valor123'));
  assert.ok(text.includes('[CRIT] Falha simulada'));
  assert.ok(text.includes('FIM DO DIAGNÓSTICO'));
});
