import { Injectable } from '@angular/core';
import { graphic } from 'echarts/core';

export const SPMS_COLORS = {
  green: '#16a34a',
  greenLight: '#dcfce7',
  amber: '#d97706',
  amberLight: '#fef3c7',
  red: '#dc2626',
  redLight: '#fee2e2',
  blue: '#2563eb',
  blueLight: '#dbeafe',
  primary: '#18552c',
  primaryDark: '#124522',
  accent: '#feb044',
  accentDark: '#e8982f',
  slate: '#64748b',
  slateLight: '#94a3b8',
  bg: '#f1f5f9',
  surface: '#ffffff',
} as const;

@Injectable({ providedIn: 'root' })
export class DashboardChartConfig {

  readonly brandGreen = SPMS_COLORS.green;
  readonly brandAmber = SPMS_COLORS.amber;
  readonly brandRed = SPMS_COLORS.red;
  readonly brandBlue = SPMS_COLORS.blue;
  readonly brandPrimary = SPMS_COLORS.primary;
  readonly brandAccent = SPMS_COLORS.accent;
  readonly brandSlate = SPMS_COLORS.slate;

  get surface(): string { return SPMS_COLORS.surface; }
  get slateText(): string { return SPMS_COLORS.slate; }
  get borderColor(): string { return '#e2e8f0'; }

  axisStyle(): object {
    return {
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: SPMS_COLORS.slate, fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    };
  }

  tooltipAxis(): object {
    return {
      trigger: 'axis',
      backgroundColor: SPMS_COLORS.surface,
      borderColor: '#e2e8f0',
      borderWidth: 1,
    };
  }

  gaugeOption(value: number, label = 'Overall Performance'): object {
    return {
      series: [{
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '90%',
        axisLine: {
          lineStyle: { width: 20, color: [[1, new graphic.LinearGradient(0, 0, 1, 1, [
            { offset: 0, color: SPMS_COLORS.greenLight },
            { offset: 1, color: SPMS_COLORS.primary },
          ])]] },
        },
        pointer: { itemStyle: { color: SPMS_COLORS.primary } },
        axisTick: { distance: -20, length: 6, lineStyle: { color: '#e2e8f0' } },
        splitLine: { distance: -25, length: 20, lineStyle: { color: '#e2e8f0', width: 2 } },
        axisLabel: { color: SPMS_COLORS.slate, distance: 30, fontSize: 11 },
        detail: {
          valueAnimation: true,
          formatter: (v: number) => `${v.toFixed(1)}%`,
          color: SPMS_COLORS.primary,
          fontSize: 28,
          fontWeight: 700,
          offsetCenter: [0, '70%'],
        },
        title: { offsetCenter: [0, '90%'], color: SPMS_COLORS.slate, fontSize: 13 },
        data: [{ value, name: label }],
      }],
    };
  }

