// Mutable state of the interface: workspace data, current view, filters, selection and pending operations.

export class AppState {
  columnFilters = { tasks: {}, issues: {} }; issueSearch = '';
  // Pages 0-3 are task, issue, milestone and kanban, 4 settings, 5 guide, 6 views, 7 group activities.
  standaloneView = null;
  data; dataFolder; view = 0; sectionId = ''; taskSectionId = ''; taskSectionViewId = ''; search = ''; showHidden = false; duplicatesOnly = false; issueDuplicatesOnly = false; statusFilter = ''; highlightFilter = ''; highlighter = ''; sort = [{ key: 'releaseDate', direction: 'asc' }];
  settingsDraft; settingsBase; saving = false; organizationBusy = false; organizations = []; activeOrganizationId; lastOpenedLink = '';
  revision = ''; appVersion = ''; browserUrl = ''; online = true; refreshing = false; pendingChange = null; renderAfterModal = false; adoptions = 0; subscribed = false;
  HISTORY_LIMIT = 20; undoHistory = new Map(); redoHistory = new Map();
  activeSavedViewId = ''; backupRequest = 0;
  languageInfo = { folder: '', template: '', languages: [], errors: [] };
  milestoneDay = '';
  updateState = { supported: false, phase: 'idle', autoCheck: true, version: '', percent: 0, error: '', releaseUrl: 'https://github.com/ZenPluS/OrbitKanban/releases' }; updateSubscribed = false;
  dismissedUpdateVersions = new Set();
  // Tasks ticked in the list for bulk edit or export; kept across filters and dropped when they no longer exist.
  selectedTasks = new Set();
  selectionAnchor = '';
  settingsTab = (() => { try { return sessionStorage.getItem('orbitkanban.settingsTab') || ''; } catch { return ''; } })(); themeQuery = '';
  guideQuery = ''; guidePinned = null;
}
