import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto, QuestionDto, ReorderQuestionsDto, SubmitAttemptDto, UpdateQuizDto } from './quizzes.dto';

@ApiTags('quizzes')
@Controller()
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  // authoring
  @Post('courses/:courseId/quizzes')
  create(@CurrentUser() u: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: CreateQuizDto) {
    return this.quizzes.create(u, courseId, dto);
  }

  @Get('creator/quizzes/:id')
  editor(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.editorView(u, id);
  }

  @Patch('quizzes/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuizDto) {
    return this.quizzes.update(u, id, dto);
  }

  @Delete('quizzes/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.remove(u, id);
  }

  @Post('quizzes/:id/questions')
  addQuestion(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionDto) {
    return this.quizzes.addQuestion(u, id, dto);
  }

  @Put('quizzes/:id/questions/order')
  reorder(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderQuestionsDto) {
    return this.quizzes.reorderQuestions(u, id, dto.ids);
  }

  @Put('questions/:id')
  updateQuestion(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionDto) {
    return this.quizzes.updateQuestion(u, id, dto);
  }

  @Delete('questions/:id')
  deleteQuestion(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.deleteQuestion(u, id);
  }

  // learners
  @Get('quizzes/:id')
  overview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.overview(u, id);
  }

  @Post('quizzes/:id/attempts')
  start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.start(u, id);
  }

  @Get('attempts/:id')
  attempt(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quizzes.getAttempt(u, id);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitAttemptDto) {
    return this.quizzes.submit(u, id, dto);
  }
}
