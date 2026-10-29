import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { partnerEntityAls } from './partner-entity.context';

@Injectable()
export class PartnerEntityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const raw = req.headers?.['x-partner-entity-id'];
    const entityId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
    return new Observable((subscriber) => {
      partnerEntityAls.run({ entityId }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
