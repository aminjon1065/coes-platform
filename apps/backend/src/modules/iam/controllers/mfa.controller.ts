import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

import { MfaService } from '../services/mfa.service';
import { MfaTokenDto, MfaVerifyStepDto, MfaVerifyBackupStepDto } from '../dto/mfa.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';

@ApiTags('MFA')
@Controller({ path: 'iam/mfa', version: '1' })
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  // ── Authenticated endpoints (require valid access token) ─────────────────

  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current MFA status for the authenticated user' })
  async getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.getStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate MFA setup — returns secret and QR code' })
  async initSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.initSetup(user.id, user.username);
  }

  @UseGuards(JwtAuthGuard)
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm setup and enable MFA — returns one-time backup codes' })
  async enable(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaTokenDto) {
    return this.mfaService.confirmSetup(user.id, dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA (requires current TOTP token as confirmation)' })
  async disable(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaTokenDto) {
    await this.mfaService.disable(user.id, dto.token);
  }

  // ── Public endpoints (used during login MFA step) ─────────────────────────

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP code during login and receive full token pair' })
  async verifyStep(
    @Body() dto: MfaVerifyStepDto,
    @Req() req: FastifyRequest,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.mfaService.verifyAndIssueTokens(dto.mfaToken, dto.totpCode, req.ip, userAgent);
  }

  @Public()
  @Post('verify-backup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use a backup code during login and receive full token pair' })
  async verifyBackupStep(
    @Body() dto: MfaVerifyBackupStepDto,
    @Req() req: FastifyRequest,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.mfaService.verifyBackupAndIssueTokens(
      dto.mfaToken,
      dto.backupCode,
      req.ip,
      userAgent,
    );
  }
}
