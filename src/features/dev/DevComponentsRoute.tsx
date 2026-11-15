import { Redirect } from 'expo-router';

import { ComponentCatalogScreen } from './ComponentCatalogScreen';

/** RNF-05: the catalog only exists in development; production builds go back to the Agenda. */
export function DevComponentsRoute() {
  return __DEV__ ? <ComponentCatalogScreen /> : <Redirect href="/agenda" />;
}
