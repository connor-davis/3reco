import { ConvexError } from 'convex/values';

const SOUTH_AFRICA_TIME_ZONE = 'Africa/Johannesburg';
const COLLECTION_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type CollectionDayTransaction = {
  _creationTime: number;
  type: 'c2b' | 'b2b';
  collectionDay?: string;
  collectionDate?: number;
};

function getDateFormatter() {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: SOUTH_AFRICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function parseCollectionDayParts(value: string) {
  const match = COLLECTION_DAY_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const parsed = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

  if (
    parsed.getUTCFullYear() !== yearNumber ||
    parsed.getUTCMonth() !== monthNumber - 1 ||
    parsed.getUTCDate() !== dayNumber
  ) {
    return null;
  }

  return { year, month, day };
}

export function isValidCollectionDay(value: string) {
  return parseCollectionDayParts(value) !== null;
}

export function assertValidCollectionDay(value: string) {
  if (!isValidCollectionDay(value)) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'Collection day must be a valid calendar date in YYYY-MM-DD format.',
    });
  }
}

export function getCalendarDateParts(timestamp: number) {
  const parts = getDateFormatter().formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new ConvexError({
      name: 'Unexpected Error',
      message: 'Unable to format the transaction date.',
    });
  }

  return { year, month, day };
}

function formatCollectionDayParts(parts: {
  year: string;
  month: string;
  day: string;
}) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTransactionCollectionDay(
  transaction: CollectionDayTransaction
) {
  if (transaction.type !== 'c2b') {
    return undefined;
  }

  if (transaction.collectionDay && isValidCollectionDay(transaction.collectionDay)) {
    return transaction.collectionDay;
  }

  if (transaction.collectionDate !== undefined) {
    return formatCollectionDayParts(getCalendarDateParts(transaction.collectionDate));
  }

  return undefined;
}

export function getCollectionDayTimestamp(value: string) {
  const parts = parseCollectionDayParts(value);

  if (!parts) {
    throw new ConvexError({
      name: 'Unexpected Error',
      message: 'Unable to resolve the collection day.',
    });
  }

  return Date.parse(`${value}T00:00:00.000+02:00`);
}

export function getEffectiveTransactionDate(transaction: CollectionDayTransaction) {
  if (transaction.type === 'c2b') {
    const collectionDay = getTransactionCollectionDay(transaction);

    if (collectionDay) {
      return getCollectionDayTimestamp(collectionDay);
    }
  }

  return transaction._creationTime;
}