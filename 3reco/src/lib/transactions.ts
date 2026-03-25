import type { Doc } from '@convex/_generated/dataModel';

type EffectiveDateTransaction = Pick<
  Doc<'transactions'>,
  '_creationTime' | 'type' | 'collectionDate'
> & {
  collectionDay?: string;
};

const SOUTH_AFRICA_TIME_ZONE = 'Africa/Johannesburg';
const COLLECTION_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function getDateParts(timestamp: number) {
  const formatter = new Intl.DateTimeFormat('en-ZA', {
    timeZone: SOUTH_AFRICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to format the transaction date.');
  }

  return { year, month, day };
}

function isValidCollectionDay(value: string) {
  const match = COLLECTION_DAY_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
  );
}

function getLocalTimestampForCollectionDay(value: string) {
  const match = COLLECTION_DAY_PATTERN.exec(value);

  if (!match) {
    throw new Error('Unable to resolve the collection date.');
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function parseCollectionDayInput(value?: string) {
  if (!value || !isValidCollectionDay(value)) {
    return undefined;
  }

  return value;
}

export function getTransactionCollectionDay(
  transaction: EffectiveDateTransaction
) {
  if (transaction.type !== 'c2b') {
    return undefined;
  }

  if (transaction.collectionDay && isValidCollectionDay(transaction.collectionDay)) {
    return transaction.collectionDay;
  }

  if (transaction.collectionDate !== undefined) {
    const { year, month, day } = getDateParts(transaction.collectionDate);
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

export function getEffectiveTransactionDate(
  transaction: EffectiveDateTransaction
) {
  if (transaction.type === 'c2b') {
    const collectionDay = getTransactionCollectionDay(transaction);

    if (collectionDay) {
      return getLocalTimestampForCollectionDay(collectionDay);
    }
  }

  return transaction._creationTime;
}

export function formatTransactionDateForFileName(timestamp: number) {
  const { year, month, day } = getDateParts(timestamp);
  return `${year}-${month}-${day}`;
}