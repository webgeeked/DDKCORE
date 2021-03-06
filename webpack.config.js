const path = require('path');
const nodeExternals = require('webpack-node-externals');

const DIR = path.resolve(__dirname);
const OUTPUT_DIR = path.resolve(__dirname, 'dist');

const baseConfig = {
    mode: 'development',
    target: 'node',
    externals: [nodeExternals()],
    node: {
        __dirname: false,
        __filename: false,
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                exclude: /node_modules/,
                use: 'ts-loader',
            },
            {
                test: /\.(sql|ttf|gif|png|ico)$/,
                use: 'file-loader',
            },
            {
                test: /\.(html)$/,
                use: 'html-loader',
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
};

const apiConfig = {
    entry: path.join(DIR, 'api', 'server.ts'),
    context: path.resolve(DIR, 'api'),
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        alias: {
            api: path.resolve(DIR, 'api'),
            shared: path.resolve(DIR, 'shared'),
            config: path.resolve(DIR, 'config'),
        },
    },
    output: {
        filename: 'app.js',
        path: path.join(OUTPUT_DIR, 'api'),
        publicPath: '/',
    },
};

const coreConfig = {
    entry: path.join(DIR, 'core', 'server.ts'),
    context: path.resolve(DIR, 'core'),
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        alias: {
            core: path.resolve(DIR, 'core'),
            shared: path.resolve(DIR, 'shared'),
            config: path.resolve(DIR, 'config'),
        },
    },
    output: {
        filename: 'app.js',
        path: path.join(OUTPUT_DIR, 'core'),
        publicPath: '/',
    },
};

const testAPIConfig = {
    entry: path.join(DIR, 'test', 'api', 'test.ts'),
    context: path.resolve(DIR, 'test'),
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        alias: {
            test: path.resolve(DIR, 'test'),
            shared: path.resolve(DIR, 'shared'),
            config: path.resolve(DIR, 'config'),
        },
    },
    output: {
        filename: 'app.js',
        path: path.join(OUTPUT_DIR, 'test', 'api'),
        publicPath: '/',
    },
};

const generateGenesisConfig = {
    entry: path.join(DIR, 'core', 'genesisGenerator.ts'),
    context: path.resolve(DIR, 'core'),
    resolve: {
        extensions: ['.ts', '.js', '.json'],
        alias: {
            core: path.resolve(DIR, 'core'),
            shared: path.resolve(DIR, 'shared'),
        },
    },
    output: {
        filename: 'generateGenesis.js',
        path: path.join(OUTPUT_DIR),
        publicPath: '/',
    }
};

module.exports = env => {

    let appConfig;

    switch (env.service) {
        case 'api':
            appConfig = apiConfig;
            break;
        case 'core':
            appConfig = coreConfig;
            break;
        case 'genesis':
            appConfig = generateGenesisConfig;
            break;
        case 'test-api':
            appConfig = testAPIConfig;
    }
    return Object.assign({}, baseConfig, appConfig);
};
