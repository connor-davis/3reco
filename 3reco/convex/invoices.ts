import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getTransactionItems } from './transactions';

export const getTransactionData = internalQuery({
  args: { transactionId: v.id('transactions') },
  handler: async (ctx, { transactionId }) => {
    const transaction = await ctx.db.get('transactions', transactionId as Id<'transactions'>);
    if (!transaction) return null;
    const seller = await ctx.db.get('users', transaction.sellerId);
    const buyer = await ctx.db.get('users', transaction.buyerId);
    const rawItems = getTransactionItems(transaction);
    const resolvedItems = await Promise.all(
      rawItems.map(async (item) => {
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
  args: { transactionId: v.id('transactions') },
  handler: async (ctx, { transactionId }) => {
    const data = await ctx.runQuery(internal.invoices.getTransactionData, {
      transactionId,
    });
    if (!data) return;
    const { transaction, seller, buyer, items } = data;
    if (!seller || !buyer || items.length === 0) return;

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
    const date = new Date(transaction._creationTime).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    page.drawText(`Invoice #: ${invoiceNum}`, { x: 40, y, size: 11, font: boldFont, color: dark });
    page.drawText(`Date: ${date}`, { x: width - 200, y, size: 11, font: regularFont, color: dark });

    y -= 14;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: light });
    y -= 30;

    // ── Seller / Buyer ────────────────────────────────────────────────────────
    const sellerFullName = `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim();
    const sellerName = seller.businessName ?? (sellerFullName || (seller.name ?? 'Unknown'));
    const buyerFullName = `${buyer.firstName ?? ''} ${buyer.lastName ?? ''}`.trim();
    const buyerName = buyer.businessName ?? (buyerFullName || (buyer.name ?? 'Unknown'));
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
  },
});

export const getInvoiceUrl = query({
  args: { transactionId: v.id('transactions') },
  handler: async (ctx, { transactionId }) => {
    const transaction = await ctx.db.get('transactions', transactionId as Id<'transactions'>);
    if (!transaction?.invoiceStorageId) return null;
    return await ctx.storage.getUrl(transaction.invoiceStorageId);
  },
});
