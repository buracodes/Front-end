import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';
import { toApiError } from '../../core/model/api-error';
import { ScorecardService } from '../../core/service/scorecard.service';
import { DivisionService } from '../division/division.service';
import { NotificationService } from '../../core/service/notification.service';
import { FiscalYear, Scorecard } from '../../core/model/scorecard.model';
import { Division } from '../division/division.model';
import {
  ReportService,
  ReportTemplate,
  ReportEnvelope,
  ReportFilter,
  ReportLevel,
  ReportGranularity,
  ReportExportFormat,
  downloadBlob,
} from './report.service';

interface LevelOption {
  value: ReportLevel;
  label: string;
}

interface GranularityOption {
  value: ReportGranularity;
  label: string;
}

type PeriodMode = 'month' | 'quarter';

@Component({
  selector: 'app-reports',
  imports: [FormsModule, KeyValuePipe],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsPage implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly divisionService = inject(DivisionService);
  private readonly notifications = inject(NotificationService);

  readonly templates = signal<ReportTemplate[]>([]);
  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly divisions = signal<Division[]>([]);

  readonly templateId = signal<string>('');
  readonly fiscalYearId = signal<string | null>(null);
  readonly scorecardId = signal<string | null>(null);
  readonly divisionId = signal<string | null>(null);
  readonly level = signal<ReportLevel>('kpi');
  readonly granularity = signal<PeriodMode>('month');
  readonly fromMonth = signal<number | null>(null);
  readonly toMonth = signal<number | null>(null);
  readonly quarter = signal<number | null>(null);

  readonly envelope = signal<ReportEnvelope | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly monthOptions: number[] = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly quarterOptions: number[] = [1, 2, 3, 4];

  readonly levelOptions: LevelOption[] = [
    { value: 'scorecard', label: 'Scorecard' },
    { value: 'goal', label: 'Goal' },
    { value: 'kra', label: 'KRA' },
    { value: 'kpi', label: 'KPI' },
  ];

  readonly granularityOptions: GranularityOption[] = [
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
  ];

  readonly selectedTemplate = computed(() => this.templates().find((t) => t.id === this.templateId()));

  readonly showScorecard = computed(() => this.selectedTemplate()?.requiresScorecard ?? true);
  readonly showDivision = computed(() => this.templateId() === 'division-performance');
  readonly showLevel = computed(() => this.templateId() === 'scorecard-performance');
  readonly showGranularity = computed(() => this.templateId() !== 'initiative-status');

  readonly showMonthRange = computed(() => this.granularity() === 'month');
  readonly showQuarter = computed(() => this.granularity() === 'quarter');

  readonly fiscalYearLabel = computed(() => {
    const fyId = this.fiscalYearId();
    if (!fyId) return null;
    return this.fiscalYears().find((fy) => fy.id === fyId)?.label ?? null;
  });

  readonly ragColumnIndex = computed(() => this.envelope()?.columns.findIndex((c) => c === 'RAG') ?? -1);

  ngOnInit(): void {
    this.loadMeta();
  }

  onTemplateChange(): void {
    this.envelope.set(null);
  }

  onFiscalYearChange(): void {
    this.envelope.set(null);
    this.loadScorecards(this.fiscalYearId());
  }

  onGranularityChange(): void {
    this.envelope.set(null);
    this.fromMonth.set(null);
    this.toMonth.set(null);
    this.quarter.set(null);
  }

  generate(): void {
    if (!this.currentFilter()) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.reportService.generate(this.currentFilter()!).subscribe({
      next: (result) => {
        this.envelope.set(result);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(toApiError(err).message);
      },
    });
  }

  export(format: ReportExportFormat): void {
    const filter = this.currentFilter();
    if (!filter) return;

    this.exporting.set(true);
    this.reportService.export(filter, format).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
        downloadBlob(blob, `${filter.reportType}-${now}.${format}`);
        this.notifications.success('Report exported.');
      },
      error: (err) => {
        this.exporting.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  ragClass(value: string | null): string {
    if (value === 'Green') return 'rag-green';
    if (value === 'Amber') return 'rag-amber';
    if (value === 'Red') return 'rag-red';
    return '';
  }

  trendClass(value: string | null): string {
    if (value == null || value === '') return '';
    return value.startsWith('+') ? 'trend-up' : value.startsWith('-') ? 'trend-down' : '';
  }

  cellValue(value: string | null): string {
    return value == null || value === '' ? '—' : value;
  }

  prettyKey(key: string): string {
    return key;
  }

  formatGeneratedAt(value: string): string {
    const date = new Date(value);
    return date.toLocaleString();
  }

  summaryKeys(report: ReportEnvelope): string[] {
    return report.summary ? Object.keys(report.summary) : [];
  }

  private loadMeta(): void {
    this.reportService.getTemplates().subscribe({
      next: (data) => {
        this.templates.set(data);
        if (data.length > 0 && !this.templateId()) {
          this.templateId.set(data[0].id);
        }
      },
      error: (err) => this.loadError.set(toApiError(err).message),
    });

    this.scorecardService.getFiscalYears().subscribe({
      next: (data) => this.fiscalYears.set(data),
      error: (err) => this.loadError.set(toApiError(err).message),
    });

    this.loadScorecards(null);

    this.divisionService.getAll().subscribe({
      next: (data) => this.divisions.set(data),
      error: () => {},
    });
  }

  private loadScorecards(fyId: string | null): void {
    this.scorecardId.set(null);
    this.scorecardService.getAll(fyId ?? undefined).subscribe({
      next: (data) => this.scorecards.set(data),
      error: (err) => this.loadError.set(toApiError(err).message),
    });
  }

  private currentFilter(): ReportFilter | null {
    const template = this.selectedTemplate();
    if (!template) {
      this.notifications.error('Please select a report template.');
      return null;
    }

    if (template.requiresScorecard && !this.scorecardId()) {
      this.notifications.error('Please select a scorecard.');
      return null;
    }

    if (this.granularity() === 'month' && this.fromMonth() != null && this.toMonth() != null && this.fromMonth()! > this.toMonth()!) {
      this.notifications.error('From month cannot be after To month.');
      return null;
    }

    const filter: ReportFilter = {
      reportType: template.id,
      scorecardId: this.scorecardId() ?? undefined,
      fiscalYearId: this.fiscalYearId() ?? undefined,
      divisionId: this.templateId() === 'division-performance' && this.divisionId() ? this.divisionId()! : undefined,
      level: this.showLevel() ? this.level() : undefined,
      granularity: this.granularity(),
      fromMonth: this.granularity() === 'month' ? (this.fromMonth() ?? undefined) : undefined,
      toMonth: this.granularity() === 'month' ? (this.toMonth() ?? undefined) : undefined,
      quarter: this.granularity() === 'quarter' ? (this.quarter() ?? undefined) : undefined,
    };
    return filter;
  }
}