export enum SwotCategory {
  Strength = 'strength',
  Weakness = 'weakness',
  Opportunity = 'opportunity',
  Threat = 'threat',
}

export enum PestelCategory {
  Political = 'political',
  Economic = 'economic',
  Social = 'social',
  Technological = 'technological',
  Environmental = 'environmental',
  Legal = 'legal',
}

export enum ImpactLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export interface CoreValue {
  id: string;
  title: string;
  description?: string;
}

export interface StrategicTheme {
  id: string;
  title: string;
  code?: string;
  description?: string;
}

export interface SwotItem {
  id: string;
  category: SwotCategory;
  title: string;
  description?: string;
  impact: ImpactLevel;
}

export interface PestelItem {
  id: string;
  category: PestelCategory;
  title: string;
  description?: string;
  impact: ImpactLevel;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  description?: string;
  vision: string;
  mission: string;
  coreValues: CoreValue[];
  strategicThemes: StrategicTheme[];
  swotItems: SwotItem[];
  pestelItems: PestelItem[];
}
