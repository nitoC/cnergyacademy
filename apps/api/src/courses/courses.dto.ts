import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CompletionRule, CourseStatus, DifficultyLevel, ModuleAccess } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CatalogQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(80) subject?: string; // slug
  @IsOptional() @IsString() @MaxLength(80) category?: string; // slug
  @IsOptional() @IsEnum(DifficultyLevel) difficulty?: DifficultyLevel;
  @IsOptional() @IsIn(['free', 'paid']) price?: 'free' | 'paid';
  @IsOptional() @IsIn(['newest', 'popular', 'title', 'shortest']) sort: 'newest' | 'popular' | 'title' | 'shortest' = 'newest';
}

export class AdminCourseQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(CourseStatus) status?: CourseStatus;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsUUID() creatorId?: string;
  @IsOptional() @IsIn(['pending']) pricing?: 'pending';
}

export class CreateCourseDto {
  @IsString() @MinLength(4) @MaxLength(120) @Transform(trim) title: string;
  @IsString() @MinLength(10) @MaxLength(240) @Transform(trim) shortDescription: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsUUID() subjectId: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(DifficultyLevel) difficulty?: DifficultyLevel;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(200, { each: true }) learningOutcomes?: string[];
  @IsOptional() @IsInt() @Min(5) @Max(100_000) estimatedMinutes?: number;
  /** Creator's proposal; an administrator must approve it before it applies. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) proposedPrice?: number;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @MinLength(4) @MaxLength(120) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(240) @Transform(trim) shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() categoryId?: string | null;
  @IsOptional() @IsEnum(DifficultyLevel) difficulty?: DifficultyLevel;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(200, { each: true }) learningOutcomes?: string[];
  @IsOptional() @IsInt() @Min(5) @Max(100_000) estimatedMinutes?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) thumbnailUrl?: string | null;
  @IsOptional() @IsEnum(CompletionRule) completionRule?: CompletionRule;
  @IsOptional() @IsBoolean() certificateEnabled?: boolean;
}

export class TransitionDto {
  @IsIn(['submit', 'withdraw', 'approve', 'reject', 'publish', 'unpublish', 'archive', 'restore'])
  action: 'submit' | 'withdraw' | 'approve' | 'reject' | 'publish' | 'unpublish' | 'archive' | 'restore';
  @IsOptional() @IsString() @MaxLength(4000) feedback?: string;
}

export class ProposePriceDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) amount: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class DecidePriceDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

// ─── curriculum ───

export class CreateModuleDto {
  @IsString() @MinLength(2) @MaxLength(140) @Transform(trim) title: string;
  @IsOptional() @IsString() @MaxLength(1000) summary?: string;
  @IsOptional() @IsEnum(ModuleAccess) access?: ModuleAccess;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() prerequisiteQuizId?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class UpdateModuleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(140) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) summary?: string;
  @IsOptional() @IsEnum(ModuleAccess) access?: ModuleAccess;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() prerequisiteQuizId?: string | null;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class ReorderDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids: string[];
}

export class CreateLessonDto {
  @IsString() @MinLength(2) @MaxLength(160) @Transform(trim) title: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsOptional() @IsArray() content?: unknown[];
  @IsOptional() @IsInt() @Min(1) @Max(600) estimatedMinutes?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class UpdateLessonDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsOptional() @IsArray() content?: unknown[];
  @IsOptional() @IsInt() @Min(1) @Max(600) estimatedMinutes?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  /** Move the lesson to another module of the same course. */
  @IsOptional() @IsUUID() moduleId?: string;
}
