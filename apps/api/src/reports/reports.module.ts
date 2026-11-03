import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({ imports: [LearningModule, PaymentsModule], providers: [ReportsService], controllers: [ReportsController] })
export class ReportsModule {}
