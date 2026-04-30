/**
 * PDF Generator Service
 * 
 * Puppeteer-based HTML-to-PDF renderer for custom shipping labels.
 * Uses a singleton browser instance for performance (reuse ~200ms vs cold start ~3s).
 * 
 * Usage:
 *   const pdf = await generateLabelPdf(html, css);
 *   // pdf is a Buffer containing the 4×6 inch thermal label PDF
 */

import puppeteer, { Browser } from 'puppeteer';

let browser: Browser | null = null;

/**
 * Get or create the singleton Puppeteer browser instance.
 * Automatically reconnects if the browser was closed or crashed.
 */
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    console.log('[pdf-generator] launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage', // Prevent /dev/shm issues in containers
      ]
    });
    console.log('[pdf-generator] browser launched successfully');
  }
  return browser;
}

/**
 * Generate a single-page PDF from HTML + CSS content.
 * Renders at 4×6 inch thermal label size with no margins.
 * 
 * @param html - HTML body content (can contain multiple label-containers with page breaks)
 * @param css - CSS styles to inject
 * @returns PDF as Buffer
 */
export async function generateLabelPdf(html: string, css: string): Promise<Buffer> {
  const startTime = Date.now();
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <style>${css}</style>
      </head>
      <body>${html}</body>
      </html>
    `, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      width: '4in',
      height: '6in',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    const duration = Date.now() - startTime;
    console.log(`[pdf-generator] PDF generated in ${duration}ms`);

    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/**
 * Generate a multi-page PDF from multiple label HTML strings.
 * Each label gets its own page via CSS page-break.
 * 
 * @param labels - Array of HTML strings, one per label
 * @param css - Shared CSS styles
 * @returns Single multi-page PDF as Buffer
 */
export async function generateBatchLabelPdf(
  labels: string[],
  css: string
): Promise<Buffer> {
  const allHtml = labels.join('\n');
  return generateLabelPdf(allHtml, css);
}

/**
 * Close the Puppeteer browser instance.
 * Call this during graceful shutdown to prevent orphan Chrome processes.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    console.log('[pdf-generator] closing browser...');
    await browser.close();
    browser = null;
    console.log('[pdf-generator] browser closed');
  }
}
