import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { AccessService } from './access.service';
import { ProgressService } from './progress.service';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';

@Module({
  imports: [CertificatesModule],
  providers: [AccessService, ProgressService, LearningService],
  controllers: [LearningController],
  exports: [AccessService, ProgressService],
})
export class LearningModule {}
