/**
 * PDF Merge Utility
 * 
 * Utilities for merging multiple PDF labels into a single document for batch printing.
 * Uses pdf-lib to merge PDFs client-side for seamless scrolling experience.
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Merge multiple PDF data URLs into a single PDF and open in new tab
 * 
 * @param pdfDataUrls - Array of PDF data URLs (base64 encoded)
 * @param orderSns - Array of order SNs for logging
 * @returns Promise that resolves when PDF is opened
 */
export async function mergePDFsAndPrint(pdfDataUrls: string[], orderSns: string[]): Promise<void> {
  console.log('[pdf-merge] Starting PDF merge for', pdfDataUrls.length, 'labels');
  
  try {
    // Create an HTML page with all PDFs embedded as iframes
    // This allows the browser to handle PDF rendering and printing
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Batch Label Print - ${orderSns.length} Labels</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
            }
            .page-break {
              page-break-after: always;
              break-after: page;
            }
            .label-container {
              width: 100%;
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              page-break-after: always;
            }
            .label-container:last-child {
              page-break-after: auto;
            }
            embed {
              width: 100%;
              height: 100%;
              border: none;
            }
            @media print {
              .label-container {
                page-break-after: always;
              }
              .label-container:last-child {
                page-break-after: auto;
              }
            }
          </style>
        </head>
        <body>
          ${pdfDataUrls.map((url, index) => `
            <div class="label-container">
              <embed src="${url}" type="application/pdf" />
            </div>
          `).join('')}
          <script>
            // Auto-trigger print dialog when page loads
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `;
    
    // Create a Blob from the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    
    // Open in new window
    const printWindow = window.open(blobUrl, '_blank');
    
    if (!printWindow) {
      throw new Error('Failed to open print window. Please check your popup blocker settings.');
    }
    
    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      console.log('[pdf-merge] Blob URL cleaned up');
    }, 60000); // Clean up after 1 minute
    
    console.log('[pdf-merge] Successfully opened merged PDF in new tab');
    
  } catch (error) {
    console.error('[pdf-merge] Error merging PDFs:', error);
    throw error;
  }
}

/**
 * Merge multiple PDFs into a single PDF document using pdf-lib
 * Creates a seamless scrolling experience like Shopee
 * 
 * @param pdfDataUrls - Array of PDF data URLs (base64 encoded)
 * @param orderSns - Array of order SNs for logging
 * @returns Promise that resolves when merged PDF is opened
 */
export async function openPDFsInSingleTab(pdfDataUrls: string[], orderSns: string[]): Promise<void> {
  console.log('[pdf-merge] Merging', pdfDataUrls.length, 'PDFs into single document');
  
  try {
    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();
    
    // Process each PDF
    for (let i = 0; i < pdfDataUrls.length; i++) {
      const url = pdfDataUrls[i];
      const orderSn = orderSns[i];
      
      console.log(`[pdf-merge] Processing PDF ${i + 1}/${pdfDataUrls.length} - Order ${orderSn}`);
      
      try {
        // Extract base64 data from data URL
        const base64Data = url.split(',')[1];
        if (!base64Data) {
          console.error(`[pdf-merge] Invalid data URL for order ${orderSn}`);
          continue;
        }
        
        // Convert base64 to Uint8Array
        const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        // Load the PDF
        const pdf = await PDFDocument.load(pdfBytes);
        
        // Copy all pages from this PDF to the merged PDF
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => {
          mergedPdf.addPage(page);
        });
        
        console.log(`[pdf-merge] Added ${copiedPages.length} page(s) from order ${orderSn}`);
        
      } catch (pdfError: any) {
        console.error(`[pdf-merge] Error processing PDF for order ${orderSn}:`, pdfError);
        // Continue with other PDFs even if one fails
      }
    }
    
    // Check if we have any pages
    const pageCount = mergedPdf.getPageCount();
    if (pageCount === 0) {
      throw new Error('Tidak ada halaman PDF yang berhasil di-merge. Semua PDF gagal diproses.');
    }
    
    console.log(`[pdf-merge] Successfully merged ${pageCount} pages from ${pdfDataUrls.length} PDFs`);
    
    // Save the merged PDF
    const mergedPdfBytes = await mergedPdf.save();
    
    // Create blob for PDF (more efficient than data URL for large files)
    const pdfBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
    const pdfBlobUrl = URL.createObjectURL(pdfBlob);
    
    // Create HTML viewer that loads PDF from blob URL
    // The HTML will store the blob URL and prevent premature cleanup
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak ${orderSns.length} Label Pengiriman</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              width: 100%;
              height: 100%;
              overflow: hidden;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              background: #ffffff;
            }
            .pdf-viewer {
              width: 100%;
              height: 100vh;
              border: none;
            }
          </style>
        </head>
        <body>
          <embed class="pdf-viewer" id="pdfEmbed" type="application/pdf" />
          
          <script>
            // Store blob URL in window scope to prevent garbage collection
            window.pdfBlobUrl = '${pdfBlobUrl}';
            
            // Set PDF source after DOM is ready
            window.addEventListener('DOMContentLoaded', function() {
              const embed = document.getElementById('pdfEmbed');
              if (embed) {
                embed.src = window.pdfBlobUrl;
                console.log('Merged PDF loaded: ${pageCount} pages from ${orderSns.length} labels');
              }
            });
            
            // Keyboard shortcut for print
            document.addEventListener('keydown', function(e) {
              if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                window.print();
              }
            });
            
            // Cleanup blob URL only when window is actually closing
            // This ensures PDF stays loaded as long as window is open
            window.addEventListener('beforeunload', function() {
              if (window.pdfBlobUrl) {
                URL.revokeObjectURL(window.pdfBlobUrl);
                console.log('PDF blob URL cleaned up on window close');
              }
            });
          </script>
        </body>
      </html>
    `;
    
    // Create HTML blob
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const htmlBlobUrl = URL.createObjectURL(htmlBlob);
    
    // Open in new tab — do NOT use 'noopener,noreferrer' as it causes window.open
    // to return null in some browsers even when the window successfully opens
    const viewerWindow = window.open(htmlBlobUrl, '_blank');
    
    if (!viewerWindow) {
      // Try fallback: open the PDF blob URL directly (no HTML viewer)
      console.warn('[pdf-merge] HTML viewer window.open returned null, trying direct PDF URL...');
      const directWindow = window.open(pdfBlobUrl, '_blank');
      
      if (!directWindow) {
        URL.revokeObjectURL(htmlBlobUrl);
        URL.revokeObjectURL(pdfBlobUrl);
        throw new Error('Gagal membuka tab baru. Periksa pengaturan popup blocker browser Anda.');
      }
      
      // Direct PDF opened — clean up HTML blob only
      URL.revokeObjectURL(htmlBlobUrl);
      console.log('[pdf-merge] Opened merged PDF directly (no viewer)');
      return;
    }
    
    console.log('[pdf-merge] Successfully opened merged PDF viewer');
    
  } catch (error: any) {
    console.error('[pdf-merge] Error merging PDFs:', error);
    throw new Error(`Gagal merge PDF: ${error.message}`);
  }
}
