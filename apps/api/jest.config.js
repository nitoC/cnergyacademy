/** @type {import('jest').Config} */
const base = { preset: 'ts-jest', testEnvironment: 'node', moduleFileExtensions: ['ts', 'js', 'json'] };
module.exports = {
  projects: [
    { ...base, displayName: 'unit', rootDir: 'src', testMatch: ['**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      rootDir: 'test',
      testMatch: ['**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/global-setup.ts',
      setupFiles: ['<rootDir>/env.ts'],
    },
  ],
};
