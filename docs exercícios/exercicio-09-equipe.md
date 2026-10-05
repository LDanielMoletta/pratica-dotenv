# Exercício 9 - Configuração compartilhada (trabalho em equipe)

## Objetivo
Fazer a **configuração compartilhada** funcionar para o time: um contrato versionado
(`.env.example`), um **procedimento de onboarding** e uma verificação automática que
falha **antes** do servidor subir.

> Cenário: um colega novo entra no time, o `.env` local não existe (ou está fora de
> sincronia com o `.env.example` atualizado) e alguém "resolve" o problema
> **apagando o arquivo local** (`git rm .env`) — que na prática quebra a máquina de
> todo mundo e ainda pode vazar o segredo no histórico.

---

## O que foi construído

### 1. `.env.example` como contrato do time
Documentado no próprio arquivo: como copiar, a regra de não versionar `.env*`
reais, o marcador `# opcional` (dispensa a variável) e a obrigação de **vazio ou
placeholder** para segredos.

### 2. `scripts/check-env.ts` (verificação, sem ler `process.env`)
```
  1. existe o arquivo do ambiente-alvo (.env.dev por padrão, --ambiente=producao → .env.prod)
  2. toda variável do .env.example existe preenchida no arquivo local
  3. .env.example NÃO traz valor que pareça real
     (segredo preenchido ou prefixo sk_live_/ghp_/xox…/AKIA…/-----BEGIN)
  4. nenhum .env* real está versionado no Git (git ls-files)
```
Saída: lista de **variáveis faltando** por arquivo, avisos para variável local
desconhecida, e `exit 1` em caso de problema.

### 3. Hook `predev`
```json
"predev": "npm run check:env",
"check:env": "node -r ts-node/register scripts/check-env.ts"
```
`npm run dev` passa a **falhar na verificação**, sem chegar a abrir o servidor.

### 4. Type-check de `scripts/`
`tsconfig.scripts.json` (`npm run typecheck`) — o `tsconfig.json` principal só
inclui `src/`, então o script precisava do próprio projeto de checagem.

---

## Reproduções (sandbox Git em `temp/exercicio-09/sandbox`)

Um repositório de fazenda com um commit contendo apenas `.env.example` + `.gitignore`
— exatamente o que um `git clone` entrega para o colega novo.

### Cenário 1 — colega acabou de clonar (não tem ambiente local)
```
[check-env] .env.example declara 4 variáveis
[check-env] FALHOU
  problema: nenhum arquivo de ambiente local encontrado. Copie o exemplo e preencha:
      cp .env.example .env
      cp .env.example .env.dev
      cp .env.example .env.prod
EXIT=1
```

### Cenário 2 — copiou o exemplo e preencheu
```
[check-env] .env.dev: 4/4 variáveis presentes
[check-env] OK
  ambiente local pronto para o time (sem valores reais no exemplo, sem .env versionado)
EXIT=0
```

### Cenário 3 — versionou o arquivo real por engano
O `.gitignore` **bloqueou** o `git add` (primeira camada de proteção); forçando com
`-f`, o check pega:
```
[check-env] FALHOU
  problema: arquivo de ambiente REAL está versionado: .env.dev
      Desfaça com: git rm --cached <arquivo>   (o valor continua no histórico: rotacione a chave!)
EXIT=1
```
Depois de `git rm --cached`, o check volta a **OK** e `git log` confirma que o
segredo **nunca entrou em commit**.

### Cenário 4 — falta uma variável no `.env.dev` do colega
```
[check-env] FALHOU
  problema: .env.dev está incompleto — variáveis faltando:
      - DB_HOST (não existe em .env.dev)
EXIT=1
```

### Cenário 5 — alguém "ajudou" e deixou a chave real no exemplo
```
[check-env] FALHOU
  problema: .env.example:5 "API_KEY" tem valor que parece REAL.
            No exemplo, segredos ficam vazios ou como placeholder.
EXIT=1
```

### Cenário 6 — duas pessoas mexendo no `.env.example`
`feat-log` adiciona `LOG_LEVEL`, `fix-host` edita a linha do `DB_HOST`:
```
Auto-merging .env.example
CONFLICT (content): Merge conflict in .env.example
--- git status ---
UU .env.example
DB_HOST=localhost # apontar para o banco local do time
<<<<<<< HEAD
=======
LOG_LEVEL=debug
>>>>>>> feat-log
```

