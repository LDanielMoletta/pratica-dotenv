# Exercício 8 - Estrutura de projeto com um módulo de configuração

## Objetivo
Um único módulo de configuração que (1) carrega o ambiente **antes** de qualquer
leitura, (2) valida e converte os valores na borda, (3) exporta um objeto
**congelado** e **tipado** (sem `undefined`) e (4) é a **única** ocorrência de
`process.env` no projeto.

> Este exercício **retoma** o `src/config.ts` dos exercícios 1/4 e o
> `.env.example` do exercício 3.

---

## Código original (com os problemas intencionais)

`temp/exercicio-08/config-original.ts`:
```typescript
export const config = {
  port: process.env.PORT,      // lido no momento do IMPORT, antes do dotenv.config()
  db: { host: process.env.DB_HOST },
};
```

`temp/exercicio-08/db-original.ts` (leitura espalhada):
```typescript
export const connection = connect(String(process.env.DB_HOST) + ':5432');
```

`temp/exercicio-08/repro-08.ts` (o `server.ts` do enunciado):
```typescript
import { config } from './config-original';
import dotenv from 'dotenv';
dotenv.config();               // só AGORA o ambiente é carregado
// ...
config.db.host = 'localhost';  // ninguém impediu
```

---

## Registro da investigação

### Cenário A — `dotenv.config()` depois do import (o caso do enunciado)

**Sintoma:** `config.port` e `config.db.host` chegam **vazios** mesmo com `PORT` e
`DB_HOST` no arquivo.

**Resultado esperado:** `config.port === 3001` (número) e `config.db.host === 'localhost'`.
**Resultado obtido:**
```
[1] typeof config.port      : undefined | valor: undefined
[2] config.db.host         : undefined
[3] process.env.PORT depois do dotenv.config(): "3001"
[4] config.port continua    : undefined <- objeto já foi criado antes do load
[5] após config.db.host = "localhost": localhost <- mutação silenciosa
[6] server.address(): {"address":"::","family":"IPv6","port":55613}
[6] porta realmente usada: 55613 | ATENÇÃO: não é a 3001 do .env — listen(undefined) escolhe porta aleatória
[6] GET /health em TCP falhou: Failed to parse URL from http://localhost:undefined/health
```

**Hipótese:** os `import` são resolvidos **antes** da primeira linha executável;
`config-original.ts` já foi avaliado quando `dotenv.config()` roda.
**Como foi investigado:** imprime-se `typeof`, o valor e `process.env.PORT` antes e
depois do `dotenv.config()`, além de observar `server.address()`.
**Causa encontrada:** a configuração é montada no **momento do import**, e o
`app.listen(undefined)` **sobe numa porta aleatória** — a aplicação "sobe" e nada
funciona.

### Cenário B — ordem certa, mas sem conversão

**Sintoma:** a porta existe, porém como **texto**.
```
[7] typeof config.port: string | valor: "3001"
[8] server.address(): {"address":"::","family":"IPv6","port":3001} | tipo: object
[8] GET /health em TCP 3001: {"ok":true,"port":"3001"}
```
`app.listen("3001")` funciona por acaso (o Node converte string numérica), mas a
**resposta expõe a inconsistência**: `"port":"3001"` é string. Com um texto
**não numérico** o Node abre um *named pipe* em vez de TCP (ver exercício 5,
`PORT=abc`), e qualquer aritmética/comparação no código quebra.

### Cenário C — leitura direta de `process.env` fora do módulo

```
[db-original] connection: conectado em undefined:5432 <- leu process.env.DB_HOST direto
```
O mesmo valor é convertido/validado em um lugar e lido cru em outro — a validação
central não alcança quem lê direto.

### Cenário D — mutação silenciosa
```
[5] após config.db.host = "localhost": localhost <- mutação silenciosa
```
`const` não impede mutação: o objeto exportado é o mesmo para todos os módulos.

---

## Correção aplicada (`src/config.ts`)

Ordem obrigatória dentro do módulo:

```typescript
// 1º  carregar o ambiente (antes de QUALQUER leitura)
dotenv.config({ path: path.resolve(__dirname, '..', arquivo), quiet: true });

// 2º  validar e converter na borda
const schema = Joi.object<Valores>({
  DB_HOST: Joi.string().required().min(1),
  API_KEY: Joi.string().required().min(1),
  PORT:    Joi.number().empty('').integer().min(0).max(65535).default(3000),
  LOG_PATH: Joi.string().empty('').default('./logs/${NODE_ENV}.log'),
  LOG_LEVEL: Joi.string().empty('').valid('debug', 'info', 'warn', 'error').default('info'),
}).unknown(true);
const { value: valor, error } = schema.validate(process.env, { abortEarly: false });
if (error) throw new Error(`configuração inválida na subida:\n - ${...}`);

// 3º  exportar congelado, agrupado por área, com o tipo
export const config = Object.freeze({
  env: ambiente,
  arquivo,
  port: valor.PORT,                                  // number
  db:  Object.freeze({ host: valor.DB_HOST }),        // string
  api: Object.freeze({ key: valor.API_KEY }),         // string
  log: Object.freeze({ path: valor.LOG_PATH, level: valor.LOG_LEVEL }),
});
export type Config = typeof config;
```

