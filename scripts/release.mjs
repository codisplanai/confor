#!/usr/bin/env node
/**
 * Script de Release SemVer para o ConFor.
 *
 * Uso:
 *   node scripts/release.mjs [patch|minor|major]
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 *   npm run release (interativo)
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const runSilent = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

async function main() {
  console.log('\n🚀 Iniciando fluxo de Release SemVer...\n');

  // 1. Verifica se a working tree está limpa
  const status = runSilent('git status --porcelain');
  if (status) {
    console.error('❌ Erro: Existem alterações não commitadas no repositório.');
    console.error('Faça commit ou stash antes de gerar uma nova release.\n');
    process.exit(1);
  }

  // 2. Verifica a branch atual
  const branch = runSilent('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    console.warn(`⚠️  Aviso: Você está na branch '${branch}', não na 'main'.`);
  }

  // 3. Obtém versão atual
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  console.log(`Versão atual: v${pkg.version}`);

  // 4. Determina o tipo de bump
  let type = process.argv[2]?.toLowerCase();
  const valid = ['patch', 'minor', 'major'];

  if (!valid.includes(type)) {
    type = await promptType(pkg.version);
  }

  if (!valid.includes(type)) {
    console.log('Operação cancelada.');
    process.exit(0);
  }

  // 5. Executa testes e build de validação
  console.log('\n🧪 Executando testes automatizados...');
  run('npm test');

  console.log('\n📦 Validando build de produção...');
  run('npm run build');

  // 6. Atualiza versão e cria tag Git (vX.Y.Z)
  console.log(`\n🏷️  Incrementando versão (${type})...`);
  const newTag = runSilent(`npm version ${type} -m "chore(release): %s"`);
  console.log(`✓ Criado commit e tag: ${newTag}`);

  // 7. Envia para o GitHub com tags
  console.log('\n⬆️  Enviando para o repositório remoto...');
  run('git push origin main --follow-tags');

  console.log(`\n🎉 Release ${newTag} publicada com sucesso no GitHub!`);
  console.log(`Acesse: https://github.com/codisplanai/confor/releases\n`);
}

function promptType(current) {
  const [maj, min, pat] = current.split('.').map(Number);
  const nextPatch = `v${maj}.${min}.${pat + 1}`;
  const nextMinor = `v${maj}.${min + 1}.0`;
  const nextMajor = `v${maj + 1}.0.0`;

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nEscolha o tipo de incremento SemVer:');
    console.log(`  1) patch -> ${nextPatch}  (Correções de bugs / melhorias menores)`);
    console.log(`  2) minor -> ${nextMinor}  (Novas funcionalidades retrocompatíveis)`);
    console.log(`  3) major -> ${nextMajor}  (Alterações significativas ou quebras)`);
    rl.question('\nDigite 1, 2, 3 ou patch/minor/major [1]: ', (ans) => {
      rl.close();
      const a = ans.trim();
      if (a === '1' || a === 'patch' || a === '') resolve('patch');
      else if (a === '2' || a === 'minor') resolve('minor');
      else if (a === '3' || a === 'major') resolve('major');
      else resolve(null);
    });
  });
}

main().catch((err) => {
  console.error('\n❌ Erro durante o processo de release:', err.message);
  process.exit(1);
});
