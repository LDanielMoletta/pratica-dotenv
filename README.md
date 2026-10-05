# Prática de dotenv - Node.js + TypeScript

Lista de exercícios sobre **configuração de ambiente**: carregar variáveis com
`dotenv`, separar ambientes (dev/prod), proteger segredos no Git, validar variáveis
obrigatórias na subida, tratar a porta do servidor (incluindo duas instâncias),
manter chaves de API fora de URLs/logs, centralizar a configuração num módulo
congelado e garantir que a configuração compartilhada funcione para o time.

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
│   ├── exercicio-05-porta-instancia.md
│   ├── exercicio-07-chaves-api.md
│   ├── exercicio-08-estrutura-projeto.md
│   └── exercicio-09-equipe.md
├── scripts/
│   └── check-env.ts               # Hook predev: contrato de ambiente do time (ex09)
├── src/
│   ├── config.ts                 # Único módulo que lê process.env (dotenv + NODE_ENV + Joi + freeze)
│   ├── config-schema.ts          # Mesma validação com env-schema (JSON Schema/Ajv)
│   ├── app.ts                    # createApp() + rota /health
│   ├── server.ts                 # listen, porta real (server.address), EADDRINUSE
│   ├── database.ts               # consome config.db.host
│   ├── integration.ts            # consome config.api.key
│   ├── weather.ts                # cliente da API externa: Authorization + máscara (ex07)
│   ├── index.ts                  # demonstração do exercício 1
│   ├── teste-exercicio-05.ts     # harness do exercício 5 (12 verificações)
│   └── teste-exercicio-08.ts     # harness do exercício 8 (6 verificações)
├── temp/                          # Reproduções (ignorada pelo Git)
├── .env.example                  # Contrato de ambiente do time (SÓ placeholders)
├── .env.dev / .env.prod          # Valores locais (IGNORADOS pelo Git)
├── eslint.config.js
├── nodemon.json
├── package.json
├── tsconfig.json
└── tsconfig.scripts.json         # type-check de scripts/ + src/
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

### 7. Chaves de API
A chave vinha de um **valor padrão no código**, ia na **query string** e aparecia
inteira no log do provedor e na mensagem de erro (`401 ... key sk_live_...`).
**Correções:** sem default (falha na subida), `Authorization: Bearer`, `mask()`
com os últimos 4 caracteres, e erro com status + corpo **sem credencial**.
**Cenários:** A/B no código original, C/D corrigidos, E sem `API_KEY` (erro).

### 8. Estrutura de projeto com um módulo de configuração
`config` era montado **no momento do import** (antes do `dotenv.config()`), a porta
chegava como **texto** e qualquer módulo podia **mutar** o objeto compartilhado.
**Correções:** `dotenv` → validação/conversão (Joi) → `Object.freeze` (inclusive
nos subobjetos `db`/`api`/`log`) → `export type Config`, com campos agrupados por
área e documentados; consumidores migrados para `config.db.host` / `config.api.key`.
**Teste (`npm run test:ex8`): 6/6** — tipos sem `undefined`, mutação bloqueada
(`TypeError`) e *busca* por `process.env` só no módulo de configuração.

### 9. Configuração compartilhada (time)
Um colega novo com o `.env` fora de sincronia foi "solucionado" com
`git rm .env` — apagando o arquivo local de todo mundo.
**Correções:** `.env.example` como contrato do time (com marcador `# opcional`),
`scripts/check-env.ts` (variáveis faltando, valor real no exemplo, `.env*`
versionado), hook **`predev`** que bloqueia `npm run dev`, e o procedimento de
onboarding (`cp .env.example .env.dev` → preencher → `npm run check:env`).
**6 cenários** reproduzidos num sandbox Git (clone limpo, cópia preenchida,
`git add -f`, chave faltando, segredo no exemplo, conflito de merge).

---

## Como Executar

```bash
# Instalar dependências
npm install

# Onboarding do time (o hook predev roda isso antes do dev)
npm run check:env                          # exige .env.dev completo e exemplo limpo
npm run check:env -- --ambiente=producao  # exige .env.prod

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

# Exercício 7 - cliente da API com credencial mascarada
npm run start:dev                          # sobe o servidor em http://localhost:3000
curl http://localhost:3000/weather?cidade=Sao-Paulo
#   (o log mostra "credencial: ****0000"; a chave nunca aparece na URL)

# Exercício 8 - harness (6 verificações)
npm run test:ex8

# Qualidade
npm run typecheck                          # tsc de src/ e de scripts/
npm run lint
```

> **Windows:** os scripts usam `cross-env` (definir `NODE_ENV=x comando` direto no
> PowerShell não funciona). Para reproduções em `temp/`, use
> `TS_NODE_TRANSPILE_ONLY=true` quando o ts-node estrito reclamar de tipos.

---

## Validações

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ Sem erros (src/ + scripts/) |
| `npm run lint` | ✅ Sem warnings |
| Cenários Ex 1 (ordem, tipo, vazamento, precedência) | ✅ |
| Cenários Ex 2 (dev, prod, sem NODE_ENV, inválida, outra pasta) | ✅ |
| Cenários Ex 3 (check-ignore, ls-files, histórico) | ✅ |
| Cenários Ex 4 (8) + comparativo env-schema | ✅ |
| `npm run test:ex5` | ✅ 12/12 |
| Cenários Ex 7 (A–E: default, URL, log, 401, sem chave) | ✅ |
| `npm run test:ex8` | ✅ 6/6 |
| Cenários Ex 9 (6 no sandbox Git + hook `predev`) | ✅ |

---

## Regras seguidas na entrega (da lista de exercícios)
- Nenhum `.env` real versionado (só `.env.example` com placeholders)
- Nenhum segredo impresso em log (nada de `console.log(process.env)`)
- Nenhum segredo na URL, na exceção ou na resposta da API
- Sem valor padrão para segredos (`API_KEY` ausente = erro na subida)
- Somente o módulo de configuração lê `process.env`; o resto usa `config`
- A configuração é **congelada** (`Object.freeze`) e tem **tipo exportado**
- A aplicação **não sobe** com configuração inválida
- Validação de tipo e faixa de `PORT` (converte para `number`)
- Contrato de ambiente versionado (`.env.example`) e verificado por hook `predev`
- Registro de cada exercício (sintoma, hipótese, evidência, correção) em `docs exercícios/`
- Reproduções isoladas em `temp/` (ignorada pelo Git)
- Ações sensíveis documentadas (rotação da chave que esteve no histórico)
