import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from './modules/iam/decorators/public.decorator';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'coescd-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
