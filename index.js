'use strict';

var twig = require('twig').twig;
var through = require('through2');
var path = require('path');
var minify = require('html-minifier').minify;

var config = {
    extensions: ['.twig', '.html'],
    relativePath: false,
    replacePaths: null, //{'/app': '@app', '/common': '@common'}
    minify: {
        removeComments : true,
        collapseWhitespace : true,
        conservativeCollapse : false,
        preserveLineBreaks : false,
        collapseBooleanAttributes : false,
        removeAttributeQuotes : true,
        removeRedundantAttributes : false,
        removeEmptyAttributes : false,
        removeStyleLinkTypeAttributes : false,
        removeOptionalTags : false,
        removeIgnored : false,
        removeEmptyElements : false,
        lint : false,
        keepClosingSlash : false,
        caseSensitive : false,
        minifyURLs : false
    }
}

/**
 * Takes a set of user-supplied options, and determines which set of file-
 * extensions to run twigify on.
 * @param   {object | array}    options
 * @param   {object}            options.extensions
 * @returns {Array}
 */
function getExtensions(options) {
    var extensions = config.extensions;

    if (options) {
        if (Object.prototype.toString.call(options) === '[object Array]') {
            extensions = options;
        } else if (options.extensions) {
            extensions = options.extensions;
        }
    }

    // Lowercase all file extensions for case-insensitive matching.
    extensions = extensions.map(function(ext) {
        return ext.toLowerCase();
    });

    return extensions;
}

/**
 * Returns whether the filename ends in a Twigifiable extension. Case
 * insensitive.
 * @param   {string} filename
 * @return  {boolean}
 */
function hasTwigifiableExtension(filename, extensions) {
    var file_extension = path.extname(filename).toLowerCase();
    return extensions.indexOf(file_extension) > -1;
}

/**
 * Compile twig template
 */
function compile(id, tplString) {
    if (typeof config.minify == 'object') {
        tplString = minify(tplString, config.minify);
    }

    var template = twig({
        id : id,
        data : tplString
    });

    var tokens = JSON.stringify(template.tokens);

    if (config.relativePath) {
        return 'Twig.twig({ id: __filename, path: __dirname, data:' + tokens + ', precompiled: true, allowInlineIncludes: true })';
    } else {
        if (config.replacePaths) {
            for (var search in config.replacePaths) {
                var pos = id.indexOf(search);
                if (pos > -1) {
                    id = id.substring(pos);
                    id = id.replace(search, config.replacePaths[search]);
                    break;
                }
            }
        }
        //console.log(id);
        // the id will be the filename to the require()ing module
        return 'Twig.twig({ id: "'+ id +'", data:' + tokens + ', precompiled: true, allowInlineIncludes: true })';
    }
}

/**
 * Wrap as module
 */
function process(source) {
    return ('\nmodule.exports = ' + source + ';');
}


/**
 * Exposes the Browserify transform function.
 * This handles two use cases:
 * - Factory: given no arguments or options as first argument it returns
 *   the transform function
 * - Standard: given file (and optionally options) as arguments a stream is
 *   returned. This follows the standard pattern for browserify transformers.
 * @param   {string}            file
 * @param   {object}    options
 * @returns {stream | function} depending on if first argument is string.
 */
module.exports = function(file, params) {
    /*
    {Boolen} params.minify - параметры minify
    {Array} params.extensions - массив расширений
    */

    /**
     * The function Browserify will use to transform the input.
     * @param {String} file
     * @param {Object} [params]
     * @returns {Stream}
     */
    function twigifyTransform(file) {

        if (!params) {
            params = {};
        }

        var ext = getExtensions(params.extensions);
        if (!hasTwigifiableExtension(file, ext)) {
            return through();
        }

        if (params.minify != undefined) {
            config.minify = params.minify;
        }

        if (params.relativePath != undefined) {
            config.relativePath = !!params.relativePath;
        }

        if (typeof params.replacePaths == 'object') {
            config.replacePaths = params.replacePaths;
        }

        var buffers = [];

        function push(chunk, enc, next) {
            buffers.push(chunk);
            next();
        }

        function end(next) {
            var tplString = Buffer.concat(buffers).toString();
            var compiledTwig;

            try {
                compiledTwig = compile(file, tplString);
            } catch(e) {
                return this.emit('error', e);
            }

            this.push(process(compiledTwig));
            next();
        }

        return through(push, end);
    }

    if (typeof file !== 'string') {
        // Factory: return a function.
        // Set options variable here so it is ready for when browserifyTransform
        // is called. Note: first argument is the options.
        params = file;
        return twigifyTransform;
    } else {
        return twigifyTransform(file);
    }
}
