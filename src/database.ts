// src/database.ts
// Consumidor da configuração: NÃO lê process.env de novo, usa o módulo de
// configuração centralizado.
import { config } from './config';

export const dbHost = config.dbHost;

console.log('host do banco:', dbHost);