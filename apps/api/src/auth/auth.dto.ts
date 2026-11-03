import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
const PASSWORD_MESSAGE = 'Password must be 10–128 characters and include a letter and a number';

export class RegisterDto {
  @Transform(normaliseEmail) @IsEmail() @MaxLength(254) email: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password: string;
  @IsString() @MinLength(2) @MaxLength(100) @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;
}

export class LoginDto {
  @Transform(normaliseEmail) @IsEmail() email: string;
  @IsString() @MaxLength(128) password: string;
}

export class EmailDto {
  @Transform(normaliseEmail) @IsEmail() email: string;
}

export class TokenDto {
  @IsString() @MinLength(20) @MaxLength(200) token: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) newPassword: string;
}
