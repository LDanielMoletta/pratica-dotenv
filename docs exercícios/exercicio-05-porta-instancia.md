# Exercício 5 - Porta: padrão explícito, porta real e duas instâncias

## Objetivo
Definir a porta com **padrão explícito** (não depender de `||`), **validar** o
valor, imprimir a **porta real** em que o servidor atendeu (`server.address()`) e
tratar **porta ocupada** (`EADDRINUSE`) com mensagem legível — inclusive ao subir
uma segunda instância.

---

## Código original (com o problema intencional)
`temp/exercicio-05-original-server.ts`:
```typescript
const port = process.env.PORT || 3000;   // PROBLEMA: '' e 'abc' entram por aqui
app.listen(port, () => {
  console.log('servidor no ar');         // não diz a porta real; sem tratar erro
});
```

---

## Registro da investigação (runner `temp/run-buggy-05.js`)

**Sintomas capturados:**
```
== A) PORT ausente ==
  servidor subiu, /health: {"ok":true,"port":3000} | saida: servidor no ar
== B) PORT="" (texto vazio) -> || aplica 3000 SILENCIOSAMENTE ==
  /health: {"ok":true,"port":3000} (mesmo 3000, sem nenhum aviso sobre o vazio)
== C) PORT=4000 ==
  /health: {"ok":true,"port":"4000"}          <- porta voltou como STRING
== E) PORT=abc (texto que NÃO é porta) ==
  saida do servidor: "servidor no ar"
  /health em localhost:3000 -> NÃO responde (não subiu em TCP!)
== D) duas instâncias na porta 3000 ==
  primeira: /health {"ok":true,"port":3000}
  segunda (sem tratamento de erro):
    exit = 0
    s2._out = "servidor no ar"
    s2._err = ""
```

**Hipóteses / explicações:**
1. `process.env.PORT || 3000` trata **string vazia como falsa** → cai em `3000`
   **sem avisar** que a variável foi definida como vazia.
2. `PORT=abc` é **truthy** → vai direto para `app.listen('abc')`. No **Windows**,
   um nome não numérico vira **named pipe** (`\\.\pipe\abc`), então o servidor
   "sobe" mas **não atende em TCP** — o sintoma mais enganoso.
3. Sem conversão, a porta percorre o código como **string** (`"4000"` na resposta).
4. Sem tratamento de `error`, uma segunda instância **não dá erro legível** (na
   máquina testada o erro foi engolido/indefinido).

**Comparação com HTTP puro (sem handler de erro):** ali o comportamento é o
"esperado" — e assustador:
```
Error: listen EADDRINUSE: address already in use :::3000
    at Server.setupListenHandle ...
    code: 'EADDRINUSE', port: 3000
exit 1
```
Ou seja: sem tratamento, ou você recebe um **stack trace crua**, ou (com Express no
Windows) o erro é **silenciado** — nunca uma mensagem útil.

**Descoberta específica do Windows (Node 24):** em uma segunda instância na mesma
porta, `app.listen` dispara os eventos **`listening` E `error`** (`EADDRINUSE`) —
diferente do Unix, onde só `error` dispara. Um servidor que só loga "no ar" no
callback anuncia **sucesso falso** e depois falha.

---

## Correção aplicada

**`src/config.ts` (porta validada e convertida):**
```typescript
PORT: Joi.number().empty('').integer().min(0).max(65535).default(3000)
```
- ausente/vazia → padrão explícito `3000` (documentado);
- `abc` → **erro de validação** (a aplicação nem sobe);
- faixa `0..65535` garantida; valor final é `number`.

**`src/server.ts` (porta real + `EADDRINUSE` determinístico):**
```typescript
const server = app.listen(config.port);
let falhou = false;

server.on('listening', () => {
  const address = server.address();
  const portaReal =
    typeof address === 'object' && address !== null ? address.port : config.port;
  app.locals.port = portaReal;
  setImmediate(() => {
    if (falhou) return;   // evita anunciar sucesso quando veio erro junto (Windows)
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
```
- imprime a **porta real** via `server.address()` (importante quando `PORT=0`);
- mensagem legível e **exit 1** em porta ocupada (sem stack trace);
- sucesso adiado para `setImmediate` para não competir com o `error` do Windows.

---

## Verificação (`src/teste-exercicio-05.ts` — `npm run test:ex5`)

```
== A) PORT ausente -> padrão explícito 3000 ==      [OK] A.1 /health responde {"ok":true,"port":3000,"env":"development"}
                                                    [OK] A.2 porta é número 3000: typeof=number
== B) PORT=4000 -> usa 4000 ==                      [OK] B.1 /health responde em 4000
== C) PORT="" -> tratado como não definido (3000) == [OK] C.1 cai no padrão 3000
== D) PORT=abc -> NÃO sobe (falha de validação) ==  [OK] D.1 exit=1 / D.2 - "PORT" must be a number
== E) PORT=0 -> porta efêmera ==                    [OK] E.1 porta real=62330 / E.2 /health na porta real
== F) duas instâncias na MESMA porta (4567) ==      [OK] F.1 primeira sobe
                                                    [OK] F.2 segunda exit=1
                                                    [OK] F.3 ERRO: porta 4567 já está em uso (EADDRINUSE). Não foi possível iniciar.
                                                    [OK] F.4 primeira continua saudável

RESULTADO: 12/12 verificações OK
```

---

## Aprendizados
- `|| 3000` mascara `''`; use **validação com padrão explícito** (e `.default()`).
- `PORT=abc` não "só falha": no Windows vira **named pipe** e engana ("sobe" sem
  atender TCP). Validar faixa/numérico evita isso.
- `server.address().port` é a **porta real** (essencial com `PORT=0`).
- Sempre tratar `server.on('error')`: `EADDRINUSE` deve virar mensagem legível + exit 1.
- No Windows/Node 24, `app.listen` pode emitir `listening` **e** `error`; não anuncie
  sucesso cegamente no callback.
- Testar com **harness** (subir, consultar `/health`, medir exit code) dá evidência
  reprodutível em vez de "na minha máquina roda".
