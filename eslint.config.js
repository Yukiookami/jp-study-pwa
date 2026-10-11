import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
export default ts.config({ignores:['**/dist/**','**/node_modules/**','apps/api/prisma/**']},js.configs.recommended,...ts.configs.recommended,...vue.configs['flat/recommended'],{languageOptions:{globals:{...globals.browser,...globals.node}},rules:{'@typescript-eslint/no-explicit-any':'off','vue/multi-word-component-names':'off','vue/max-attributes-per-line':'off','vue/html-self-closing':'off'}},{files:['**/*.vue'],languageOptions:{parserOptions:{parser:ts.parser}}},prettier);
