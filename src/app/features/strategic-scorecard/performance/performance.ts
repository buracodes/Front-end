import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ScorecardWorkspaceState, fiscalMonthLabel, ragFromScore, scoreColor } from '../workspace-state.service';

import { LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-performance',
  imports: [DecimalPipe, LucideDynamicIcon],
  templateUrl: './performance.html',
  styleUrl: './performance.scss',
})
export class PerformancePage {
  readonly state = inject(ScorecardWorkspaceState);

  readonly overall = this.state.overallScore;
  readonly delta = this.state.overallDelta;
  readonly trend = this.state.scorecardTrend;
  readonly goals = this.state.scorecardGoals;
  readonly goalScores = this.state.goalScores;
  readonly kpis = this.state.kpis;
  readonly kpiSnapshots = this.state.kpiSnapshots;
  readonly kpiTrends = this.state.kpiTrends;

  readonly W = 720;
  readonly H = 220;
  readonly PAD = 8;

  readonly points = computed(() => {
    const trend = this.trend();
    if (!trend.length) return '';
    return trend
      .map((e) => `${this.x(e.fiscalMonth).toFixed(1)},${this.y(e.score).toFixed(1)}`)
      .join(' ');
  });

  readonly area = computed(() => {
    const trend = this.trend();
    if (!trend.length) return '';
    const minMonth = Math.min(...trend.map((e) => e.fiscalMonth));
    const maxMonth = Math.max(...trend.map((e) => e.fiscalMonth));
    const pts = trend.map((e) => `${this.x(e.fiscalMonth).toFixed(1)},${this.y(e.score).toFixed(1)}`).join(' ');
    return `${this.x(minMonth).toFixed(1)},${this.H - this.PAD} ${pts} ${this.x(maxMonth).toFixed(1)},${this.H - this.PAD}`;
  });

  readonly kpisRanked = computed(() => {
    return this.kpis()
      .map((kpi) => {
        const snap = this.kpiSnapshots().get(kpi.id);
        return { kpi, score: snap?.score ?? null, rag: ragFromScore(snap?.score ?? null), trend: this.kpiTrends().get(kpi.id) ?? 'stable' };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  });

  readonly goalsBreakdown = computed(() => {
    return this.goals()
      .map((goal) => {
        const snap = this.goalScores().get(goal.id);
        return { goal, score: snap?.score ?? null, rag: ragFromScore(snap?.score ?? null) };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  });

  readonly redFlags = computed(() => this.kpisRanked().filter((k) => k.rag === 'Red').length);
  readonly amberFlags = computed(() => this.kpisRanked().filter((k) => k.rag === 'Amber').length);
  readonly targetsHit = computed(() => this.kpisRanked().filter((k) => (k.score ?? -1) >= 70).length);

  readonly bestKpi = computed(() => this.kpisRanked()[0] ?? null);
  readonly worstKpi = computed(() => this.kpisRanked()[this.kpisRanked().length - 1] ?? null);

  overallRag(): string {
    return ragFromScore(this.overall());
  }

  tone(score: number | null | undefined): string {
    return scoreColor(score);
  }

  trendArrow(trend: 'up' | 'down' | 'stable'): string {
    return trend === 'up' ? '▲' : trend === 'down' ? '▼' : '■';
  }

  x(month: number): number {
    return this.PAD + ((month - 1) / 11) * (this.W - this.PAD * 2);
  }

  y(score: number | null | undefined): number {
    const s = score ?? 0;
    return this.PAD + ((100 - s) / 100) * (this.H - this.PAD * 2);
  }

  monthLabel(m: number): string {
    return fiscalMonthLabel(this.state.selectedFiscalYear()?.startDate, m);
  }

  deltaTone(): 'up' | 'down' | 'flat' {
    const d = this.delta();
    if (d === null) return 'flat';
    return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  }

  absDelta(): number {
    return Math.abs(this.delta() ?? 0);
  }

  goalAvg(): number {
    const s = this.goalsBreakdown().map((g) => g.score).filter((v) => v !== null) as number[];
    if (!s.length) return 0;
    return s.reduce((a, b) => a + b, 0) / s.length;
  }

  barColor(score: number | null): string {
    return scoreColor(score);
  }

  insight(): string {
    const o = this.overall();
    const d = this.delta();
    if (o === null) return 'Not enough data to draw performance insights yet. Enter actuals and recalculate scores.';
    const base = `Overall performance is <strong>${o.toFixed(1)}</strong> (${this.overallRag()}).`;
    if (d !== null && d !== 0) {
      return `${base} ${d > 0 ? 'Improving' : 'Declining'} by <strong>${Math.abs(d).toFixed(1)}</strong> point${Math.abs(d) === 1 ? '' : 's'} vs the previous period.`;
    }
    return `${base} No change vs the previous period.`;
  }
}