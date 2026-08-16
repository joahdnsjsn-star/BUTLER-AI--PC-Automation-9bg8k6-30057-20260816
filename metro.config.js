// Standard Expo Metro config. Intentionally vanilla: custom serializers,
// transformer stubs, postinstall hooks and blockLists previously shipped here
// produced "bad application bundle: AppRegistry.runApplication()" on device.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
