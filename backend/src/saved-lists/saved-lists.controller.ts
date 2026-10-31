import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createSavedListSchema,
  savedListIdSchema,
  savedListItemParamsSchema,
  updateSavedListSchema,
  type CreateSavedListInput,
  type UpdateSavedListInput,
} from './saved-lists.schema';
import { SavedListsService } from './saved-lists.service';

@ApiTags('saved-lists')
@ApiBearerAuth()
@Controller('saved-lists')
export class SavedListsController {
  constructor(private readonly savedLists: SavedListsService) {}

  @Get()
  @ApiOperation({ summary: 'Мои списки сохранённых изделий' })
  async list(@CurrentUser() user: RequestUser) {
    return this.savedLists.findMine(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать список' })
  async create(
    @Body(new ZodValidationPipe(createSavedListSchema)) input: CreateSavedListInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedLists.create(user.id, input);
  }

  @Get(':listId')
  @ApiOperation({ summary: 'Список с актуальными карточками изделий' })
  async detail(
    @Param(new ZodValidationPipe(savedListIdSchema)) params: { listId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedLists.findOne(params.listId, user.id);
  }

  @Patch(':listId')
  @ApiOperation({ summary: 'Переименовать список или привязать к организации' })
  async update(
    @Param(new ZodValidationPipe(savedListIdSchema)) params: { listId: string },
    @Body(new ZodValidationPipe(updateSavedListSchema)) input: UpdateSavedListInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedLists.update(params.listId, user.id, input);
  }

  @Delete(':listId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Удалить список' })
  async remove(
    @Param(new ZodValidationPipe(savedListIdSchema)) params: { listId: string },
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.savedLists.remove(params.listId, user.id);
  }

  @Post(':listId/products/:productId')
  @ApiOperation({ summary: 'Добавить изделие в список' })
  async addProduct(
    @Param(new ZodValidationPipe(savedListItemParamsSchema))
    params: { listId: string; productId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedLists.addProduct(params.listId, params.productId, user.id);
  }

  @Delete(':listId/products/:productId')
  @ApiOperation({ summary: 'Убрать изделие из списка' })
  async removeProduct(
    @Param(new ZodValidationPipe(savedListItemParamsSchema))
    params: { listId: string; productId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.savedLists.removeProduct(params.listId, params.productId, user.id);
  }
}
