# 🖨️ Print Label Integration Guide

## Problem yang Diselesaikan

### ❌ Masalah Lama (window.open + window.print)
1. **Tab web app freeze** setelah buka tab baru untuk print
2. **Cancel print → tab langsung close** (accidental close)
3. **Popup blocker** sering block tab baru
4. **Poor UX** - user tidak bisa preview sebelum print

### ✅ Solusi Baru (Print Preview Modal)
1. **Main app tetap responsive** - tidak freeze
2. **Cancel button explicit** - tidak accidental close
3. **No new tab** - menggunakan hidden iframe
4. **Preview before print** - user bisa lihat dulu sebelum print
5. **Modern UX** - seperti Shopee/Tokopedia

---

## 📦 Files Created

```
apps/web/src/
├── components/shared/
│   ├── PrintPreviewModal.tsx      # Main modal component
│   └── LabelRenderer.tsx          # Label preview renderer
├── hooks/
│   └── usePrintPreview.tsx        # Hook for modal state
└── utils/
    └── printLabelWithPreview.ts   # Utility functions
```

---

## 🚀 Integration Steps

### Step 1: Add Modal to App.tsx

```tsx
// apps/web/src/App.tsx
import { usePrintPreview } from './hooks/usePrintPreview';
import { PrintPreviewModal } from './components/shared/PrintPreviewModal';

function App() {
  const { isOpen, labelData, handleClose, handlePrintComplete } = usePrintPreview();

  return (
    <>
      {/* Your existing app routes */}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pesanan" element={<PesananSaya />} />
        {/* ... other routes */}
      </Routes>

      {/* Print Preview Modal - Global */}
      {isOpen && labelData && (
        <PrintPreviewModal
          labelData={labelData}
          onClose={handleClose}
          onPrintComplete={handlePrintComplete}
        />
      )}
    </>
  );
}

export default App;
```

---

### Step 2: Update PrintLabelButton Component

```tsx
// apps/web/src/components/shared/PrintLabelButton.tsx
import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { printLabelWithPreview } from '../../utils/printLabelWithPreview';
import { useToast } from '../ui/Toast';

interface PrintLabelButtonProps {
  orderSn: string;
  labelPrinted?: boolean;
  onPrintComplete?: () => void;
}

export function PrintLabelButton({ 
  orderSn, 
  labelPrinted, 
  onPrintComplete 
}: PrintLabelButtonProps) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handlePrint = async () => {
    setLoading(true);
    
    try {
      // Fetch label data from API
      const result = await api.orderLabelData(orderSn);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Gagal mengambil data label');
      }

      // Show preview modal (no new tab!)
      await printLabelWithPreview(result.data);
      
      // Mark as printed
      await api.orderMarkLabelPrinted(orderSn, true);
      
      if (onPrintComplete) {
        onPrintComplete();
      }
      
    } catch (error: any) {
      console.error('[PrintLabelButton] Error:', error);
      toast(error.message || 'Gagal mencetak label', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePrint}
      disabled={loading}
      className="btn-print"
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: 'none',
        fontSize: 12,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        background: labelPrinted ? 'var(--success)' : 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          Loading...
        </>
      ) : (
        <>
          <Printer size={12} />
          {labelPrinted ? 'Cetak Ulang' : 'Cetak Label'}
        </>
      )}
    </button>
  );
}
```

---

### Step 3: Update Batch Print in PesananSaya.tsx

```tsx
// apps/web/src/pages/PesananSaya.tsx
import { printLabelBatchWithPreview } from '../utils/printLabelWithPreview';

// Inside PesananSaya component:
const handleBatchPrintLabels = async () => {
  if (selectedLabelOrders.length === 0) return;
  
  setBatchPrinting(true);
  toast('Mengambil semua label...', 'info');
  
  try {
    // Split into chunks of 50 (backend limit)
    const CHUNK_SIZE = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < selectedLabelOrders.length; i += CHUNK_SIZE) {
      chunks.push(selectedLabelOrders.slice(i, i + CHUNK_SIZE));
    }

    // Fetch all chunks
    const allResults: Array<{ orderSn: string; success: boolean; data?: any; error?: string }> = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        const batchResult = await api.orderLabelDataBatch(chunk);
        
        if (batchResult.success && batchResult.data) {
          allResults.push(...batchResult.data.results);
        }
      } catch (chunkError: any) {
        console.error(`[PesananSaya] Chunk ${i + 1} error:`, chunkError);
      }

      // Small delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Get successful labels
    const successfulLabels = allResults.filter(r => r.success && r.data).map(r => r.data!);
    
    if (successfulLabels.length > 0) {
      // ✅ NEW: Show preview modal instead of opening new tab
      await printLabelBatchWithPreview(successfulLabels);
      
      // Mark all successful orders as printed
      const printedOrderSns = allResults.filter(r => r.success).map(r => r.orderSn);
      
      for (let i = 0; i < printedOrderSns.length; i += 50) {
        const markChunk = printedOrderSns.slice(i, i + 50);
        try {
          await api.orderMarkLabelPrintedBatch(markChunk, true);
        } catch (markErr) {
          console.warn('[PesananSaya] Failed to mark chunk as printed:', markErr);
        }
      }
      
      toast(`Membuka preview ${successfulLabels.length} label`, 'success');
      await refetch();
    } else {
      toast('Tidak ada label yang berhasil diambil', 'error');
    }
    
    clearLabelSelection();
    
  } catch (err: any) {
    toast(err.message || 'Terjadi kesalahan saat memproses batch cetak label', 'error');
  } finally {
    setBatchPrinting(false);
  }
};
```

