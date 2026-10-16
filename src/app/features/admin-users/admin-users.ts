import { Component, inject, signal } from '@angular/core';
import { ColDef } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { AppUser } from './admin-users.model';
import { AdminUserService } from './admin-users.service';
import { NotificationService } from '../../core/service/notification.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';

@Component({
  selector: 'app-admin-users',
  imports: [GridTable],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsersPage {
  private readonly userService = inject(AdminUserService);
  private readonly notifications = inject(NotificationService);

  readonly rows = signal<AppUser[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly columnDefs: ColDef[] = [
    { field: 'fullName', headerName: 'Name', sortable: true, filter: true, flex: 1 },
    { field: 'username', headerName: 'Username', sortable: true, filter: true },
    { field: 'email', headerName: 'Email', sortable: true, filter: true },
    {
      field: 'isActive',
      headerName: 'Status',
      sortable: true,
      filter: true,
      valueGetter: (params) => (params.data?.isActive ? 'Active' : 'Inactive'),
    },
    {
      field: 'roles',
      headerName: 'Roles',
      valueGetter: (params) => (params.data?.roles ?? []).join(', '),
      flex: 1,
    },
    { field: 'lastLoginAtUtc', headerName: 'Last Login', sortable: true },
  ];

  constructor() {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.userService.getAll().subscribe({
      next: (data) => this.rows.set(data),
      error: (err) => { this.loadError.set(toApiError(err).message); this.loading.set(false); },
      complete: () => this.loading.set(false),
    });
  }
}
