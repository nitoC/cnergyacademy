import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_CSRF } from '../decorators';
import { CSRF_HEADER } from '../cookies';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Requires the custom CSRF header on every state-changing request. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [context.getHandler(), context.getClass()])) return true;
    // Bearer-token clients (API consumers, tests) are not exposed to CSRF.
    if (req.headers.authorization?.startsWith('Bearer ')) return true;
    if (req.headers[CSRF_HEADER] !== '1') {
      throw new ForbiddenException({ code: 'CSRF_REJECTED', message: 'Missing request verification header' });
    }
    return true;
  }
}
