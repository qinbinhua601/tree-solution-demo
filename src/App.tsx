import { CollectionTree } from './components/CollectionTree';

export function App() {
  return (
    <main className="page-shell">
      <section className="demo-stage">
        <div className="demo-heading">
          <p className="eyebrow">Collection Tree Demo</p>
          <h1>文档收藏夹树</h1>
          <p className="hero-text">
            根目录一级节点按 10 条分页展示，滚动到底部自动继续加载；子目录仍保持原有展开与懒加载行为。
          </p>
        </div>
        <div className="demo-panel">
          <CollectionTree />
        </div>
      </section>
    </main>
  );
}
