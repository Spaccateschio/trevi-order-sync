import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { companyInitials, loadSidebarCollapsed, saveSidebarCollapsed, sidebarMainClass, sidebarRailClass, sidebarToggleLabel } from './sidebar-collapse';

const STORAGE_KEY = 'trevi:barra-laterale:compatta';

function withMemory(run: () => void) {
  const store = new Map<string, string>();
  const previous = (globalThis as Record<string, unknown>)['window'];
  (globalThis as Record<string, unknown>)['window'] = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
  try {
    run();
  } finally {
    if (previous === undefined) delete (globalThis as Record<string, unknown>)['window'];
    else (globalThis as Record<string, unknown>)['window'] = previous;
  }
}

describe('Barra laterale comprimibile', () => {
  it('senza preferenza salvata la barra resta larga', () => withMemory(() => assert.equal(loadSidebarCollapsed(), false)));
  it('la preferenza compressa viene ricordata', () => withMemory(() => {
    saveSidebarCollapsed(true);
    assert.equal(store_read(STORAGE_KEY), '1');
    assert.equal(loadSidebarCollapsed(), true);
  }));
  it('la preferenza larga viene ricordata', () => withMemory(() => {
    saveSidebarCollapsed(true);
    saveSidebarCollapsed(false);
    assert.equal(loadSidebarCollapsed(), false);
  }));
  it('una memoria locale rotta non blocca la pagina', () => {
    const previous = (globalThis as Record<string, unknown>)['window'];
    (globalThis as Record<string, unknown>)['window'] = {
      localStorage: { getItem: () => { throw new Error('accesso negato'); }, setItem: () => { throw new Error('accesso negato'); } },
    };
    try {
      assert.equal(loadSidebarCollapsed(), false);
      saveSidebarCollapsed(true);
    } finally {
      if (previous === undefined) delete (globalThis as Record<string, unknown>)['window'];
      else (globalThis as Record<string, unknown>)['window'] = previous;
    }
  });
  it('barra e contenuto lasciano lo stesso spazio', () => {
    assert.match(sidebarRailClass(true), /w-\[72px\]/);
    assert.equal(sidebarMainClass(true), 'lg:pl-[72px]');
    assert.match(sidebarRailClass(false), /w-60/);
    assert.equal(sidebarMainClass(false), 'lg:pl-60');
  });
  it('il pulsante spiega cosa farà', () => {
    assert.equal(sidebarToggleLabel(true), 'Ingrandisci la barra laterale');
    assert.equal(sidebarToggleLabel(false), 'Comprimi la barra laterale');
  });
  it('le iniziali aziendali restano due', () => {
    assert.equal(companyInitials('Trevi Fruit Srl'), 'TF');
    assert.equal(companyInitials('3 EMME ROMA SRL'), '3E');
    assert.equal(companyInitials('Breda'), 'B');
    assert.equal(companyInitials('   '), '');
  });
});

function store_read(key: string) {
  return ((globalThis as Record<string, unknown>)['window'] as { localStorage: { getItem: (k: string) => string | null } }).localStorage.getItem(key);
}
