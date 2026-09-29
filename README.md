# Prática de dotenv - Node.js + TypeScript

Lista de exercícios sobre **configuração de ambiente**: carregar variáveis com
`dotenv`, separar ambientes (dev/prod), proteger segredos no Git, validar variáveis
obrigatórias na subida e tratar a porta do servidor (incluindo duas instâncias).

Cada exercício segue o fluxo **reproduzir → hipótese → evidência → correção →
verificação**, com as reproduções guardadas em `temp/` (ignorada pelo Git) e o
registro completo em `docs exercícios/`.

---

## Estrutura do Projeto

```
pratica-dotenv/
├── .vscode/
│   ├── launch.json               # Debugger (ts-node) + configurações de teste
│   ├── settings.json
│   └── extensions.json
├── docs exercícios/               # Documentação de cada exercício
│   ├── exercicio-01-usando-dotenv.md
│   ├── exercicio-02-ambientes.md
│   ├── exercicio-03-seguranca-git.md
│   ├── exercicio-04-validacao.md
│   └── exercicio-05-porta-instancia.md
├── src/
│   ├── config.ts                 # Único módulo que lê process.env (dotenv + NODE_ENV + Joi)
│   ├── config-schema.ts          # Mesma validação com env-schema (JSON Schema/Ajv)
│   ├── app.ts                    # createApp() + rota /health
│   ├── server.ts                 # listen, porta real (server.address), EADDRINUSE
│   ├── database.ts               # consome config.dbHost
│   ├── integration.ts            # consome config.apiKey
│   ├── index.ts                  # demonstração do exercício 1
│   └── teste-exercicio-05.ts     # harness do exercício 5 (12 verificações)
├── temp/                          # Reproduções (ignorada pelo Git)
├── .env.example                  # Exemplo versionado (SÓ placeholders)
├── .env.dev / .env.prod          # Valores locais (IGNORADOS pelo Git)
├── eslint.config.js
├── nodemon.json
├── package.json
└── tsconfig.json
```

---

## Exercícios

### 1. Carregando variáveis de ambiente com dotenv
Dois bugs somados: (a) `import` de um módulo que lia `process.env` **antes** do
`dotenv.config()` → `undefined`; (b) `process.env.PORT + 1` = `'30001'` (string).
Além do **dump de `process.env`** vazando a senha.
**Correções:** config carregado o mais cedo possível (módulo único), conversão de
tipo, impressão seletiva. Provou-se também a **precedência** do ambiente sobre o
arquivo.
**Descoberta:** o sintoma de "aspas no meio do valor" **não reproduz** no dotenv 17
(nem em 16/13/12/11/8/6/4) — aspas e espaços já são normalizados; registrado com
sonda (`temp/probe16`).

### 2. Separando ambientes (development/production)
O `if (env = 'production')` (atribuição `=` no lugar de `===`) fazia **todo ambiente**
virar produção; o caminho relativo ainda dependia da pasta atual.
**Correções:** `===`, **mapa explícito** `.env.dev`/`.env.prod`, `path.resolve(__dirname, ...)`,
`NODE_ENV` inválida vira erro e `cross-env` para o Windows.
**5 cenários:** dev, prod, sem NODE_ENV, NODE_ENV inválida e execução de outra pasta.

### 3. Segurança no Git
`.env` estava **versionado** (`.gitignore` não desrastreia arquivo já commitado) e a
máscara `.env*` também ignorava o `.env.example`.
**Correções:** `.env` + `.env.*` + `!.env.example`, `git rm --cached .env`,
`.env.example` só com placeholders.
**Achados:** `git check-ignore` não reporta arquivos rastreados sem `--no-index`; a
chave que já esteve no histórico (`git log -S`) **precisa ser rotacionada**.

### 4. Validando variáveis obrigatórias
O schema sem `.required()`, com `console.warn`, retornando `process.env` cru → a
aplicação **subia sem `API_KEY`**.
**Correções:** Joi com `required().min(1)`, `abortEarly: false` (todas as faltas),
`.unknown(true)`, conversão de `PORT`, erro que **derruba a subida**, e um único
`config` para todo o código.
**8 cenários** (ausente, duas faltas, vazia, `abc`, fora da faixa, ok, tipo,
consumo único) + **comparativo com env-schema** (JSON Schema/Ajv: `allErrors`,
`coerceTypes`, `removeAdditional`).

### 5. Porta, porta real e duas instâncias
`process.env.PORT || 3000`: `''` caía no default **silenciosamente** e `abc`
virava **named pipe** no Windows ("subia" sem atender TCP); sem tratamento de
`EADDRINUSE` a segunda instância falhava de forma ilegível.
**Correções:** porta validada/convertida (Joi), mensagem com a **porta real**
(`server.address()`), `server.on('error')` → mensagem legível + `process.exit(1)`,
e sucesso adiado para não anunciar "no ar" quando o Windows emite `listening`+`error`.
**Teste (`npm run test:ex5`): 12/12 verificações OK.**

---

## Como Executar

```bash
# Instalar dependências
npm install

# Exercício 1 - demonstração de tipos/ordem
node -r ts-node/register src/index.ts

# Exercícios 2 e 5 - qual arquivo/porta está sendo usado (sem subir servidor)
npm run print:config:dev
npm run print:config:prod

# Exercícios 2 e 5 - subir o servidor
npm run start:dev
npm run start:prod

# Exercício 4 - comparativo Joi vs env-schema
node -r ts-node/register src/config-schema.ts

# Exercício 5 - harness (12 verificações)
npm run test:ex5

# Qualidade
npx tsc --noEmit
npm run lint
```

> **Windows:** os scripts usam `cross-env` (definir `NODE_ENV=x comando` direto no
> PowerShell não funciona). Para reproduções em `temp/`, use
> `TS_NODE_TRANSPILE_ONLY=true` quando o ts-node estrito reclamar de tipos.

---

## Validações

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | ✅ Sem erros |
| `npm run lint` | ✅ Sem warnings |
| Cenários Ex 1 (ordem, tipo, vazamento, precedência) | ✅ |
| Cenários Ex 2 (dev, prod, sem NODE_ENV, inválida, outra pasta) | ✅ |
| Cenários Ex 3 (check-ignore, ls-files, histórico) | ✅ |
| Cenários Ex 4 (8) + comparativo env-schema | ✅ |
| `npm run test:ex5` | ✅ 12/12 |

---

## Regras seguidas na entrega (da lista de exercícios)
- Nenhum `.env` real versionado (só `.env.example` com placeholders)
- Nenhum segredo impresso em log (nada de `console.log(process.env)`)
- Sem valor padrão para segredos (`API_KEY` ausente = erro na subida)
- Somente o módulo de configuração lê `process.env`; o resto usa `config`
- A aplicação **não sobe** com configuração inválida
- Validação de tipo e faixa de `PORT` (converte para `number`)
- Registro de cada exercício (sintoma, hipótese, evidência, correção) em `docs exercícios/`
- Reproduções isoladas em `temp/` (ignorada pelo Git)
- Ações sensíveis documentadas (rotação da chave que esteve no histórico)
