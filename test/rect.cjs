/* eslint-env node */
const assert = require('assert');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');
const { DOMParser } = require('xmldom');

// Exercise the real XML-to-Rect conversion; only the native rendering boundary is mocked.
const React = {
  Component: class {
    constructor(props) {
      this.props = props;
    }
  },
  memo: (component) => component,
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } })
};
const nativeSvg = { __esModule: true, default: 'Svg', Rect: 'Rect' };
const propTypes = { oneOfType: () => null, arrayOf: () => null };
const transform = (filename) =>
  babel.transformFileSync(path.join(__dirname, '..', filename), {
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    plugins: [
      require.resolve('babel-plugin-transform-react-jsx', {
        paths: [path.dirname(require.resolve('babel-preset-react-native/package.json'))]
      })
    ]
  }).code;

function load(filename, extra = '') {
  const module = { exports: {} };
  vm.runInNewContext(transform(filename) + extra, {
    module,
    exports: module.exports,
    DOMParser,
    console,
    require: (id) => {
      if (id === 'react') return React;
      if (id === 'react-native') return { View: 'View' };
      if (id === 'react-native-svg') return nativeSvg;
      if (id === 'prop-types') return propTypes;
      if (id === './utils') return load('utils.js');
      if (id === 'react-native/Libraries/Image/resolveAssetSource') return () => ({});
      if (id === 'xmldom') return { DOMParser };
      throw new Error(`Unexpected dependency: ${id}`);
    }
  });
  return module.exports;
}

const cases = [
  { attributes: 'rx="32"', rx: '32' },
  { attributes: 'ry="12"', ry: '12' },
  { attributes: 'rx="8" ry="16"', rx: '8', ry: '16' },
  { attributes: 'rx="25%" ry="50%"', rx: '25%', ry: '50%' },
  { attributes: 'rx="2.5px" ry="4px"', rx: '2.5', ry: '4' },
  { attributes: '' }
];

['index.js', 'index_class.js'].forEach((filename) => {
  const render =
    filename === 'index.js'
      ? 'inspectNode(rect, undefined, false, 64, 64)'
      : 'new module.exports({ style: {}, width: 64, height: 64 }).createSVGElement(rect, [])';
  const { renderRect } = load(
    filename,
    `
module.exports.renderRect = (xml) => {
  const rect = new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('rect')[0];
  return ${render};
};`
  );
  cases.forEach(({ attributes, rx, ry }) => {
    const element = renderRect(`<svg width="64" height="64"><rect x="2" y="3" width="64" height="64" fill="#e40030" ${attributes}/></svg>`);
    assert.strictEqual(element.type, 'Rect');
    assert.strictEqual(element.props.rx, rx, `${filename}: ${attributes} rx`);
    assert.strictEqual(element.props.ry, ry, `${filename}: ${attributes} ry`);
    assert.strictEqual(element.props.width, '64');
    assert.strictEqual(element.props.height, '64');
    assert.strictEqual(element.props.x, '2');
    assert.strictEqual(element.props.y, '3');
    assert.strictEqual(element.props.fill, '#e40030');
  });
  console.log(`${filename}: ${cases.length} rectangle cases passed`);
});
