import { Injectable } from '@nestjs/common';
import { NewUser, User } from '../../shared/database/schema';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  FindByEmail(email: string): Promise<User | undefined> {
    return this.usersRepository.FindByEmail(email);
  }

  FindById(id: string): Promise<User | undefined> {
    return this.usersRepository.FindById(id);
  }

  Create(data: NewUser): Promise<User> {
    return this.usersRepository.Create(data);
  }
}
