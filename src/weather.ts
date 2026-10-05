// src/weather.ts
// Exercício 7 - Chaves de API corrigidas:
//  - a credencial vem do módulo de configuração (validada na subida);
//  - viaja em CABEÇALHO (Authorization), nunca em parâmetro de URL;
//  - não aparece no log, na mensagem de erro nem na resposta;
//  - quando é preciso citar a chave, usa-se mask() (só os últimos 4 caracteres).
import { config } from './config';

// API FICTÍCIA do exercício (endpoint fixo, não é configuração de ambiente).
const BASE = new URL('http://localhost:4010');

export interface Clima {
  cidade: string;
  temperatura: number;
  unidade: string;
}

/** Mostra o bastante para identificar a chave em uso, sem revelá-la. */
export function mask(secret: string): string {
  if (secret.length <= 4) {
    return '****';
  }
  return `****${secret.slice(-4)}`;
}

export async function getWeather(city: string): Promise<Clima> {
  const url = new URL('/v1/weather', BASE);
  url.searchParams.set('city', city);

  // log SEM a credencial: só o endpoint, a cidade e um identificador mascarado
  console.log(
    `[weather] GET ${url.origin}${url.pathname} | cidade: ${city} | credencial: ${mask(config.api.key)}`,
  );

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${config.api.key}` },
  });

  if (!response.ok) {
    // diagnóstico útil (status + corpo) SEM a credencial
    const corpo = (await response.text()).slice(0, 200);
    console.error(
      `[weather] falha na API | status=${response.status} | corpo=${corpo} | credencial=${mask(config.api.key)}`,
    );
    throw new Error(
      `falha na API: ${response.status} (credencial ${mask(config.api.key)} rejeitada)`,
    );
  }

  return (await response.json()) as Clima;
}