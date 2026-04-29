# Requirements Document: Shipping Label Printing

## Introduction

Fitur ini menambahkan kemampuan untuk mencetak label pengiriman (resi) setelah pengaturan pengiriman dilakukan pada sistem manajemen pesanan Shopee. Pengguna dapat mencetak label secara individual atau dalam batch, baik setelah mengatur pengiriman baru maupun untuk pesanan yang sudah dalam status PROCESSED.

## Glossary

- **System**: Sistem manajemen pesanan Shopee yang terdiri dari frontend React dan backend Node.js
- **Shipping_Label_Service**: Layanan backend yang menangani permintaan pencetakan label pengiriman
- **Label_Print_UI**: Komponen antarmuka pengguna untuk memicu pencetakan label
- **Shopee_API**: API eksternal Shopee untuk mengambil data label pengiriman
- **Order**: Pesanan Shopee dengan status tertentu dalam database lokal
- **READY_TO_SHIP**: Status pesanan yang siap untuk diatur pengirimannya
- **PROCESSED**: Status pesanan yang pengirimannya sudah diatur
- **Shipment_Method**: Metode pengiriman yang dipilih (pickup atau dropoff)
- **Tracking_Number**: Nomor resi pengiriman yang diberikan oleh Shopee
- **Batch_Operation**: Operasi yang dilakukan pada beberapa pesanan sekaligus
- **Print_Dialog**: Dialog sistem operasi untuk mencetak dokumen
- **Label_Document**: Dokumen label pengiriman dalam format yang dapat dicetak (PDF atau gambar)

## Requirements

### Requirement 1: Print Label After Shipment Arrangement

**User Story:** Sebagai penjual, saya ingin mencetak label pengiriman setelah mengatur metode pengiriman, sehingga saya dapat langsung menyiapkan paket untuk dikirim.

#### Acceptance Criteria

1. WHEN pengguna berhasil mengatur pengiriman untuk satu pesanan, THEN THE Label_Print_UI SHALL menampilkan opsi untuk mencetak label pengiriman
2. WHEN pengguna memilih opsi cetak label, THEN THE System SHALL mengambil data label pengiriman dari Shopee_API
3. WHEN data label berhasil diambil, THEN THE System SHALL membuka Print_Dialog dengan Label_Document yang siap dicetak
4. IF pengambilan data label gagal, THEN THE System SHALL menampilkan pesan error yang deskriptif kepada pengguna
5. THE Label_Print_UI SHALL menampilkan indikator loading selama proses pengambilan dan persiapan label

### Requirement 2: Single Order Label Printing

**User Story:** Sebagai penjual, saya ingin mencetak label pengiriman untuk satu pesanan, sehingga saya dapat memproses pesanan secara individual.

#### Acceptance Criteria

1. WHEN pesanan berada dalam status PROCESSED, THEN THE Label_Print_UI SHALL menampilkan tombol "Cetak Label" pada kartu pesanan
2. WHEN pengguna mengklik tombol "Cetak Label", THEN THE Shipping_Label_Service SHALL memvalidasi bahwa pesanan memiliki Tracking_Number
3. WHEN Tracking_Number valid, THEN THE Shipping_Label_Service SHALL memanggil Shopee_API untuk mendapatkan Label_Document
4. WHEN Label_Document diterima, THEN THE System SHALL membuka Print_Dialog dengan dokumen tersebut
5. IF pesanan tidak memiliki Tracking_Number, THEN THE System SHALL menampilkan pesan error "Label pengiriman belum tersedia untuk pesanan ini"

### Requirement 3: Batch Label Printing

**User Story:** Sebagai penjual, saya ingin mencetak label pengiriman untuk beberapa pesanan sekaligus, sehingga saya dapat menghemat waktu dalam memproses banyak pesanan.

#### Acceptance Criteria

1. WHEN pengguna memilih beberapa pesanan dengan status PROCESSED, THEN THE Label_Print_UI SHALL menampilkan tombol "Cetak Label Batch"
2. WHEN pengguna mengklik tombol "Cetak Label Batch", THEN THE System SHALL memvalidasi bahwa semua pesanan terpilih memiliki Tracking_Number
3. WHEN semua pesanan valid, THEN THE Shipping_Label_Service SHALL mengambil Label_Document untuk setiap pesanan secara berurutan
4. WHEN semua Label_Document berhasil diambil, THEN THE System SHALL menggabungkan dokumen menjadi satu Label_Document dan membuka Print_Dialog
5. IF beberapa pesanan gagal diambil labelnya, THEN THE System SHALL menampilkan ringkasan dengan jumlah berhasil dan gagal
6. THE System SHALL menampilkan progress indicator selama proses pengambilan batch label
7. THE Batch_Operation SHALL memproses maksimal 50 pesanan dalam satu batch

