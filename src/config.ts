// src/config.ts
// Único módulo do projeto que lê process.env (regra da lista).
// Exercício 2: NODE_ENV escolhe o arquivo de ambiente (.env.dev / .env.prod),
// com caminho ancorado em um ponto fixo do projeto (não no diretório de
// execução) e comportamento definido quando NODE_ENV está ausente.
import path from 'node:path';
import dotenv from 'dotenv';

const AMBIENTES = ['development', 'production'] as const;
type Ambiente = (typeof AMBIENTES)[number];

// nome dos arquivos por ambiente (exercício 2: .env.dev por desenvolvimento,
// .env.prod por produção — valores distintos de DB_HOST)
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

// Carregado UMA vez, antes de qualquer leitura. O caminho é ancorado em
// __dirname (src/), então o arquivo é encontrado mesmo se o comando for
// disparado de outra pasta.
dotenv.config({
  path: path.resolve(__dirname, '..', arquivo),
});

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`variável de ambiente obrigatória ausente ou vazia: ${name}`);
  }
  return value;
}

const rawPort = process.env.PORT;
const port = rawPort === undefined || rawPort === '' ? 3000 : Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`PORT inválida: "${String(rawPort)}" não é um número de porta válido`);
}

export const config = {
  env: ambiente,
  arquivo,
  port,
  dbHost: required('DB_HOST'),
};

// Impressão SEGURA e seletiva: prova QUAL arquivo foi carregado (exercício 2)
// sem imprimir senha nem chave.
console.log('[config]', JSON.stringify({ env: config.env, arquivo: config.arquivo, banco: config.dbHost, porta: config.port }));