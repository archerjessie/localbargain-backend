// Platform-owned list (design D6). Changing it means a redeploy, by design.
export const categories = [
  { categoryId: 'coffee', name: 'Coffee' },
  { categoryId: 'bakery', name: 'Bakery' },
  { categoryId: 'meals', name: 'Meals' },
  { categoryId: 'desserts', name: 'Desserts' },
  { categoryId: 'drinks', name: 'Drinks' },
  { categoryId: 'groceries', name: 'Groceries' },
  { categoryId: 'beauty', name: 'Beauty' },
  { categoryId: 'health', name: 'Health' },
  { categoryId: 'fashion', name: 'Fashion' },
  { categoryId: 'retail', name: 'Retail' },
  { categoryId: 'services', name: 'Services' },
  { categoryId: 'other', name: 'Other' },
] as const;

export type CategoryId = (typeof categories)[number]['categoryId'];
