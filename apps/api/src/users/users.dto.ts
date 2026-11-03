import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { AccountStatus, ApplicationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../common/pagination';
import { ROLE_KEYS, RoleKey } from '../common/permissions';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) @Transform(trim) fullName?: string;
  @IsOptional() @IsString() @MaxLength(60) @Transform(trim) displayName?: string;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
}

export class AdminUserQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ROLE_KEYS as unknown as string[]) role?: RoleKey;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
}

export class AssignRolesDto {
  @IsArray() @ArrayUnique() @IsIn(ROLE_KEYS as unknown as string[], { each: true }) roles: RoleKey[];
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class UpdateStatusDto {
  @IsEnum(AccountStatus) status: AccountStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreatorApplicationDto {
  @IsString() @MinLength(5) @MaxLength(140) @Transform(trim) headline: string;
  @IsString() @MinLength(10) @MaxLength(2000) expertise: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(300) portfolioUrl?: string;
  @IsString() @MinLength(30) @MaxLength(4000) motivation: string;
}

export class ApplicationQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
}

export class ReviewApplicationDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
