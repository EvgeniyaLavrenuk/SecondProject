// Проверка надежности пароля: список требований и итоговый уровень

export const PASSWORD_RULES = [
  { key: 'length', label: 'не короче 8 символов', test: (p) => p.length >= 8 },
  { key: 'lower', label: 'строчная буква', test: (p) => /[a-zа-я]/.test(p) },
  { key: 'upper', label: 'заглавная буква', test: (p) => /[A-ZА-Я]/.test(p) },
  { key: 'digit', label: 'цифра', test: (p) => /\d/.test(p) },
  { key: 'special', label: 'спецсимвол (!@#$% и т.п.)', test: (p) => /[^a-zA-Zа-яА-Я0-9]/.test(p) }
];

// уровень: 0 - пусто, 1 - слабый, 2 - средний, 3 - надежный
export const passwordLevel = (password) => {
  if (!password) return 0;
  const passed = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  if (password.length < 8 || passed <= 2) return 1;
  if (passed <= 4) return 2;
  return 3;
};

const LEVELS = {
  1: { name: 'Слабый пароль', className: 'weak' },
  2: { name: 'Средний пароль', className: 'medium' },
  3: { name: 'Надежный пароль', className: 'strong' }
};

function PasswordStrength({ password }) {
  const level = passwordLevel(password);
  if (level === 0) return null;

  return (
    <div className="password-strength">
      <div className="strength-bars">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`strength-bar ${n <= level ? LEVELS[level].className : ''}`} />
        ))}
      </div>
      <div className={`strength-name ${LEVELS[level].className}`}>{LEVELS[level].name}</div>
      <ul className="strength-rules">
        {PASSWORD_RULES.map((rule) => (
          <li key={rule.key} className={rule.test(password) ? 'ok' : ''}>
            {rule.test(password) ? '✔' : '○'} {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PasswordStrength;
