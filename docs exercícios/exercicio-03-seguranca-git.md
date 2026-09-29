# Exercício 3 - Segurança no Git: nunca versionar o `.env`

## Objetivo
Impedir que segredos entrem no Git, manter um arquivo de exemplo **sem valores
reais** e entender o comportamento do `.gitignore` com arquivos já rastreados.

---

## Código/comando original (com os problemas intencionais)
No commit 1 do projeto, `.env` e `.env.example` foram versionados **com valores**
(de propósito, para reproduzir o problema). O `.gitignore` usava a máscara:

```gitignore
.env*
```

---

## Registro da investigação

**Sintoma 1 — alterar o `.env` aparece como modificação versionada:**
```
$ git status --short
 M .env
```
O `.env` é um arquivo **rastreado**: `.gitignore` **não** afeta arquivos que o Git
já conhece.

**Sintoma 2 — a máscara `.env*` também ignoraria o arquivo de exemplo:**
```
$ git check-ignore -v .env.example
(sem saída, exit 1)
```
Detalhe: `git check-ignore` **não reporta arquivos rastreados** (sem `--no-index`).
Com `--no-index` ele revela o padrão que **seria** aplicado:
```
$ git check-ignore -v --no-index .env .env.dev .env.prod .env.example
.gitignore:6:.env*   .env
.gitignore:6:.env*   .env.dev
.gitignore:6:.env*   .env.prod
.gitignore:6:.env*   .env.example   <- o exemplo TAMBÉM seria ignorado (bug)
```

**Sintoma 3 — segredo no histórico:** a chave `sk_live_...` ficou registrada no
commit 1 e continua no histórico mesmo após remover o arquivo do rastreamento.

---

## Correção aplicada

1. `.gitignore` final (permite explicitamente o exemplo):
```gitignore
node_modules
dist
temp
logs
*.log
.env
.env.*
!.env.example
.vscode/*.local
```

2. Remover do rastreamento **sem apagar o arquivo local**:
```bash
git rm --cached .env
# .env continua no disco, agora ignorado
```

3. `.env.example` reescrito **apenas com placeholders**, sem valores reais:
```dotenv
# Copie para .env.dev e preencha. NUNCA versione o arquivo preenchido.
PORT=3000
DB_HOST=localhost
DB_PASSWORD=
API_KEY=
```

---

## Verificação

```
$ git check-ignore -v --no-index .env .env.dev .env.prod .env.example
.gitignore:6:.env        .env
.gitignore:7:.env.*      .env.dev
.gitignore:7:.env.*      .env.prod
.gitignore:8:!.env.example  .env.example     <- não mais ignorado (exceção)

$ git ls-files
.env.example          <- o único arquivo de ambiente versionado
.gitignore
.vscode/...
eslint.config.js
nodemon.json
package-lock.json
package.json
src/...
tsconfig.json

$ git log -S "sk_live" --oneline
0eaac74 Exercicio 3 - Seguranca no Git ...
69d1221 Exercicio 1 - Variaveis de ambiente com dotenv ...
```

O `git log -S` mostra que o segredo **entrou** no commit `69d1221` e **saiu** no
`0eaac74`, mas continua **no histórico**.

> **Ação obrigatória documentada:** como a chave já esteve versionada, ela deve ser
> **rotacionada/invalidada** (gerar uma nova). Remover o arquivo do rastreamento
> **não** apaga o segredo do histórico.

---

## Aprendizados
- `.gitignore` **não** desrastreia arquivo já commitado — precisa de `git rm --cached`.
- A máscara `.env*` pega tudo (inclusive `.env.example`); use `!.env.example` para
  manter o exemplo.
- `git check-ignore` só olha arquivos não rastreados, a menos que use `--no-index`.
- Segredo que entrou no histórico deve ser **rotacionado**, não apenas removido.
- O `.env.example` serve só como documentação — sempre **sem valores reais**.
