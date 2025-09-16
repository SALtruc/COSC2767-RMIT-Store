module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: [
    "**/tests/**/*.test.js",  // Matches test files in the tests folder
    "**/?(*.)+(spec|test).js" // Matches files with spec or test suffix
  ]

};
