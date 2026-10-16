import { Injectable, signal } from '@angular/core';

export type ConfirmChoice = 'confirm' | 'extra' | 'cancel';

export interface ConfirmDialogState {
  show: boolean;
  title: string;
  message: string;
  confirmText: string;
  extraText: string;
  cancelText: string;
  variant: 'danger' | 'warning' | 'info';
  extraVariant: 'danger' | 'warning' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly state = signal<ConfirmDialogState>({
    show: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    extraText: '',
    cancelText: 'Cancel',
    variant: 'danger',
    extraVariant: 'info',
  });

  private boolResolver: ((value: boolean) => void) | null = null;
  private choiceResolver: ((value: ConfirmChoice) => void) | null = null;
  private choiceMode = false;

  confirm(
    title: string,
    message: string,
    options?: { confirmText?: string; cancelText?: string; variant?: 'danger' | 'warning' | 'info' }
  ): Promise<boolean> {
    this.state.set({
      show: true,
      title,
      message,
      confirmText: options?.confirmText ?? 'Confirm',
      extraText: '',
      cancelText: options?.cancelText ?? 'Cancel',
      variant: options?.variant ?? 'danger',
      extraVariant: 'info',
    });
    this.choiceMode = false;

    return new Promise<boolean>((resolve) => {
      this.boolResolver = resolve;
    });
  }

  confirmChoice(
    title: string,
    message: string,
    options: { confirmText?: string; extraText?: string; cancelText?: string; variant?: 'danger' | 'warning' | 'info'; extraVariant?: 'danger' | 'warning' | 'info' }
  ): Promise<ConfirmChoice> {
    this.state.set({
      show: true,
      title,
      message,
      confirmText: options.confirmText ?? 'Confirm',
      extraText: options.extraText ?? '',
      cancelText: options.cancelText ?? 'Cancel',
      variant: options.variant ?? 'danger',
      extraVariant: options.extraVariant ?? 'info',
    });
    this.choiceMode = true;

    return new Promise<ConfirmChoice>((resolve) => {
      this.choiceResolver = resolve;
    });
  }

  onConfirm(): void {
    // Captured before close(), which clears the pending resolver.
    if (this.choiceMode) {
      const resolve = this.choiceResolver;
      this.close();
      resolve?.('confirm');
    } else {
      const resolve = this.boolResolver;
      this.close();
      resolve?.(true);
    }
  }

  onExtra(): void {
    const resolve = this.choiceResolver;
    this.close();
    resolve?.('extra');
  }

  onCancel(): void {
    if (this.choiceMode) {
      const resolve = this.choiceResolver;
      this.close();
      resolve?.('cancel');
    } else {
      const resolve = this.boolResolver;
      this.close();
      resolve?.(false);
    }
  }

  private close(): void {
    this.state.set({
      show: false,
      title: '',
      message: '',
      confirmText: 'Confirm',
      extraText: '',
      cancelText: 'Cancel',
      variant: 'danger',
      extraVariant: 'info',
    });
    this.boolResolver = null;
    this.choiceResolver = null;
    this.choiceMode = false;
  }
}