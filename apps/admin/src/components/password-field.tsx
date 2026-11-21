'use client';

import { useState } from 'react';
import { Icon } from './icons';
import { Field } from './ui';
import { useUi } from '@/lib/ui-context';

/**
 * Password input with a show/hide toggle.
 *
 * The toggle is positioned with logical properties (`insetInlineEnd`), so it
 * sits at the trailing edge in both LTR and RTL without a direction check. The
 * password is masked on first render and the toggle never changes the submitted
 * value, only its visibility.
 */
export function PasswordField({
  label,
  value,
  onChange,
  name = 'password',
  autoComplete = 'current-password',
  required,
  hint,
  testId,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  testId?: string;
  autoFocus?: boolean;
}) {
  const { t } = useUi();
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} required={required} hint={hint}>
      <span className="relative block">
        <input
          className="oryx-input"
          style={{ paddingInlineEnd: 40 }}
          type={visible ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={visible}
          title={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          className="oryx-faint absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-md p-1 transition-colors hover:text-[var(--gold)]"
          style={{ insetInlineEnd: 6 }}
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </span>
    </Field>
  );
}
