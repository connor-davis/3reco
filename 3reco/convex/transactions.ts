import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { txByType } from './aggregates';
import { assertValidCollectionDay } from './lib/collectionDay';
import { getCurrentUserIdOrThrow, getCurrentUserOrThrow } from './users';

export const txItemValidator = v.object({
  materialId: v.id('materials'),
  weight: v.number(),
  price: v.number(),
});

const receiptUploadSlotValidator = v.object({
  token: v.string(),
  issuedAt: v.number(),
  issuedBy: v.id('users'),
});

const receiptAttachmentValidator = v.object({
  storageId: v.id('_storage'),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
  checksum: v.optional(v.string()),
  uploadedAt: v.number(),
  uploadedBy: v.id('users'),
});

const MAX_RECEIPT_ATTACHMENTS = 5;
const MAX_RECEIPT_FILE_SIZE = 5 * 1024 * 1024;
const RECEIPT_UPLOAD_BINDING_TTL_MS = 15 * 60 * 1000;
const ALLOWED_RECEIPT_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const RECEIPT_FILE_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export default defineTable({
  sellerId: v.id('users'),
  buyerId: v.id('users'),
  items: v.array(txItemValidator),
  totalPrice: v.number(),
  type: v.union(v.literal('c2b'), v.literal('b2b')),
  collectionDay: v.optional(v.string()),
  collectionDate: v.optional(v.number()),
  invoiceStorageId: v.optional(v.id('_storage')),
  receiptAttachments: v.optional(v.array(receiptAttachmentValidator)),
  receiptUploadBindings: v.optional(v.array(receiptUploadSlotValidator)),
})
  .index('by_sellerId', ['sellerId'])
  .index('by_buyerId', ['buyerId'])
  .index('by_type', ['type'])
  .index('by_sellerId_and_type', ['sellerId', 'type'])
  .index('by_buyerId_and_type', ['buyerId', 'type']);

function unauthorizedError() {
  return new ConvexError({
    name: 'Unauthorized',
    message: 'You are not authorized to access this resource.',
  });
}

async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUserOrThrow(ctx);
  return { userId: user._id, user };
}

function canReadAllTransactions(userType: string | undefined) {
  return userType === 'admin' || userType === 'staff';
}

function sanitizeTransaction<T extends { receiptUploadBindings?: unknown }>(
  transaction: T
) {
  const { receiptUploadBindings: _receiptUploadBindings, ...publicTransaction } =
    transaction;
  return publicTransaction;
}

function mergeTransactionsByNewestFirst<
  T extends { _id: Id<'transactions'>; _creationTime: number },
>(transactions: T[]) {
  const uniqueTransactions = new Map<Id<'transactions'>, T>();

  for (const transaction of transactions) {
    uniqueTransactions.set(transaction._id, transaction);
  }

  return [...uniqueTransactions.values()].sort(
    (left, right) => right._creationTime - left._creationTime
  );
}

function decodePaginationCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'The pagination cursor is invalid.',
    });
  }

  return parsed;
}

function paginateResults<T>(
  items: T[],
  paginationOpts: {
    numItems: number;
    cursor: string | null;
    endCursor?: string | null;
  }
) {
  const startIndex = Math.min(decodePaginationCursor(paginationOpts.cursor), items.length);
  const endLimit = paginationOpts.endCursor
    ? Math.min(decodePaginationCursor(paginationOpts.endCursor), items.length)
    : items.length;
  const endIndex = Math.min(startIndex + paginationOpts.numItems, endLimit);

  return {
    page: items.slice(startIndex, endIndex),
    isDone: endIndex >= endLimit,
    continueCursor: String(endIndex),
  };
}

async function listVisibleTransactions(ctx: QueryCtx, userId: Id<'users'>, userType: string | undefined) {
  if (canReadAllTransactions(userType)) {
    return await ctx.db.query('transactions').order('desc').collect();
  }

  const [asBuyer, asSeller] = await Promise.all([
    ctx.db
      .query('transactions')
      .withIndex('by_buyerId', (query) => query.eq('buyerId', userId))
      .collect(),
    ctx.db
      .query('transactions')
      .withIndex('by_sellerId', (query) => query.eq('sellerId', userId))
      .collect(),
  ]);

  return mergeTransactionsByNewestFirst([...asBuyer, ...asSeller]);
}

