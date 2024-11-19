module.exports = {
    roots: ['<rootDir>/src'],
    transform: {
      '^.+\\.tsx?$': 'ts-jest',
    },
    testRegex: '^[^\\.]+(\\.)?(unit){0,1}\\.(test|spec)\\.(ts|js)?$',
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    collectCoverageFrom: [
      "src/**/*.{js,ts}",
      "!src/**/*.d.ts",
      "!src/Device.ts",
      "!src/**/mock.ts",
      "!src/**/types.ts",
      "!src/types/**",
      "!src/**/consts.ts",
      "!src/**/*.e2e.{test,tests}.{js,ts}",
      "!src/**/*.unit.{test,tests}.{js,ts}",
      "!src/**/*.test.util.{js,ts}"
    ]
  }
  