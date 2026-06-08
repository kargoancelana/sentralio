import { useState, useMemo, useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { Package, RefreshCw, Search, Truck, CheckCircle2, Circle } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale/id';
import { PrintLabelButton } from '../components/shared/PrintLabelButton';
import { ShipmentProgressDialog, BatchShipmentProgressDialog } from '../components/shared/ShipmentProgressDialog';
import { SyncStatusIndicator } from '../components/shared/SyncStatusIndicator';
import { getBatchSummaryMessage, mapLabelError } from '../utils/label-errors';
import { printCustomLabels, printOfficialLabels } from '../utils/printLabel';
import { printPickingListOnly } from '../utils/printPickingListOnly';
import { LihatRincianButton } from '../components/order/LihatRincianButton';
import { OrderDetailModal } from '../components/order/OrderDetailModal';
import { FloatingActionBar } from '../components/order/FloatingActionBar';
import { deriveTab } from '../components/order/deriveTab';
import { pruneSelection } from '../components/order/pruneSelection';
import './PesananSaya.css';

/* ── Status mapping ── */
export type MainFilter = 'UNPAID' | 'NEED_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
export type SubFilter  = 'ALL' | 'READY_TO_SHIP' | 'PROCESSED';
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
  onPrintComplete,
  activeTab,
  onLihatRincian,
}: { 
  order: any; 
  onShipOrder: (orderSn: string) => void;
  selectedOrders: string[];
  onToggleSelection: (orderSn: string) => void;
  selectedLabelOrders: string[];
  onToggleLabelSelection: (orderSn: string) => void;
  batchPrinting: boolean;
  onPrintComplete: () => void;
  /** The currently active main filter tab */
  activeTab: MainFilter;
  /** Called when "Lihat Rincian" is clicked for this order */
  onLihatRincian: (orderSn: string, shopId: number) => void;
}) {
  const items: any[] = order.items || [];
  const hasItems = items.length > 0;
  const isSelected = selectedOrders.includes(order.orderSn);
  const isReadyToShip = order.orderStatus === 'READY_TO_SHIP';
  const isLabelSelected = selectedLabelOrders.includes(order.orderSn);
  const isProcessed = order.orderStatus === 'PROCESSED';
  const isLabelPrinted = order.labelPrinted === 1;

  // Shopee holds some READY_TO_SHIP orders ("tertunda"/Menunggu): they report
  // shipByDate === 0 and cannot be processed yet. Detect that so we can disable
  // "Atur Pengiriman" and show a "Tertunda" label instead of letting the staff
  // hit a Shopee error. A genuinely shippable order has a non-zero shipByDate.
  const isHeld = isReadyToShip && (order.shipByDate ?? 0) === 0;

  // Show "Lihat Rincian" only in the "Perlu Dikirim" tab for READY_TO_SHIP / PROCESSED orders
  // (Requirements 1.1, 1.2, 1.3)
  const showLihatRincian =
    activeTab === 'NEED_SHIP' &&
    (order.orderStatus === 'READY_TO_SHIP' || order.orderStatus === 'PROCESSED');

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
              disabled={isHeld}
              title={isHeld ? 'Pesanan tertunda Shopee, belum bisa diproses' : undefined}
              style={{
                width: 14,
                height: 14,
                cursor: isHeld ? 'not-allowed' : 'pointer',
                opacity: isHeld ? 0.4 : 1,
              }}
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
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 45px 100px 120px 110px 140px',
              alignItems: 'flex-start',
              paddingTop: 8,
              borderTop: idx > 0 ? '1px solid var(--bg3)' : 'none',
              marginTop: idx > 0 ? 8 : 0,
            }}>
              {/* Produk + variasi */}
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.4, fontWeight: 500 }}>
                  {item.itemName}
                </div>
                {item.modelName && (
                  <div style={{ fontSize: 11.5, color: 'var(--text4)', marginTop: 2 }}>
                    Variasi: {item.modelName}
                  </div>
                )}
              </div>

              {/* Qty */}
              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text2)', paddingTop: 1 }}>
                ×{item.qty}
              </div>

              {/* Total: hanya tampil di row pertama, sisanya kosong */}
              <div style={{ textAlign: 'right' }}>
                {idx === 0 ? (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', whiteSpace: 'nowrap' }}>
                    {formatRp(order.totalAmount)}
                  </span>
                ) : null}
              </div>

              {/* Status: hanya di row pertama */}
              <div style={{ textAlign: 'center' }}>
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
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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
              <div style={{ textAlign: 'center' }}>
                {idx === 0 && order.orderStatus === 'READY_TO_SHIP' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    {isHeld ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '6px 12px', borderRadius: 6,
                        fontSize: 12, fontWeight: 600,
                        background: 'var(--bg3)', color: 'var(--text4)',
                        cursor: 'not-allowed', whiteSpace: 'nowrap',
                      }}
                      title="Pesanan tertunda Shopee, belum bisa diproses">
                        Tertunda
                      </span>
                    ) : (
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
                    )}
                    {showLihatRincian && (
                      <LihatRincianButton
                        orderSn={order.orderSn}
                        shopId={order.shopId}
                        onClick={() => onLihatRincian(order.orderSn, order.shopId)}
                      />
                    )}
                  </div>
                ) : idx === 0 && order.orderStatus === 'PROCESSED' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <PrintLabelButton
                      orderSn={order.orderSn}
                      labelPrinted={isLabelPrinted}
                      onPrintComplete={() => onPrintComplete()}
                    />
                    {showLihatRincian && (
                      <LihatRincianButton
                        orderSn={order.orderSn}
                        shopId={order.shopId}
                        onClick={() => onLihatRincian(order.orderSn, order.shopId)}
                      />
                    )}
                  </div>
                ) : idx === 0 ? (
                  <span style={{ fontSize: 11.5, color: 'var(--text4)' }}>—</span>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          /* Fallback jika belum ada item detail */
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 45px 100px 120px 110px 140px', alignItems: 'center', paddingTop: 8 }}>
            <div style={{ minWidth: 0, overflow: 'hidden', fontSize: 12, color: 'var(--text4)', fontStyle: 'italic' }}>Data produk belum tersedia</div>
            <div />
            <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>
              {formatRp(order.totalAmount)}
            </div>
            <div style={{ textAlign: 'center' }}>
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
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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
            <div style={{ textAlign: 'center' }}>
              {order.orderStatus === 'READY_TO_SHIP' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  {isHeld ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '6px 12px', borderRadius: 6,
                      fontSize: 12, fontWeight: 600,
                      background: 'var(--bg3)', color: 'var(--text4)',
                      cursor: 'not-allowed', whiteSpace: 'nowrap',
                    }}
                    title="Pesanan tertunda Shopee, belum bisa diproses">
                      Tertunda
                    </span>
                  ) : (
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
                  )}
                  {showLihatRincian && (
                    <LihatRincianButton
                      orderSn={order.orderSn}
                      shopId={order.shopId}
                      onClick={() => onLihatRincian(order.orderSn, order.shopId)}
                    />
                  )}
                </div>
              ) : order.orderStatus === 'PROCESSED' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <PrintLabelButton
                    orderSn={order.orderSn}
                    labelPrinted={isLabelPrinted}
                    onPrintComplete={() => onPrintComplete()}
                  />
                  {showLihatRincian && (
                    <LihatRincianButton
                      orderSn={order.orderSn}
                      shopId={order.shopId}
                      onClick={() => onLihatRincian(order.orderSn, order.shopId)}
                    />
                  )}
                </div>
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
  const { data: ordersData, loading, refetch } = useApi(() => api.orderList(), [], 'orders-list');
  const { data: shopsData } = useApi(() => api.shopeeCredentialsList(), [], 'shops-list');
  const [syncing, setSyncing]         = useState(false);
  const [mainFilter, setMainFilter]   = useState<MainFilter>('NEED_SHIP');
  const [subFilter, setSubFilter]     = useState<SubFilter>('READY_TO_SHIP');
  const [printFilter, setPrintFilter] = useState<PrintFilter>('ALL');
  const [search, setSearch]           = useState('');
  const [shopFilter, setShopFilter]   = useState<string>('all');
  
  // Batch selection state (for shipment)
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // Batch label printing state (for PROCESSED orders)
  const [selectedLabelOrders, setSelectedLabelOrders] = useState<string[]>([]);
  const [batchPrinting, setBatchPrinting] = useState(false);

  // Picking-list-only print loading state (Requirement 6.11)
  const [cetakPesananLoading, setCetakPesananLoading] = useState(false);

  // Derive active tab for FloatingActionBar (Requirements 3.1–3.4)
  const tab = useMemo(() => deriveTab(mainFilter, subFilter), [mainFilter, subFilter]);

  // Order Detail Modal state (Requirements 1.5, 8.2)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderSn, setModalOrderSn] = useState<string | null>(null);

  const handleLihatRincian = (orderSn: string, _shopId: number) => {
    setModalOrderSn(orderSn);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setModalOrderSn(null);
  };

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
    // Exclude held ("tertunda") orders — shipByDate === 0 means Shopee won't let
    // them be processed yet, so they must not be batch-selectable.
    const readyToShipOrders = filtered.filter(
      o => o.orderStatus === 'READY_TO_SHIP' && (o.shipByDate ?? 0) !== 0
    );
    const allSelected = readyToShipOrders.length > 0 && readyToShipOrders.every(o => selectedOrders.includes(o.orderSn));
    
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
      // Split into chunks of 50 (backend limit)
      const CHUNK_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < selectedLabelOrders.length; i += CHUNK_SIZE) {
        chunks.push(selectedLabelOrders.slice(i, i + CHUNK_SIZE));
      }

      const allUrls: string[] = [];
      const allFailedOrders: Array<{ orderSn: string; error: string }> = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const result = await api.orderShippingLabelBatch(chunk);
          if (result.success && (result.data?.url || result.data?.urls)) {
            const urls = result.data.urls || (result.data.url ? [result.data.url] : []);
            allUrls.push(...urls);
          }
          if (result.data?.failedOrders) {
            allFailedOrders.push(...result.data.failedOrders);
          }
        } catch (chunkError: any) {
          console.error(`[PesananSaya] Official label chunk ${i + 1} error:`, chunkError);
          for (const orderSn of chunk) {
            allFailedOrders.push({ orderSn, error: chunkError.message || 'Network error' });
          }
        }

        // Small delay between chunks
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      if (allUrls.length > 0) {
        const orderSnList = [...selectedLabelOrders];
        await printOfficialLabels(allUrls, orderSnList, async () => {
          toast(`${selectedLabelOrders.length - allFailedOrders.length} label asli dibuka di tab baru`, 'success');
          await refetch();
        });
      } else {
        toast('Tidak ada label resmi yang berhasil diambil', 'error');
      }

      if (allFailedOrders.length > 0) {
        toast(`${allFailedOrders.length} order gagal diambil labelnya`, 'warn');
      }
      
      clearLabelSelection();
    } catch (err: any) {
      toast(err.message || 'Terjadi kesalahan saat memproses batch label resmi', 'error');
    } finally {
      setBatchPrinting(false);
    }
  };

  const handlePrintPickingList = async () => {
    // Combine and deduplicate both selections (Requirement 6.10)
    const allSns = [...new Set([...selectedOrders, ...selectedLabelOrders])];
    if (allSns.length === 0) return;

    // Resolve each order SN to the locally cached order (with items) so the
    // picking list works for any status — including READY_TO_SHIP, which has
    // no tracking number and therefore can't go through the label-data API.
    const allOrders: any[] = ordersData?.data || [];
    const orderMap = new Map<string, any>(allOrders.map((o: any) => [o.orderSn, o]));
    const pickingOrders = allSns
      .map((sn) => orderMap.get(sn))
      .filter((o): o is any => Boolean(o));

    setCetakPesananLoading(true);
    try {
      const result = await printPickingListOnly(pickingOrders);
      if (result.successful > 0 && result.failed > 0) {
        // Partial failure: show summary warn toast (Requirements 12.1, 6.7)
        toast(getBatchSummaryMessage(result.successful, result.failed, result.total), 'warn');
      } else if (result.successful > 0) {
        // Full success (Requirement 6.7)
        toast(`Picking list dibuka di tab baru (${result.successful} pesanan)`, 'success');
      }
    } catch (err: any) {
      if (String(err?.message ?? err).toLowerCase().includes('popup')) {
        // Popup blocked (Requirement 6.8)
        toast('Popup diblokir. Izinkan popup untuk mencetak picking list.', 'error');
      } else {
        // General error (Requirements 6.12, 12.2)
        const errorInfo = mapLabelError(err);
        toast(errorInfo.message || 'Gagal mengambil data picking list', 'error');
      }
    } finally {
      // Requirement 6.9: clear Selection_Aktif after action completes (success or failure)
      setSelectedOrders([]);
      setSelectedLabelOrders([]);
      setCetakPesananLoading(false);
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

  // Prune selections when filter changes so stale order SNs don't remain selected
  // Requirements 8.1, 8.2
  // NOTE: This hook MUST be placed before any early return to comply with the
  // Rules of Hooks. We re-derive the visible set from `ordersData` here instead
  // of depending on the post-return `filtered` variable.
  useEffect(() => {
    const allOrders: any[] = ordersData?.data || [];
    const lowerSearch = search.toLowerCase();
    const visibleSet = new Set<string>();
    for (const o of allOrders) {
      // Mirror the shop / test_buyer / main / sub / print / search filter pipeline
      if (o.orderStatus === 'READY_TO_SHIP' && (o.buyerUsername || '').toLowerCase().includes('test_buyer')) continue;
      if (shopFilter !== 'all' && String(o.shopId) !== shopFilter) continue;
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
          if (matchMain && printFilter === 'PRINTED')   matchMain = o.labelPrinted === 1;
          if (matchMain && printFilter === 'UNPRINTED') matchMain = o.labelPrinted !== 1;
        }
      }
      if (!matchMain) continue;
      const matchSearch = o.orderSn.toLowerCase().includes(lowerSearch) ||
                          (o.buyerUsername || '').toLowerCase().includes(lowerSearch);
      if (!matchSearch) continue;
      visibleSet.add(o.orderSn);
    }
    const visibleArr = [...visibleSet];
    setSelectedOrders(prev => pruneSelection(prev, visibleArr));
    setSelectedLabelOrders(prev => pruneSelection(prev, visibleArr));
  }, [mainFilter, subFilter, printFilter, search, shopFilter, ordersData]);

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

  // Prune selections when filter changes so stale order SNs don't remain selected
  // Requirements 8.1, 8.2 — implemented as a top-level effect above the early
  // return for `loading`, so it runs on every render in the same order.

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


      {/* ── ORDER LIST ── */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={48} opacity={0.3} style={{ margin: '0 auto' }} /></div>
          <div className="empty-state-text">Tidak ada pesanan</div>
          <div className="empty-state-sub">Belum ada pesanan yang sesuai dengan filter ini. Coba tarik pesanan terlebih dahulu.</div>
        </div>
      ) : (
        <div>
          {/* Sticky backdrop — covers the 28px page-padding-top so order rows
              that scroll above the column header disappear behind it instead of
              leaking through. Pinned at top:-28, height extends 12px past y=0
              so the column header's rounded corners (which leave transparent
              triangles at the top edges) are also covered. The header paints
              on top in the overlap region; only the rounded-corner triangles
              read through to this backdrop, showing the page background.
              marginBottom matches height so the bar contributes 0 to flow. */}
          <div
            aria-hidden="true"
            style={{
              position: 'sticky',
              top: -28,
              height: 40,
              marginBottom: -40,
              background: 'var(--bg3)',
              zIndex: 9,
            }}
          />

          {/* Sticky column header — matches OrderCard outer chrome so widths align when scrolling */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 45px 100px 120px 110px 140px',
            alignItems: 'center',
            padding: '6px 16px', marginBottom: 6,
            fontSize: 11, fontWeight: 600, color: 'var(--text4)',
            textTransform: 'uppercase', letterSpacing: '.04em',
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            // Soft shadow appears when the header is sticking; keeps rows visually
            // separated from the header so they don't read as "leaking" into it.
            boxShadow: '0 6px 16px -8px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Saat subFilter ALL: 1 checkbox untuk semua order di tab Perlu Dikirim */}
              {mainFilter === 'NEED_SHIP' && subFilter === 'ALL' && (countRts > 0 || countProcessed > 0) && (
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 &&
                    filtered.filter(o => o.orderStatus === 'READY_TO_SHIP' && (o.shipByDate ?? 0) !== 0).every(o => selectedOrders.includes(o.orderSn)) &&
                    filtered.filter(o => o.orderStatus === 'PROCESSED').every(o => selectedLabelOrders.includes(o.orderSn))
                  }
                  onChange={() => {
                    selectAllReadyToShip();
                    selectAllProcessed();
                  }}
                  disabled={batchPrinting}
                  style={{ width: 12, height: 12, cursor: batchPrinting ? 'not-allowed' : 'pointer', opacity: batchPrinting ? 0.6 : 1 }}
                  title="Pilih semua pesanan"
                />
              )}
              {/* Saat subFilter READY_TO_SHIP: checkbox untuk READY_TO_SHIP saja */}
              {countRts > 0 && mainFilter === 'NEED_SHIP' && subFilter === 'READY_TO_SHIP' && (
                <input
                  type="checkbox"
                  checked={filtered.filter(o => o.orderStatus === 'READY_TO_SHIP' && (o.shipByDate ?? 0) !== 0).length > 0 && 
                           filtered.filter(o => o.orderStatus === 'READY_TO_SHIP' && (o.shipByDate ?? 0) !== 0).every(o => selectedOrders.includes(o.orderSn))}
                  onChange={selectAllReadyToShip}
                  style={{ width: 12, height: 12, cursor: 'pointer' }}
                  title="Pilih semua pesanan yang perlu diproses"
                />
              )}
              {/* Saat subFilter PROCESSED: checkbox untuk PROCESSED saja */}
              {countProcessed > 0 && mainFilter === 'NEED_SHIP' && subFilter === 'PROCESSED' && (
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
            <div style={{ textAlign: 'center' }}>Qty</div>
            <div style={{ textAlign: 'right' }}>Total</div>
            <div style={{ textAlign: 'center' }}>Status</div>
            <div style={{ textAlign: 'center' }}>Ekspedisi</div>
            <div style={{ textAlign: 'center' }}>Aksi</div>
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
              activeTab={mainFilter}
              onLihatRincian={handleLihatRincian}
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

      {/* ── ORDER DETAIL MODAL (Requirements 1.5, 2.1–2.6) ── */}
      <OrderDetailModal
        orderSn={modalOrderSn}
        open={modalOpen}
        onClose={handleModalClose}
      />

      {/* ── FLOATING ACTION BAR (Requirements 1.1, 4.1–4.3, 5.1–5.6, 8.4) ── */}
      <FloatingActionBar
        tab={tab}
        selectedShipOrders={selectedOrders}
        selectedLabelOrders={selectedLabelOrders}
        isShipping={false}
        isPrintingLabels={batchPrinting}
        isPrintingPickingList={cetakPesananLoading}
        onAturPengiriman={handleBatchShip}
        onCetakLabelCustom={handleBatchPrintLabels}
        onCetakLabelAsli={handleBatchPrintOfficialLabels}
        onCetakPesanan={handlePrintPickingList}
        onClearSelection={() => { setSelectedOrders([]); setSelectedLabelOrders([]); }}
      />
    </div>
  );
}
