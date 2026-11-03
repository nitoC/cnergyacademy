import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const ACCENTS = ['forest', 'amber', 'terracotta', 'moss', 'slate', 'clay'] as const;

export class SubjectDto {
  @IsString() @MinLength(2) @MaxLength(80) @Transform(trim) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(ACCENTS as unknown as string[]) accentColor?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateSubjectDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(ACCENTS as unknown as string[]) accentColor?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class CategoryDto {
  @IsUUID() subjectId: string;
  @IsString() @MinLength(2) @MaxLength(80) @Transform(trim) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class ReorderDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids: string[];
}
