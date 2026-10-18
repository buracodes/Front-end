import { Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { KPI } from '../../../core/model/goal.model';
import { ScoreSnapshotEntry } from '../../../core/service/kpi.service';
import { RagThresholdStore } from '../../../core/service/rag-threshold-store.service';
import { ragDisplayLabel, ragSlug } from '../../../core/model/rag-band';
import { ragFromScore, scoreColor } from '../workspace-state.service';

@Component({
  selector: 'app-kpi-table',
  imports: [DecimalPipe],
  templateUrl: './kpi-table.html',
  styleUrl: './kpi-table.scss',
})
export class KpiTable {
  private readonly thresholds = inject(RagThresholdStore);

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
      const bands = this.thresholds.bands();
      const rag = ragFromScore(score, bands);
      const trend = this.trends().get(kpi.id) ?? 'stable';
      return {
        kpi,
        code: `KPI-${String(index + 1).padStart(3, '0')}`,
        score,
        rag,
        ragSlug: ragSlug(rag),
        ragLabel: ragDisplayLabel(rag),
        trend,
        actual: snap?.actualValue ?? null,
        target: snap?.targetValue ?? null,
      };
    })
  );

  trendArrow(trend: 'up' | 'down' | 'stable'): string {
    return trend === 'up' ? '▲' : trend === 'down' ? '▼' : '■';
  }

  scoreTone(score: number | null): string {
    return scoreColor(score, this.thresholds.bands());
  }
}
