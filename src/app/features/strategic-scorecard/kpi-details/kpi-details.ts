import { Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { ScorecardWorkspaceState } from '../workspace-state.service';
import { ragFromScore, scoreColor } from '../workspace-state.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-kpi-details-drawer',
  imports: [DecimalPipe, LowerCasePipe, LucideDynamicIcon],
  templateUrl: './kpi-details.html',
  styleUrl: './kpi-details.scss',
})
export class KpiDetailsDrawer {
  readonly state = inject(ScorecardWorkspaceState);

  open = input(false);
  closed = output<void>();

  readonly kpi = this.state.selectedKpi;
  readonly snapshot = computed(() => {
    const kpi = this.kpi();
    if (!kpi) return null;
    return this.state.kpiSnapshots().get(kpi.id) ?? null;
  });

  readonly rag = computed(() => ragFromScore(this.snapshot()?.score ?? null));
  readonly trend = computed(() => this.state.kpiTrends().get(this.kpi()?.id ?? '') ?? 'stable');

  close(): void {
    this.closed.emit();
  }

  trendArrow(trend: 'up' | 'down' | 'stable'): string {
    return trend === 'up' ? '▲' : trend === 'down' ? '▼' : '■';
  }

  tone(score: number | null | undefined): string {
    return scoreColor(score);
  }

  sendToManagement(): void {
    window.location.href = '/kpis';
  }
}