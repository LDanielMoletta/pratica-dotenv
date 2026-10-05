// src/teste-exercicio-10.ts
// Exercício 10 — variáveis dinâmicas com dotenv-expand.
//
// Cada cenário roda em um PROCESSO FILHO, porque NODE_ENV e LOG_PATH são lidos
// no momento do import do módulo de configuração: só um processo novo recarrega
// o ambiente do zero.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

const RAIZ = path.resolve(__dirname, '..');
const LOGS = path.join(RAIZ, 'logs');
const CONFIG_TS = path.join(RAIZ, 'src', 'config.ts');
const LOGGER_TS = path.join(RAIZ, 'src', 'logger.ts');

const resultados: boolean[] = [];

function checar(nome: string, condicao: boolean, detalhe: string): void {
  resultados.push(condicao);
  console.log(`  [${condicao ? 'OK' : 'FALHOU'}] ${nome}: ${detalhe}`);
}

type Resultado = { status: number; stdout: string; stderr: string };

// Variáveis que o módulo de configuração do PAI já escreveu em process.env
// (dotenv.config + expand). dotenv NÃO sobrescreve o que já existe, então um
// filho que herda esses valores continua com o arquivo do pai — por isso o
// ambiente de cada filho é montado sem elas (é a mesma armadilha de precedência
// do exercício 1, agora atingindo a interpolação).
const DO_PROPRIO_ARQUIVO = ['NODE_ENV', 'PORT', 'DB_HOST', 'DB_PASSWORD', 'API_KEY', 'LOG_PATH', 'LOG_LEVEL'];

function ambienteLimpo(extras: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(process.env)) {
    if (valor !== undefined && !DO_PROPRIO_ARQUIVO.includes(chave)) {
      base[chave] = valor;
    }
  }
  return {
    ...base,
    TS_NODE_TRANSPILE_ONLY: 'true',
    NODE_NO_WARNINGS: '1',
    ALVO: extras.ALVO ?? '',
    ...extras,
  };
}

function rodar(alvo: string, codigo: string, extras: Record<string, string>): Resultado {
  const r = spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', codigo], {
    cwd: RAIZ,
    encoding: 'utf-8',
    env: ambienteLimpo({ ...extras, ALVO: alvo }),
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const LER_CONFIG = `
  const { config } = require(process.env.ALVO);
  console.log('CONFIG=' + JSON.stringify({
    env: config.env,
    root: config.root,
    port: config.port,
    log: config.log,
  }));
`;

const USAR_LOGGER = `
  const { escreverLog, caminhoLog, deveGravar } = require(process.env.ALVO);
  const info = { caminho: caminhoLog(), debugAceito: deveGravar('debug'), infoAceito: deveGravar('info') };
  info.escreveuDebug = escreverLog('debug', 'mensagem de teste do harness');
  info.escreveuInfo = escreverLog('info', 'subida do servidor');
  console.log('LOGGER=' + JSON.stringify(info));
`;

function campo<T>(saida: string, prefixo: string): T {
  const linha = saida.split(/\r?\n/).find((l) => l.startsWith(prefixo));
  if (linha === undefined) {
    throw new Error(`saida sem ${prefixo}: ${saida.slice(0, 200)}`);
  }
  return JSON.parse(linha.slice(prefixo.length)) as T;
}

// ---------------------------------------------------------------------------
console.log('== 1) Interpolação por ambiente (o processo atual é development) ==');
checar(
  '1.1 LOG_PATH interpolado e ancorado',
  config.log.path.endsWith('development.log') &&
    path.isAbsolute(config.log.path) &&
    config.log.path.startsWith(RAIZ + path.sep) &&
    !config.log.path.includes('${'),
  path.relative(RAIZ, config.log.path),
);
checar('1.2 nível/formato de development', config.log.level === 'debug' && config.log.format === 'text', `nivel=${config.log.level} formato=${config.log.format}`);

// ---------------------------------------------------------------------------
console.log('== 2) Ambiente de produção (nível e formato diferentes) ==');
const prod = campo<{ env: string; log: { path: string; level: string; format: string } }>(
  rodar(CONFIG_TS, LER_CONFIG, { NODE_ENV: 'production' }).stdout,
  'CONFIG=',
);
checar('2.1 arquivo separado por ambiente', prod.log.path.endsWith('production.log'), path.relative(RAIZ, prod.log.path));
checar('2.2 nível/formato de produção', prod.log.level === 'info' && prod.log.format === 'json', `nivel=${prod.log.level} formato=${prod.log.format}`);

// ---------------------------------------------------------------------------
console.log('== 3) Sem NODE_ENV (padrão documentado = development) ==');
const semEnv = campo<{ env: string; log: { path: string } }>(
  rodar(CONFIG_TS, LER_CONFIG, { NODE_ENV: '' }).stdout,
  'CONFIG=',
);
checar('3.1 assume development e interpola o nome', semEnv.env === 'development' && semEnv.log.path.endsWith('development.log'), `env=${semEnv.env} arquivo=${path.relative(RAIZ, semEnv.log.path)}`);

// ---------------------------------------------------------------------------
console.log('== 4) Diretório de logs ausente é criado ==');
fs.rmSync(LOGS, { recursive: true, force: true });
const dev = campo<{ caminho: string; debugAceito: boolean; escreveuDebug: boolean }>(rodar(LOGGER_TS, USAR_LOGGER, { NODE_ENV: 'development' }).stdout, 'LOGGER=');
const arquivoDev = path.resolve(RAIZ, dev.caminho);
checar('4.1 mkdir criou o diretório', fs.existsSync(LOGS), LOGS);
checar('4.2 arquivo de log existe e tem conteúdo', fs.existsSync(arquivoDev) && fs.statSync(arquivoDev).size > 0, `${dev.caminho} (${fs.existsSync(arquivoDev) ? fs.statSync(arquivoDev).size : 0} bytes)`);

// ---------------------------------------------------------------------------
console.log('== 5) Filtro de nível e formato por ambiente ==');
checar('5.1 development aceita debug', dev.debugAceito && dev.escreveuDebug, `debugAceito=${dev.debugAceito} escreveu=${dev.escreveuDebug}`);
const linhasDev = fs.readFileSync(arquivoDev, 'utf-8').trim().split(/\r?\n/);
checar('5.2 formato texto em development', linhasDev.every((l) => /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z] (DEBUG|INFO) /.test(l)), linhasDev[0]);

