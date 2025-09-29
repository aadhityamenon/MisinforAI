import { cn } from "@/lib/utils";

interface Props {
  label: string;
  score: number; // 0..100
  weight: number; // 0..1
  details?: string;
  displayBinary?: boolean; // if true, show 0/1 and bar at 0% or 100%
}

export default function RubricCard({ label, score, weight, details, displayBinary }: Props) {
  const bin = score >= 50 ? 1 : 0;
  const shownGradeScore = displayBinary ? (bin * 100) : score;
  const grade = shownGradeScore >= 85 ? "A" : shownGradeScore >= 70 ? "B" : shownGradeScore >= 55 ? "C" : "D";
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-base font-semibold">{label}</h4>
          <p className="mt-1 text-xs text-muted-foreground">Weight {(weight * 100).toFixed(1)}%</p>
        </div>
        <div className={cn("rounded-md px-2 py-1 text-sm font-bold", grade === "A" && "bg-emerald-500/10 text-emerald-600", grade === "B" && "bg-blue-500/10 text-blue-600", grade === "C" && "bg-amber-500/10 text-amber-600", grade === "D" && "bg-rose-500/10 text-rose-600")}>{grade}</div>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded bg-secondary">
        <div className="h-2 bg-primary" style={{ width: `${displayBinary ? bin * 100 : score}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Score</span>
        <span className="font-medium">{displayBinary ? `${bin}/1` : `${score}/100`}</span>
      </div>
      {details && <p className="mt-3 text-sm text-muted-foreground">{details}</p>}
    </div>
  );
}
