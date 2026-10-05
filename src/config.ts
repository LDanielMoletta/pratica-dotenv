// src/config.ts — MÓDULO DE CONFIGURAÇÃO (único lugar que lê process.env)
//
// Ordem obrigatória dentro deste arquivo:
//   1º  carregar o ambiente   (dotenv)  — antes de QUALQUER leitura
//   2º  validar e converter   (Joi)     — na borda do sistema
//   3º  exportar objeto CONGELADO e tipado — para o resto do projeto
//
// Exercício 7: a chave de API vem daqui (validada na subida) e nunca é impressa.
// Exercício 8: conversão única, tipos sem `undefined`, objeto congelado e
//              agrupado por área (db / api / log), com o tipo exportado.
import path from 'node:path';
import dotenv from 'dotenv';
import Joi from 'joi';

// ---------------------------------------------------------------------------
// 1º passo: carregar o ambiente
// ---------------------------------------------------------------------------
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
// O caminho é ancorado no próprio arquivo (funciona de qualquer diretório).
dotenv.config({ path: path.resolve(__dirname, '..', arquivo), quiet: true });

// ---------------------------------------------------------------------------
// 2º passo: validar e converter na borda
// ---------------------------------------------------------------------------
type Valores = {
  DB_HOST: string;
  API_KEY: string;
  PORT: number;
  LOG_PATH: string;
  LOG_LEVEL: string;
};

const schema = Joi.object<Valores>({
  // obrigatórias: AUSÊNCIA é erro de subida ('vazio' também não vale);
  // mensagens nunca contêm o VALOR, só o nome da variável.
  DB_HOST: Joi.string().required().min(1),
  API_KEY: Joi.string().required().min(1),
  // PORT: texto vazio é tratado como não definido (vira o padrão 3000);
  // texto não numérico é erro; faixa válida 0..65535; resultado é number.
  PORT: Joi.number().empty('').integer().min(0).max(65535).default(3000),
  // LOG_PATH/LOG_LEVEL (exercício 10): opcional com padrão seguro e validado.
  LOG_PATH: Joi.string().empty('').default('./logs/${NODE_ENV}.log'),
  LOG_LEVEL: Joi.string().empty('').valid('debug', 'info', 'warn', 'error').default('info'),
  // .unknown(true): variáveis extras do sistema (NODE_ENV, PATH, ...) não
  // podem derrubar a validação.
}).unknown(true);

const { value: valor, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  const faltas = error.details.map((d) => d.message);
  throw new Error(`configuração inválida na subida:\n - ${faltas.join('\n - ')}`);
}

// ---------------------------------------------------------------------------
// 3º passo: objeto congelado, agrupado por área, com tipo exportado
// ---------------------------------------------------------------------------
export const config = Object.freeze({
  /** Ambiente carregado ('development' | 'production'). */
  env: ambiente,
  /** Arquivo de ambiente efetivamente lido (para diagnóstico). */
  arquivo,
  /** Porta do servidor: number, já convertida e validada. */
  port: valor.PORT,
  db: Object.freeze({
    /** Host do banco: string obrigatória. */
    host: valor.DB_HOST,
  }),
  api: Object.freeze({
    /** Chave da API: string obrigatória, nunca impressa (use mask()). */
    key: valor.API_KEY,
  }),
  log: Object.freeze({
    /** Caminho do arquivo de log (texto; interpolado no exercício 10). */
    path: valor.LOG_PATH,
    /** Nível de log: 'debug' | 'info' | 'warn' | 'error'. */
    level: valor.LOG_LEVEL,
  }),
});

/** Tipo exportado: quem consome recebe host e port SEM optional. */
export type Config = typeof config;

// Impressão SEGURA e seletiva: prova qual arquivo foi carregado sem expor
// senha nem chave.
console.log(
  '[config]',
  JSON.stringify({
    env: config.env,
    arquivo: config.arquivo,
    banco: config.db.host,
    porta: config.port,
    log: { path: config.log.path, level: config.log.level },
  }),
);