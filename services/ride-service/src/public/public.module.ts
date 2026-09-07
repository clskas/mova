import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { TrackingModule } from '../tracking/tracking.module';
import { LegalDocumentsModule } from '../legal-documents/legal-documents.module';

@Module({
  imports: [TrackingModule, LegalDocumentsModule],
  controllers: [PublicController],
})
export class PublicModule {}
