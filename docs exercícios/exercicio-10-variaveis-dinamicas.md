# Exercício 10 - Variáveis dinâmicas com dotenv-expand

## Objetivo
Valores derivados do próprio ambiente, com um **log por ambiente**:
`LOG_PATH` interpolando `${NODE_ENV}`, `LOG_LEVEL`/`format` diferentes em
development e production, diretório criado automaticamente e **nenhum caminho
capaz de escapar do projeto**.

---

## Registro da investigação (`temp/exercicio-10/`)

### Problema 1 — o snippet da lista quebra na versão instalada
`temp/exercicio-10/sonda-api.js`:
```
exports: [ 'expand' ]
tipo de expand: function
tipo de default: undefined
```
`dotenv-expand` **1000.0.0** expõe **somente** `expand` (named export). O
`import dotenvExpand from 'dotenv-expand'` do enunciado retorna `undefined` e
quebra em runtime (`dotenvExpand.expand is not a function`). Correção:
```typescript
import { expand } from 'dotenv-expand';
```

### Problema 2 — sem `NODE_ENV` no ambiente, a interpolação esvazia
`temp/exercicio-10/expand-bug.js`:
```
[1] apos dotenv.config, SEM expand  -> process.env.LOG_PATH = "./logs/${NODE_ENV}.log"
[1] apos expand({parsed})            -> process.env.LOG_PATH = "./logs/development.log"
[2] NODE_ENV ausente, apos expand   -> process.env.LOG_PATH = "./logs/.log"
```
O `dotenv-expand` interpola a partir do que está em **`process.env`** (não do
`parsed`): se `NODE_ENV` não existir ali, `${NODE_ENV}` vira **string vazia** e o
arquivo perde o nome do ambiente (`./logs/.log`) — **sem erro nenhum**.
Correção: garantir `process.env.NODE_ENV` antes de expandir.

### Problema 3 — o caminho interpolado escapa da raiz do projeto
`temp/exercicio-10/escape-bug.js` (com `LOG_PATH=../../fora-do-projeto/${NODE_ENV}.log`):
```
[escape] LOG_PATH interpolado : "../../fora-do-projeto/development.log"
[escape] resolvido            : C:\...\tech-skills\fora-do-projeto\development.log
[escape] esta DENTRO da raiz?  : false
[escape] arquivo criado       : true -> C:\...\tech-skills\fora-do-projeto
```
O arquivo foi criado **fora do projeto** (na pasta acima). Correção: ancorar o
caminho na raiz e rejeitar qualquer coisa que saia dela.

### Problema 4 — herança silenciosa entre processos (armadilha do exercício 1)
Ao rodar o harness, o filho com `NODE_ENV=production` reportava
`logs\development.log` com nível `debug` e formato `json`. Causa: o módulo de
configuração do **pai** escreve `LOG_PATH`/`LOG_LEVEL` expandidos em
`process.env`, e o `dotenv` **não sobrescreve** variável já existente — o filho
herdava o valor do pai. Cada cenário do harness agora roda com o ambiente
**sem** as chaves dos arquivos.

---

## Correção aplicada

### `src/config.ts`
```typescript
const { parsed } = dotenv.config({ path: path.join(RAIZ, arquivo), quiet: true });

// 1b) garantir NODE_ENV antes de interpolar
if (process.env.NODE_ENV === undefined || process.env.NODE_ENV === '') {
  process.env.NODE_ENV = ambiente;
}
expand({ parsed });

// ancorar + validar o caminho interpolado
const logInformado = String(process.env.LOG_PATH ?? '').trim();
const caminhoLogBruto = (logInformado === '' ? `./logs/\${NODE_ENV}.log` : logInformado)
  .replace(/\$\{NODE_ENV\}/g, ambiente)
  .trim();
if (caminhoLogBruto.includes('${')) throw ...;                    // referência não resolvida
const caminhoLog = path.isAbsolute(caminhoLogBruto)
  ? caminhoLogBruto : path.resolve(RAIZ, caminhoLogBruto);
const relativo = path.relative(RAIZ, caminhoLog);
if (relativo.startsWith('..') || path.isAbsolute(relativo)) throw ...;  // path traversal
if (path.extname(caminhoLog).toLowerCase() !== '.log') throw ...;
```
E o bloco exportado passou a expor:
```typescript
log: Object.freeze({
  path: caminhoLog,     // absoluto, dentro da raiz
  dir: dirLog,          // criado pelo logger
  level: valor.LOG_LEVEL,
  format: ambiente === 'development' ? 'text' : 'json',
}),
root: RAIZ,
```

### `src/logger.ts` (novo)
- não lê `process.env`: consome `config`;
- `prepararLog()` confere que o arquivo continua dentro de `config.root` e cria o
  diretório com `mkdirSync(..., { recursive: true })`;
