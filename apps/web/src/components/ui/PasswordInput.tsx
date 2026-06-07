/**
 * PasswordInput — a password field with a show/hide toggle.
 *
 * Renders a masked input by default with an eye button that toggles between
 * `password` and `text`. Forwards common input props.
 */

import { useState, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Optional id used to associate an external <label htmlFor>. */
  id?: string;
};

export function PasswordInput({ id, style, disabled, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className="form-input"
        style={{ paddingRight: '40px', ...style }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        title={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text3)',
        }}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  );
}
