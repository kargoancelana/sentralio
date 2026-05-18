import { useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { Package, RefreshCw, Search, Truck, Loader2, Printer, CheckCircle2, Circle, ChevronDown, Palette, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale/id';
import { PrintLabelButton } from '../components/shared/PrintLabelButton';
import { ShipmentProgressDialog, BatchShipmentProgressDialog } from '../components/shared/ShipmentProgressDialog';
import { SyncStatusIndicator } from '../components/shared/SyncStatusIndicator';
import { getBatchSummaryMessage, mapLabelError } from '../utils/label-errors';
import { printCustomLabels, printOfficialLabels } from '../utils/printLabel';
import './PesananSaya.css';

/* ── Status mapping ── */
type MainFilter = 'UNPAID' | 'NEED_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
type SubFilter  = 'ALL' | 'READY_TO_SHIP' | 'PROCESSED';
type PrintFilter = 'ALL' | 'PRINTED' | 'UNPRINTED';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  UNPAID:              { label: 'Belum Bayar',    cls: 'badge-orange' },
  READY_TO_SHIP:       { label: 'Perlu Diproses', cls: 'badge-primary' },
  PROCESSED:           { label: 'Telah Diproses', cls: 'badge-purple' },
  SHIPPED:             { label: 'Dikirim',        cls: 'badge-green' },
  TO_CONFIRM_RECEIVE:  { label: 'Dikirim',        cls: 'badge-green' },
  COMPLETED:           { label: 'Selesai',        cls: 'badge-green' },
  IN_CANCEL:           { label: 'Dibatalkan',     cls: 'badge-red' },
  CANCELLED:           { label: 'Dibatalkan',     cls: 'badge-red' },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status] || { label: status, cls: '' };
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

const formatRp   = (num: number) => 'Rp ' + num.toLocaleString('id-ID');
const formatDate = (dateStr: string) => {
  try { return format(new Date(dateStr), 'dd MMM yyyy, HH:mm', { locale: idLocale }); }
  catch { return dateStr; }
};

/* ── ORDER CARD ── */
function OrderCard({ 
  order, 
  onShipOrder, 
  selectedOrders,
  onToggleSelection,
  selectedLabelOrders,
  onToggleLabelSelection,
  batchPrinting,
  onPrintComplete
}: { 
  order: any; 
  onShipOrder: (orderSn: string) => void;
  selectedOrders: string[];
  onToggleSelection: (orderSn: string) => void;
  selectedLabelOrders: string[];
  onToggleLabelSelection: (orderSn: string) => void;
  batchPrinting: boolean;
  onPrintComplete: () => void;
}) {
  const items: any[] = order.items || [];
  const hasItems = items.length > 0;
  const isSelected = selectedOrders.includes(order.orderSn);
  const isReadyToShip = order.orderStatus === 'READY_TO_SHIP';
  const isLabelSelected = selectedLabelOrders.includes(order.orderSn);
  const isProcessed = order.orderStatus === 'PROCESSED';
  const isLabelPrinted = order.labelPrinted === 1;

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      marginBottom: 10, overflow: 'hidden',
    }}>
      {/* Header: checkbox + tanggal kiri, no pesanan kanan */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 16px', borderBottom: '1px solid var(--bg3)',
        background: 'var(--bg2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isReadyToShip && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelection(order.orderSn)}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
            />
          )}
          {isProcessed && (
            <input
              type="checkbox"
              checked={isLabelSelected}
              onChange={() => onToggleLabelSelection(order.orderSn)}
              disabled={batchPrinting}
              style={{
                width: 14,
                height: 14,
                cursor: batchPrinting ? 'not-allowed' : 'pointer',
                opacity: batchPrinting ? 0.6 : 1,
              }}
            />
          )}
          <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>
            {formatDate(order.createTime)}
          </span>
        </div>
        <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--text3)', userSelect: 'all' }}>
          #{order.orderSn}
        </span>
      </div>

      {/* Username */}
      <div style={{ padding: '10px 16px 0', fontWeight: 600, fontSize: 13, color: 'var(--text1)' }}>
        @{order.buyerUsername || 'Pembeli'}
      </div>

      {/* Rows: satu row per item, semua kolom sejajar */}
      <div style={{ padding: '6px 16px 12px' }}>
        {hasItems ? (
          items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              paddingTop: 8,
              borderTop: idx > 0 ? '1px solid var(--bg3)' : 'none',
              marginTop: idx > 0 ? 8 : 0,
            }}>
              {/* Produk + variasi — flex 1 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.4, fontWeight: 500 }}>
                  {item.itemName}
                </div>
                {item.modelName && (
                  <div style={{ fontSize: 11.5, color: 'var(--text4)', marginTop: 2 }}>
                    Variasi: {item.modelName}
                  </div>
                )}
              </div>

              {/* Qty — sejajar dengan item row */}
              <div style={{ minWidth: 40, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text2)', paddingTop: 1 }}>
                ×{item.qty}
              </div>

              {/* Total: hanya tampil di row pertama, sisanya kosong */}
              <div style={{ minWidth: 100, textAlign: 'right' }}>
                {idx === 0 ? (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', whiteSpace: 'nowrap' }}>
                    {formatRp(order.totalAmount)}
                  </span>
                ) : null}
              </div>

              {/* Status: hanya di row pertama */}
              <div style={{ minWidth: 110, textAlign: 'center' }}>
                {idx === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <StatusBadge status={order.orderStatus} />
                    {isProcessed && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 8,
                        background: isLabelPrinted ? 'var(--success)' : 'var(--warning)',
                        color: '#fff',
                        opacity: 0.85,
                      }}>
                        {isLabelPrinted ? <CheckCircle2 size={9} /> : <Circle size={9} />}
                        {isLabelPrinted ? 'Sudah Cetak' : 'Belum Cetak'}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Jasa kirim + tracking number: hanya di row pertama */}
              <div style={{ minWidth: 100, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                {idx === 0 ? (
                  order.shippingCarrier || order.trackingNumber ? (
                    <>
                      <Truck size={13} style={{ color: 'var(--text3)' }} />
                      {order.shippingCarrier && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, textAlign: 'center' }}>
                          {order.shippingCarrier}
                        </span>
                      )}
                      {order.trackingNumber && (
                        <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'monospace', textAlign: 'center', marginTop: 2 }}>
                          {order.trackingNumber}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
                  )
                ) : null}
              </div>

              {/* Action button: hanya di row pertama */}
              <div style={{ minWidth: 120, textAlign: 'center' }}>
                {idx === 0 && order.orderStatus === 'READY_TO_SHIP' ? (
                  <button
                    onClick={() => onShipOrder(order.orderSn)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: 'none',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: 'var(--accent)', color: 'var(--accent-f)',
                      display: 'flex', alignItems: 'center', gap: 6,
                      justifyContent: 'center', transition: 'all .15s',
                    }}
                  >
                    <Truck size={12} />
                    Atur Pengiriman
                  </button>
                ) : idx === 0 && order.orderStatus === 'PROCESSED' ? (
                  <PrintLabelButton
                    orderSn={order.orderSn}
                    labelPrinted={isLabelPrinted}
                    onPrintComplete={() => onPrintComplete()}
                  />
                ) : idx === 0 ? (
                  <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          /* Fallback jika belum ada item detail */
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Data produk belum tersedia</div>
            <div style={{ minWidth: 40 }} />
            <div style={{ minWidth: 100, textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>
              {formatRp(order.totalAmount)}
            </div>
            <div style={{ minWidth: 110, textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <StatusBadge status={order.orderStatus} />
                {isProcessed && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 8,
                    background: isLabelPrinted ? 'var(--success)' : 'var(--warning)',
                    color: '#fff',
                    opacity: 0.85,
                  }}>
                    {isLabelPrinted ? <CheckCircle2 size={9} /> : <Circle size={9} />}
                    {isLabelPrinted ? 'Sudah Cetak' : 'Belum Cetak'}
                  </span>
                )}
              </div>
            </div>
            <div style={{ minWidth: 100, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {order.shippingCarrier || order.trackingNumber ? (
                <>
                  <Truck size={13} style={{ color: 'var(--text3)' }} />
                  {order.shippingCarrier && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, textAlign: 'center' }}>
                      {order.shippingCarrier}
                    </span>
                  )}
                  {order.trackingNumber && (
                    <span style={{ fontSize: 10, color: 'var(--text4)', fontFamily: 'monospace', textAlign: 'center', marginTop: 2 }}>
                      {order.trackingNumber}
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
              )}
            </div>
            <div style={{ minWidth: 120, textAlign: 'center' }}>
              {order.orderStatus === 'READY_TO_SHIP' ? (
                <button
                  onClick={() => onShipOrder(order.orderSn)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: 'var(--accent)', color: 'var(--accent-f)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    justifyContent: 'center', transition: 'all .15s',
                  }}
                >
                  <Truck size={12} />
                  Atur Pengiriman
                </button>
              ) : order.orderStatus === 'PROCESSED' ? (
                <PrintLabelButton
                  orderSn={order.orderSn}
                  labelPrinted={isLabelPrinted}
                  onPrintComplete={() => onPrintComplete()}
                />
              ) : (
                <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   PAGE
════════════════════════════════════════════ */
export function PesananSaya() {
  const toast = useToast();
  const { data: ordersData, loading, refetch } = useApi(() => api.orderList(), []);
  const { data: shopsData } = useApi(() => api.shopeeCredentialsList(), []);
  const [syncing, setSyncing]         = useState(false);
  const [mainFilter, setMainFilter]   = useState<MainFilter>('NEED_SHIP');
  const [subFilter, setSubFilter]     = useState<SubFilter>('ALL');
  const [printFilter, setPrintFilter] = useState<PrintFilter>('ALL');
  const [search, setSearch]           = useState('');
  const [shopFilter, setShopFilter]   = useState<string>('all');
  
  // Batch selection state (for shipment)
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // Batch label printing state (for PROCESSED orders)
  const [selectedLabelOrders, setSelectedLabelOrders] = useState<string[]>([]);
  const [batchPrinting, setBatchPrinting] = useState(false);

  const [syncProgress, setSyncProgress] = useState<{ total: number, page: number } | null>(null);

  // Unified shipment progress dialog state
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [shipDialogOrderSn, setShipDialogOrderSn] = useState<string | null>(null);

  // Batch shipment progress dialog state
  const [showBatchShipDialog, setShowBatchShipDialog] = useState(false);
  const [batchShipDialogOrderSns, setBatchShipDialogOrderSns] = useState<string[]>([]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ total: 0, page: 1 });
    toast('Memulai penarikan pesanan Shopee...', 'info');
    
    let currentCursor = '';
    let totalSynced = 0;
    let pageCount = 1;
    let currentShopIndex = 0;
    
    // Manual sync strategy:
    // 1. Fetch last 60 days to ensure we catch all recent orders
    // 2. Use create_time (not update_time) because Shopee API doesn't reliably return
    //    orders by update_time when status changes (e.g., READY_TO_SHIP → SHIPPED)
    // 3. Fetch all statuses to ensure complete data
    const daysBack = 60; // Fetch last 60 days for manual sync (catch all recent orders)
    const orderStatusFilter = undefined; // Fetch all statuses

    try {
      while (true) {
        const res: any = await api.orderSync(undefined, daysBack, currentCursor, currentShopIndex, orderStatusFilter);
        const fetched = res.data?.fetched || 0;
        totalSynced += fetched;
        setSyncProgress({ total: totalSynced, page: pageCount });
        
        if (!res.data?.has_more) {
          toast(`Berhasil menarik total ${totalSynced} pesanan (${daysBack} hari terakhir)`, 'success');
          break;
        }
        
        currentCursor = res.data.next_cursor;
        currentShopIndex = res.data.shop_index || 0;
        pageCount++;
        await new Promise(r => setTimeout(r, 500)); // Delay between pages
      }
    } catch (err: any) {
      toast(err.message || 'Terputus. Silakan klik tarik lagi untuk resume penarikan.', 'error');
    } finally {
      setSyncing(false);
      setSyncProgress(null);
      await refetch();
    }
  };

  const handleShipOrder = (orderSn: string) => {
    // Open unified shipment progress dialog — no blocking, all happens inside modal
    setShipDialogOrderSn(orderSn);
    setShowShipDialog(true);
  };

  // Batch selection functions (for shipment)
  const toggleOrderSelection = (orderSn: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderSn) 
        ? prev.filter(sn => sn !== orderSn)
        : [...prev, orderSn]
    );
  };

  // Batch label selection functions (for PROCESSED orders)
  const toggleLabelSelection = (orderSn: string) => {
    setSelectedLabelOrders(prev => 
      prev.includes(orderSn) 
        ? prev.filter(sn => sn !== orderSn)
        : [...prev, orderSn]
    );
  };

  const selectAllReadyToShip = () => {
    const readyToShipOrders = filtered.filter(o => o.orderStatus === 'READY_TO_SHIP');
    const allSelected = readyToShipOrders.every(o => selectedOrders.includes(o.orderSn));
    
    if (allSelected) {
      // Deselect all ready to ship orders
      setSelectedOrders(prev => prev.filter(sn => !readyToShipOrders.some(o => o.orderSn === sn)));
    } else {
      // Select all ready to ship orders
      const newSelections = readyToShipOrders.map(o => o.orderSn);
      setSelectedOrders(prev => [...new Set([...prev, ...newSelections])]);
    }
  };

  const selectAllProcessed = () => {
    const processedOrders = filtered.filter(o => o.orderStatus === 'PROCESSED');
    const allSelected = processedOrders.every(o => selectedLabelOrders.includes(o.orderSn));
    
    if (allSelected) {
      // Deselect all processed orders
      setSelectedLabelOrders(prev => prev.filter(sn => !processedOrders.some(o => o.orderSn === sn)));
    } else {
      // Select all processed orders
      const newSelections = processedOrders.map(o => o.orderSn);
      setSelectedLabelOrders(prev => [...new Set([...prev, ...newSelections])]);
    }
  };

  const clearSelection = () => {
    setSelectedOrders([]);
  };

  const clearLabelSelection = () => {
    setSelectedLabelOrders([]);
  };

  const handleBatchShip = () => {
    if (selectedOrders.length === 0) return;
    // Open batch shipment progress dialog — everything happens inside the modal
    setBatchShipDialogOrderSns([...selectedOrders]);
    setShowBatchShipDialog(true);
    clearSelection();
  };

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

      console.log(`[PesananSaya] Fetching ${selectedLabelOrders.length} labels in ${chunks.length} chunks`);

      // Fetch all chunks
      const allResults: Array<{ orderSn: string; success: boolean; data?: any; error?: string }> = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[PesananSaya] Fetching chunk ${i + 1}/${chunks.length} (${chunk.length} orders)`);
        
        try {
          const batchResult = await api.orderLabelDataBatch(chunk);
          
          if (batchResult.success && batchResult.data) {
            allResults.push(...batchResult.data.results);
          } else {
            // Mark all orders in failed chunk as failed
            for (const orderSn of chunk) {
              allResults.push({
                orderSn,
                success: false,
                error: 'Gagal mengambil label untuk chunk ini'
              });
            }
          }
        } catch (chunkError: any) {
          console.error(`[PesananSaya] Chunk ${i + 1} error:`, chunkError);
          // Mark all orders in failed chunk as failed
          for (const orderSn of chunk) {
            allResults.push({
              orderSn,
              success: false,
              error: chunkError.message || 'Network error'
            });
          }
        }

        // Small delay between chunks
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Aggregate results
      const successfulLabels = allResults.filter(r => r.success && r.data).map(r => r.data!);
      const successful = allResults.filter(r => r.success).length;
      const failed = allResults.filter(r => !r.success).length;
      const total = allResults.length;
      
      if (successfulLabels.length > 0) {
        try {
          // Open in new tab — no preview modal
          await printCustomLabels(successfulLabels, async () => {
            toast(`${successful} label custom dibuka di tab baru`, 'success');
            await refetch();
          });
        } catch (openError: any) {
          console.error('[PesananSaya] Error opening batch labels:', openError);
          toast(openError.message || 'Gagal membuka label di tab baru', 'error');
        }
      } else {
        toast('Tidak ada label yang berhasil diambil', 'error');
      }
      
      const summaryMessage = getBatchSummaryMessage(successful, failed, total);
      if (failed > 0) toast(summaryMessage, 'warn');
      
      clearLabelSelection();
      
    } catch (err: any) {
      const errorInfo = mapLabelError(err);
      toast(errorInfo.message || 'Terjadi kesalahan saat memproses batch cetak label', 'error');
    } finally {
      setBatchPrinting(false);
    }
  };

  const handleBatchPrintOfficialLabels = async () => {
    if (selectedLabelOrders.length === 0) return;
    
    setBatchPrinting(true);
    toast('Mengambil label resmi dari Shopee...', 'info');
    
    try {
      // Use optimized batch endpoint
      const result = await api.orderShippingLabelBatch(selectedLabelOrders);

      if (result.success && (result.data?.url || result.data?.urls)) {
        const urls = result.data.urls || (result.data.url ? [result.data.url] : []);
        const orderSnList = [...selectedLabelOrders];
        await printOfficialLabels(urls, orderSnList, async () => {
          toast(`${orderSnList.length} label asli dibuka di tab baru`, 'success');
          await refetch();
        });

        if (result.data.failedOrders && result.data.failedOrders.length > 0) {
          toast(`${result.data.failedOrders.length} order gagal diambil labelnya`, 'warn');
        }
      } else {
        const errorMsg = (result as any).error || 'Tidak ada label resmi yang berhasil diambil';
        toast(errorMsg, 'error');
      }
      
      clearLabelSelection();
    } catch (err: any) {
      toast(err.message || 'Terjadi kesalahan saat memproses batch label resmi', 'error');
    } finally {
      setBatchPrinting(false);
    }
  };

  const handleMainFilter = (f: MainFilter) => {
    setMainFilter(f);
    if (f !== 'NEED_SHIP') {
      setSubFilter('ALL');
      setPrintFilter('ALL');
    }
  };

  const handleSubFilter = (sf: SubFilter) => {
    setSubFilter(sf);
    if (sf !== 'PROCESSED') setPrintFilter('ALL');
  };

  const handleShopFilterChange = (newShopId: string) => {
    setShopFilter(newShopId);
    setSelectedOrders([]);
    setSelectedLabelOrders([]);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Memuat data pesanan...</div>;
  }

  const orders: any[] = ordersData?.data || [];

  // Filter out test_buyer from all counts and displays
  const ordersWithoutTest = orders.filter(o => {
    // Exclude test_buyer from READY_TO_SHIP
    if (o.orderStatus === 'READY_TO_SHIP' && (o.buyerUsername || '').toLowerCase().includes('test_buyer')) {
      return false;
    }
    return true;
  });

  // Build shop options from credentials + fallback from orders (same pattern as ProdukChannel)
  const shopOptions: Array<{ id: string; label: string }> = [{ id: 'all', label: 'Semua Toko' }];
  const credShops: any[] = shopsData?.data || [];
  for (const s of credShops) {
    shopOptions.push({
      id: String(s.shop_id),
      label: `${s.shop_name || `Toko #${s.shop_id}`} - Shopee`,
    });
  }
  // Fallback: add shops found in orders but not in credentials
  for (const o of ordersWithoutTest) {
    if (o.shopId && !shopOptions.some(s => s.id === String(o.shopId))) {
      shopOptions.push({ id: String(o.shopId), label: `Toko #${o.shopId} - Shopee` });
    }
  }

  // Apply shop filter
  const shopFilteredOrders = shopFilter === 'all'
    ? ordersWithoutTest
    : ordersWithoutTest.filter(o => String(o.shopId) === shopFilter);

  // Counts - use shop-filtered orders
  const countUnpaid    = shopFilteredOrders.filter(o => o.orderStatus === 'UNPAID').length;
  const countNeedShip  = shopFilteredOrders.filter(o => ['READY_TO_SHIP', 'PROCESSED'].includes(o.orderStatus)).length;
  const countRts       = shopFilteredOrders.filter(o => o.orderStatus === 'READY_TO_SHIP').length;
  const countProcessed = shopFilteredOrders.filter(o => o.orderStatus === 'PROCESSED').length;
  const countPrinted   = shopFilteredOrders.filter(o => o.orderStatus === 'PROCESSED' && o.labelPrinted === 1).length;
  const countUnprinted = shopFilteredOrders.filter(o => o.orderStatus === 'PROCESSED' && o.labelPrinted !== 1).length;
  const countShipped   = shopFilteredOrders.filter(o => ['SHIPPED', 'TO_CONFIRM_RECEIVE', 'IN_CANCEL'].includes(o.orderStatus)).length;
  const countCompleted = shopFilteredOrders.filter(o => o.orderStatus === 'COMPLETED').length;
  const countCancelled = shopFilteredOrders.filter(o => o.orderStatus === 'CANCELLED').length;

  // Filter logic - use shopFilteredOrders as base
  const filtered = shopFilteredOrders.filter(o => {
    // Main filter
    let matchMain = false;
    if (mainFilter === 'UNPAID')    matchMain = o.orderStatus === 'UNPAID';
    if (mainFilter === 'SHIPPED')   matchMain = ['SHIPPED', 'TO_CONFIRM_RECEIVE', 'IN_CANCEL'].includes(o.orderStatus);
    if (mainFilter === 'COMPLETED') matchMain = o.orderStatus === 'COMPLETED';
    if (mainFilter === 'CANCELLED') matchMain = o.orderStatus === 'CANCELLED';
    if (mainFilter === 'NEED_SHIP') {
      if (subFilter === 'ALL')           matchMain = ['READY_TO_SHIP', 'PROCESSED'].includes(o.orderStatus);
      if (subFilter === 'READY_TO_SHIP') matchMain = o.orderStatus === 'READY_TO_SHIP';
      if (subFilter === 'PROCESSED') {
        matchMain = o.orderStatus === 'PROCESSED';
        // Apply print filter when PROCESSED is selected
        if (matchMain && printFilter === 'PRINTED')   matchMain = o.labelPrinted === 1;
        if (matchMain && printFilter === 'UNPRINTED') matchMain = o.labelPrinted !== 1;
      }
    }
    const matchSearch = o.orderSn.toLowerCase().includes(search.toLowerCase()) ||
                        (o.buyerUsername || '').toLowerCase().includes(search.toLowerCase());
    return matchMain && matchSearch;
  });

  const badgeDot = (count: number, badgeCls: string) =>
    count > 0 ? <span className={`badge ${badgeCls}`} style={{ marginLeft: 6, padding: '2px 6px', fontSize: 10 }}>{count}</span> : null;

  return (
    <div className="wms-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pesanan Saya</h1>
          <p className="page-subtitle">Kelola pesanan dari toko Shopee Anda</p>
        </div>
        <div className="page-actions">
          <SyncStatusIndicator />
          <button className="btn btn-shopee" onClick={handleSync} disabled={syncing}>
            {syncing ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
            {syncing ? `Menarik... (Hal ${syncProgress?.page || 1})` : 'Tarik Pesanan'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Belum Bayar</div>
          <div className="stat-value" style={{ color: '#F59E0B' }}>{countUnpaid}</div>
          <div className="stat-sub">Menunggu pembayaran buyer</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Perlu Dikirim</div>
          <div className="stat-value" style={{ color: '#3B82F6' }}>{countNeedShip}</div>
          <div className="stat-sub">Siap di-pickup / antar</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dikirim</div>
          <div className="stat-value" style={{ color: '#8B5CF6' }}>{countShipped}</div>
          <div className="stat-sub">Dalam proses pengiriman</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Selesai</div>
          <div className="stat-value" style={{ color: '#16A34A' }}>{countCompleted}</div>
          <div className="stat-sub">Transaksi berhasil</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pembatalan</div>
          <div className="stat-value" style={{ color: '#EF4444' }}>{countCancelled}</div>
          <div className="stat-sub">Order dibatalkan</div>
        </div>
      </div>

      {/* ── SHOP FILTER ── */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={shopFilter}
          onChange={e => handleShopFilterChange(e.target.value)}
          style={{
            padding: '7px 12px',
            borderRadius: 7,
            border: '1px solid var(--border)',
            background: 'var(--bg2)',
            color: 'var(--text2)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            width: '260px',
          }}
        >
          {shopOptions.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="filter-tabs">
            <button
              className={`filter-tab ${mainFilter === 'UNPAID' ? 'active' : ''}`}
              onClick={() => handleMainFilter('UNPAID')}
            >
              Belum Bayar{badgeDot(countUnpaid, 'badge-orange')}
            </button>

            <button
              className={`filter-tab ${mainFilter === 'NEED_SHIP' ? 'active' : ''}`}
              onClick={() => handleMainFilter('NEED_SHIP')}
            >
              Perlu Dikirim{badgeDot(countNeedShip, 'badge-primary')}
            </button>

            <button
              className={`filter-tab ${mainFilter === 'SHIPPED' ? 'active' : ''}`}
              onClick={() => handleMainFilter('SHIPPED')}
            >
              Dikirim{badgeDot(countShipped, 'badge-purple')}
            </button>

            <button
              className={`filter-tab ${mainFilter === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => handleMainFilter('COMPLETED')}
            >
              Selesai
            </button>

            <button
              className={`filter-tab ${mainFilter === 'CANCELLED' ? 'active' : ''}`}
              onClick={() => handleMainFilter('CANCELLED')}
            >
              Pembatalan{badgeDot(countCancelled, 'badge-red')}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="search-wrap" style={{ width: 260 }}>
            <Search size={14} />
            <input className="search-inp" placeholder="Cari No. Pesanan atau Pembeli..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── SUB-FILTER: hanya muncul saat Perlu Dikirim aktif ── */}
      {mainFilter === 'NEED_SHIP' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, marginTop: -6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text4)', marginRight: 4 }}>Status:</span>
          {([
            { key: 'ALL'           as SubFilter, label: 'Semua', count: countNeedShip },
            { key: 'READY_TO_SHIP' as SubFilter, label: 'Perlu Diproses', count: countRts },
            { key: 'PROCESSED'     as SubFilter, label: 'Telah Diproses', count: countProcessed },
          ]).map(item => (
            <button
              key={item.key}
              onClick={() => handleSubFilter(item.key)}
              style={{
                padding: '4px 12px', borderRadius: 20, border: '1px solid',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                fontWeight: subFilter === item.key ? 600 : 400,
                background: subFilter === item.key ? 'var(--accent)' : 'var(--bg)',
                color: subFilter === item.key ? 'var(--accent-f)' : 'var(--text3)',
                borderColor: subFilter === item.key ? 'var(--accent)' : 'var(--border)',
                transition: 'all .15s',
              }}
            >
              {item.label}
              {item.count > 0 && (
                <span style={{ marginLeft: 5, opacity: subFilter === item.key ? 0.8 : 0.6, fontSize: 11 }}>
                  ({item.count})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── PRINT STATUS FILTER: hanya muncul saat Telah Diproses aktif ── */}
      {mainFilter === 'NEED_SHIP' && subFilter === 'PROCESSED' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, marginTop: -6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text4)', marginRight: 4 }}>Cetak Label:</span>
          {([
            { key: 'ALL'       as PrintFilter, label: 'Semua', count: countProcessed, icon: null },
            { key: 'UNPRINTED' as PrintFilter, label: 'Belum Dicetak', count: countUnprinted, icon: <Circle size={11} style={{ marginRight: 3 }} /> },
            { key: 'PRINTED'   as PrintFilter, label: 'Sudah Dicetak', count: countPrinted, icon: <CheckCircle2 size={11} style={{ marginRight: 3 }} /> },
          ]).map(item => (
            <button
              key={item.key}
              onClick={() => setPrintFilter(item.key)}
              style={{
                padding: '4px 12px', borderRadius: 20, border: '1px solid',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                fontWeight: printFilter === item.key ? 600 : 400,
                display: 'inline-flex', alignItems: 'center',
                background: printFilter === item.key
                  ? (item.key === 'PRINTED' ? 'var(--success)' : item.key === 'UNPRINTED' ? 'var(--warning)' : 'var(--accent)')
                  : 'var(--bg)',
                color: printFilter === item.key ? '#fff' : 'var(--text3)',
                borderColor: printFilter === item.key
                  ? (item.key === 'PRINTED' ? 'var(--success)' : item.key === 'UNPRINTED' ? 'var(--warning)' : 'var(--accent)')
                  : 'var(--border)',
                transition: 'all .15s',
              }}
            >
              {item.icon}
              {item.label}
              {item.count > 0 && (
                <span style={{ marginLeft: 5, opacity: printFilter === item.key ? 0.8 : 0.6, fontSize: 11 }}>
                  ({item.count})
                </span>
              )}
            </button>
          ))}
        </div>
      )}


      {/* ── BATCH ACTIONS (Shipment) ── */}
      {selectedOrders.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', marginBottom: 16,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
            {selectedOrders.length} pesanan dipilih
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={clearSelection}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: 'var(--bg)', color: 'var(--text3)',
              }}
            >
              Batal
            </button>
            <button
              onClick={() => handleBatchShip()}
              style={{
                padding: '6px 16px', borderRadius: 6, border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-f)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Truck size={12} />
              Atur Pengiriman ({selectedOrders.length})
            </button>
          </div>
        </div>
      )}

      {/* ── BATCH ACTIONS (Label Printing) ── */}
      {selectedLabelOrders.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', marginBottom: 16,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
              {selectedLabelOrders.length} pesanan dipilih
            </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={selectAllProcessed}
              disabled={batchPrinting}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                fontSize: 12, fontWeight: 500, cursor: batchPrinting ? 'not-allowed' : 'pointer',
                background: 'var(--bg)', color: 'var(--text3)',
                opacity: batchPrinting ? 0.6 : 1,
              }}
            >
              Pilih Semua
            </button>
            <button
              onClick={clearLabelSelection}
              disabled={batchPrinting}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                fontSize: 12, fontWeight: 500, cursor: batchPrinting ? 'not-allowed' : 'pointer',
                background: 'var(--bg)', color: 'var(--text3)',
                opacity: batchPrinting ? 0.6 : 1,
              }}
            >
              Batal
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}
              onMouseEnter={(e) => {
                const dd = e.currentTarget.querySelector('.batch-label-dd') as HTMLElement;
                if (dd) dd.style.display = 'block';
              }}
              onMouseLeave={(e) => {
                const dd = e.currentTarget.querySelector('.batch-label-dd') as HTMLElement;
                if (dd) dd.style.display = 'none';
              }}
            >
              <button
                onClick={(e) => {
                  // Toggle dropdown on click (same as single order PrintLabelButton)
                  const dd = e.currentTarget.parentElement?.querySelector('.batch-label-dd') as HTMLElement;
                  if (dd) dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
                }}
                disabled={batchPrinting}
                style={{
                  padding: '6px 16px', borderRadius: 6, border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: batchPrinting ? 'not-allowed' : 'pointer',
                  background: batchPrinting ? 'var(--bg3)' : 'var(--accent)',
                  color: batchPrinting ? 'var(--text4)' : 'var(--accent-f)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: batchPrinting ? 0.6 : 1,
                }}
              >
                {batchPrinting ? (
                  <Loader2 size={12} className="spin" />
                ) : (
                  <Printer size={12} />
                )}
                Cetak Label Batch ({selectedLabelOrders.length})
                <ChevronDown size={10} style={{ opacity: 0.6 }} />
              </button>
              {!batchPrinting && (
                <div className="batch-label-dd" style={{
                  display: 'none', position: 'absolute', bottom: '100%', right: 0,
                  marginBottom: 4, background: 'var(--bg1, #fff)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  minWidth: 170, overflow: 'hidden', zIndex: 9999,
                }}>
                  <button onClick={handleBatchPrintLabels} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Palette size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div>
                      <div>Label Custom</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>Ada info item & SKU</div>
                    </div>
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />
                  <button onClick={handleBatchPrintOfficialLabels} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <FileText size={14} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
                    <div>
                      <div>Label Asli</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>PDF resmi dari Shopee</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ORDER LIST ── */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={48} opacity={0.3} style={{ margin: '0 auto' }} /></div>
          <div className="empty-state-text">Tidak ada pesanan</div>
          <div className="empty-state-sub">Belum ada pesanan yang sesuai dengan filter ini. Coba tarik pesanan terlebih dahulu.</div>
        </div>
      ) : (
        <div>
          {/* Sticky column header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '6px 16px', marginBottom: 6,
            fontSize: 11, fontWeight: 600, color: 'var(--text4)',
            textTransform: 'uppercase', letterSpacing: '.04em',
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg3)',
            borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              {countRts > 0 && (mainFilter === 'NEED_SHIP' && (subFilter === 'ALL' || subFilter === 'READY_TO_SHIP')) && (
                <input
                  type="checkbox"
                  checked={filtered.filter(o => o.orderStatus === 'READY_TO_SHIP').length > 0 && 
                           filtered.filter(o => o.orderStatus === 'READY_TO_SHIP').every(o => selectedOrders.includes(o.orderSn))}
                  onChange={selectAllReadyToShip}
                  style={{ width: 12, height: 12, cursor: 'pointer' }}
                  title="Pilih semua pesanan yang perlu diproses"
                />
              )}
              {countProcessed > 0 && (mainFilter === 'NEED_SHIP' && (subFilter === 'ALL' || subFilter === 'PROCESSED')) && (
                <input
                  type="checkbox"
                  checked={filtered.filter(o => o.orderStatus === 'PROCESSED').length > 0 && 
                           filtered.filter(o => o.orderStatus === 'PROCESSED').every(o => selectedLabelOrders.includes(o.orderSn))}
                  onChange={selectAllProcessed}
                  disabled={batchPrinting}
                  style={{
                    width: 12,
                    height: 12,
                    cursor: batchPrinting ? 'not-allowed' : 'pointer',
                    opacity: batchPrinting ? 0.6 : 1,
                  }}
                  title="Pilih semua pesanan yang sudah diproses"
                />
              )}
              <span>Pembeli &amp; Produk</span>
            </div>
            <div style={{ minWidth: 40, textAlign: 'center' }}>Qty</div>
            <div style={{ minWidth: 100, textAlign: 'right' }}>Total</div>
            <div style={{ minWidth: 110, textAlign: 'center' }}>Status</div>
            <div style={{ minWidth: 80, textAlign: 'center' }}>Ekspedisi</div>
            <div style={{ minWidth: 120, textAlign: 'center' }}>Aksi</div>
          </div>

          {filtered.map((order: any) => (
            <OrderCard 
              key={order.id} 
              order={order} 
              onShipOrder={handleShipOrder}
              selectedOrders={selectedOrders}
              onToggleSelection={toggleOrderSelection}
              selectedLabelOrders={selectedLabelOrders}
              onToggleLabelSelection={toggleLabelSelection}
              batchPrinting={batchPrinting}
              onPrintComplete={() => refetch()}
            />
          ))}

          <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: 'var(--text4)' }}>
            {filtered.length} pesanan ditampilkan
          </div>
        </div>
      )}
      
      {/* ── SHIPMENT PROGRESS DIALOG (Single) ── */}
      <ShipmentProgressDialog
        isOpen={showShipDialog}
        orderSn={shipDialogOrderSn || ''}
        onClose={() => {
          setShowShipDialog(false);
          setShipDialogOrderSn(null);
        }}
        onComplete={() => refetch()}
      />

      {/* ── SHIPMENT PROGRESS DIALOG (Batch) ── */}
      <BatchShipmentProgressDialog
        isOpen={showBatchShipDialog}
        orderSns={batchShipDialogOrderSns}
        onClose={() => {
          setShowBatchShipDialog(false);
          setBatchShipDialogOrderSns([]);
        }}
        onComplete={() => refetch()}
      />
    </div>
  );
}
