import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { currentRequestLanguage } from '@mova/shared';
import { ContentTranslationService } from './content-translation.service';
import { isContentRoute } from './content-translation.util';

/** English users get partner content (menus, listings, ads) in English when a translation exists. */
@Injectable()
export class ContentTranslationInterceptor implements NestInterceptor {
  constructor(private translations: ContentTranslationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || currentRequestLanguage() !== 'en') return next.handle();
    const req = context.switchToHttp().getRequest<{ method: string; originalUrl?: string; url: string }>();
    if (!isContentRoute(req.method, req.originalUrl ?? req.url)) return next.handle();
    return next.handle().pipe(mergeMap((body) => from(this.translations.translateBody(body))));
  }
}
