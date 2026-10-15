import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { TabFallback } from "@/components/ui/tab-fallback";

/**
 * What every dashboard page shows the instant you click a sidebar link, until its
 * own header and tabs arrive.
 *
 * Every dashboard route is dynamic, and a dynamic route without a loading file is
 * not prefetched at all and shows nothing on click until the server has finished.
 * With this file, Next prefetches the shared shell down to here (cheap: no page
 * code or data) and swaps this skeleton in at once. The sidebar and top bar stay
 * where they are: they belong to the layout, which a navigation does not redraw.
 *
 * Shaped like the pages (title and subtitle, a tab row, then a tab body), so the
 * real content replaces it without the page jumping.
 */
export default function DashboardLoading() {
  return (
    <SkeletonGroup>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <TabFallback kpis={2} bodyHeight={300} />
    </SkeletonGroup>
  );
}
