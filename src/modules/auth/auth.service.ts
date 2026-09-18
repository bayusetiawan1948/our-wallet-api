import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import {
  AuthenticatedUser,
  JwtPayload,
  RefreshTokenPayload,
} from '../../common/types/jwt-payload.type';
import { HouseholdsService } from '../households/households.service';
import { UsersService } from '../users/users.service';
import { AuthRepository } from './auth.repository';
import { AuthUserView, IssuedTokens, RequestMeta } from './auth.type';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly householdsService: HouseholdsService,
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async Register(
    dto: RegisterDto,
    meta: RequestMeta,
  ): Promise<{ tokens: IssuedTokens; user: AuthUserView }> {
    const existingUser = await this.usersService.FindByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const user = await this.usersService.Create({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

    const session = await this.authRepository.CreateSession({
      userId: user.id,
      deviceId: randomUUID(),
      userAgent: meta.userAgent,
      refreshTokenHash: '',
      expiresAt: new Date(),
    });

    const tokens = await this.issueTokenPair(
      user.id,
      session.id,
      session.deviceId,
    );

    return {
      tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        baseCurrency: user.baseCurrency,
        householdId: null,
        role: null,
      },
    };
  }

  async Login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ tokens: IssuedTokens; user: AuthUserView }> {
    const user = await this.usersService.FindByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const session = await this.authRepository.CreateSession({
      userId: user.id,
      deviceId: randomUUID(),
      userAgent: meta.userAgent,
      refreshTokenHash: '',
      expiresAt: new Date(),
    });

    const tokens = await this.issueTokenPair(
      user.id,
      session.id,
      session.deviceId,
    );
    const membership = await this.householdsService.FindMembershipByUserId(
      user.id,
    );

    return {
      tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        baseCurrency: user.baseCurrency,
        householdId: membership?.householdId ?? null,
        role: membership?.role ?? null,
      },
    };
  }

  async RefreshTokens(
    rawRefreshToken: string,
  ): Promise<{ tokens: IssuedTokens; user: AuthUserView }> {
    const payload = await this.verifyRefreshToken(rawRefreshToken);

    const session = await this.authRepository.FindSessionById(
      payload.sessionId,
    );

    if (
      !session ||
      session.isRevoked ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const incomingHash = this.hashRefreshToken(rawRefreshToken);
    if (incomingHash !== session.refreshTokenHash) {
      // Kemungkinan refresh token dicuri/reuse: langsung revoke session demi keamanan.
      await this.authRepository.RevokeSession(session.id);
      throw new UnauthorizedException('Refresh token is invalid');
    }

    const user = await this.usersService.FindById(session.userId);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const tokens = await this.issueTokenPair(
      user.id,
      session.id,
      session.deviceId,
    );
    const membership = await this.householdsService.FindMembershipByUserId(
      user.id,
    );

    return {
      tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        baseCurrency: user.baseCurrency,
        householdId: membership?.householdId ?? null,
        role: membership?.role ?? null,
      },
    };
  }

  async Logout(sessionId: string): Promise<void> {
    await this.authRepository.RevokeSession(sessionId);
  }

  async Me(currentUser: AuthenticatedUser): Promise<AuthUserView> {
    const user = await this.usersService.FindById(currentUser.userId);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const membership = await this.householdsService.FindMembershipByUserId(
      user.id,
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      baseCurrency: user.baseCurrency,
      householdId: membership?.householdId ?? null,
      role: membership?.role ?? null,
    };
  }

  private async issueTokenPair(
    userId: string,
    sessionId: string,
    deviceId: string,
  ): Promise<IssuedTokens> {
    const user = await this.usersService.FindById(userId);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const membership =
      await this.householdsService.FindMembershipByUserId(userId);

    const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';

    const accessPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      fullName: user.name,
      householdId: membership?.householdId ?? null,
      role: membership?.role ?? null,
      sessionId,
      deviceId,
    };

    const refreshPayload: RefreshTokenPayload = {
      userId: user.id,
      sessionId,
      deviceId,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.getAccessSecret(),
      expiresIn: accessExpiresIn as JwtSignOptions['expiresIn'],
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.getRefreshSecret(),
      expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
    });

    await this.authRepository.UpdateRefreshToken(
      sessionId,
      this.hashRefreshToken(refreshToken),
      this.resolveExpiryDate(refreshExpiresIn),
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: accessExpiresIn,
    };
  }

  private async verifyRefreshToken(
    rawRefreshToken: string,
  ): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.getRefreshSecret() },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private hashRefreshToken(rawRefreshToken: string): string {
    return createHash('sha256').update(rawRefreshToken).digest('hex');
  }

  private getAccessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'our-wallet-jwt-secret';
  }

  private getRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'our-wallet-jwt-refresh-secret';
  }

  /**
   * `expiresIn` di JWT ("30d", "15m") tidak dikembalikan sebagai Date oleh
   * jsonwebtoken, jadi expiry session dihitung manual dari string durasi yang sama.
   */
  private resolveExpiryDate(durationExpression: string): Date {
    const match = /^(\d+)([smhd])$/.exec(durationExpression.trim());

    if (!match) {
      throw new Error(
        `Invalid duration expression for token expiry: ${durationExpression}`,
      );
    }

    const value = Number(match[1]);
    const unit = match[2];

    const unitToMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * unitToMs[unit]);
  }
}
