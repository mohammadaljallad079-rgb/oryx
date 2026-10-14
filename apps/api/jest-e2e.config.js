module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  // Sets relaxed throttle limits and the MFA key before any module loads.
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleNameMapper: {
    '^@oryx/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@oryx/database$': '<rootDir>/../../packages/database/src/index.ts',
  },
  // otplib and its crypto/base32 plugins ship ESM, so they must be transformed
  // rather than skipped as ordinary node_modules.
  transformIgnorePatterns: ['node_modules/(?!(otplib|@otplib|@scure|@noble)/)'],
  testTimeout: 60000,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
