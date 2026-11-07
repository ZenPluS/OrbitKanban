// Loading screen script. The portable launcher shows this page with the Windows HTML engine (IE11 mode) while it unpacks
// the app, before Chromium exists, so it is plain ES5: no let/const, arrow functions, classes or URLSearchParams.
(function () {
  'use strict';
  var WIDTH = 520;
  var THEME = /^(?:file:\/\/\/[^"'<>\\\s]+\/)?splash-theme\.css$/;
  var VERSION = /^[\w.+-]{1,32}$/;

  // Electron passes the parameters in the query string; the launcher passes them in the hash.
  function readParameters() {
    var result = {}, sources = [window.location.search, window.location.hash], i, j, pairs, separator;
    for (i = 0; i < sources.length; i++) {
      pairs = (sources[i] || '').replace(/^[?#]/, '').split('&');
      for (j = 0; j < pairs.length; j++) {
        separator = pairs[j].indexOf('=');
        if (separator < 1) continue;
        try { result[decodeURIComponent(pairs[j].slice(0, separator))] = decodeURIComponent(pairs[j].slice(separator + 1)); } catch (error) {}
      }
    }
    return result;
  }

  // The launcher window is sized in physical pixels and the HTML engine does not scale the page, so the stage is zoomed to fit.
  function scaleStyle() {
    var width = window.innerWidth || document.documentElement.clientWidth, scale = width / WIDTH;
    return width && Math.abs(scale - 1) > 0.01 ? '<style>.splash { zoom: ' + scale.toFixed(4) + '; }</style>' : '';
  }

  function showVersion(version) {
    var element = document.getElementById('splash-version');
    if (element && VERSION.test(version || '')) element.textContent = 'Portable \u00b7 v' + version;
    return Boolean(element);
  }

  var parameters = readParameters();
  // Written while the head is parsed, so the theme and the scale apply before the first paint in both engines.
  document.write((THEME.test(parameters.theme || '') ? '<link rel="stylesheet" href="' + parameters.theme + '">' : '') + scaleStyle());
  if (!showVersion(parameters.version)) {
    document.addEventListener('DOMContentLoaded', function () { showVersion(parameters.version); });
  }
  function ignore(event) {
    if (event.preventDefault) event.preventDefault();
    return false;
  }
  document.oncontextmenu = ignore;
  document.ondragstart = ignore;
  document.onselectstart = ignore;
}());
