# Exercício 7 - Chaves de API: segredo no código x segredo no ambiente

## Objetivo
Tirar a chave de API do código-fonte, eliminá-la dos três pontos em que aparecia
(log, URL, mensagem de erro), fazê-la viajar em **cabeçalho**, falhar na subida
quando faltar e **mascarar** quando for preciso citar a chave.

> Continuação do projeto dos exercícios 1 a 5: a chave passa a vir do módulo de
> configuração (`src/config.ts`), que já a trata como obrigatória.

---

## Os três pontos de exposição (no código original)

`temp/exercicio-07/weather-original.ts`:
```typescript
const API_KEY = process.env.API_KEY || 'sk_live_9f2a8c1d4b7e';
export async function getWeather(city: string) {
  const url = `https://api.exemplo.com/v1/weather?city=${city}&key=${API_KEY}`; // (2)
  console.log('chamando:', url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`falha na API: ${response.status} - chave ${API_KEY}`);       // (3)
  }
  return response.json();
}
```

| # | Ponto de exposição | Quem enxerga |
|---|--------------------|--------------|
| 1 | **Valor padrão embutido no código** (`'sk_live_9f2a8c1d4b7e'`) | todo mundo com acesso ao repositório, **para sempre** (histórico) |
| 2 | **Parâmetro de URL** (`?key=...`) | log de acesso do provedor, proxy/CDN, APM, histórico, `Referer` |
| 3 | **Mensagem de erro** (`falha na API: 401 - chave sk_live_...`) | monitoramento/alertas, ticket, quem lê o erro |

**Por que o valor padrão é pior que a ausência:** ele **funciona**. A aplicação
sobe, o teste passa, ninguém percebe que a variável não está configurada — e a
chave segue no código-fonte. Sem o padrão, a falha aparece imediatamente no
primeiro `npm start`.

---

## Registro da investigação

### Cenário A — `API_KEY` ausente, mas existe valor padrão (provedor legado aceita query)

**Sintoma:** a chamada **funciona** e ninguém percebe que a variável não foi
configurada. **Evidência** (`temp/exercicio-07/run-buggy-07.js`):

```
--- cliente (saida) ---
chamando: http://localhost:4010/v1/weather?city=Curitiba&key=sk_live_9f2a8c1d4b7e
resultado: {"cidade":"Curitiba","temperatura":21,"unidade":"C"}
--- LOG DO PROVEDOR (o que um terceiro enxerga) ---
[mock-api] URL recebida: /v1/weather?city=Curitiba&key=sk_live_9f2a8c1d4b7e
>>> a chave aparece na URL registrada pelo provedor? SIM
>>> o cliente avisou que usou o valor padrão? NAO (nenhum aviso na saída)
```

**Resultado esperado:** sem chave no ambiente, a aplicação **não deve subir**.
**Resultado obtido:** funcionou, e a chave foi parar no log de um terceiro.
**Hipótese:** o `||`.transforma "variável ausente" em "valor secreto no código" e
a query string leva a credencial para onde a requisição é registrada.
**Investigação:** leitura do trecho + reprodução contra uma API fictícia local
(`temp/exercicio-07/mock-api.ts`) que registra o que um provedor registraria.
**Causa:** segredo no código **e** na URL.

### Cenário B — chave rotacionada no provedor (401)

```
--- cliente (erro) ---
ERRO propagado: falha na API: 401 - chave sk_live_9f2a8c1d4b7e
>>> a credencial completa aparece na MENSAGEM DE ERRO? SIM
```

**Causa encontrada:** a mensagem de erro transporta a credencial — e mensagem de
erro é o que vai para o monitoramento.

---

## Correção aplicada (`src/weather.ts`)

```typescript
import { config } from './config';            // a chave vem daqui, já validada

export function mask(secret: string): string {
  if (secret.length <= 4) return '****';
  return `****${secret.slice(-4)}`;           // só o bastante para identificar
}

const url = new URL('/v1/weather', BASE);
url.searchParams.set('city', city);                       // cidade na URL...
console.log(`[weather] GET ${url.origin}${url.pathname} | cidade: ${city} | credencial: ${mask(config.apiKey)}`);

const response = await fetch(url, {
  headers: { authorization: `Bearer ${config.apiKey}` },  // ...credencial no CABEÇALHO
});

