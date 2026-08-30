import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { WalletsService } from './wallets.service.js';

@Controller('wallet')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  health() {
    return this.walletsService.getHealth();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createWalletDto: CreateWalletDto) {
    return this.walletsService.create(createWalletDto);
  }
}
