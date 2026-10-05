// src/teste-exercicio-08.ts
// Exercício 8 — verificação da estrutura do projeto:
//  1. tipos sem `undefined` (port number, db.host string preenchida)
//  2. a configuração NÃO pode ser alterada em tempo de execução
//  3. `process.env` só aparece no módulo de configuração (e nos harnesses de teste)
import fs from 'node:fs';
import path from 'node:path';
import { config, type Config } from './config';

const resultados: boolean[] = [];

function checar(nome: string, condicao: boolean, detalhe: string): void {
  resultados.push(condicao);
  console.log(`  [${condicao ? 'OK' : 'FALHOU'}] ${nome}: ${detalhe}`);
}

// ---------------------------------------------------------------------------
console.log('== 1) Tipos convertidos na borda (sem optional) ==');
// o tipo exportado é usado aqui: se config.port fosse opcional, nem compilaria
const tipada: Config = config;
const porta: number = tipada.port;
const host: string = tipada.db.host;

checar('1.1 config.port é number', typeof porta === 'number', `valor=${porta} (typeof=${typeof porta})`);
checar('1.2 config.db.host é string preenchida', typeof host === 'string' && host.length > 0, `valor=${host}`);
checar('1.3 config.api.key é string preenchida', config.api.key.length > 0, `mascarada=${'****' + config.api.key.slice(-4)}`);

// ---------------------------------------------------------------------------
console.log('== 2) Configuração congelada (não muda em tempo de execução) ==');
function tentarAlterarPorta(): string {
  try {
    (config as { port: number }).port = 9999;
    return 'SEM ERRO — a alteração foi aceita';
  } catch (e) {
    return `${(e as Error).name}: ${(e as Error).message}`;
  }
}

function tentarAlterarHost(): string {
  try {
    (config.db as { host: string }).host = 'localhost';
    return 'SEM ERRO — a alteração foi aceita';
  } catch (e) {
    return `${(e as Error).name}: ${(e as Error).message}`;
  }
}

checar('2.1 alterar config.port falha', config.port === porta && !tentarAlterarPorta().startsWith('SEM ERRO'), tentarAlterarPorta());
checar('2.2 alterar config.db.host (aninhado) falha', config.db.host === host && !tentarAlterarHost().startsWith('SEM ERRO'), tentarAlterarHost());

// ---------------------------------------------------------------------------
console.log('== 3) Busca por process.env no código de aplicação ==');

const RAIZ = path.resolve(__dirname, '..');
// Exceções: o módulo de configuração, o comparativo env-schema e os HARNESSES de
// teste — que montam uma *cópia* do ambiente para subir processos filhos com
// NODE_ENV/LOG_PATH diferentes. Nenhum deles é código de aplicação.
const IGNORADOS = new Set([
  'config.ts',
  'config-schema.ts',
  'teste-exercicio-05.ts',
  'teste-exercicio-08.ts',
  'teste-exercicio-10.ts',
]);

function arquivosTypeScript(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      achados.push(...arquivosTypeScript(completo));
    } else if (entrada.name.endsWith('.ts')) {
      achados.push(completo);
    }
  }
  return achados;
}

const infratores: string[] = [];
for (const arquivo of arquivosTypeScript(path.join(RAIZ, 'src'))) {
  const nome = path.basename(arquivo);
  if (IGNORADOS.has(nome)) {
    continue;
  }
  const linhas = fs.readFileSync(arquivo, 'utf-8').split(/\r?\n/);
  linhas.forEach((linha, i) => {
    const trimada = linha.trim();
    if (!trimada.startsWith('//') && trimada.includes('process.env')) {
      infratores.push(`${nome}:${i + 1}`);
    }
  });
}

checar('3.1 nenhum arquivo de aplicação lê process.env', infratores.length === 0, infratores.length === 0 ? 'só o módulo de configuração (config.ts/config-schema.ts) e os harnesses' : infratores.join(', '));

// ---------------------------------------------------------------------------
const passou = resultados.every(Boolean);
console.log(`\nRESULTADO: ${resultados.filter(Boolean).length}/${resultados.length} verificações OK`);
process.exit(passou ? 0 : 1);