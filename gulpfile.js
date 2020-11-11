const del = require('del');

const {join} = require('path');
const {readdirSync, lstatSync} = require('fs');

const {series, src, dest, watch} = require('gulp');

const hb = require('gulp-hb');
const mjml = require('gulp-mjml');
const mjmlEngine = require('mjml');

const i18next = require('i18next');
const i18nextBackend = require('i18next-fs-backend');
const i18nextParser = require('i18next-parser').gulp;

const browserSync = require('browser-sync');
const reload = browserSync.reload;

const nodemailer = require("nodemailer");

const ENVIRONMENT = process.env.ENVINRONMENT; // provide different values per environment

const dirs = {
  output: './dist',
  output_assets: './dist/assets',
  output_templates: './dist/templates',
  _base_src: './src',
  resources: './src/resources',
  assets: './src/resources/assets',
  locales: './src/resources/locales',
  templates: './src/templates',
};

const files = {
  assets: `${dirs.assets}/**/*`,
  locales: `${dirs.locales}/**/*.json`,
  templates: `${dirs.templates}/html/**/*.mjml`,
  templatesExcluded: `!${dirs.templates}/html/**/shared/**/*.mjml`,
};

const i18nextDefaultNamespace = 'translations';

i18next.use(i18nextBackend).init({
  initImmediate: false,
  fallbackLng: 'en',
  lng: 'en',
  preload: readdirSync(join(__dirname, dirs.locales)).filter((fileName) => {
    const joinedPath = join(join(__dirname, dirs.locales), fileName);
    return lstatSync(joinedPath).isDirectory();
  }),
  ns: i18nextDefaultNamespace,
  defaultNS: i18nextDefaultNamespace,
  backend: {
    loadPath: join(__dirname, `${dirs.locales}/{{lng}}/{{ns}}.json`),
  },
});

handleError = (err) => {
  console.log(err.toString());
};

const cleanup = () => {
  return del(dirs.output);
};

const extractI18nKeys = () => {
  return src(files.templates).pipe(
      new i18nextParser({
        locales: i18next.options.preload,
        defaultNamespace: i18nextDefaultNamespace,
        createOldCatalogs: true,
        lexers: {
          mjml: [
            {
              lexer: 'HandlebarsLexer',
              functions: ['i18n'], // Array of functions to match
            },
          ],
        },
        output: `locales/$LOCALE/$NAMESPACE.json`,
      }),
  ).pipe(dest(dirs.resources));
};

function getEnvSettings() {
  return ENVIRONMENT ?
      require(`./src/resources/env/${ENVIRONMENT}.json`) :
      null;
}

const generateTemplates = (cb) => {
  const mjmlOptions = {
    validationLevel: 'strict',
    minify: ENVIRONMENT === 'prod',
  };

  i18next.options.preload.map((lang) => {
    return src([files.templates, files.templatesExcluded]).pipe(
        mjml(mjmlEngine, mjmlOptions)).on('error',
        handleError).pipe(
        hb().data({passwordResetLink: 'http://example.com', ...getEnvSettings()}).helpers({
          i18n: (context, options) => {
            i18next.changeLanguage(lang);
            let defaultValue;

            if (
                typeof context === 'object' &&
                typeof options === 'undefined'
            ) {
              // {{i18n defaultKey='loading'}}
              options = context;
              context = undefined;
            }

            if (
                typeof options === 'object' &&
                typeof options.fn === 'function'
            ) {
              // {{#i18n}}<span>Some text</span>{{/i18n}}
              // {{#i18n this}}<p>Description: {{description}}</p>{{/i18n}}
              defaultValue = options.fn(context);
            } else if (typeof context === 'string') {
              // {{i18n 'Basic Example'}}
              // {{i18n '__first-name__ __last-name__' first-name=firstname last-name=lastname}}
              // {{i18n 'English' defaultKey='locale:language.en-US'}}
              defaultValue = context;
            }

            options = options || {};
            options.hash = options.hash || {};

            const opts = options.hash;
            opts.defaultValue = defaultValue;
            const defaultKey = options.hash.defaultKey;
            let result;

            if (typeof defaultKey === 'undefined') {
              result = i18next.t(defaultValue, opts);
            } else {
              result = i18next.t(defaultKey, opts);
            }
            return result;
          },
        }),
    ).on('error', handleError).pipe(dest(`${dirs.output}/templates/${lang}`));
  });
  cb();
};

const previewEmail = () => {
  const transporter = nodemailer.createTransport({
    host: "localhost",
    port: "1025",
    ignoreTLS: true
  })
}

const defaultSeries = series(cleanup, generateTemplates);

const previewTemplates = () => {
  browserSync.init({
    server: {
      baseDir: dirs.output_templates,
      directory: true,
    },
  });
  watch(files.templates, generateTemplates, {cwd: dirs.output_templates}).on(
      'change', reload);
};

// gulp task exports
exports.watch = previewTemplates;
exports.extractI18nKeys = extractI18nKeys;
exports.default = defaultSeries;
