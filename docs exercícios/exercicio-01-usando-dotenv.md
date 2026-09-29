# Exercício 1 - Carregando variáveis de ambiente com dotenv

## Objetivo
Criar um arquivo `.env`, carregá-lo com `dotenv` **antes de qualquer leitura** de
`process.env`, entender a precedência (variável do sistema vence o arquivo),
perceber que **tudo chega como string** e que imprimir `process.env` inteiro vaza
segredos.

---

## Código original (com os problemas intencionais)
Arquivos de reprodução em `temp/exercicio-01/` (pasta `temp` é ignorada pelo Git).

`temp/exercicio-01/.env`:
```
PORT = 3000
DB_HOST = "localhost"
DB_PASSWORD=senha123
```

`temp/exercicio-01/database.ts`:
```typescript
export const host = process.env.DB_HOST;
console.log('host do banco:', host);
```

`temp/exercicio-01/app.ts`:
```typescript
import { host } from './database';   // PROBLEMA: import executa ANTES do dotenv
import dotenv from 'dotenv';
dotenv.config();                     // carrega tarde demais
console.log('host importado do database.ts (lido lá, antes do dotenv):', host);
console.log('variaveis carregadas:', process.env);   // PROBLEMA: dump inteiro
console.log('porta + 1:', process.env.PORT + 1);     // PROBLEMA: string + number
```

Comando:
```bash
# em temp/exercicio-01
TS_NODE_TRANSPILE_ONLY=true node -r ts-node/register app.ts
```

---

## Registro da investigação

**Sintoma (antes da correção):**
```
host do banco: undefined
host importado do database.ts (lido lá, antes do dotenv): undefined
variaveis carregadas: {
  ...
  DB_HOST: 'localhost',
  DB_PASSWORD: 'senha123',        <- a senha aparece na saída
  ...
}
porta + 1: 30001
```

**Hipótese:**
1. Os `import` são executados no topo do módulo. `database.ts` lê `process.env.DB_HOST`
   **antes** de `dotenv.config()` rodar → `undefined`.
2. `process.env.PORT` é **string** → `'3000' + 1` é **concatenação** (`'30001'`), não soma.
3. `console.log(process.env)` imprime **todas** as variáveis, incluindo senha.

**Evidência:** as três saídas acima confirmam cada hipótese (porta `30001` prova o
tipo string; a senha no dump prova o vazamento; `undefined` prova a ordem).

---

## Correção aplicada

1. **Um único módulo de configuração** carrega o dotenv o mais cedo possível e é o
   primeiro a ser importado (ver `src/config.ts`); o resto do código importa `config`,
   nunca `process.env`.
2. **Conversão de tipo** acontece no módulo de configuração (validação Joi do
   exercício 4 garante `number`).
3. **Impressão seletiva**: apenas os campos seguros (sem senha/chave).

```bash
npm run print:config:dev
# [config] {"env":"development","arquivo":".env.dev","banco":"db.desenvolvimento.local","porta":3000}

node -r ts-node/register src/index.ts
# typeof config.port = number
```

---

## Precedência: variável do sistema vence o arquivo
O `dotenv` **não sobrescreve** uma variável já definida no ambiente. Prova:
```
PORT=5000 node -r ts-node/register src/server.ts --print-config   # (no Windows: cross-env PORT=5000 ...)
# porta = 5000, ignorando PORT=3000 do .env.dev
```
Utilidade prática: permite trocar a porta (ou a chave) só na sessão/CI, sem editar
o arquivo.

---

## Descoberta sobre "aspas no meio do valor" (dependente de versão)
O enunciado cita o caso de `DB_HOST = "localhost"` chegar com aspas/espaços.
Com **dotenv 17.4.2** (versão instalada) as aspas **duplas e simples** e os espaços
ao redor do `=` já são removidos:

```
DB_HOST (dotenv primeiro): localhost
DB_HOST em JSON (mostra as aspas): "localhost"   <- sem aspas internas
tipo de PORT: string
porta + 1: 30001
```

Sondas em `temp/probe16` (dotenv **16.6.1**, e também testado 13, 12, 11, 8, 6 e 4)
mostram o mesmo comportamento de normalização:
```
RESULT={"PORT":"3000","DB_HOST":"localhost","DB_PASSWORD":"senha123"}
DB_HOST entre aspas literal?  false
PORT e texto?  string
```

**Conclusão honesta:** o sintoma de "aspas no meio do valor" **não reproduz** nas
versões modernas do dotenv — é característica de versões antigas/legadas. O que
**continua valendo** em qualquer versão é o que foi corrigido aqui: **ordem de
carregamento**, **tipo string** e **vazamento por dump**.

---

## Verificação

| Cenário | Comando | Resultado |
|---------|---------|-----------|
| Ordem errada (import antes do dotenv) | `app.ts` | `host: undefined` ✅ reproduzido |
| Tipo string | `app-ordem-corrigida.ts` | `porta + 1: 30001` ✅ reproduzido |
| Vazamento | `app.ts` | `DB_PASSWORD: 'senha123'` na saída ✅ reproduzido |
| Após correção | `npm run print:config:dev` | porta `3000` como **number**, só campos seguros ✅ |
| Precedência | `PORT=5000 ...` | `5000` vence o arquivo ✅ |

---

## Aprendizados
- Carregar o `.env` **antes** de qualquer módulo que leia `process.env`.
- `process.env.*` é sempre **string** — converter antes de usar (somar, comparar faixa).
- **Nunca** imprimir `process.env` inteiro: vaza segredos.
- Variável já definida no sistema tem **precedência** sobre o arquivo.
- `import dotenv from 'dotenv'` é equivalente a `import 'dotenv/config'`, mas a
  **ordem relativa aos outros imports** é o que importa.
