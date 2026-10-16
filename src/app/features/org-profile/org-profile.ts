import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { OrgProfileService } from '../../core/service/org-profile.service';
import { UserStore } from '../../core/service/user-store.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { toApiError } from '../../core/model/api-error';
import { LucideDynamicIcon } from '@lucide/angular';
import {
  CoreValue,
  ImpactLevel,
  OrganizationProfile,
  PestelCategory,
  PestelItem,
  StrategicTheme,
  SwotCategory,
  SwotItem,
} from '../../core/model/org-profile.model';

type ActiveTab = 'identity' | 'swot' | 'pestel';

@Component({
  selector: 'app-org-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './org-profile.html',
  styleUrl: './org-profile.scss',
})
export class OrgProfilePage {
  private readonly orgService = inject(OrgProfileService);
  private readonly userStore = inject(UserStore);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly activeTab = signal<ActiveTab>('identity');
  readonly profile = signal<OrganizationProfile | null>(null);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly canEdit = computed(() => this.userStore.hasPermission('organization:edit'));
  readonly expandedSwotCategories = signal<Set<SwotCategory>>(new Set());
  readonly expandedPestelCategories = signal<Set<PestelCategory>>(new Set());

  readonly tabIndicatorStyle = computed(() => {
    const tabIndex = ['identity', 'swot', 'pestel'].indexOf(this.activeTab());
    const left = tabIndex * (100 / 3);
    return { left: `${left}%`, width: '33.333%' };
  });

  readonly showIdentityModal = signal(false);
  readonly showValueModal = signal(false);
  readonly editingValue = signal<CoreValue | null>(null);

  readonly showThemeModal = signal(false);
  readonly editingTheme = signal<StrategicTheme | null>(null);

  readonly showSwotModal = signal(false);
  readonly editingSwot = signal<SwotItem | null>(null);
  readonly swotCategoryForNew = signal<SwotCategory>(SwotCategory.Strength);

  readonly showPestelModal = signal(false);
  readonly editingPestel = signal<PestelItem | null>(null);
  readonly pestelCategoryForNew = signal<PestelCategory>(PestelCategory.Political);

  readonly swotCategories = [
    { key: 'strength', label: 'Strengths', value: SwotCategory.Strength },
    { key: 'weakness', label: 'Weaknesses', value: SwotCategory.Weakness },
    { key: 'opportunity', label: 'Opportunities', value: SwotCategory.Opportunity },
    { key: 'threat', label: 'Threats', value: SwotCategory.Threat },
  ] as const;

  readonly pestelCategories = [
    { key: 'political', label: 'Political', value: PestelCategory.Political },
    { key: 'economic', label: 'Economic', value: PestelCategory.Economic },
    { key: 'social', label: 'Social', value: PestelCategory.Social },
    { key: 'technological', label: 'Technological', value: PestelCategory.Technological },
    { key: 'environmental', label: 'Environmental', value: PestelCategory.Environmental },
    { key: 'legal', label: 'Legal', value: PestelCategory.Legal },
  ] as const;

