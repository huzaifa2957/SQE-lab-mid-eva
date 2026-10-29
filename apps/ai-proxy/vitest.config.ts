import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'ai-proxy',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
