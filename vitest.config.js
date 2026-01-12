import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['tests/**/*.test.{js,ts}'],

    // Environment (jsdom for DOM APIs if needed)
    environment: 'node',

    // Global test APIs (describe, it, expect)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['js/**/*.js', 'index.html'],
      exclude: [
        'node_modules',
        'tests',
        'railway-server',
        'data',
        'worksheets'
      ]
    },

    // Reporter for better output
    reporters: ['verbose'],

    // Timeout for slow tests
    testTimeout: 10000,

    // Watch mode exclusions
    watchExclude: [
      'node_modules',
      'railway-server/node_modules'
    ]
  }
});
