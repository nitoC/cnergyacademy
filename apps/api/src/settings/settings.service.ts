import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { SETTINGS_SCHEMA, SettingKey, validateSetting } from './settings.schema';

type SettingValue<K extends SettingKey> = (typeof SETTINGS_SCHEMA)[K]['default'];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get<K extends SettingKey>(key: K, tx?: Tx): Promise<SettingValue<K>> {
    const row = await (tx ?? this.prisma).platformSetting.findUnique({ where: { key } });
    return (row ? row.value : SETTINGS_SCHEMA[key].default) as SettingValue<K>;
  }

  async all() {
    const rows = await this.prisma.platformSetting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r]));
    const settings = Object.entries(SETTINGS_SCHEMA).map(([key, def]) => ({
      key,
      ...def,
      value: stored.has(key) ? stored.get(key)!.value : def.default,
      updatedAt: stored.get(key)?.updatedAt ?? null,
    }));
    return {
      settings,
      // Read-only environment facts shown to administrators. Never secrets.
      environment: {
        paymentProvider: this.config.payments.provider,
        paystackConfigured: !!this.config.payments.paystackSecretKey,
        paymentCallbackUrl: this.config.payments.callbackUrl,
        mailTransport: this.config.mail.transport,
        storageDriver: this.config.storage.driver,
      },
    };
  }

  async update(actorId: string, values: Record<string, unknown>) {
    const changes: { key: string; from: unknown; to: unknown }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const [key, raw] of Object.entries(values)) {
        const result = validateSetting(key, raw);
        if (!result.ok) throw new BadRequestException({ code: 'INVALID_SETTING', message: result.error });
        const before = await this.get(key as SettingKey, tx);
        if (JSON.stringify(before) === JSON.stringify(result.value)) continue;
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value: result.value as Prisma.InputJsonValue, updatedById: actorId },
          update: { value: result.value as Prisma.InputJsonValue, updatedById: actorId },
        });
        changes.push({ key, from: before, to: result.value });
      }
      if (changes.length) {
        await this.audit.record({ actorId, action: 'settings.update', resourceType: 'PlatformSetting', metadata: { changes } }, tx);
      }
    });
    return { updated: changes.length, changes };
  }
}
