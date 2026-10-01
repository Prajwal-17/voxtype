/* global require, module, __dirname */
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro'); // make sure this import exists

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
});

// Uniwind 1.12 lists InputAccessoryView as a web wrapper but does not ship it.
// Keep React Native Web's own implementation for that one export.
const uniwindResolve = uniwindConfig.resolver.resolveRequest;
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === './exports/InputAccessoryView') {
    return context.resolveRequest(context, moduleName, platform);
  }
  return uniwindResolve(context, moduleName, platform);
};

module.exports = uniwindConfig;
