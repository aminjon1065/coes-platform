import { api } from './client';
import type { RiskPrediction, PendingPredictionsResponse, HazardType } from '@/types/ml';

export const mlApi = {
  getPublishedPredictions: (hazardType: HazardType) =>
    api.get<RiskPrediction[]>(`/v1/ml/predictions/published/${hazardType}`),

  getPendingPredictions: (hazardType?: HazardType) =>
    api.get<PendingPredictionsResponse>(
      `/v1/ml/predictions/pending${hazardType ? `?hazardType=${hazardType}` : ''}`,
    ),

  approvePrediction: (id: string, reviewNotes?: string) =>
    api.post<RiskPrediction>(`/v1/ml/predictions/${id}/review`, {
      status: 'approved',
      reviewNotes,
    }),

  rejectPrediction: (id: string, reviewNotes?: string) =>
    api.post<RiskPrediction>(`/v1/ml/predictions/${id}/review`, {
      status: 'rejected',
      reviewNotes,
    }),

  publishApproved: () =>
    api.post<number>('/v1/ml/predictions/publish', {}),
};
