import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { CreateUserProfileDto } from '../dto/create-user-profile.dto';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';
import { AssignPositionDto } from '../dto/assign-position.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import { ResolveUserProfilesDto } from '../dto/resolve-user-profiles.dto';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';
import { UserStatus } from '../entities/user-profile.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─────────────────────────────── Profiles ─────────────────────────────

  @Post()
  @RequirePermission('iam.user.create')
  @ApiOperation({ summary: 'Create a user profile' })
  create(
    @Body() dto: CreateUserProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.createProfile(dto, actor.id);
  }

  @Get()
  @RequirePermission('iam.user.read')
  @ApiOperation({ summary: 'List user profiles' })
  @ApiQuery({ name: 'status', enum: UserStatus, required: false })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const [items, total] = await this.usersService.listProfiles({
      status,
      search,
      limit,
      offset,
    });
    return { items, total };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  getMe(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.getProfileByCredentialId(actor.id);
  }

  @Post('resolve-by-credential')
  @ApiOperation({ summary: 'Resolve lightweight user profiles by credential IDs' })
  async resolveByCredential(@Body() dto: ResolveUserProfilesDto) {
    const profiles = await this.usersService.getProfilesByCredentialIds(dto.credentialIds);
    return {
      items: profiles.map((profile) => ({
        id: profile.id,
        credentialId: profile.credentialId,
        displayName: profile.displayName ?? profile.fullName,
        email: profile.email,
        clearanceLevel: profile.clearanceLevel,
        status: profile.status,
      })),
    };
  }

  @Get(':id')
  @RequirePermission('iam.user.read')
  @ApiOperation({ summary: 'Get user profile by ID' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getProfileById(id);
  }

  @Patch(':id')
  @RequirePermission('iam.user.update')
  @ApiOperation({ summary: 'Update user profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updateProfile(id, dto, actor.id);
  }

  // ──────────────────────────── Position Assignments ────────────────────

  @Get(':id/positions')
  @ApiOperation({ summary: 'Get active position assignments for a user' })
  getPositions(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getActiveAssignments(id);
  }

  @Post(':id/positions')
  @RequirePermission('org.position.update')
  @ApiOperation({ summary: 'Assign user to a position' })
  assignPosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPositionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.assignPosition(id, dto, actor.id);
  }

  @Delete(':id/positions/:positionId')
  @RequirePermission('org.position.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vacate a user from a position' })
  vacatePosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.vacatePosition(id, positionId, actor.id);
  }

  @Delete(':id/offboard')
  @RequirePermission('iam.user.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Offboard user — vacates all positions, marks as offboarded' })
  offboard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.offboard(id, actor.id);
  }

  // ─────────────────────────────── Preferences ──────────────────────────

  @Get(':id/preferences')
  @ApiOperation({ summary: 'Get user preferences' })
  getPreferences(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getPreferences(id);
  }

  @Patch(':id/preferences')
  @ApiOperation({ summary: 'Update user preferences' })
  updatePreferences(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(id, dto);
  }
}
