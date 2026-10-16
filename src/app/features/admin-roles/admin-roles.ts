import { Component, inject, signal } from '@angular/core';
import { ColDef } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { Role } from './admin-roles.model';
import { AdminRoleService } from './admin-roles.service';
import { NotificationService } from '../../core/service/notification.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';

@Component({
  selector: 'app-admin-roles',
  imports: [GridTable],
  templateUrl: './admin-roles.html',
  styleUrl: './admin-roles.scss',
})
export class AdminRolesPage {
  private readonly roleService = inject(AdminRoleService);
  private readonly notifications = inject(NotificationService);

  readonly rows = signal<Role[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly columnDefs: ColDef[] = [
    { field: 'name', headerName: 'Name', sortable: true, filter: true, flex: 1 },
    { field: 'description', headerName: 'Description', flex: 1 },
    { field: 'userCount', headerName: 'Users', type: 'rightAligned', sortable: true },
    { field: 'permissionCount', headerName: 'Permissions', type: 'rightAligned', sortable: true },
  ];

  constructor() {
    this.loadRoles();
  }

  loadRoles(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.roleService.getAll().subscribe({
      next: (data) => this.rows.set(data),
      error: (err) => { this.loadError.set(toApiError(err).message); this.loading.set(false); },
      complete: () => this.loading.set(false),
    });
  }
}
