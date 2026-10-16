import { ColDef } from 'ag-grid-community';

export interface ActionsCellItem {
  key: string;
  label: string;
  danger?: boolean;
  /** Divider is drawn above this item, e.g. to separate destructive actions. */
  separated?: boolean;
}

export interface ActionsCellParams<T> {
  items?: ActionsCellItem[];
  onAction?: (key: string, row: T) => void;
}

/** Vertical ellipsis, drawn inline so the cell needs no extra assets or fonts. */
const KEBAB_SVG =
  '<svg class="actions-menu-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
  '<circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" />' +
  '</svg>';

/** The standard pair offered on every management grid. */
export const EDIT_DELETE_ACTIONS: ActionsCellItem[] = [
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete', danger: true, separated: true },
];

/**
 * Builds the trailing "Actions" column that opens the row dropdown handled by
 * `GridTable`. `onAction` receives the chosen key and the row, so features keep full
 * control over what edit and delete do for their own model.
 */
export function actionsColumn<T>(
  onAction: (key: string, row: T) => void,
  items: ActionsCellItem[] = EDIT_DELETE_ACTIONS,
): ColDef<T> {
  return {
    headerName: 'Actions',
    colId: 'actions',
    sortable: false,
    filter: false,
    resizable: false,
    suppressHeaderMenuButton: true,
    cellClass: 'actions-cell',
    cellRenderer: (): string =>
      `<button type="button" class="actions-menu-btn" aria-label="Row actions" aria-haspopup="menu" title="Actions">${KEBAB_SVG}</button>`,
    minWidth: 64,
    maxWidth: 72,
    cellRendererParams: { items, onAction } satisfies ActionsCellParams<T>,
  };
}
