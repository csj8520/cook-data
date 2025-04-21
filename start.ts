import fs from 'fs/promises';
import path from 'path';
import { NodeWalkingStep, Parser } from 'commonmark';
import { execSync } from 'child_process';

const cwd = process.cwd();
interface CookMenu {
  title: string;
  level: number;
  url?: string;
  children: CookMenu[];
}

const cookMenu: CookMenu[] = [];

async function formatUrl(url: string) {
  return `/${path.relative(cwd, url)}`;
}

const readme = (await fs.readFile('./HowToCook/README.md')).toString();

const paser = new Parser();
const parsed = paser.parse(readme);
const walker = parsed.walker();
let event: NodeWalkingStep | null;
let isStart = false;
let lastMenu: CookMenu | null = null;
while ((event = walker.next())) {
  if (!event.entering) continue;
  const level = event.node.level;
  const title = event.node.firstChild?.literal || '';
  // 菜单
  if (event.node.type === 'heading') {
    let last = cookMenu.at(-1);
    if (!isStart) {
      if (title === '搭建环境') isStart = true;
      else continue;
    }
    const _lastMenu: CookMenu = { title, level, children: [] };
    if (!last || level <= last.level) {
      cookMenu.push(_lastMenu);
      lastMenu = _lastMenu;
    } else {
      while (level > (last.children.at(-1)?.level ?? Infinity)) {
        lastMenu = last.children.at(-1)!;
      }
      last.children.push(_lastMenu);
      lastMenu = _lastMenu;
    }
    continue;
  }
  if (!lastMenu) continue;
  if (event.node.type === 'link') {
    const url = decodeURIComponent(event.node.destination!);
    if (url.startsWith('starsystem/')) {
      const menu: CookMenu = { title, level: lastMenu.level + 1, children: [] };
      lastMenu.children.push(menu);
      const filePath = path.join(cwd, 'HowToCook', url);
      const stars = (await fs.readFile(filePath)).toString();
      let event2: NodeWalkingStep | null;
      const walker2 = paser.parse(stars).walker();
      while ((event2 = walker2.next())) {
        if (!event2.entering) continue;
        if (event2.node.type === 'link') {
          menu.children.push({
            title: event2.node.firstChild?.literal || '',
            level: menu.level + 1,
            url: await formatUrl(path.join(path.dirname(filePath), decodeURIComponent(event2.node.destination!))),
            children: [],
          });
        }
      }
    } else {
      const menu: CookMenu = { title, level: lastMenu.level + 1, children: [], url: await formatUrl(path.join(cwd, 'HowToCook', url)) };
      lastMenu.children.push(menu);
    }
  }
}
const version = execSync('git rev-parse HEAD:HowToCook').toString().trim();

await fs.writeFile(
  './data/menu.json',
  JSON.stringify({
    code: 0,
    version,
    updateTime: Date.now(),
    data: { title: '程序员做饭指北', children: cookMenu, level: 0 },
  }),
);