async function getAuthorizedTransaction(
  ctx: QueryCtx | MutationCtx,
  transactionId: Id<'transactions'>
) {
  const { userId, user } = await getAuthenticatedUser(ctx);
  const transaction = await ctx.db.get('transactions', transactionId);

  if (!transaction) {
    throw new ConvexError({
      name: 'Not Found',
      message: 'The transaction was not found.',
    });
  }

  if (
    !canReadAllTransactions(user.type) &&
    transaction.sellerId !== userId &&
    transaction.buyerId !== userId
  ) {
    throw unauthorizedError();
  }

  return { transaction, userId, user };
}

async function getParticipantTransaction(
  ctx: QueryCtx | MutationCtx,
  transactionId: Id<'transactions'>
) {
  const { transaction, userId } = await getAuthorizedTransaction(ctx, transactionId);

  if (transaction.sellerId !== userId && transaction.buyerId !== userId) {
    throw unauthorizedError();
  }

  return { transaction, userId };
}

function getReceiptFileName(storageId: Id<'_storage'>, contentType: string) {
  const extension = RECEIPT_FILE_EXTENSION_BY_TYPE[contentType] ?? 'bin';
  return `receipt-${storageId}.${extension}`;
}

function validateReceiptStorageMetadata(metadata: {
  contentType?: string | null;
  size: number;
}) {
  const normalizedContentType = metadata.contentType?.toLowerCase();

  if (!normalizedContentType) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'Receipt attachments must include a content type.',
    });
  }

  if (!ALLOWED_RECEIPT_CONTENT_TYPES.has(normalizedContentType)) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'Receipt attachments must be PNG, JPEG, JPG, WEBP, or GIF images.',
    });
  }

  if (!Number.isFinite(metadata.size) || metadata.size <= 0) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'Receipt attachment size must be greater than zero.',
    });
  }

  if (metadata.size > MAX_RECEIPT_FILE_SIZE) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'Receipt attachments must be 5 MB or smaller.',
    });
  }
}

function assertReceiptAttachmentCapacity(receiptAttachments: Array<{ storageId: Id<'_storage'> }> | undefined) {
  if ((receiptAttachments?.length ?? 0) >= MAX_RECEIPT_ATTACHMENTS) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'You can attach up to 5 receipts to a transaction.',
    });
  }
}

function createReceiptUploadSlot(issuedBy: Id<'users'>, issuedAt: number) {
  return {
    token: crypto.randomUUID(),
    issuedAt,
    issuedBy,
  };
}

function isReceiptUploadSlotActive(
  slot: {
    issuedAt: number;
  },
  now: number
) {
  return now - slot.issuedAt < RECEIPT_UPLOAD_BINDING_TTL_MS;
}

function pruneReceiptUploadSlots<T extends { issuedAt: number }>(
  slots: T[] | undefined,
  now: number
) {
  return (slots ?? []).filter((slot) => isReceiptUploadSlotActive(slot, now));
}

export const listExpensesWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const userId = user._id;

    if (user.type === 'business') {
      const results = await ctx.db
        .query('transactions')
        .withIndex('by_buyerId', (q) => q.eq('buyerId', userId))
        .order('desc')
        .paginate(paginationOpts);

      return {
        ...results,
        page: results.page.map((transaction) => sanitizeTransaction(transaction)),
      };
    }

    if (user.type === 'collector') {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Collectors are not authorized to access this resource.',
      });
    }

    const results = await ctx.db
      .query('transactions')
      .order('desc')
      .paginate(paginationOpts);

    return {
      ...results,
      page: results.page.map((transaction) => sanitizeTransaction(transaction)),
    };
  },
});

export const listExpenses = query({
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const userId = user._id;

    if (user.type === 'business') {
      const transactions = await ctx.db
        .query('transactions')
        .withIndex('by_buyerId', (q) => q.eq('buyerId', userId))
        .collect();

      return transactions.map((transaction) => sanitizeTransaction(transaction));
    }

    if (user.type === 'collector') {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Collectors are not authorized to access this resource.',
      });
    }

    return (await ctx.db.query('transactions').order('desc').collect()).map(
      (transaction) => sanitizeTransaction(transaction)
    );
  },
});

export const listSalesWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const userId = user._id;

    if (user.type === 'collector' || user.type === 'business') {
      const results = await ctx.db
        .query('transactions')
        .withIndex('by_sellerId_and_type', (q) =>
          q.eq('sellerId', userId).eq('type', user.type === 'business' ? 'b2b' : 'c2b')
        )
        .order('desc')
        .paginate(paginationOpts);

      return {
        ...results,
        page: results.page.map((transaction) => sanitizeTransaction(transaction)),
      };
    }

    const results = await ctx.db
      .query('transactions')
      .order('desc')
      .paginate(paginationOpts);

    return {
      ...results,
      page: results.page.map((transaction) => sanitizeTransaction(transaction)),
    };
  },
});

