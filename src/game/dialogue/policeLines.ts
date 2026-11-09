export type PoliceSituation =
  | 'spotted'
  | 'approach'
  | 'warning'
  | 'stand_down'
  | 'chase'
  | 'lost'
  | 'arrest'
  | 'hit'
  | 'hurt'
  | 'backup'
  | 'radio';

export const POLICE_SITUATIONS: readonly PoliceSituation[] = [
  'spotted',
  'approach',
  'warning',
  'stand_down',
  'chase',
  'lost',
  'arrest',
  'hit',
  'hurt',
  'backup',
  'radio',
] as const;

export const POLICE_LINES: Record<PoliceSituation, readonly string[]> = {
  spotted: [
    'এই যে, তুমি!',
    'ওই ঠেলাওয়ালা!',
    'দাঁড়াও ওখানে!',
    'এখানে আবার ঠেলা নিয়ে এসেছ?',
    'ওই যে, রাস্তার পাশে কে ওটা?',
  ],
  approach: [
    'একটু শোনো এদিকে!',
    'ঠেলাটা নিয়ে কোথায় যাচ্ছ?',
    'রাস্তা আটকে দাঁড়িও না!',
    'এই যে ভাই, কথা আছে!',
    'এখানে কী করছ তুমি?',
  ],
  warning: [
    'এখানে বেচাকেনা নিষেধ!',
    'ঠেলা সরাও, এখানে চলবে না!',
    'রাস্তা খালি করো, এক্ষুনি যাও!',
    'ফুটপাত দখল করে দাঁড়ানো যাবে না!',
    'তাড়াতাড়ি সরে যাও বলছি!',
  ],
  stand_down: [
    'ঠিক আছে, যাও। আর যেন না দেখি।',
    'সাবধানে যাও, এখানে থামবে না।',
    'এবার ছেড়ে দিলাম, পথ পরিষ্কার রাখো।',
    'চলো চলো, সামনে এগোও।',
    'ঠিক আছে, আজকের মতো যাও।',
  ],
  chase: [
    'থামো বলছি!',
    'ধরো ওকে!',
    'পালাবে কোথায়? দাঁড়াও!',
    'ঠেলা রেখে পালানোর চেষ্টা করো না!',
    'সামনে থেকে পথ আটকান!',
  ],
  lost: [
    'কোথায় গেল লোকটা?',
    'এই গলিতেই তো ঢুকল!',
    'চারদিকে খুঁজে দেখো!',
    'ভিড়ের মধ্যে মিলিয়ে গেল নাকি?',
    'বেশি দূরে যেতে পারেনি, খোঁজো!',
  ],
  arrest: [
    'তোমাকে গ্রেফতার করা হলো!',
    'থানায় চলো!',
    'এবার আর ছাড়াছাড়ি নেই!',
    'হাত ওঠাও, অনেক হয়েছে!',
    'ঠেলা জব্দ, এখন থানায় চলো!',
  ],
  hit: [
    'পুলিশের গায়ে হাত? এত বড় সাহস!',
    'সরকারি কাজে বাধা! ধরো ওকে!',
    'পুলিশকে ধাক্কা দিয়ে পালাবে?',
    'এত স্পর্ধা! আজ তোমার রক্ষা নেই!',
    'অফিসারের ওপর ঠেলা চালিয়ে দিল!',
  ],
  hurt: [
    'উফ্, ওরে বাবা!',
    'আহ্! আমার পা গেল!',
    'ওরে মা রে, কী জোরে ধাক্কা!',
    'উফ্! মাথাটা ঘুরে গেল!',
    'আহ্! কোমরে প্রচণ্ড লেগেছে!',
  ],
  backup: [
    'সাহায্য পাঠান, লোকটা পালাচ্ছে!',
    'সবাই এগিয়ে আসুন, ওকে ঘিরে ফেলুন!',
    'সামনের মোড়টা তাড়াতাড়ি ব্লক করুন!',
    'ফোর্স পাঠান, ঠেলাওয়ালা মানছে না!',
    'ওই গলির মুখে অবস্থান নিন!',
  ],
  radio: [
    'হ্যালো কন্ট্রোল, ঠেলাওয়ালাকে দেখা গেছে!',
    'কন্ট্রোল, সন্দেহভাজন এই এলাকায় আছে।',
    'ওভার, ঠেলাওয়ালা বাজারের দিকে যাচ্ছে।',
    'কন্ট্রোল রুম, লোকটাকে নজরে রেখেছি।',
    'সকল ইউনিট শুনুন, ঠেলাওয়ালা সামনেই!',
  ],
};

export class PoliceLinePicker {
  private readonly rng: () => number;
  private readonly lastIndex = new Map<PoliceSituation, number>();

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  pick(situation: PoliceSituation): string {
    const lines = POLICE_LINES[situation];
    const count = lines.length;
    if (count === 0) return '';
    if (count === 1) {
      this.lastIndex.set(situation, 0);
      return lines[0];
    }

    const prev = this.lastIndex.get(situation);
    const raw = this.rng();
    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;

    let idx: number;
    if (prev === undefined) {
      idx = Math.floor(clamped * count);
    } else {
      const offset = Math.floor(clamped * (count - 1));
      idx = offset >= prev ? offset + 1 : offset;
    }

    this.lastIndex.set(situation, idx);
    return lines[idx];
  }
}
