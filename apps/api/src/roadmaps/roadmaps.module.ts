import { Module } from '@nestjs/common';
import { RoadmapsService } from './roadmaps.service';
import { RoadmapsController } from './roadmaps.controller';

@Module({ providers: [RoadmapsService], controllers: [RoadmapsController] })
export class RoadmapsModule {}