if (!response.ok) {
  const corpo = (await response.text()).slice(0, 200);
  console.error(`[weather] falha na API | status=${response.status} | corpo=${corpo} | credencial=${mask(config.apiKey)}`);
  throw new Error(`falha na API: ${response.status} (credencial ${mask(config.apiKey)} rejeitada)`);
}
```

- **valor embutido removido**: `API_KEY` é obrigatória no `config` (exercício 4) —
  se faltar, a aplicação **não sobe**;
- **cabeçalho `Authorization: Bearer`** em vez de query string;
- **log** com endpoint, cidade e credencial mascarada;
- **erro** com status + corpo + identificador mascarado (diagnóstico útil sem
  credencial);
- **sem chave na resposta da API**.

---

## Verificação (cenários mínimos)

### Cenário C — `API_KEY` definida, chamada funciona e nada vaza
```
--- cliente (saida) ---
[weather] GET http://localhost:4010/v1/weather | cidade: Curitiba | credencial: ****0000
resultado: {"cidade":"Curitiba","temperatura":21,"unidade":"C"}
--- LOG DO PROVEDOR ---
[mock-api] URL recebida: /v1/weather?city=Curitiba
[mock-api] cabeçalho de credencial: PRESENTE
>>> chave completa na saida do cliente? nao
>>> chave completa no log do provedor? nao
```

### Cenário D — resposta 401
```
--- cliente (erro) ---
[weather] falha na API | status=401 | corpo={"erro":"credencial inválida"} | credencial=****0000
ERRO propagado: falha na API: 401 (credencial ****0000 rejeitada)
exit do cliente: 1
>>> chave completa na mensagem de erro? nao
>>> erro identifica a chave de forma mascarada? SIM
```

### Cenário E — `API_KEY` ausente (com `.env.dev` sem a chave)
```
Error: configuração inválida na subida:
 - "API_KEY" is required
EXIT=1
```
Não há mais "rede de segurança" no código: a falha é na subida.

### Cenário F — log completo da execução
Nenhuma linha (cliente, provider ou erro) permite reconstruir a chave: só
`****0000`.

---

## Comparação pedida: chave no código x chave no ambiente

| Pergunta | Chave no código | Chave no ambiente |
|----------|-----------------|-------------------|
| Trocar a chave exige o quê? | editar o código, **commit** e novo deploy;Developers revisam por engano | editar o arquivo de ambiente e **reiniciar**; nenhum commit, nenhum diff de código |
| Quem consegue lê-la? | qualquer pessoa/ferramenta com acesso ao repositório — **e o histórico para sempre** | quem tem acesso ao servidor/arquivo de ambiente (segredos do CI, vault); devs só veem o exemplo |
| Dois ambientes, duas chaves? | precisa de `if`/constantes por ambiente no código; mistura fácil | um arquivo por ambiente; a troca é invisível no repositório |
| Se vazar, o que acontece? | está em todo clone e em toda ferramenta que indexa o repositório; remover o arquivo **não** resolve | a exposição é pontual (arquivo/servidor); basta **rotacionar** a chave |
| Falha de configuração | silenciosa (o padrão faz o serviço "funcionar") | imediata e nomeada na subida |
| Rastro em log/erro | fácil (query string e mensagem) | controlado (cabeçalho + máscara) |

**Passos para trocar a chave em cada cenário:**
- no código: 6 passos (editar, revisar, commitar, abrir MR, publicar imagem,
  reiniciar);
- no ambiente: 2 passos (editar o `.env`/secret do CI, reiniciar) — **sem
  passar por revisão de código**.

---

## Perguntas orientadoras (respostas)

**Por que um segredo em parâmetro de URL é mais arriscado que em cabeçalho?**
A URL é *dado de navegação*: entra em log de acesso do servidor, proxy, CDN,
histórico do navegador, `Referer` e traces de APM. O cabeçalho de autorização é
propositalmente omitido desses registros.

**O que torna um valor padrão perigoso justamente por funcionar?** Ele converte um
erro de configuração (visível) em sucesso (invisível). A aplicação parece saudável
enquanto usa uma credencial que ninguém gerencia.

**Por que mascarar é diferente de esconder?** Esconder impede a auditoria;
mascarar mantém a capacidade de **identificar** qual credencial está em uso
(`****0000`) sem revelar o segredo. `mask()` é o meio-termo: diagnóstico
preservado, exposição eliminada.

---

## Quando uma chave é exposta por engano

1. **Rotacionar/revogar** imediatamente a credencial (não basta apagar o código).
2. **Verificar os registros** que podem tê-la guardado: log do provedor, APM,
   proxy/CDN, histórico do repositório.
3. **Tratar como compromiseada**: não "validar depois" — a leitura já aconteceu.
4. Reescrever o histórico (BFG/`filter-repo`) **além** da rotação.
5. Registrar o incidente e avisar quem possa ter visto (equipe, auditoria).

*(Registramos o caso real deste projeto: a chave fictícia `sk_live_...` entrou no
commit `69d1221` e continua no histórico — ver exercício 3.)*