/**
 * Print Utility Functions
 * 
 * Provides utilities for opening print dialogs with different document formats.
 * Supports PDF, PNG, and JPG formats.
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.5**
 */

/**
 * Open print dialog with label document
 * 
 * Handles different formats:
 * - PDF: Opens in new tab with print dialog (uses Blob URL for large PDFs)
 * - PNG/JPG: Creates HTML page with image and triggers print
 * 
 * @param url - URL or data URL of the label document
 * @param format - Document format (pdf, png, jpg)
 * @throws Error if format is unsupported or window.open fails
 * 
 * **Requirements:**
 * - 7.1: Support PDF format
 * - 7.2: Support PNG format
 * - 7.3: Support JPG format
 * - 7.5: Handle data URLs and external URLs
 */
export function openPrintDialog(url: string, format: 'pdf' | 'png' | 'jpg'): void {
  if (format === 'pdf') {
    // For PDF data URLs, convert to Blob URL to avoid browser length limits
    let finalUrl = url;
    
    if (url.startsWith('data:application/pdf;base64,')) {
      try {
        // Extract base64 data
        const base64Data = url.split(',')[1];
        
        // Convert base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create Blob and Blob URL
        const blob = new Blob([bytes], { type: 'application/pdf' });
        finalUrl = URL.createObjectURL(blob);
        
        console.log('[print] Converted data URL to Blob URL for better browser compatibility');
      } catch (error) {
        console.error('[print] Failed to convert data URL to Blob URL:', error);
        // Fall back to original data URL
      }
    }
    
    // Open PDF in new tab with print dialog
    const printWindow = window.open(finalUrl, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
        
        // Clean up Blob URL after a delay (if we created one)
        if (finalUrl !== url && finalUrl.startsWith('blob:')) {
          setTimeout(() => {
            URL.revokeObjectURL(finalUrl);
            console.log('[print] Blob URL cleaned up');
          }, 60000); // Clean up after 1 minute
        }
      });
    } else {
      // Clean up Blob URL immediately if window failed to open
      if (finalUrl !== url && finalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(finalUrl);
      }
      throw new Error('Failed to open print window. Please check your popup blocker settings.');
    }
  } else if (format === 'png' || format === 'jpg') {
    // For images, create a new window with the image and trigger print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Label</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            <img src="${url}" onload="window.print()" />
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      throw new Error('Failed to open print window. Please check your popup blocker settings.');
    }
  } else {
    throw new Error(`Unsupported format: ${format}`);
  }
}
