/**
 * PDF Merge Utility
 * 
 * Merges multiple PDF base64 buffers into a single PDF.
 * Used when Shopee batch download returns separate PDFs per logistics channel
 * (Shopee cannot merge labels from different channel_ids into one PDF).
 * 
 * Uses pdf-lib for lightweight PDF manipulation.
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Merge multiple base64-encoded PDF buffers into a single PDF.
 * 
 * @param base64Buffers - Array of base64-encoded PDF strings
 * @returns Single merged PDF as base64 string
 */
export async function mergePdfBuffers(base64Buffers: string[]): Promise<string> {
  if (base64Buffers.length === 0) {
    throw new Error('No PDF buffers to merge');
  }

  if (base64Buffers.length === 1) {
    return base64Buffers[0];
  }

  const mergedPdf = await PDFDocument.create();

  for (const base64 of base64Buffers) {
    const pdfBytes = Buffer.from(base64, 'base64');
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    for (const page of pages) {
      mergedPdf.addPage(page);
    }
  }

  const mergedBytes = await mergedPdf.save();
  return Buffer.from(mergedBytes).toString('base64');
}
