import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toApiError } from '../../core/model/api-error';
import { ScorecardService } from '../../core/service/scorecard.service';
import { DivisionService } from '../division/division.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
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

interface GranularityOption {
  value: ReportGranularity;
  label: string;
}

type PeriodMode = 'month' | 'quarter';

type CardIcon = 'document' | 'target' | 'bars' | 'list' | 'briefcase' | 'building';

/** A template card. Each card maps onto an existing backend template (and breakdown level where relevant). */
interface ReportCard {
  key: string;
  templateId: string;
  level?: ReportLevel;
  title: string;
  subtitle: string;
  icon: CardIcon;
}

@Component({
  selector: 'app-reports',
  imports: [FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsPage implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly divisionService = inject(DivisionService);
  private readonly notifications = inject(NotificationService);
  private readonly userStore = inject(UserStore);

  readonly templates = signal<ReportTemplate[]>([]);
  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly divisions = signal<Division[]>([]);

  readonly templateId = signal<string>('');
  readonly fiscalYearId = signal<string | null>(null);
  readonly scorecardId = signal<string | null>(null);
  readonly divisionId = signal<string | null>(null);
  readonly level = signal<ReportLevel>('kpi');
  readonly granularity = signal<PeriodMode>('quarter');
  readonly fromMonth = signal<number | null>(null);
  readonly toMonth = signal<number | null>(null);
  readonly quarter = signal<number | null>(null);

  readonly envelope = signal<ReportEnvelope | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly monthOptions: number[] = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly quarterOptions: number[] = [1, 2, 3, 4];

  readonly cardDefs: ReportCard[] = [
    { key: 'scorecard-summary', templateId: 'scorecard-performance', level: 'scorecard', title: 'Scorecard summary', subtitle: 'Overall performance by goal and KRA', icon: 'document' },
    { key: 'goal-performance', templateId: 'scorecard-performance', level: 'goal', title: 'Goal performance report', subtitle: 'Scores per goal with trend', icon: 'target' },
    { key: 'kpi-detail', templateId: 'kpi-detail', title: 'KPI performance detail', subtitle: 'Actuals vs targets for selected KPIs', icon: 'bars' },
    { key: 'kra-progress', templateId: 'scorecard-performance', level: 'kra', title: 'KRA progress', subtitle: 'Weighted progress of KRAs and linked KPIs', icon: 'list' },
    { key: 'initiative-list', templateId: 'initiative-status', title: 'Initiative list summary', subtitle: 'Status, priority, owner, budget', icon: 'briefcase' },
    { key: 'division-performance', templateId: 'division-performance', title: 'Division performance', subtitle: 'Division goal and KPI rollup', icon: 'building' },
  ];

  readonly selectedCardKey = signal<string>('scorecard-summary');

  /** Only templates the backend actually offers are shown as cards. */
  readonly cards = computed(() => {
    const available = new Set(this.templates().map((t) => t.id));
    return this.cardDefs.filter(
      (c) =>
        available.has(c.templateId) &&
        // FR-908: division performance is a separately granted capability.
        (c.templateId !== 'division-performance' ||
          this.userStore.hasPermission('divisions:reports.view'))
    );
  });

  /** FR-909: exporting is restricted to roles holding reports:export. */
  readonly canExport = computed(() => this.userStore.hasPermission('reports:export'));

  readonly selectedCard = computed(
    () => this.cardDefs.find((c) => c.key === this.selectedCardKey()) ?? this.cardDefs[0]
  );

  readonly granularityOptions: GranularityOption[] = [
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
  ];

  readonly selectedTemplate = computed(() => this.templates().find((t) => t.id === this.templateId()));

  readonly showScorecard = computed(() => this.selectedTemplate()?.requiresScorecard ?? true);
  readonly showDivision = computed(() => this.templateId() === 'division-performance');
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

  selectCard(card: ReportCard): void {
    this.selectedCardKey.set(card.key);
    this.templateId.set(card.templateId);
    if (card.level) this.level.set(card.level);
    this.envelope.set(null);
    this.loadError.set(null);
  }

  resetFilters(): void {
    this.granularity.set('quarter');
    this.fromMonth.set(null);
    this.toMonth.set(null);
    this.quarter.set(null);
    this.divisionId.set(null);
    this.envelope.set(null);
    this.loadError.set(null);
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
    if (!this.canExport()) {
      this.notifications.error('You do not have permission to export reports.');
      return;
    }
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
    const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return `${day} ${time}`;
  }

  /** "Q1 2026/2027" style label for the period select. */
  quarterLabel(q: number): string {
    const fy = this.fiscalYearLabel();
    return fy ? `Q${q} ${fy}` : `Q${q}`;
  }

  /** Filters actually applied to the generated report, as returned by the API. */
  filtersText(report: ReportEnvelope): string {
    const values = Object.values(report.filters ?? {}).filter((v): v is string => !!v);
    return values.length ? values.join(', ') : 'none';
  }

  headerLabel(column: string): string {
    if (column === 'RAG') return 'Status';
    if (column === 'Weight %') return 'Weight';
    return column;
  }

  /** Weight and score values arrive as bare numbers; show them as percentages. */
  cellText(column: string, value: string | null): string {
    if (value == null || value === '') return '—';
    if (column === 'RAG') return this.ragLabel(value);
    if ((column === 'Weight %' || column === 'Score') && /^-?\d+(\.\d+)?$/.test(value)) return `${value}%`;
    return value;
  }

  ragLabel(value: string | null): string {
    if (value === 'Green') return 'On track';
    if (value === 'Amber') return 'Warning';
    if (value === 'Red') return 'Critical';
    return value ?? '—';
  }

  lowerFirst(text: string): string {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  summaryKeys(report: ReportEnvelope): string[] {
    return report.summary ? Object.keys(report.summary) : [];
  }

  private loadMeta(): void {
    this.reportService.getTemplates().subscribe({
      next: (data) => {
        this.templates.set(data);
        if (!this.templateId()) {
          const card = this.cards().find((c) => c.key === this.selectedCardKey()) ?? this.cards()[0];
          if (card) this.selectCard(card);
          else if (data.length > 0) this.templateId.set(data[0].id);
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
      level: this.templateId() === 'scorecard-performance' ? this.level() : undefined,
      granularity: this.granularity(),
      fromMonth: this.granularity() === 'month' ? (this.fromMonth() ?? undefined) : undefined,
      toMonth: this.granularity() === 'month' ? (this.toMonth() ?? undefined) : undefined,
      quarter: this.granularity() === 'quarter' ? (this.quarter() ?? undefined) : undefined,
    };
    return filter;
  }
}