import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FormField,
  FormActionBar,
  NumField,
  MoneyDisplay,
  extractFieldErrors,
  computeViewportState,
  parseNumInputValue,
  shouldSyncExternalNumValue,
} from './ui.js';
import { formatMoney } from './format.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CSS sizing and touch target contracts (TASK-022)', () => {
  const cssPath = resolve(__dirname, '../styles.css');
  const css = readFileSync(cssPath, 'utf8');

  it('defines --target-min: 44px and --target-gap: 8px at :root', () => {
    expect(css).toMatch(/--target-min:\s*44px/);
    expect(css).toMatch(/--target-gap:\s*8px/);
  });

  it('enforces min-height >= 44px for buttons, inputs, selects, and textareas', () => {
    expect(css).toMatch(/\.button\s*\{[^}]*min-height:\s*var\(--target-min,\s*44px\)/);
    expect(css).toMatch(/\.button-text\s*\{[^}]*min-height:\s*var\(--target-min,\s*44px\)/);
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*min-height:\s*var\(--target-min,\s*44px\)/);
    expect(css).toMatch(/\.close-button\s*\{[^}]*min-height:\s*var\(--target-min,\s*44px\)/);
    expect(css).toMatch(/\.check-row\s*\{[^}]*min-height:\s*var\(--target-min,\s*44px\)/);
  });

  it('enforces action bar spacing at least 8px', () => {
    expect(css).toMatch(/\.form-actions\s*\{[^}]*gap:\s*max\(8px,\s*var\(--target-gap,\s*8px\)\)/);
    expect(css).toMatch(/\.form-action-bar\s*\{[^}]*gap:\s*max\(8px,\s*var\(--target-gap,\s*8px\)\)/);
    expect(css).toMatch(/\.dialog-actions,\s*\.item-actions,\s*\.source-actions,\s*\.operations-actions,\s*\.vo3d-owner-actions\s*\{[^}]*gap:\s*max\(8px,\s*var\(--target-gap,\s*8px\)\)/);
  });

  it('provides sticky action bar with safe area inset padding', () => {
    expect(css).toMatch(/\.form-action-bar\.is-sticky\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.form-action-bar\.is-sticky\s*\{[^}]*bottom:\s*0/);
    expect(css).toMatch(/\.form-action-bar\.is-sticky\s*\{[^}]*padding-bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  });

  it('enforces overflow-wrap: anywhere and word-break on nominal and card facts containers', () => {
    expect(css).toMatch(/\.nominal-wrap[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.nominal-wrap[^{]*\{[^}]*word-break:\s*break-word/);
    expect(css).toMatch(/\.vo3d-sheet-body\s*\{[^}]*overflow-x:\s*hidden/);
  });
});

describe('visual viewport computations and keyboard offset tracking', () => {
  it('returns default layout viewport when window/visualViewport is undefined', () => {
    const state = computeViewportState(undefined);
    expect(state.isKeyboardOpen).toBe(false);
    expect(state.keyboardHeight).toBe(0);
    expect(state.offsetBottom).toBe(0);
    expect(state.viewportHeight).toBe(800);
  });

  it('detects virtual keyboard opening when visualViewport height shrinks', () => {
    const win = {
      innerHeight: 800,
      innerWidth: 375,
      visualViewport: {
        height: 420,
        width: 375,
        offsetTop: 0,
      },
    };

    const state = computeViewportState(win);
    expect(state.isKeyboardOpen).toBe(true);
    expect(state.keyboardHeight).toBe(380);
    expect(state.viewportHeight).toBe(420);
    expect(state.offsetBottom).toBe(380);
  });

  it('detects keyboard offset when visualViewport has offsetTop', () => {
    const win = {
      innerHeight: 900,
      innerWidth: 400,
      visualViewport: {
        height: 500,
        width: 400,
        offsetTop: 100,
      },
    };

    const state = computeViewportState(win);
    expect(state.isKeyboardOpen).toBe(true);
    expect(state.keyboardHeight).toBe(400);
    expect(state.offsetBottom).toBe(300);
  });

  it('recognizes regular screen orientation/resize without keyboard opening', () => {
    const win = {
      innerHeight: 750,
      innerWidth: 375,
      visualViewport: {
        height: 750,
        width: 375,
        offsetTop: 0,
      },
    };

    const state = computeViewportState(win);
    expect(state.isKeyboardOpen).toBe(false);
    expect(state.keyboardHeight).toBe(0);
    expect(state.offsetBottom).toBe(0);
  });
});

describe('FormActionBar component', () => {
  it('renders toolbar with role="toolbar" and action buttons', () => {
    const html = renderToStaticMarkup(
      <FormActionBar note="Perubahan belum disimpan." ariaLabel="Aksi profil">
        <button type="submit" className="button button-primary">Simpan</button>
        <button type="button" className="button button-secondary">Batal</button>
      </FormActionBar>
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Aksi profil"');
    expect(html).toContain('form-action-bar');
    expect(html).toContain('is-sticky');
    expect(html).toContain('form-action-note');
    expect(html).toContain('Perubahan belum disimpan.');
    expect(html).toContain('Simpan</button>');
    expect(html).toContain('Batal</button>');
  });
});

describe('FormField and FieldError inline error rendering', () => {
  it('renders field label, required indicator, control, and help text', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Tarif minimum"
        required
        help="Gunakan nilai dalam USD"
        id="field-min-price"
      >
        <input type="number" id="min-price-input" />
      </FormField>
    );

    expect(html).toContain('Tarif minimum');
    expect(html).toContain('field-required');
    expect(html).toContain('Gunakan nilai dalam USD');
    expect(html).toContain('form-field-control');
    expect(html).not.toContain('has-error');
  });

  it('renders field error with role="alert" and warning icon adjacent to field', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Tarif minimum"
        error="Tarif minimum tidak boleh kurang dari 1"
        id="field-min-price"
      >
        <input type="number" id="min-price-input" />
      </FormField>
    );

    expect(html).toContain('has-error');
    expect(html).toContain('role="alert"');
    expect(html).toContain('field-error');
    expect(html).toContain('Tarif minimum tidak boleh kurang dari 1');
    expect(html).toContain('field-error-icon');
  });

  it('wires aria-invalid and aria-describedby with errorId to child input control', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Tarif minimum"
        error="Tarif minimum tidak boleh kurang dari 1"
        id="field-min-price"
      >
        <input type="number" id="min-price-input" />
      </FormField>
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="field-min-price-error"');
    expect(html).toContain('id="field-min-price-error"');
  });

  it('wires aria-describedby containing both error and help IDs to child control', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Tarif minimum"
        error="Nilai tidak valid"
        help="Gunakan mata uang USD"
        id="field-min-price"
      >
        <input type="number" id="min-price-input" />
      </FormField>
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="field-min-price-error field-min-price-help"');
    expect(html).toContain('id="field-min-price-error"');
    expect(html).toContain('id="field-min-price-help"');
  });

  it('preserves existing child aria-describedby and merges help and error IDs', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Tarif minimum"
        error="Nilai tidak valid"
        help="Bantuan tarif"
        id="field-min-price"
      >
        <input type="number" id="min-price-input" aria-describedby="custom-hint" />
      </FormField>
    );

    expect(html).toContain('aria-describedby="field-min-price-error field-min-price-help custom-hint"');
  });

  it('wires helpId to aria-describedby without aria-invalid when field has no error', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Zona waktu"
        help="Contoh: Asia/Jakarta"
        id="field-timezone"
      >
        <input id="timezone-input" />
      </FormField>
    );

    expect(html).not.toContain('aria-invalid');
    expect(html).toContain('aria-describedby="field-timezone-help"');
    expect(html).toContain('id="field-timezone-help"');
  });

  it('binds label htmlFor and control id automatically when htmlFor is provided', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Zona waktu"
        htmlFor="tz-control"
        id="field-timezone"
      >
        <input />
      </FormField>
    );

    expect(html).toContain('for="tz-control"');
    expect(html).toContain('id="tz-control"');
  });

  it('supports explicit render prop API to wire accessibility props to controls', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Catatan"
        error="Catatan wajib diisi"
        id="field-notes"
        htmlFor="notes-textarea"
      >
        {(props) => <textarea {...props} rows={4} />}
      </FormField>
    );

    expect(html).toContain('for="notes-textarea"');
    expect(html).toContain('id="notes-textarea"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="field-notes-error"');
    expect(html).toContain('Catatan wajib diisi');
  });

  it('wires accessibility attributes to select and textarea elements seamlessly', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Bahasa kerja"
        error="Pilih bahasa"
        id="field-lang"
        htmlFor="lang-select"
      >
        <select>
          <option value="id">Bahasa Indonesia</option>
        </select>
      </FormField>
    );

    expect(html).toContain('for="lang-select"');
    expect(html).toContain('id="lang-select"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="field-lang-error"');
  });

  it('wires NumField inside FormField with matching error and describedBy IDs', () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Tarif minimum"
        error="Tarif minimum tidak boleh 0"
        id="field-min-price"
        htmlFor="profile-min-price"
      >
        <NumField value={0} onChange={() => undefined} />
      </FormField>
    );

    expect(html).toContain('for="profile-min-price"');
    expect(html).toContain('id="profile-min-price"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="field-min-price-error"');
  });

  it('parses structured API validation error issues to target specific fields', () => {
    const apiError = 'Data profil tidak valid minPrice: Number must be greater than 0; specializations: Minimal 1 spesialisasi';
    const parsed = extractFieldErrors(apiError);

    expect(parsed.minPrice).toBe('Number must be greater than 0');
    expect(parsed.specializations).toBe('Minimal 1 spesialisasi');
  });

  it('handles null, undefined, or unstructured error messages gracefully', () => {
    expect(extractFieldErrors(null)).toEqual({});
    expect(extractFieldErrors(undefined)).toEqual({});
    expect(extractFieldErrors('Gagal menghubungi server')).toEqual({});
  });
});

