/**
 * Created by mac on 18/2/26.
 */
'use strict';

const path = require('path');
const webpack = require('webpack');
const { dependencies } = require('./package.json')

module.exports ={
    target: 'electron-renderer',
    entry: {
        base: './publish/base'
    },
    output: {
        path: path.join(__dirname, 'publish'),
        filename: '[name].bundle.js'
    },
    externals: {
        sqlite3: "commonjs sqlite3",
    },
    node: {
        __dirname: process.env.NODE_ENV !== 'production',
        __filename: process.env.NODE_ENV !== 'production'
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin()
    ],
    module: {
        rules: [
            {
                test: /\.node$/,
                use: 'node-loader'
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.node']
    }
};