# ConFor — Conciliação Contábil de Fornecedores

Aplicação web estática (100% *client-side*) para conciliação contábil entre o **Balancete Analítico** e o **Conta Corrente de Fornecedores**, desenvolvida para simplificar e automatizar a conferência mensal de compras e saldos em aberto.

## Características

- **Privacidade Total (Zero Backend):** Todo o processamento de leitura dos PDFs e geração da planilha ocorre diretamente no navegador do usuário utilizando [`pdfjs-dist`](https://github.com/mozilla/pdf.js) e [`exceljs`](https://github.com/exceljs/exceljs). Nenhum dado fiscal ou contábil é enviado para servidores externos.
- **Detecção Inteligente:** Identifica automaticamente qual arquivo é o Balancete e qual é o Conta Corrente, independentemente do nome do arquivo ou da ordem de upload.
- **Diagnóstico Contábil Automatizado:** Aplica regras contábeis para categorizar as divergências (ex.: pagamentos no próprio mês, títulos anteriores em aberto, etc.).
- **Geração de Planilha Excel:** Exporta um arquivo `.xlsx` completo e estilizado com 5 abas de conferência detalhada e fórmulas dinâmicas (`SUM`).
- **Tema Claro e Escuro:** Suporte nativo a alternância de temas com preferência de sistema e persistência local.

## Tecnologias

- [Vite](https://vitejs.dev/)
- Vanilla JavaScript & CSS moderno (Design System customizado)
- [PDF.js](https://mozilla.github.io/pdf.js/)
- [ExcelJS](https://github.com/exceljs/exceljs)

## Como executar localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/codisplanai/confor.git
   cd confor
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Para gerar o build de produção:
   ```bash
   npm run build
   ```

## Testes

```bash
npm test
```

## Publicação e Releases Automáticas (SemVer)

O projeto segue estritamente o versionamento semântico **SemVer (`vX.Y.Z`)**:
- **Patch (v1.0.X):** Correções de bugs, pequenas melhorias e ajustes retrocompatíveis.
- **Minor (v1.X.0):** Novas funcionalidades e relatórios retrocompatíveis.
- **Major (vX.0.0):** Grandes alterações estruturais ou mudanças que quebram compatibilidade.

### Opção 1: Pelo GitHub Actions (Recomendado)
1. Vá até a aba **Actions** no GitHub.
2. Selecione o workflow **Release Automática SemVer**.
3. Clique em **Run workflow**, escolha o tipo (`patch`, `minor` ou `major`) e confirme.
4. O workflow executará os testes, criará o commit de versão, a tag `vX.Y.Z` e publicará a [GitHub Release](https://github.com/codisplanai/confor/releases) automaticamente com changelog gerado.

### Opção 2: Pelo Terminal Local
Você também pode disparar releases diretamente pelo terminal:
```bash
# Interativo (pergunta se quer patch, minor ou major)
npm run release

# Ou diretamente pelo tipo desejado:
npm run release:patch
npm run release:minor
npm run release:major
```
O script executa os testes automatizados, valida o build, incrementa a versão no `package.json`, cria a tag Git anotada e envia para o GitHub.
