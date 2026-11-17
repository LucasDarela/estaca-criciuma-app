import { useWindowDimensions } from 'react-native';

/** RNF-11: with a font scale of 1.3 or more the two columns are stacked. */
export function useStackedColumns(): boolean {
  return useWindowDimensions().fontScale >= 1.3;
}
