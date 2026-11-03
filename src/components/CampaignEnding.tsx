import type { ReactNode } from 'react';
import type { CampaignOutcome, CampaignResult } from '../game/campaign';

const HEADINGS: Record<CampaignOutcome, string> = {
  day_passed: 'দিন সফল · Day passed',
  day_failed: 'দিন ব্যর্থ · Day failed',
  jailed: 'জেলে গেলেন · Jailed',
  bribe_unaffordable: 'ঘুষের টাকা ছিল না · Could not pay the bribe',
  bankrupt: 'পুঁজি শেষ · Bankrupt',
  destroyed: 'ঠেলা মেরামতের টাকা নেই · Could not repair the cart',
  victory: 'নিজের দোকান! · Your own shop!',
};

export interface CampaignEndingProps {
  result: CampaignResult;
  /** G1's day-statistics content; pass cards only, without its outer modal/buttons. */
  children?: ReactNode;
  onNextDay: () => void;
  onRetryDay: () => void;
  onStartEndless: () => void;
  onNewCampaign: () => void;
  onMainMenu: () => void;
}

const money = (value: number) => `${value < 0 ? '-' : ''}৳${Math.abs(value).toLocaleString('en-US')}`;

/** Standalone G2 result shell. Does not change existing online/police screens. */
export function CampaignEnding({
  result, children, onNextDay, onRetryDay, onStartEndless, onNewCampaign, onMainMenu,
}: CampaignEndingProps) {
  const won = result.outcome === 'victory';
  const passed = result.outcome === 'day_passed';
  const failed = result.outcome === 'day_failed';
  const progress = Math.max(0, Math.min(100, result.profit / result.target * 100));
  const totals = result.totals;
  const primary = won ? onStartEndless : passed ? onNextDay : failed ? onRetryDay : onNewCampaign;
  const primaryLabel = won ? 'অন্তহীন খেলা · Endless mode' : passed ? 'পরের দিন · Next day'
    : failed ? 'আবার চেষ্টা · Retry day' : 'নতুন খেলা · New campaign';

  return (
    <section aria-label="Campaign result" className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-teal-500/40 bg-[#0f2422]/95 p-5 text-left text-white shadow-2xl sm:p-7">
      <p className="text-xs font-semibold text-teal-300">
        {result.endless ? 'অন্তহীন · Endless' : 'ঠেলা থেকে দোকান · From cart to shop'} · Day {result.dayNumber}
      </p>
      <h2 className="mt-2 text-xl font-extrabold sm:text-2xl">{HEADINGS[result.outcome]}</h2>
      {won && <ShopEnding />}
      {result.outcome === 'bankrupt' && (
        <p className="mt-3 text-sm text-teal-100">বিক্রির মাল নেই, নতুন মাল কেনার পুঁজিও নেই। · No stock left to sell and no money to restock.</p>
      )}
      {result.outcome === 'destroyed' && (
        <p className="mt-3 text-sm text-teal-100">দিন শেষ, ঠেলা মেরামত করা গেল না। · Closing time arrived before you could afford the repair.</p>
      )}
      <div className="my-5 rounded-2xl border border-teal-700/40 bg-teal-950/60 p-4">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>নিট লাভ · Profit <strong>{money(result.profit)}</strong></span>
          <span>লক্ষ্য · Target {money(result.target)}</span>
        </div>
        <div role="progressbar" aria-label="Profit target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
          aria-valuetext={`${money(result.profit)} of ${money(result.target)}`}
          className="mt-3 h-2 overflow-hidden rounded-full bg-teal-900">
          <div className="h-full bg-amber-400" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {children}
      <dl className="my-5 grid grid-cols-2 gap-4 rounded-2xl border border-teal-700/40 p-4 text-sm">
        <div><dt className="text-teal-200">টিকে থাকা দিন · Days survived</dt><dd className="font-mono font-bold">{totals.daysSurvived}</dd></div>
        <div><dt className="text-teal-200">পৌঁছেছেন · Level reached</dt><dd className="font-mono font-bold">{totals.levelReached}</dd></div>
        <div><dt className="text-teal-200">মোট লাভ · Total profit</dt><dd className="font-mono font-bold">{money(totals.totalProfit)}</dd></div>
        <div><dt className="text-teal-200">সেরা দিন · Best day</dt><dd className="font-mono font-bold">{totals.bestDayProfit === null ? '—' : money(totals.bestDayProfit)}</dd></div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={primary} className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-gray-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{primaryLabel}</button>
        <button type="button" onClick={onMainMenu} className="rounded-2xl border border-teal-500/50 bg-teal-800 px-4 py-3 text-sm font-bold hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">মেনু · Main menu</button>
      </div>
    </section>
  );
}

function ShopEnding() {
  return (
    <div className="mt-5 rounded-2xl border border-amber-400/40 bg-teal-950 p-5 text-center">
      <div aria-hidden="true" className="mx-auto max-w-xs overflow-hidden rounded-t-xl border-4 border-amber-700 bg-amber-100">
        <div className="bg-teal-800 p-3 font-bold text-amber-200">আমার দোকান · New Market</div>
        <div className="h-5 bg-[repeating-linear-gradient(90deg,#fbbf24_0px,#fbbf24_24px,#b45309_24px,#b45309_48px)]" />
        <div className="flex h-24 items-end justify-center gap-4 px-6 pt-4">
          <div className="mb-4 h-10 w-24 border-4 border-teal-800 bg-teal-200" />
          <div className="h-20 w-14 border-4 border-amber-800 bg-amber-600" />
        </div>
      </div>
      <p className="mt-4 text-sm text-amber-100">ঠেলা থেকে নিজের দোকান — নিউ মার্কেটে নতুন শুরু।</p>
      <p className="mt-1 text-sm text-teal-200">Ten working days. Your own shop in New Market.</p>
    </div>
  );
}
