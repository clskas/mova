import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServicesCatalogService } from './services-catalog.service';

@ApiTags('services')
@Controller('services')
export class ServicesCatalogController {
  constructor(private catalog: ServicesCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des services SENGA' })
  list() {
    return { data: this.catalog.list() };
  }
}
