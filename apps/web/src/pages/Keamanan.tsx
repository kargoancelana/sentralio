/**
 * Keamanan — Public trust page explaining Sentralio's security posture.
 *
 * This page is accessible WITHOUT authentication and makes NO API calls.
 * All claims are backed by evidence in docs/security-checklist.md.
 *
 * Requirements: Issue #237 (Fase 8.3)
 */

export function Keamanan() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg3)',
        padding: '40px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          backgroundColor: 'var(--bg1)',
          borderRadius: '8px',
          padding: '48px 40px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--text1)',
              marginBottom: '12px',
            }}
          >
            Keamanan & Privasi Data
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Kami memahami bahwa data bisnis Anda sangat berharga. Berikut adalah jaminan keamanan
            yang kami terapkan di Sentralio.
          </p>
        </div>

        {/* Section 1: Isolasi Data */}
        <section style={{ marginBottom: '40px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'var(--text1)',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '2px solid var(--primary)',
            }}
          >
            🔒 Data Anda Terisolasi Sepenuhnya
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text2)', lineHeight: '1.7', marginBottom: '12px' }}>
            Setiap akun Sentralio memiliki <strong>ruang data terpisah</strong>. Sistem kami
            memastikan bahwa data produk, pesanan, dan toko Anda <strong>tidak akan pernah terlihat</strong> oleh
            pengguna akun lain — bahkan jika mereka menggunakan toko Shopee yang sama.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Isolasi ini diverifikasi melalui <strong>41 test otomatis</strong> yang berjalan setiap kali
            kami melakukan pembaruan sistem.
          </p>
        </section>

        {/* Section 2: Password Tidak Bisa Kami Lihat */}
        <section style={{ marginBottom: '40px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'var(--text1)',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '2px solid var(--primary)',
            }}
          >
            🔐 Password Tidak Bisa Kami Lihat
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text2)', lineHeight: '1.7', marginBottom: '12px' }}>
            Password Anda <strong>tidak pernah disimpan dalam bentuk teks asli</strong>. Saat Anda
            membuat atau mengubah password, sistem kami mengubahnya menjadi kode acak yang tidak bisa dikembalikan
            ke bentuk semula (proses ini disebut <em>hashing</em>).
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Bahkan admin Sentralio tidak memiliki cara untuk melihat password Anda. Jika Anda lupa
            password, satu-satunya cara adalah mereset dan membuat yang baru.
          </p>
        </section>

        {/* Section 3: Token Shopee Dienkripsi */}
        <section style={{ marginBottom: '40px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'var(--text1)',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '2px solid var(--primary)',
            }}
          >
            🛡️ Token Shopee Dienkripsi
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text2)', lineHeight: '1.7', marginBottom: '12px' }}>
            Saat Anda menghubungkan toko Shopee, sistem kami menyimpan <strong>token akses terenkripsi</strong> untuk
            berkomunikasi dengan API Shopee atas nama Anda. Token ini dienkripsi menggunakan
            standar industri <strong>AES-256-GCM</strong> sebelum disimpan ke database.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Enkripsi ini melindungi token Anda dari akses tidak sah, bahkan jika seseorang mendapatkan
            akses ke backup database.
          </p>
        </section>

        {/* Section 4: Perlindungan Kepemilikan Toko */}
        <section style={{ marginBottom: '40px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'var(--text1)',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '2px solid var(--primary)',
            }}
          >
            🏪 Perlindungan Kepemilikan Toko
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text2)', lineHeight: '1.7', marginBottom: '12px' }}>
            Satu toko Shopee <strong>hanya bisa terhubung ke satu akun Sentralio</strong> pada satu waktu.
            Sistem kami mencegah konflik kepemilikan dan memastikan tidak ada orang lain yang bisa
            "membajak" akses toko Anda.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Jika ada upaya menghubungkan toko yang sudah aktif di akun lain, sistem akan menolak
            secara otomatis.
          </p>
        </section>

        {/* Section 5: Audit Log */}
        <section style={{ marginBottom: '40px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'var(--text1)',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '2px solid var(--primary)',
            }}
          >
            📋 Jejak Audit untuk Aksi Sensitif
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text2)', lineHeight: '1.7', marginBottom: '12px' }}>
            Setiap aksi sensitif di sistem (seperti perubahan akun, pengelolaan pengguna, atau
            modifikasi data penting) dicatat secara otomatis ke <strong>log audit</strong> yang tidak bisa
            diubah atau dihapus oleh pengguna biasa.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Log ini mencatat siapa yang melakukan apa, kapan, dan dari IP address mana — memberikan
            transparansi dan akuntabilitas penuh.
          </p>
        </section>

        {/* Footer */}
        <div
          style={{
            marginTop: '56px',
            paddingTop: '24px',
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', lineHeight: '1.6' }}>
            Jaminan keamanan di atas adalah komitmen kami untuk melindungi bisnis Anda.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text3)', marginTop: '12px' }}>
            Punya pertanyaan soal keamanan? Hubungi kami di{' '}
            <a
              href="mailto:support@sentralio.com"
              style={{ color: 'var(--primary)', textDecoration: 'none' }}
            >
              support@sentralio.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
