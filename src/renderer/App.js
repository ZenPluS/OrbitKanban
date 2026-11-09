// Root of the interface: creates every component, wires them in order and loads the workspace.
import { Component } from './core/Component.js';
import { AppState } from './core/AppState.js';
import { RichText } from './text/RichText.js';
import { Notifier } from './feedback/Notifier.js';
import { ChangeHistory } from './workspace/ChangeHistory.js';
import { TaskPresenter } from './tasks/TaskPresenter.js';
import { TagMenu } from './tasks/TagMenu.js';
import { ColorPicker } from './controls/ColorPicker.js';
import { TaskFilter } from './tasks/TaskFilter.js';
import { ThemePainter } from './appearance/ThemePainter.js';
import { LogoPainter } from './appearance/LogoPainter.js';
import { Sidebar } from './layout/Sidebar.js';
import { AppShell } from './layout/AppShell.js';
import { SectionNavigator } from './layout/SectionNavigator.js';
import { SettingsController } from './settings/SettingsController.js';
import { OrganizationManager } from './organizations/OrganizationManager.js';
import { ColumnCatalog } from './columns/ColumnCatalog.js';
import { CustomCells } from './columns/CustomCells.js';
import { ColumnFilterPanel } from './columns/ColumnFilterPanel.js';
import { TaskList } from './tasks/TaskList.js';
import { SavedViews } from './tasks/SavedViews.js';
import { ViewsPage } from './tasks/ViewsPage.js';
import { GroupsPage } from './groups/GroupsPage.js';
import { GroupEditor } from './groups/GroupEditor.js';
import { TaskRows } from './tasks/TaskRows.js';
import { BulkEdit } from './tasks/BulkEdit.js';
import { RowMarks } from './tasks/RowMarks.js';
import { SortableList } from './controls/SortableList.js';
import { ColumnEditor } from './columns/ColumnEditor.js';
import { ModalDialog } from './dialogs/ModalDialog.js';
import { GlobalSearch } from './dialogs/GlobalSearch.js';
import { FieldEditors } from './controls/FieldEditors.js';
import { CsvImportDialog } from './transfer/CsvImportDialog.js';
import { TaskForm } from './tasks/TaskForm.js';
import { TaskDialog } from './tasks/TaskDialog.js';
import { IssueList } from './issues/IssueList.js';
import { MilestoneView } from './milestones/MilestoneView.js';
import { KanbanView } from './kanban/KanbanView.js';
import { GuideView } from './guide/GuideView.js';
import { ExcelExport } from './transfer/ExcelExport.js';
import { TransferPanel } from './transfer/TransferPanel.js';
import { FontSettings } from './settings/FontSettings.js';
import { BackupSettings } from './settings/BackupSettings.js';
import { CustomColumnSettings } from './settings/CustomColumnSettings.js';
import { TaskLayoutSettings } from './settings/TaskLayoutSettings.js';
import { FormDesigner } from './settings/FormDesigner.js';
import { UpdateSettings } from './settings/UpdateSettings.js';
import { SettingsView } from './settings/SettingsView.js';
import { LanguageSettings } from './settings/LanguageSettings.js';
import { LogoSettings } from './settings/LogoSettings.js';
import { OptionListSettings } from './settings/OptionListSettings.js';
import { NavigationSettings } from './settings/NavigationSettings.js';
import { ThemeSettings } from './settings/ThemeSettings.js';
import { Toolbar } from './layout/Toolbar.js';
import { SmokeTests } from './diagnostics/SmokeTests.js';

