// Lancement de la synchronisation du catalogue depuis Réglages.
// Sans jeton : un lien vers la page GitHub du workflow. Avec un jeton personnel (fine-grained, limité à ce dépôt,
// droit « Actions : lecture et écriture »), l'application lance le workflow elle-même et suit son avancement.
// Le jeton reste dans ce navigateur (clé séparée, jamais exporté avec la progression).
export const REPO = 'antoniman31/Chrono-MCU';
export const WORKFLOW = 'catalog-sync.yml';
export const ACTIONS_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;
export const TOKEN_KEY = 'chrono-mcu:gh-token';
const API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;

export const validToken = (t) => typeof t === 'string' && /^(github_pat_|ghp_)[A-Za-z0-9_]{20,250}$/.test(t.trim());

export function loadToken(storage) {
  try {
    const t = storage?.getItem(TOKEN_KEY);
    return validToken(t) ? t.trim() : null;
  } catch {
    return null;
  }
}

export function saveToken(storage, token) {
  try {
    if (token == null) storage.removeItem(TOKEN_KEY);
    else storage.setItem(TOKEN_KEY, token.trim());
    return true;
  } catch {
    return false;
  }
}

const headers = (token) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' });

const ERRORS = {
  401: 'Jeton refusé ou expiré : crée-en un nouveau.',
  403: 'Droit manquant : le jeton doit avoir « Actions : lecture et écriture » sur ce dépôt.',
  404: 'Dépôt ou workflow introuvable : le jeton est peut-être limité à un autre dépôt.',
  422: 'GitHub refuse ce lancement (le workflow n\'existe pas sur la branche main ?).',
};

// Lance le workflow sur main. Résultat : { ok: true } ou { ok: false, message }
export async function dispatchSync(token, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${API}/dispatches`, { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
    if (res.status === 204) return { ok: true };
    return { ok: false, message: ERRORS[res.status] ?? `GitHub a répondu ${res.status}.` };
  } catch {
    return { ok: false, message: 'GitHub est injoignable (réseau coupé ?).' };
  }
}

// Dernier lancement manuel démarré après `since` (ms) : { status, conclusion, url } ou null
export async function latestRun(token, since, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${API}/runs?event=workflow_dispatch&branch=main&per_page=5`, { headers: headers(token) });
    if (!res.ok) return null;
    const run = ((await res.json()).workflow_runs ?? []).find((r) => Date.parse(r.created_at) >= since - 10_000);
    return run ? { status: run.status, conclusion: run.conclusion ?? null, url: run.html_url } : null;
  } catch {
    return null;
  }
}

export function runLabel(run) {
  if (!run) return 'Lancement demandé, en attente de GitHub…';
  if (run.status !== 'completed') return run.status === 'queued' || run.status === 'pending' ? 'En file d\'attente chez GitHub…' : 'Synchronisation en cours…';
  return run.conclusion === 'success'
    ? 'Terminée. Si le catalogue a changé, une pull request en brouillon a été ouverte.'
    : `Terminée sans succès (${run.conclusion ?? 'inconnu'}) : ouvre le journal pour voir pourquoi.`;
}

export const isDone = (run) => run?.status === 'completed';
