// src/config.ts
// Único módulo do projeto que lê process.env (regra da lista).
// A primeira instrução é o carregamento do dotenv: imports rodam ANTES do
// corpo do módulo que importa, então nenhum módulo consegue ler a variável
// antes de ela existir no process.env.
import 'dotenv/config';

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
  port,
  dbHost: required('DB_HOST'),
};

// Impressão SEGURA e seletiva: apenas nomes dos campos, nenhuma senha ou chave.
console.log('config carregada', JSON.stringify(config));