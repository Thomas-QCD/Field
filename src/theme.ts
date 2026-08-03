import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** Brand #732e75 at shade 6 (Mantine primary default). */
const brand: MantineColorsTuple = [
  '#f8f0f8',
  '#f0e0f0',
  '#e0c0e1',
  '#c99aca',
  '#b06bb2',
  '#8f4491',
  '#732e75',
  '#5a245c',
  '#3f1941',
  '#2a102b',
];

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand },
  fontFamily: "'DM Sans', system-ui, sans-serif",
  headings: {
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: '700',
  },
  defaultRadius: 'md',
  black: '#141414',
  white: '#fafafa',
});