  readonly identityForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    vision: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    mission: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly valueForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
  });

  readonly themeForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    code: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    color: new FormControl('#10B981', { nonNullable: true }),
  });

  readonly swotForm = new FormGroup({
    category: new FormControl<SwotCategory>(SwotCategory.Strength, { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    impact: new FormControl<ImpactLevel>(ImpactLevel.Medium, { nonNullable: true, validators: [Validators.required] }),
  });

  readonly pestelForm = new FormGroup({
    category: new FormControl<PestelCategory>(PestelCategory.Political, { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    impact: new FormControl<ImpactLevel>(ImpactLevel.Medium, { nonNullable: true, validators: [Validators.required] }),
  });

  readonly SwotCategory = SwotCategory;
  readonly PestelCategory = PestelCategory;
  readonly ImpactLevel = ImpactLevel;
  readonly showNewMenu = signal(false);
toggleNewMenu(): void { this.showNewMenu.update((v) => !v); }
closeNewMenu(): void { this.showNewMenu.set(false); }

onExport(): void {
  // TODO: hook up to your export endpoint / print flow
  this.notifications.success('Export started.');
}

  constructor() {
    this.loadProfile();
  }

  loadProfile(): void {
    this.loading.set(true);
    this.orgService.getProfile().subscribe({
      next: (p) => { this.profile.set(p); this.loading.set(false); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.loading.set(false); },
    });
  }

  setTab(tab: ActiveTab): void { this.activeTab.set(tab); }

  openEditIdentity(): void {
    const p = this.profile();
    if (!p) return;
    this.identityForm.patchValue({ name: p.name, description: p.description ?? '', vision: p.vision, mission: p.mission });
    this.showIdentityModal.set(true);
  }

  saveIdentity(): void {
    if (this.identityForm.invalid || this.submitting()) return;
    const p = this.profile();
    if (!p) return;
    this.submitting.set(true);
    this.orgService.updateIdentity({ id: p.id, ...this.identityForm.getRawValue() }).subscribe({
      next: (updated) => { this.notifications.success('Strategic identity updated.'); this.profile.set(updated); this.showIdentityModal.set(false); this.submitting.set(false); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
    });
  }

  openValueModal(item?: CoreValue): void {
    if (item) {
      this.editingValue.set(item);
      this.valueForm.patchValue({ title: item.title, description: item.description ?? ''});
    } else {
      this.editingValue.set(null);
      this.valueForm.reset({ title: '', description: ''});
    }
    this.showValueModal.set(true);
  }

  saveValue(): void {
    if (this.valueForm.invalid || this.submitting()) return;
    this.submitting.set(true);
    const item = this.editingValue();
    const val = this.valueForm.getRawValue() as { title: string; description?: string };
    const obs = item
      ? this.orgService.updateCoreValue(item.id, { id: item.id, ...val })
      : this.orgService.createCoreValue(val);
    obs.subscribe({
      next: () => { this.notifications.success(item ? 'Core value updated.' : 'Core value added.'); this.showValueModal.set(false); this.submitting.set(false); this.loadProfile(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
    });
  }

  deleteValue(id: string): void {
    this.dialog.confirm('Delete Core Value', 'Are you sure you want to delete this core value? This cannot be undone.', { confirmText: 'Delete', variant: 'danger' }).then((ok) => {
      if (!ok) return;
      this.orgService.deleteCoreValue(id).subscribe({ next: () => { this.notifications.success('Core value removed.'); this.loadProfile(); }, error: (err) => this.notifications.error(toApiError(err).message) });
    });
  }

  openThemeModal(theme?: StrategicTheme): void {
    if (theme) {
      this.editingTheme.set(theme);
      this.themeForm.patchValue({ title: theme.title ?? '', description: theme.description ?? ''});
    } else {
      this.editingTheme.set(null);
    }
    this.showThemeModal.set(true);
  }

  saveTheme(): void {
    if (this.themeForm.invalid || this.submitting()) return;
    this.submitting.set(true);
    const theme = this.editingTheme();
    const val = this.themeForm.getRawValue();
    const obs = theme
      ? this.orgService.updateStrategicTheme(theme.id, { id: theme.id, ...val })
      : this.orgService.createStrategicTheme(val);
    obs.subscribe({
      next: () => { this.notifications.success(theme ? 'Theme updated.' : 'Theme created.'); this.showThemeModal.set(false); this.submitting.set(false); this.loadProfile(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
    });
  }

  deleteTheme(id: string): void {
    this.dialog.confirm('Delete Strategic Theme', 'Are you sure you want to delete this strategic theme?', { confirmText: 'Delete', variant: 'danger' }).then((ok) => {
      if (!ok) return;
      this.orgService.deleteStrategicTheme(id).subscribe({ next: () => { this.notifications.success('Theme deleted.'); this.loadProfile(); }, error: (err) => this.notifications.error(toApiError(err).message) });
    });
  }

  getSwotItemsByCategory(category: SwotCategory): SwotItem[] {
    return (this.profile()?.swotItems ?? []).filter((i) => i.category === category);
  }

  getFeaturedSwotItems(category: SwotCategory): SwotItem[] {
    return this.getSwotItemsByCategory(category).slice(0, 2);
  }

  getRemainingSwotItems(category: SwotCategory): SwotItem[] {
    return this.getSwotItemsByCategory(category).slice(2);
  }

  getSwotRemainingCount(category: SwotCategory): number {
    return Math.max(0, this.getSwotItemsByCategory(category).length - 2);
  }

  isSwotCategoryExpanded(category: SwotCategory): boolean {
    return this.expandedSwotCategories().has(category);
  }

  toggleSwotCategory(category: SwotCategory): void {
    this.expandedSwotCategories.update((set) => {
      const next = new Set(set);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  getFeaturedPestelItems(category: PestelCategory): PestelItem[] {
    return this.getPestelItemsByCategory(category).slice(0, 2);
  }

  getRemainingPestelItems(category: PestelCategory): PestelItem[] {
    return this.getPestelItemsByCategory(category).slice(2);
  }

  getPestelRemainingCount(category: PestelCategory): number {
    return Math.max(0, this.getPestelItemsByCategory(category).length - 2);
  }

  isPestelCategoryExpanded(category: PestelCategory): boolean {
    return this.expandedPestelCategories().has(category);
  }

  togglePestelCategory(category: PestelCategory): void {
    this.expandedPestelCategories.update((set) => {
      const next = new Set(set);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  openSwotModal(category?: SwotCategory, item?: SwotItem): void {
    if (item) {
      this.editingSwot.set(item);
      this.swotForm.patchValue({ category: item.category, title: item.title, description: item.description ?? '', impact: item.impact });
    } else {
      this.editingSwot.set(null);
      const defaultCategory = category ?? SwotCategory.Strength;
      this.swotCategoryForNew.set(defaultCategory);
      this.swotForm.reset({ category: defaultCategory, title: '', description: '', impact: ImpactLevel.Medium });
    }
    this.showSwotModal.set(true);
  }

  saveSwot(): void {
    if (this.swotForm.invalid || this.submitting()) return;
    this.submitting.set(true);
    const item = this.editingSwot();
    const val = this.swotForm.getRawValue();
    const obs = item
      ? this.orgService.updateSwotItem(item.id, { id: item.id, ...val })
      : this.orgService.createSwotItem(val);
    obs.subscribe({
      next: () => { this.notifications.success(item ? 'SWOT item updated.' : 'SWOT item added.'); this.showSwotModal.set(false); this.submitting.set(false); this.loadProfile(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
    });
  }

  deleteSwot(id: string): void {
    this.dialog.confirm('Delete SWOT Item', 'Are you sure you want to delete this SWOT item?', { confirmText: 'Delete', variant: 'danger' }).then((ok) => {
      if (!ok) return;
      this.orgService.deleteSwotItem(id).subscribe({ next: () => { this.notifications.success('SWOT item deleted.'); this.loadProfile(); }, error: (err) => this.notifications.error(toApiError(err).message) });
    });
  }

  getPestelItemsByCategory(category: PestelCategory): PestelItem[] {
    return (this.profile()?.pestelItems ?? []).filter((i) => i.category === category);
  }

  openPestelModal(category?: PestelCategory, item?: PestelItem): void {
    if (item) {
      this.editingPestel.set(item);
      this.pestelForm.patchValue({ category: item.category, title: item.title, description: item.description ?? '', impact: item.impact });
    } else {
      this.editingPestel.set(null);
      const defaultCategory = category ?? PestelCategory.Political;
      this.pestelCategoryForNew.set(defaultCategory);
      this.pestelForm.reset({ category: defaultCategory, title: '', description: '', impact: ImpactLevel.Medium });
    }
    this.showPestelModal.set(true);
  }

  savePestel(): void {
    if (this.pestelForm.invalid || this.submitting()) return;
    this.submitting.set(true);
    const item = this.editingPestel();
    const val = this.pestelForm.getRawValue();
    const obs = item
      ? this.orgService.updatePestelItem(item.id, { id: item.id, ...val })
      : this.orgService.createPestelItem(val);
    obs.subscribe({
      next: () => { this.notifications.success(item ? 'PESTEL item updated.' : 'PESTEL item added.'); this.showPestelModal.set(false); this.submitting.set(false); this.loadProfile(); },
      error: (err) => { this.notifications.error(toApiError(err).message); this.submitting.set(false); },
    });
  }

  deletePestel(id: string): void {
    this.dialog.confirm('Delete PESTEL Item', 'Are you sure you want to delete this PESTEL item?', { confirmText: 'Delete', variant: 'danger' }).then((ok) => {
      if (!ok) return;
      this.orgService.deletePestelItem(id).subscribe({ next: () => { this.notifications.success('PESTEL item deleted.'); this.loadProfile(); }, error: (err) => this.notifications.error(toApiError(err).message) });
    });
  }

  getImpactBadgeClass(impact: ImpactLevel): string {
    switch (impact) {
      case ImpactLevel.High: return 'impact-badge impact-high';
      case ImpactLevel.Medium: return 'impact-badge impact-medium';
      case ImpactLevel.Low: return 'impact-badge impact-low';
      default: return 'impact-badge';
    }
  }

  getImpactLabel(impact: ImpactLevel): string {
    switch (impact) {
      case ImpactLevel.High: return 'High Impact';
      case ImpactLevel.Medium: return 'Medium Impact';
      case ImpactLevel.Low: return 'Low Impact';
      default: return 'Impact';
    }
  }

  getPestelIcon(category: string): SafeHtml {
    const icons: Record<string, string> = {
      political: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M3 21h18M5 21V7a2 2 0 0 1 2-2h2.586a1 1 0 0 1 .707.293l3.5 3.5A1 1 0 0 0 14 8h4a2 2 0 0 1 2 2v14"/><path d="M9 15v-2.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V15"/><circle cx="15.5" cy="16.5" r="1.5"/></svg>`,
      economic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/><path d="M21 12a1 1 0 0 1 0 2H19M5 12a1 1 0 0 1 0 2H3"/></svg>`,
      social: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      technological: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
      environmental: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>`,
      legal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>`
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[category.toLowerCase()] || '');
  }

  getSwotIcon(category: SwotCategory): SafeHtml {
    const icons: Record<SwotCategory, string> = {
      [SwotCategory.Strength]: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
      [SwotCategory.Weakness]: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
      [SwotCategory.Opportunity]: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
      [SwotCategory.Threat]: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>`
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[category] || '');
  }

  getSwotSingular(category: SwotCategory): string {
    const singular: Record<SwotCategory, string> = {
      [SwotCategory.Strength]: 'strength',
      [SwotCategory.Weakness]: 'weakness',
      [SwotCategory.Opportunity]: 'opportunity',
      [SwotCategory.Threat]: 'threat',
    };
    return singular[category] || 'factor';
  }

  getPestelSingular(category: PestelCategory): string {
    const singular: Record<PestelCategory, string> = {
      [PestelCategory.Political]: 'political',
      [PestelCategory.Economic]: 'economic',
      [PestelCategory.Social]: 'social',
      [PestelCategory.Technological]: 'technological',
      [PestelCategory.Environmental]: 'environmental',
      [PestelCategory.Legal]: 'legal',
    };
    return singular[category] || 'factor';
  }
}
