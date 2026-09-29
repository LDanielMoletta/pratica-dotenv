// src/teste-exercicio-05.ts
// Exercício 5: prova que a porta é validada, tem padrão explícito, o servidor
// imprime a porta REAL e uma segunda instância na mesma porta falha com
// mensagem legível e código de saída 1 (sem stack trace crua).
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TS_NODE_REGISTER = path.resolve(ROOT, 'node_modules', 'ts-node', 'register');
const SERVER = path.resolve(ROOT, 'src', 'server.ts');

type Filho = ChildProcess & { saida: string; erro: string; code: number | null };

function subir(overrides: Record<string, string | undefined>): Filho {
  const env: NodeJS.ProcessEnv = { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' };
  for (const [chave, valor] of Object.entries(overrides)) {
    if (valor === undefined) {
      delete env[chave];
    } else {
      env[chave] = valor;
    }
  }
  const filho = spawn(process.execPath, ['-r', TS_NODE_REGISTER, SERVER], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as Filho;
  filho.saida = '';
  filho.erro = '';
  filho.code = null;
  filho.stdout?.on('data', (d: Buffer) => (filho.saida += d.toString('utf8')));
  filho.stderr?.on('data', (d: Buffer) => (filho.erro += d.toString('utf8')));
  filho.on('close', (code) => (filho.code = code));
  return filho;
}

function encerrar(filho: Filho): Promise<number> {
  if (filho.code !== null) {
    return Promise.resolve(filho.code);
  }
  return new Promise((resolve) => {
    filho.on('close', resolve);
    filho.kill();
  });
}

async function aguardarSaida(filho: Filho, ms = 15000): Promise<number> {
  if (filho.code !== null) {
    return filho.code;
  }
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      filho.kill();
      resolve(-1);
    }, ms);
    filho.on('close', (code) => {
      clearTimeout(t);
      resolve(code ?? -1);
    });
  });
}

async function aguardarSaude(porta: number, ms = 8000): Promise<{ ok: boolean; port: unknown } | null> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`http://localhost:${porta}/health`);
      const b = (await r.json()) as { ok: boolean; port: unknown };
      if (b.ok) {
        return b;
      }
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

const resultados: boolean[] = [];
function checar(nome: string, condicao: boolean, detalhe: string): void {
  resultados.push(condicao);
  console.log(`  [${condicao ? 'OK' : 'FALHOU'}] ${nome}: ${detalhe}`);
}

async function main(): Promise<void> {
  console.log('== A) PORT ausente -> padrão explícito 3000 ==');
  let filho = subir({ PORT: undefined, NODE_ENV: undefined });
  let saude = await aguardarSaude(3000);
  checar('A.1 /health responde', saude !== null, JSON.stringify(saude));
  checar('A.2 porta é número 3000', saude?.port === 3000, `typeof=${typeof saude?.port}`);
  console.log('      stdout:', filho.saida.split(/\r?\n/).filter(Boolean).join(' | '));
  await encerrar(filho);

  console.log('== B) PORT=4000 -> usa 4000 ==');
  filho = subir({ PORT: '4000', NODE_ENV: undefined });
  saude = await aguardarSaude(4000);
  checar('B.1 /health responde em 4000', saude?.port === 4000, JSON.stringify(saude));
  await encerrar(filho);

  console.log('== C) PORT="" (texto vazio) -> tratado como não definido (3000) ==');
  filho = subir({ PORT: '', NODE_ENV: undefined });
  saude = await aguardarSaude(3000);
  checar('C.1 cai no padrão 3000', saude?.port === 3000, JSON.stringify(saude));
  await encerrar(filho);

  console.log('== D) PORT=abc -> NÃO sobe (falha de validação, exit 1) ==');
  filho = subir({ PORT: 'abc', NODE_ENV: undefined });
  const codeD = await aguardarSaida(filho);
  checar('D.1 saiu com código 1', codeD === 1, `exit=${codeD}`);
  checar('D.2 mensagem cita PORT', filho.erro.includes('PORT'), filho.erro.split(/\r?\n/).find((l) => l.includes('PORT'))?.trim() ?? filho.erro.trim());

  console.log('== E) PORT=0 -> porta efêmera; imprime a porta REAL ==');
  filho = subir({ PORT: '0', NODE_ENV: undefined });
  const m = filho.saida.match(/no ar na porta (\d+)/);
  let real = -1;
  if (m) {
    real = Number(m[1]);
  } else {
    // aguarda a linha de subida aparecer
    await new Promise((r) => setTimeout(r, 1500));
    const m2 = filho.saida.match(/no ar na porta (\d+)/);
    real = m2 ? Number(m2[1]) : -1;
  }
  checar('E.1 porta real > 0 (efêmera escolhida pelo SO)', real > 0, `porta real=${real}`);
  const saudeE = real > 0 ? await aguardarSaude(real) : null;
  checar('E.2 /health responde na porta real', saudeE?.port === real, JSON.stringify(saudeE));
  await encerrar(filho);

  console.log('== F) duas instâncias na MESMA porta (4567) ==');
  const primeira = subir({ PORT: '4567', NODE_ENV: undefined });
  const saudeF = await aguardarSaude(4567);
  checar('F.1 primeira sobe', saudeF?.port === 4567, JSON.stringify(saudeF));
  const segunda = subir({ PORT: '4567', NODE_ENV: undefined });
  const codeF = await aguardarSaida(segunda);
  checar('F.2 segunda sai com código 1', codeF === 1, `exit=${codeF}`);
  checar('F.3 mensagem legível de porta em uso', segunda.erro.includes('EADDRINUSE') && segunda.erro.includes('já está em uso'), segunda.erro.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' / '));
  checar('F.4 primeira continua saudável', (await aguardarSaude(4567)) !== null, '');
  await encerrar(primeira);
  await encerrar(segunda);

  const passou = resultados.every(Boolean);
  console.log(`\nRESULTADO: ${resultados.filter(Boolean).length}/${resultados.length} verificações OK`);
  process.exit(passou ? 0 : 1);
}

main().catch((e) => {
  console.error('falha inesperada no teste:', e);
  process.exit(1);
});
