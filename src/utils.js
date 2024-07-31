//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//////////////////////////////////////////////////////////////////////////////////////////

// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// This method can be used to write a message to GNOME Shell's log. This is enhances
// the standard log() functionality by prepending the extension's name and the location
// where the message was logged. As the extensions name is part of the location, you
// can more effectively watch the log output of GNOME Shell:
// journalctl -f -o cat | grep -E 'burn-my-windows|'
export function debug(message) {
  const stack = new Error().stack.split('\n');

  // Remove debug() function call from stack.
  stack.shift();

  // Find the index of the extension directory in the stack entry. We do not want to
  // print the entire absolute file path.
  const extensionRoot = stack[0].indexOf('burn-my-windows@schneegans.github.com');

  console.log('[' + stack[0].slice(extensionRoot) + '] ' + message);
}

// This method can be used to import a module in the GNOME Shell process only. This
// is useful if you want to use a module in extension.js, but not in the preferences
// process. This method returns null if it is called in the preferences process.
export async function importInShellOnly(module) {
  if (typeof global !== 'undefined') {
    return (await import(module)).default;
  }
  return null;
}

// This method can be used to import gettext. This is done differently in the
// GNOME Shell process and in the preferences process.
export async function importGettext() {
  if (typeof global === 'undefined') {
    return (await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'))
      .gettext;
  }
  return (await import('resource:///org/gnome/shell/extensions/extension.js')).gettext;
}

// Reads the contents of a file contained in the global resources archive. The data
// is returned as a string.
export function getStringResource(path) {
  const data = Gio.resources_lookup_data(path, 0);
  return new TextDecoder().decode(data.get_data());
}

// Executes a command asynchronously and returns the output from 'stdout' on success or
// throw an error with output from 'stderr' on failure. If given, input will be passed to
// 'stdin' and cancellable can be used to stop the process before it finishes.
// This is directly taken from here:
// https://gjs.guide/guides/gio/subprocesses.html#complete-examples
export async function executeCommand(argv, input = null, cancellable = null) {
  let cancelId = 0;
  let flags    = (Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);

  if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

  let proc = new Gio.Subprocess({argv: argv, flags: flags});
  proc.init(cancellable);

  if (cancellable instanceof Gio.Cancellable) {
    cancelId = cancellable.connect(() => proc.force_exit());
  }

  return new Promise((resolve, reject) => {
    proc.communicate_utf8_async(input, null, (proc, res) => {
      try {
        let [, stdout, stderr] = proc.communicate_utf8_finish(res);
        let status = proc.get_exit_status();

        if (status !== 0) {
          throw new Gio.IOErrorEnum({
            code: Gio.io_error_from_errno(status),
            message: stderr ? stderr.trim() : GLib.strerror(status)
          });
        }

        resolve(stdout.trim());
      } catch (e) {
        reject(e);
      } finally {
        if (cancelId > 0) {
          cancellable.disconnect(cancelId);
        }
      }
    });
  });
}

// Converts a hex, rgb, or rgba CSS-like color string to four numbers
// representing rgba values.
export function parseColor(color) {
  // Function to convert hex component to a number
  function hexToDecimal(hex) {
    return parseInt(hex, 16);
  }

  // Default RGBA values.
  let r = 0, g = 0, b = 0, a = 1;

  // Hex format.
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      // 3-digit hex
      r = hexToDecimal(hex[0] + hex[0]);
      g = hexToDecimal(hex[1] + hex[1]);
      b = hexToDecimal(hex[2] + hex[2]);
    } else if (hex.length === 6) {
      // 6-digit hex
      r = hexToDecimal(hex.substring(0, 2));
      g = hexToDecimal(hex.substring(2, 4));
      b = hexToDecimal(hex.substring(4, 6));
    }
  }
  // rgb() or rgba() format.
  else if (color.startsWith('rgb')) {
    // Extract the values inside the parentheses
    const rgbValues = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (rgbValues) {
      r = parseInt(rgbValues[1], 10);
      g = parseInt(rgbValues[2], 10);
      b = parseInt(rgbValues[3], 10);
      if (rgbValues[4] !== undefined) {
        a = parseFloat(rgbValues[4]);
      }
    }
  }

  return [ r/255, g/255, b/255, a ];
}
