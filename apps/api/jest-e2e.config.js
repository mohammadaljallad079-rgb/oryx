module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@oryx/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@oryx/database$': '<rootDir>/../../packages/database/src/index.ts',
  },
  testTimeout: 60000,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