export const listSales = query({
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const userId = user._id;

    if (user.type === 'collector' || user.type === 'business') {
      const transactions = await ctx.db
        .query('transactions')
        .withIndex('by_sellerId_and_type', (q) =>
          q.eq('sellerId', userId).eq('type', user.type === 'business' ? 'b2b' : 'c2b')
        )
        .order('desc')
        .collect();

      return transactions.map((transaction) => sanitizeTransaction(transaction));
    }

    return (await ctx.db.query('transactions').order('desc').collect()).map(
      (transaction) => sanitizeTransaction(transaction)
    );
  },
});

export const listWithPagination = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const { userId, user } = await getAuthenticatedUser(ctx);
    const transactions = await listVisibleTransactions(ctx, userId, user.type);
    const results = paginateResults(transactions, paginationOpts);

    return {
      ...results,
      page: results.page.map((transaction) => sanitizeTransaction(transaction)),
    };
  },
});

export const list = query({
  handler: async (ctx) => {
    const { userId, user } = await getAuthenticatedUser(ctx);
    const transactions = await listVisibleTransactions(ctx, userId, user.type);
    return transactions.map((transaction) => sanitizeTransaction(transaction));
  },
});

export const findById = query({
  args: {
    _id: v.id('transactions'),
  },
  handler: async (ctx, { _id }) => {
    const { transaction } = await getAuthorizedTransaction(ctx, _id);
    return sanitizeTransaction(transaction);
  },
});

export const generateReceiptUploadUrl = mutation({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, { transactionId }) => {
    const { transaction, userId } = await getParticipantTransaction(ctx, transactionId);
    assertReceiptAttachmentCapacity(transaction.receiptAttachments);

    const issuedAt = Date.now();
    const uploadSlot = createReceiptUploadSlot(userId, issuedAt);
    const activeUploadSlots = pruneReceiptUploadSlots(
      transaction.receiptUploadBindings,
      issuedAt
    );

    await ctx.db.patch(transactionId, {
      receiptUploadBindings: [
        ...activeUploadSlots,
        uploadSlot,
      ],
    });

    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      uploadSlot: uploadSlot.token,
    };
  },
});

export const attachReceiptToTransaction = mutation({
  args: {
    transactionId: v.id('transactions'),
    uploadSlot: v.string(),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { transactionId, uploadSlot, storageId }) => {
    const { transaction, userId } = await getParticipantTransaction(
      ctx,
      transactionId
    );
    assertReceiptAttachmentCapacity(transaction.receiptAttachments);

    const now = Date.now();
    const activeUploadSlots = pruneReceiptUploadSlots(
      transaction.receiptUploadBindings,
      now
    );
    const matchedUploadSlot = activeUploadSlots.find(
      (entry) => entry.token === uploadSlot && entry.issuedBy === userId
    );

    if (!matchedUploadSlot) {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'This receipt upload is not authorized for the transaction.',
      });
    }

    const metadata = await ctx.storage.getMetadata(storageId);

    if (!metadata) {
      throw new ConvexError({
        name: 'Not Found',
        message: 'The uploaded receipt file was not found.',
      });
    }

    const storageEntry = await ctx.db.system.get('_storage', storageId);

    if (!storageEntry) {
      throw new ConvexError({
        name: 'Not Found',
        message: 'The uploaded receipt file was not found.',
      });
    }

    if (storageEntry._creationTime < matchedUploadSlot.issuedAt) {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'The uploaded receipt file does not match this authorized upload flow.',
      });
    }

    validateReceiptStorageMetadata(metadata);

    if (
      transaction.receiptAttachments?.some(
        (attachment) => attachment.storageId === storageId
      )
    ) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'This receipt is already attached to the transaction.',
      });
    }

    if (
      metadata.sha256 &&
      transaction.receiptAttachments?.some(
        (attachment) => attachment.checksum === metadata.sha256
      )
    ) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'This receipt is already attached to the transaction.',
      });
    }

    await ctx.db.patch(transactionId, {
      receiptAttachments: [
        ...(transaction.receiptAttachments ?? []),
        {
          storageId,
          fileName: getReceiptFileName(storageId, metadata.contentType ?? 'application/octet-stream'),
          contentType: metadata.contentType ?? 'application/octet-stream',
          size: metadata.size,
          checksum: metadata.sha256,
          uploadedAt: storageEntry._creationTime,
          uploadedBy: userId,
        },
      ],
      receiptUploadBindings: activeUploadSlots.filter(
        (entry) => !(entry.token === matchedUploadSlot.token && entry.issuedBy === matchedUploadSlot.issuedBy)
      ),
    });
  },
});