Mudanças nos consumidores (leitura direta → módulo):
- `src/database.ts`: `config.db.host`
- `src/integration.ts`: `config.api.key`
- `src/weather.ts`: `config.api.key`
- `src/app.ts` / `src/server.ts` / `src/index.ts`: `config.port`

Cada campo exportado está **documentado com comentário** no próprio módulo
(`env`, `arquivo`, `port`, `db.host`, `api.key`, `log.path`, `log.level`).

---

## Verificação (`npm run test:ex8`)

```
== 1) Tipos convertidos na borda (sem optional) ==
  [OK] 1.1 config.port é number: valor=3000 (typeof=number)
  [OK] 1.2 config.db.host é string preenchida: valor=db.desenvolvimento.local
  [OK] 1.3 config.api.key é string preenchida: mascarada=****0000
== 2) Configuração congelada (não muda em tempo de execução) ==
  [OK] 2.1 alterar config.port falha: TypeError: Cannot assign to read only property 'port' of object '#<Object>'
  [OK] 2.2 alterar config.db.host (aninhado) falha: TypeError: Cannot assign to read only property 'host' of object '#<Object>'
== 3) Busca por process.env no código de aplicação ==
  [OK] 3.1 nenhum arquivo de aplicação lê process.env: só o módulo de configuração (config.ts/config-schema.ts) e os harnesses

RESULTADO: 6/6 verificações OK
```

**Aplicação iniciada:** `config.port` é número e `config.db.host` é texto
preenchido (1.1/1.2); o tipo exportado `Config` é usado no harness — se
`port`/`host` fossem opcionais, **nem compilaria**.

**`DB_HOST` ausente** (`.env.dev` sem a chave):
```
 - "DB_HOST" is required
EXIT=1
```

**Regressão:** `npm run test:ex5` continua **12/12** após a reestruturação.

> Nota sobre o critério "busca por `process.env`": o harness mede a ocorrência
> literal em `src/`. Além do módulo de configuração, só os **harnesses de teste**
> mencionam o termo — e apenas para montar uma *cópia* do ambiente ao subir o
> servidor em cenários diferentes. Duas mensagens de log da aplicação citavam a
> palavra e foram reescritas para manter o critério estrito e não banalizá-lo.

---

## Perguntas orientadoras (respostas)

**Por que `process.env` é sempre tipado como possivelmente indefinido?**
Because a variável pode não existir no ambiente — mas no projeto isso é decidido
**na borda**: depois da validação, `config.port` é `number` e `config.db.host` é
`string`, sem `undefined`. A incerteza fica confinada ao módulo.

**Qual a diferença entre uma constante e um objeto congelado?**
`const` impede **reatribuir a variável**; `Object.freeze` impede **alterar as
propriedades** do objeto (e o erro só aparece em runtime, em modo estrito). Por
isso o exercício exige os dois: `const` + `freeze` (inclusive no objeto aninhado,
por isso `db`, `api` e `log` também são congelados).

**Que problema surge quando duas partes convertem o mesmo valor?**
Cada ponto de uso converte do seu jeito: um lugar vira `number`, outro `string`,
outro `undefined`. O resultado é comparação errada (`"3000" !== 3000`), `NaN`
silencioso e validação que não protege ninguém. Converter **uma vez** na borda
resolve.

**Por que a conversão deve acontecer na borda, e não no ponto de uso?**
Porque a borda é o único lugar que conhece a *origem* (texto); o resto do código
precisa conhecer apenas o *destino* (tipos garantidos). Isso centraliza a regra e
elimina a leitura espalhada.

**Que vantagem o tipo exportado traz para quem consome?**
`Config` (`typeof config`) é o contrato: quem consome recebe `port: number` e
`db.host: string` **sem optional**, então o editor não oferece mais o caso
`undefined` e o compilador barra o uso errado antes de rodar.

---

## Aprendizados
- `import` é avaliado **antes** da primeira linha: quem lê `process.env` no
  importador vence a corrida com o `dotenv.config()`.
- `app.listen(undefined)` **sobe numa porta aleatória** — falha silenciosa, sem erro.
- `const` não congela objeto: use `Object.freeze` (e congele o aninhado).
- Conversão e validação **uma vez**, na borda; o resto só consome tipos.
- Um teste automatizado que faz a *busca por `process.env`* mantém a regra da
  lista sem depender de disciplina manual.