// All money shown in the UI goes through here. Sums are done in whole cents so floats never leak ($624.2000000000002).
export const toCents = (n: number) => Math.round(n * 100);
export const sumUsd = (nums: number[]) => nums.reduce((s, n) => s + toCents(n), 0) / 100;

const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$54", "$624.20", "-$12.50". Whole dollars drop the cents. */
export const usd = (n: number) => (toCents(n) % 100 === 0 ? whole : cents).format(toCents(n) / 100);
