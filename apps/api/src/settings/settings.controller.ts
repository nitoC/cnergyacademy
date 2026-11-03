import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsObject() values: Record<string, unknown>;
}

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Non-sensitive settings the public site needs. */
  @Public()
  @Get('settings/public')
  async publicSettings() {
    return {
      platformName: await this.settings.get('general.platformName'),
      supportEmail: await this.settings.get('general.supportEmail'),
      refundPolicy: await this.settings.get('policies.refundPolicy'),
    };
  }

  @Get('admin/settings')
  @RequirePermissions('settings.manage')
  all() {
    return this.settings.all();
  }

  @Patch('admin/settings')
  @RequirePermissions('settings.manage')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user.id, dto.values);
  }
}
