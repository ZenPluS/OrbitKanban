(function () {
'use strict';
// In-app guide content. Texts are English source keys translated by the language packs ("terms": exact match).
// Inline markup: **label** for interface names, `key` for keys, paths and examples.
// A section with "tab" takes its title from the organization's view names; "go" lists the views and settings tabs it explains.
const SECTIONS = [
  {
    id: 'start', icon: 'sparkle', title: 'Getting started',
    summary: 'OrbitKanban is a local workspace for tasks, linked issues, milestones and kanban. Everything runs on your PC: no account, no cloud, no installation.',
    topics: [
      { title: 'Portable by design', items: [
        'The app is a single executable. The **data** folder next to it holds the archive, backups, languages and update history.',
        'No installation or administrator rights are needed. The first launch creates a demo organization that you can explore or clear.',
        'The first time, Windows SmartScreen may warn about an unsigned app: choose **More info** and then **Run anyway**.'
      ] },
      { title: 'Share it', items: [
        'To share the app, close it and copy the executable together with its **data** folder: the recipient gets the same organizations, themes and settings.',
        'Do not run two copies on the same data folder at the same time.'
      ] },
      { title: 'Find your way around', items: [
        'The sidebar holds the organization menu, the four views, this **Guide** and **Settings**.',
        'The menu button **☰** at the left of the top bar, or `Ctrl+B`, folds the sidebar into a column of icons so the views get more space. Hover an icon to see its name; the building icon still switches organization. Press the button again to expand the sidebar; the choice is remembered.',
        'The top bar offers global search, undo and redo, and the archive status. **Open data folder** at the bottom shows where your data lives.',
        'The four views can be renamed for each organization in **Settings → Identity & navigation**.',
        'Press `F1` at any time to open this guide.'
      ] },
      { title: 'Pin it to the taskbar', desktop: true, items: [
        'The running app keeps the same taskbar icon as the portable launcher, so a pinned icon always starts the launcher.',
        '**Settings → App & updates → Create desktop shortcut** creates a shortcut that you can pin. Recreate it if you move the portable folder, and remove old broken pins.'
      ] }
    ]
  },
  {
    id: 'organizations', icon: 'building', title: 'Organizations', go: [{ settings: 'organizations' }, { settings: 'identity' }],
    summary: 'Each organization is a separate workspace with its own data, settings, theme, language and logo.',
    topics: [
      { title: 'Switch and manage', items: [
        'Choose the active organization from the sidebar menu. Each one keeps its own tasks, issues, saved views and settings.',
        '**Manage organizations** opens the settings where you can create or delete organizations. At least one must remain.'
      ] },
      { title: 'Create an organization', items: [
        'Enter the name and the interface language. Optionally add a logo and tick **Include demo data** to start with sample content.',
        'The logo (PNG, JPEG, WebP, GIF or BMP up to 15 MB) is stored with the organization and generates a matching theme.'
      ] },
      { title: 'Rename and change the logo', items: [
        'Rename the organization and change or remove its logo in **Settings → Identity & navigation**.'
      ] }
    ]
  },
  {
    id: 'tasks', icon: 'tasks', tab: 0, go: [{ view: 0 }],
    summary: 'The main list: one row per task, with its portal code, schedule, effort and the incidents and problems linked to it.',
    topics: [
      { title: 'Task fields', items: [
        '**Portal code** identifies the task on its source platform, such as a ticket platform, and links issues to it.',
        '**Sequence** is assigned automatically but can be edited by hand; duplicates are allowed.',
        '**Description** and **Notes** are rich text with bold, italic, underline and lists.',
        '**Urgency** and **Status** use the options configured in the settings, in their order.',
        '**Effort** is entered in days and hours and stored in hours, using the hours per day of the organization.',
        '**Release date** schedules the task: the same date always has the same color, in every view.',
        '**Incident** and **Problem** are filled automatically from the linked issues with the same portal code.'
      ] },
      { title: 'Create and edit', items: [
        '**New task** or `Ctrl+N` opens the editor. Double-click a row, or click its code, to edit it.',
        'By default, the editor shows properties on the left and description and notes on the right.',
        'The icon next to the code opens the task on its platform, in your default browser. It appears when a **Link to platform** column has a value.'
      ] },
      { title: 'Sort the list', items: [
        'The default order is by release date, ascending. Click a column header to sort; `Shift`+click adds further sort levels.',
        'Statuses and urgencies sort by their configured order. Descriptions and notes cannot be sorted.',
        'The **Release** button restores the default order.'
      ] },
      { title: 'Reorder by hand', items: [
        'Drag a row by the handle on its left, or focus the handle and press `↑` or `↓`. Sequence numbers are updated and the list is sorted by sequence.',
        'Press `Esc` while dragging to cancel.'
      ] },
      { title: 'Hide rows', items: [
        'The eye button hides a row from the list without deleting it. Tick **Hidden** to show hidden rows again.',
        'Hidden tasks still appear in the milestones and in the kanban, marked **Hidden in list**.'
      ] }
    ]
  },
  {
    id: 'find', icon: 'list', title: 'Search, filters and views', go: [{ view: 0 }],
    summary: 'Narrow the list down in seconds and save the combinations you use most.',
    topics: [
      { title: 'Search and quick filters', items: [
        'The search box looks for codes, descriptions, incidents and other text. Next to it you can filter by status and highlight, and show hidden rows or duplicates.'
      ] },
      { title: 'Column filters', items: [
        'Every column header has a filter button. Text columns use **Contains**; numbers and effort use a **From**/**To** range.',
        'Date filters list **Unassigned** and every date in use, each with its color and number of rows. You can also choose a **From**/**To** range.',
        'Statuses, urgencies, highlights, tags and choice columns filter by one or more values. Every column can also show only empty or only filled cells.',
        'Filters on different columns combine: a row must match all of them. The bar above the table summarizes them and removes them one by one.'
      ] },
      { title: 'Saved views', items: [
        '**Views** saves the current search, filters, sorting and columns under a name, up to 30 per organization. Pick a view from the menu to apply it.',
        'A view for every release date is created automatically, under **Upcoming releases** and **Past releases**.'
      ] },
      { title: 'Global search', items: [
        '`Ctrl+K` or the search button in the top bar finds tasks and issues by code, incident, problem or release date. `Enter` opens the first result.'
      ] }
    ]
  },
  {
    id: 'marking', icon: 'highlighter', title: 'Highlights and tags', go: [{ settings: 'highlights' }, { settings: 'tags' }],
    summary: 'Make important rows stand out and group tasks with your own labels.',
    topics: [
      { title: 'Automatic highlights', items: [
        'Turn on the star of a status in its label settings: every task in that status is highlighted automatically.'
      ] },
      { title: 'Highlighters', items: [
        'Pick a color in the highlighter bar, then click rows to color them; click again to remove the color. The **Eraser** clears highlights and `Esc` stops.',
        'The ● button at the end of each row and the task editor set the highlight too. The highlight filter shows highlighted rows, rows without highlight or a single color.',
        'Names, colors and order of up to 16 highlighters are managed in the settings.'
      ] },
      { title: 'Tags', items: [
        'Tags are a catalog of up to 100 colored labels, with names up to 60 characters.',
        'Assign several tags to a task from its tags cell in the list, then press **Apply**. Bulk edit adds or removes tags on many tasks at once.'
      ] }
    ]
  },
  {
    id: 'bulk', icon: 'tasks', family: 'rose', title: 'Bulk edit and history', go: [{ view: 0 }],
    summary: 'Change many tasks at once and step back when something goes wrong.',
    topics: [
      { title: 'Select tasks', items: [
        'Tick the boxes on the left of the rows. `Shift`+click selects a range; the box in the header selects every task shown.',
        'The selection survives searches, filters and sorting. **Deselect** or `Esc` clears it.'
      ] },
      { title: 'Bulk edit', items: [
        '**Bulk edit** lists the selected tasks and the fields to change. Every field starts as **Keep unchanged**.',
        'You can change status, urgency, highlight and visibility, set, shift or remove the release date, and add or remove tags.',
        '**Delete…** removes the ticked tasks after a confirmation. In the milestones, the pencil of each release opens bulk edit for its tasks.'
      ] },
      { title: 'Undo and redo', items: [
        '`Ctrl+Z` undoes the last change; `Ctrl+Y` or `Ctrl+Shift+Z` redoes it, up to 20 operations per organization. The arrows in the top bar do the same.',
        'Undo is paused while the settings have unsaved changes.'
      ] }
    ]
  },
  {
    id: 'duplicates', icon: 'warning', title: 'Duplicate detection', go: [{ view: 0 }, { view: 1 }],
    summary: 'Spot an incident linked twice before it causes confusion.',
    topics: [
      { title: 'How duplicates are found', items: [
        'An incident linked to more than one task, or used in more than one association, is flagged in amber. Point at it to see where else it is used.',
        'The counters next to the views in the sidebar show how many tasks and associations are involved.'
      ] },
      { title: 'Review and clean up', items: [
        'Tick **Duplicates** to show only the rows involved, hidden ones included. Editors warn you while you type.',
        'Associations with the same code, incident and problem are marked as identical: **Remove identical** deletes the copies and keeps the first one.'
      ] }
    ]
  },
  {
    id: 'issues', icon: 'link', tab: 1, go: [{ view: 1 }],
    summary: 'Associate each portal code with its incidents and problems: the task list picks them up automatically.',
    topics: [
      { title: 'Associations', items: [
        'Each row links a portal code to an incident, a problem or both. A problem can have several incidents, and a code can appear in several rows.',
        'Codes match the task list regardless of letter case and surrounding spaces. No connection to the ticket platform is needed.',
        'The linked column counts the tasks with that code; **Waiting for a task** means that no task uses it yet.'
      ] },
      { title: 'Work with the list', items: [
        '**New association** adds a row; double-click a row to edit it. Search, column filters, **Columns** and **Import CSV** work as in the task list.'
      ] }
    ]
  },
  {
    id: 'milestones', icon: 'flag', tab: 2, go: [{ view: 2 }],
    summary: 'A roadmap built from the release dates, always up to date with the task list.',
    topics: [
      { title: 'The timeline', items: [
        'Each release date becomes a milestone with all its tasks, in date order. Scroll horizontally through the releases and vertically through the tasks.',
        'Colors match the release dates of the list. Tasks without a date are grouped at the end as **Unscheduled**.',
        'Hidden tasks are included, with a dashed border and the **Hidden in list** label. Click the code on a card to edit the task.'
      ] },
      { title: 'Next release', items: [
        'The first release from today onwards is highlighted as **Next release**, or **Today\'s release**. The button in the header brings it back into view.',
        'The highlight follows the date of your PC and moves on by itself after midnight.'
      ] },
      { title: 'Edit a whole release', items: [
        'The pencil of each milestone opens bulk edit for all its tasks, for example to move the release to another date.'
      ] }
    ]
  },
  {
    id: 'kanban', icon: 'kanban', tab: 3, go: [{ view: 3 }, { settings: 'statuses' }],
    summary: 'A read-only board that shows where every task stands.',
    topics: [
      { title: 'Columns and cards', items: [
        'There is one column per status, in the order set in the settings. Tasks without a status appear under **Unassigned**.',
        'Cards show code and description; hidden tasks are included and marked.',
        'To move a card, change the status of the task in the list or in its editor.'
      ] }
    ]
  },
  {
    id: 'columns', icon: 'column-plus', title: 'Columns', go: [{ settings: 'columns' }, { settings: 'custom-columns' }],
    summary: 'Decide which columns each list shows and add the fields your team needs.',
    topics: [
      { title: 'Show, hide and reorder', items: [
        '**Columns** above each list, or **Settings → List columns**, shows or hides columns and changes their order by dragging. Hiding a column never deletes data.',
        '**Highlight** is available but hidden at first. **Restore default columns** brings back the initial layout.'
      ] },
      { title: 'Custom columns', items: [
        'In **Settings → Column management** you can add up to 40 columns per list: text, rich text, number, date, single or multiple choice, website, link to platform, effort in hours, yes/no and, in the task list, references between tasks.',
        'The type cannot be changed after creation. Custom columns can be filtered, imported from CSV and exported to Excel; numbers, dates, effort, yes/no and single choices can also be sorted.'
      ] },
      { title: 'Default columns can be deleted', items: [
        'Default columns can be deleted too, and restored later without their old values. Settings that depend on a column appear only while it exists.',
        'Without **Release date** there are no milestones or release views, without **Status** there is no kanban, and without **Sequence** rows cannot be dragged.'
      ] },
      { title: 'Column labels', items: [
        'Statuses, urgencies, highlights, tags and every choice column share the same label editor: name, color, order, add and delete.',
        'Deleting an option in use and saving leaves the affected tasks unassigned.'
      ] }
    ]
  },
  {
    id: 'links', icon: 'external', title: 'Links and references', go: [{ settings: 'custom-columns' }],
    summary: 'Open tasks on the platforms where they live, collect useful websites and connect tasks that depend on each other.',
    topics: [
      { title: 'Links to platforms', items: [
        'A **Link to platform** column opens the task on an external platform, such as a ticket platform or a change platform. Add one column for each platform in **Settings → Column management** and fill in only the ones a task needs.',
        'Each column has its own **Link template**, with `{code}` where the code goes, for example `https://tickets.example.com/browse/{code}`. In the task you then enter only the code, or copy the task code with one click; a full address entered in a task replaces the template for that task.',
        'Without a template, enter the full address in each task. A preview under the field shows the resulting link.',
        'The icon next to the task code, on the cards and in Excel exports opens the first platform link that has a value, in the order of the list columns, even when its column is hidden.',
        'The single portal link of earlier versions becomes a **Link to platform** column automatically, with the same template and the same links.'
      ] },
      { title: 'Websites', items: [
        'A **Website** column holds any web address, such as documentation or a shared folder, and shows it as a link that opens in your default browser.'
      ] },
      { title: 'References between tasks', items: [
        'A **Reference parent** column lists the tasks that come before a task. Adding it to the task list also adds its **Reference child** column, named **Successors** unless you choose another name.',
        'In the editor, **Choose predecessors** opens a searchable list of the other tasks. The task then appears automatically among the successors of each task you choose.',
        'Successors are read-only: to change them, edit the predecessors of the other task. A task cannot depend on itself or on its own successors, so chains never loop.',
        'Click a reference to open that task. Deleting a task removes it from every reference, and deleting either column deletes both.'
      ] }
    ]
  },
  {
    id: 'appearance', icon: 'palette', title: 'Themes, fonts and text size', go: [{ settings: 'themes' }, { settings: 'fonts' }],
    summary: 'Make the workspace yours: every change is previewed live and kept when you save.',
    topics: [
      { title: 'Themes', items: [
        'Choose from 40 built-in themes, 27 dark and 13 light, or create your own from four colors: background, surface, text and accent.',
        'Built-in themes can be edited for each organization and brought back with **Restore built-in theme**; your own themes can be edited and deleted.',
        'Built-in palettes meet WCAG AA contrast: text at least 4.5:1 and accent at least 3:1, on both background and surfaces.'
      ] },
      { title: 'Theme from an image', items: [
        'Upload an image and all four colors are extracted automatically, then adjusted as little as possible, in lightness only, to meet WCAG AA.',
        'You can also pick a role and click the image to sample its color. Images are processed in memory, never saved or sent.'
      ] },
      { title: 'Color picker', items: [
        'Every color uses the built-in picker: drag in the color area, use the hue, saturation and lightness sliders, or type a HEX code.',
        '`Enter` or **Apply** confirms; `Esc` or **Cancel** restores the previous color.'
      ] },
      { title: 'Fonts and text size', items: [
        'Choose from 33 fonts: 24 included and available offline, such as Roboto and Inter, and 9 system fonts, such as Segoe UI and Aptos.',
        'Scale seven parts of the interface separately, or use the **Compact**, **Standard**, **Large** and **Extra large** presets.'
      ] }
    ]
  },
  {
    id: 'settings', icon: 'settings', title: 'Settings', go: [{ settings: 'identity' }, { settings: 'languages' }, { settings: 'task-layout' }],
    summary: 'Each organization has its own configuration, organized in tabs.',
    topics: [
      { title: 'Save or discard', items: [
        'Changes take effect only with **Save settings**. A banner lists the modified tabs and a dot marks each of them.',
        '**Discard changes**, or leaving the settings without saving, keeps the previous configuration.'
      ] },
      { title: 'Task editor layout', items: [
        'In **Settings → Task editor layout**, press **Open form designer**: the task window appears over the blurred app, with the field list on the left and the properties of the selected item on the right.',
        'Drag fields from the list into the window, or between sections, to add and reorder them. With the keyboard, `Enter` adds the selected field, the arrow keys move it and `Delete` removes it.',
        'Drag a section with one to four columns from **Components**, or click it to add it. Rename sections, choose whether to show their name and split the window into up to three layout columns with proportional widths.',
        'Drag the edges of the window to set its width and height, or keep **Automatic height (fits the content)**. The real window never exceeds the app window and scrolls when needed. `Ctrl+Z` and `Ctrl+Y` undo and redo.',
        'Fields left off the form keep their values and the task list columns do not change. **Save** stores the form, together with any other settings changes still pending, and closes the designer; **Cancel** discards the designer changes. Layouts travel with settings exports and backups.'
      ] },
      { title: 'Required fields', items: [
        'Mark a field as **Required** in the field properties of the form designer, or in **Settings → Column management** for tasks and issues. **Sequence** is required by default.',
        'Required fields are checked when you save a task or an issue, but only when they are on the form: missing fields are highlighted with a message. **Bulk edit** cannot clear a required release date or highlight; imports are not checked.',
        'Yes/no fields and values that are not entered in the editor, such as tags, successors or the incidents and problems linked automatically, cannot be required.'
      ] },
      { title: 'Identity & navigation', items: [
        'Set the organization name, the names of the four views and the hours of an effort day. Changing the hours per day changes only how effort is displayed.'
      ] },
      { title: 'Language & translations', items: [
        'Italian and English are built in, and the language is chosen for each organization.',
        'To add a language, translate a copy of `en.template.json` in the `data/languages` folder and press **Reload languages**. Invalid files are listed and ignored.'
      ] }
    ]
  },
  {
    id: 'data', icon: 'database', title: 'Data, backups and transfers', go: [{ settings: 'storage' }, { settings: 'transfer' }],
    summary: 'Your data is a portable JSON archive, protected by automatic copies and easy to move.',
    topics: [
      { title: 'Archive and backups', items: [
        'Everything is saved in `data/workspace.json`, with the previous save in `workspace.json.bak`.',
        'Before the first change of each day a backup is stored in `data/backups`, and the last 14 are kept. **Settings → Data that travels with you** lists them and restores one after a confirmation.',
        '**Export backup** and **Import backup** save or replace the whole archive, all organizations included.'
      ] },
      { title: 'Export and import an organization', items: [
        'Export the themes, the settings, the data or everything of the active organization.',
        'When importing, check the preview, then add and update or replace everything, in this organization or in a new one. Statuses and urgencies are matched by name.'
      ] },
      { title: 'Import from CSV', items: [
        '**Import CSV**, in both lists, adds rows from a .csv or .tsv file of up to 16 MB, 100 columns and 10,000 rows.',
        'Check separator, encoding and header row, map each column to a field and review the preview. Nothing is saved until every error is fixed.',
        'Dates use YYYY-MM-DD or DD/MM/YYYY and multiple values are separated by `|`. The whole import can be undone with `Ctrl+Z`.'
      ] },
      { title: 'Export to Excel', items: [
        'The **Excel** button of every view exports the current situation to an .xlsx workbook with summary, tasks, issues, milestones and kanban sheets.',
        'Choose the tasks (as shown, all or selected), the columns and the sheets. Colors, links and real dates are kept.'
      ] },
      { title: 'Start over', items: [
        '**Clear tasks and issues** deletes all the tasks and associations of the organization, keeping settings and themes.'
      ] }
    ]
  },
  {
    id: 'browser', icon: 'globe', title: 'Browser access', go: [{ settings: 'browser' }],
    summary: 'While the app is open, you can also work from a browser on the same PC.',
    topics: [
      { title: 'Open in a browser', items: [
        '**Open in browser** opens the active organization in your default browser; other organizations can be opened in separate tabs.',
        '**Copy access link** copies a private link for this PC. The link contains a key: do not share it.'
      ] },
      { title: 'Live sync', items: [
        'Changes sync in real time between the app and every tab, with protection against conflicting edits.',
        'When the app is closed, tabs show **App not reachable** and reconnect once it is open again. Updates are installed only from the desktop app.'
      ] }
    ]
  },
  {
    id: 'updates', icon: 'import', title: 'Updates', go: [{ settings: 'updates' }],
    summary: 'New versions are published on GitHub, and installing one always requires your confirmation.',
    topics: [
      { title: 'Check, download, install', desktop: true, items: [
        'In **Settings → App & updates** press **Check for updates**, or let the app check at startup.',
        'A detected update appears in a persistent banner in every view. **View update** opens the update settings; dismissing the banner keeps a shortcut in the top bar. The same version stays dismissed for this session, while a newer version is announced again.',
        '**Download update** downloads the new version and verifies its SHA-256 checksum; **Install and restart** replaces the executable and reopens the app.'
      ] },
      { title: 'Your data is safe', items: [
        'The data folder stays where it is. Before installing, the previous executable and a copy of the archive are saved in `data/updates`.',
        'Only the version is checked: GitHub receives no workspace data.'
      ] }
    ]
  },
  {
    id: 'shortcuts', icon: 'keyboard', title: 'Keyboard shortcuts',
    summary: 'Work faster without leaving the keyboard.',
    shortcuts: [
      [[['F1']], 'Open this guide'],
      [[['Ctrl', 'K']], 'Search tasks and issues'],
      [[['Ctrl', 'B']], 'Collapse or expand the sidebar'],
      [[['Ctrl', 'N']], 'Create a task from the task list'],
      [[['Ctrl', 'Z']], 'Undo the last change'],
      [[['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], 'Redo the last undone change'],
      [[['Esc']], 'Close a dialog, cancel a drag, stop the highlighter or clear the selection'],
      [[['Shift', 'click']], 'Sort by more columns, or select a range of tasks'],
      [[['Double-click']], 'Edit a task or an association'],
      [[['↑'], ['↓']], 'Move a row or an option from its drag handle'],
      [[['Enter']], 'Open the first result of the global search, or apply a color']
    ]
  }
];
// Keys such as Ctrl, Esc, F1 or single letters are shown as they are; the other key names (Shift, Enter, click…) are translated.
const LITERAL_KEY = /^(?:Ctrl|Alt|Esc|Tab|F\d{1,2}|[A-Z0-9]|[↑↓←→])$/;
const isLiteralKey = key => LITERAL_KEY.test(key);
const keyWords = () => [...new Set(SECTIONS.flatMap(section => (section.shortcuts || []).flatMap(([combos]) => combos.flat())).filter(key => !isLiteralKey(key)))];
// Every text the guide shows, for translation checks.
function texts() {
  const result = new Set();
  for (const section of SECTIONS) {
    if (section.title) result.add(section.title);
    result.add(section.summary);
    for (const topic of section.topics || []) { result.add(topic.title); topic.items.forEach(item => result.add(item)); }
    for (const [, description] of section.shortcuts || []) result.add(description);
  }
  keyWords().forEach(key => result.add(key));
  return [...result];
}
const UI_TEXTS = ['Guide', 'Open the guide (F1)', 'Everything OrbitKanban can do, explained step by step.', 'Search the guide…', 'Search the guide', 'Guide contents', 'No topics match your search.', 'Matching topics: {0}', 'Go to {0}', 'Shortcut', 'Action', 'Desktop app only'];
const api = { sections: SECTIONS, texts, uiTexts: () => [...UI_TEXTS], keyWords, isLiteralKey };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.OrbitaGuide = api;
})();
