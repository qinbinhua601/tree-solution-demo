import { CollectionTree } from './components/CollectionTree';

export function App() {
  return (
    <main className="page-shell">
      <section className="demo-stage">
        <div className="demo-heading">
          <p className="eyebrow">Collection Tree Demo</p>
          <h1>文档收藏夹树</h1>
          <p className="hero-text">
            当前 demo 已接入真实 Node 后端，支持文件夹 / 文档的新建、重命名、删除、拖拽移动与根目录分页展示。
          </p>
        </div>
        <div className="demo-panel">
          <CollectionTree />
        </div>
      </section>
    </main>
  );
}
