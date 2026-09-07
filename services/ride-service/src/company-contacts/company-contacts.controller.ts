import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyContactsService } from './company-contacts.service';

@ApiTags('company-contacts')
@Controller('company-contacts')
export class CompanyContactsController {
  constructor(private contacts: CompanyContactsService) {}

  @Get()
  @ApiOperation({ summary: 'Contacts publics AfriSoft / SENGA' })
  listPublic() {
    return this.contacts.listPublic();
  }
}
