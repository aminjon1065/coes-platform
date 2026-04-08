import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrgService } from '../services/org.service';
import { CreatePositionDto } from '../dto/create-position.dto';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';

@ApiTags('Organizations / Positions')
@ApiBearerAuth()
@Controller({ path: 'org/positions', version: '1' })
export class PositionsController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  @ApiOperation({ summary: 'List positions, optionally filtered by department' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  list(@Query('departmentId') departmentId?: string) {
    if (departmentId) {
      return this.orgService.getPositionsByDepartment(departmentId);
    }

    return this.orgService.getAllActivePositions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get position by ID' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getPositionById(id);
  }

  @Get(':id/command-chain')
  @ApiOperation({ summary: 'Get full command chain up from this position' })
  getCommandChain(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getCommandChain(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a position' })
  create(
    @Body() dto: CreatePositionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.createPosition(dto, user.id);
  }
}
