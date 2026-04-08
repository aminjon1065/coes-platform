import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';
import { CallAdminService } from '../services/call-admin.service';

@ApiTags('Calls / Admin')
@ApiBearerAuth()
@Controller({ path: 'calls/admin', version: '1' })
export class CallsAdminController {
  constructor(private readonly callAdminService: CallAdminService) {}

  @Get('operations')
  @RequirePermission('iam.user.read')
  @ApiOperation({ summary: 'Get calls and media operational summary for admin monitoring' })
  getOperationsSummary() {
    return this.callAdminService.getOperationsSummary();
  }
}
