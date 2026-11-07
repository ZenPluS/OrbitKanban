'use strict';
// Classes shared by the main process, the web server and the renderer, grouped by namespace.
module.exports = {
  Domain: require('./domain'),
  Columns: require('./columns'),
  Interop: require('./interop'),
  Localization: require('./localization'),
  Guide: require('./guide'),
  Graphics: require('./graphics')
};
