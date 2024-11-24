/* eslint-disable no-undef */
/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './test',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
};