const prodLog = campo<{ caminho: string; debugAceito: boolean; escreveuDebug: boolean }>(
  rodar(LOGGER_TS, USAR_LOGGER, { NODE_ENV: 'production' }).stdout,
  'LOGGER=',
);
checar('5.3 produção descarta debug', prodLog.debugAceito === false && prodLog.escreveuDebug === false, `debugAceito=${prodLog.debugAceito} escreveu=${prodLog.escreveuDebug}`);
const arquivoProd = path.resolve(RAIZ, prodLog.caminho);
const linhasProd = fs.readFileSync(arquivoProd, 'utf-8').trim().split(/\r?\n/);
const primeira = JSON.parse(linhasProd[0]) as Record<string, string>;
checar('5.4 formato JSON em produção', linhasProd.every((l) => JSON.parse(l).nivel !== undefined) && typeof primeira.ts === 'string', linhasProd[0]);

// ---------------------------------------------------------------------------
console.log('== 6) Caminho fora da raiz é rejeitado (path traversal) ==');
const fora = path.join(RAIZ, '..', 'fora-exercicio-10.log');
const travessia = rodar(CONFIG_TS, LER_CONFIG, { NODE_ENV: 'development', LOG_PATH: '../../fora-exercicio-10.log' });
const mensagemTravessia = (travessia.stderr.match(/ - "LOG_PATH"[^\r\n]*/) ?? ['(sem mensagem)'])[0];
checar('6.1 subida falha citando LOG_PATH', travessia.status !== 0 && /LOG_PATH/.test(travessia.stderr), `status=${travessia.status} ${mensagemTravessia}`);
checar('6.2 nada foi criado fora da raiz', !fs.existsSync(fora), fora);

const extensao = rodar(CONFIG_TS, LER_CONFIG, { NODE_ENV: 'development', LOG_PATH: './logs/saida.txt' });
checar('6.3 extensão diferente de .log é rejeitada', extensao.status !== 0 && /\.log/.test(extensao.stderr), `status=${extensao.status}`);

// ---------------------------------------------------------------------------
console.log('== 7) LOG_PATH vazio cai no padrão seguro ==');
const padrao = campo<{ log: { path: string } }>(rodar(CONFIG_TS, LER_CONFIG, { NODE_ENV: 'production', LOG_PATH: '' }).stdout, 'CONFIG=');
checar('7.1 padrão continua dentro do projeto', padrao.log.path.endsWith('production.log') && padrao.log.path.startsWith(RAIZ + path.sep), path.relative(RAIZ, padrao.log.path));

// ---------------------------------------------------------------------------
const passou = resultados.every(Boolean);
console.log(`\nRESULTADO: ${resultados.filter(Boolean).length}/${resultados.length} verificações OK`);
process.exit(passou ? 0 : 1);