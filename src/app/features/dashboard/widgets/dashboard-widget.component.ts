import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardWidgetPayload, RAG_LABELS, ragToneClass } from '../dashboard-widget-registry';
import {
  AlertListWidget,
  BarChartWidget,
  CompositeWidget,
  GaugeWidget,
  RagBucket,
  RagDistributionWidget,
  StatCard,
  TableRow,
  TrendWidget,
} from '../role-dashboard.model';
import { DashboardChartComponent } from './dashboard-chart.component';
import { DashboardTableComponent } from './dashboard-table.component';
import { RAG_COLOR_BY_RAG } from './rag-colors';

/**
 * Renders one resolved widget payload. The switch is on widget kind, never on
 * the user's role, so every role is served by the same renderer set.
 */
@Component({
  selector: 'app-dashboard-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DashboardChartComponent, DashboardTableComponent],
  templateUrl: './dashboard-widget.component.html',
  styleUrl: './dashboard-widget.component.scss',
})
export class DashboardWidgetComponent {
  readonly payload = input.required<DashboardWidgetPayload>();

  readonly navigate = output<TableRow>();

  protected readonly ragLabels = RAG_LABELS;
  protected readonly ragTone = ragToneClass;
  protected readonly ragColor = RAG_COLOR_BY_RAG;

  protected readonly statCards = computed<StatCard[]>(() => {
    const payload = this.payload();
    return payload.kind === 'statCards' || payload.kind === 'composite' ? payload.payload.cards : [];
  });

  protected readonly gauge = computed<GaugeWidget | null>(() => {
    const payload = this.payload();
    return payload.kind === 'gauge' ? payload.payload : null;
  });

  protected readonly rag = computed<RagDistributionWidget | null>(() => {
    const payload = this.payload();
    return payload.kind === 'ragDistribution' ? payload.payload : null;
  });

  /** The server sends counts; the slices and their share are pure presentation. */
  protected readonly ragBuckets = computed<RagBucket[]>(() => {
    const rag = this.rag();
    if (!rag) {
      return [];
    }

    const share = (count: number): number =>
      rag.total > 0 ? Math.round((count / rag.total) * 100) : 0;

    return [
      { label: 'Green', count: rag.green, percentage: share(rag.green) },
      { label: 'Amber', count: rag.amber, percentage: share(rag.amber) },
      { label: 'Red', count: rag.red, percentage: share(rag.red) },
      { label: 'NoData', count: rag.noData, percentage: share(rag.noData) },
    ];
  });

  protected readonly trend = computed<TrendWidget | null>(() => {
    const payload = this.payload();
    return payload.kind === 'trend' ? payload.payload : null;
  });

  protected readonly barChart = computed<BarChartWidget | null>(() => {
    const payload = this.payload();
    return payload.kind === 'barChart' ? payload.payload : null;
  });

  protected readonly table = computed(() => {
    const payload = this.payload();
    return payload.kind === 'table' ? payload.payload : null;
  });

  protected readonly composite = computed<CompositeWidget | null>(() => {
    const payload = this.payload();
    return payload.kind === 'composite' ? payload.payload : null;
  });

  protected readonly alerts = computed<AlertListWidget | null>(() => {
    const payload = this.payload();
    return payload.kind === 'alerts' ? payload.payload : null;
  });

  protected severityIcon(severity: string): string {
    return severity;
  }
}
