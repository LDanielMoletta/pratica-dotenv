// src/app.ts
// Aplicação Express: rota /health devolve a porta REAL em que o servidor
// atendeu (exercício 5) e o ambiente carregado (exercício 2).
// A rota /weather exercita o cliente do exercício 7: a chave de API viaja no
// cabeçalho e NUNCA volta na resposta.
import express from 'express';
import { config } from './config';
import { getWeather } from './weather';
import { caminhoLog, escreverLog } from './logger';

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

  app.get('/weather', (req, res) => {
    const cidade = String(req.query.cidade ?? '');
    if (cidade === '') {
      res.status(400).json({ erro: 'informe ?cidade=Sao-Paulo' });
      return;
    }
    getWeather(cidade)
      .then((clima) => {
        // resposta SEM qualquer credencial (exercício 7)
        escreverLog('info', `consulta de clima: ${cidade}`);
        res.json({ clima, log: caminhoLog() });
      })
      .catch((erro: Error) => {
        escreverLog('warn', `consulta de clima falhou: ${cidade}`);
        res.status(502).json({ erro: erro.message });
      });
  });

  app.use((_req, res) => {
    res.status(404).json({ erro: 'rota não encontrada' });
  });

  return app;
}