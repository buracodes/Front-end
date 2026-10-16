import { Component, computed, ElementRef, HostListener, input, output, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent, CellValueChangedEvent } from 'ag-grid-community';
import { ActionsCellItem, ActionsCellParams } from './grid-table-actions';
import { spmsGridTheme } from './spms-grid-theme';
import './ag-grid-setup';

import { LucideDynamicIcon } from '@lucide/angular';
export { actionsColumn, EDIT_DELETE_ACTIONS } from './grid-table-actions';
export type { ActionsCellItem } from './grid-table-actions';

interface ActionsMenuState<T> {
  items: ActionsCellItem[];
  onAction: (key: string, row: T) => void;
  row: T;
  right: number;
  top: number;
  bottom: number;
  openUp: boolean;
}

@Component({
  selector: 'app-grid-table',
  imports: [AgGridAngular, LucideDynamicIcon],
  templateUrl: './grid-table.html',
  styleUrl: './grid-table.css',
})

export class GridTable<T> {
  rowData = input.required<T[]>();
  columnDefs = input.required<ColDef[]>();

  loading = input(false);
  error = input('No records found');

  pageSize = signal<number>(10);
  selectTable = input(false);

  /** Grid height; defaults to the historical 420px card. */
  height = input('420px');

  selectionChanged = output<T[]>();
  cellValueChanged = output<CellValueChangedEvent<T>>();
  private gridApi = signal<GridApi<T> | null>(null);
  protected readonly selectedRows = computed(() => this.gridApi()?.getSelectedRows() ?? []);

  /**
   * Filtering happens through the filter bar above each grid, so the per column filter
   * buttons are suppressed everywhere and columns only expose sorting.
   */
  protected readonly defaultColDef: ColDef = {
    sortable: true,
    filter: false,
    floatingFilter: false,
    suppressHeaderMenuButton: true,
    suppressHeaderContextMenu: true,
  };

  /** Column definitions with the header menu/filter UI forced off, whatever a feature asked for. */
  protected readonly displayColumns = computed<ColDef[]>(() =>
    this.columnDefs().map((column) => ({
      ...column,
      filter: false,
      floatingFilter: false,
      suppressHeaderMenuButton: true,
      suppressHeaderContextMenu: true,
    })),
  );

  protected readonly theme = spmsGridTheme;

  protected readonly menu = signal<ActionsMenuState<T> | null>(null);

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  onGridReady(event: GridReadyEvent<T>): void {
    this.gridApi.set(event.api);
  }

  onCellValueChanged(event: CellValueChangedEvent<T>): void {
    this.cellValueChanged.emit(event);
  }

  onQuickFilterChanged(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.gridApi()?.setGridOption('quickFilterText', value);
  }

  onSelectionChanged(event: SelectionChangedEvent<T>): void {
    this.selectionChanged.emit(event.api.getSelectedRows());
  }

    protected readonly noRowsTemplate = computed(
    () => `<span>${this.error()}</span>`
  );

  /** Closes on any outside click; opens on the Actions kebab of this grid. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.actions-dropdown-menu')) return;

    const host = this.elementRef.nativeElement;
    const kebab = target?.closest('.actions-menu-btn');
    if (kebab instanceof HTMLElement && host.contains(kebab)) {
      this.openActionsMenu(kebab);
      return;
    }

    // Anything else — another kebab, a cell, the rest of the app — closes the menu.
    this.menu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menu.set(null);
  }

  private openActionsMenu(button: HTMLElement): void {
    const rowEl = button.closest('.ag-row');
    const cell = button.closest('.ag-cell');
    const colId = cell?.getAttribute('col-id');
    const col = this.columnDefs().find((c) => (c.colId ?? (typeof c.field === 'string' ? c.field : undefined)) === colId);
    const params = col?.cellRendererParams as ActionsCellParams<T> | undefined;
    if (!params?.items?.length || !params.onAction) return;
    const rowIndex = rowEl ? Number(rowEl.getAttribute('row-index')) : NaN;
    const api = this.gridApi();
    const row = Number.isFinite(rowIndex) && api ? api.getDisplayedRowAtIndex(rowIndex)?.data : undefined;
    if (!row || !api) return;
    const rect = button.getBoundingClientRect();
    const estimatedHeight = 24 + params.items.length * 38;
    const openUp = window.innerHeight - rect.bottom < estimatedHeight;
    this.menu.set({
      items: params.items,
      onAction: params.onAction,
      row,
      right: window.innerWidth - rect.right + 4,
      top: rect.bottom + 4,
      bottom: window.innerHeight - rect.top + 4,
      openUp,
    });
  }

  runAction(menuState: ActionsMenuState<T>, key: string): void {
    menuState.onAction(key, menuState.row);
    this.menu.set(null);
  }

}