'use strict';
// Electron entry point (package.json "main").
const path = require('node:path');
const DesktopApplication = require('./DesktopApplication');

new DesktopApplication({ appRoot: path.join(__dirname, '..', '..') }).start();
