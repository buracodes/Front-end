import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { Division } from './division.model';
import { DivisionService } from './division.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import {
  PASSWORD_REQUIREMENTS_MESSAGE,
  passwordPolicyValidator,
} from '../../core/validation/password-policy';
import { actionsColumn, GridTable } from '../../shared/reusableComponent/grid-table/grid-table';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-division',
  imports: [GridTable, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './division.html',
  styleUrl: './division.scss',
})
export class DivisionPage {
  private readonly divisionService = inject(DivisionService);
  private readonly notifications = inject(NotificationService);
  private readonly userStore = inject(UserStore);

  readonly rows = signal<Division[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);

  readonly showResetForm = signal(false);
  readonly resetting = signal(false);
  readonly selectedDivision = signal<Division | null>(null);

  readonly passwordRequirementsMessage = PASSWORD_REQUIREMENTS_MESSAGE;

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)],
    }),
  });

  readonly resetForm = new FormGroup({
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, passwordPolicyValidator()],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  get columnDefs(): ColDef[] {
    const columns: ColDef[] = [
      { field: 'name', headerName: 'Name', sortable: true, filter: true, flex: 1 },
      { field: 'code', headerName: 'Code', sortable: true, filter: true },
      { field: 'createdDate', headerName: 'Created', sortable: true, filter: true },
    ];

    if (this.canResetDivisionPasswords) {
      columns.push(
        actionsColumn<Division>(
          (key, row) => {
            if (key === 'reset-password') {
              this.openResetModal(row);
            }
          },
          [{ key: 'reset-password', label: 'Reset Password' }]
        )
      );
    }

    return columns;
  }

  constructor() {
    this.loadDivisions();
  }

  get canResetDivisionPasswords(): boolean {
    return this.userStore.hasPermission('admin:users.manage');
  }

  loadDivisions(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.divisionService.getAll().subscribe({
      next: (divisions) => this.rows.set(divisions),
      error: (error) => {
        this.loadError.set(toApiError(error).message);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  openAddModal(): void {
    this.form.reset({ name: '', code: '' });
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.form.reset({ name: '', code: '' });
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    this.divisionService
      .create({
        name: this.form.controls.name.value,
        code: this.form.controls.code.value,
      })
      .subscribe({
        next: () => {
          this.notifications.success('Division created. A Data Input login with username and default password equal to the division code was also created.');
          this.onCancelEdit();
          this.loadDivisions();
        },
        error: (error) => {
          this.notifications.error(toApiError(error).message);
          this.submitting.set(false);
        },
        complete: () => this.submitting.set(false),
      });
  }

  openResetModal(division: Division): void {
    this.resetForm.reset({ newPassword: '', confirmPassword: '' });
    this.selectedDivision.set(division);
    this.showResetForm.set(true);
  }

  onCancelReset(): void {
    this.resetForm.reset({ newPassword: '', confirmPassword: '' });
    this.selectedDivision.set(null);
    this.showResetForm.set(false);
  }

  onResetPassword(): void {
    const division = this.selectedDivision();

    if (!division || this.resetForm.invalid || this.resetting()) {
      return;
    }

    const { newPassword, confirmPassword } = this.resetForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.notifications.error('New password and confirmation do not match.');
      return;
    }

    if (division.code && newPassword.toLowerCase() === division.code.toLowerCase()) {
      this.notifications.error('New password must not match the division code.');
      return;
    }

    this.resetting.set(true);

    this.divisionService
      .resetAccountPassword({ divisionId: division.id, newPassword, confirmPassword })
      .subscribe({
        next: () => {
          this.resetting.set(false);
          this.onCancelReset();
          this.notifications.success(
            `Password reset for the '${division.name}' account. Share the new password securely.`
          );
        },
        error: (error) => {
          this.notifications.error(toApiError(error).message);
          this.resetting.set(false);
        },
      });
  }
}
