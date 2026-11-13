// Shared classes (src/shared) are loaded as classic scripts by index.html and register under globalThis.OrbitKanban.
// Re-exported here so the interface modules can import them by name.
const { Localization, Columns, Domain, Graphics, Interop, Guide } = globalThis.OrbitKanban;
export const { Translator } = Localization;
export const { ColumnCleanup, ColumnFilters, ColumnLayout, ColumnMerger, ColumnSchema, ColumnValidator, PlatformLinks, RequiredFields } = Columns;
export const { ArchiveValidator, Common, DataFactory, IssueMatcher, Limits, NavigationSections, OrganizationTransfer, TaskColumns, TaskGroups, TaskLayout, TaskLinks, TaskOrder, ThemeCatalog, TodoLists, Typography } = Domain;
export const { AppLogo, ColorMath, IconLibrary, ThemeGenerator } = Graphics;
export const { CsvImporter, CsvParser, XlsxWriter, ZipWriter } = Interop;
export const { GuideContent } = Guide;
