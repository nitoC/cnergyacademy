import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { RoadmapsService } from './roadmaps.service';
import { RoadmapsController } from './roadmaps.controller';

@Module({ imports: [LearningModule], providers: [RoadmapsService], controllers: [RoadmapsController], exports: [RoadmapsService] })
export class RoadmapsModule {}
