import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit-logs/audit.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { CoursesModule } from './courses/courses.module';
import { LearningModule } from './learning/learning.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { PaymentsModule } from './payments/payments.module';
import { RoadmapsModule } from './roadmaps/roadmaps.module';
import { MentorshipModule } from './mentorship/mentorship.module';
import { CertificatesModule } from './certificates/certificates.module';
import { MediaModule } from './media/media.module';
import { ReportsModule } from './reports/reports.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300) }],
      skipIf: () => process.env.DISABLE_RATE_LIMIT === 'true',
    }),
    AuditModule,
    MailModule,
    NotificationsModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    LearningModule,
    CoursesModule,
    QuizzesModule,
    PaymentsModule,
    RoadmapsModule,
    MentorshipModule,
    CertificatesModule,
    MediaModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → CSRF → authentication → permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
