import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';
import { PaystackProvider } from './providers/paystack.provider';
import { SandboxProvider } from './providers/sandbox.provider';
import { PaymentsService } from './payments.service';
import { FinanceService } from './finance.service';
import { PaymentsController } from './payments.controller';

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): PaymentProvider =>
        config.payments.provider === 'paystack'
          ? new PaystackProvider(config.payments.paystackSecretKey!, config.payments.paystackBaseUrl)
          : new SandboxProvider(prisma, config.webUrl, config.jwt.accessSecret),
    },
    PaymentsService,
    FinanceService,
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService, FinanceService],
})
export class PaymentsModule {}
