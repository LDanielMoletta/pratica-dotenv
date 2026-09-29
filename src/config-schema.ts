// src/config-schema.ts
// Exercício 4 (comparativo): a MESMA validação usando env-schema, que valida
// o ambiente com JSON Schema (Ajv) — alternativa ao Joi direto de config.ts.
// Observações de funcionamento (ver node_modules/env-schema/index.js):
//  - allErrors: true  -> lista TODAS as faltas de uma vez;
//  - coerceTypes: true -> converte string para number (PORT);
//  - useDefaults: true -> aplica "default" (PORT -> 3000);
//  - removeAdditional: true + additionalProperties=true no schema -> variáveis
//    extras do sistema são REMOVIDAS do resultado (diferente do .unknown(true)
//    do Joi, que as preserva).
import path from 'node:path';
import dotenv from 'dotenv';
import envSchema from 'env-schema';

const AMBIENTES = ['development', 'production'] as const;
type Ambiente = (typeof AMBIENTES)[number];

const ARQUIVOS: Record<Ambiente, string> = {
  development: '.env.dev',
  production: '.env.prod',
};

function definirAmbiente(): Ambiente {
  const raw = process.env.NODE_ENV;
  if (raw === undefined || raw === '') {
    return 'development';
  }
  for (const a of AMBIENTES) {
    if (a === raw) {
      return a;
    }
  }
  throw new Error(`NODE_ENV inválida: "${raw}" (esperado: development ou production)`);
}

const ambiente = definirAmbiente();
const arquivo = ARQUIVOS[ambiente];
// quiet: true silencia o banner promocional que o dotenv 17 imprime por padrão.
dotenv.config({ path: path.resolve(__dirname, '..', arquivo), quiet: true });

const schema = {
  type: 'object',
  additionalProperties: true,
  required: ['DB_HOST', 'API_KEY'],
  properties: {
    DB_HOST: { type: 'string', minLength: 1 },
    API_KEY: { type: 'string', minLength: 1 },
    PORT: { type: 'number', minimum: 0, maximum: 65535, default: 3000 },
  },
} as const;

// envSchema(..., { env: true }) já inclui process.env; em falta, lança erro e
// impede a subida. O retorno é o objeto validado/convertido (fonte única).
const valores = envSchema({ schema, env: true }) as {
  DB_HOST: string;
  API_KEY: string;
  PORT: number;
};

export const config = {
  env: ambiente,
  arquivo,
  port: valores.PORT,
  dbHost: valores.DB_HOST,
  apiKey: valores.API_KEY,
};

console.log('[config-schema]', JSON.stringify({ env: config.env, arquivo: config.arquivo, banco: config.dbHost, porta: config.port }));