import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ContentTranslationService } from './content-translation.service';
import { ContentTranslationInterceptor } from './content-translation.interceptor';

@Global()
@Module({
  providers: [
    ContentTranslationService,
    { provide: APP_INTERCEPTOR, useClass: ContentTranslationInterceptor },
  ],
  exports: [ContentTranslationService],
})
export class ContentTranslationModule {}
