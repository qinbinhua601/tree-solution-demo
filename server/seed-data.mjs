const ROOT_NODE_COUNT = 35;

const rootNames = [
  '产品方案',
  '设计稿',
  '运营资料',
  '财务归档',
  '法务合同',
  '销售案例',
  '招聘协作',
  '品牌规范',
  '客服知识库',
  '培训材料',
  '审计留档',
  '历史归档',
];

function createGeneratedRootNodes() {
  return Array.from({ length: ROOT_NODE_COUNT }, (_, index) => {
    const order = index + 1;
    const prefix = order % 5 === 0 ? 'file' : 'folder';
    const type = prefix === 'folder' ? 'folder' : 'file';
    const name = rootNames[index % rootNames.length];

    return {
      id: `${prefix}-root-${order}`,
      type,
      name:
        type === 'folder'
          ? `${name} ${String(order).padStart(2, '0')}`
          : `根目录文档 ${String(order).padStart(2, '0')}.md`,
      parentId: null,
    };
  });
}

export function createSeedState() {
  return {
    folderSeq: 1000,
    fileSeq: 1000,
    nodes: [
      ...createGeneratedRootNodes(),
      { id: 'file-roadmap', type: 'file', name: 'Q2 Roadmap.md', parentId: 'folder-product' },
      { id: 'file-prd', type: 'file', name: '收藏功能 PRD.docx', parentId: 'folder-product' },
      { id: 'folder-research', type: 'folder', name: '用户研究', parentId: 'folder-product' },
      { id: 'file-interview', type: 'file', name: '访谈记录 0421.md', parentId: 'folder-research' },
      { id: 'file-ui', type: 'file', name: '新版导航.fig', parentId: 'folder-design' },
      { id: 'folder-assets', type: 'folder', name: '插画素材', parentId: 'folder-design' },
      { id: 'file-icons', type: 'file', name: 'icon-export.zip', parentId: 'folder-assets' },
      { id: 'file-sales-deck', type: 'file', name: '销售提案.pptx', parentId: 'folder-sales' },
      { id: 'file-hr-plan', type: 'file', name: '校招计划.xlsx', parentId: 'folder-hr' },
      { id: 'file-brand-guide', type: 'file', name: '视觉规范.pdf', parentId: 'folder-brand' },
      { id: 'folder-product', type: 'folder', name: '产品方案精选', parentId: null },
      { id: 'folder-design', type: 'folder', name: '设计稿精选', parentId: null },
      { id: 'folder-sales', type: 'folder', name: '销售案例精选', parentId: null },
      { id: 'folder-hr', type: 'folder', name: '招聘协作精选', parentId: null },
      { id: 'folder-brand', type: 'folder', name: '品牌规范精选', parentId: null },
    ],
  };
}
