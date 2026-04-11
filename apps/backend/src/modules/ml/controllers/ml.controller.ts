import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MlService } from '../services/ml.service';
import { HazardType } from '../entities/ml-model.entity';
import { ModelVersionStatus } from '../entities/ml-model-version.entity';
import { PredictionStatus } from '../entities/risk-prediction.entity';
import {
  CreateMlModelDto,
  RegisterModelVersionDto,
  PromoteModelVersionDto,
  CreateRiskPredictionDto,
  ReviewPredictionDto,
  CreateFeatureDefinitionDto,
  PaginationDto,
} from '../dto/ml.dto';

// Stubbed auth helpers — real decorator comes from IamModule guards
const ACTOR_ID       = '00000000-0000-0000-0000-000000000001';
const USER_CLEARANCE = 3;

@Controller('api/v1/ml')
export class MlController {
  constructor(private readonly mlService: MlService) {}

  // ── Model Registry ──────────────────────────────────────────────────────────

  @Post('models')
  @HttpCode(HttpStatus.CREATED)
  createModel(@Body() dto: CreateMlModelDto) {
    return this.mlService.createModel(dto, ACTOR_ID);
  }

  @Get('models')
  listModels(@Query('hazardType') hazardType?: HazardType) {
    return this.mlService.listModels(hazardType);
  }

  @Get('models/:id')
  getModel(@Param('id', ParseUUIDPipe) id: string) {
    return this.mlService.getModel(id, USER_CLEARANCE);
  }

  @Get('models/:id/production-version')
  getProductionVersion(@Param('id', ParseUUIDPipe) id: string) {
    return this.mlService.getProductionVersion(id);
  }

  // ── Model Versions ──────────────────────────────────────────────────────────

  @Post('versions')
  @HttpCode(HttpStatus.CREATED)
  registerVersion(@Body() dto: RegisterModelVersionDto) {
    return this.mlService.registerVersion(dto, ACTOR_ID);
  }

  @Patch('versions/:id/promote')
  promoteVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromoteModelVersionDto,
  ) {
    return this.mlService.promoteVersion(id, dto, ACTOR_ID, USER_CLEARANCE);
  }

  /**
   * PATCH /api/v1/ml/versions/:id/rollback
   * Roll back a production version to STAGING and auto-promote the previous STAGING version.
   * Used after a drift alert or analyst-detected quality degradation. §10.4
   */
  @Patch('versions/:id/rollback')
  @HttpCode(HttpStatus.OK)
  rollbackVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    return this.mlService.rollbackVersion(id, reason ?? 'Manual rollback', ACTOR_ID);
  }

  @Get('versions/:id/performance')
  getPerformanceHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('since') since?: string,
  ) {
    return this.mlService.getPerformanceHistory(
      id,
      since ? new Date(since) : undefined,
    );
  }

  // ── Risk Predictions ────────────────────────────────────────────────────────

  @Post('predictions')
  @HttpCode(HttpStatus.CREATED)
  createPrediction(@Body() dto: CreateRiskPredictionDto) {
    return this.mlService.createPrediction(dto);
  }

  /**
   * POST /api/v1/ml/predictions/batch
   * Bulk-ingest predictions from the ML pipeline. All items must share the same modelVersionId.
   */
  @Post('predictions/batch')
  @HttpCode(HttpStatus.CREATED)
  batchCreatePredictions(@Body() dtos: CreateRiskPredictionDto[]) {
    return this.mlService.batchCreatePredictions(dtos);
  }

  @Get('predictions/pending')
  getPendingPredictions(
    @Query('hazardType') hazardType?: HazardType,
    @Query() pagination?: PaginationDto,
  ) {
    return this.mlService.getPendingPredictions(hazardType, USER_CLEARANCE, pagination);
  }

  @Get('predictions/published/:hazardType')
  getPublishedPredictions(@Param('hazardType') hazardType: HazardType) {
    return this.mlService.getPublishedPredictions(hazardType, USER_CLEARANCE);
  }

  @Patch('predictions/:id/review')
  reviewPrediction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPredictionDto,
  ) {
    return this.mlService.reviewPrediction(id, dto, ACTOR_ID, USER_CLEARANCE);
  }

  @Post('predictions/publish')
  @HttpCode(HttpStatus.OK)
  publishApproved() {
    return this.mlService.publishApprovedPredictions();
  }

  // ── Feature Store ───────────────────────────────────────────────────────────

  @Get('features')
  listFeatures() {
    return this.mlService.listFeatureDefinitions();
  }

  @Post('features')
  @HttpCode(HttpStatus.CREATED)
  upsertFeature(@Body() dto: CreateFeatureDefinitionDto) {
    return this.mlService.upsertFeatureDefinition(dto);
  }
}
