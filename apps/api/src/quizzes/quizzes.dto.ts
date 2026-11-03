import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { FeedbackPolicy, QuestionType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateQuizDto {
  @IsString() @MinLength(2) @MaxLength(160) @Transform(trim) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() moduleId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() lessonId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(100) passingScore?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100) maxAttempts?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10_080) cooldownMinutes?: number;
  @IsOptional() @IsBoolean() allowNavigation?: boolean;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsEnum(FeedbackPolicy) feedbackPolicy?: FeedbackPolicy;
}

export class UpdateQuizDto extends PartialType(CreateQuizDto) {
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class OptionDto {
  @IsString() @MinLength(1) @MaxLength(500) @Transform(trim) label: string;
  @IsBoolean() isCorrect: boolean;
}

export class QuestionDto {
  @IsOptional() @IsEnum(QuestionType) type?: QuestionType;
  @IsString() @MinLength(3) @MaxLength(2000) prompt: string;
  @IsOptional() @IsString() @MaxLength(4000) explanation?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) points?: number;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => OptionDto) options: OptionDto[];
}

export class ReorderQuestionsDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids: string[];
}

export class AnswerDto {
  @IsUUID() questionId: string;
  @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsUUID('4', { each: true }) optionIds: string[];
}

export class SubmitAttemptDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AnswerDto) answers: AnswerDto[];
}
