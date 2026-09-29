// src/config.ts
// Único módulo do projeto que lê process.env (regra da lista).
// Exercício 2: NODE_ENV escolhe o arquivo de ambiente (.env.dev / .env.prod).
// Exercício 4: Joi valida as variáveis OBRIGATÓRIAS e interrompe a subida com
// todas as faltas listadas; o resto do código usa o objeto validado e
// convertido, nunca process.env de novo.
import path from 'node:path';
import dotenv from 'dotenv';
import Joi from 'joi';

const AMBIENTES = ['development', 'production'] as const;
type Ambiente = (typeof AMBIENTES)[number];

const ARQUIVOS: Record<Ambiente, string> = {
  development: '.env.dev',
  production: '.env.prod',
};

function definirAmbiente(): Ambiente {
  const raw = process.env.NODE_ENV;
  if (raw === undefined || raw === '') {
    // Padrão definido e documentado: sem NODE_ENV = desenvolvimento.
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

type Valores = {
  DB_HOST: string;
  API_KEY: string;
  PORT: number;
};

const schema = Joi.object<Valores>({
  // obrigatórias: a AUSÊNCIA é erro de subida ('vazio' também não vale);
  // mensagens não contêm o VALOR da variável, só o nome.
  DB_HOST: Joi.string().required().min(1),
  API_KEY: Joi.string().required().min(1),
  // texto vazio é tratado como não definido (vira o padrão 3000);
  // texto não numérico é erro de validação; faixa válida 0..65535.
  PORT: Joi.number().empty('').integer().min(0).max(65535).default(3000),
  // .unknown(true): variáveis extras do sistema (NODE_ENV, PATH, ...) não
  // podem derrubar a validação.
}).unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  const faltas = error.details.map((d) => d.message);
  throw new Error(`configuração inválida na subida:\n - ${faltas.join('\n - ')}`);
}

export const config = {
  env: ambiente,
  arquivo,
  port: value.PORT,
  dbHost: value.DB_HOST,
  apiKey: value.API_KEY,
};

// Impressão SEGURA e seletiva: prova qual arquivo foi carregado sem expor
// senha nem chave.
console.log('[config]', JSON.stringify({ env: config.env, arquivo: config.arquivo, banco: config.dbHost, porta: config.port }));