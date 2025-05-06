import * as path from "path"
import * as glob from "glob"
import { Configuration, RuleSetRule } from "webpack"
import { Configuration as DevServerConfiguration } from "webpack-dev-server"
import HtmlWebpackPlugin from "html-webpack-plugin"

const DIST_DIR = 'dist'
const TMP_DIR="tmp"

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

const mainConfig: (name:string, mode: "development" | "production") => Configuration = (name:string, mode: "development" | "production") => {
  return {
    ...commonConfig(mode),
    name: name,
    entry: './src/typed-idb.ts',
    output: {
      filename: 'typed-idb.js',
      path: path.join(__dirname, DIST_DIR),
      library: 'typed-idb',
      libraryTarget: 'umd',
      publicPath: ''
    }
  }
}


const browserTestConfig:Configuration = {
    name: "test",
    mode: "development",
    devtool: "inline-source-map",
    entry : Object.fromEntries(glob.sync(path.resolve(__dirname, 'test/**/*.ts')).filter((filePath)=>filePath !== "").map((filePath)=> [path.basename(filePath, path.extname(filePath)), filePath])),
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    output: {
        path: path.resolve(__dirname, TMP_DIR),
        filename: "[name].js"
    },    
    plugins: [
        new HtmlWebpackPlugin({
            title: "Typed-idb Browser Test",
            template: "test/template.test.html",
            inject: false
        })
    ]
}




const getDevServerConfig:(name: string, port: number, dir: string)=>Configuration & { 'devServer': DevServerConfiguration } = (name: string, port:number, dir:string) => {
    return {
        name: name,
        mode: "development",        
        devServer: {
            host: '0.0.0.0',
            port: port,
            hot: true,
            open: true,
            static: {
                directory: dir,
                watch: true
            }
        }
    }
}

module.exports = [
  mainConfig("build", "development"),
  mainConfig("release", "production"),
  browserTestConfig, 
  getDevServerConfig("dev-server", 28080, 'tmp')
]