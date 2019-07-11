// strict
module.exports = {
    "env": {
        "es6": true,
        "jest/globals": true,
    },
    "parser": "babel-eslint",
    "plugins": [
        "flowtype",
        "jest"
    ],
    "extends": [
        "eslint:recommended",
        "standard",
        "airbnb",
        "plugin:react/recommended",
        "lk"
    ],
    "parserOptions": {
        "ecmaVersion": 2018,
        "sourceType": "module",
        "ecmaFeatures": {
            "impliedStrict": true
        }
    },
    "rules": {
    },
    globals: {
        "WebSocket":true
    }
}
