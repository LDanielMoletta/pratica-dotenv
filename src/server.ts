// src/server.ts
// iniciar o servidor com a porta da configuração, imprimir a porta REAL usada
// (server.address()) e tratar porta ocupada (exercício 5).
import { createApp } from './app';
import { config } from './config';

if (process.argv.includes('--print-config')) {
  process.exit(0);
}

const app = createApp();

const server = app.listen(config.port, () => {
  const address = server.address();
  const portaReal =
    typeof address === 'object' && address !== null ? address.port : config.port;
  app.locals.port = portaReal;
  console.log(`servidor no ar na porta ${portaReal} (http://localhost:${portaReal})`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ERRO: porta ${config.port} já está em uso (EADDRINUSE). Não foi possível iniciar.`);
    process.exitCode = 1;
    return;
  }
  console.error('ERRO ao iniciar o servidor:', err);
  process.exitCode = 1;
});