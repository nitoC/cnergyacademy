import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';

@Module({ imports: [LearningModule], providers: [QuizzesService], controllers: [QuizzesController] })
export class QuizzesModule {}
