import { beforeEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { provideAppIcons } from './app/core/icon/app-icons';

/**
 * jsdom does not implement ResizeObserver, which ECharts needs for auto-resize.
 * Chart-bearing component tests would otherwise fail in ngOnInit, so we install a
 * no-op observer: the tests assert on rendered output, not on layout.
 */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

/**
 * Specs build their own TestBed instead of bootstrapping appConfig, so the Lucide
 * icon registry has to be provided here. Without it any component whose template
 * renders an <svg lucideIcon="..."> fails DI on LUCIDE_ICONS - and that failure
 * surfaces late and misleadingly, as unflushed HttpClient requests in afterEach.
 */
beforeEach(() => {
  getTestBed().configureTestingModule({ providers: [provideAppIcons()] });
});
