import * as path from "path"
import { Configuration, RuleSetRule } from "webpack"

const OUTPUT_DIR = 'dist'

const commonRules:RuleSetRule[] = [
  {
    test: /\.tsx?$/,
    loader: "ts-loader"
  },  
  {
    test: /\.(asdata|md|html|css)$/i,
    type: 'asset/source'
  }  
]

const commonConfig: (mode: "development" | "production") => Configuration = (mode: "development" | "production") => {
  const rules:RuleSetRule[] = (mode === "development") ? [...commonRules, { enforce: "pre", test: /\.js\.map$/, loader: "source-map-loader" } ] : commonRules

  return {
    devtool: "source-map",
    resolve: {
      extensions: ['.webpack.js', '.web.js', '.ts', '.tsx', '.js', '.json']
    },
    mode: mode,
    module: {
      rules: rules
    }
  }
}

const mainConfig: (mode: "development" | "production") => Configuration = (mode: "development" | "production") => {
  return {
    ...commonConfig(mode),
    name: 'main',
    entry: './src/typesafe-idb.ts',
    output: {
      filename: 'typesafe-idb.js',
      path: path.join(__dirname, OUTPUT_DIR),
      library: 'typesafe-idb',
      libraryTarget: 'umd',
      publicPath: ''
    }
  }
}

module.exports = (_env:any, _mode:"development" | "production" | "none" | undefined) => {
  const mode:"development" | "production" = (_mode === "production") ? "production" : "development"  
  return [ mainConfig(mode) ]
}