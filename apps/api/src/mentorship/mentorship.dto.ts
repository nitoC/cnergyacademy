import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ThreadStatus } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateThreadDto {
  @IsUUID() courseId: string;
  @IsOptional() @IsUUID() lessonId?: string;
  @IsString() @MinLength(4) @MaxLength(160) @Transform(trim) subject: string;
  @IsString() @MinLength(2) @MaxLength(8000) body: string;
}

export class MessageDto {
  @IsString() @MinLength(1) @MaxLength(8000) @Transform(trim) body: string;
}

export class ThreadQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['mine', 'inbox', 'all']) scope: 'mine' | 'inbox' | 'all' = 'mine';
  @IsOptional() @IsEnum(ThreadStatus) status?: ThreadStatus;
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsIn(['true', 'false']) unassigned?: 'true' | 'false';
}

export class MessagesQueryDto {
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 30;
}

export class AssignMentorDto {
  @ValidateIf((_, v) => v !== null) @IsUUID() mentorId: string | null;
}

export class MentorAssignmentDto {
  @IsUUID() mentorId: string;
  @IsUUID() courseId: string;
}
