import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { CoursesService } from './courses.service';
import { CurriculumService } from './curriculum.service';
import { CoursesController } from './courses.controller';

@Module({ imports: [LearningModule], providers: [CoursesService, CurriculumService], controllers: [CoursesController], exports: [CoursesService] })
export class CoursesModule {}
