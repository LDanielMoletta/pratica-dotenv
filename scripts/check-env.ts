// scripts/check-env.ts
// Exercício 9 — "configuração compartilhada funciona para o time".
//
// Verifica, sem ler NENHUM valor de process.env (tudo vem dos arquivos):
//   1. existe o arquivo de ambiente do ambiente-alvo (.env.dev por padrão)
//   2. todas as variáveis declaradas em .env.example existem preenchidas nele
//      (o comentário "# opcional" na linha anterior dispensa a obrigatoriedade)
//   3. .env.example NÃO traz valores reais (segredos vazios ou placeholder)
//   4. nenhum .env* real está versionado no Git
//
// Uso:
//   npm run check:env                                   # raiz, ambiente development
//   npm run check:env -- --ambiente=producao            # exige .env.prod
//   node -r ts-node/register scripts/check-env.ts <diretorio> [--ambiente=...]
//
// Sai com código 1 se encontrar qualquer problema (usado pelo hook predev).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const argumentos = process.argv.slice(2);
const flags = argumentos.filter((a) => a.startsWith('--'));
const caminhos = argumentos.filter((a) => !a.startsWith('--'));
const diretorio = caminhos[0] ? path.resolve(caminhos[0]) : RAIZ;

// O projeto carrega arquivos por ambiente (ex02): em desenvolvimento o
// obrigatório é .env.dev; em produção, .env.prod. .env continua válido como
// base comum e é validado quando existe.
const alvo = flags.some((f) => /producao|production/.test(f)) ? '.env.prod' : '.env.dev';

type Entrada = { chave: string; valor: string; linha: number; opcional: boolean };

const problemas: string[] = [];
const avisos: string[] = [];

function analisarEnv(conteudo: string, rotulo: string): Entrada[] {
  const entradas: Entrada[] = [];
  let opcionalPendente = false;
  conteudo.split(/\r?\n/).forEach((linha, indice) => {
    const trimada = linha.trim();
    if (trimada === '') {
      return;
    }
    if (trimada.startsWith('#')) {
      // comentário imediatamente acima marca a próxima variável como opcional
      opcionalPendente = /opcional/i.test(trimada);
      return;
    }
    const separador = trimada.indexOf('=');
    if (separador <= 0) {
      problemas.push(`${rotulo}:${indice + 1} linha inválida (esperado CHAVE=valor): ${trimada.slice(0, 40)}`);
      return;
    }
    entradas.push({
      chave: trimada.slice(0, separador).trim(),
      valor: trimada.slice(separador + 1).trim().replace(/^["']|["']$/g, ''),
      linha: indice + 1,
      opcional: opcionalPendente,
    });
    opcionalPendente = false;
  });
  return entradas;
}

function eSensivel(chave: string): boolean {
  return /(PASSWORD|SECRET|TOKEN|CREDENTIAL|PRIVATE|API_KEY|_KEY|KEY$|DSN)/i.test(chave);
}

function pareceValorReal(chave: string, valor: string): boolean {
  if (valor === '') {
    return false;
  }
  // prefixos de credencial conhecida: nunca podem aparecer no exemplo
  if (/^(sk_(live|test|dev|prod)_|ghp_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{8,}|-----BEGIN)/i.test(valor)) {
    return true;
  }
  if (!eSensivel(chave)) {
    return false;
  }
  // segredo preenchido com algo que não é placeholder
  const placeholder = /^(<.*>|\{\{?[^}]*\}?\}|CHANGE_?ME|xxx+|preencher.*|sua_.*|seu_.*|example.*|ficticio.*|fake.*|0+|none|null)$/i;
  return !placeholder.test(valor);
}

function versionados(): string[] {
  try {
    const saida = execFileSync('git', ['ls-files'], { cwd: diretorio, encoding: 'utf-8' });
    return saida
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^\.env/.test(l) && l !== '.env.example');
  } catch {
    avisos.push('Git indisponível ou diretório fora de um repositório: pulando a checagem de versionamento.');
    return [];
  }
}

