// src/integration.ts
// Consome o objeto VALIDADO da configuração — nunca process.env de novo
// (exercício 4: a leitura espalhada que contornava a validação).
import { config } from './config';

export const apiKey = config.apiKey;

console.log('integration usa config.apiKey (validado), não process.env:', typeof apiKey);