### Requirement 4: Label Printing for READY_TO_SHIP Orders

**User Story:** Sebagai penjual, saya ingin opsi untuk langsung mencetak label setelah mengatur pengiriman dari status READY_TO_SHIP, sehingga saya dapat menyelesaikan proses dalam satu langkah.

#### Acceptance Criteria

1. WHEN pengguna mengatur pengiriman untuk pesanan READY_TO_SHIP, THEN THE System SHALL menampilkan dialog konfirmasi dengan opsi "Cetak Label Sekarang"
2. WHEN pengguna memilih "Cetak Label Sekarang", THEN THE System SHALL menunggu hingga status pesanan berubah menjadi PROCESSED
3. WHEN status berubah menjadi PROCESSED, THEN THE System SHALL otomatis memulai proses pencetakan label
4. WHEN pengguna tidak memilih opsi cetak, THEN THE System SHALL menutup dialog dan menampilkan notifikasi sukses pengaturan pengiriman
5. THE System SHALL menampilkan loading indicator selama menunggu perubahan status dan pengambilan label

### Requirement 5: Batch Shipment with Label Printing

**User Story:** Sebagai penjual, saya ingin mengatur pengiriman dan mencetak label untuk beberapa pesanan sekaligus, sehingga saya dapat memproses banyak pesanan dengan efisien.

#### Acceptance Criteria

1. WHEN pengguna memilih beberapa pesanan READY_TO_SHIP dan mengklik "Atur Pengiriman Batch", THEN THE System SHALL menampilkan dialog pemilihan Shipment_Method dengan opsi "Cetak Label Setelah Selesai"
2. WHEN pengguna memilih Shipment_Method dan mengaktifkan opsi cetak label, THEN THE System SHALL memproses pengaturan pengiriman untuk semua pesanan
3. WHEN semua pengaturan pengiriman selesai, THEN THE System SHALL otomatis memulai proses pencetakan label batch
4. WHEN proses batch selesai, THEN THE System SHALL menampilkan ringkasan dengan jumlah pesanan yang berhasil diatur dan berhasil dicetak labelnya
5. IF beberapa pesanan gagal, THEN THE System SHALL menampilkan daftar pesanan yang gagal dengan alasan kegagalan
6. THE System SHALL menampilkan progress indicator untuk kedua proses (pengaturan pengiriman dan pencetakan label)

### Requirement 6: Shopee API Integration for Label Retrieval

**User Story:** Sebagai sistem, saya perlu mengambil data label pengiriman dari Shopee API, sehingga label yang dicetak akurat dan sesuai dengan data Shopee.

#### Acceptance Criteria

1. THE Shipping_Label_Service SHALL menggunakan endpoint Shopee API `/api/v2/logistics/get_shipping_document_parameter` untuk mendapatkan parameter dokumen pengiriman
2. THE Shipping_Label_Service SHALL menggunakan endpoint Shopee API `/api/v2/logistics/get_shipping_document_result` untuk mendapatkan Label_Document
3. WHEN memanggil Shopee_API, THE Shipping_Label_Service SHALL menyertakan order_sn dan shop_id yang valid
4. WHEN Shopee_API mengembalikan error autentikasi, THEN THE Shipping_Label_Service SHALL mencoba refresh token dan retry request
5. WHEN Shopee_API mengembalikan error rate limit, THEN THE Shipping_Label_Service SHALL menunggu 2 detik dan retry maksimal 3 kali
6. THE Shipping_Label_Service SHALL menangani timeout dengan batas waktu 10 detik per request
7. THE Shipping_Label_Service SHALL mencatat semua error dari Shopee_API ke log dengan timestamp dan detail pesanan

### Requirement 7: Label Document Format Handling

**User Story:** Sebagai sistem, saya perlu menangani berbagai format label pengiriman dari Shopee, sehingga pengguna dapat mencetak label dalam format apapun yang diberikan.

#### Acceptance Criteria