- `deveGravar(nivel)` filtra pelo nível do ambiente (`debug` < `info` < …);
- `escreverLog()` grava **texto** em dev e **JSON** em produção;
- integrado em `server.ts` (subida e erro) e em `app.ts` (rota `/weather`).

### Arquivos de ambiente
```dotenv
# .env.dev                        # .env.prod
LOG_PATH=./logs/${NODE_ENV}.log   LOG_PATH=./logs/${NODE_ENV}.log
LOG_LEVEL=debug                   LOG_LEVEL=info
```
O `.env.example` documenta a interpolação e a regra de rejeição de `..`.

---

## Verificação (`npm run test:ex10`)

```
== 1) Interpolação por ambiente ==
  [OK] 1.1 LOG_PATH interpolado e ancorado: logs\development.log
  [OK] 1.2 nível/formato de development: nivel=debug formato=text
== 2) Ambiente de produção ==
  [OK] 2.1 arquivo separado por ambiente: logs\production.log
  [OK] 2.2 nível/formato de produção: nivel=info formato=json
== 3) Sem NODE_ENV ==
  [OK] 3.1 assume development e interpola o nome: env=development arquivo=logs\development.log
== 4) Diretório de logs ausente é criado ==
  [OK] 4.1 mkdir criou o diretório: ...\pratica-dotenv\logs
  [OK] 4.2 arquivo de log existe e tem conteúdo: logs\development.log (113 bytes)
== 5) Filtro de nível e formato por ambiente ==
  [OK] 5.1 development aceita debug: debugAceito=true escreveu=true
  [OK] 5.2 formato texto em development: [2026-10-05T21:50:47.588Z] DEBUG mensagem de teste do harness
  [OK] 5.3 produção descarta debug: debugAceito=false escreveu=false
  [OK] 5.4 formato JSON em produção: {"ts":"2026-10-05T21:50:47.888Z","nivel":"info","msg":"subida do servidor"}
== 6) Caminho fora da raiz é rejeitado (path traversal) ==
  [OK] 6.1 subida falha citando LOG_PATH: status=1 - "LOG_PATH" precisa ficar dentro do projeto
  [OK] 6.2 nada foi criado fora da raiz: ...\fora-exercicio-10.log
  [OK] 6.3 extensão diferente de .log é rejeitada: status=1
== 7) LOG_PATH vazio cai no padrão seguro ==
  [OK] 7.1 padrão continua dentro do projeto: logs\production.log

RESULTADO: 15/15 verificações OK
```

**Fim a fim com o servidor real** (mock do ex7 em `localhost:4010`):
```
GET /weather?cidade=Sao-Paulo -> HTTP=200
corpo: {"clima":{"cidade":"Sao-Paulo","temperatura":21,"unidade":"C"},"log":"logs\\development.log"}
vaza credencial no corpo? False
[weather] GET http://localhost:4010/v1/weather | cidade: Sao-Paulo | credencial: ****0000
logs/development.log: [...] INFO consulta de clima: Sao-Paulo
```
E com a chave errada: `502` com a mensagem mascarada
(`falha na API: 401 (credencial ****0000 rejeitada)`), sem o segredo.

**Regressão:** `test:ex5` 12/12, `test:ex8` 6/6, `check:env` OK.

---

## Perguntas orientadoras (respostas)

**Qual a diferença entre valor fixo e valor dinâmico?**
Valor fixo é escrito à mão e diverge entre ambientes; valor dinâmico é **derivado**
do contexto (`${NODE_ENV}`) e se ajusta sozinho — uma fonte de verdade, sem
duplicação nem erro de digitação.

**Por que a interpolação é um risco de segurança?**
Porque ela transforma um dado controlado em um **caminho**. Um `../` dentro do
valor interpolado move a escrita para fora do projeto (o próprio log pode virar
instrumento de escrita arbitrária). Por isso a checagem é feita na **configuração**
e repetida no logger.

**Como garantir que um caminho seja seguro?**
Resolver contra uma raiz conhecida e exigir que o resultado **continue dentro**
dela (`path.relative` sem `..`); rejeitar na subida, não no momento da escrita.

**Por que o nível e o formato variam por ambiente?**
Development quer **detalhe** (texto legível, `debug`); produção quer **volume
controlado e parseável** (`info`, JSON para ingestão). É o mesmo dado com
políticas diferentes.

---

## Aprendizados
- `dotenv-expand` 1000 só expõe `expand` — o `import default` do enunciado quebra.
- A interpolação usa **`process.env`** como fonte: sem `NODE_ENV`, `${NODE_ENV}`
  vira vazio **sem erro**.
- Caminho derivado de dado precisa de **ancoragem + validação** (path traversal).
- `dotenv` não sobrescreve variável já existente: valores expandidos no processo
  pai contaminam processos filhos (armadilha do exercício 1 applied à interpolação).
- Falta de `NODE_ENV` é caso **documentado** (default development), não erro.