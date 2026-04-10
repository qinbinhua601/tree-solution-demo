import { CollectionTree } from './components/CollectionTree';

export function App() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Headless Tree Demo</p>
          <h1>文档收藏夹树</h1>
          <p className="hero-text">
            基于 `@headless-tree/core` 和 `@headless-tree/react` 的懒加载树组件示例，支持拖拽移动、重命名、删除，以及新建文件夹和文档。
          </p>
        </div>
        <div className="demo-panel">
          <CollectionTree />
        </div>
      </section>
    </main>
  );
}
