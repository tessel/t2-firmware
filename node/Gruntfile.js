'use strict';

// System Objects
const cp = require('child_process');
const path = require('path');

// Third Party Dependencies
const tags = require('common-tags');


module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    nodeunit: {
      tests: [
        'test/unit/*.js'
      ]
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      all: [
        'tessel.js',
        'tessel-export.js',
        'test/**/*.js',
        'Gruntfile.js',
      ]
    },
    jscs: {
      all: [
        'tessel.js',
        'tessel-export.js',
        'test/**/*.js',
        'Gruntfile.js',
      ],
      options: {
        config: '.jscsrc'
      }
    },
    jsbeautifier: {
      all: [
        'tessel.js',
        'tessel-export.js',
        'test/**/*.js',
        'Gruntfile.js',
      ],
      options: {
        js: {
          braceStyle: 'collapse',
          breakChainedMethods: false,
          e4x: false,
          evalCode: false,
          indentChar: ' ',
          indentLevel: 0,
          indentSize: 2,
          indentWithTabs: false,
          jslintHappy: false,
          keepArrayIndentation: false,
          keepFunctionIndentation: false,
          maxPreserveNewlines: 10,
          preserveNewlines: true,
          spaceBeforeConditional: true,
          spaceInParen: false,
          unescapeStrings: false,
          wrapLineLength: 0
        }
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-jscs');
  grunt.loadNpmTasks('grunt-jsbeautifier');


  // 'npm test' runs these tasks
  grunt.registerTask('test', ['jshint', 'jscs', 'jsbeautifier', 'nodeunit']);

  // Default task.
  grunt.registerTask('default', ['test']);

  // Support running a single test suite
  grunt.registerTask('nodeunit:only', 'Run a single test specified by a target; usage: "grunt nodeunit:only:<module-name>[.js]"', function(file) {
    if (file) {
      grunt.config('nodeunit.tests', [
        'test/unit/' + file + '.js'
      ]);
    }

    grunt.task.run('nodeunit');
  });


  grunt.registerTask('changelog', '"changelog", "changelog:v0.0.0..v0.0.2" or "changelog:v0.0.0"', (arg) => {
    var done = grunt.task.current.async();
    var tags = cp.execSync('git tag --sort version:refname').toString().split('\n');
    var tagIndex = -1;
    var range;
    var revisionRange;

    if (!arg) {
      // grunt changelog
      range = tags.filter(Boolean).slice(-2);
    } else {
      if (arg.includes('..')) {
        // grunt changelog:<revision-range>
        // if (!arg.startsWith('v') || !arg.includes('..v')) {
        //   range = arg.split('..').map(tag => tag.startsWith('v') ? tag : `v${tag}`);
        // } else {
        //   // arg is a well formed <revision-range>
        //   revisionRange = arg;
        // }
        // arg is a well formed <revision-range>
        revisionRange = arg;
      } else {
        // grunt changelog:<revision>
        if (!arg.startsWith('v')) {
          arg = `v${arg}`;
        }

        tagIndex = tags.indexOf(arg);
        range = [tags[tagIndex - 1], tags[tagIndex]];
      }
    }

    if (!range && revisionRange) {
      range = revisionRange.split('..');
    }

    if (!revisionRange && (range && range.length)) {
      revisionRange = `${range[0]}..${range[1]}`;
    }

    cp.exec(`git log --format='|%h|%s|' ${revisionRange}`, (error, result) => {
      if (error) {
        console.log(error.message);
        return;
      }

      var rows = result.split('\n').filter(commit => {
        return !commit.includes('|Merge ') && !commit.includes(range[0]);
      });

      // Extra whitespace above and below makes it easier to quickly copy/paste from terminal
      grunt.log.writeln(`\n\n${changelog(rows)}\n\n`);

      done();
    });
  });
};

function changelog(rows) {
  return tags.stripIndent `
| Commit | Message/Description |
| ------ | ------------------- |
${rows.join('\n')}
`;
}
