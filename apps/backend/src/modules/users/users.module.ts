import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserProfile } from './entities/user-profile.entity';
import { UserPositionAssignment } from './entities/user-position-assignment.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { PositionsOccupantController } from './controllers/positions-occupant.controller';
import { UsersAuditListener } from './listeners/users-audit.listener';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile, UserPositionAssignment, UserPreferences]),
    OrgModule,
  ],
  controllers: [UsersController, PositionsOccupantController],
  providers: [UsersService, UsersAuditListener],
  exports: [UsersService],
})
export class UsersModule {}