1. WHEN Shopee_API mengembalikan Label_Document dalam format PDF, THEN THE System SHALL membuka dokumen dalam tab browser baru dengan opsi cetak
2. WHEN Shopee_API mengembalikan Label_Document dalam format gambar (PNG atau JPG), THEN THE System SHALL menampilkan gambar dalam modal dengan tombol cetak
3. WHEN Shopee_API mengembalikan URL dokumen, THEN THE System SHALL mengunduh dokumen terlebih dahulu sebelum membuka Print_Dialog
4. THE System SHALL memvalidasi bahwa Label_Document yang diterima tidak kosong dan memiliki format yang valid
5. IF format Label_Document tidak didukung, THEN THE System SHALL menampilkan pesan error "Format label tidak didukung" dan menyediakan link download manual

### Requirement 8: UI Integration in Order Card

**User Story:** Sebagai penjual, saya ingin melihat tombol cetak label langsung di kartu pesanan, sehingga saya dapat dengan mudah mengakses fitur pencetakan.

#### Acceptance Criteria

1. WHEN pesanan berada dalam status PROCESSED, THEN THE Label_Print_UI SHALL menampilkan tombol "Cetak Label" di sebelah informasi jasa kirim
2. THE tombol "Cetak Label" SHALL menggunakan ikon printer untuk kemudahan identifikasi visual
3. WHEN tombol diklik, THE Label_Print_UI SHALL menampilkan loading indicator pada tombol
4. WHEN proses pencetakan selesai atau gagal, THE Label_Print_UI SHALL menghilangkan loading indicator
5. THE tombol SHALL disabled WHEN proses pencetakan sedang berlangsung untuk pesanan tersebut
6. THE Label_Print_UI SHALL menampilkan tooltip "Cetak Label Pengiriman" WHEN pengguna hover pada tombol

### Requirement 9: Batch Selection UI Enhancement

**User Story:** Sebagai penjual, saya ingin memilih pesanan PROCESSED untuk dicetak labelnya secara batch, sehingga saya dapat mencetak banyak label sekaligus.

#### Acceptance Criteria

1. WHEN pengguna berada di tab "Perlu Dikirim" dengan sub-filter "Telah Diproses", THEN THE Label_Print_UI SHALL menampilkan checkbox pada setiap kartu pesanan PROCESSED
2. WHEN pengguna memilih satu atau lebih pesanan PROCESSED, THEN THE Label_Print_UI SHALL menampilkan action bar dengan tombol "Cetak Label Batch"
3. THE action bar SHALL menampilkan jumlah pesanan yang dipilih
4. WHEN tidak ada pesanan yang dipilih, THEN THE action bar SHALL tersembunyi
5. THE Label_Print_UI SHALL menyediakan tombol "Pilih Semua" untuk memilih semua pesanan PROCESSED yang terlihat
6. WHEN batch printing sedang berlangsung, THEN THE checkbox SHALL disabled untuk mencegah perubahan seleksi

### Requirement 10: Error Handling and User Feedback

**User Story:** Sebagai penjual, saya ingin mendapatkan informasi yang jelas ketika pencetakan label gagal, sehingga saya tahu apa yang harus dilakukan.

#### Acceptance Criteria

1. WHEN pencetakan label gagal karena error jaringan, THEN THE System SHALL menampilkan pesan "Koneksi gagal. Silakan coba lagi"
2. WHEN pencetakan label gagal karena error autentikasi, THEN THE System SHALL menampilkan pesan "Sesi Shopee berakhir. Silakan hubungkan ulang toko Anda"
3. WHEN pencetakan label gagal karena label belum tersedia di Shopee, THEN THE System SHALL menampilkan pesan "Label pengiriman belum tersedia. Silakan coba lagi dalam beberapa menit"
4. WHEN pencetakan batch selesai dengan beberapa kegagalan, THEN THE System SHALL menampilkan modal ringkasan dengan daftar pesanan yang gagal dan alasan kegagalan
5. THE System SHALL menyediakan tombol "Coba Lagi" untuk pesanan yang gagal dalam batch operation
6. THE System SHALL menampilkan toast notification sukses WHEN label berhasil dicetak dengan pesan "Label berhasil dicetak untuk pesanan #[order_sn]"

### Requirement 11: Backend API Endpoints

**User Story:** Sebagai frontend, saya memerlukan API endpoints untuk mengambil dan mencetak label pengiriman, sehingga saya dapat mengintegrasikan fitur pencetakan di UI.

#### Acceptance Criteria

