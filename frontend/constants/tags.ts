export const SUBJECT_TAGS = [
  { key: 'math', label: 'Toán' },
  { key: 'lang', label: 'Ngôn ngữ' },
  { key: 'flang', label: 'Ngoại ngữ' },
  { key: 'sci', label: 'Khoa học' },
  { key: 'hist_geo', label: 'Lịch sử - Địa lý' },
  { key: 'civic', label: 'Giáo dục công dân' },
] as const;

export type TagKey = (typeof SUBJECT_TAGS)[number]['key'];
