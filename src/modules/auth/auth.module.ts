import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HouseholdsModule } from '../households/households.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, HouseholdsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository],
})
export class AuthModule {}
