import { Theme, themeQuartz } from 'ag-grid-community';

/**
 * SPMS grid theme.
 *
 * The grid is styled through the AG Grid Theming API (the v33+ default) instead of the
 * legacy `ag-grid.css` + `ag-theme-quartz` class combination, which used to be imported
 * as well and fought with the injected theme. Colours mirror the design tokens in
 * `styles.scss` so the grid looks native next to the rest of the application.
 */
const spmsParams = {
  accentColor: '#18552c',
  backgroundColor: '#ffffff',
  foregroundColor: '#0f172a',
  borderColor: '#e2e8f0',
  borderRadius: 8,
  spacing: 6,

  fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
  fontSize: 14,
  cellFontSize: 14,
  cellTextColor: '#1e293b',
  cellHorizontalPadding: 16,

  // Header: quiet, uppercase, brand green rule underneath.
  headerBackgroundColor: '#f6f8f7',
  headerTextColor: '#475569',
  headerFontSize: 12,
  headerFontWeight: 700,
  headerHeight: 44,
  headerCellHoverBackgroundColor: '#eef4ef',
  headerColumnBorder: { color: '#e2e8f0' },
  headerColumnBorderHeight: 1,
  headerColumnResizeHandleColor: '#cbd5e1',

  // Rows: comfortable density, hairline separators, faint banding.
  rowHeight: 48,
  rowBorder: { color: '#eef2f7' },
  columnBorder: { color: '#eef2f7' },
  oddRowBackgroundColor: '#fbfcfb',
  rowHoverColor: 'rgba(24, 85, 44, 0.06)',
  columnHoverColor: 'rgba(24, 85, 44, 0.035)',
  selectedRowBackgroundColor: 'rgba(24, 85, 44, 0.1)',

  // The card frame is drawn in `grid-table.css` so the shadow can be tuned with the layout.
  wrapperBorder: false,
  wrapperBorderRadius: 0,

  iconSize: 16,
  iconColor: '#64748b',
  checkboxCheckedBackgroundColor: '#18552c',
  checkboxUncheckedBorderColor: '#cbd5e1',
  checkboxBorderRadius: 4,

  menuBackgroundColor: '#ffffff',
  menuBorder: { color: '#e2e8f0' },
  popupShadow: '0 12px 28px -8px rgba(15, 23, 42, 0.25)',
  tooltipBackgroundColor: '#0f172a',

  paginationPanelHeight: 48,
} as const;

export const spmsGridTheme: Theme = themeQuartz.withParams(spmsParams);

/**
 * Variant for grids embedded inside an existing card (division planning, for example),
 * where the grid must blend into the surrounding panel instead of drawing its own frame.
 */
export const spmsEmbeddedGridTheme: Theme = spmsGridTheme.withParams({
  backgroundColor: 'transparent',
  headerBackgroundColor: 'transparent',
  wrapperBorder: false,
  rowBorder: { color: 'var(--color-border)' },
  rowHoverColor: 'var(--color-surface-muted)',
  cellFontSize: 13,
  cellHorizontalPadding: 10,
  rowHeight: 44,
});
