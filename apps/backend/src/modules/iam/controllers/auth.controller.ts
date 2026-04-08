import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { IamService } from '../services/iam.service';
import { MfaService } from '../services/mfa.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly iamService: IamService,
    private readonly mfaService: MfaService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user credential' })
  async register(@Body() dto: RegisterDto) {
    const credential = await this.iamService.register(dto);
    return { id: credential.id, username: credential.username, email: credential.email };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Headers('user-agent') userAgent: string,
  ) {
    const ip = req.ip;
    return this.iamService.login(
      dto.username,
      dto.password,
      ip,
      userAgent,
      (credentialId, username) => this.mfaService.issueMfaPendingToken(credentialId, username),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new token pair' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: FastifyRequest) {
    return this.iamService.refreshTokens(dto.refreshToken, req.ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revoke current refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.iamService.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.iamService.logoutAll(user.id);
  }
}