export const getReceiptDownloadUrl = query({
  args: {
    transactionId: v.id('transactions'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { transactionId, storageId }) => {
    const { transaction } = await getAuthorizedTransaction(ctx, transactionId);
    const attachment = transaction.receiptAttachments?.find(
      (item) => item.storageId === storageId
    );

    if (!attachment) {
      return null;
    }

    return await ctx.storage.getUrl(attachment.storageId);
  },
});

export const collectorToBusinessSale = mutation({
  args: {
    collectorId: v.id('users'),
    items: v.array(txItemValidator),
    collectionDay: v.optional(v.string()),
    collectionDate: v.optional(v.number()),
  },
  handler: async (ctx, { collectorId, items, collectionDay, collectionDate }) => {
    const businessId = await getCurrentUserIdOrThrow(ctx);

    // Validate all items
    for (const item of items) {
      const existingMaterial = await ctx.db.get('materials', item.materialId);
      if (!existingMaterial)
        throw new ConvexError({ name: 'Not Found', message: `Material not found.` });
      if (item.price < existingMaterial.price)
        throw new ConvexError({
          name: 'Invalid Input',
          message: `Price must be at or above the base material price.`,
        });
    }

    if (collectionDay !== undefined) {
      assertValidCollectionDay(collectionDay);
    }

    const totalPrice = items.reduce((s, i) => s + i.price * i.weight, 0);
    const transactionId = await ctx.db.insert('transactions', {
      buyerId: businessId,
      sellerId: collectorId,
      items,
      totalPrice,
      type: 'c2b',
      ...(collectionDay === undefined ? {} : { collectionDay }),
      ...(collectionDate === undefined ? {} : { collectionDate }),
    });

    const newDoc = await ctx.db.get('transactions', transactionId);
    if (newDoc) {
      await txByType.insert(ctx, newDoc);
    }

    // Upsert stock for each item
    for (const item of items) {
      const existingStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', businessId).eq('materialId', item.materialId)
        )
        .first();

      if (!existingStock) {
        await ctx.db.insert('stock', {
          ownerId: businessId,
          materialId: item.materialId,
          weight: item.weight,
          price: item.price,
          isListed: false,
        });
      } else {
        await ctx.db.patch('stock', existingStock._id, {
          weight: existingStock.weight + item.weight,
          price: item.price,
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
      transactionId,
    });

    return { transactionId };
  },
});

export const businessToBusinessSale= mutation({
  args: {
    businessId: v.id('users'),
    items: v.array(txItemValidator),
  },
  handler: async (ctx, { businessId, items }) => {
    const sellerId = await getCurrentUserIdOrThrow(ctx);

    // Validate all items
    for (const item of items) {
      const existingMaterial = await ctx.db.get('materials', item.materialId);
      if (!existingMaterial)
        throw new ConvexError({ name: 'Not Found', message: `Material not found.` });
      if (item.price < existingMaterial.price)
        throw new ConvexError({
          name: 'Invalid Input',
          message: `Price must be at or above the base material price.`,
        });

      const existingSellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', sellerId).eq('materialId', item.materialId)
        )
        .first();

      if (!existingSellerStock || existingSellerStock.weight < item.weight)
        throw new ConvexError({
          name: 'Invalid Input',
          message: 'Insufficient stock to complete this transaction.',
        });
    }

    const totalPrice = items.reduce((s, i) => s + i.price * i.weight, 0);
    const transactionId = await ctx.db.insert('transactions', {
      buyerId: businessId,
      sellerId,
      items,
      totalPrice,
      type: 'b2b',
    });

    const newDoc = await ctx.db.get('transactions', transactionId);
    if (newDoc) {
      await txByType.insert(ctx, newDoc);
    }

    // Update stock for each item
    for (const item of items) {
      const existingSellerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', sellerId).eq('materialId', item.materialId)
        )
        .first();

      const existingBuyerStock = await ctx.db
        .query('stock')
        .withIndex('by_ownerId_by_materialId', (q) =>
          q.eq('ownerId', businessId).eq('materialId', item.materialId)
        )
        .first();

      if (existingSellerStock) {
        await ctx.db.patch('stock', existingSellerStock._id, {
          weight: existingSellerStock.weight - item.weight,
        });
      }

      if (!existingBuyerStock) {
        await ctx.db.insert('stock', {
          ownerId: businessId,
          materialId: item.materialId,
          weight: item.weight,
          price: item.price,
          isListed: false,
        });
      } else {
        await ctx.db.patch('stock', existingBuyerStock._id, {
          weight: existingBuyerStock.weight + item.weight,
          price: item.price,
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
      transactionId,
    });
  },
});
