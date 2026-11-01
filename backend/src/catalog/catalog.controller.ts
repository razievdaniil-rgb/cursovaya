import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/jwt-auth.guard';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('filters')
  @ApiOperation({
    summary: 'Справочники и счётчики для панели фильтров',
    description:
      'Счётчики считаются из таблиц при запросе, поэтому всегда совпадают ' +
      'с фактическим составом каталога.',
  })
  async filters() {
    return this.catalog.getFilters();
  }
}
