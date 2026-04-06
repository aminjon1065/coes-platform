export type HazardType = 'flood' | 'landslide' | 'seismic' | 'wildfire';

export type PredictionStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'expired';

export interface RiskPrediction {
  id: string;
  modelVersionId: string;
  hazardType: HazardType;
  administrativeCode: string;
  administrativeName: string | null;
  riskScore: number;         // 0.0 – 1.0
  riskTier: 1 | 2 | 3 | 4;  // 1=Low 2=Medium 3=High 4=Critical
  shapValues: Record<string, number>;
  inputFeatures: Record<string, number>;
  confidenceInterval: [number, number] | null;
  validFrom: string;
  validUntil: string;
  status: PredictionStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  predictedAt: string;
}

export interface PendingPredictionsResponse {
  items: RiskPrediction[];
  total: number;
}

export const HAZARD_LABELS: Record<HazardType, string> = {
  flood:     'Flood',
  landslide: 'Landslide',
  seismic:   'Seismic',
  wildfire:  'Wildfire',
};

export const RISK_TIER_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};

export const RISK_TIER_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#7f1d1d',
};
