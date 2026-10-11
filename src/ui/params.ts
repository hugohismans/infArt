/** Paramètres d'URL : ?seed=…&autowalk=1&debug=1&autostart=1&timescale=4 */
export interface UrlParams {
  seed: string | null;
  autoWalk: boolean;
  debug: boolean;
  autoStart: boolean;
  timeScale: number;
}

export function readUrlParams(): UrlParams {
  const q = new URLSearchParams(window.location.search);
  const flag = (k: string) => q.get(k) === '1' || q.get(k) === 'true';
  const ts = Number(q.get('timescale'));
  return {
    seed: q.get('seed')?.trim() || null,
    autoWalk: flag('autowalk'),
    debug: flag('debug'),
    autoStart: flag('autostart'),
    timeScale: Number.isFinite(ts) && ts > 0 ? Math.min(ts, 10) : 1,
  };
}

/** Lien partageable vers une visite. */
export function shareUrl(seed: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('seed', seed);
  return url.toString();
}
