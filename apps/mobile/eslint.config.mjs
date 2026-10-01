import { createReactConfig } from '@voxtype/eslint-config/react-internal';

export default [
  { ignores: ['dist-web/**'] },
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  { files: ['src/components/ui/*.tsx'], rules: { 'react-refresh/only-export-components': 'off' } },
];