**6a — a resolução errada (a do enunciado): apagar o arquivo local**
```
[check-env] FALHOU
  problema: nenhum arquivo de ambiente local encontrado. Copie o exemplo e preencha:
```
O `.env.dev` do colega foi recriado a partir do exemplo — **os valores reais
dele foram perdidos** e o `git rm`/remoção local **não tem como desfazer**: o
arquivo nunca esteve no repositório.

**6b — a resolução correta: união das duas alterações**
```
PORT=3000
DB_HOST=localhost # apontar para o banco local do time
LOG_LEVEL=debug
[check-env] .env.example declara 5 variáveis
[check-env] .env.dev: 4/5 variáveis presentes
[check-env] OK
```
`LOG_LEVEL` está no exemplo com o marcador `# opcional`, então o `.env.dev` do
colega (que ainda não tem a variável) continua válido — e o check avisa:
```
  aviso: .env.example declara LOG_LEVEL — versione o exemplo para o time
```

### Cenário 7 — hook `predev` bloqueando a subida
Com `.env.dev` movido para fora (simulando o colega que não configurou):
```
> pratica-dotenv@1.0.0 predev
> node -r ts-node/register scripts/check-env.ts
[check-env] FALHOU
  problema: .env.dev não existe — é o arquivo do ambiente que este projeto carrega.
      cp .env.example .env.dev   e preencha os valores.
EXIT=1
```
O `npm run dev` **não chega a iniciar o servidor**.

---

## Procedimento documentado (onboarding)

```bash
git clone <repo> && cd pratica-dotenv
npm install
cp .env.example .env.dev          # produção: .env.prod
# preencha DB_HOST, DB_PASSWORD e API_KEY com os valores fornecidos pelo time
npm run check:env                 # ou simplesmente: npm run dev (roda o predev)
```

Regras para quem mexe no contrato:
1. variável nova **entra** no `.env.example` (valor vazio se for segredo);
2. se for opcional, marque a linha de cima com `# opcional`;
3. **nunca** adicione valores reais ao exemplo;
4. **nunca** resolva divergência apagando o `.env` local (`git rm`, remoção de
   arquivo, `git add -f .env*`);
5. em conflito de merge, resolva o exemplo como **união** das chaves e rode
   `npm run check:env` antes de commitar.

---

## Perguntas orientadoras (respostas)

**Qual o maior risco ao compartilhar um arquivo de configuração?**
Um arquivo de ambiente compartilhado vaza **segredos** assim que entra no
histórico (e `git rm` posterior não remove nada do histórico). O contrato
compartilhado seguro é o **modelo sem valores** + verificação automática.

**Um `.env` no `.gitignore` é suficiente para o time?**
Não: ignorer impede `git add`, mas não impede `git add -f`, `git commit -a`
em arquivo já rastreado, backup em outro lugar, nem que o arquivo **suma** da
máquina do colega. Por isso existe o `check-env` (hook `predev`) e o procedimento
escrito.

**O que acontece quando duas pessoas editam o arquivo de exemplo?**
Conflito de merge é **inevitável** e não é um problema: o `.env.example` é texto,
então a resolução é a **união** das chaves. O problema aparece quando alguém
"resolve" removendo o arquivo local — o check detecta (o arquivo some) e o valor
real é perdido.

**Por que `.env.example` e não `.env.example.example`/README?**
Porque ele é **executável** pelo onboarding (`cp`) e **verificável** por
script; um README não pode ser validado automaticamente contra o ambiente real.

---

## Aprendizados
- `.gitignore` é a primeira camada, mas `git add -f` burla; a verificação
  automatizada é a segunda.
- Um verificador de ambiente precisa ser **rápido e silencioso quando está tudo
  certo** (hook `predev`) e **específico quando falha** (nome do arquivo + chave).
- Detectar "o arquivo local sumiu" é tão importante quanto detectar chave faltando.
- Conflito no exemplo se resolve por **união de chaves**, nunca por remoção.
- Um marcador simples (`# opcional`) no exemplo evita obrigar o time inteiro a
  preencher variável dispensável.