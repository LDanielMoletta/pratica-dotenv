# Exercício 2 - Separando ambientes (development / production)

## Objetivo
Ter arquivos por ambiente (`.env.dev` e `.env.prod`), escolher qual carregar pelo
`NODE_ENV`, ancorar o caminho do arquivo (não depender da pasta de onde se executa)
e funcionar igual no Windows e no Linux.

---

## Código original (com o problema intencional)
`temp/exercicio-02-original-app.ts`:
```typescript
import dotenv from 'dotenv';

dotenv.config();

let env = process.env.NODE_ENV;
if (env = 'production') {                 // BUG: atribuição (=), não comparação (===)
  dotenv.config({ path: '.env.prod' });
} else {
  dotenv.config({ path: '../.env.dev' }); // caminho relativo à pasta atual (frágil)
}
console.log('ambiente:', env, 'banco:', process.env.DB_HOST);
```

---

## Registro da investigação

**Sintoma (antes da correção):** o ambiente é sempre `production`, não importa o
`NODE_ENV`, e o banco é sempre `localhost` (valor do `.env` carregado primeiro):

```
NODE_ENV=development  ->  ambiente: production banco: localhost
NODE_ENV=production   ->  ambiente: production banco: localhost
(sem NODE_ENV)        ->  ambiente: production banco: localhost
```

**Hipótese:**
1. `if (env = 'production')` é uma **atribuição**: define `env = 'production'` e o
   resultado é sempre "verdadeiro" → o ramo de produção sempre roda.
2. Além disso, `dotenv` **não sobrescreve** o que já está em `process.env` (carregado
   pelo primeiro `dotenv.config()`), então `DB_HOST` continua o do `.env`.
3. Caminho relativo (`.env.prod` / `../.env.dev`) depende de onde o comando é rodado.

**Evidência (ao trocar `const` por `let` para reproduzir o sintoma do enunciado):**
com `const env` o processo quebrava no primeiro `NODE_ENV` não-vazio com
`TypeError: Assignment to constant variable` — prova direta do `=` no lugar de `===`.
Com `let`, confirmou-se o "sempre production" acima.

---

## Correção aplicada (`src/config.ts`)

```typescript
const AMBIENTES = ['development', 'production'] as const;
type Ambiente = (typeof AMBIENTES)[number];

const ARQUIVOS: Record<Ambiente, string> = {
  development: '.env.dev',
  production: '.env.prod',
};

function definirAmbiente(): Ambiente {
  const raw = process.env.NODE_ENV;
  if (raw === undefined || raw === '') return 'development'; // padrão explícito
  for (const a of AMBIENTES) if (a === raw) return a;
  throw new Error(`NODE_ENV inválida: "${raw}" (esperado: development ou production)`);
}

const ambiente = definirAmbiente();
const arquivo = ARQUIVOS[ambiente];
// caminho ANCORADO no diretório do arquivo, não na pasta atual
dotenv.config({ path: path.resolve(__dirname, '..', arquivo), quiet: true });
```

Pontos importantes:
- **mapa explícito** `.env.dev`/`.env.prod` (o antigo `.env.${env}` produzia
  `.env.development`, que **não existia** → ambiente carregava vazio).
- `NODE_ENV` inválida = **erro**, não "cai no default" silenciosamente.
- `path.resolve(__dirname, '..', arquivo)` funciona de qualquer pasta.

`package.json` (scripts) usa **cross-env** porque no Windows `NODE_ENV=x comando`
falha com `"O termo 'NODE_ENV=...' não é reconhecido"`:
```jsonc
"start:dev":  "cross-env NODE_ENV=development ts-node src/server.ts",
"start:prod": "cross-env NODE_ENV=production  ts-node src/server.ts",
"print:config:dev":  "cross-env NODE_ENV=development ts-node src/server.ts --print-config",
"print:config:prod": "cross-env NODE_ENV=production  ts-node src/server.ts --print-config"
```

---

## Verificação

| Cenário | Comando | Resultado |
|---------|---------|-----------|
| Dev | `npm run print:config:dev` | `[config] {"env":"development","arquivo":".env.dev","banco":"db.desenvolvimento.local","porta":3000}` |
| Prod | `npm run print:config:prod` | `[config] {"env":"production","arquivo":".env.prod","banco":"db.producao.interno","porta":3000}` |
| Sem NODE_ENV | `npm run print:config` | cai em `development` / `.env.dev` |
| NODE_ENV inválida | `cross-env NODE_ENV=homolog ... --print-config` | erro: `NODE_ENV inválida: "homolog"` |
| De outra pasta | `TS_NODE_PROJECT=<...>/tsconfig.json node -r <absoluto>/ts-node/register <absoluto>/src/server.ts --print-config` | carrega `.env.dev` mesmo assim ✅ |

---

## Aprendizados
- `=` (atribuição) dentro de `if` é um bug silencioso clássico; usar `===`/`!==`.
- Escolher arquivo por ambiente com **mapa explícito** evita nomes que não existem
  (`.env.${env}` → `.env.development`).
- Ancorar caminhos em `__dirname` (`path.resolve`) em vez de depender do `cwd`.
- No Windows, prefixo de variável exige `cross-env`.
- `NODE_ENV` desconhecida deve **falhar**, não adivinhar.
