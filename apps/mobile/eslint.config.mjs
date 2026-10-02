import { createReactConfig } from '@voxtype/eslint-config/react-internal';

export default [
  { ignores: ['dist-web/**', 'android/**', 'modules/*/android/build/**', '.expo/**'] },
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
];
