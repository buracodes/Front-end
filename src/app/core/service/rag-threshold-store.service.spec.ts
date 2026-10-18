import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { RagThresholdStore } from './rag-threshold-store.service';
import { RagThresholdsService } from './rag-threshold.service';
import { RagThresholdConfiguration } from '../model/rag-threshold.model';

const CONFIG: RagThresholdConfiguration = {
  scopeKey: 'default',
  green: 80,
  yellow: 50,
  isConfigured: true,
  source: 'Database',
  greenColor: '#16a34a',
  yellowColor: '#d97706',
  redColor: '#dc2626',
  grayColor: '#6b7280',
  warnings: [],
};

function provideApi(get: () => Observable<unknown>) {
  return { get: () => get(), update: () => of({ data: CONFIG }) };
}

describe('RagThresholdStore', () => {
  it('loads the configured thresholds and bands scores with them', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RagThresholdsService, useValue: provideApi(() => of({ data: CONFIG })) },
      ],
    });
    const store = TestBed.inject(RagThresholdStore);
    await store.ensureLoaded();

    expect(store.bands()).toEqual({ green: 80, yellow: 50 });
    expect(store.bandFor(85)).toBe('Green');
    expect(store.bandFor(75)).toBe('Amber');
    expect(store.bandFor(40)).toBe('Red');
    expect(store.bandFor(null)).toBe('NoData');
  });

  it('keeps the FRD defaults when the API is unavailable', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RagThresholdsService,
          useValue: provideApi(() => throwError(() => new Error('offline'))),
        },
      ],
    });
    const store = TestBed.inject(RagThresholdStore);
    await store.ensureLoaded();

    expect(store.bands()).toEqual({ green: 95, yellow: 70 });
    expect(store.bandFor(95)).toBe('Green');
    expect(store.bandFor(94.99)).toBe('Amber');
    expect(store.bandFor(69.99)).toBe('Red');
    expect(store.bandFor(null)).toBe('NoData');
  });

  it('re-bands immediately after an administrator update is applied', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RagThresholdsService, useValue: provideApi(() => of({ data: CONFIG })) },
      ],
    });
    const store = TestBed.inject(RagThresholdStore);
    await store.ensureLoaded();

    store.apply({ ...CONFIG, green: 90, yellow: 60 });
    expect(store.bandFor(85)).toBe('Amber');
    expect(store.bandFor(65)).toBe('Amber');
    expect(store.bandFor(55)).toBe('Red');
  });
});
