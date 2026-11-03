import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { LocalStorageDriver, STORAGE_DRIVER } from './storage';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  providers: [
    { provide: STORAGE_DRIVER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new LocalStorageDriver(c.storage.localRoot) },
    MediaService,
  ],
  controllers: [MediaController],
})
export class MediaModule {}
