import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Resend } from 'resend';
import { getEffectiveTransactionDate } from './lib/collectionDay';
import { getCurrentUserOrThrow } from './users';
import {
  type BankAccountType,
  getCollectorPayoutDetails,
  getCollectorPayoutRows,
} from '../src/lib/payout-details';

const SOUTH_AFRICA_TIME_ZONE = 'Africa/Johannesburg';

function formatTransactionDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: SOUTH_AFRICA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function unauthorizedError() {
  return new ConvexError({
    name: 'Unauthorized',
    message: 'You are not authorized to access this resource.',
  });
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }

  return new Resend(apiKey);
}

function getFromEmail() {
  const fromEmail = process.env.AUTH_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error('Missing AUTH_FROM_EMAIL environment variable.');
  }

  return fromEmail;
}

function canReadAllTransactions(userType: string | undefined) {
  return userType === 'admin' || userType === 'staff';
}

function getTransactionSellerUserId(transaction: {
  sellerId: Id<'users'> | Id<'collectors'>;
  type: 'c2b' | 'b2b';
}): Id<'users'> | undefined {
  if (transaction.type === 'c2b') {
    return undefined;
  }

  return transaction.sellerId as Id<'users'>;
}

async function getReadableTransaction(
  ctx: QueryCtx,
  transactionId: Id<'transactions'>
) {
  const user = await getCurrentUserOrThrow(ctx);
  const transaction = await ctx.db.get('transactions', transactionId);

  if (!transaction) {
    throw new ConvexError({
      name: 'Not Found',
      message: 'The transaction was not found.',
    });
  }

  if (
    !canReadAllTransactions(user.type) &&
    getTransactionSellerUserId(transaction) !== user._id &&
    transaction.buyerId !== user._id
  ) {
    throw unauthorizedError();
  }

  return transaction;
}

async function getInvoiceSeller(
  ctx: QueryCtx,
  transaction: {
    sellerId: Id<'users'> | Id<'collectors'>;
    type: 'c2b' | 'b2b';
    collectorSnapshot?: {
      name: string;
      email?: string;
      phone: string;
      streetAddress?: string;
      city?: string;
      province?: string;
      bankAccountHolderName?: string;
      bankName?: string;
      bankAccountNumber?: string;
      bankBranchCode?: string;
      bankAccountType?: BankAccountType;
      payoutMethod?: 'bank' | 'ewallet';
      ewalletPlatformName?: string;
      ewalletPaymentId?: string;
    };
  }
) {
  if (transaction.type === 'c2b') {
    const collector = await ctx.db.get(
      'collectors',
      transaction.sellerId as Id<'collectors'>
    );

    if (!collector && !transaction.collectorSnapshot) {
      return null;
    }

    return {
      name: transaction.collectorSnapshot?.name ?? collector?.name,
      email: transaction.collectorSnapshot?.email ?? collector?.email,
      phone: transaction.collectorSnapshot?.phone ?? collector?.phone,
      streetAddress:
        transaction.collectorSnapshot?.streetAddress ?? collector?.streetAddress,
      city: transaction.collectorSnapshot?.city ?? collector?.city,
      province: transaction.collectorSnapshot?.province ?? collector?.province,
      bankAccountHolderName:
        transaction.collectorSnapshot?.bankAccountHolderName ??
        collector?.bankAccountHolderName,
      bankName: transaction.collectorSnapshot?.bankName ?? collector?.bankName,
      bankAccountNumber:
        transaction.collectorSnapshot?.bankAccountNumber ??
        collector?.bankAccountNumber,
      bankBranchCode:
        transaction.collectorSnapshot?.bankBranchCode ?? collector?.bankBranchCode,
      bankAccountType:
        transaction.collectorSnapshot?.bankAccountType ?? collector?.bankAccountType,
      payoutMethod:
        transaction.collectorSnapshot?.payoutMethod ?? collector?.payoutMethod,
      ewalletPlatformName:
        transaction.collectorSnapshot?.ewalletPlatformName ??
        collector?.ewalletPlatformName,
      ewalletPaymentId:
        transaction.collectorSnapshot?.ewalletPaymentId ?? collector?.ewalletPaymentId,
    };
  }

  const sellerId = transaction.sellerId as Id<'users'>;

  const seller = await ctx.db.get('users', sellerId);
  if (!seller) {
    return null;
  }

  return {
    name: seller.name,
    businessName: seller.businessName,
    firstName: seller.firstName,
    lastName: seller.lastName,
    email: seller.email,
    phone: seller.phone,
    streetAddress: seller.streetAddress,
    city: seller.city,
    province: seller.province,
    bankAccountHolderName: seller.bankAccountHolderName,
    bankName: seller.bankName,
    bankAccountNumber: seller.bankAccountNumber,
    bankBranchCode: seller.bankBranchCode,
    bankAccountType: seller.bankAccountType,
  };
}

