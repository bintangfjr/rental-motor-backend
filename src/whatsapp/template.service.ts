import { Injectable } from '@nestjs/common';
import * as moment from 'moment';

@Injectable()
export class TemplateService {
  compileReminderTemplate(
    template: string,
    data: {
      nama: string;
      motor: string;
      plat: string;
      jatuh_tempo: string;
      sisa_waktu: string;
    },
  ): string {
    return template
      .replace(/{nama}/g, data.nama)
      .replace(/{motor}/g, data.motor)
      .replace(/{plat}/g, data.plat)
      .replace(/{jatuh_tempo}/g, data.jatuh_tempo)
      .replace(/{sisa_waktu}/g, data.sisa_waktu);
  }

  compileAlertTemplate(
    template: string,
    data: {
      nama: string;
      motor: string;
      plat: string;
      jatuh_tempo: string;
      keterlambatan: string;
      whatsapp?: string;
    },
  ): string {
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

  formatRemainingTime(tglKembali: Date): { text: string; totalMenit: number } {
    const returnTime = moment(tglKembali);
    const now = moment();
    const diff = moment.duration(returnTime.diff(now));

    const totalMenit = Math.floor(diff.asMinutes());
    const jam = Math.floor(totalMenit / 60);
    const menit = totalMenit % 60;

    let waktuText = '';
    if (jam > 0) {
      waktuText += `${jam} jam `;
    }
    if (menit > 0) {
      waktuText += `${menit} menit`;
    }

    if (totalMenit < 120 && totalMenit > 0) {
      waktuText = 'kurang dari 2 jam';
    }

    return { text: waktuText.trim(), totalMenit };
  }

  formatOverdueTime(tglKembali: Date): string {
    const jatuhTempo = moment(tglKembali);
    const now = moment();
    const diff = moment.duration(now.diff(jatuhTempo));

    const totalMenit = Math.floor(diff.asMinutes());
    const hari = Math.floor(totalMenit / (24 * 60));
    const jam = Math.floor((totalMenit % (24 * 60)) / 60);
    const menit = totalMenit % 60;

    let keterlambatanText = '';
    if (hari > 0) keterlambatanText += `${hari} hari `;
    if (jam > 0) keterlambatanText += `${jam} jam `;
    if (menit > 0) keterlambatanText += `${menit} menit`;

    return keterlambatanText.trim();
  }

  getDefaultTemplates() {
    return {
      reminder:
        'Halo {nama}! Ini adalah pengingat bahwa sewa motor {motor} (Plat: {plat}) akan jatuh tempo pada {jatuh_tempo}. Sisa waktu: {sisa_waktu}. Harap siapkan pengembalian motor tepat waktu. Terima kasih.',
      alert:
        'PERINGATAN: Sewa motor {motor} (Plat: {plat}) oleh {nama} telah lewat jatuh tempo sejak {jatuh_tempo}. Keterlambatan: {keterlambatan}. Segera tindak lanjuti!',
    };
  }
}
