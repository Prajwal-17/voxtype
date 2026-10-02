import { createReactConfig } from '@voxtype/eslint-config/react-internal';

export default [
  { ignores: ['dist-web/**', 'android/**', '.expo/**'] },
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
];
