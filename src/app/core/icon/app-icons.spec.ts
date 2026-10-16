import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideDynamicIcon } from '@lucide/angular';
import { APP_ICON_DATA, APP_ICON_NAMES } from './app-icon-data';
import { provideAppIcons } from './app-icons';

/**
 * Every `lucideIcon` slug referenced from the feature templates, whether bound
 * statically (`lucideIcon="x"`) or selected at runtime (`[lucideIcon]="expr"`).
 */
const TEMPLATE_SLUGS = [
  'activity',
  'arrow-down',
  'arrow-right',
  'arrow-up',
  'bell',
  'briefcase',
  'calendar-days',
  'chart-column',
  'chart-pie',
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'circle',
  'circle-alert',
  'circle-x',
  'clipboard-list',
  'download',
  'ellipsis-vertical',
  'eye',
  'file-down',
  'file-spreadsheet',
  'file-text',
  'gauge',
  'git-fork',
  'info',
  'list',
  'list-checks',
  'loader-circle',
  'log-out',
  'menu',
  'network',
  'pencil-line',
  'percent',
  'plus',
  'search',
  'settings',
  'square',
  'square-pen',
  'target',
  'trash',
  'triangle-alert',
  'x',
];

/** Slugs resolved from data rather than markup, so they are asserted separately. */
const DATA_DRIVEN_SLUGS = [
  'building',
  'chart-column',
  'clipboard-list',
  'files',
  'file-text',
  'gauge',
  'layers',
  'layout-dashboard',
  'layout-grid',
  'layout-list',
  'list-checks',
  'lock',
  'notebook-pen',
  'shield',
  'shield-check',
  'square-plus',
  'target',
  'users',
];

describe('app icon registry', () => {
  it('registers the icon payloads the application relies on', () => {
    const names = new Set(APP_ICON_DATA.map((icon) => icon.name));

    for (const slug of [...TEMPLATE_SLUGS, ...DATA_DRIVEN_SLUGS]) {
      expect(names.has(slug)).toBe(true);
    }
  });

  it('gives every registered icon a usable path payload', () => {
    for (const icon of APP_ICON_DATA) {
      expect(icon.name, 'icon is missing a name').toBeTruthy();
      expect(Array.isArray(icon.node), `${icon.name} has no node array`).toBe(true);
      expect(icon.node.length, `${icon.name} has no drawable nodes`).toBeGreaterThan(0);
      expect(icon.size, `${icon.name} has no default size`).toBeGreaterThan(0);
    }
  });

  it('exposes the registry to components through the bootstrap provider', async () => {
    @Component({
      imports: [LucideDynamicIcon],
      template: '<svg lucideIcon="plus" size="16"></svg><svg lucideIcon="chart-pie"></svg>',
    })
    class Host {}

    TestBed.configureTestingModule({ providers: [provideAppIcons()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    const icons = host.querySelectorAll('svg.lucide');
    expect(icons.length).toBe(2);

    const plus = host.querySelector('svg.lucide-plus') as SVGSVGElement;
    expect(plus).not.toBeNull();
    expect(plus.getAttribute('width')).toBe('16');
    expect(plus.querySelectorAll('path').length).toBeGreaterThan(0);

    expect(host.querySelector('svg.lucide-chart-pie')).not.toBeNull();
    expect(APP_ICON_NAMES).toContain('plus');
  });
});