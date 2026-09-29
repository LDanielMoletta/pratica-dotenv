// src/server.ts
// Inicia o servidor com a porta validada em config.ts e imprime a porta REAL
// usada (server.address()) — exercício 5.
//
// Cuidado específico do Windows (Node 24): em uma segunda instância na MESMA
// porta, o `app.listen` dispara o evento 'listening' E o evento 'error'
// (EADDRINUSE) — diferente do Unix, onde só 'error' dispara. Por isso:
//  - qualquer erro de subida encerra com process.exit(1) imediatamente;
//  - a mensagem de sucesso é adiada para setImmediate e só sai se NÃO houve
//    erro, evitando anunciar "servidor no ar" quando ele não subiu.
import { createApp } from './app';
import { config } from './config';

if (process.argv.includes('--print-config')) {
  process.exit(0);
}

const app = createApp();
let falhou = false;

const server = app.listen(config.port);

server.on('listening', () => {
  const address = server.address();
  const portaReal =
    typeof address === 'object' && address !== null ? address.port : config.port;
  app.locals.port = portaReal;
  setImmediate(() => {
    if (falhou) {
      return;
    }
    console.log(`servidor no ar na porta ${portaReal} (http://localhost:${portaReal})`);
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  falhou = true;
  if (err.code === 'EADDRINUSE') {
    console.error(`ERRO: porta ${config.port} já está em uso (EADDRINUSE). Não foi possível iniciar.`);
  } else {
    console.error('ERRO ao iniciar o servidor:', err);
  }
  process.exit(1);
});
