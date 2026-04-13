import { describe, it, expect, vi } from 'vitest';
import { UndoManager, UndoEntry } from './UndoManager';

// ---------------------------------------------------------------------------
// Node 環境で未定義な ブラウザ API のスタブ
// ---------------------------------------------------------------------------
vi.stubGlobal('ImageData', class ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(widthOrData: number | Uint8ClampedArray, height: number, width?: number) {
    if (typeof widthOrData === 'number') {
      this.width = widthOrData;
      this.height = height;
      this.data = new Uint8ClampedArray(widthOrData * height * 4);
    } else {
      this.data = widthOrData;
      this.width = height;
      this.height = width ?? (widthOrData.length / height / 4);
    }
  }
});

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
function makeEntry(layerId = 1, size = 10): UndoEntry {
  return { layerId, imageData: new ImageData(size, size) };
}

// ---------------------------------------------------------------------------
// 初期状態
// ---------------------------------------------------------------------------
describe('UndoManager / 初期状態', () => {
  it('生成直後は canUndo / canRedo ともに false', () => {
    const um = new UndoManager();
    expect(um.canUndo()).toBe(false);
    expect(um.canRedo()).toBe(false);
  });

  it('popUndo / popRedo は null を返す', () => {
    const um = new UndoManager();
    expect(um.popUndo()).toBeNull();
    expect(um.popRedo()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pushAction
// ---------------------------------------------------------------------------
describe('UndoManager / pushAction', () => {
  it('pushAction 後に canUndo が true になる', () => {
    const um = new UndoManager();
    um.pushAction(makeEntry());
    expect(um.canUndo()).toBe(true);
  });

  it('pushAction は redo スタックをクリアする', () => {
    const um = new UndoManager();
    um.pushAction(makeEntry(1));
    const entry = um.popUndo()!;
    um.pushToRedo(entry);
    expect(um.canRedo()).toBe(true);

    um.pushAction(makeEntry(2));
    expect(um.canRedo()).toBe(false);
  });

  it('onStateChange コールバックが呼ばれる', () => {
    const onChange = vi.fn();
    const um = new UndoManager(300, onChange);
    um.pushAction(makeEntry());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// popUndo / popRedo
// ---------------------------------------------------------------------------
describe('UndoManager / popUndo・popRedo', () => {
  it('popUndo は pushAction した順で LIFO で返す', () => {
    const um = new UndoManager();
    const e1 = makeEntry(1);
    const e2 = makeEntry(2);
    um.pushAction(e1);
    um.pushAction(e2);

    expect(um.popUndo()).toBe(e2);
    expect(um.popUndo()).toBe(e1);
    expect(um.popUndo()).toBeNull();
  });

  it('popRedo は pushToRedo した順で LIFO で返す', () => {
    const um = new UndoManager();
    const e1 = makeEntry(1);
    const e2 = makeEntry(2);
    um.pushToRedo(e1);
    um.pushToRedo(e2);

    expect(um.popRedo()).toBe(e2);
    expect(um.popRedo()).toBe(e1);
    expect(um.popRedo()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pushToUndo (redo 操作用: redo スタックを破棄しない)
// ---------------------------------------------------------------------------
describe('UndoManager / pushToUndo', () => {
  it('pushToUndo は redo スタックを破棄しない', () => {
    const um = new UndoManager();
    um.pushToRedo(makeEntry(1));
    um.pushToUndo(makeEntry(2));
    expect(um.canRedo()).toBe(true);
    expect(um.canUndo()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------
describe('UndoManager / clear', () => {
  it('clear 後は canUndo / canRedo ともに false', () => {
    const um = new UndoManager();
    um.pushAction(makeEntry(1));
    um.pushAction(makeEntry(2));
    const entry = um.popUndo()!;
    um.pushToRedo(entry);

    um.clear();
    expect(um.canUndo()).toBe(false);
    expect(um.canRedo()).toBe(false);
  });

  it('clear で onStateChange が呼ばれる', () => {
    const onChange = vi.fn();
    const um = new UndoManager(300, onChange);
    um.pushAction(makeEntry());
    onChange.mockClear();

    um.clear();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// メモリ制限
// ---------------------------------------------------------------------------
describe('UndoManager / メモリ制限', () => {
  it('メモリバジェットを超えると古いエントリから削除される', () => {
    // 1MB budget, entries are 10×10×4 = 400 bytes each
    // 1MB = 1,048,576 bytes → can hold 2621 entries
    // Use larger entries: 100×100×4 = 40,000 bytes → 26 entries
    const budgetMB = 0.001; // ~1KB budget
    const um = new UndoManager(budgetMB);
    // Each 10×10 entry = 400 bytes, budget = ~1024 bytes → ~2 entries

    um.pushAction(makeEntry(1));
    um.pushAction(makeEntry(2));
    um.pushAction(makeEntry(3));
    um.pushAction(makeEntry(4));

    // Some old entries should have been trimmed, but at least 1 remains
    expect(um.canUndo()).toBe(true);

    // The most recent entry should survive
    const latest = um.popUndo()!;
    expect(latest.layerId).toBe(4);
  });

  it('メモリバジェットは undo + redo の合計で計算される', () => {
    const budgetMB = 0.001; // ~1KB
    const um = new UndoManager(budgetMB);

    um.pushAction(makeEntry(1));
    um.pushAction(makeEntry(2));
    um.pushAction(makeEntry(3));

    // Move one to redo stack
    const entry = um.popUndo()!;
    um.pushToRedo(entry);

    // Push new action - should still trim if over budget
    um.pushAction(makeEntry(4)); // This clears redo and trims undo
    expect(um.canRedo()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// undo/redo フロー統合テスト
// ---------------------------------------------------------------------------
describe('UndoManager / undo/redo フロー', () => {
  it('push → pop → pushToRedo → popRedo のサイクルが正しく動作する', () => {
    const um = new UndoManager();

    // ユーザーが3つのアクションを行う
    um.pushAction(makeEntry(1));
    um.pushAction(makeEntry(2));
    um.pushAction(makeEntry(3));
    expect(um.canUndo()).toBe(true);
    expect(um.canRedo()).toBe(false);

    // Undo: 3 → redo スタックへ
    const e3 = um.popUndo()!;
    expect(e3.layerId).toBe(3);
    um.pushToRedo(makeEntry(30)); // swap後の現在状態
    expect(um.canRedo()).toBe(true);

    // Undo: 2 → redo スタックへ
    const e2 = um.popUndo()!;
    expect(e2.layerId).toBe(2);
    um.pushToRedo(makeEntry(20));

    // Redo: 20 → undo スタックへ
    const r20 = um.popRedo()!;
    expect(r20.layerId).toBe(20);
    um.pushToUndo(makeEntry(200)); // swap後の現在状態

    // 新しいアクションで redo がクリアされる
    um.pushAction(makeEntry(99));
    expect(um.canRedo()).toBe(false);

    // undo スタックには [1, 200, 99] が残る
    expect(um.popUndo()!.layerId).toBe(99);
    expect(um.popUndo()!.layerId).toBe(200);
    expect(um.popUndo()!.layerId).toBe(1);
    expect(um.popUndo()).toBeNull();
  });
});
