import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChildren, type NodeData } from './api/collection';
import { useInfiniteScrollTrigger } from './hooks/useInfiniteScrollTrigger';

const PAGE_SIZE = 10;
const LOAD_MORE_DELAY = 240;
const CARD_MIN_WIDTH = 220;
const CARD_MAX_WIDTH = 260;
const BREAKPOINTS = {
  sixCols: 1720,
  fiveCols: 1450,
  fourCols: 1180,
  threeCols: 900,
  twoCols: 640,
  singleCol: 520,
} as const;

type LayoutMetrics = {
  columns: 1 | 2 | 3 | 4 | 5 | 6;
  modeLabel: string;
  activeRange: string;
};

function getLayoutMetrics(width: number): LayoutMetrics {
  if (width <= BREAKPOINTS.singleCol) {
    return { columns: 1, modeLabel: '1 列', activeRange: `<= ${BREAKPOINTS.singleCol}px` };
  }

  if (width <= BREAKPOINTS.twoCols) {
    return {
      columns: 2,
      modeLabel: '2 列',
      activeRange: `${BREAKPOINTS.singleCol + 1}-${BREAKPOINTS.twoCols}px`,
    };
  }

  if (width <= BREAKPOINTS.threeCols) {
    return {
      columns: 3,
      modeLabel: '3 列',
      activeRange: `${BREAKPOINTS.twoCols + 1}-${BREAKPOINTS.threeCols}px`,
    };
  }

  if (width <= BREAKPOINTS.fourCols) {
    return {
      columns: 4,
      modeLabel: '4 列',
      activeRange: `${BREAKPOINTS.threeCols + 1}-${BREAKPOINTS.fourCols}px`,
    };
  }

  if (width <= BREAKPOINTS.fiveCols) {
    return {
      columns: 5,
      modeLabel: '5 列',
      activeRange: `${BREAKPOINTS.fourCols + 1}-${BREAKPOINTS.fiveCols}px`,
    };
  }

  if (width <= BREAKPOINTS.sixCols) {
    return {
      columns: 6,
      modeLabel: '6 列',
      activeRange: `${BREAKPOINTS.fiveCols + 1}-${BREAKPOINTS.sixCols}px`,
    };
  }

  return { columns: 6, modeLabel: '6 列+', activeRange: `> ${BREAKPOINTS.sixCols}px` };
}

