/* eslint-disable no-undef */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './test',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
};
