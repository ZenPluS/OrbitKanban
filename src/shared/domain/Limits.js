'use strict';
// Size limits for highlights, tags and saved views.
(() => {
class Limits {
  static HIGHLIGHT_LIMIT = 16;
  static HIGHLIGHT_NAME_MAX = 60;
  static TAG_LIMIT = 100;
  static TAG_NAME_MAX = 60;
  static SAVED_VIEW_LIMIT = 30;
  static SAVED_VIEW_NAME_MAX = 60;
}

if (typeof module !== 'undefined') module.exports = Limits;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).Limits = Limits;
})();
