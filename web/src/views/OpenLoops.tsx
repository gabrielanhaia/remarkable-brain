/** Open Loops: the "what did I leave unfinished" list, most recent first, each linking to its page. */
import { getOpenLoops } from '../api/client.js';
import { useAsync } from '../lib/hooks.js';
import { EmptyHint, EmptyIndexState, ErrorState, Skeleton, ViewHeader } from '../components/ui.js';
import { OpenLoopRow } from './Dashboard.js';

export function OpenLoops() {
  const { data, loading, error, isEmptyIndex, reload } = useAsync(() => getOpenLoops(200), []);

  if (isEmptyIndex) return <EmptyIndexState />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="animate-fade-up">
      <ViewHeader
        eyebrow="Follow-ups"
        title="Open Loops"
        subtitle="Pages you flagged as unfinished — questions, todos, and threads still waiting on you."
      />
      {loading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyHint icon="✓" title="Nothing open">
          Every loop is closed. When you flag a page as unfinished, it will surface here.
        </EmptyHint>
      ) : (
        <ul className="mx-auto max-w-3xl space-y-3">
          {data.map((loop) => (
            <li key={loop.pageId}>
              <OpenLoopRow loop={loop} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
