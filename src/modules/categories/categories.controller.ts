import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ) {
    const category = await this.categoriesService.CreateCategory(
      currentUser,
      dto.name,
      dto.type,
      dto.icon,
      dto.parent_id,
    );

    return this.toResponse(category);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() currentUser: AuthenticatedUser) {
    const categories = await this.categoriesService.ListCategories(currentUser);

    return categories.map((category) => this.toResponse(category));
  }

  @Patch(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const category = await this.categoriesService.UpdateCategory(
      currentUser,
      id,
      {
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        parentId: dto.parent_id,
        isHidden: dto.is_hidden,
      },
    );

    return this.toResponse(category);
  }

  @Patch(':id/toggle-status')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async toggleStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const category = await this.categoriesService.ToggleStatus(
      currentUser,
      id,
    );

    return this.toResponse(category);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.categoriesService.DeleteCategory(currentUser, id);

    return { id };
  }

  private toResponse(category: {
    id: string;
    householdId: string;
    parentId: string | null;
    name: string;
    type: string;
    icon: string | null;
    isSystem: boolean;
    isHidden: boolean;
  }) {
    return {
      id: category.id,
      household_id: category.householdId,
      parent_id: category.parentId,
      name: category.name,
      type: category.type,
      icon: category.icon,
      is_system: category.isSystem,
      is_hidden: category.isHidden,
    };
  }
}
