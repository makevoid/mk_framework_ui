import { twMerge } from 'tailwind-merge';

export const cx = (...values) => twMerge(values.flat(Infinity).filter(Boolean).join(' '));

export function define(definitions) {
  return Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
    const spec = typeof definition === 'string' ? { base: definition } : definition;
    const classes = (props = {}) => {
      const variants = Object.entries(spec.variants || {}).map(([variant, choices]) => {
        const value = props[variant] ?? spec.defaults?.[variant];
        return choices[value];
      });
      return cx(spec.base, variants, props.class);
    };
    return [name, classes];
  }));
}

export const TW = {
  cx,
  define,
  ...define({
    button: {
      base: 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed',
      variants: {
        tone: {
          primary: 'bg-emerald-800 text-white hover:bg-emerald-900',
          secondary: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-100',
          ghost: 'text-stone-600 hover:bg-stone-100',
          danger: 'bg-red-50 text-red-700 hover:bg-red-100',
        },
      },
      defaults: { tone: 'primary' },
    },
    input: 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100',
    label: 'mb-2 block text-sm font-semibold text-stone-700',
    card: 'rounded-2xl border border-stone-200 bg-white',
    badge: 'inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800',
  }),
};
