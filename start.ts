import fs from 'fs/promises';
import { glob } from 'glob';
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
      title: 'HowToCook',
      level: 0,
      children: [],
      star: 0,
      tag: [],
      url: '/HowToCook/README.md',
    },
    {
      title: 'CookLikeHOC',
      level: 0,
      children: [],
      star: 0,
      tag: [],
      url: '/CookLikeHOC/README.md',
    },
    {
      title: '程序员做饭指北',
      level: 0,
      children: [],
      star: 0,
      tag: [],
      url: '/README.md',
    },
  ],
  star: 0,
  tag: [],
};

const cook = await handle(path.join(cwd, './HowToCook/README.md'));
cook[0].children.push(abort);

const menuIdx = cook[0].children.findIndex(it => it.title === '菜谱');
if (menuIdx !== -1) {
  // 老乡鸡
  const menus = (await glob('./CookLikeHOC/*/README.md')).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN-u-co-pinyin'));
  const rootMenu: CookMenu = {
    title: '老乡鸡开源菜谱',
    level: 1,
    children: [],
    star: 0,
    tag: [],
  };
  for (const menu of menus) {
    const books = (await glob(path.join(menu, '../*.md'), { ignore: '**/README.md' })).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN-u-co-pinyin'));
    const _menu: CookMenu = {
      title: path.basename(path.dirname(menu)),
      level: 2,
      children: [],
      star: 0,
      tag: [],
    };
    for (const book of books) {
      const text = (await fs.readFile(book)).toString();
      const tagRaw = text.match(/(?:(?:配料)|(?:原料[:：]?)|(?:已知成分))(?:\s+)([\s\S]*?)\n\n/)?.[1] ?? '';
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
      _menu.children.push({
        title: path.basename(book, '.md'),
        level: 3,
        children: [],
        url: formatUrl(book),
        star: 0,
        tag,
      });
    }
    rootMenu.children.push(_menu);
  }
  cook[0].children.splice(menuIdx + 1, 0, rootMenu);
}

const cookMenu = excludeData(filterEmptyData(cook), options.exclude)[0];

const version = execSync('git rev-parse HEAD').toString().trim();

await fs.writeFile(
  './data/menu.json',
  JSON.stringify({
    code: 0,
    version,
    data: { ...cookMenu, title: '程序员做饭指北' },
  }),
);

console.log('Generate successfully version: ', version);
