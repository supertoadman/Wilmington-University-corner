// GitHub adapter: turns a planned submission into a pull request.
// Uses the REST API with fetch only (no SDK), so it runs anywhere fetch exists.
//
// Needs a token that can write to the repository:
//   fine-grained personal access token, scoped to this repository only, with
//   "Contents: Read and write" and "Pull requests: Read and write".

const API = 'https://api.github.com';

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function githubAdapter({ token, repo, branch = 'main', label = 'submission' }) {
  if (!token || !repo) throw new Error('githubAdapter needs a token and a repo ("owner/name").');

  async function gh(method, path, body) {
    const res = await fetch(`${API}/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'study-library-submissions',
        ...(body && { 'content-type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
    });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  const enc = encodeURIComponent;
  const contentsPath = (p) => p.split('/').map(enc).join('/');

  return {
    async listSubjects() {
      const items = (await gh('GET', `/contents/content?ref=${enc(branch)}`)) || [];
      return items.filter((i) => i.type === 'dir' && !i.name.startsWith('.') && !i.name.startsWith('_')).map((i) => i.name);
    },

    async listFiles(folder) {
      const items = (await gh('GET', `/contents/${contentsPath(`content/${folder}`)}?ref=${enc(branch)}`)) || [];
      return items.map((i) => i.name);
    },

    /** One commit on a new branch, then a pull request against the main branch. */
    async commit(plan) {
      const ref = await gh('GET', `/git/ref/heads/${enc(branch)}`);
      const baseSha = ref.object.sha;
      const baseCommit = await gh('GET', `/git/commits/${baseSha}`);

      const tree = [];
      for (const f of plan.files) {
        const blob = await gh('POST', '/git/blobs', { content: b64(f.bytes), encoding: 'base64' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await gh('POST', '/git/trees', { base_tree: baseCommit.tree.sha, tree });
      const commit = await gh('POST', '/git/commits', { message: plan.commitMessage, tree: newTree.sha, parents: [baseSha] });
      await gh('POST', '/git/refs', { ref: `refs/heads/${plan.branch}`, sha: commit.sha });

      const pr = await gh('POST', '/pulls', { title: plan.title, head: plan.branch, base: branch, body: plan.body, maintainer_can_modify: true });
      // Labels are a convenience; a failure here shouldn't fail the submission.
      try { await gh('POST', `/issues/${pr.number}/labels`, { labels: [label] }); } catch { /* ignore */ }
      return { review: pr.html_url };
    },
  };
}
