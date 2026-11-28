// Entries store the position in these lists. Only append: never reorder or remove.
export const EXPENSE_CATEGORIES = [
  { name: 'Groceries', icon: 'shopping_cart' },
  { name: 'Home & utilities', icon: 'home' },
  { name: 'Restaurants', icon: 'restaurant' },
  { name: 'Transport', icon: 'directions_bus' },
  { name: 'Subscriptions', icon: 'subscriptions' },
  { name: 'Taxi', icon: 'local_taxi' },
  { name: 'Coffee', icon: 'local_cafe' },
  { name: 'Health', icon: 'ecg_heart' },
  { name: 'Shopping', icon: 'shopping_bag' },
  { name: 'Entertainment', icon: 'sports_esports' },
  { name: 'Other', icon: 'category' },
];
export const SUBSCRIPTIONS = 4;

export const INCOME_CATEGORIES = [
  { name: 'Salary', icon: 'payments' },
  { name: 'Side job', icon: 'work' },
  { name: 'Gifts', icon: 'redeem' },
  { name: 'Other', icon: 'category' },
];

export const GOAL_ICONS = ['savings', 'laptop_mac', 'flight', 'shield', 'home', 'directions_car', 'school', 'favorite'];

// Amounts in every currency are stored with two decimals.
const info = (symbol, name) => ({ symbol, name });
export const CURRENCY_INFO = {
  AZN: info('₼', 'Azerbaijani manat'),
  USD: info('$', 'US dollar'),
  TRY: info('₺', 'Turkish lira'),
  EUR: info('€', 'Euro'),
  GBP: info('£', 'British pound'),
};
export const CURRENCIES = Object.keys(CURRENCY_INFO);

export const MAX_CENTS = 100_000_000_00;
export const MAX_TITLE = 40;
export const MAX_NAME = 60;
export const MAX_GOALS = 20;
