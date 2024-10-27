import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TsResolverPlugin {
    apply(resolver) {
        resolver.hooks.resolve.tapAsync('TsResolverPlugin', (request, resolveContext, callback) => {
            if (request.request.endsWith('.js')) {
                const tsRequest = request.request.replace(/\.js$/, '.ts');
                const tsPath = path.resolve(request.path, tsRequest);

                if (fs.existsSync(tsPath)) {
                    const newRequest = Object.assign({}, request, { request: tsRequest });
                    return resolver.doResolve(resolver.hooks.resolve, newRequest, null, resolveContext, callback);
                }
            }
            callback();
        });
    }
}

export default {
    entry: './src/index.ts',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
        extensions: ['.ts', '.js'],
        plugins: [new TsResolverPlugin()],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'index.html', to: 'index.html' },
                { from: 'game.html', to: 'game.html' },
                { from: 'assets', to: 'assets' },
            ],
        }),
    ],
    mode: 'development',
};
