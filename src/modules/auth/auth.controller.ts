import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { AuthService } from './auth.service';
import { AuthUserView, IssuedTokens } from './auth.type';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.Register(dto, {
      userAgent: req.headers['user-agent'],
    });

    this.setRefreshCookie(res, tokens.refreshToken);

    return this.buildAuthResponse(tokens, user);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.Login(dto, {
      userAgent: req.headers['user-agent'],
    });

    this.setRefreshCookie(res, tokens.refreshToken);

    return this.buildAuthResponse(tokens, user);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as
      string | undefined;

    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const { tokens, user } =
      await this.authService.RefreshTokens(rawRefreshToken);

    this.setRefreshCookie(res, tokens.refreshToken);

    return this.buildAuthResponse(tokens, user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.Logout(currentUser.sessionId);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });

    return {};
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.authService.Me(currentUser);

    return this.mapUserView(user);
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  }

  private buildAuthResponse(tokens: IssuedTokens, user: AuthUserView) {
    return {
      access_token: tokens.accessToken,
      access_token_expires_in: tokens.accessTokenExpiresIn,
      user: this.mapUserView(user),
    };
  }

  private mapUserView(user: AuthUserView) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      base_currency: user.baseCurrency,
      household_id: user.householdId,
      role: user.role,
    };
  }
}
