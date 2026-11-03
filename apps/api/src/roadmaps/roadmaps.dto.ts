import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { RoadmapNodeType, RoadmapStatus } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRoadmapDto {
  @IsString() @MinLength(3) @MaxLength(120) @Transform(trim) title: string;
  @IsString() @MinLength(10) @MaxLength(1000) summary: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() subjectId?: string | null;
}

export class UpdateRoadmapDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(1000) summary?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() subjectId?: string | null;
}

export class NodeDto {
  @IsEnum(RoadmapNodeType) type: RoadmapNodeType;
  @IsString() @MinLength(2) @MaxLength(140) @Transform(trim) title: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() courseId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() moduleId?: string | null;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateNodeDto {
  @IsOptional() @IsEnum(RoadmapNodeType) type?: RoadmapNodeType;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(140) @Transform(trim) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() courseId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() moduleId?: string | null;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class EdgeDto {
  @IsUUID() fromNodeId: string;
  @IsUUID() toNodeId: string;
}

export class ReorderNodesDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids: string[];
}

export class RoadmapDecisionDto {
  @IsIn(['publish', 'reject', 'archive', 'submit', 'unpublish']) action: 'publish' | 'reject' | 'archive' | 'submit' | 'unpublish';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class AdminRoadmapQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(RoadmapStatus) status?: RoadmapStatus;
  @IsOptional() @IsIn(['course', 'platform']) kind?: 'course' | 'platform';
}
