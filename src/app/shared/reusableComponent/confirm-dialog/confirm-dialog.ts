import { Component, inject } from '@angular/core';
import { ConfirmDialogService } from '../../service/confirm-dialog.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [LucideDynamicIcon],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  readonly dialog = inject(ConfirmDialogService);
}
