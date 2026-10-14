module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['\\.module\\.ts$', 'main\\.ts$'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@oryx/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@oryx/database$': '<rootDir>/../../packages/database/src/index.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
};
