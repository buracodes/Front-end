import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

/**
 * AG Grid v33+ ships every feature as an opt-in module. Without this registration the
 * grid silently drops the features the application relies on: cell renderers and
 * `cellClass` (the row actions button), the pagination panel, filters, sorting and the
 * overlay templates. Importing this file once per grid entry point registers them.
 */
ModuleRegistry.registerModules([AllCommunityModule]);