describe('NumField component', () => {
  it('renders numeric input with 44px min-height contract and preserved value', () => {
    const html = renderToStaticMarkup(
      <NumField
        value={150}
        min="0"
        max="1000"
        step="1"
        onChange={() => undefined}
      />
    );

    expect(html).toContain('type="number"');
    expect(html).toContain('value="150"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="1000"');
  });

  it('marks input with aria-invalid when error is present', () => {
    const html = renderToStaticMarkup(
      <NumField
        value={0}
        error="Nilai tidak valid"
        onChange={() => undefined}
      />
    );

    expect(html).toContain('aria-invalid="true"');
  });

  it('spreads aria-describedby and other attributes onto input element', () => {
    const html = renderToStaticMarkup(
      <NumField
        value={25}
        id="policy-scan-input"
        aria-describedby="policy-scan-error policy-scan-help"
        onChange={() => undefined}
      />
    );

    expect(html).toContain('id="policy-scan-input"');
    expect(html).toContain('aria-describedby="policy-scan-error policy-scan-help"');
  });

  it('parses numeric input strings and returns null for empty or incomplete text', () => {
    expect(parseNumInputValue('150')).toBe(150);
    expect(parseNumInputValue('-25')).toBe(-25);
    expect(parseNumInputValue('3.14')).toBe(3.14);
    expect(parseNumInputValue('0')).toBe(0);

    expect(parseNumInputValue('')).toBeNull();
    expect(parseNumInputValue('   ')).toBeNull();
    expect(parseNumInputValue('-')).toBeNull();
    expect(parseNumInputValue('.')).toBeNull();
    expect(parseNumInputValue('abc')).toBeNull();
  });

  it('preserves raw text during editing and does not sync while lastCommitted equals externalValue', () => {
    // While user clears input to type a new value, externalValue is still 150
    expect(shouldSyncExternalNumValue('', 150, 150)).toBe(false);

    // While user types a negative sign
    expect(shouldSyncExternalNumValue('-', 150, 150)).toBe(false);

    // While user types decimal point
    expect(shouldSyncExternalNumValue('15.', 15, 15)).toBe(false);

    // While user types leading zero
    expect(shouldSyncExternalNumValue('05', 5, 5)).toBe(false);
  });

  it('syncs input text when externalValue changes from outside', () => {
    // External reset from 150 to 0 (e.g. cancel button)
    expect(shouldSyncExternalNumValue('150', 0, 150)).toBe(true);

    // External reset while user had cleared input
    expect(shouldSyncExternalNumValue('', 50, 150)).toBe(true);

    // External value changed but current text already matches new value
    expect(shouldSyncExternalNumValue('100', 100, 50)).toBe(false);
  });
});

describe('Nominal panjang and money formatting', () => {
  it('formats large numbers in IDR without crashing', () => {
    const formatted = formatMoney(1_500_000_000_000, 'IDR');
    expect(formatted).toContain('1.500.000.000.000');
  });

  it('formats large numbers in USD without crashing', () => {
    const formatted = formatMoney(999_999_999, 'USD');
    expect(formatted).toContain('999.999.999');
  });

  it('returns dash placeholder for non-finite amounts', () => {
    expect(formatMoney(Number.NaN, 'IDR')).toBe('–');
    expect(formatMoney(Number.POSITIVE_INFINITY, 'USD')).toBe('–');
  });

  it('renders MoneyDisplay with .nominal-wrap class for overflow wrapping', () => {
    const html = renderToStaticMarkup(
      <MoneyDisplay amount={100_000_000_000} currency="IDR" className="lead-budget" />
    );

    expect(html).toContain('nominal-wrap');
    expect(html).toContain('lead-budget');
    expect(html).toContain('100.000.000.000');
  });
});
