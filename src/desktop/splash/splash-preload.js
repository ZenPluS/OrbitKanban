'use strict';
// Only the version changes between builds: it arrives in the query string, so the page needs no script of its own.
window.addEventListener('DOMContentLoaded', () => {
  const version = new URLSearchParams(window.location.search).get('version');
  if (version && /^[\w.+-]{1,32}$/.test(version)) document.getElementById('splash-version').textContent = `Portable · v${version}`;
});
