export interface ResiHarian {
  tanggal: string;
  admin: string;
  no: number;
  tipeProduk: string;
  noResi: string;
  namaBarang: string;
  ongkirDasar: number;
  ongkirFinal: number;
  metodeBayarOngkir: string;
  amplop: number;
  packing: number;
  lainnya: number;
  totalBiaya: number;
  metodeBayarLainnya: string;
  keterangan: string;
}

export interface DetailSerahTerima {
  noResi: string;
  waktuPemesanan: string;
  metodePerhitungan: string;
}

export interface AuditItem {
  noResi: string;
  waktuPemesanan: string;
  metodePerhitungan: string;
  isWajibInput: boolean;
  status: 'MATCH' | 'MISSING_IN_ADMIN' | 'UNEXPECTED_ADMIN_INPUT';
  adminRecord?: ResiHarian;
}

export interface AuditSummary {
  totalWajibInput: number;
  totalTerinput: number;
  totalBelumTerinput: number;
  setoranTunaiLaporan: number;
  kasOperasional: number;
  amplopTotal: number;
  packingTotal: number;
  nonTunaiTotal: number;
}

export interface AppSettings {
  spreadsheetId: string;
  appsScriptUrl: string;
  useMockData: boolean;
}
