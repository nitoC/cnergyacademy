import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { ACCESS_COOKIE, REFRESH_COOKIE, SESSION_HINT_COOKIE } from '../common/cookies';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { AuthService, IssuedSession } from './auth.service';
import { ChangePasswordDto, EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './auth.dto';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private cookieBase(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.cookies.secure, domain: this.config.cookies.domain };
  }

  private setSessionCookies(res: Response, session: IssuedSession) {
    res.cookie(ACCESS_COOKIE, session.accessToken, { ...this.cookieBase(), path: '/', maxAge: this.config.jwt.accessTtlSeconds * 1000 });
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieBase(),
      // Only ever sent to the auth endpoints.
      path: `/${this.config.apiPrefix}/auth`,
      expires: session.refreshExpiresAt,
    });
    res.cookie(SESSION_HINT_COOKIE, '1', { ...this.cookieBase(), path: '/', expires: session.refreshExpiresAt });
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(), path: `/${this.config.apiPrefix}/auth` });
    res.clearCookie(SESSION_HINT_COOKIE, { ...this.cookieBase(), path: '/' });
  }

  private client(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Public()
  @Throttle(STRICT)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(dto, this.client(req));
    this.setSessionCookies(res, session);
    return this.auth.me(session.userId);
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto, this.client(req));
    this.setSessionCookies(res, session);
    return this.auth.me(session.userId);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.client(req));
      this.setSessionCookies(res, session);
      return { ok: true };
    } catch (err) {
      const code = (err as { response?: { code?: string } }).response?.code;
      if (code !== 'REFRESH_RACE') this.clearSessionCookies(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentUser() user?: AuthUser) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], user?.id);
    this.clearSessionCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logoutAll(user.id);
    this.clearSessionCookies(res);
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(200)
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Throttle(STRICT)
  @Post('change-password')
  @HttpCode(200)
  change(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(user.id, dto, req.cookies?.[REFRESH_COOKIE]);
  }
}
