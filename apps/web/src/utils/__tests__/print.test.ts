/**
 * Unit Tests for Print Utility Functions
 * 
 * Tests the openPrintDialog utility function for different document formats.
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openPrintDialog } from '../print';

describe('openPrintDialog', () => {
  let mockWindow: any;
  let originalWindowOpen: any;

  beforeEach(() => {
    // Mock window.open
    mockWindow = {
      addEventListener: vi.fn(),
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      print: vi.fn(),
    };

    originalWindowOpen = window.open;
    window.open = vi.fn(() => mockWindow);
  });

  afterEach(() => {
    window.open = originalWindowOpen;
    vi.clearAllMocks();
  });

  describe('PDF Format Handling (Requirement 7.1)', () => {
    it('should open PDF in new tab with print dialog', () => {
      const url = 'https://example.com/label.pdf';
      
      openPrintDialog(url, 'pdf');

      // Should call window.open with URL and _blank target
      expect(window.open).toHaveBeenCalledWith(url, '_blank');
      
      // Should add load event listener
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    });

    it('should trigger print on window load for PDF', () => {
      const url = 'https://example.com/label.pdf';
      
      openPrintDialog(url, 'pdf');

      // Get the load event handler
      const loadHandler = mockWindow.addEventListener.mock.calls[0][1];
      
      // Trigger the load event
      loadHandler();

      // Should call print
      expect(mockWindow.print).toHaveBeenCalled();
    });

    it('should handle PDF with data URL', () => {
      const dataUrl = 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK...';
      
      openPrintDialog(dataUrl, 'pdf');

      expect(window.open).toHaveBeenCalledWith(dataUrl, '_blank');
    });

    it('should throw error if window.open fails for PDF', () => {
      window.open = vi.fn(() => null);
      
      expect(() => {
        openPrintDialog('https://example.com/label.pdf', 'pdf');
      }).toThrow('Failed to open print window');
    });
  });

  describe('PNG Format Handling (Requirement 7.2)', () => {
    it('should create HTML page with PNG image', () => {
      const url = 'https://example.com/label.png';
      
      openPrintDialog(url, 'png');

      // Should call window.open with empty URL
      expect(window.open).toHaveBeenCalledWith('', '_blank');
      
      // Should write HTML content
      expect(mockWindow.document.write).toHaveBeenCalled();
      
      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      
      // Should contain image tag with URL
      expect(htmlContent).toContain(`<img src="${url}"`);
      
      // Should trigger print on image load
      expect(htmlContent).toContain('onload="window.print()"');
      
      // Should close document
      expect(mockWindow.document.close).toHaveBeenCalled();
    });

    it('should handle PNG with data URL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...';
      
      openPrintDialog(dataUrl, 'png');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${dataUrl}"`);
    });

    it('should include proper HTML structure for PNG', () => {
      const url = 'https://example.com/label.png';
      
      openPrintDialog(url, 'png');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      
      // Should have DOCTYPE
      expect(htmlContent).toContain('<!DOCTYPE html>');
      
      // Should have html, head, body tags
      expect(htmlContent).toContain('<html>');
      expect(htmlContent).toContain('<head>');
      expect(htmlContent).toContain('<body>');
      
      // Should have title
      expect(htmlContent).toContain('<title>Print Label</title>');
      
      // Should have styles for centering and sizing
      expect(htmlContent).toContain('max-width: 100%');
      expect(htmlContent).toContain('height: auto');
    });

    it('should throw error if window.open fails for PNG', () => {
      window.open = vi.fn(() => null);
      
      expect(() => {
        openPrintDialog('https://example.com/label.png', 'png');
      }).toThrow('Failed to open print window');
    });
  });

  describe('JPG Format Handling (Requirement 7.3)', () => {
    it('should create HTML page with JPG image', () => {
      const url = 'https://example.com/label.jpg';
      
      openPrintDialog(url, 'jpg');

      // Should call window.open with empty URL
      expect(window.open).toHaveBeenCalledWith('', '_blank');
      
      // Should write HTML content
      expect(mockWindow.document.write).toHaveBeenCalled();
      
      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      
      // Should contain image tag with URL
      expect(htmlContent).toContain(`<img src="${url}"`);
      
      // Should trigger print on image load
      expect(htmlContent).toContain('onload="window.print()"');
      
      // Should close document
      expect(mockWindow.document.close).toHaveBeenCalled();
    });

    it('should handle JPG with data URL', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...';
      
      openPrintDialog(dataUrl, 'jpg');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${dataUrl}"`);
    });

    it('should include proper HTML structure for JPG', () => {
      const url = 'https://example.com/label.jpg';
      
      openPrintDialog(url, 'jpg');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      
      // Should have DOCTYPE
      expect(htmlContent).toContain('<!DOCTYPE html>');
      
      // Should have html, head, body tags
      expect(htmlContent).toContain('<html>');
      expect(htmlContent).toContain('<head>');
      expect(htmlContent).toContain('<body>');
      
      // Should have title
      expect(htmlContent).toContain('<title>Print Label</title>');
      
      // Should have styles for centering and sizing
      expect(htmlContent).toContain('max-width: 100%');
      expect(htmlContent).toContain('height: auto');
    });

    it('should throw error if window.open fails for JPG', () => {
      window.open = vi.fn(() => null);
      
      expect(() => {
        openPrintDialog('https://example.com/label.jpg', 'jpg');
      }).toThrow('Failed to open print window');
    });
  });

  describe('Error Handling (Requirement 7.4)', () => {
    it('should throw error for unsupported format', () => {
      expect(() => {
        // @ts-expect-error Testing invalid format
        openPrintDialog('https://example.com/label.svg', 'svg');
      }).toThrow('Unsupported format: svg');
    });

    it('should throw error with popup blocker message when window.open returns null', () => {
      window.open = vi.fn(() => null);
      
      expect(() => {
        openPrintDialog('https://example.com/label.pdf', 'pdf');
      }).toThrow('Failed to open print window. Please check your popup blocker settings.');
    });

    it('should handle empty URL gracefully', () => {
      expect(() => {
        openPrintDialog('', 'pdf');
      }).not.toThrow();
      
      expect(window.open).toHaveBeenCalledWith('', '_blank');
    });
  });

  describe('Data URL Support (Requirement 7.5)', () => {
    it('should handle PDF data URL', () => {
      const dataUrl = 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK...';
      
      openPrintDialog(dataUrl, 'pdf');

      expect(window.open).toHaveBeenCalledWith(dataUrl, '_blank');
    });

    it('should handle PNG data URL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...';
      
      openPrintDialog(dataUrl, 'png');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${dataUrl}"`);
    });

    it('should handle JPG data URL', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...';
      
      openPrintDialog(dataUrl, 'jpg');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${dataUrl}"`);
    });

    it('should handle external URL for PDF', () => {
      const url = 'https://cdn.example.com/labels/12345.pdf';
      
      openPrintDialog(url, 'pdf');

      expect(window.open).toHaveBeenCalledWith(url, '_blank');
    });

    it('should handle external URL for PNG', () => {
      const url = 'https://cdn.example.com/labels/12345.png';
      
      openPrintDialog(url, 'png');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${url}"`);
    });

    it('should handle external URL for JPG', () => {
      const url = 'https://cdn.example.com/labels/12345.jpg';
      
      openPrintDialog(url, 'jpg');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${url}"`);
    });
  });

  describe('Edge Cases', () => {
    it('should handle URL with special characters', () => {
      const url = 'https://example.com/label?id=123&format=pdf&token=abc%20def';
      
      openPrintDialog(url, 'pdf');

      expect(window.open).toHaveBeenCalledWith(url, '_blank');
    });

    it('should handle very long data URL', () => {
      const longDataUrl = 'data:image/png;base64,' + 'A'.repeat(10000);
      
      openPrintDialog(longDataUrl, 'png');

      const htmlContent = mockWindow.document.write.mock.calls[0][0];
      expect(htmlContent).toContain(`<img src="${longDataUrl}"`);
    });

    it('should handle URL with unicode characters', () => {
      const url = 'https://example.com/label-日本語.pdf';
      
      openPrintDialog(url, 'pdf');

      expect(window.open).toHaveBeenCalledWith(url, '_blank');
    });
  });

  describe('Format Consistency', () => {
    it('should use same HTML structure for PNG and JPG', () => {
      const pngUrl = 'https://example.com/label.png';
      const jpgUrl = 'https://example.com/label.jpg';
      
      openPrintDialog(pngUrl, 'png');
      const pngHtml = mockWindow.document.write.mock.calls[0][0];
      
      vi.clearAllMocks();
      
      openPrintDialog(jpgUrl, 'jpg');
      const jpgHtml = mockWindow.document.write.mock.calls[0][0];
      
      // Both should have same structure (only URL differs)
      expect(pngHtml.replace(pngUrl, 'URL')).toBe(jpgHtml.replace(jpgUrl, 'URL'));
    });

    it('should always open in new tab (_blank)', () => {
      openPrintDialog('https://example.com/label.pdf', 'pdf');
      expect(window.open).toHaveBeenCalledWith(expect.any(String), '_blank');
      
      vi.clearAllMocks();
      
      openPrintDialog('https://example.com/label.png', 'png');
      expect(window.open).toHaveBeenCalledWith(expect.any(String), '_blank');
      
      vi.clearAllMocks();
      
      openPrintDialog('https://example.com/label.jpg', 'jpg');
      expect(window.open).toHaveBeenCalledWith(expect.any(String), '_blank');
    });
  });
});
