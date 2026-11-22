// Exercise the scaffolded module graph and both sides of the cut on CPU-only CI runners.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {filmFile, mimeOf} from '../scripts/static_files.mjs';

const skill = fileURLToPath(new URL('../', import.meta.url));
const project = path.join(mkdtempSync(path.join(tmpdir(), 'product-cut-')), 'project');
execFileSync(process.execPath, [path.join(skill, 'scripts/pilot.mjs'), 'product-cut', project]);
const require = createRequire(path.join(project, 'package.json'));
const {chromium} = require('playwright');
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});

try {
  for (const fmt of ['9x16', '16x9']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const file = url.origin === 'http://localhost' && filmFile(project, url.pathname);
      if (file) return route.fulfill({path: file, contentType: mimeOf(file)});
      errors.push('Unserved resource: ' + url.pathname);
      return route.abort();
    });
    await page.goto('http://localhost/film/index.html?fmt=' + fmt);
    await page.waitForFunction(() => window.READY, null, {timeout: 60000});
    const sample = time => page.evaluate(async t => {
      await window.seek(t);
      const source = document.querySelector('#stage canvas');
      const thumb = document.createElement('canvas');
      thumb.width = 72;
      thumb.height = 72;
      const ctx = thumb.getContext('2d');
      ctx.drawImage(source, 0, 0, 72, 72);
      const rgba = ctx.getImageData(0, 0, 72, 72).data;
      const colours = new Set();
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] > 0) colours.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
      }
      return {colours: colours.size, pixels: thumb.toDataURL()};
    }, time);
    const [turn, replay] = await page.evaluate(() => window.CUTS);
    assert.ok(turn > 0 && replay > turn);
    const first = await sample(turn / 2);
    const second = await sample((turn + replay) / 2);
    assert.ok(first.colours > 20 && second.colours > 20, 'both products must be visible');
    assert.notEqual(first.pixels, second.pixels, 'the cut must change the image');
    await sample(replay + 0.2);
    assert.equal((await sample(turn / 2)).pixels, first.pixels, 'seek back to the opening');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('Product cut, local module loading and backward seek passed in ' + fmt);
  }
} finally {
  await browser.close();
}
