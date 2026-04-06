import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Public } from '../decorators/public.decorator';
import { SsoService } from '../services/sso.service';
import { LdapLoginDto, SamlCallbackDto } from '../dto/sso.dto';

@Controller('auth')
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  // ── LDAP ──────────────────────────────────────────────────────────────────

  /**
   * POST /auth/ldap/login
   * Authenticates a user against the configured LDAP/AD server.
   * Returns the same JWT token pair as the local login endpoint.
   */
  @Public()
  @Post('ldap/login')
  @HttpCode(HttpStatus.OK)
  async ldapLogin(
    @Body() dto: LdapLoginDto,
    @Req() req: FastifyRequest,
  ) {
    const ip = req.ip;
    return this.ssoService.ldapLogin(dto.username, dto.password, dto.domain, ip);
  }

  // ── SAML ──────────────────────────────────────────────────────────────────

  /**
   * GET /auth/saml/:name/metadata
   * Returns SAML SP metadata XML for IdP registration.
   * :name is the sso_configurations.name value (e.g. "CoESCD AD").
   */
  @Public()
  @Get('saml/:name/metadata')
  @Header('Content-Type', 'application/xml')
  async samlMetadata(@Param('name') name: string): Promise<string> {
    return this.ssoService.getSamlMetadataByName(name);
  }

  /**
   * POST /auth/saml/acs
   * SAML 2.0 Assertion Consumer Service endpoint.
   * Receives the IdP POST-binding response, validates it, and issues JWT tokens.
   *
   * On success redirects to the frontend with the access token in the URL
   * fragment (token is short-lived; the frontend exchanges it for a full session).
   */
  @Public()
  @Post('saml/acs')
  @HttpCode(HttpStatus.OK)
  async samlAcs(
    @Body() body: SamlCallbackDto,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const tokens = await this.ssoService.samlCallback(
      body.SAMLResponse,
      body.RelayState,
      req.ip,
    );

    // Return tokens as JSON (frontend SPA will handle the redirect)
    return res.send(tokens);
  }
}
