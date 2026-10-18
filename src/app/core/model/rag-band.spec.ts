import {
  DEFAULT_RAG_BANDS,
  ragBandFromScore,
  ragDisplayLabel,
  ragSlug,
  ragToneClass,
} from './rag-band';

describe('ragBandFromScore (FR-607)', () => {
  it('bands with the FRD default thresholds', () => {
    expect(ragBandFromScore(100)).toBe('Green');
    expect(ragBandFromScore(95)).toBe('Green');
    expect(ragBandFromScore(94.99)).toBe('Amber');
    expect(ragBandFromScore(70)).toBe('Amber');
    expect(ragBandFromScore(69.99)).toBe('Red');
    expect(ragBandFromScore(0)).toBe('Red');
  });

  it('reports a missing score as NoData (Gray) and never as Red', () => {
    expect(ragBandFromScore(null)).toBe('NoData');
    expect(ragBandFromScore(undefined)).toBe('NoData');
    expect(ragBandFromScore(Number.NaN)).toBe('NoData');
  });

  it('honours administrator configured thresholds', () => {
    const bands = { green: 80, yellow: 50 };
    expect(ragBandFromScore(80, bands)).toBe('Green');
    expect(ragBandFromScore(79.99, bands)).toBe('Amber');
    expect(ragBandFromScore(50, bands)).toBe('Amber');
    expect(ragBandFromScore(49.99, bands)).toBe('Red');
    expect(ragBandFromScore(null, bands)).toBe('NoData');
  });

  it('keeps Green unbounded for scores above 100', () => {
    expect(ragBandFromScore(120)).toBe('Green');
    expect(ragBandFromScore(120, { green: 90, yellow: 60 })).toBe('Green');
  });

  it('defaults to the FRD bands', () => {
    expect(DEFAULT_RAG_BANDS).toEqual({ green: 95, yellow: 70 });
  });
});

describe('user-facing labels (Amber -> Yellow, NoData -> Gray)', () => {
  it('maps wire tokens to the reconciled labels', () => {
    expect(ragDisplayLabel('Green')).toBe('Green');
    expect(ragDisplayLabel('Amber')).toBe('Yellow');
    expect(ragDisplayLabel('Red')).toBe('Red');
    expect(ragDisplayLabel('NoData')).toBe('Gray');
    expect(ragDisplayLabel(null)).toBe('Gray');
  });

  it('maps wire tokens to stable CSS slugs', () => {
    expect(ragSlug('Green')).toBe('green');
    expect(ragSlug('Amber')).toBe('amber');
    expect(ragSlug('Red')).toBe('red');
    expect(ragSlug('NoData')).toBe('gray');
  });

  it('maps wire tokens to pill tone classes', () => {
    expect(ragToneClass('Green')).toBe('rag-pill--green');
    expect(ragToneClass('Amber')).toBe('rag-pill--yellow');
    expect(ragToneClass('Red')).toBe('rag-pill--red');
    expect(ragToneClass('NoData')).toBe('rag-pill--gray');
  });
});
