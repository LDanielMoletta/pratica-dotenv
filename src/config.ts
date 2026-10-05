// src/config.ts — MÓDULO DE CONFIGURAÇÃO (único lugar que lê process.env)
//
// Ordem obrigatória dentro deste arquivo:
//   1º  carregar o ambiente   (dotenv)  — antes de QUALQUER leitura
//   1b interpolar variáveis  (dotenv-expand) — para valores derivados
//   2º  validar e converter   (Joi)     — na borda do sistema
//   3º  exportar objeto CONGELADO e tipado — para o resto do projeto
//
// Exercício 7: a chave de API vem daqui (validada na subida) e nunca é impressa.
// Exercício 8: conversão única, tipos sem `undefined`, objeto congelado e
//              agrupado por área (db / api / log), com o tipo exportado.
// Exercício 10: LOG_PATH passa por dotenv-expand e é ancorado dentro da raiz.
import path from 'node:path';
import dotenv from 'dotenv';
// dotenv-expand 1000 expõe SOMENTE { expand } — não existe export default,
// então `import dotenvExpand from 'dotenv-expand'` (snippet antigo) quebra.
import { expand } from 'dotenv-expand';
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
const RAIZ = path.resolve(__dirname, '..');

// quiet: true silencia o banner promocional que o dotenv 17 imprime por padrão.
// O caminho é ancorado no próprio arquivo (funciona de qualquer diretório).
const { parsed } = dotenv.config({ path: path.join(RAIZ, arquivo), quiet: true });

// ---------------------------------------------------------------------------
// 1b passo: interpolar valores derivados (exercício 10)
//
// O dotenv-expand expande a partir do que está em `process.env`, então
// garantimos NODE_ENV antes: sem isso, LOG_PATH=./logs/${NODE_ENV}.log
// interpolaria para "./logs/.log" (silenciosamente).
if (process.env.NODE_ENV === undefined || process.env.NODE_ENV === '') {
  process.env.NODE_ENV = ambiente;
}
expand({ parsed });

// O caminho interpolado é ancorado na raiz do projeto: caminho absoluto ou
// com ".." que saia da raiz é REJEITADO na subida (impede path traversal).
// Ausência de LOG_PATH cai num padrão SEGURO (dentro do projeto), não num erro.
const logInformado = String(process.env.LOG_PATH ?? '').trim();
const caminhoLogBruto = (logInformado === '' ? `./logs/\${NODE_ENV}.log` : logInformado)
  .replace(/\$\{NODE_ENV\}/g, ambiente)
  .trim();

if (caminhoLogBruto.includes('${')) {
  throw new Error(
    `configuração inválida na subida:\n - "LOG_PATH" tem referência não resolvida: ${caminhoLogBruto}`,
  );
}

const caminhoLog = path.isAbsolute(caminhoLogBruto)
  ? caminhoLogBruto
  : path.resolve(RAIZ, caminhoLogBruto);
const relativo = path.relative(RAIZ, caminhoLog);

if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
  throw new Error(
    `configuração inválida na subida:\n - "LOG_PATH" precisa ficar dentro do projeto (raiz: ${RAIZ})`,
  );
}
if (path.extname(caminhoLog).toLowerCase() !== '.log') {
  throw new Error(
    `configuração inválida na subida:\n - "LOG_PATH" precisa terminar em .log`,
  );
}
const dirLog = path.dirname(caminhoLog);

// ---------------------------------------------------------------------------
// 2º passo: validar e converter na borda
// ---------------------------------------------------------------------------
type Valores = {
  DB_HOST: string;
  API_KEY: string;
  PORT: number;
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
  // LOG_LEVEL (exercício 10): nível do log por ambiente.
  LOG_LEVEL: Joi.string()
    .empty('')
    .valid('debug', 'info', 'warn', 'error')
    .default(ambiente === 'development' ? 'debug' : 'info'),
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
  /** Raia do projeto — usada para ancorar caminhos (exercício 10). */
  root: RAIZ,
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
    /** Caminho ABSOLUTO do log, interpolado e ancorado dentro da raiz. */
    path: caminhoLog,
    /** Diretório do log (criado pelo logger se não existir). */
    dir: dirLog,
    /** Nível mínimo do log: 'debug' | 'info' | 'warn' | 'error'. */
    level: valor.LOG_LEVEL,
    /** Formato por ambiente: 'text' em dev, 'json' em produção. */
    format: ambiente === 'development' ? 'text' : 'json',
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
    log: {
      caminho: path.relative(RAIZ, config.log.path),
      nivel: config.log.level,
      formato: config.log.format,
    },
  }),
);