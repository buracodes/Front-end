import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { RAG_LABELS, ragToneClass } from '../dashboard-widget-registry';
import { GoalDrilldown, GoalKraDto } from '../role-dashboard.model';

/**
 * Goal drill-down required by the FRD: KRA weight/score/RAG plus the KPI
 * breakdown behind each KRA. Scores come from the calculation engine - the
 * drill-down only lays them out.
 */
interface KpiRow {
  name: string;
  target: string;
  actual: string;
  score: string;
  rag: string | null;
}

@Component({
  selector: 'app-dashboard-goal-drilldown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-goal-drilldown.component.html',
  styleUrl: './dashboard-goal-drilldown.component.scss',
  imports: [LucideDynamicIcon],
})
export class DashboardGoalDrilldownComponent {
  readonly goal = input.required<GoalDrilldown>();
  readonly busy = input<boolean>(false);
  readonly closed = output<void>();

  protected readonly ragLabels = RAG_LABELS;
  protected readonly ragTone = ragToneClass;
  protected readonly expanded = signal<string | null>(null);

  protected readonly columns = [
    { key: 'name', label: 'KRA', format: 'text' as const, align: 'left' as const, width: null },
    { key: 'weight', label: 'Weight', format: 'number' as const, align: 'right' as const, width: null },
    { key: 'kpiCount', label: 'KPIs', format: 'number' as const, align: 'right' as const, width: null },
    { key: 'score', label: 'Score', format: 'percent' as const, align: 'right' as const, width: null },
    { key: 'rag', label: 'Status', format: 'rag' as const, align: 'center' as const, width: null },
  ];

  protected readonly rows = computed(() =>
    this.goal().kras.map((kra) => ({
      id: kra.kraId,
      route: null,
      cells: {
        name: kra.name,
        weight: kra.weight,
        kpiCount: kra.kpiCount,
        score: kra.score,
        rag: kra.ragLabel,
      },
    }))
  );

  protected toggle(kra: GoalKraDto): void {
    this.expanded.update((current) => (current === kra.kraId ? null : kra.kraId));
  }

  protected isExpanded(kra: GoalKraDto): boolean {
    return this.expanded() === kra.kraId;
  }

  protected kpiCells(kra: GoalKraDto): KpiRow[] {
    return kra.kpis.map((kpi) => ({
      name: kpi.name,
      target: kpi.target == null ? '—' : `${kpi.target} ${kpi.unit}`,
      actual: kpi.actual == null ? '—' : `${kpi.actual} ${kpi.unit}`,
      score: kpi.score == null ? '—' : `${kpi.score.toFixed(1)}%`,
      rag: kpi.ragLabel,
    }));
  }

  protected ragText(rag: string | null | undefined): string {
    return rag ? (RAG_LABELS[rag as keyof typeof RAG_LABELS] ?? rag) : '—';
  }
}
