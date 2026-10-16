import { provideLucideIcons } from '@lucide/angular';
import { APP_ICON_DATA } from './app-icon-data';

/**
 * Registers every icon the application is allowed to reference by name.
 *
 * Icons are looked up through the kebab-case slug, so `<svg lucideIcon="plus" />`
 * resolves to the `plus` entry. Registering them once at bootstrap means components
 * only need `LucideDynamicIcon` in their `imports` instead of one import per icon.
 *
 * The registry is fed raw `LucideIconData` rather than the library's `Lucide*`
 * component classes. Both forms are supported by `provideLucideIcons`, but each
 * component class also drags in its own Angular definition: registering all 58
 * icons that way added ~186 kB to the initial bundle and pushed it past the
 * 500 kB budget, while the same icons as data cost about 19 kB in total.
 *
 * The payloads live in `app-icon-data.ts`; see that file for how to regenerate them.
 */
export function provideAppIcons() {
  return provideLucideIcons(...APP_ICON_DATA);
}