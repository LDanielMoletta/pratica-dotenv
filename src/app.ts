// src/app.ts
// Aplicação Express: rota /health devolve a porta REAL em que o servidor
// atendeu (exercício 5) e o ambiente carregado (exercício 2).
import express from 'express';
import { config } from './config';

export function createApp() {
  const app = express();

  app.locals.config = config;

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      port: app.locals.port ?? config.port,
      env: config.env,
    });
  });

  return app;
}