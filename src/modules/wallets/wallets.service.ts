import { Injectable } from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto.js';

@Injectable()
export class WalletsService {
  async create(createWalletDto: CreateWalletDto) {
    return Promise.resolve({
      message: 'Wallet created successfully',
      data: createWalletDto,
    });
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
