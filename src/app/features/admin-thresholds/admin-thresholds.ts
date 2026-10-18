import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserStore } from '../../core/service/user-store.service';
import { NotificationService } from '../../core/service/notification.service';
import { RagThresholdsService } from '../../core/service/rag-threshold.service';
import {
  RagThresholdConfiguration,
  UpdateRagThresholds,
} from '../../core/model/rag-threshold.model';
import { ragBandFromScore, ragDisplayLabel, ragToneClass } from '../../core/model/rag-band';
import { toApiError } from '../../core/model/api-error';

/** Sample scores rendered as a live band preview next to the form. */
const PREVIEW_SCORES = [100, 95, 90, 70, 69, 0, null] as const;

@Component({
  selector: 'app-admin-thresholds',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-thresholds.html',
  styleUrl: './admin-thresholds.scss',
})
export class AdminThresholdsPage {
  private readonly thresholds = inject(RagThresholdsService);
  private readonly userStore = inject(UserStore);
  private readonly notifications = inject(NotificationService);

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly config = signal<RagThresholdConfiguration | null>(null);

  readonly canEdit = computed(() => this.userStore.hasPermission('admin:rag.thresholds.manage'));

  readonly form = new FormGroup({
    green: new FormControl(95, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    yellow: new FormControl(70, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
  });

  /** FR-607 band rule: the Yellow band must sit strictly below the Green band. */
  readonly invalidPair = computed(() => {
    const errors = this.form.controls.yellow.errors ?? this.form.controls.green.errors;
    return errors !== null;
  });

  readonly preview = computed(() => {
    const { green, yellow } = this.form.getRawValue();
    return PREVIEW_SCORES.map((score) => ({
      score,
      band: ragBandFromScore(score, { green, yellow }),
    }));
  });

  readonly sourceLabel = computed(() =>
    this.config()?.source === 'Database' ? 'Stored configuration' : 'FRD defaults',
  );

  bandTone(band: string): string {
    return ragToneClass(band);
  }

  /** User-facing band name: Amber shows as Yellow, no score shows as Gray. */
  bandLabel(band: string): string {
    return ragDisplayLabel(band);
  }

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await new Promise<never | { data?: RagThresholdConfiguration }>(
        (resolve, reject) => this.thresholds.get().subscribe({ next: resolve, error: reject }),
      );
      const config = (response as { data?: RagThresholdConfiguration }).data ?? null;
      this.config.set(config);
      if (config) {
        this.form.patchValue({ green: config.green, yellow: config.yellow });
      }
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.submitting() || !this.canEdit()) {
      return;
    }

    const { green, yellow } = this.form.getRawValue();
    if (this.form.controls.green.invalid || this.form.controls.yellow.invalid) {
      this.notifications.error('Thresholds must be numbers between 0 and 100.');
      return;
    }
    if (yellow >= green) {
      this.notifications.error(
        `The Yellow band must start strictly below the Green band (entered: Green ${green}%, Yellow ${yellow}%).`,
      );
      return;
    }

    this.submitting.set(true);
    try {
      const payload: UpdateRagThresholds = { green, yellow };
      const response = await new Promise<never | { data?: RagThresholdConfiguration }>(
        (resolve, reject) =>
          this.thresholds.update(payload).subscribe({ next: resolve, error: reject }),
      );
      const config = (response as { data?: RagThresholdConfiguration }).data ?? null;
      this.config.set(config);
      if (config) {
        this.form.patchValue({ green: config.green, yellow: config.yellow });
      }
      this.notifications.success('RAG thresholds updated. All dashboards use the new bands.');
    } catch (error) {
      this.notifications.error(toApiError(error).message);
    } finally {
      this.submitting.set(false);
    }
  }
}
