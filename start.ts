import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { program } from 'commander';

const options = program.option('-e, --exclude <string...>', '', []).parse().opts<{ exclude: string[] }>();

const cwd = process.cwd();
interface CookMenu {
  title: string;
  level: number;
  url?: string;
  // desc: string;
  star: number;
  children: CookMenu[];
  tag: string[];
}

function formatUrl(url: string) {
  return `/${path.relative(cwd, url)}`;
}

function getLastForLevel(menu: CookMenu[], level: number) {
  let last = menu[menu.length - 1];
  for (let i = 0; i < level; i++) {
    if (last.children.length === 0) break;
    last = last.children[last.children.length - 1];
  }
  return last;
}

async function handle(file: string) {
  const cookMenu: CookMenu[] = [];
  const readme = (await fs.readFile(file)).toString();

  const lines = readme
    .split('\n')
    .map(it => it.trim())
    .filter(Boolean);

  let level = 0;

  for (const line of lines) {
    const title = line.match(/^(#+)\s+(.*)$/);
    if (title) {
      level = title[1].length - 1;
      const titleStr = title[2];
      const menu: CookMenu = { title: titleStr, level, children: [], star: 0, tag: [] };
      if (level === 0) {
        cookMenu.push(menu);
      } else {
        const last = getLastForLevel(cookMenu, level - 1);
        last.children.push(menu);
      }
    }

    const link = line.match(/^[\-\*]\s+\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const title = link[1];
      const url = link[2];
      const last = getLastForLevel(cookMenu, level);
      const filePath = path.join(path.dirname(file), url);
      if (url.startsWith('starsystem')) {
        const children = await handle(filePath);
        const menu: CookMenu = { title, level: level + 1, children: children[0].children, star: 0, tag: [] };
        last.children.push(menu);
      } else {
        const isExist = await fs.access(filePath, fs.constants.R_OK).catch(() => false);
        if (isExist === false) continue;
        const book = (await fs.readFile(filePath)).toString();

        const tagRaw = book.match(/必备原料和工具([\s\S]+?)计算/)?.[1] ?? '';
        const tag = tagRaw
          .split('\n')
          .map(it => it.replace(/^[\-\*\+\#\s]*/, ''))
          .filter(it => !it.startsWith('![') && !it.startsWith('>') && !it.startsWith('<!--') && !/(原料)|(工具)/.test(it))
          .map(it =>
            it
              .replace(/\[(.+)\]\(.+\)/g, '$1')
              .replace(/[（\(\[].*[）\)\]]/g, '')
              .replace(/\*/g, '')
              .trim(),
          )
          .filter(Boolean);

        const [_, star = ''] = book.match(/预估烹饪难度：(★+)/) ?? [];
        const menu: CookMenu = {
          title,
          level: level + 1,
          url: formatUrl(filePath),
          // desc: star,
          star: star.length,
          children: [],
          tag,
        };
        last.children.push(menu);
      }
    }
  }

  return cookMenu;
}

function filterEmptyData(cookMenu: CookMenu[]): CookMenu[] {
  return cookMenu.map(it => ({ ...it, children: filterEmptyData(it.children) })).filter(it => it.children.length > 0 || it.url);
}

function excludeData(cookMenu: CookMenu[], exclude: string[]): CookMenu[] {
  return cookMenu.filter(it => !exclude.includes(it.title)).map(it => ({ ...it, children: excludeData(it.children, exclude) }));
}

const abort: CookMenu = {
  title: '关于',
  level: 0,
  children: [
    {
      title: '关于',
      level: 0,
      children: [],
      star: 0,
      tag: [],
      url: '/HowToCook/README.md',
    },
  ],
  star: 0,
  tag: [],
};

const cook = await handle(path.join(cwd, './HowToCook/README.md'));
cook[0].children.push(abort);

const cookMenu = excludeData(filterEmptyData(cook), options.exclude)[0];

const version = execSync('git rev-parse HEAD:HowToCook').toString().trim();

await fs.writeFile(
  './data/menu.json',
  JSON.stringify({
    code: 0,
    version,
    data: { ...cookMenu, title: '程序员做饭指北' },
  }),
);

console.log('Generate successfully version: ', version);
