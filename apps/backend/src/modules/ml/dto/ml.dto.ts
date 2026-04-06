import { HazardType, ModelFramework } from '../entities/ml-model.entity';
import { ModelVersionStatus } from '../entities/ml-model-version.entity';
import { PredictionStatus } from '../entities/risk-prediction.entity';

// ── Model Registry ────────────────────────────────────────────────────────────

export class CreateMlModelDto {
  name: string;
  description?: string;
  hazardType: HazardType;
  framework: ModelFramework;
  featureNames: string[];
  preprocessingConfig?: object;
  classification?: number;
}

export class RegisterModelVersionDto {
  modelId: string;
  version: string;
  mlflowRunId?: string;
  mlflowVersion?: number;
  artifactUri?: string;
  trainingDatasetMeta?: object;
  hyperparameters?: object;
  evalMetrics?: object;
  featureImportances?: object;
}

export class PromoteModelVersionDto {
  targetStatus: ModelVersionStatus;
  reviewNotes?: string;
}

// ── Predictions ───────────────────────────────────────────────────────────────

export class CreateRiskPredictionDto {
  modelVersionId: string;
  hazardType: HazardType;
  administrativeCode: string;
  administrativeName?: string;
  riskScore: number;
  riskTier: number;
  shapValues?: object;
  inputFeatures?: object;
  confidenceInterval?: [number, number];
  validFrom: string;   // ISO8601
  validUntil: string;  // ISO8601
  classification?: number;
}

export class ReviewPredictionDto {
  status: PredictionStatus.APPROVED | PredictionStatus.REJECTED;
  reviewNotes?: string;
}

// ── Feature Store ─────────────────────────────────────────────────────────────

export class CreateFeatureDefinitionDto {
  name: string;
  description?: string;
  valueType: string;
  sourceDomain: string;
  computationSpec?: object;
  validRange?: { min: number; max: number };
  categories?: string[];
  ttlSeconds?: number;
}

// ── Pagination helper ────────────────────────────────────────────────────────

export class PaginationDto {
  page?: number;
  limit?: number;
}
