// Стилизованное сообщение об ошибке внутри формы / блока, где ошибка произошла
function ErrorMessage({ text, onRetry }) {
  if (!text) return null;
  return (
    <div className="error-box" role="alert">
      <span className="error-icon">⚠️</span>
      <span className="error-text">{text}</span>
      {onRetry && (
        <button type="button" className="btn btn-small btn-light" onClick={onRetry}>Повторить</button>
      )}
    </div>
  );
}

// Сообщение об успешном действии
export function SuccessMessage({ text }) {
  if (!text) return null;
  return (
    <div className="success-box" role="status">
      <span>✅</span>
      <span>{text}</span>
    </div>
  );
}

export default ErrorMessage;
