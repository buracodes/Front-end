import { actionsColumn, ActionsCellItem, EDIT_DELETE_ACTIONS } from './grid-table-actions';

interface Row {
  id: string;
  name: string;
}

describe('actionsColumn', () => {
  const render = (col: ReturnType<typeof actionsColumn<Row>>): string =>
    (col.cellRenderer as () => string)();

  it('offers edit and delete by default, with delete marked destructive and separated', () => {
    const keys = EDIT_DELETE_ACTIONS.map((item: ActionsCellItem) => item.key);

    expect(keys).toEqual(['edit', 'delete']);
    expect(EDIT_DELETE_ACTIONS.find((i) => i.key === 'delete')?.danger).toBe(true);
    expect(EDIT_DELETE_ACTIONS.find((i) => i.key === 'delete')?.separated).toBe(true);
  });

  it('builds a pinned, unsortable, unfilterable trailing column', () => {
    const col = actionsColumn<Row>(() => undefined);

    expect(col.colId).toBe('actions');
    expect(col.headerName).toBe('Actions');
    expect(col.sortable).toBe(false);
    expect(col.filter).toBe(false);
    expect(col.resizable).toBe(false);
    expect(col.cellClass).toBe('actions-cell');
  });

  it('renders an accessible kebab button that the grid can hook into', () => {
    const html = render(actionsColumn<Row>(() => undefined));

    expect(html).toContain('class="actions-menu-btn"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('<svg');
  });

  it('passes custom items and the row through to the callback', () => {
    const seen: Array<[string, Row]> = [];
    const col = actionsColumn<Row>(
      (key, row) => seen.push([key, row]),
      [
        { key: 'edit', label: 'Edit' },
        { key: 'configure', label: 'Configure Target' },
        { key: 'delete', label: 'Delete', danger: true },
      ],
    );

    const params = col.cellRendererParams as {
      items: ActionsCellItem[];
      onAction: (key: string, row: Row) => void;
    };
    expect(params.items.map((i) => i.label)).toEqual(['Edit', 'Configure Target', 'Delete']);

    const row: Row = { id: 'g-1', name: 'Grow revenue' };
    params.onAction('configure', row);

    expect(seen).toEqual([['configure', row]]);
  });
});
