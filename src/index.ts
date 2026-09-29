// src/index.ts
// Demonstra o exercício 1: dotenv carregado antes de qualquer leitura,
// porta convertida para número em UM único lugar, impressão seletiva.
import { config } from './config';
import './database';

// prova de tipo: process.env.PORT é texto ("3000" + 1 = "30001");
// config.port já é número (3000 + 1 = 3001).
console.log('process.env.PORT era texto: "3000" + 1 =', '3000' + 1);
console.log('config.port e numero: 3000 + 1 =', config.port + 1);
console.log('typeof config.port =', typeof config.port);