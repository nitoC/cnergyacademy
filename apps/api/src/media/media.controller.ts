import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { MEDIA_PURPOSES, MediaPurpose, MediaService } from './media.service';

class UploadDto {
  @IsIn(Object.keys(MEDIA_PURPOSES)) purpose: MediaPurpose;
}

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024), files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadDto, @UploadedFile() file?: Express.Multer.File) {
    return this.media.upload(user, dto.purpose, file);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.media.mine(user.id);
  }

  @Public()
  @Get('public/:id')
  async publicFile(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { data, mimeType } = await this.media.readPublic(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(data);
  }

  @Get(':id')
  async privateFile(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { data, mimeType } = await this.media.readPrivate(user, id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(data);
  }
}