export function CardDemoApp() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const data = await fetchChildren();
        if (mounted) {
          setNodes(data);
          setPage(1);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const folders = nodes.filter((item) => item.type === 'folder').length;
    const files = nodes.length - folders;
    return { total: nodes.length, folders, files };
  }, [nodes]);

  const visibleCount = page * PAGE_SIZE;
  const visibleNodes = nodes.slice(0, visibleCount);
  const hasMore = visibleCount < nodes.length;
  const layout = getLayoutMetrics(viewportWidth);
  const widthStatus =
    cardWidth === null
      ? '-'
      : cardWidth <= CARD_MIN_WIDTH
        ? '命中最小宽度'
        : cardWidth >= CARD_MAX_WIDTH
          ? '命中最大宽度'
          : '位于弹性区间';
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || loading) return;
    setIsLoadingMore(true);
    loadMoreTimerRef.current = window.setTimeout(() => {
      setPage((current) => current + 1);
      setIsLoadingMore(false);
      loadMoreTimerRef.current = null;
    }, LOAD_MORE_DELAY);
  }, [hasMore, isLoadingMore, loading]);

  useEffect(() => {
    const syncViewport = () => {
      setViewportWidth(window.innerWidth);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current !== null) {
        window.clearTimeout(loadMoreTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const syncGridMetrics = () => {
      const firstCard = grid.querySelector<HTMLElement>('.node-card');
      setCardWidth(firstCard ? Math.round(firstCard.getBoundingClientRect().width) : null);
      setGridWidth(Math.round(grid.getBoundingClientRect().width));
    };

    syncGridMetrics();
    const observer = new ResizeObserver(syncGridMetrics);
    observer.observe(grid);

    return () => observer.disconnect();
  }, [visibleNodes.length, layout.modeLabel]);

  useInfiniteScrollTrigger({
    targetRef: sentinelRef,
    enabled: hasMore && !loading && !error,
    onIntersect: loadMore,
    rootMargin: '0px 0px 180px 0px',
  });

  return (
    <main className="card-page">
      <section className="card-stage">
        <header className="card-header">
          <p className="card-eyebrow">Collection Card Demo</p>
          <h1>根目录一级节点卡片视图</h1>
          <p>
            这个页面现在专门用于观察响应式布局。拖动窗口时，先看上方观测面板，再看下方卡片区如何切换列数和宽度。
          </p>
        </header>

        <section className="layout-observer" aria-label="布局观测面板">
          <div className="layout-hero">
            <p className="layout-hero-label">当前模式</p>
            <div className="layout-hero-value">{layout.modeLabel}</div>
            <p className="layout-hero-note">命中宽度范围 {layout.activeRange}</p>
          </div>
          <div className="layout-metrics" role="status" aria-live="polite">
            <article className="metric-card metric-card-primary">
              <span className="metric-label">窗口宽度</span>
              <strong className="metric-value">{viewportWidth}px</strong>
            </article>
            <article className="metric-card metric-card-primary">
              <span className="metric-label">卡片宽度</span>
              <strong className="metric-value">{cardWidth ? `${cardWidth}px` : '-'}</strong>
              <span className="metric-note">{widthStatus}</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">网格宽度</span>
              <strong className="metric-value">{gridWidth ? `${gridWidth}px` : '-'}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">已展示节点</span>
              <strong className="metric-value">{visibleNodes.length}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">数据统计</span>
              <strong className="metric-value">{summary.total}</strong>
              <span className="metric-note">文件夹 {summary.folders} / 文件 {summary.files}</span>
            </article>
          </div>
          <div className="breakpoint-strip" aria-label="断点示意">
            <span className={`breakpoint-chip ${layout.columns === 6 ? 'is-active' : ''}`}>6 列 1451+</span>
            <span className={`breakpoint-chip ${layout.columns === 5 ? 'is-active' : ''}`}>5 列 1181-1450</span>
            <span className={`breakpoint-chip ${layout.columns === 4 ? 'is-active' : ''}`}>4 列 901-1180</span>
            <span className={`breakpoint-chip ${layout.columns === 3 ? 'is-active' : ''}`}>3 列 641-900</span>
            <span className={`breakpoint-chip ${layout.columns === 2 ? 'is-active' : ''}`}>2 列 521-640</span>
            <span className={`breakpoint-chip ${layout.columns === 1 ? 'is-active' : ''}`}>1 列 &lt;= 520</span>
            <span className="breakpoint-chip breakpoint-chip-muted">卡片限制 {CARD_MIN_WIDTH}-{CARD_MAX_WIDTH}px</span>
          </div>
        </section>

        {loading && <p className="card-feedback">正在加载一级节点...</p>}
        {error && !loading && <p className="card-feedback card-feedback-error">加载失败: {error}</p>}

        {!loading && !error && (
          <>
            <section className="card-board">
              <div className="card-board-header">
                <div>
                  <p className="card-board-label">实时预览</p>
                  <h2>卡片布局工作区</h2>
                </div>
                <p className="card-board-caption">
                  当前为 {layout.modeLabel}，卡片宽度 {cardWidth ? `${cardWidth}px` : '-'}
                </p>
              </div>
              <div className="card-grid" ref={gridRef}>
              {visibleNodes.map((node) => (
                <article className="node-card" key={node.id}>
                  <div className={`node-icon node-icon-${node.type}`} aria-hidden="true" />
                  <div className="node-meta">
                    <p className="node-name" title={node.name}>{node.name}</p>
                    <p className="node-type">{node.type === 'folder' ? 'Folder' : 'File'}</p>
                  </div>
                </article>
              ))}
              </div>
            </section>

            <div
              ref={sentinelRef}
              className={`card-load-status ${isLoadingMore ? 'is-loading' : ''}`}
              aria-live="polite"
            >
              {isLoadingMore ? '正在加载更多...' : hasMore ? '向下滚动自动加载更多' : '没有更多了'}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
