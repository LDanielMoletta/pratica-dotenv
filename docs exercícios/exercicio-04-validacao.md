# Exercício 4 - Validando variáveis obrigatórias na subida

## Objetivo
Garantir que a aplicação **não suba** com configuração inválida: variáveis
obrigatórias ausentes/vazias viram **erro na inicialização**, com **todas as faltas
listadas de uma vez**, e o resto do código usa **um objeto validado e convertido**
(nunca mais `process.env`).

---

## Código original (com o problema intencional)
`temp/exercicio-04-original.ts`:
```typescript
const schema = Joi.object({
  DB_HOST: Joi.string(),
  API_KEY: Joi.string(),   // sem .required()
  PORT: Joi.number(),
});

export function validate() {
  const result = schema.validate(process.env);
  if (result.error) {
    console.warn('configuração incompleta');   // só avisa...
  }
  return process.env;                            // ...e retorna process.env CRU
}
```

---

## Registro da investigação

**Sintoma (antes da correção):** rodando **sem** `API_KEY` a aplicação subia normal:
```
aplicação SUBIU normalmente (só warn), sem API_KEY
valor retornado é process.env cru: PORT= 3000 string
integration.apiKey = process.env.API_KEY -> undefined | tipo: undefined
EXIT=0
```
Problemas: (1) campos sem `.required()`; (2) erro só em `console.warn`; (3) retorna
`process.env` sem conversão; (4) cada módulo (`integration`) relia `process.env`
por conta própria.

**Hipótese:** validação que não interrompe a subida e devolve o objeto cru não
impede a aplicação de rodar quebrada; a leitura espalhada impede convergir para um
ponto único.

---

## Correção aplicada (`src/config.ts` — abordagem Joi)

```typescript
const schema = Joi.object<Valores>({
  DB_HOST: Joi.string().required().min(1),
  API_KEY: Joi.string().required().min(1),
  PORT:    Joi.number().empty('').integer().min(0).max(65535).default(3000),
}).unknown(true);   // variáveis do sistema (NODE_ENV, PATH, ...) não derrubam

const { value, error } = schema.validate(process.env, { abortEarly: false });
if (error) {
  const faltas = error.details.map((d) => d.message);
  throw new Error(`configuração inválida na subida:\n - ${faltas.join('\n - ')}`);
}

export const config = { env: ambiente, arquivo, port: value.PORT, dbHost: value.DB_HOST, apiKey: value.API_KEY };
```

Decisões:
- `required().min(1)` → ausente **e** vazio são erro (segredo não tem default).
- `abortEarly: false` → **todas** as faltas no mesmo erro.
- `.unknown(true)` → variáveis extras do sistema não quebram a validação.
- `PORT` converte para **number**, com faixa válida e padrão `3000`.
- restante do código importa `config` (ex.: `src/integration.ts` usa `config.apiKey`).

---

## Verificação (cenários reais capturados)

Mutando o `.env.dev` local (backup em `temp/env-dev.bak`) e rodando `npm run print:config:dev`:

| Cenário | Saída | Exit |
|---------|-------|------|
| API_KEY ausente | `configuração inválida na subida: - "API_KEY" is required` | 1 |
| DB_HOST **e** API_KEY ausentes | `- "DB_HOST" is required` + `- "API_KEY" is required` (mesmo erro) | 1 |
| API_KEY vazia (`API_KEY=`) | `- "API_KEY" is not allowed to be empty` | 1 |
| `PORT=abc` | `- "PORT" must be a number` | 1 |
| `PORT=70000` | `- "PORT" must be less than or equal to 65535` | 1 |
| Tudo presente | `[config] {"env":"development","arquivo":".env.dev","banco":"db.desenvolvimento.local","porta":3000}` | 0 |
| Tipo convertido | `typeof config.port = number` | — |
| Consumo único | `integration usa config.apiKey (validado), não process.env: string` | — |

---

## Comparativo: env-schema (JSON Schema / Ajv) — `src/config-schema.ts`
O enunciado pede "refazer o exercício com `env-schema` e comparar as abordagens".
Atenção: **env-schema v6 valida com JSON Schema (Ajv)**, não com Joi.

```typescript
const schema = {
  type: 'object',
  additionalProperties: true,
  required: ['DB_HOST', 'API_KEY'],
  properties: {
    DB_HOST: { type: 'string', minLength: 1 },
    API_KEY: { type: 'string', minLength: 1 },
    PORT:    { type: 'number', minimum: 0, maximum: 65535, default: 3000 },
  },
} as const;

const valores = envSchema({ schema, env: true });
```

Comportamento observado lendo `node_modules/env-schema/index.js`:
- `allErrors: true` → lista todas as faltas (igual ao `abortEarly: false`);
- `coerceTypes: true` → converte `"3000"` para `number`;
- `useDefaults: true` → aplica `default: 3000`;
- **força** `schema.additionalProperties = false` e usa `removeAdditional: true` →
  variáveis extras do sistema são **removidas** do resultado (≠ `.unknown(true)` do
  Joi, que apenas as ignora sem remover).

Mesmo cenário de duas faltas:
```
Error: env must have required property 'DB_HOST', env must have required property 'API_KEY'
```

**Atrito de tipos:** em `env-schema@6.1.0` o parâmetro `schema` aceita
`JSONSchemaType<T> | AnySchema` (o `AnySchema` vem de `ajv/dist/core`) — **não**
aceita o tipo do Joi. Por isso, usar JSON Schema é o caminho natural (e foi o
escolhido); usar um schema Joi exigiria um *cast* para contornar a tipagem da
biblioteca.

Resumo comparativo:

| Aspecto | Joi (`config.ts`) | env-schema (`config-schema.ts`) |
|---------|-------------------|----------------------------------|
| Linguagem de schema | API fluente Joi | JSON Schema (Ajv) |
| Lista todas as faltas | `abortEarly: false` | `allErrors: true` (padrão) |
| Conversão de tipo | sim | sim (`coerceTypes`) |
| Default | `.default(3000)` | `default: 3000` |
| Extras do sistema | `.unknown(true)` (ignora) | removidos (`removeAdditional`) |
| Tipagem TS | nativa | exige JSON Schema (tipos Ajv) |

---

## Aprendizados
- Validação que só avisa **não** protege: ausência de segredo deve **derrubar a subida**.
- Retornar `process.env` cru anula a validação (sem conversão de tipos).
- `abortEarly: false` / `allErrors` dão **todas** as faltas de uma vez (bom DX).
- Um único módulo de configuração evita leitura espalhada de `process.env`.
- `env-schema` é baseado em JSON Schema/Ajv; o `.unknown` do Joi equivale a
  `removeAdditional` (que apaga os extras em vez de ignorá-los).
- Mensagens de erro citam **nomes** de variáveis, nunca seus **valores**.
