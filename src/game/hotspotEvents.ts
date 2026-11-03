import { crowdPeriod, hotspotWeight } from './crowd/crowdSchedule';

const PERIOD_LABELS: Record<ReturnType<typeof crowdPeriod>, { labelBn: string; labelEn: string }> = {
  early: { labelBn: 'অফিস যাত্রা', labelEn: 'Office rush' },
  office_rush: { labelBn: 'অফিস যাত্রা', labelEn: 'Office rush' },
  bazaar: { labelBn: 'বাজারের সময়', labelEn: 'Bazaar hour' },
  school_release: { labelBn: 'ছুটির সময়', labelEn: 'School release' },
  afternoon: { labelBn: '', labelEn: '' },
  evening_market: { labelBn: 'সন্ধ্যার বাজার', labelEn: 'Evening market' },
  night: { labelBn: 'রাতের বাজার', labelEn: 'Night market' },
};

export function activeHotspotEvent(
  kind: string,
  minutes: number,
): { active: boolean; strength: number; labelBn: string; labelEn: string } {
  const safeKind = typeof kind === 'string' ? kind : '';
  const weight = hotspotWeight(safeKind, minutes);
  const active = weight >= 1.4;
  const strength = Math.max(0, Math.min(1, (weight - 1) / 2));
  const period = crowdPeriod(minutes);
  const { labelBn, labelEn } = PERIOD_LABELS[period];
  return { active, strength, labelBn, labelEn };
}
