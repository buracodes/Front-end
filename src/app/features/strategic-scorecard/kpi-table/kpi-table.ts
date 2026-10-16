import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { KPI } from '../../../core/model/goal.model';
import { ScoreSnapshotEntry } from '../../../core/service/kpi.service';
import { ragFromScore, scoreColor } from '../workspace-state.service';

@Component({
  selector: 'app-kpi-table',
  imports: [DecimalPipe, LowerCasePipe],
  templateUrl: './kpi-table.html',
  styleUrl: './kpi-table.scss',
})
export class KpiTable {
  kpis = input.required<KPI[]>();
  snapshots = input<Map<string, ScoreSnapshotEntry>>(new Map());
  trends = input<Map<string, 'up' | 'down' | 'stable'>>(new Map());
  loading = input(false);

  openDetails = output<KPI>();
  manage = output<KPI>();

  readonly rows = computed(() =>
    this.kpis().map((kpi, index) => {
      const snap = this.snapshots().get(kpi.id);
      const score = snap?.score ?? null;
      const rag = ragFromScore(score);
      const trend = this.trends().get(kpi.id) ?? 'stable';
      return {
        kpi,
        code: `KPI-${String(index + 1).padStart(3, '0')}`,
        score,
        rag,
        trend,
        actual: snap?.actualValue ?? null,
        target: snap?.targetValue ?? null,
      };
    })
  );

  ragLabel(rag: 'Green' | 'Amber' | 'Red'): string {
    return rag;
  }

  trendArrow(trend: 'up' | 'down' | 'stable'): string {
    return trend === 'up' ? '▲' : trend === 'down' ? '▼' : '■';
  }

  scoreTone(score: number | null): string {
    return scoreColor(score);
  }
}