// ---------------------------------------------------------------------------
// 1) arquivo de exemplo
// ---------------------------------------------------------------------------
const caminhoExemplo = path.join(diretorio, '.env.example');
if (!fs.existsSync(caminhoExemplo)) {
  problemas.push('.env.example não encontrado — ele é o contrato do time; não pode faltar.');
  console.error('\n[check-env] FALHOU: o time não tem contrato de ambiente.\n');
  process.exit(1);
}
const exemplo = analisarEnv(fs.readFileSync(caminhoExemplo, 'utf-8'), '.env.example');
console.log(`[check-env] .env.example declara ${exemplo.length} variáveis`);

// ---------------------------------------------------------------------------
// 2) valores reais no exemplo?
// ---------------------------------------------------------------------------
for (const { chave, valor, linha } of exemplo) {
  if (pareceValorReal(chave, valor)) {
    problemas.push(
      `.env.example:${linha} "${chave}" tem valor que parece REAL. No exemplo, segredos ficam vazios ou como placeholder.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3) arquivos locais e chaves obrigatórias
// ---------------------------------------------------------------------------
const candidatos = ['.env', '.env.dev', '.env.prod'];
const locais = candidatos.filter((nome) => fs.existsSync(path.join(diretorio, nome)));

if (!fs.existsSync(path.join(diretorio, alvo))) {
  problemas.push(
    `${alvo} não existe — é o arquivo do ambiente que este projeto carrega.\n` +
      `      cp .env.example ${alvo}   e preencha os valores.`,
  );
}
if (locais.length === 0) {
  problemas.push(
    'nenhum arquivo de ambiente local encontrado. Copie o exemplo e preencha:\n' +
      candidatos.map((c) => `      cp .env.example ${c}`).join('\n'),
  );
}

for (const nome of locais) {
  const entradas = analisarEnv(fs.readFileSync(path.join(diretorio, nome), 'utf-8'), nome);
  const preenchidas = new Map(entradas.map((e) => [e.chave, e]));
  const opcionais = new Set(entradas.filter((e) => e.opcional).map((e) => e.chave));

  const faltando: string[] = [];
  for (const esperada of exemplo) {
    const achada = preenchidas.get(esperada.chave);
    if (achada === undefined) {
      // variável declarada como opcional no exemplo pode faltar no local
      if (!esperada.opcional) {
        faltando.push(`${esperada.chave} (não existe em ${nome})`);
      }
    } else if (achada.valor === '' && !opcionais.has(esperada.chave) && !esperada.opcional) {
      faltando.push(`${esperada.chave} (existe mas está vazia em ${nome})`);
    }
  }
  // variável local que não está no exemplo: costuma ser resíduo de outra máquina
  for (const local of entradas) {
    if (!exemplo.some((e) => e.chave === local.chave)) {
      avisos.push(`${nome}:${local.linha} "${local.chave}" não existe em .env.example — versione o exemplo para o time.`);
    }
  }

  if (faltando.length === 0) {
    console.log(`[check-env] ${nome}: ${entradas.length}/${exemplo.length} variáveis presentes`);
  } else {
    problemas.push(`${nome} está incompleto — variáveis faltando:\n      - ${faltando.join('\n      - ')}`);
  }
}

// ---------------------------------------------------------------------------
// 4) segredos versionados
// ---------------------------------------------------------------------------
const vazados = versionados();
if (vazados.length > 0) {
  problemas.push(
    `arquivo de ambiente REAL está versionado: ${vazados.join(', ')}\n` +
      '      Desfaça com: git rm --cached <arquivo>   (o valor continua no histórico: rotacione a chave!)',
  );
}

// ---------------------------------------------------------------------------
const titulo = problemas.length === 0 ? 'OK' : 'FALHOU';
console.log(`\n[check-env] ${titulo}`);
for (const a of avisos) {
  console.log(`  aviso: ${a}`);
}
for (const p of problemas) {
  console.error(`  problema: ${p}`);
}
if (problemas.length === 0) {
  console.log('  ambiente local pronto para o time (sem valores reais no exemplo, sem .env versionado)');
}
process.exit(problemas.length === 0 ? 0 : 1);