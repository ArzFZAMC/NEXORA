/** Quest pribadi baru perlu dihitung ulang progresnya dari aktivitas yang sudah selesai; progres dihitung server
 *  (refresh_progress) saat ada aktivitas selesai berikutnya, sehingga setelah dibuat kita cukup memuat ulang data. */
export async function refreshQuestsAfterCreate(refresh: () => Promise<void>): Promise<void> {
  await refresh();
}
