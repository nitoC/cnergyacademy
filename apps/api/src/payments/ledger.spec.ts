import { Prisma } from '@prisma/client';
import { ledgerEntriesForSale } from './payments.service';

describe('ledgerEntriesForSale', () => {
  it('records gross sales only when no revenue share is configured', () => {
    const e = ledgerEntriesForSale(new Prisma.Decimal('15000.00'), null);
    expect(e.map((x) => [x.type, x.amount.toFixed(2)])).toEqual([['SALE', '15000.00']]);
  });

  it('splits by the configured share without losing kobo', () => {
    const e = ledgerEntriesForSale(new Prisma.Decimal('9999.99'), 33.33);
    const creator = e.find((x) => x.type === 'CREATOR_EARNING')!.amount;
    const platform = e.find((x) => x.type === 'PLATFORM_REVENUE')!.amount;
    expect(creator.toFixed(2)).toBe('3332.99');
    expect(creator.plus(platform).toFixed(2)).toBe('9999.99');
  });
});
