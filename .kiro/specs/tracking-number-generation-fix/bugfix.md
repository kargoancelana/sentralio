# Bugfix Requirements Document

## Introduction

Bug ini terjadi pada fitur pencetakan label pengiriman dimana tracking number belum di-generate setelah user memilih metode pengiriman (drop off atau pick up). Akibatnya, ketika user mencoba mencetak label, proses gagal karena tracking number belum tersedia dari Shopee API. Bug ini mempengaruhi workflow pengaturan pengiriman dan pencetakan label, menyebabkan user harus menunggu atau retry secara manual untuk mendapatkan tracking number.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN user memilih metode pengiriman (pickup atau dropoff) untuk pesanan READY_TO_SHIP THEN sistem langsung mengubah status pesanan menjadi PROCESSED tanpa menunggu tracking number tersedia dari Shopee API

1.2 WHEN user mengklik tombol "Cetak Label" setelah pengaturan pengiriman THEN sistem memanggil `getSingleLabel()` yang mencoba mengambil tracking number, tetapi tracking number belum tersedia karena proses asynchronous di Shopee belum selesai

1.3 WHEN `getSingleLabel()` dipanggil dan tracking number belum tersedia THEN sistem gagal membuat shipping document dan menampilkan error kepada user

1.4 WHEN batch shipment dengan opsi "print after shipment" diaktifkan THEN sistem langsung mencoba mencetak label untuk pesanan yang baru diatur pengirimannya, tetapi tracking number belum tersedia sehingga batch printing gagal

### Expected Behavior (Correct)

2.1 WHEN user memilih metode pengiriman (pickup atau dropoff) untuk pesanan READY_TO_SHIP THEN sistem SHALL memanggil Shopee API untuk mengatur pengiriman DAN menunggu hingga tracking number tersedia sebelum mengubah status menjadi PROCESSED

2.2 WHEN sistem menunggu tracking number dari Shopee API THEN sistem SHALL melakukan polling dengan retry maksimal 15 kali dengan interval 2 detik (total 30 detik timeout)

2.3 WHEN tracking number berhasil diperoleh dari Shopee API THEN sistem SHALL menyimpan tracking number ke database (field `shippingCarrier`) DAN mengubah status pesanan menjadi PROCESSED

2.4 WHEN timeout tercapai dan tracking number belum tersedia THEN sistem SHALL menampilkan error message yang jelas kepada user: "Tracking number belum tersedia setelah 30 detik. Silakan coba lagi nanti" DAN tidak mengubah status pesanan

2.5 WHEN batch shipment dengan opsi "print after shipment" diaktifkan THEN sistem SHALL memastikan tracking number tersedia untuk setiap pesanan sebelum memulai proses batch printing

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user mengatur pengiriman untuk pesanan yang sudah memiliki tracking number THEN sistem SHALL CONTINUE TO mengubah status menjadi PROCESSED tanpa delay tambahan

3.2 WHEN user mencetak label untuk pesanan PROCESSED yang sudah memiliki tracking number THEN sistem SHALL CONTINUE TO langsung mengambil label dari cache atau Shopee API tanpa delay tambahan

3.3 WHEN Shopee API mengembalikan error selain "tracking number not ready" (misalnya auth error, rate limit) THEN sistem SHALL CONTINUE TO menangani error tersebut sesuai dengan error handling yang sudah ada

3.4 WHEN user mengatur pengiriman batch tanpa opsi "print after shipment" THEN sistem SHALL CONTINUE TO memproses pengaturan pengiriman secara paralel dengan rate limiting yang sudah ada

3.5 WHEN label sudah ada di cache THEN sistem SHALL CONTINUE TO mengembalikan label dari cache tanpa memanggil Shopee API

3.6 WHEN user membatalkan operasi pengaturan pengiriman THEN sistem SHALL CONTINUE TO tidak mengubah status pesanan dan menampilkan notifikasi pembatalan

