import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    // The design system is the one place that wraps its third-party primitives.
    rules: { 'no-restricted-imports': 'off' },
  },
];