---

## 🎨 Styling (Optional)

Add Tailwind classes or custom CSS for the modal:

```css
/* apps/web/src/styles/print-modal.css */
.print-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.print-modal-content {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 72rem;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.print-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.print-modal-body {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
  background: #f9fafb;
}

.print-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.label-preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

.label-preview-card {
  background: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  width: 4in;
  height: 6in;
  transform: scale(0.85);
  transform-origin: top center;
}
```

---

## 🧪 Testing

### Test Single Label Print
1. Go to "Pesanan Saya" page
2. Find a PROCESSED order
3. Click "Cetak Label" button
4. **Expected**: Preview modal opens (no new tab)
5. Click "Print" button
6. **Expected**: Browser print dialog opens
7. Click "Cancel" in print dialog
8. **Expected**: Modal stays open (not closed)
9. Click "Cancel" button in modal
10. **Expected**: Modal closes, back to order list

### Test Batch Label Print
1. Go to "Pesanan Saya" page
2. Select multiple PROCESSED orders (checkbox)
3. Click "Cetak Label Batch" button
4. **Expected**: Preview modal opens with all labels
5. Scroll to see all labels in preview
6. Click "Print X Labels" button
7. **Expected**: Browser print dialog opens
8. Print or cancel
9. **Expected**: Modal closes after print

### Test Main App Responsiveness
1. Open preview modal
2. Try clicking outside modal (should close)
3. Try pressing ESC key (should close)
4. While modal is open, main app should still be visible behind overlay
5. **Expected**: No freezing, smooth UX

---

## 🔧 Troubleshooting

### Modal doesn't open
**Problem**: `registerPrintPreviewModal()` not called
**Solution**: Make sure `usePrintPreview()` hook is used in App.tsx

### Print dialog doesn't open
**Problem**: Browser blocked iframe print
**Solution**: Check browser console for errors, ensure iframe is created correctly

### Labels not rendering correctly
**Problem**: CSS not loaded in iframe
**Solution**: Check `PrintPreviewModal.tsx` - ensure all styles are inlined in iframe HTML

### Batch print too slow
**Problem**: Fetching 50+ labels takes time
**Solution**: Already implemented chunking (50 labels per chunk), show loading indicator

---

## 📊 Performance Comparison

| Metric | Old (window.open) | New (Modal + iframe) |
|--------|-------------------|----------------------|
| Tab freeze | ❌ Yes | ✅ No |
| Accidental close | ❌ Yes | ✅ No |
| Preview | ❌ No | ✅ Yes |
| Popup blocker | ❌ Often blocked | ✅ No issue |
| UX Quality | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎯 Next Steps (Optional Enhancements)

1. **Add keyboard shortcuts**
   - `Ctrl+P` to print from preview
   - `ESC` to close modal (already implemented)

2. **Add print settings**
   - Paper size selection (4×6, A4, etc.)
   - Orientation (portrait/landscape)
   - Margins adjustment

3. **Add export to PDF**
   - Use `html2canvas` + `jsPDF`
   - Download labels as PDF file

4. **Add print history**
   - Track when labels were printed
   - Show reprint count

5. **Add label customization**
   - Logo upload
   - Custom footer message
   - Color scheme selection

---

## 📝 Migration Checklist

- [ ] Add `PrintPreviewModal.tsx` component
- [ ] Add `LabelRenderer.tsx` component
- [ ] Add `usePrintPreview.tsx` hook
- [ ] Add `printLabelWithPreview.ts` utility
- [ ] Update `App.tsx` to include modal
- [ ] Update `PrintLabelButton.tsx` to use new utility
- [ ] Update `PesananSaya.tsx` batch print to use new utility
- [ ] Test single label print
- [ ] Test batch label print
- [ ] Test cancel behavior
- [ ] Test main app responsiveness
- [ ] Remove old `printLabel.ts` (optional, keep for fallback)

---

## 🎉 Done!

Your print label feature is now modern, user-friendly, and doesn't have the freezing/closing issues anymore!

**Questions?** Check the code comments in each file for detailed explanations.
