import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toastsSignal = signal<Toast[]>([]);
  private counter = 0;

  readonly toasts = this.toastsSignal.asReadonly();

  success(message: string): void {
    this.show('success', message);
  }

  error(message: string): void {
    this.show('error', message);
  }

  info(message: string): void {
    this.show('info', message);
  }

  warning(message: string): void {
    this.show('warning', message);
  }

  dismiss(id: number): void {
    this.toastsSignal.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private show(type: Toast['type'], message: string): void {
    const toast: Toast = { id: ++this.counter, type, message };
    this.toastsSignal.update((toasts) => [...toasts, toast]);
    setTimeout(() => this.dismiss(toast.id), 4500);
  }
}
