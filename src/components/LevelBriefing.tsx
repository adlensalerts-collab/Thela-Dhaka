import { dayBriefing } from '../game/difficulty';

interface LevelBriefingProps {
  dayNumber: number;
  onStart: () => void;
  onMainMenu: () => void;
}

export function LevelBriefing({ dayNumber, onStart, onMainMenu }: LevelBriefingProps) {
  const { target, district, difficulty } = dayBriefing(dayNumber);
  const rows = [
    ['পুলিশ · Police', `${difficulty.policeCount} officers`],
    ['নজর · Vision', `${difficulty.policeVision} m`],
    ['যানবাহন · Traffic', `${difficulty.traffic} · ${difficulty.trafficCount}`],
    ['ক্রেতার ধৈর্য · Patience', `${difficulty.customerPatience} s`],
  ];
  return (
    <section aria-label="Next day briefing" className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl border border-teal-500/40 bg-[#0f2422] p-6 text-white shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">পরের দিনের প্রস্তুতি · Next working day</p>
      <h2 className="mt-2 text-2xl font-extrabold">দিন {dayNumber} · Day {dayNumber}</h2>
      <p className="mt-2 text-lg text-amber-300">{district === 'newmarket' ? 'নিউ মার্কেট · New Market' : 'গুলিস্তান · Gulistan'}</p>
      <p className="mt-4 text-sm">লাভের লক্ষ্য · Profit target <strong className="font-mono">৳{target.toLocaleString('en-US')}</strong></p>
      <dl className="my-5 divide-y divide-teal-800 rounded-xl border border-teal-700 px-4">
        {rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="text-teal-200">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      {difficulty.patrolRoutes && <p className="mb-4 text-sm text-teal-200">পুলিশ ফুটপাথে টহল দেবে। · Police patrol the footpaths.</p>}
      <p className="mb-5 text-xs text-teal-200">সকাল ০৬:০০ থেকে নতুন দিন। · Start fresh at 06:00.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={onStart} className="rounded-xl bg-amber-400 px-4 py-3 font-bold text-gray-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">দিন শুরু · Start day</button>
        <button type="button" onClick={onMainMenu} className="rounded-xl border border-teal-600 bg-teal-800 px-4 py-3 font-bold hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">মেনু · Main menu</button>
      </div>
    </section>
  );
}
