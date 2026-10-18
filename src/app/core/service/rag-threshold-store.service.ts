import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RagThresholdConfiguration } from '../model/rag-threshold.model';
import { DEFAULT_RAG_BANDS, RagBands, RagBand, ragBandFromScore } from '../model/rag-band';
import { RagThresholdsService } from './rag-threshold.service';

/**
 * FR-607: the effective RAG thresholds, loaded once and shared by every view (dashboard, reports,
 * strategic scorecard, KPI details, score planning, division planning) so the same score always
 * bands the same way. Falls back to the FRD defaults until - or unless - the API responds.
 */
@Injectable({ providedIn: 'root' })
export class RagThresholdStore {
  private readonly api = inject(RagThresholdsService);

  private readonly _bands = signal<RagBands>(DEFAULT_RAG_BANDS);
  private readonly _config = signal<RagThresholdConfiguration | null>(null);
  private readonly _loading = signal(false);
  private load?: Promise<void>;

  /** Effective boundaries (FRD defaults until the API responds). */
  readonly bands = this._bands.asReadonly();
  readonly green = computed(() => this._bands().green);
  readonly yellow = computed(() => this._bands().yellow);
  /** Full configuration as served by the API, or null while unavailable. */
  readonly config = this._config.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    void this.ensureLoaded();
  }

  /** Loads the configuration once; later calls await the same request. */
  ensureLoaded(): Promise<void> {
    this.load ??= this.reload();
    return this.load;
  }

  async reload(): Promise<void> {
    this._loading.set(true);
    try {
      const response = await firstValueFrom(this.api.get());
      this.apply(response?.data ?? null);
    } catch {
      // Keep the FRD defaults; every view still bands consistently.
    } finally {
      this._loading.set(false);
    }
  }

  /** Applies a configuration (used after reload and after an admin update). */
  apply(config: RagThresholdConfiguration | null): void {
    this._config.set(config);
    if (!config || typeof config.green !== 'number' || typeof config.yellow !== 'number') {
      return;
    }
    this._bands.set({ green: config.green, yellow: config.yellow });
  }

  /** Bands a score with the effective thresholds. A missing score is "NoData" (Gray), never Red. */
  bandFor(score: number | null | undefined): RagBand {
    return ragBandFromScore(score, this._bands());
  }
}
