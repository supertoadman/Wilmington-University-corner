// Cloudflare Worker entry point (free plan is plenty).
// Receives the website's "Share your work" form and opens a pull request.
//
// Configure (see docs/contributions-setup.md):
//   secret  GITHUB_TOKEN      fine-grained token for this repo only
//   var     GITHUB_REPO       "owner/name"
//   var     ALLOWED_ORIGIN    the site origin, e.g. https://supertoadman.github.io
//   secret  TURNSTILE_SECRET  optional, enables the "I am human" check
//
// To move off Cloudflare, call handleSubmit() from any platform that gives you a
// web-standard Request; nothing below is Cloudflare-specific except `export default`.

import { handleSubmit } from './core.mjs';
import { githubAdapter } from './github.mjs';

function cors(env, response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', env.ALLOWED_ORIGIN || '*');
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('vary', 'origin');
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(env, new Response(null, { status: 204 }));
    if (url.pathname === '/health') return cors(env, Response.json({ ok: true }));
    if (url.pathname !== '/submit') return cors(env, new Response('Not found', { status: 404 }));

    const origin = request.headers.get('origin');
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
      return cors(env, Response.json({ ok: false, error: 'Submissions are only accepted from the library website.' }, { status: 403 }));
    }
    const adapter = githubAdapter({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main' });
    return cors(env, await handleSubmit(request, { adapter, env }));
  },
};
