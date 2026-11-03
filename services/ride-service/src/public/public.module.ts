import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { TrackingModule } from '../tracking/tracking.module';
import { LegalDocumentsModule } from '../legal-documents/legal-documents.module';
import { IosStoreVersionService } from './ios-store-version';

@Module({
  imports: [TrackingModule, LegalDocumentsModule],
  controllers: [PublicController],
  providers: [{ provide: IosStoreVersionService, useFactory: () => new IosStoreVersionService() }],
})
export class PublicModule {}
