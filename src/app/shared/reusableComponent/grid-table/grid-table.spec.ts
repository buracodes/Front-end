import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ColDef } from 'ag-grid-community';
import { GridTable } from './grid-table';
import { actionsColumn } from './grid-table-actions';
import { spmsGridTheme } from './spms-grid-theme';

interface Row {
  id: string;
  name: string;
}

@Component({
  imports: [GridTable],
  template: `<app-grid-table [rowData]="rows()" [columnDefs]="columnDefs" [height]="'420px'" />`,
})
class Host {
  readonly rows = signal<Row[]>([
    { id: 'g-1', name: 'Grow revenue' },
    { id: 'g-2', name: 'Retain talent' },
  ]);
  readonly acted: Array<[string, Row]> = [];
  readonly columnDefs: ColDef<Row>[] = [
    // `filter: true` on purpose: the grid must suppress it, because filtering goes
    // through the filter bar above each grid rather than the header menus.
    { field: 'name', headerName: 'Name', filter: true },
    actionsColumn<Row>((key, row) => this.acted.push([key, row])),
  ];
}

describe('GridTable', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let host: Host;

  const gridRoot = (): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('.ag-root-wrapper');

  const click = (element: Element | null): void => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  beforeAll(() => {
    // jsdom has no layout engine, so every box is 0x0. AG Grid skips column and row
    // layout work at zero width, so hand it a believable viewport.
    const box: DOMRect = {
      x: 0, y: 0, top: 0, left: 0, right: 900, bottom: 44, width: 900, height: 44,
      toJSON: () => ({}),
    } as DOMRect;
    for (const prop of ['clientWidth', 'offsetWidth'] as const) {
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value: 900 });
    }
    for (const prop of ['clientHeight', 'offsetHeight'] as const) {
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value: 600 });
    }
    HTMLElement.prototype.getBoundingClientRect = () => box;
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  });

  /**
   * AG Grid creates custom cell renderers asynchronously (through its own promise
   * chain), so a single `whenStable()` is not enough for cell content to exist.
   */
  async function flushGrid(target: ComponentFixture<unknown> = fixture): Promise<void> {
    target.detectChanges();
    await target.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    target.detectChanges();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await flushGrid();
  });

  /** AG Grid reports unregistered modules through the console; capture those calls. */
  function captureGridErrors(): { messages: string[]; restore: () => void } {
    const seen: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      seen.push(args.map(String).join(' '));
      original(...args);
    };
    return {
      messages: seen,
      restore: () => {
        console.error = original;
      },
    };
  }

  it('registers the modules the grid depends on (cell renderers, cell class, pagination)', async () => {
    const errors = captureGridErrors();
    const fresh = TestBed.createComponent(Host);
    await flushGrid(fresh);
    errors.restore();

    const gridErrors = errors.messages.filter((m) => m.includes('AG Grid: error'));
    expect(gridErrors).toEqual([]);
    // The actions cell only gets its styles when CellStyle is registered, which is
    // what keeps the kebab button visible and centred.
    expect((fresh.nativeElement as HTMLElement).querySelector('.actions-cell .actions-menu-btn'))
      .toBeTruthy();
    // ... and the pagination panel only exists with the Pagination module.
    expect((fresh.nativeElement as HTMLElement).querySelector('.ag-paging-panel')).toBeTruthy();
  });

  it('renders the themed grid with rows and headers', () => {
    expect(gridRoot()).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.ag-header-cell').length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Grow revenue');
  });

  it('uses the SPMS Theming API theme instead of the legacy CSS theme class', () => {
    const grid = (fixture.nativeElement as HTMLElement).querySelector('ag-grid-angular');

    expect((gridTable() as unknown as { theme: unknown }).theme).toBe(spmsGridTheme);
    expect(grid?.classList.contains('ag-theme-quartz')).toBe(false);
  });

  it('opens the row dropdown with edit and delete', () => {
    const kebab = (fixture.nativeElement as HTMLElement).querySelector('.actions-menu-btn');
    expect(kebab).toBeTruthy();
    expect(kebab?.getAttribute('aria-haspopup')).toBe('menu');

    click(kebab);
    fixture.detectChanges();

    const menu = (fixture.nativeElement as HTMLElement).querySelector('.actions-dropdown-menu');
    expect(menu).toBeTruthy();
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(Array.from(menu?.querySelectorAll('.dropdown-item') ?? []).map((b) => b.textContent?.trim()))
      .toEqual(['Edit', 'Delete']);
  });

  it('runs the chosen action with the row it came from and closes the menu', () => {
    click((fixture.nativeElement as HTMLElement).querySelector('.actions-menu-btn'));
    fixture.detectChanges();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.dropdown-item');
    click(items[1]);
    fixture.detectChanges();

    expect(host.acted).toEqual([['delete', { id: 'g-1', name: 'Grow revenue' }]]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.actions-dropdown-menu')).toBeNull();
  });

  it('closes the dropdown on an outside click', () => {
    click((fixture.nativeElement as HTMLElement).querySelector('.actions-menu-btn'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.actions-dropdown-menu')).toBeTruthy();

    click(document.body);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.actions-dropdown-menu')).toBeNull();
  });

  it('suppresses the header filter and menu buttons while keeping sorting', async () => {
    // The column def asks for a filter; the grid must drop it because filtering
    // happens through the filter bar above each grid.
    const table = gridTable() as { displayColumns: () => ColDef[]; defaultColDef: ColDef };
    const nameColumn = table.displayColumns().find((c) => c.field === 'name');

    expect(nameColumn?.filter).toBe(false);
    expect(nameColumn?.floatingFilter).toBe(false);
    expect(nameColumn?.suppressHeaderMenuButton).toBe(true);
    expect(nameColumn?.suppressHeaderContextMenu).toBe(true);

    // Sorting is the one header affordance that stays, through the default col def.
    expect(table.defaultColDef.sortable).toBe(true);
    expect(table.defaultColDef.suppressHeaderMenuButton).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.ag-header-cell-filter-button, .ag-header-cell-filter'))
      .toBeNull();
  });

  function gridTable(): unknown {
    return fixture.debugElement.children[0].componentInstance;
  }
});