  ragDonut(data: { name: string; value: number; color: string }[]): object {
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11, color: SPMS_COLORS.slate } },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 4, borderColor: SPMS_COLORS.surface, borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 700, color: SPMS_COLORS.primary } },
        data: data.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
      }],
    };
  }

  trendOption(periods: string[], scores: number[], target?: number[]): object {
    const series: object[] = [{
      name: 'Performance',
      type: 'line',
      data: scores,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: SPMS_COLORS.primary, width: 3 },
      itemStyle: { color: SPMS_COLORS.primary },
      areaStyle: {
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(24, 85, 44, 0.18)' },
          { offset: 1, color: 'rgba(24, 85, 44, 0.02)' },
        ]),
      },
    }];

    if (target && target.length) {
      series.push({
        name: 'Target',
        type: 'line',
        data: target,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: this.brandAccent, width: 2, type: 'dashed' },
        itemStyle: { color: this.brandAccent },
      });
    }

    return {
      tooltip: this.tooltipAxis(),
      grid: { left: '8%', right: '8%', top: '12%', bottom: '15%' },
      xAxis: { type: 'category', data: periods, ...this.axisStyle() },
      yAxis: { type: 'value', min: 0, max: 100, ...this.axisStyle() },
      series,
    };
  }

  barOption(labels: string[], scores: (number | null)[], colors: string[]): object {
    return {
      tooltip: this.tooltipAxis(),
      grid: { left: '8%', right: '8%', top: '10%', bottom: '15%' },
      xAxis: { type: 'category', data: labels, ...this.axisStyle() },
      yAxis: { type: 'value', min: 0, max: 100, ...this.axisStyle() },
      series: [{
        type: 'bar',
        data: scores.map((s, i) => ({
          value: s ?? 0,
          itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] },
        })),
        barWidth: '45%',
      }],
    };
  }

  /**
   * Comparison chart for goal achievement, division ranking, target vs actual and budget
   * allocation. Values stay `null` when the server has no figure so a missing number renders
   * as an absent bar instead of a misleading zero.
   */
  comparisonBarOption(options: {
    categories: string[];
    series: { name: string; color: string; values: (number | null)[] }[];
    horizontal: boolean;
    categoryColors: string[];
    valueSuffix: string;
    valueFormat: 'number' | 'percent' | 'money';
    axisMin?: number | null;
    axisMax?: number | null;
  }): object {
    const horizontal = options.horizontal;
    const single = options.series.length === 1;
    const suffix = options.valueSuffix;

    const formatter = this.valueFormatter(options.valueFormat, suffix);

    // Ranked comparisons read best left to right, so a horizontal chart is sorted with the
    // axis inverted to keep the highest value at the top.
    const categoryAxis = {
      type: 'category',
      data: options.categories,
      ...this.axisStyle(),
      splitLine: { show: false },
      ...(horizontal ? { inverse: true } : {}),
      axisLabel: {
        color: SPMS_COLORS.slate,
        fontSize: 11,
        width: horizontal ? 140 : undefined,
        overflow: horizontal ? 'truncate' : undefined,
      },
    };

    const valueAxis = {
      type: 'value',
      ...this.axisStyle(),
      ...(options.axisMin != null ? { min: options.axisMin } : {}),
      ...(options.axisMax != null ? { max: options.axisMax } : {}),
      axisLabel: { color: SPMS_COLORS.slate, fontSize: 11, formatter },
    };

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: SPMS_COLORS.surface,
        borderColor: '#e2e8f0',
        borderWidth: 1,
        valueFormatter: (value: unknown) => (value == null ? '-' : `${formatter(value as number)}${suffix}`),
      },
      legend: options.series.length > 1
        ? { bottom: 0, textStyle: { fontSize: 11, color: SPMS_COLORS.slate } }
        : { show: false },
      grid: {
        left: horizontal ? '2%' : '6%',
        right: '6%',
        top: '8%',
        bottom: options.series.length > 1 ? '18%' : '8%',
        containLabel: true,
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: options.series.map((entry) => ({
        name: entry.name,
        type: 'bar',
        data: entry.values.map((value, index) => ({
          // null stays null: no bar is better than a fake zero.
          value,
          itemStyle: {
            color: single ? (options.categoryColors[index] ?? this.brandPrimary) : entry.color,
            borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
          },
        })),
        barMaxWidth: 22,
        barGap: '12%',
      })),
    };
  }

  private valueFormatter(format: 'number' | 'percent' | 'money', suffix: string): (value: number) => string {
    switch (format) {
      case 'money':
        return (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
      case 'percent':
        return (value: number) => `${value.toFixed(1)}${suffix}`;
      default:
        return (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`;
    }
  }

  /**
   * Chart for a widget that ships its own series (performance trend, milestone
   * completion). Keeps the SPMS axis, tooltip and legend styling in one place.
   */
  multiSeriesOption(
    categories: string[],
    series: object[],
    yAxis: object = {},
    legendBottom = 0
  ): object {
    return {
      tooltip: this.tooltipAxis(),
      legend: series.length > 1
        ? { bottom: 0, textStyle: { fontSize: 11, color: SPMS_COLORS.slate } }
        : { show: false },
      grid: { left: '8%', right: '4%', top: '10%', bottom: series.length > 1 ? '18%' : legendBottom ? '18%' : '12%' },
      xAxis: { type: 'category', data: categories, ...this.axisStyle() },
      yAxis: { type: 'value', ...this.axisStyle(), ...yAxis },
      series,
    };
  }
}
