import { useEffect, useState } from 'react';

// индикатор загрузки
export function Loader({ text = 'Загрузка…' }) {
  return (
    <div className="loader">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

// пустое состояние (нет данных)
export function EmptyState({ icon = '📭', title, text, children }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

// заголовок страницы
export function PageTitle({ icon, title, subtitle, children }) {
  return (
    <div className="page-title">
      <div>
        <h1>{icon && <span className="page-title-icon">{icon}</span>}{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-title-actions">{children}</div>}
    </div>
  );
}

// карточка статистики
export function StatCard({ icon, value, label, color = 'purple' }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

// цветная метка типа занятия
export function TypeBadge({ type, types }) {
  const info = types[type];
  if (!info) return null;
  return (
    <span className="type-badge" style={{ background: `${info.color}1f`, color: info.color, borderColor: `${info.color}55` }}>
      <span className="type-dot" style={{ background: info.color }} />
      {info.name}
    </span>
  );
}

// загрузка данных страницы: data, error, loading и reload
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    loader()
      .then((data) => active && setState({ data, error: '', loading: false }))
      .catch((error) => active && setState({ data: null, error, loading: false }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { ...state, reload: () => setVersion((v) => v + 1) };
}
