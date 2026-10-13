import { Skeleton, SkeletonGroup } from "./skeleton";

/**
 * What shows while a tab's server component fetches: a row of KPI blocks and a
 * body block, as in the mockups. Use it as the `fallback` of the Suspense
 * around the tab, keyed on the active tab.
 */
export function TabFallback({ kpis = 3, bodyHeight = 320 }: { kpis?: number; bodyHeight?: number }) {
  return (
    <SkeletonGroup>
      {kpis > 0 ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {Array.from({ length: kpis }, (_, i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      ) : null}
      <Skeleton style={{ height: bodyHeight }} />
    </SkeletonGroup>
  );
}
