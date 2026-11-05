// SLABBY_LOCAL=1 makes a build that a free (personal) Apple team can sign over a cable:
// its own bundle id and no Sign in with Apple, which personal teams can't use. Everything else
// is identical. EAS / TestFlight builds don't set it and use app.json as is.
module.exports = ({ config }) => {
  if (process.env.SLABBY_LOCAL !== '1') return config;
  const pluginName = (p) => (Array.isArray(p) ? p[0] : p);
  return {
    ...config,
    ios: { ...config.ios, bundleIdentifier: 'app.slabby.local', usesAppleSignIn: false },
    plugins: (config.plugins ?? []).filter((p) => pluginName(p) !== 'expo-apple-authentication'),
  };
};
