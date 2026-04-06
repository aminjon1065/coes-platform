import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MlModel } from './entities/ml-model.entity';
import { MlModelVersion } from './entities/ml-model-version.entity';
import { RiskPrediction } from './entities/risk-prediction.entity';
import { FeatureDefinition } from './entities/feature-definition.entity';
import { ModelPerformanceSnapshot } from './entities/model-performance-snapshot.entity';

import { MlService } from './services/ml.service';
import { MlController } from './controllers/ml.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MlModel,
      MlModelVersion,
      RiskPrediction,
      FeatureDefinition,
      ModelPerformanceSnapshot,
    ]),
  ],
  controllers: [MlController],
  providers: [MlService],
  exports: [MlService],
})
export class MlModule {}
