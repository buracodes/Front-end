import { Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScorecardWorkspaceState } from '../workspace-state.service';
import { RagThresholdStore } from '../../../core/service/rag-threshold-store.service';
import { ragDisplayLabel, ragSlug } from '../../../core/model/rag-band';
import { ragFromScore, scoreColor } from '../workspace-state.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-kpi-details-drawer',
  imports: [DecimalPipe, LucideDynamicIcon],
  templateUrl: './kpi-details.html',
  styleUrl: './kpi-details.scss',
})
export class KpiDetailsDrawer {
  readonly state = inject(ScorecardWorkspaceState);
  private readonly thresholds = inject(RagThresholdStore);

  open = input(false);
  closed = output<void>();

  readonly kpi = this.state.selectedKpi;
  readonly snapshot = computed(() => {
    const kpi = this.kpi();
    if (!kpi) return null;
    return this.state.kpiSnapshots().get(kpi.id) ?? null;
  });

  readonly rag = computed(() =>
    ragFromScore(this.snapshot()?.score ?? null, this.thresholds.bands()),
  );
  readonly ragLabel = computed(() => ragDisplayLabel(this.rag()));
  readonly ragSlug = computed(() => ragSlug(this.rag()));
  readonly trend = computed(() => this.state.kpiTrends().get(this.kpi()?.id ?? '') ?? 'stable');

  close(): void {
    this.closed.emit();
  }

  trendArrow(trend: 'up' | 'down' | 'stable'): string {
    return trend === 'up' ? '▲' : trend === 'down' ? '▼' : '■';
  }

  tone(score: number | null | undefined): string {
    return scoreColor(score, this.thresholds.bands());
  }

  sendToManagement(): void {
    window.location.href = '/kpis';
  }
}
