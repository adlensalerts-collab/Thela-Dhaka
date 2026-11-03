import React from 'react';
import {
  Wallet,
  ShoppingBag,
  ShieldAlert,
  Navigation,
  ShieldCheck,
  RefreshCw,
  Home
} from 'lucide-react';
import { RunStats } from '../game/stats';
import { formatDayClock } from '../game/day';

interface StatsScreenProps {
  stats: RunStats | null;
  isOnline?: boolean;
  rematchPending?: boolean;
  onRestart: () => void;
  onMainMenu: () => void;
  cardsOnly?: boolean;
}

function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({
  stats,
  isOnline,
  rematchPending = false,
  onRestart,
  onMainMenu,
  cardsOnly = false
}) => {
  const result = stats?.result ?? 'jailed';
  const isPolice =
    stats?.mode === 'police' || stats?.mode === 'online_police';
  const isSoloVendor = (stats?.mode ?? 'vendor') === 'vendor';
  const online =
    isOnline ?? (stats?.mode === 'online_vendor' || stats?.mode === 'online_police');

  const dayNumber = stats?.dayNumber ?? 1;
  const dayTarget = Math.max(1, stats?.dayTarget ?? 600);

  const headerText =
    result === 'day_passed'
      ? 'Day passed / দিন সফল'
      : result === 'day_failed'
      ? 'Day failed / দিন ব্যর্থ'
      : result === 'bribe_unaffordable'
      ? "ঘুষের টাকা ছিল না · Couldn't pay the bribe"
      : result === 'destroyed'
      ? 'ঠেলা ভেঙে গেছে · Cart Destroyed'
      : result === 'mob_beaten'
      ? 'জনতার হাতে মার খেয়েছেন · Beaten by Angry Crowd'
      : result === 'victory'
      ? 'জয়! · Victory'
      : 'জেলে গেলেন · Jailed';

  const headerAccent =
    result === 'victory' || result === 'day_passed'
      ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/50'
      : 'text-amber-300 border-red-500/40 bg-red-950/50';

  const earned = stats?.earned ?? 0;
  const spentRestock = stats?.spentRestock ?? 0;
  const spentRepair = stats?.spentRepair ?? 0;
  const spentBribes = stats?.spentBribes ?? 0;
  const spentCartUpgrades = stats?.spentCartUpgrades ?? 0;
  const spentStaminaUpgrades = stats?.spentStaminaUpgrades ?? 0;
  const spentRent = stats?.spentRent ?? 0;
  const spentFood = stats?.spentFood ?? 0;
  const profit =
    stats?.profit ??
    earned -
      (spentRestock +
        spentRepair +
        spentBribes +
        spentCartUpgrades +
        spentStaminaUpgrades +
        spentRent +
        spentFood);

  const targetProgressPct = Math.min(
    100,
    Math.max(0, Math.round((Math.max(0, profit) / dayTarget) * 100))
  );
  const reachedTarget = profit >= dayTarget;

  const productEntries = Object.entries(stats?.salesByProduct ?? {}) as Array<[string, number]>;
  const maxProductCount = Math.max(
    1,
    ...productEntries.map(([, count]) => count)
  );

  const distanceKm = ((stats?.distanceMetres ?? 0) / 1000).toFixed(2);
  const sprintSecs = `${(stats?.sprintSeconds ?? 0).toFixed(1)}s`;
  const timePlayed = formatDuration(stats?.timePlayedSeconds ?? 0);

  return (
    <div className={cardsOnly ? 'space-y-5' : 'bg-[#0f2422]/95 border border-teal-500/40 rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl text-left space-y-5 max-h-[92vh] overflow-y-auto backdrop-blur-md'}>
      {/* Header */}
      {!cardsOnly && <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-teal-800/60 pb-4">
        <div>
          <span className="text-[11px] uppercase tracking-widest text-teal-300/80 font-semibold">
            {isSoloVendor
              ? `Day ${String(dayNumber).padStart(2, '0')} · দিন ${dayNumber} · ${stats?.dayClockText ?? formatDayClock(stats?.timePlayedSeconds ?? 0)} সমাপ্তি`
              : 'খেলার পরিসংখ্যান · Run Statistics'}
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
            {headerText}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isSoloVendor && (
            <div className="px-3 py-1.5 rounded-xl border border-teal-500/40 bg-teal-900/50 text-teal-200 text-xs font-bold font-mono">
              Day {String(dayNumber).padStart(2, '0')} / দিন {dayNumber}
            </div>
          )}
          <div
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold ${headerAccent}`}
          >
            {isPolice ? 'পুলিশ টহল · Police Patrol' : 'ঠেলা বিক্রেতা · Street Vendor'}
          </div>
        </div>
      </div>}
      {/* 4-Card Responsive Grid (2 columns desktop, 1 on mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Money */}
        <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm border-b border-teal-800/50 pb-2">
              <Wallet className="w-4 h-4 shrink-0" />
              <span>হিসাব-নিকাশ · Money</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-200">
                <span>মোট আয় · Earned</span>
                <span className="font-mono font-bold text-emerald-300">৳{earned}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>মাল ক্রয় · Restock</span>
                <span className="font-mono text-gray-200">-৳{spentRestock}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>মেরামত · Repair</span>
                <span className="font-mono text-gray-200">-৳{spentRepair}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>ঘুষ · Bribes</span>
                <span className="font-mono text-gray-200">-৳{spentBribes}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>ঠেলা আপগ্রেড · Cart Upgrades</span>
                <span className="font-mono text-gray-200">-৳{spentCartUpgrades}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>স্ট্যামিনা আপগ্রেড · Stamina Upgrades</span>
                <span className="font-mono text-gray-200">-৳{spentStaminaUpgrades}</span>
              </div>
              {isSoloVendor && (
                <>
                  <div className="flex justify-between text-gray-300">
                    <span>ঠেলা ভাড়া · Rent</span>
                    <span className="font-mono text-gray-200">-৳{spentRent}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>খাবার খরচ · Food</span>
                    <span className="font-mono text-gray-200">-৳{spentFood}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="pt-2.5 border-t border-teal-800/60 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold text-amber-300">
                নিট লাভ · Profit
              </span>
              <span
                className={`text-xl sm:text-2xl font-extrabold font-mono text-amber-400 ${
                  profit > 0
                    ? '!text-emerald-400'
                    : profit < 0
                    ? '!text-red-400'
                    : 'text-amber-400'
                }`}
              >
                {profit >= 0 ? `৳${profit}` : `-৳${Math.abs(profit)}`}
              </span>
            </div>

            {isSoloVendor && (
              <div className="space-y-1 pt-1 border-t border-teal-800/40">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-teal-200 font-semibold">
                    লক্ষ্যমাত্রা · Day Target
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      reachedTarget ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {profit >= 0 ? `৳${profit}` : `-৳${Math.abs(profit)}`} / ৳{dayTarget} ({targetProgressPct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-teal-900/80 rounded-full overflow-hidden border border-teal-700/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      reachedTarget
                        ? 'bg-emerald-400'
                        : profit >= 0
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${targetProgressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Selling (Vendor) OR Arrests (Police) */}
        {!isPolice ? (
          <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm border-b border-teal-800/50 pb-2">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>বেচাকেনা · Selling</span>
              </div>

              <div className="flex justify-between text-xs text-gray-200">
                <span>বিক্রিত পণ্য · Items Sold</span>
                <span className="font-mono font-bold text-white">
                  {stats?.itemsSold ?? 0}
                </span>
              </div>

              {/* Small bar per product */}
              <div className="space-y-1.5 py-1">
                <div className="text-[11px] text-teal-300/80 font-semibold">
                  পণ্যভিত্তিক বিক্রি · By Product
                </div>
                {productEntries.length === 0 ? (
                  <div className="text-[11px] text-gray-400 italic py-1">
                    কোনো পণ্য বিক্রি হয়নি · No sales recorded
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {productEntries.map(([product, count]) => {
                      const pct = Math.max(8, Math.round((count / maxProductCount) * 100));
                      return (
                        <div key={product} className="space-y-0.5">
                          <div className="flex justify-between text-[11px] text-gray-200">
                            <span>{product}</span>
                            <span className="font-mono text-amber-300">{count}</span>
                          </div>
                          <div className="w-full h-1.5 bg-teal-900/80 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-teal-800/60 space-y-1 text-xs">
              <div className="flex justify-between text-gray-200">
                <span>সেরা বিক্রি · Best Sale</span>
                <span className="font-mono font-bold text-amber-300">
                  {stats?.bestSale
                    ? `${stats.bestSale.product} · ৳${stats.bestSale.price}`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>বাধাগ্রস্ত বিক্রি · Interrupted</span>
                <span className="font-mono text-red-300">
                  {stats?.salesInterrupted ?? 0}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm border-b border-teal-800/50 pb-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>গ্রেপ্তার · Arrests</span>
              </div>
              <div className="py-4 text-center space-y-1">
                <div className="text-3xl font-extrabold font-mono text-amber-400">
                  {stats?.arrests ?? 0}
                </div>
                <div className="text-xs text-gray-300">
                  আইনানুগ গ্রেপ্তার · Lawful Arrests Recorded
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-teal-800/60 flex justify-between text-xs text-gray-300">
              <span>পদমর্যাদা · Rank Level</span>
              <span className="font-mono font-bold text-teal-300">
                {Math.min(4, 1 + Math.floor((stats?.arrests ?? 0) / 2))}
              </span>
            </div>
          </div>
        )}

        {/* Card 3: Trouble */}
        <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm border-b border-teal-800/50 pb-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>ঝামেলা ও সংঘর্ষ · Trouble</span>
          </div>

          <div className="space-y-1.5 text-xs pt-0.5">
            <div className="flex justify-between text-gray-200">
              <span>পুলিশের তাড়া · Chases Started</span>
              <span className="font-mono font-bold text-amber-300">
                {stats?.chasesStarted ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-gray-200">
              <span>তাড়া থেকে মুক্তি · Chases Escaped</span>
              <span className="font-mono font-bold text-emerald-300">
                {stats?.chasesEscaped ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-gray-200">
              <span>ধরা পড়া · Times Caught</span>
              <span className="font-mono font-bold text-red-300">
                {stats?.timesCaught ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>ঘুষ প্রদান · Bribes Paid</span>
              <span className="font-mono text-gray-100">
                {stats?.bribesPaid ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>দুর্ঘটনা · Collisions</span>
              <span className="font-mono text-gray-100">
                {stats?.collisions ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>পথচারীকে ধাক্কা · Pedestrians Hit</span>
              <span className="font-mono text-orange-300">
                {stats?.pedestriansHit ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>মোট ক্ষতি · Damage Taken</span>
              <span className="font-mono text-red-300">
                {stats?.damageTaken ?? 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Movement & Run */}
        <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm border-b border-teal-800/50 pb-2">
            <Navigation className="w-4 h-4 shrink-0" />
            <span>চলাচল ও রান · Movement & Run</span>
          </div>

          <div className="space-y-1.5 text-xs pt-0.5">
            {isSoloVendor && (
              <div className="flex justify-between text-gray-200">
                <span>কাজের দিন · Working Day</span>
                <span className="font-mono font-bold text-amber-300">
                  Day {String(dayNumber).padStart(2, '0')} · দিন {dayNumber}
                </span>
              </div>
            )}
            <div className="flex justify-between text-gray-200">
              <span>অতিক্রান্ত দূরত্ব · Distance</span>
              <span className="font-mono font-bold text-teal-300">
                {distanceKm} km
              </span>
            </div>
            <div className="flex justify-between text-gray-200">
              <span>দৌড়ের সময় · Sprint Time</span>
              <span className="font-mono text-amber-300">{sprintSecs}</span>
            </div>
            <div className="flex justify-between text-gray-200">
              <span>খেলার সময় · Time Played</span>
              <span className="font-mono text-white">{timePlayed}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>ঠেলা লেভেল · Cart Level</span>
              <span className="font-mono font-bold text-amber-300">
                Lv. {stats?.cartLevel ?? 1}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>স্ট্যামিনা লেভেল · Stamina Level</span>
              <span className="font-mono font-bold text-teal-300">
                Lv. {stats?.staminaLevel ?? 1}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!cardsOnly && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          onClick={onRestart}
          disabled={online && rematchPending}
          className={`py-3 px-4 rounded-2xl font-extrabold text-xs sm:text-sm shadow-lg transition flex items-center justify-center gap-2 ${
            online && rematchPending
              ? 'bg-amber-500/40 text-gray-900/70 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-400 text-gray-950'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${online && rematchPending ? 'animate-spin' : ''}`} />
          {online
            ? rematchPending
              ? 'Waiting for opponent... / প্রতিপক্ষের অপেক্ষায়...'
              : 'Request rematch / পুনরায় খেলার অনুরোধ'
            : result === 'day_passed'
            ? 'Play day again / দিনটি আবার খেলুন'
            : result === 'day_failed'
            ? 'Retry day / দিনটি আবার চেষ্টা করুন'
            : 'Play Again / আবার খেলুন'}
        </button>
        <button
          onClick={onMainMenu}
          className="py-3 px-4 rounded-2xl bg-teal-800 hover:bg-teal-700 border border-teal-600/50 text-white font-bold text-xs sm:text-sm shadow-lg transition flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          Main Menu / মেনু
        </button>
      </div>}
    </div>
  );
};