export class App extends Component {
  constructor() {
    super();
    this.app = this;
    this.state = new AppState();
    this.richText = new RichText(this);
    this.notifier = new Notifier(this);
    this.history = new ChangeHistory(this);
    this.presenter = new TaskPresenter(this);
    this.tagMenu = new TagMenu(this);
    this.colorPicker = new ColorPicker(this);
    this.taskFilter = new TaskFilter(this);
    this.themePainter = new ThemePainter(this);
    this.logoPainter = new LogoPainter(this);
    this.sidebar = new Sidebar(this);
    this.shell = new AppShell(this);
    this.sections = new SectionNavigator(this);
    this.settings = new SettingsController(this);
    this.organizationManager = new OrganizationManager(this);
    this.columns = new ColumnCatalog(this);
    this.cells = new CustomCells(this);
    this.columnFilterPanel = new ColumnFilterPanel(this);
    this.taskList = new TaskList(this);
    this.savedViews = new SavedViews(this);
    this.viewsPage = new ViewsPage(this);
    this.groupsPage = new GroupsPage(this);
    this.groupEditor = new GroupEditor(this);
    this.taskRows = new TaskRows(this);
    this.bulkEdit = new BulkEdit(this);
    this.rowMarks = new RowMarks(this);
    this.sortable = new SortableList(this);
    this.columnEditor = new ColumnEditor(this);
    this.modal = new ModalDialog(this);
    this.globalSearch = new GlobalSearch(this);
    this.fieldEditors = new FieldEditors(this);
    this.csvImport = new CsvImportDialog(this);
    this.taskForm = new TaskForm(this);
    this.taskDialog = new TaskDialog(this);
    this.issues = new IssueList(this);
    this.milestones = new MilestoneView(this);
    this.kanban = new KanbanView(this);
    this.guide = new GuideView(this);
    this.excel = new ExcelExport(this);
    this.transfer = new TransferPanel(this);
    this.fontSettings = new FontSettings(this);
    this.backups = new BackupSettings(this);
    this.customColumns = new CustomColumnSettings(this);
    this.taskLayout = new TaskLayoutSettings(this);
    this.formDesigner = new FormDesigner(this);
    this.updates = new UpdateSettings(this);
    this.settingsView = new SettingsView(this);
    this.languages = new LanguageSettings(this);
    this.logo = new LogoSettings(this);
    this.optionLists = new OptionListSettings(this);
    this.navigationSettings = new NavigationSettings(this);
    this.themes = new ThemeSettings(this);
    this.toolbar = new Toolbar(this);
    this.smokeTests = new SmokeTests(this);
    this.boot = this.boot.bind(this);
  }
  async boot() {
    try {
      if (!window.workspace) throw new Error(this.t("Start the app using OrbitKanban-Portable.exe or npm start, not by opening the HTML file directly."));
      try { await this.languages.loadLanguages(); }
      catch (error) { console.error('Languages not loaded:', error); }
      const loaded = await this.workspaceApi.load();
      this.shell.adoptSnapshot(loaded); await this.sections.openFirst().catch(error => { this.shell.render(); this.notifier.notify(error.message, true); }); this.shell.subscribe();
      if (!this.browserMode() && window.workspace.updates) {
        if (!this.state.updateSubscribed) { window.workspace.onUpdate(this.updates.adoptUpdateState); this.state.updateSubscribed = true; }
        this.updates.adoptUpdateState(await this.workspaceApi.updates());
      }
    } catch (error) {
      this.$('#content').innerHTML = this.ui`<section class="fatal-error"><h1>Cannot open the workspace</h1><p>${this.esc(this.t(error.message))}</p><p>Check folder write permissions and preserve the existing archive before making changes.</p><button class="button" id="retry-load">Retry</button></section>`;
      this.$('#retry-load').onclick = this.boot;
      this.notifier.notify(error.message, true);
    } finally {
      window.workspace?.ready?.();
    }
  }
  start() {
    this.presenter.install();
    this.tagMenu.install();
    this.colorPicker.install();
    this.themePainter.install();
    this.sidebar.install();
    this.organizationManager.install();
    this.cells.install();
    this.rowMarks.install();
    this.milestones.install();
    this.guide.install();
    this.excel.install();
    this.toolbar.install();
    this.smokeTests.install();
    this.boot();
  }
}
