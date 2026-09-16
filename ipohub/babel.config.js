module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Reanimated 4 delegates to worklets; this plugin must stay last.
    'react-native-worklets/plugin',
  ],
};
