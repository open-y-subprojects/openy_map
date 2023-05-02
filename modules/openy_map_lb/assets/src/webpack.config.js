const path = require('path');

module.exports = {
  // watch: true, we can enable watch via config too
  // mode: 'production', we can change the mode via config too
  node: {
    console: false,
    global: true,
    process: true,
    __filename: 'mock',
    __dirname: 'mock',
    Buffer: true,
    setImmediate: true
  },
  devtool: 'source-map',
  entry: './js/map.js',
  output: {
    path: path.resolve('../js'),
    filename: 'map.js'
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  }
};
