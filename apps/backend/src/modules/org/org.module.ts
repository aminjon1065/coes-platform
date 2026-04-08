import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './entities/department.entity';
import { Position } from './entities/position.entity';
import { OrgChangeHistory } from './entities/org-change-history.entity';
import { UserPositionAssignment } from '../users/entities/user-position-assignment.entity';
import { OrgService } from './services/org.service';
import { DepartmentsController } from './controllers/departments.controller';
import { PositionsController } from './controllers/positions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Department, Position, OrgChangeHistory, UserPositionAssignment])],
  controllers: [DepartmentsController, PositionsController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
