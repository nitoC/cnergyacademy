import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import type { AuthUser } from '../common/auth-user';
import { STORAGE_DRIVER, StorageDriver, sniffMime } from './storage';

export const MEDIA_PURPOSES = {
  'course-thumbnail': { visibility: 'PUBLIC', types: ['image/png', 'image/jpeg', 'image/webp'], permission: 'media.upload' },
  'lesson-image': { visibility: 'PUBLIC', types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], permission: 'media.upload' },
  avatar: { visibility: 'PUBLIC', types: ['image/png', 'image/jpeg', 'image/webp'], permission: 'profile.manage' },
  resource: { visibility: 'PRIVATE', types: ['application/pdf', 'image/png', 'image/jpeg'], permission: 'media.upload' },
} as const;
export type MediaPurpose = keyof typeof MEDIA_PURPOSES;

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async upload(user: AuthUser, purpose: MediaPurpose, file?: { buffer: Buffer; size: number }) {
    const rule = MEDIA_PURPOSES[purpose];
    if (!rule) throw new BadRequestException({ code: 'INVALID_PURPOSE', message: 'Unknown upload purpose' });
    if (!user.permissions.has(rule.permission)) throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'You cannot upload this kind of file' });
    if (!file?.buffer?.length) throw new BadRequestException({ code: 'NO_FILE', message: 'Choose a file to upload' });
    if (file.size > this.config.storage.maxUploadBytes) throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'File is too large' });
    const mime = sniffMime(file.buffer);
    if (!mime || !(rule.types as readonly string[]).includes(mime)) {
      throw new BadRequestException({ code: 'UNSUPPORTED_TYPE', message: `Allowed types: ${rule.types.join(', ')}` });
    }
    const key = `${rule.visibility.toLowerCase()}/${purpose}/${randomUUID()}.${EXT[mime]}`;
    await this.storage.put(key, file.buffer, mime);
    const asset = await this.prisma.mediaAsset.create({
      data: { ownerId: user.id, purpose, storageKey: key, mimeType: mime, sizeBytes: file.size, visibility: rule.visibility },
    });
    const url = rule.visibility === 'PUBLIC' ? `${this.config.storage.publicBaseUrl}/${asset.id}` : `/api/v1/media/${asset.id}`;
    return { id: asset.id, url, mimeType: mime, sizeBytes: file.size, visibility: rule.visibility };
  }

  async readPublic(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.visibility !== 'PUBLIC') throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    const data = await this.storage.get(asset.storageKey);
    if (!data) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    return { data, mimeType: asset.mimeType };
  }

  async readPrivate(user: AuthUser, id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    if (asset.ownerId !== user.id && !user.permissions.has('courses.manage_any')) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    }
    const data = await this.storage.get(asset.storageKey);
    if (!data) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    return { data, mimeType: asset.mimeType };
  }

  mine(userId: string) {
    return this.prisma.mediaAsset.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
