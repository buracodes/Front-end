import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RAG_LABELS, ragToneClass } from '../dashboard-widget-registry';
import { TableColumn, TableRow } from '../role-dashboard.model';

/**
 * Server-driven table renderer: the backend sends the column set, the alignment
 * and the cell type, so one table component serves every tabular widget
 * (KPI, goal, scorecard, division, initiative, budget, audit, ...).
 */
@Component({
  selector: 'app-dashboard-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './dashboard-table.component.html',
  styleUrl: './dashboard-table.component.scss',
})
export class DashboardTableComponent {
  readonly columns = input.required<TableColumn[]>();
  readonly rows = input.required<TableRow[]>();
  readonly emptyMessage = input<string | null>(null);
  readonly showRowLinks = input<boolean>(true);
  readonly maxHeight = input<string | null>(null);

  readonly rowSelected = output<TableRow>();

  protected readonly ragLabels = RAG_LABELS;
  protected readonly ragTone = ragToneClass;

  protected readonly hasRows = computed(() => this.rows().length > 0);

  protected cell(row: TableRow, column: TableColumn): string | number | boolean | null {
    return row.cells[column.key] ?? null;
  }

  /** Turns a free-form backend status into a css modifier ("On hold" -> "on-hold"). */
  protected slug(value: string | number | boolean | null): string {
    if (value == null) {
      return 'unknown';
    }

    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  protected display(row: TableRow, column: TableColumn): string {
    const value = this.cell(row, column);
    if (value == null || value === '') {
      return '—';
    }

    switch (column.format) {
      case 'percent':
        return `${value}%`;
      case 'money':
        return typeof value === 'number' ? this.money(value) : String(value);
      case 'date':
        return this.date(value);
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      case 'rag':
        return RAG_LABELS[value as keyof typeof RAG_LABELS] ?? String(value);
      default:
        return String(value);
    }
  }

  private money(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private date(value: string | number | boolean): string {
    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
  }
}
