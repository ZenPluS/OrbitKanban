'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');

function repositoryFromRemote(remote) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)\/?$/.exec(remote);
  if (!match) throw new Error('The remote must be an HTTPS or SSH github.com repository without credentials in the URL.');
  return match[1].replace(/\.git$/, '');
}
function githubToken() {
  const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  if (token) return token;
  const credential = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, timeout: 30000
  });
  const password = credential.status === 0 && /^password=(.+)$/m.exec(credential.stdout || '')?.[1].trim();
  if (!password) throw new Error('GitHub access is unavailable: configure Git Credential Manager or GH_TOKEN/GITHUB_TOKEN with Contents write access. Do not store tokens in the repository.');
  return password;
}
function githubClient(token, fetchImpl = fetch) {
  return async (endpoint, { method = 'GET', body, bytes, allow404 = false } = {}) => {
    const url = new URL(endpoint, 'https://api.github.com');
    if (!['https://api.github.com', 'https://uploads.github.com'].includes(url.origin)) throw new Error("The GitHub API destination is not allowed.");
    const response = await fetchImpl(url, {
      method, redirect: 'error', signal: AbortSignal.timeout(bytes ? 300000 : 60000),
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'OrbitKanban-build',
        ...(bytes ? { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) } : body ? { 'Content-Type': 'application/json' } : {})
      },
      body: bytes || (body ? JSON.stringify(body) : undefined)
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${url.pathname}: HTTP ${response.status}. Check permissions and connection; the release is incomplete.`);
    return response.status === 204 ? null : response.json();
  };
}
async function checkRepository(repo, request) {
  const info = await request(`/repos/${repo}`);
  if (!info.permissions?.push) throw new Error(`You do not have write access to ${repo}.`);
  return info;
}
async function releaseAssets(repo, releaseId, request) {
  const assets = [];
  for (let page = 1; ; page++) {
    const batch = await request(`/repos/${repo}/releases/${releaseId}/assets?per_page=100&page=${page}`);
    assets.push(...batch);
    if (batch.length < 100) return assets;
  }
}
function verifiedAsset(asset, size, digest) {
  return asset?.state === 'uploaded' && asset.size === size && asset.digest?.toLowerCase() === `sha256:${digest}`;
}
function releaseNotes(body, commit, digest) {
  const begin = '<!-- orbitkanban-build:start -->', end = '<!-- orbitkanban-build:end -->';
  const note = `${begin}\n### Verified portable build\n\n- Commit: ${commit}\n- Syntax, unit, source UI, packaged UI and portable launcher tests passed.\n- SHA-256 (\`OrbitKanban-Portable.exe\`): \`${digest}\`\n\nClose the app and replace the executable, keeping the existing \`data\` folder.\n${end}`;
  const existing = body || '', start = existing.indexOf(begin), stop = existing.indexOf(end, start);
  return start >= 0 && stop >= start ? existing.slice(0, start) + note + existing.slice(stop + end.length) : `${existing.trim()}\n\n${note}`.trim();
}
async function publishRelease({ repo, tag, commit, tree, assetPath }, request) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || !/^[a-f0-9]{40,64}$/.test(commit) || !/^[a-f0-9]{40,64}$/.test(tree)) throw new Error('Invalid Git tag, commit, or tree.');
  if (path.basename(assetPath) !== 'OrbitKanban-Portable.exe') throw new Error('Invalid portable executable name.');
  const tagged = await request(`/repos/${repo}/commits/${tag}`);
  if (tagged.commit?.tree?.sha !== tree) throw new Error(`Tag ${tag} does not contain the tested sources: increment the version instead of moving the existing tag.`);
  const bytes = await fs.readFile(assetPath);
  if (!bytes.length) throw new Error('The executable is empty.');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const name = path.basename(assetPath), base = `/repos/${repo}/releases`;
  let release = await request(`${base}/tags/${tag}`, { allow404: true });
  if (!release) {
    release = await request(base, { method: 'POST', body: {
      tag_name: tag, target_commitish: commit, name: `OrbitKanban ${tag.slice(1)}`,
      draft: true, prerelease: false, generate_release_notes: true
    } });
  }
  const existing = (await releaseAssets(repo, release.id, request)).find(asset => asset.name === name);
  if (!verifiedAsset(existing, bytes.length, digest)) {
    if (release.immutable) throw new Error(`Release ${tag} is immutable: increment the version to publish this build.`);
    // Keep the previous download until its replacement has been uploaded and verified.
    const uploadName = `OrbitKanban-Portable-${randomUUID()}.exe`;
    const uploaded = await request(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${uploadName}`, { method: 'POST', bytes });
    const verified = await request(`${base}/assets/${uploaded.id}`);
    if (!verifiedAsset(verified, bytes.length, digest)) {
      await request(`${base}/assets/${uploaded.id}`, { method: 'DELETE' });
      throw new Error('The GitHub asset checksum or size does not match. The release is incomplete.');
    }
    if (existing) await request(`${base}/assets/${existing.id}`, { method: 'DELETE' });
    await request(`${base}/assets/${uploaded.id}`, { method: 'PATCH', body: { name } });
  }
  if (!release.immutable) {
    release = await request(`${base}/${release.id}`, { method: 'PATCH', body: { draft: false, body: releaseNotes(release.body, commit, digest) } });
  }
  const published = await request(`${base}/tags/${tag}`);
  const finalAsset = (await releaseAssets(repo, published.id, request)).find(asset => asset.name === name);
  if (published.draft || published.tag_name !== tag || !verifiedAsset(finalAsset, bytes.length, digest)) throw new Error('The release or executable could not be verified after publishing.');
  return { url: published.html_url, assetUrl: finalAsset.browser_download_url, sha256: digest };
}
async function main() {
  const { values } = parseArgs({ options: {
    remote: { type: 'string' }, check: { type: 'boolean' }, tag: { type: 'string' },
    commit: { type: 'string' }, tree: { type: 'string' }, asset: { type: 'string' }
  } });
  const repo = repositoryFromRemote(values.remote || '');
  const request = githubClient(githubToken());
  await checkRepository(repo, request);
  if (values.check) console.log(`GitHub access verified: ${repo}`);
  else {
    if (!values.asset) throw new Error('Specify --asset.');
    console.log(JSON.stringify(await publishRelease({ repo, tag: values.tag, commit: values.commit, tree: values.tree, assetPath: values.asset }, request)));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { repositoryFromRemote, githubClient, checkRepository, publishRelease, releaseNotes };
