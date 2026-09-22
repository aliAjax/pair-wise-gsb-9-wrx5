// 数据层：初始文献库（迁移自原研究文献库的三条种子数据）
export const seedPapers = [
  {
    id: 1,
    title: 'The Extended Mind',
    authors: 'Clark, A. & Chalmers, D.',
    year: 1998,
    venue: 'Analysis',
    tags: ['具身认知', '经典'],
    abstract:
      '本文提出心智延展论：当外部环境稳定地承担认知功能时，心智边界可以超越头脑与身体。',
    status: '阅读中',
    cite: 'Clark, A. & Chalmers, D. (1998). The Extended Mind. Analysis.',
  },
  {
    id:
      2,
    title: 'Situated Learning',
    authors: 'Lave, J. & Wenger, E.',
    year: 1991,
    venue: 'Cambridge University Press',
    tags: ['学习科学', '社会'],
    abstract: '学习发生在真实情境的参与过程中，知识与共同体实践不可分割。',
    status: '待读',
    cite: 'Lave, J. & Wenger, E. (1991). Situated Learning.',
  },
  {
    id: 3,
    title: 'Designing with Data',
    authors: 'Miller, S.',
    year: 2022,
    venue: 'MIT Press',
    tags: ['设计研究', '方法'],
    abstract: '一套面向设计师的数据研究方法，讨论如何把定性洞察转化为可行动的设计决策。',
    status: '已读',
    cite: 'Miller, S. (2022). Designing with Data.',
  },
];
