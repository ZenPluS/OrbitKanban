# OrbitKanban

**A portable, offline-first task workspace for Windows.** OrbitKanban keeps release tasks, their linked incidents and problems, a milestone timeline and a read-only kanban board in a single executable that carries its data with it. There is no installer, account or server: copy the executable and its `data` folder, and the whole workspace moves with you.

| | |
| --- | --- |
| **Current version** | 2.70.0 |
| **Platform** | Windows 10 / 11, 64-bit |
| **Distribution** | Single portable executable, `OrbitKanban-Portable.exe` |
| **Network** | Not required. Used only for optional update checks against GitHub |
| **Downloads** | [GitHub Releases](https://github.com/ZenPluS/OrbitKanban/releases) |

## Table of contents

- [Highlights](#highlights)
- [Getting started](#getting-started)
  - [Requirements](#requirements)
  - [First launch](#first-launch)
  - [Moving and sharing the workspace](#moving-and-sharing-the-workspace)
  - [Splash screen and taskbar](#splash-screen-and-taskbar)
- [In-app guide](#in-app-guide)
- [Portable data and backups](#portable-data-and-backups)
- [Organizations](#organizations)
- [The four views](#the-four-views)
  - [Tasks](#tasks)
  - [Linked issues](#linked-issues)
  - [Milestones](#milestones)
  - [Kanban](#kanban)
- [Working with the lists](#working-with-the-lists)
  - [Sorting and manual order](#sorting-and-manual-order)
  - [Search, column filters and views](#search-column-filters-and-views)
  - [Hiding rows](#hiding-rows)
  - [Highlights and tags](#highlights-and-tags)
  - [Duplicate detection](#duplicate-detection)
  - [Bulk edit](#bulk-edit)
  - [Undo and redo](#undo-and-redo)
- [Columns](#columns)
  - [Custom columns](#custom-columns)
  - [Removable built-in columns](#removable-built-in-columns)
  - [Column labels](#column-labels)
- [Links and references](#links-and-references)
  - [Links to platforms](#links-to-platforms)
  - [Websites](#websites)
  - [References between tasks](#references-between-tasks)
- [Settings](#settings)
  - [Task editor layout](#task-editor-layout)
  - [Required fields](#required-fields)
- [Appearance](#appearance)
  - [Themes](#themes)
  - [Color picker](#color-picker)
  - [Fonts](#fonts)
  - [Text size](#text-size)
  - [Icons and controls](#icons-and-controls)
- [Languages and translations](#languages-and-translations)
- [Import and export](#import-and-export)
  - [Full backup](#full-backup)
  - [Organization export and import](#organization-export-and-import)
  - [CSV import](#csv-import)
  - [Excel export](#excel-export)
- [Browser access](#browser-access)
- [Updates](#updates)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
  - [Prerequisites and scripts](#prerequisites-and-scripts)
  - [Project structure](#project-structure)
  - [Build, test and release](#build-test-and-release)
- [Release history](#release-history)

## Highlights

- **Truly portable.** The executable and a `data` folder next to it are the whole installation, with automatic daily backups.
- **Four views**: Tasks, Linked issues, Milestones and Kanban. Each tab name is configurable per organization.
- **Collapsible sidebar** that folds into a column of icons (**☰** or `Ctrl+B`) to give the views more room.
- **Automatic issue matching.** Incidents and problems recorded in Linked issues are resolved onto tasks by their portal code.
- **Multiple organizations**, each with its own data, settings, logo, theme and language.
- **Flexible lists**: multi-level sorting, drag-and-drop ordering, per-column filters, saved views, row highlights, tags, duplicate detection, bulk edit, and undo/redo.
- **Custom columns** of twelve types, including links to any number of ticket platforms, websites and predecessor/successor references between tasks; every built-in column can also be removed.
- **Form designer** for the task editor: drag fields into custom sections, size the window and mark fields as required, per organization.
- **40 built-in themes**, custom themes, and palettes generated from an image or logo with WCAG AA contrast.
- **Imports and exports**: CSV import with validation, Excel workbooks, and per-organization JSON exports.
- **Browser access** from the same PC, with live sync across windows.
- **Built-in guide** covering every feature, opened with `F1`.
- **Verified updates** from GitHub releases, with persistent in-app notifications and automatic rollback if an install fails.
- **Translatable**: English and Italian are included, and more languages can be added with a JSON file.

## Getting started

### Requirements

- Windows 10 or 11, 64-bit.
- A writable folder, such as the Desktop, a documents folder or a USB drive. Avoid `Program Files` and read-only locations.
- No administrator rights, runtime or internet connection are needed.

### First launch

1. Download `OrbitKanban-Portable.exe` from the [latest release](https://github.com/ZenPluS/OrbitKanban/releases/latest).
2. Place it in a writable folder and run it.
3. On first launch OrbitKanban creates a `data` folder next to the executable with a complete demo organization (see below).

Windows SmartScreen may show a warning because the executable is not digitally signed. Choose **More info → Run anyway** if you trust the source.

The demo organization shows every feature with realistic data:

- one milestone every two weeks, released on Wednesdays, from 1 January 2025 to today, plus the next planned release;
- more than 200 tasks covering all urgencies, statuses, efforts in days and hours, and rich-text descriptions and notes;
- older completed tasks hidden from the list but still visible in Milestones and Kanban, and a backlog of unscheduled tasks;
- more than 150 linked issues, including problems shared by several incidents, lowercase codes, problem-only rows and codes with no matching task;
- two **Link to platform** columns: a ticket platform (`https://tickets.example.com/browse/{code}`) and a change platform for `CHG…` codes;
- predecessors and successors between upcoming and backlog tasks;
- an extra **Aurora** theme.

Demo data is created only when no workspace exists yet, so updating the app never touches an existing `data` folder. To explore the demo next to your own data, create a new organization with **Include demo data**. **Clear tasks and issues** removes the demo content from the current organization and keeps its settings.

### Moving and sharing the workspace

**Close the app, then copy the executable and the `data` folder together.** Copying only the executable starts a new, empty workspace.

- Do not run the app from inside a ZIP archive.
- Do not open several copies of the executable on the same shared `data` folder. To work in several windows, use [browser access](#browser-access), which always goes through the single running app.
- OrbitKanban is a single-user tool, not a networked collaboration system.

### Splash screen and taskbar

The portable executable extracts the app to a private temporary folder on every launch. A splash screen with the app logo, version and an animated progress bar appears immediately and stays on screen without interruption until the main window is open. The launcher starts the app itself and removes the splash screen only when the app reports that its window is visible, or if the app closes or does not report within 30 seconds. When the app runs without the portable launcher, for example during development, it shows the same splash screen itself; there, the bar pulses slowly when Windows asks to reduce motion. The splash screen is always in English. Only the English and Italian Chromium resources are packaged, which keeps extraction fast.

Since 2.45.0 the main window reports the **original portable launcher** to Windows as its identity, path and icon. Pinning the running app to the taskbar therefore pins the launcher, not the temporary extraction. A second double-click brings the open app to the front.

> **Pins created by older versions** may point to the temporary extraction and show a blank icon. Unpin them, start the new version and pin it again. Alternatively, use **Settings → App & updates → Create desktop shortcut** and pin that shortcut. Recreate the shortcut if you move or rename the executable. Built-in updates keep the same path.

## In-app guide

The **Guide** button at the bottom of the sidebar, or `F1` from anywhere, opens a complete feature reference inside the app.

- **17 sections**: getting started, organizations, every view, search and filters, highlights and tags, bulk edit, duplicates, columns, appearance, settings, data and backups, browser access, updates and keyboard shortcuts.
- **Search box** that filters topics instantly; accents and letter case are ignored.
- **Section navigation** that tracks your scroll position, and **Go to…** buttons that open the related view or settings tab directly.
- Follows the organization language, active theme, font and text size, and works the same in browser access.

## Portable data and backups

Everything OrbitKanban stores lives in the `data` folder next to the executable:

| Path | Content |
| --- | --- |
| `data/workspace.json` | The workspace: all organizations, tasks, issues, settings, themes and logos |
| `data/workspace.json.bak` | The previous save |
| `data/backups/` | Daily snapshots of the whole workspace; the 14 most recent are kept |
| `data/languages/` | Optional translation files and the English template |
| `data/updates/` | Update preference, downloads and rollback copies |
| `data/runtime/` | Cache, logs, the sidebar preference and the browser access key |

A daily backup is written before the first change of each day. **Settings → Data that travels with you** lists the backups with date and size. Restoring one asks for confirmation and replaces all organizations and settings; the current state is first saved to `workspace.json.bak`. Read and write errors are always reported, and a corrupted workspace is never silently replaced.

The workspace format is version 2 (multi-organization). It cannot be opened by 1.x releases. Older single-organization workspaces and backups are migrated automatically.

## Organizations

The menu under the **OrbitKanban** name in the sidebar switches the active organization. Each organization has its **own tasks and issues** and its own tab names, statuses, urgencies, highlights, tags, columns, themes, font, text sizes, hours per day, logo and language. Switching updates every view immediately and resets search and filters. The selection is remembered for the next launch. Identical codes in different organizations are never linked.

- **Manage organizations** opens the related settings tab.
- **New organization** asks for a name, language and optional logo. A preview shows the logo and the four colors of the theme that will be generated. New organizations start empty unless **Include demo data** is selected.
- Rename an organization by editing its name and pressing **Save settings**. **Delete organization** asks for confirmation, and at least one organization must remain.
- If you switch organization with unsaved settings, you can save them, discard them or stay.

**Upload logo and generate theme** accepts PNG, JPEG, WebP, GIF and BMP files up to 15 MB. The logo is converted to PNG, scaled to at most 512 px per side and embedded in the workspace, so the original file is no longer needed. Its colors generate a **Theme from logo**. Text and accent are adjusted to WCAG AA contrast, and surfaces are separated from the background, so even monochrome logos produce a readable theme. The theme is previewed immediately and kept with **Save settings**. **Remove logo** restores the default symbol without deleting the theme. The application name is always OrbitKanban and is not configurable.

## The four views

All views share compact headers. Their tables, timeline and board fill the window and scroll internally while respecting the configured text sizes. On Windows the app draws its own title bar: drag the top bar or logo to move the window, and double-click to maximize or restore it. The minimize, maximize and close buttons follow the active theme.

The **☰** button at the left of the top bar, or `Ctrl+B`, folds the sidebar into a column of icons so the views get more room. The icons keep their counters and show their names as tooltips, and the building icon still switches organization. Press the button again to expand the sidebar. The choice travels with the portable data in `data/runtime/`; with browser access, each browser keeps its own.

Opening and closing use a short, 220 ms transition: the views resize with the sidebar, icons move without stretching, and labels fade back in. Clicking again reverses the motion immediately. The system's **reduced motion** preference disables the animation, and restoring the saved layout at startup is always instant.

### Tasks

The main list. Each task can have:

| Field | Description |
| --- | --- |
| Portal code | The identifier on the source ticket platform |
| Sequence | Insertion number, assigned automatically and editable; duplicates are allowed |
| Description and notes | Rich text with bold, italic, underline and lists |
| Urgency and status | Configurable, ordered pick-lists |
| Effort | Days and hours, stored in hours using the organization's hours-per-day setting (8 by default) |
| Incident and problem | Resolved automatically from [Linked issues](#linked-issues) |
| Release date | Each date gets a deterministic color: the same day always has the same color, everywhere |
| Highlight and tags | See [Highlights and tags](#highlights-and-tags) |
| Links and references | Optional columns for platform links, websites, predecessors and successors (see [Links and references](#links-and-references)) |

Create tasks with **New task** or `Ctrl+N`. Open the editor by double-clicking a row or clicking the portal code. The editor follows the organization's [form layout](#task-editor-layout), by default with properties and links on the left and description and notes on the right, and keeps **Save**, **Cancel** and **Delete** always within reach. Descriptions and notes show up to three lines in the table, and hovering shows the full text.

### Linked issues

Each row links a **portal code** to an **incident** and/or a **problem**. One problem can have many incidents, and one code can appear in many rows. Codes match tasks case-insensitively, ignoring surrounding spaces. Each task shows the incidents and problems of all matching rows, without duplicates. No connection to the ticket platform or any other system is needed.

### Milestones

A horizontal timeline grouped by release date. It scrolls in both directions and updates automatically when tasks or dates change.

- The first release from today onward is framed as **Next release**, or as **Today's release** when it falls on the current day. It is based on the PC's local date and refreshes when the day changes. The button in the header scrolls back to it.
- Tasks without a date appear in **Unscheduled**.
- Hidden tasks are included, with a dashed border and the **Hidden in list** label.
- Click the code on a card to edit the task. The pencil button on each milestone bulk edits all its tasks, for example to move a release to another date.

### Kanban

A read-only board with one column per status, in the configured status order. An extra column collects tasks without a status when needed. Hidden tasks are included and labeled. Change statuses from the task list or with bulk edit.

## Working with the lists

### Sorting and manual order

- Tasks are sorted by **release date ascending** by default, with empty dates last. The **Release** button restores this order.
- Click a header to sort and click again to reverse. Use `Shift+click` to add further sort levels.
- Sequence, portal code, urgency, status, highlight, effort and release date are sortable, along with custom number, date, effort, yes/no and single-choice columns. Urgency, status and highlight sort by their configured order rather than alphabetically. Free-text columns such as description and notes are not sortable.
- **Manual order:** drag the handle next to a row's checkbox, or press `↑`/`↓` while the handle has focus. `Esc` cancels the drag.
  - On drop, every task's sequence is renumbered from 1 and the list switches to sequence order.
  - With filters active, only the visible rows move.

### Search, column filters and views

- **Global search** (`Ctrl+K`, top bar) finds tasks and issues by code, incident, problem, text content and release date. Choosing a result opens its editor.
- **List search** and the status, highlight and duplicate filters narrow the current list only. They never affect the other views.
- **Column filters**: the funnel button in every header of both lists filters that column.
  - Text columns use *contains*.
  - Numbers and effort use an inclusive *from/to* range; effort is filtered in hours.
  - Statuses, urgencies, highlights, tags and choice columns match one or more values.
  - Every column except dates can show only empty or only filled cells.
  - Date columns list the dates that are present, each with its color and row count, plus **Unassigned**. A *from/to* range can be combined with the checked dates.
  - Filters on different columns combine with AND. A summary bar lists the active filters and offers **Clear column filters**.
- **Saved views**: up to 30 per organization. A view stores the search, filters, hidden and duplicate toggles, sort order and visible columns.
- **Release views**: the views menu also lists every release date automatically, grouped as **Upcoming releases** (including **Unassigned**) and **Past releases**, with task counts. Opening one filters the list to that release. Release views are not stored and do not count toward the 30 saved views.

### Hiding rows

The round button at the end of a row hides the task **from the task list only**, for example once it has been released to production. Hidden tasks remain in Milestones, Kanban, issue matching and exports, labeled **Hidden in list**. Turn on **Hidden** in the list toolbar to see and restore them. Tab counters and list statistics exclude hidden rows.

### Highlights and tags

There are two independent ways to make rows stand out:

- **Status highlight (automatic).** The ★ next to a status highlights every task in that status.
- **Highlighters (manual).** These are named colors, up to 16 per organization, such as *Attention*, *Blocking* or *Ready*. A highlighter takes precedence over the status star. You can apply one in any of these ways:
  - pick a color in the **Highlighter** bar and click rows (**Eraser** removes the color; `Esc` stops highlighting);
  - use the ● menu at the end of a row;
  - set the **Highlight** field in the task editor.

  Highlights also appear on milestone and kanban cards and can be filtered and searched.

**Tags** form a catalog of up to 100 colored labels per organization, with unique names of up to 60 characters. Assign several tags to a task from its tags cell in the list and press **Apply**. Bulk edit adds or removes tags across many tasks. Renaming, recoloring or reordering a tag updates every task that uses it. Deleting a tag removes it from all tasks when settings are saved.

### Duplicate detection

The **incident** is the duplicate key, compared like portal codes. Rows with only a problem are never considered duplicates. Detection only flags rows: nothing is blocked, merged or deleted automatically.

- **Linked issues.** Rows that share an incident show it in amber with a duplicate icon, and clicking it filters the list to that incident. Rows that exactly repeat another row are marked **identical**, and **Remove identical** deletes them after confirmation, keeping the first of each group.
- **Tasks.** A task is flagged when one of its incidents is linked to other tasks. The **Duplicates** filter includes hidden tasks, so released duplicates are not missed.
- The sidebar shows an amber counter on both views. The task and issue editors warn while you type.

### Bulk edit

Select tasks with the checkboxes. `Shift+click` selects a range, and the header checkbox selects every visible task. The selection survives searches, filters and view changes; **Deselect** or `Esc` clears it.

**Bulk edit…** opens a dialog listing the selected tasks. You can exclude individual tasks, or narrow the list by status with the chips. Every field starts as **— Keep unchanged —**, so only what you choose changes:

- status, urgency and highlight;
- release date: set a date, shift it by N days, or clear it;
- visibility in the list;
- each tag: add it or remove it.

**Apply** saves everything in one operation. **Delete** removes the checked tasks after confirmation; linked issues are not affected.

### Undo and redo

**Undo** (`Ctrl+Z`) and **Redo** (`Ctrl+Y` or `Ctrl+Shift+Z`) cover saved changes, including CSV imports. The history keeps up to 20 operations per organization while the app is open. It is cleared on restart or when another window changes the data.

## Columns

Use **Columns** in each list toolbar, or **Settings → List columns**, to show, hide and reorder columns by drag and drop or with the arrow buttons. **Restore defaults** brings back the initial layout. Hiding a column never deletes data, and the row actions column is always visible. **Highlight** is an optional task column that is hidden by default.

### Custom columns

**Settings → Column management** adds up to **40 custom columns per list**, separately for each organization:

| Type | Value |
| --- | --- |
| Text / Rich text | Plain or formatted text |
| Number | Integer or decimal, negative values allowed |
| Date | Calendar date with deterministic color |
| Single / Multiple choice | Colored labels managed under **Column labels** |
| Website | Clickable HTTP/HTTPS address, such as documentation or a shared folder |
| Link to platform | Code on an external platform, turned into a link by the column template, or a full address (see [Links to platforms](#links-to-platforms)) |
| Effort (hours) | Non-negative number of hours |
| Yes / No | Yes, no or empty |
| Reference parent | Predecessor tasks picked from a searchable list; tasks only (see [References between tasks](#references-between-tasks)) |
| Reference child | Successor tasks, computed automatically and read-only; created together with its parent column |

The type is fixed at creation to protect existing values. Names (up to 60 characters), options and order can be changed. Custom values are edited in the task and issue editors, and they can be searched, filtered, sorted (where meaningful), imported from CSV and exported to Excel. **Save settings** also saves columns still being typed into the forms. Deleting a column removes its values only when settings are saved, and the deletion can be undone. The **Required** box makes a column mandatory in the editors; see [Required fields](#required-fields).

### Removable built-in columns

Since 2.22.0 every built-in column of **Tasks** and **Linked issues** can be deleted, just like a custom one.

- Deleting asks for confirmation. Values are erased only on **Save settings**, and **Discard changes** reverts it. Hiding a column never erases data.
- **Restore column** brings back a built-in column and its catalog, **but not its erased values**.
- Settings appear only for columns that exist:
  - hours per day requires at least one effort column;
  - the Milestones view and release views require **Release date**;
  - the Kanban view requires **Status**;
  - manual ordering requires **Sequence**.

  When a column needed by a view is missing, the view shows a link to Column management, and the matching Excel sheet is disabled.
- Saved views, CSV import, bulk edit, filters, search and Excel adapt to the remaining columns.

Once columns have been deleted, use OrbitKanban 2.22.0 or later with that workspace.

### Column labels

Every single- or multiple-choice column, built-in or custom, gets its own tab under **Settings → Column labels**. Statuses, urgencies, highlights, tags and custom choices therefore share the same editor:

- names and colors;
- usage counts;
- drag-and-drop or arrow reordering;
- deletion.

Statuses also offer the automatic-highlight star, and the status order defines the kanban columns. Renaming or reordering labels preserves assignments. Deleting a label and saving clears it from every row, including hidden ones. Single-choice values become **Unassigned**, and multiple-choice values keep their other labels.

## Links and references

Three families of custom task columns connect a task to the outside world and to other tasks. Add them in **Settings → Column management**. External links open in the default browser, never inside the app, and only `http://` and `https://` addresses are opened.

### Links to platforms

A **Link to platform** column opens the task on an external platform, such as a ticket platform or a change platform. Add one column for each platform and fill in only the ones a task needs.

- Each column has its own optional **Link template**. Put the `{code}` placeholder where the code belongs, for example `https://tickets.example.com/browse/{code}`. `{codice}`, `<code>` and `<codice>` are also accepted, case-insensitively, and `https://` is added when no scheme is given. A live preview validates the template, and an invalid template cannot be saved.
- In the task, enter only the code on that platform, or copy the task's portal code with one click. Codes are URL-encoded. A full address entered in a task replaces the template for that task.
- Without a template, each task holds the full address. A preview under the field shows the resulting link.
- The link icon next to the portal code, on the kanban cards and in Excel exports opens the **first platform column with a value**, in list-column order, even when that column is hidden.
- Platform columns can be filtered, exported to Excel as links, imported from CSV and made required like any other column.

Up to 2.60, each organization had a single built-in **Portal link** column and one template in **Settings → Portal link**. Opening an older workspace, backup or organization file converts it automatically into a **Link to platform** column with the same template, position, visibility, required flag, saved-view filters and form placement. Specific links are kept as they are; tasks that relied on the template get their portal code as the value. A deleted portal link column is not recreated. Downgrading is not supported: OrbitKanban 2.60 cannot open a workspace once 2.70.0 has saved it.

### Websites

A **Website** column holds any web address, such as documentation or a shared folder, and shows it as a link. Addresses without a scheme get `https://`.

### References between tasks

A **Reference parent** column lists the tasks that come before a task, its **predecessors**. Adding one also adds its **Reference child** column, named **Successors** unless you choose another name. An organization can have several independent pairs.

- In the editor, **Choose predecessors** opens a searchable list of the other tasks. Each chosen task then lists this task among its successors automatically.
- Successors are computed and read-only: to change them, edit the predecessors of the other task. A task cannot depend on itself or on one of its own successors, so chains never loop.
- References show the portal code (or the sequence when the code is empty); click one to open that task.
- Deleting a task removes it from every reference. Deleting either column of a pair deletes both, after confirmation, when settings are saved.
- References exist only for tasks. They travel with backups and organization exports, but CSV import does not fill them.

## Settings

Settings are organized in tabs grouped as **Organization**, **Appearance**, **Workflow**, **Column labels** and **Data & access**. Only one tab is visible at a time. Arrow keys move between tabs, and narrow windows turn the menu into a horizontal strip.

Changes take effect only with **Save settings**:

- a sticky bar lists the modified tabs and offers **Save** and **Discard changes**;
- a dot marks each tab with unsaved changes;
- if saving fails, the tab with the field to fix opens automatically.

Leaving settings without saving restores the previous configuration. Themes, fonts and text sizes are previewed live.

### Task editor layout

**Settings → Appearance → Task editor layout** shows a miniature of the task form with its window size, layout columns and required fields. **Open form designer** opens a full-screen designer in the style of model-driven form editors such as Power Apps:

- **Live canvas.** The task window is drawn at its real size over a blurred copy of the app.
- **Field list** on the left. Search the fields or show only those not on the form, then drag them into a section. Fields can also be dragged between sections and layout columns; an indicator shows where they will land.
- **Components.** Drag or click a section with one to four columns. Sections can be renamed (up to 60 characters), show or hide their name, change layout column or be deleted, and their fields go back to the list.
- **Properties** on the right, for the current selection:
  - *form*: width from 480 to 2000 px, a fixed height from 360 to 1600 px or **Automatic height (fits the content)**, and up to three layout columns with proportional widths;
  - *section*: name, name visibility, number of columns and position;
  - *field*: section, width in section columns, **Required**, position, and removal from the form.
- Drag the edges of the window to resize it. `Ctrl+Z` and `Ctrl+Y` undo and redo every change made in the designer.
- With the keyboard, `Enter` adds the selected field to the selected section, the arrow keys move the selected item and `Delete` removes it.
- **Save** stores the form, together with any other settings changes still pending, and closes the designer. **Cancel** drops the designer changes, and **Restore default layout** rebuilds the default form.
- In the desktop app on Windows, the designer bar doubles as the title bar: drag it to move the window, and its buttons stay clear of the minimize, maximize and close buttons.

The real editor uses the chosen width and height but never exceeds the app window: its content scrolls when needed, and narrow windows stack the layout columns. Fields left off the form keep their values when a task is saved, including rich text and custom values, and new tasks still initialize them normally. List columns are not affected. Deleted columns disappear from the form, and new columns join the section that holds fields of the same kind.

Layouts are stored per organization in the portable workspace and included in settings exports and backups. Importing settings remaps custom field references by the existing column matching rules. Layouts from 2.50 are converted to the equivalent sections, and older archives receive the default form. Downgrading is not supported: OrbitKanban 2.50.0 cannot open a workspace once 2.60.0 has saved it.

### Required fields

Mark a field as **Required** in the field properties of the form designer, or with the **Required** box of each column in **Settings → Column management**, for both tasks and issues. **Sequence** is required by default; this is the setting behind its asterisk, and it can be turned off like any other.

- Required fields show an asterisk. Saving a task or an issue with an empty required field highlights it with a message and keeps the editor open.
- Task fields are checked only when they are on the form, as in model-driven forms; the designer warns about a required field left off the form.
- **Bulk edit** cannot clear a required release date or highlight. CSV imports and organization imports are not checked.
- Yes/no fields, tags, successor (**Reference child**) columns, the incidents and problems resolved from Linked issues, and the computed **Link** column of Linked issues cannot be required.
- Deleting a column also removes it from the required fields.

## Appearance

### Themes

**Settings → Themes & atmosphere** offers a searchable gallery of **40 built-in themes**, 27 dark and 13 light, available in every organization:

- **Dark:** Midnight, Ocean, Aurora, Monokai, Dracula, Nord, Solarized Dark, Gruvbox Dark, Tokyo Night, One Dark, Material Ocean, GitHub Dark, Synthwave, Ayu Dark, Everforest, Catppuccin Mocha, Rosé Pine, Forest, Graphite, Obsidian, Deep Space, Blue Hour, Copper, Plum, Burgundy, Desert Night, Emerald.
- **Light:** Daylight, Solarized Light, Gruvbox Light, GitHub Light, Paper, Pearl, Sandstone, Mist, Sage Light, Lavender Light, Rose Quartz, Iceberg, Mint.

Every theme has four colors: background, surface, text and accent. Built-in palettes keep text at a contrast of at least 4.5:1 and the accent at least 3:1 against both background and surface. Built-in themes can be modified per organization and reset with **Restore built-in theme**. **Create theme** adds custom themes, which can be edited and deleted.

**Generate from an image.** Load an image and all four colors are extracted and assigned automatically:

- the darkest color becomes the background, the lightest the text, a saturated color the accent, and the remaining one the surface;
- since 2.21.0 extracted palettes meet **WCAG AA**: colors that already pass are untouched, and others change only in lightness (in OKLCH space), keeping hue and saturation;
- the background is never changed, and a message lists the adjusted roles.

You can also pick a role and click the image to sample a color manually; manual choices are not corrected. PNG, JPEG, WebP, GIF (first frame) and BMP files up to 15 MB are supported, resized to 1600 px at most. Images are processed in memory only and never stored or uploaded.

### Color picker

Every color in the app (labels, highlighters, tags and theme colors) uses the same built-in picker, styled like the rest of the app:

- a saturation/lightness area and hue, saturation and lightness sliders, all usable with the keyboard;
- HEX input with 3 or 6 digits, with or without `#`;
- theme and palette swatches.

**Apply** or `Enter` accepts the color. **Cancel**, `Esc` or clicking outside restores the previous color.

### Fonts

**Settings → Font and text size** offers **33 fonts**:

- **24 bundled fonts that work offline:** Roboto, Inter, Open Sans, Lato, Montserrat, Poppins, Nunito, Nunito Sans, Raleway, Rubik, Work Sans, Source Sans 3, Noto Sans, DM Sans, Manrope, Fira Sans, Noto Serif, Merriweather, Lora, Playfair Display, Source Serif 4, Roboto Slab, Fira Code and JetBrains Mono.
- **9 system fonts, used when installed:** Segoe UI (default), Aptos, Arial, Calibri, Verdana, Tahoma, Trebuchet MS, Georgia and Consolas. Proprietary fonts are not redistributed; a fallback is used when one is missing.

Bundled fonts come from Google Fonts and are always served from local files, including in browser access. The Latin and Latin Extended subsets total about 2.2 MB. [Sources and checksums](fonts/sources.json) and the license texts (SIL OFL 1.1, and Apache 2.0 for Roboto Slab) are in [fonts](fonts/).

### Text size

Seven parts of the interface can be scaled independently in 5% steps, each with a realistic preview:

- general text, dialogs and page headings: 80–140%;
- sidebar: 80–130%;
- tables, milestone view and kanban view: 80–150%.

The **Compact** (85%), **Standard** (100%), **Large** (115%) and **Extra large** (130%) presets set every part at once.

### Icons and controls

The interface uses a single set of vector icons that work offline:

- **Feature icons** (navigation, settings tabs, export types) use colored gradients that adapt to the active theme and keep at least 3:1 contrast.
- **Command icons** (close, arrows, sort, filter) are line icons in the text color.

Buttons follow one size scale:

- 32 px for top-bar controls;
- 36 px for toolbar buttons;
- 30 px for small and icon-only buttons;
- 28 px for row actions.

## Languages and translations

English and Italian are built in. **Settings → Language & translations** selects the organization language, which applies to the interface, dates and effort units. User content and custom names are never translated.

To add a language without rebuilding the app:

1. Press **Open languages folder** to open `data/languages`, which contains `en.template.json`, the complete English pack.
2. Copy it as `<code>.json`, for example `de.json`, and set `code`, `name` (shown in the menu) and `locale` (for dates and numbers, such as `de-DE`).
3. Translate the **values only**. Keys are the English source text, and placeholders such as `{0}` and markers such as `**bold**` must be kept.
   - `messages` holds interface text;
   - `terms` holds default names, demo content and the guide;
   - `plurals` holds counted forms (`zero`, `one`, `two`, `few`, `many`, with `other` required).

   Missing values fall back to English, so translation can be gradual.
4. Press **Reload languages**, choose the new language, and save.

A file named after a built-in language, such as `it.json`, overrides only the texts it contains. Invalid files (bad JSON, mismatched code, or larger than 2 MB) are listed under **Ignored language files** and skipped. Language files travel with the `data` folder.

## Import and export

### Full backup

**Export backup** saves the entire workspace as JSON, including every organization, logo, theme and setting. **Import backup** replaces the whole workspace after confirmation and rejects invalid files.

### Organization export and import

**Settings → Export and import organization** exports the active organization as separate JSON files:

| Button | Content |
| --- | --- |
| **Export themes** | All themes and the active theme |
| **Export settings** | Language, tab names, hours per day, font, text sizes, statuses, urgencies, highlighters, tags, columns (with their platform templates) and logo |
| **Export data** | Tasks and issues, with the catalogs needed to map them |
| **Export everything** | All of the above in one file |

**Import from file** accepts OrbitKanban exports up to 32 MB. It validates the file before changing anything and lets you pick which parts to import:

- **Themes** with matching identifiers are updated, and the rest are added.
- **Settings** replace the current ones. Tasks are remapped to statuses and urgencies by name, then by position. The logo is replaced only if you choose to.
- **Data** can be imported with **Add and update**, which updates tasks with the same identifier, adds the rest and never duplicates identical issues. **Replace everything** replaces the current tasks and issues instead.
- The destination can be **this organization** or **a new organization**.

### CSV import

**Import CSV** in either list adds rows from a `.csv` or `.tsv` file (up to 16 MB, 100 columns and 10,000 data rows).

1. Choose the separator (automatic, comma, semicolon or tab), the encoding (UTF-8, Windows-1252 or UTF-16 LE) and whether the file has a header row.
2. Map each column to a built-in or custom field, or choose **Do not import**. Common English and Italian names are recognized automatically.
3. Review the preview and the per-cell errors. **Nothing is saved until every error is fixed.**
4. Press **Import rows**. The whole import can be undone with `Ctrl+Z`.

Accepted values:

| Kind | Accepted format |
| --- | --- |
| Dates | `YYYY-MM-DD` or `DD/MM/YYYY` |
| Numbers | Dot or comma as decimal separator, no thousands separators |
| Yes/no | `yes`, `no`, `true`, `false`, `1`, `0`, `sì` |
| Catalogs | Name or identifier; multiple values separated by a vertical bar (`\|`) |

Descriptions and notes are imported as plain text, with line breaks preserved.

### Excel export

The **Excel** button in every view and in the selection bar exports the current situation as an `.xlsx` workbook. You choose which tasks (as shown, all, or selected), which columns (visible or all) and which sheets to include:

| Sheet | Content |
| --- | --- |
| **Summary** | Organization, date, app version, active filters, totals, and breakdowns by status and urgency |
| **Tasks** | One row per task with clickable codes and links, real Excel dates in the app's colors, and colored statuses, urgencies and highlights; header frozen and filters enabled |
| **Linked issues** | Issues with linked task counts and duplicate markers |
| **Milestones** | One row per release, with the next release highlighted and unscheduled tasks at the end |
| **Kanban** | One column per status |

The default file name is `OrbitKanban-<organization>-situation-<date>.xlsx`. The workbook is generated locally with no extra components.

## Browser access

While the app is running, the same interface is available in a browser **on the same PC** at `http://127.0.0.1:47821`. Another port is chosen automatically if that one is busy.

- **Open in browser**, under the organization menu, opens the current organization. Each tab can show a different organization, and its address (`?org=…`) can be bookmarked.
- Changes sync live between the app and all tabs. Concurrent edits are reapplied on top of fresh data instead of overwriting it, and unsaved settings drafts are preserved.
- The server listens on **127.0.0.1 only**. The first visit uses a personal access link from **Settings → Browser access → Copy access link**, after which the browser keeps a protected session cookie. **Do not share the access link.** To revoke all sessions, delete `data/runtime/browser-access-token` while the app is closed.
- When the app closes, tabs show **App not reachable**. Reopen the app and reload the tab to continue.
- Exports, imports and platform links work in the browser too. Installing updates is available only in the desktop app.

## Updates

**Settings → App & updates** checks the latest stable release of [ZenPluS/OrbitKanban](https://github.com/ZenPluS/OrbitKanban/releases) without any token or account.

- **Check for updates at startup** is on by default. The preference is stored in `data/updates/settings.json` and applies to the whole portable copy.
- **Check for updates** only checks and never downloads.
- When a newer version is detected, a persistent banner appears in every desktop view. **View update** opens **App & updates**, protecting unsaved settings. Dismissing it leaves an update badge in the top bar; the same version stays dismissed for the session, while a newer version is announced again. Downloading and installation are never triggered just by opening the notification.
- **Download update** shows progress and verifies the size and SHA-256 digest published by GitHub. It accepts only the portable executable of this repository and HTTPS redirects to GitHub download hosts. Older versions, pre-releases and unverifiable packages are never installed.
- **Install and restart** asks for confirmation and saves a full copy of the workspace. A small PowerShell helper then waits for the app to close, re-checks the hash, replaces the executable atomically and restarts the app. No administrator rights are needed.
- If the new version cannot start, the helper restores the previous executable and reports the error. The downloaded file, `previous.exe`, `workspace-before-update.json` and the install log stay in a per-update folder under `data/updates`. Delete those folders once the new version works; keep `settings.json`.
- You can always update manually: close the app, replace the executable and keep `data`.

Versions earlier than 2.45.0 must be updated manually once. From 2.45.0 onward, updates are available in the app.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `F1` | Open the in-app guide |
| `Ctrl+K` | Search tasks and issues |
| `Ctrl+B` | Collapse or expand the sidebar |
| `Ctrl+N` | Create a task from the task list |
| `Ctrl+Z` | Undo the last change |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo the last undone change |
| `Esc` | Close a dialog, cancel a drag, stop the highlighter or clear the selection |
| `Shift+click` | Sort by more columns, or select a range of tasks |
| Double-click | Edit a task or an association |
| `↑` / `↓` | Move a row or an option from its drag handle |
| `Enter` | Open the first global search result, or apply a color |

## Privacy and security

- **No telemetry and no accounts.** Data stays in the local `data` folder.
- The only network traffic is the optional update check and download, which use GitHub's public API and download hosts. No tasks, issues, themes, logos or local paths are sent.
- Fonts, icons and images are local. Images used for theme generation are processed in memory only.
- Rich text is sanitized: active content, remote images and unsupported HTML are removed. CSV descriptions are imported as plain text.
- Browser access listens on 127.0.0.1 only and requires a secret key.
- Update packages are verified with SHA-256. The verification protects download integrity but does not replace a code signature, so SmartScreen may still warn about the unsigned executable.

## Troubleshooting

| Symptom | Solution |
| --- | --- |
| SmartScreen blocks the first launch | Choose **More info → Run anyway**. The executable is not signed. |
| The taskbar pin opens a second icon or shows a blank page icon | The pin was created by a version before 2.45.0. Unpin it and pin the running app again, or pin the desktop shortcut from **Settings → App & updates**. |
| The app starts with an empty workspace | The `data` folder was not copied next to the executable. Close the app and move `data` beside it. |
| Saving fails with a write error | The folder is read-only, or the app is running from inside a ZIP archive. Move the executable and `data` to a writable folder. |
| The browser shows **App not reachable** | The desktop app is closed. Start it and reload the tab. |
| An update fails | The helper restores the previous executable automatically. Rollback files are in `data/updates`. You can also replace the executable manually. |
| A language does not appear | Check **Ignored language files** in **Settings → Language & translations**. |

## Development

### Prerequisites and scripts

Node.js with npm is required only to develop or build. Recipients of the executable need nothing else.

```powershell
npm ci           # install dependencies
npm start        # run the app from source (data is stored in the project's data folder)
npm test         # unit tests (node --test)
npm run check    # syntax check of every source file
npm run smoke    # end-to-end UI smoke test on an isolated temporary workspace
npm run icon     # generate app-logo.png and build/icon.ico from app-logo.svg
npm run splash   # generate the launcher splash image and animation from splash.html
npm run dist     # build dist/OrbitKanban-Portable.exe
```

The application version comes from `package.json` and is shown in the sidebar and splash screen. If the previous executable is still running, use `npm run dist -- --out dist-staging` to build without overwriting it.

All source code, tests, scripts and documentation are in English. Interface text uses the English string as its key, and every new string needs an entry in both `languages/en.json` and `languages/it.json`.

### Project structure

| File | Purpose |
| --- | --- |
| `main.js`, `preload.js`, `window-chrome.js` | Electron main process, secure bridge and custom title bar |
| `portable.js`, `splash.js`, `splash.html`, `splash-preload.js` | Portable paths, single instance, taskbar identity and splash screen |
| `renderer.js`, `index.html`, `styles.css` | User interface |
| `core.js` | Data model, defaults, validation, migrations and portable task editor layout |
| `columns.js`, `csv.js`, `xlsx.js` | Column schemas and filters, CSV parsing, Excel writer (no external dependencies) |
| `guide.js` | In-app guide content |
| `icons.js`, `app-logo.svg`, `app-icon.js` | Icon set, app logo and Windows icon generation |
| `i18n.js`, `languages.js`, `languages/` | Translation engine, external language loader and built-in language packs |
| `workspace-store.js` | Atomic persistence, backups and organization transfer |
| `web-server.js`, `web-bridge.js` | Local browser access server and client bridge |
| `updater.js`, `update-launcher.js`, `install-update.ps1` | Update check, download, verification and installation |
| `build.js`, `make-splash.js`, `splash-image.js`, `build/` | Packaging with electron-builder and launcher customization |
| `build-and-push.ps1`, `github-release.js` | Build, test, commit, push and GitHub release pipeline |
| `smoke.js`, `smoke-web.js`, `smoke-windows.js` | End-to-end smoke tests |
| `fonts/` | Bundled WOFF2 fonts, sources and licenses |
| `*.test.js` | Unit tests, including layout validation and import/export in `task-layout.test.js` and required fields in `required-fields.test.js` |

### Build, test and release

`build-and-push.ps1` is the complete release pipeline. It has no machine-specific paths: everything is resolved from `$PSScriptRoot`, and a test guards against hard-coded Windows paths. It works with PowerShell 7 and Windows PowerShell 5.1.

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\build-and-push.ps1 -Message "Describe the change"
```

The script:

1. Checks the repository: active branch, no merge or rebase in progress, not behind the remote, and no unwanted files (`data`, `dist`, `node_modules`, executables, archives, or files over 5 MB).
2. Runs `npm run check`, `npm test` and the smoke test from source, including the form designer, required fields, task layout persistence, preservation of values left off the form and update notifications.
3. Builds the portable executable into `dist-staging\<version>` and verifies its version and embedded icon.
4. Smoke-tests the packaged app and the portable launcher in isolated temporary folders.
5. Copies the tested executable to `dist\OrbitKanban-Portable.exe`, or to `dist\OrbitKanban-Portable-<version>.exe` when the former is running.
6. Commits (an empty commit records a verified rebuild), tags `v<version>` for new versions, pushes atomically and verifies the remote.
7. Creates or updates the GitHub release with `OrbitKanban-Portable.exe`, verifying size and SHA-256 before publishing.

| Option | Effect |
| --- | --- |
| `-Message` | Commit subject; defaults to `OrbitKanban <version>` |
| `-NoDeliver` | Skip copying to `dist`, while still publishing the release |
| `-NoCoAuthor` | Omit the Copilot `Co-authored-by` trailer |
| `-Remote` | Use a remote other than `origin` |

The remote must be on github.com. Credentials come from `GH_TOKEN`/`GITHUB_TOKEN` or Git Credential Manager and need **Contents: write** permission. They are never written to files or passed as command arguments.

Tags are never moved. Bump the version before releasing new sources:

```powershell
npm version minor --no-git-tag-version --ignore-scripts
```

For a specifically numbered release, use `npm version 2.70.0 --no-git-tag-version --ignore-scripts` instead. To update the local portable copy too, run the pipeline **without `-NoDeliver`** and close the app first. The script replaces only the executable, not `dist/data`.

The script refuses to reuse a tagged version for different sources. If a build or test fails, nothing is committed or pushed.

## Release history

| Version | Changes |
| --- | --- |
| **2.70.0** | **Link to platform** columns, one per platform with their own templates, replace the organization portal link (migrated automatically); **Website** columns; **Reference parent/child** columns for predecessors and automatic successors; guide contents keep the last section highlighted |
| **2.60.2** | The portable launcher keeps its splash screen on screen until the main window is open, with no blank gap or second loading window |
| **2.60.1** | Form designer bar works as the Windows title bar and keeps its buttons clear of the window controls; a single **Save** replaces **Apply** and **Save settings** |
| **2.60.0** | Full-screen form designer for the task editor with drag and drop, custom sections, layout columns and window size; configurable required fields for tasks and issues |
| **2.50.0** | Per-organization task editor layout settings with preview, field ordering and visibility; persistent update notifications and top-bar shortcut |
| **2.47.1** | Smooth, reversible sidebar animation with label fades and support for reduced motion |
| **2.47.0** | Collapsible sidebar: **☰** or `Ctrl+B` folds it into a column of icons with tooltips and counters |
| **2.46.0** | Searchable in-app guide covering every feature (sidebar **Guide**, `F1`); README rewritten in English |
| **2.45.0** | Verified in-app updates from GitHub releases; single taskbar identity for the portable launcher; desktop shortcut |
| **2.23.x** | Custom color picker for every color; round theme swatches in every window size |
| **2.22.0** | Built-in columns can be deleted; unified label editor for statuses, urgencies, highlights, tags and choices |
| **2.21.0** | WCAG AA contrast for image-generated themes; gradient vector icons; unified control sizes |
| **2.20.0** | Source code fully in English; Italian moved to its own language pack |
| **2.19.0** | Date filters pick from existing dates; automatic views per release date |
| **2.18.0** | 33 interface fonts; pending custom columns saved with settings |
| **2.17.0** | Colored labels for choice columns |
| **2.16.0** | Column filters, custom columns and CSV import |
| **2.15.0** | Wide task editor |
| **2.13.0** | Themed custom title bar on Windows |
| **2.12.0** | Scroll position preserved across saves; multi-line previews in tables |
| **2.11.0** | Catalog of 40 built-in themes |
| **2.10.0** | Excel export and bulk edit |
| **2.9.0** | Duplicate detection by incident |
| **2.8.0** | Drag-and-drop reordering |
| **2.7.0** | Tags |
| **2.6.0** | Row highlighters and configurable list columns |
| **2.5.0** | One file per language; external language packs |
| **2.4.0** | Splash screen and lighter package |
| **2.3.0** | Tabbed settings and theme gallery |
| **2.2.0** | Adjustable text size |
| **2.1.0** | Per-organization export and import |
| **2.0.0** | Browser access, multiple organizations (workspace format 2) and new demo data |
