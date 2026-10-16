import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * Tree-shaken ECharts setup.
 *
 * The dashboard only draws gauges, donuts, bars and multi-series lines, so only
 * those pieces of the library are registered. Importing the full `echarts`
 * package pushed the initial bundle past the application budget.
 */
echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
]);

export { echarts };