function getSellerDisplayName(
  seller: {
    businessName?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
  }
): string {
  if (seller.businessName) {
    const sellerFullName = `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim();
    return seller.businessName || sellerFullName || seller.name || seller.email || 'Unknown';
  }

  return seller.name || seller.email || seller.phone || 'Unknown';
}

export const getTransactionData = internalQuery({
  args: { transactionId: v.id('transactions') },
  handler: async (ctx, { transactionId }) => {
    const transaction = await ctx.db.get('transactions', transactionId as Id<'transactions'>);
    if (!transaction) return null;
    const seller = await getInvoiceSeller(ctx, transaction);
    const buyer = await ctx.db.get('users', transaction.buyerId);
    const resolvedItems = await Promise.all(
      transaction.items.map(async (item) => {
        const material = await ctx.db.get('materials', item.materialId);
        return { ...item, materialName: material?.name ?? 'Unknown' };
      })
    );
    return { transaction, seller, buyer, items: resolvedItems };
  },
});

export const patchInvoiceStorageId = internalMutation({
  args: {
    transactionId: v.id('transactions'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { transactionId, storageId }) => {
    await ctx.db.patch('transactions', transactionId as Id<'transactions'>, {
      invoiceStorageId: storageId,
    });
  },
});

export const generateForTransaction = internalAction({
  args: {
    transactionId: v.id('transactions'),
    notifyBuyer: v.optional(v.boolean()),
  },
  handler: async (ctx, { transactionId, notifyBuyer }) => {
    const data = await ctx.runQuery(internal.invoices.getTransactionData, {
      transactionId,
    });
    if (!data) return;
    const { transaction, seller, buyer, items } = data;
    if (!seller || !buyer || items.length === 0) return;
    const shouldNotifyBuyer = notifyBuyer !== false;
    const previousInvoiceStorageId = transaction.invoiceStorageId;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const green = rgb(0.158, 0.523, 0.543); // hsl(183, 55%, 35%) – matches app primary
    const dark = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.5, 0.5, 0.5);
    const light = rgb(0.93, 0.93, 0.93);
    const white = rgb(1, 1, 1);

    // ── Header bar ────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: green });
    page.drawText('3rEco', { x: 40, y: height - 50, size: 30, font: boldFont, color: white });
    page.drawText('INVOICE', { x: width - 130, y: height - 50, size: 22, font: boldFont, color: white });

    let y = height - 110;

    const invoiceNum = transactionId.slice(-8).toUpperCase();
    const date = formatTransactionDateLabel(getEffectiveTransactionDate(transaction));

    page.drawText(`Invoice #: ${invoiceNum}`, { x: 40, y, size: 11, font: boldFont, color: dark });
    page.drawText(`Date: ${date}`, { x: width - 200, y, size: 11, font: regularFont, color: dark });

    y -= 14;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: light });
    y -= 30;

    // ── Seller / Buyer ────────────────────────────────────────────────────────
    const sellerName = getSellerDisplayName(seller);
    const buyerFullName = `${buyer.firstName ?? ''} ${buyer.lastName ?? ''}`.trim();
    const buyerName = buyer.businessName ?? (buyerFullName || (buyer.name ?? 'Unknown'));
    const collectorPayoutDetails =
      transaction.type === 'c2b' ? getCollectorPayoutDetails(seller) : undefined;
    const payeeHasBankDetails = hasCompleteBankDetails(seller);
    const shouldShowPaymentDetails =
      transaction.type === 'b2b' || Boolean(collectorPayoutDetails);
    const col2 = width / 2 + 20;

    page.drawText('FROM', { x: 40, y, size: 9, font: boldFont, color: gray });
    page.drawText('TO', { x: col2, y, size: 9, font: boldFont, color: gray });
    y -= 16;

    page.drawText(sellerName, { x: 40, y, size: 11, font: boldFont, color: dark });
    page.drawText(buyerName, { x: col2, y, size: 11, font: boldFont, color: dark });
    y -= 14;

    if (seller.email) {
      page.drawText(seller.email, { x: 40, y, size: 9, font: regularFont, color: gray });
    }
    if (buyer.email) {
      page.drawText(buyer.email, { x: col2, y, size: 9, font: regularFont, color: gray });
    }
    y -= 12;

    if (seller.phone) {
      page.drawText(seller.phone, { x: 40, y, size: 9, font: regularFont, color: gray });
    }
    if (buyer.phone) {
      page.drawText(buyer.phone, { x: col2, y, size: 9, font: regularFont, color: gray });
    }
    y -= 12;

    const sellerAddr = [seller.streetAddress, seller.city, seller.province]
      .filter(Boolean)
      .join(', ');
    const buyerAddr = [buyer.streetAddress, buyer.city, buyer.province]
      .filter(Boolean)
      .join(', ');
    if (sellerAddr) page.drawText(sellerAddr, { x: 40, y, size: 9, font: regularFont, color: gray });
    if (buyerAddr) page.drawText(buyerAddr, { x: col2, y, size: 9, font: regularFont, color: gray });

    y -= 30;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: light });
    y -= 28;

    // ── Line-item table ───────────────────────────────────────────────────────
    page.drawRectangle({ x: 40, y: y - 7, width: width - 80, height: 24, color: light });
    page.drawText('MATERIAL', { x: 50, y: y + 3, size: 10, font: boldFont, color: dark });
    page.drawText('WEIGHT', { x: 255, y: y + 3, size: 10, font: boldFont, color: dark });
    page.drawText('PRICE / kg', { x: 355, y: y + 3, size: 10, font: boldFont, color: dark });
    page.drawText('TOTAL', { x: 460, y: y + 3, size: 10, font: boldFont, color: dark });
    y -= 30;

    let grandTotal = 0;
    for (const item of items) {
      const lineTotal = item.weight * item.price;
      grandTotal += lineTotal;
      page.drawText(item.materialName, { x: 50, y, size: 10, font: regularFont, color: dark });
      page.drawText(`${item.weight.toFixed(2)} kg`, { x: 255, y, size: 10, font: regularFont, color: dark });
      page.drawText(`R ${item.price.toFixed(2)}`, { x: 355, y, size: 10, font: regularFont, color: dark });
      page.drawText(`R ${lineTotal.toFixed(2)}`, { x: 460, y, size: 10, font: regularFont, color: dark });
      y -= 20;
    }

    y -= 5;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: light });
    y -= 25;

    // ── Total ─────────────────────────────────────────────────────────────────
    page.drawText('TOTAL DUE:', { x: 355, y, size: 12, font: boldFont, color: dark });
    page.drawText(`R ${grandTotal.toFixed(2)}`, { x: 460, y, size: 13, font: boldFont, color: green });

    y -= 20;
    const txType =
      transaction.type === 'b2b' ? 'Business to Business' : 'Collector to Business';
    page.drawText(`Transaction type: ${txType}`, {
      x: 40,
      y,
      size: 9,
      font: regularFont,
      color: gray,
    });

    if (shouldShowPaymentDetails) {
      y -= 24;
      page.drawLine({
        start: { x: 40, y },
        end: { x: width - 40, y },
        thickness: 0.5,
        color: light,
      });
      y -= 22;

      page.drawText('PAYMENT DETAILS', {
        x: 40,
        y,
        size: 10,
        font: boldFont,
        color: dark,
      });
      y -= 16;

      if (transaction.type === 'c2b' && collectorPayoutDetails) {
        page.drawText(
          collectorPayoutDetails.payoutMethod === 'bank'
            ? `Pay ${sellerName} using the account below.`
            : `Pay ${sellerName} using the ewallet details below.`,
          {
            x: 40,
            y,
            size: 9,
            font: regularFont,
            color: gray,
          }
        );
        y -= 18;

        const paymentRows = getCollectorPayoutRows(collectorPayoutDetails);

        for (const [label, value] of paymentRows) {
          if (!value) continue;

          page.drawText(`${label}:`, {
            x: 40,
            y,
            size: 9,
            font: boldFont,
            color: dark,
          });
          page.drawText(value, {
            x: 145,
            y,
            size: 9,
            font: regularFont,
            color: dark,
          });
          y -= 14;
        }
      } else if (payeeHasBankDetails) {
        page.drawText(`Pay ${sellerName} using the account below.`, {
          x: 40,
          y,
          size: 9,
          font: regularFont,
          color: gray,
        });
        y -= 18;

        const paymentRows = [
          ['Account holder', seller.bankAccountHolderName],
          ['Bank name', seller.bankName],
          ['Account number', seller.bankAccountNumber],
          ['Branch code', seller.bankBranchCode],
          ['Account type', seller.bankAccountType],
        ] as const;

        for (const [label, value] of paymentRows) {
          if (!value) continue;

          page.drawText(`${label}:`, {
            x: 40,
            y,
            size: 9,
            font: boldFont,
            color: dark,
          });
          page.drawText(value, {
            x: 145,
            y,
            size: 9,
            font: regularFont,
            color: dark,
          });
          y -= 14;
        }
      } else {
        page.drawText(
          transaction.type === 'c2b'
            ? 'Payout details are not yet available on file for this collector.'
            : 'Bank details are not yet available on file for this business.',
          {
            x: 40,
            y,
            size: 9,
            font: regularFont,
            color: gray,
          }
        );
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: light });
    page.drawText('This invoice was generated automatically by 3rEco.', {
      x: 40,
      y: 40,
      size: 9,
      font: regularFont,
      color: gray,
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const storageId = await ctx.storage.store(blob);

    await ctx.runMutation(internal.invoices.patchInvoiceStorageId, {
      transactionId,
      storageId,
    });

    if (
      previousInvoiceStorageId !== undefined &&
      previousInvoiceStorageId !== storageId
    ) {
      await ctx.storage.delete(previousInvoiceStorageId);
    }

    if (shouldNotifyBuyer && buyer.email) {
      const invoiceDate = formatTransactionDateLabel(
        getEffectiveTransactionDate(transaction)
      );

      await getResendClient().emails.send({
        from: getFromEmail(),
        to: buyer.email,
        subject: `Your 3rEco invoice ${invoiceNum}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="margin-bottom: 12px;">Your invoice is ready</h2>
            <p style="margin-bottom: 16px;">Hi ${buyerName},</p>
            <p style="margin-bottom: 16px;">
              Please find your invoice for transaction <strong>${invoiceNum}</strong> dated <strong>${invoiceDate}</strong> attached to this email.
            </p>
            <p style="color: #6b7280; font-size: 14px;">This invoice was generated automatically by 3rEco.</p>
          </div>
        `,
        attachments: [
          {
            filename: `3rEco-Invoice-${invoiceNum}.pdf`,
            content: Buffer.from(pdfBytes).toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      });
    }
  },
});

export const getInvoiceUrl = query({
  args: { transactionId: v.id('transactions') },
  handler: async (ctx, { transactionId }) => {
    const transaction = await getReadableTransaction(
      ctx,
      transactionId as Id<'transactions'>
    );
    if (!transaction?.invoiceStorageId) return null;
    return await ctx.storage.getUrl(transaction.invoiceStorageId);
  },
});

function hasCompleteBankDetails(
  user:
    | {
        bankAccountHolderName?: string;
        bankName?: string;
        bankAccountNumber?: string;
        bankBranchCode?: string;
        bankAccountType?: string;
      }
    | null
    | undefined
) {
  return (
    hasBankValue(user?.bankAccountHolderName) &&
    hasBankValue(user?.bankName) &&
    hasBankValue(user?.bankAccountNumber) &&
    hasBankValue(user?.bankBranchCode) &&
    hasBankValue(user?.bankAccountType)
  );
}

function hasBankValue(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}
