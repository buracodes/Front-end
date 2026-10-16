import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { EChartsCoreOption } from 'echarts/core';
import { DashboardChartConfig, SPMS_COLORS } from '../dashboard-chart-config.service';
import { echarts } from '../echarts.setup';
import { BarChartWidget, RagBucket, TrendWidget, WidgetSeries } from '../role-dashboard.model';

interface SeriesOption {
  type: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Every chart on the role dashboard is built here, on top of the existing SPMS
 * chart configuration. One component means one ECharts integration, one palette
 * and one place to add a chart type later.
 */
@Component({
  selector: 'app-dashboard-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  // Registered here (not in app config) so the chart library ships with the lazy
  // dashboard chunk instead of the initial bundle.
  providers: [provideEchartsCore({ echarts })],
  template: `
    <div class="chart" [style.height.px]="barHeight()">
      <div
        echarts
        class="chart__canvas"
        [options]="option()"
        [autoResize]="true"
      ></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .chart,
      .chart__canvas {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class DashboardChartComponent {
  private readonly config = inject(DashboardChartConfig);

  /** Which SPMS chart to build; the shell passes the payload kind. */
  readonly kind = input.required<'gauge' | 'donut' | 'trend' | 'bar' | 'comparison'>();
  readonly gaugeValue = input<number | null>(null);
  readonly gaugeLabel = input<string>('Overall performance');
  readonly buckets = input<RagBucket[]>([]);
  readonly trend = input<TrendWidget | null>(null);
  readonly barLabels = input<string[]>([]);
  readonly barValues = input<(number | null)[]>([]);
  readonly barColors = input<string[]>([]);
  readonly comparison = input<BarChartWidget | null>(null);
  readonly height = input<number>(240);

  readonly option = computed<EChartsCoreOption>(() => {
    switch (this.kind()) {
      case 'gauge':
        return this.config.gaugeOption(this.gaugeValue() ?? 0, this.gaugeLabel()) as EChartsCoreOption;
      case 'donut':
        return this.config.ragDonut(this.donutData()) as EChartsCoreOption;
      case 'trend':
        return this.trendOption(this.trend());
      case 'bar':
        return this.config.barOption(this.barLabels(), this.barValues(), this.barColors()) as EChartsCoreOption;
      case 'comparison':
        return this.comparisonOption();
    }
  });

  /** Ranked comparisons need more room per bar than the compact single-series bar chart. */
  readonly barHeight = computed<number>(() => {
    const chart = this.comparison();
    if (!chart || this.kind() !== 'comparison') {
      return this.height();
    }

    const rows = Math.max(chart.categories.length, 1);
    return Math.min(Math.max(rows * 34 + 70, 200), 460);
  });

  private comparisonOption(): EChartsCoreOption {
    const chart = this.comparison();
    if (!chart) {
      return {};
    }

    return this.config.comparisonBarOption({
      categories: chart.categories,
      series: chart.series.map((entry) => ({
        name: entry.name,
        color: this.colorFor(entry.color),
        values: entry.values,
      })),
      horizontal: chart.orientation !== 'vertical',
      categoryColors: chart.categoryColors.map((token) => this.colorFor(token)),
      valueSuffix: chart.valueSuffix,
      valueFormat: chart.valueFormat,
      axisMin: chart.axisMin,
      axisMax: chart.axisMax,
    }) as EChartsCoreOption;
  }

  private donutData(): { name: string; value: number; color: string }[] {
    return this.buckets().map((bucket) => ({
      name: bucket.label,
      value: bucket.count,
      color: this.colorFor(bucket.label),
    }));
  }

  private trendOption(trend: TrendWidget | null): EChartsCoreOption {
    if (!trend) {
      return {};
    }

    const isPercent = trend.valueSuffix === '%';
    const series = trend.series.map((entry) => this.seriesOption(entry, isPercent));
    const hasBar = series.some((entry) => entry.type === 'bar');

    return this.config.multiSeriesOption(
      trend.categories,
      series,
      isPercent ? { min: 0, max: 100 } : {},
      hasBar ? 48 : 0
    ) as EChartsCoreOption;
  }

  private seriesOption(series: WidgetSeries, isPercent: boolean): SeriesOption {
    const color = this.colorFor(series.color);

    if (series.kind === 'bar') {
      return {
        name: series.name,
        type: 'bar',
        data: series.values.map((value) => value ?? 0),
        barWidth: '45%',
        itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      };
    }

    return {
      name: series.name,
      type: 'line',
      data: series.values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      connectNulls: false,
      lineStyle: { color, width: 3 },
      itemStyle: { color },
      areaStyle: { color: this.fade(color) },
    };
  }

  private colorFor(token: string | null | undefined): string {
    switch (token) {
      case 'Green':
        return SPMS_COLORS.green;
      case 'Amber':
        return SPMS_COLORS.amber;
      case 'Red':
        return SPMS_COLORS.red;
      case 'NoData':
        return SPMS_COLORS.slateLight;
      case 'accent':
        return SPMS_COLORS.accent;
      case 'slate':
        return SPMS_COLORS.slate;
      case 'blue':
        return SPMS_COLORS.blue;
      default:
        return SPMS_COLORS.primary;
    }
  }

  private fade(color: string): object {
    return {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: `${color}33` },
        { offset: 1, color: `${color}05` },
      ],
    };
  }
}
