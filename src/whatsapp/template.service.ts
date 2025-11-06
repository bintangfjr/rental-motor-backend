import { Injectable } from '@nestjs/common';
import * as moment from 'moment';

// ✅ DEFINE INTERFACES untuk type safety
export interface ReminderTemplateData {
  nama: string;
  motor: string;
  plat: string;
  jatuh_tempo: string;
  sisa_waktu: string;
}

export interface AlertTemplateData {
  nama: string;
  motor: string;
  plat: string;
  jatuh_tempo: string;
  keterlambatan: string;
  whatsapp?: string;
}

export interface RemainingTimeResult {
  text: string;
  totalMenit: number;
}

export interface DefaultTemplates {
  reminder: string;
  alert: string;
}

@Injectable()
export class TemplateService {
  // ✅ TYPE SAFE method dengan interface
  compileReminderTemplate(
    template: string,
    data: ReminderTemplateData,
  ): string {
    if (!template || typeof template !== 'string') {
      throw new Error('Template must be a non-empty string');
    }

    // ✅ VALIDASI data yang diperlukan
    this.validateReminderData(data);

    return template
      .replace(/{nama}/g, data.nama)
      .replace(/{motor}/g, data.motor)
      .replace(/{plat}/g, data.plat)
      .replace(/{jatuh_tempo}/g, data.jatuh_tempo)
      .replace(/{sisa_waktu}/g, data.sisa_waktu);
  }

  // ✅ TYPE SAFE method dengan interface
  compileAlertTemplate(template: string, data: AlertTemplateData): string {
    if (!template || typeof template !== 'string') {
      throw new Error('Template must be a non-empty string');
    }

    // ✅ VALIDASI data yang diperlukan
    this.validateAlertData(data);

    let compiled = template
      .replace(/{nama}/g, data.nama)
      .replace(/{motor}/g, data.motor)
      .replace(/{plat}/g, data.plat)
      .replace(/{jatuh_tempo}/g, data.jatuh_tempo)
      .replace(/{keterlambatan}/g, data.keterlambatan);

    if (data.whatsapp) {
      compiled = compiled.replace(/{whatsapp}/g, data.whatsapp);
    }

    return compiled;
  }

  // ✅ IMPROVED dengan handle edge cases
  formatRemainingTime(tglKembali: Date): RemainingTimeResult {
    if (!(tglKembali instanceof Date) || isNaN(tglKembali.getTime())) {
      throw new Error('Invalid date provided to formatRemainingTime');
    }

    const returnTime = moment(tglKembali);
    const now = moment();

    if (!returnTime.isValid()) {
      throw new Error('Invalid return time date');
    }

    const diff = moment.duration(returnTime.diff(now));
    const totalMenit = Math.floor(diff.asMinutes());

    // ✅ HANDLE negative time (sudah lewat)
    if (totalMenit < 0) {
      return {
        text: 'waktu telah habis',
        totalMenit: 0,
      };
    }

    const jam = Math.floor(totalMenit / 60);
    const menit = totalMenit % 60;

    let waktuText = '';

    // ✅ IMPROVED logic untuk format yang lebih natural
    if (jam > 0) {
      waktuText += `${jam} jam`;
    }

    if (menit > 0) {
      if (waktuText) waktuText += ' ';
      waktuText += `${menit} menit`;
    }

    // ✅ HANDLE edge cases dengan lebih baik
    if (totalMenit === 0) {
      waktuText = 'waktu habis';
    } else if (totalMenit < 5) {
      waktuText = 'hampir habis';
    } else if (totalMenit < 30) {
      waktuText = 'kurang dari 30 menit';
    } else if (totalMenit < 120) {
      waktuText = 'kurang dari 2 jam';
    }

    // ✅ FALLBACK jika masih kosong
    if (!waktuText) {
      waktuText = `${totalMenit} menit`;
    }

    return {
      text: waktuText.trim(),
      totalMenit,
    };
  }

  // ✅ IMPROVED dengan better formatting
  formatOverdueTime(tglKembali: Date): string {
    if (!(tglKembali instanceof Date) || isNaN(tglKembali.getTime())) {
      throw new Error('Invalid date provided to formatOverdueTime');
    }

    const jatuhTempo = moment(tglKembali);
    const now = moment();

    if (!jatuhTempo.isValid()) {
      throw new Error('Invalid jatuh tempo date');
    }

    const diff = moment.duration(now.diff(jatuhTempo));
    const totalMenit = Math.floor(diff.asMinutes());

    // ✅ HANDLE jika belum lewat
    if (totalMenit <= 0) {
      return '0 menit';
    }

    const hari = Math.floor(totalMenit / (24 * 60));
    const jam = Math.floor((totalMenit % (24 * 60)) / 60);
    const menit = totalMenit % 60;

    // ✅ IMPROVED formatting untuk readability
    const parts: string[] = [];

    if (hari > 0) {
      parts.push(`${hari} hari`);
    }

    if (jam > 0) {
      parts.push(`${jam} jam`);
    }

    if (menit > 0 || parts.length === 0) {
      parts.push(`${menit} menit`);
    }

    return parts.join(' ').trim();
  }

  // ✅ TYPE SAFE return value
  getDefaultTemplates(): DefaultTemplates {
    return {
      reminder:
        'Halo {nama}! Ini adalah pengingat bahwa sewa motor {motor} (Plat: {plat}) akan jatuh tempo pada {jatuh_tempo}. Sisa waktu: {sisa_waktu}. Harap siapkan pengembalian motor tepat waktu. Terima kasih.',
      alert:
        'PERINGATAN: Sewa motor {motor} (Plat: {plat}) oleh {nama} telah lewat jatuh tempo sejak {jatuh_tempo}. Keterlambatan: {keterlambatan}. Segera tindak lanjuti!',
    };
  }

  // ✅ PRIVATE VALIDATION METHODS untuk type safety
  private validateReminderData(data: ReminderTemplateData): void {
    const requiredFields: (keyof ReminderTemplateData)[] = [
      'nama',
      'motor',
      'plat',
      'jatuh_tempo',
      'sisa_waktu',
    ];

    for (const field of requiredFields) {
      if (!data[field] || typeof data[field] !== 'string') {
        throw new Error(`Missing or invalid required field: ${field}`);
      }
    }
  }

  private validateAlertData(data: AlertTemplateData): void {
    const requiredFields: (keyof AlertTemplateData)[] = [
      'nama',
      'motor',
      'plat',
      'jatuh_tempo',
      'keterlambatan',
    ];

    for (const field of requiredFields) {
      if (!data[field] || typeof data[field] !== 'string') {
        throw new Error(`Missing or invalid required field: ${field}`);
      }
    }

    // ✅ Optional field validation
    if (data.whatsapp && typeof data.whatsapp !== 'string') {
      throw new Error('whatsapp field must be a string if provided');
    }
  }
}
