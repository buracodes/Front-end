import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { Division } from './division.model';
import { DivisionService } from './division.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';

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

  get columnDefs(): ColDef[] {
    return [
      { field: 'name', headerName: 'Name', sortable: true, filter: true, flex: 1 },
      { field: 'code', headerName: 'Code', sortable: true, filter: true },
      { field: 'createdDate', headerName: 'Created', sortable: true, filter: true },
    ];
  }

  constructor() {
    this.loadDivisions();
  }

  get canManageDivisions(): boolean {
    return this.userStore.hasPermission('divisions:manage');
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
          this.notifications.success('Division created.');
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
}
