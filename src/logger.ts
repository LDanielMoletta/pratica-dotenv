// src/logger.ts
// Exercício 10 — log em arquivo com valor por ambiente.
//
// Regras:
//  - NÃO lê process.env: tudo vem de `config` (exercício 8);
//  - cria o diretório de logs se não existir (`mkdir` recursivo);
//  - respeita o nível mínimo do ambiente (dev: debug, prod: info);
//  - formato por ambiente (dev: texto, prod: JSON);
//  - caminho já vem interpolado e ancorado na raiz pela configuração — aqui
//    ainda conferimos antes de escrever.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

export type Nivel = 'debug' | 'info' | 'warn' | 'error';

const ORDEM: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Confere que o arquivo continua dentro da raiz antes de qualquer escrita. */
function garantirCaminhoSeguro(arquivo: string): void {
  const relativo = path.relative(config.root, arquivo);
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
    throw new Error(`logger: caminho de log fora da raiz do projeto: ${arquivo}`);
  }
}

/** Cria o diretório de logs (idempotente) e devolve o caminho absoluto. */
export function prepararLog(): string {
  const alvo = path.join(config.log.dir, path.basename(config.log.path));
  garantirCaminhoSeguro(alvo);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  return alvo;
}

/** True quando a mensagem passou pelo filtro de nível do ambiente. */
export function deveGravar(nivel: Nivel): boolean {
  return ORDEM[nivel] >= ORDEM[config.log.level as Nivel];
}

/** Grava a mensagem no arquivo de log; devolve se realmente escreveu. */
export function escreverLog(nivel: Nivel, mensagem: string): boolean {
  if (!deveGravar(nivel)) {
    return false;
  }
  const destino = prepararLog();
  const carimbo = new Date().toISOString();
  const linha =
    config.log.format === 'json'
      ? JSON.stringify({ ts: carimbo, nivel, msg: mensagem })
      : `[${carimbo}] ${nivel.toUpperCase()} ${mensagem}`;
  fs.appendFileSync(destino, `${linha}\n`, 'utf-8');
  return true;
}

/** Caminho do arquivo de log em uso (relativo à raiz, para diagnóstico). */
export function caminhoLog(): string {
  return path.relative(config.root, config.log.path);
}