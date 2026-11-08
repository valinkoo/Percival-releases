/**
 * Server address rules.
 *
 * The WebView's Content-Security-Policy (src-tauri/tauri.conf.json) only lets the app talk to
 * localhost and to Tailscale hostnames, so the same rules are checked here to give a clear
 * French message instead of an opaque network error.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type ServerUrlResult = { ok: true; url: string } | { ok: false; message: string };

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

export function parseServerUrl(raw: string): ServerUrlResult {
  let value = raw.trim();
  if (value === '') {
    return { ok: false, message: "Indiquez l'adresse du serveur." };
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const host = value.split(/[/:]/)[0]?.toLowerCase() ?? '';
    value = `${isLocalHost(host) ? 'http' : 'https'}://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "L'adresse du serveur n'est pas valide." };
  }

  const local = isLocalHost(url.hostname);
  if (url.protocol === 'http:' && !local) {
    return {
      ok: false,
      message: "L'adresse doit commencer par https:// (http:// est réservé à localhost).",
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: "L'adresse du serveur n'est pas valide." };
  }
  if (!local && !url.hostname.endsWith('.ts.net')) {
    return {
      ok: false,
      message:
        "Utilisez l'adresse Tailscale de votre serveur (se termine par .ts.net) ou localhost.",
    };
  }

  return { ok: true, url: url.origin };
}
