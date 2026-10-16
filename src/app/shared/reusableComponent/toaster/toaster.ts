import { Component, inject } from '@angular/core';
import { NotificationService } from '../../../core/service/notification.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-toaster',
  imports: [LucideDynamicIcon],
  templateUrl: './toaster.html',
  styleUrl: './toaster.scss',
})
export class Toaster {
  readonly notifications = inject(NotificationService);
}
