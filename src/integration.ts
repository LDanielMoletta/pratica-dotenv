// src/integration.ts
// Consome o objeto VALIDADO da configuração — nunca relê o ambiente
// (exercício 4: a leitura espalhada que contornava a validação).
import { config } from './config';

export const apiKey = config.api.key;

console.log('integration usa config.api.key (validado), sem reler o ambiente:', typeof apiKey);