import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'org/positions', version: '1' })
export class PositionsOccupantController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':positionId/occupant')
  @ApiOperation({ summary: 'Get the user currently occupying this position (primary assignment)' })
  async getOccupant(@Param('positionId', ParseUUIDPipe) positionId: string) {
    const occupant = await this.usersService.getPositionOccupant(positionId);
    return occupant ?? null;
  }

  @Get(':positionId/history')
  @ApiOperation({ summary: 'Get full assignment history for a position' })
  getHistory(@Param('positionId', ParseUUIDPipe) positionId: string) {
    return this.usersService.getPositionHistory(positionId);
  }
}