1. THE System SHALL menyediakan endpoint `GET /api/orders/:orderSn/shipping-label` untuk mendapatkan label satu pesanan
2. THE System SHALL menyediakan endpoint `POST /api/orders/shipping-labels/batch` untuk mendapatkan label beberapa pesanan
3. THE endpoint single label SHALL mengembalikan response dengan format `{ success: boolean, data: { url: string, format: string }, message?: string }`
4. THE endpoint batch label SHALL menerima body `{ order_sns: string[] }` dengan maksimal 50 order_sn
5. THE endpoint batch label SHALL mengembalikan response dengan format `{ success: boolean, data: { results: Array<{ orderSn: string, success: boolean, url?: string, format?: string, error?: string }> } }`
6. THE endpoints SHALL memvalidasi bahwa order_sn yang diminta ada dalam database dan memiliki status PROCESSED
7. THE endpoints SHALL mengembalikan HTTP 404 IF pesanan tidak ditemukan
8. THE endpoints SHALL mengembalikan HTTP 422 IF pesanan tidak dalam status PROCESSED

### Requirement 12: Logging and Monitoring

**User Story:** Sebagai developer, saya ingin mencatat semua aktivitas pencetakan label, sehingga saya dapat memantau penggunaan fitur dan men-debug masalah.

#### Acceptance Criteria

1. THE Shipping_Label_Service SHALL mencatat setiap request pencetakan label dengan timestamp, order_sn, dan shop_id
2. THE Shipping_Label_Service SHALL mencatat hasil setiap request (sukses atau gagal) dengan detail error jika gagal
3. WHEN batch operation dilakukan, THE Shipping_Label_Service SHALL mencatat ringkasan batch dengan jumlah total, sukses, dan gagal
4. THE log SHALL menggunakan format JSON untuk memudahkan parsing dan analisis
5. THE log SHALL menyertakan user identifier IF tersedia untuk tracking aktivitas per pengguna
6. THE System SHALL mencatat waktu respons Shopee_API untuk monitoring performa

### Requirement 13: Caching and Performance

**User Story:** Sebagai sistem, saya ingin mengoptimalkan performa pengambilan label, sehingga pengguna mendapatkan respons yang cepat.

#### Acceptance Criteria

1. THE Shipping_Label_Service SHALL menyimpan Label_Document yang sudah diambil dalam cache selama 24 jam
2. WHEN label diminta untuk pesanan yang sama dalam 24 jam, THEN THE Shipping_Label_Service SHALL mengembalikan Label_Document dari cache
3. THE cache SHALL menggunakan order_sn sebagai key
4. THE System SHALL membersihkan cache entry WHEN pesanan berubah status
5. WHEN batch operation dilakukan, THE Shipping_Label_Service SHALL memproses request secara paralel dengan maksimal 5 concurrent requests
6. THE System SHALL menerapkan rate limiting 10 requests per detik untuk mencegah overload Shopee_API

### Requirement 14: Mobile Responsiveness

**User Story:** Sebagai penjual yang menggunakan tablet atau mobile, saya ingin dapat mencetak label dengan mudah di perangkat mobile, sehingga saya dapat bekerja dari mana saja.

#### Acceptance Criteria

1. WHEN pengguna mengakses sistem dari perangkat mobile, THEN THE Label_Print_UI SHALL menampilkan tombol cetak label dengan ukuran yang sesuai untuk touch interface
2. THE action bar untuk batch printing SHALL responsive dan tidak overlap dengan konten lain di layar mobile
3. WHEN Print_Dialog dibuka di mobile, THE System SHALL menampilkan opsi untuk membuka label di aplikasi eksternal atau menyimpan sebagai file
4. THE progress indicator untuk batch operation SHALL terlihat jelas di layar mobile
5. THE modal ringkasan batch SHALL scrollable dan mudah dibaca di layar mobile

### Requirement 15: Accessibility and Internationalization

**User Story:** Sebagai penjual, saya ingin antarmuka pencetakan label menggunakan bahasa Indonesia yang konsisten, sehingga saya dapat memahami setiap instruksi dengan jelas.

#### Acceptance Criteria

1. THE Label_Print_UI SHALL menggunakan bahasa Indonesia untuk semua label, tombol, dan pesan
2. THE tombol cetak label SHALL memiliki aria-label "Cetak Label Pengiriman" untuk screen reader
3. THE loading indicator SHALL memiliki aria-live region untuk memberitahu screen reader tentang status proses
4. THE error messages SHALL menggunakan bahasa yang jelas dan tidak mengandung istilah teknis yang sulit dipahami
5. THE System SHALL menggunakan format tanggal dan waktu Indonesia (dd MMM yyyy, HH:mm) dalam log dan UI
