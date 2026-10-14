import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import ErrorMessage from './ErrorMessage';
import { errorText } from '../api/http';

// Окно подтверждения действия, которое меняет данные в базе.
// onConfirm - async-функция; если она завершится ошибкой, текст ошибки показывается в этом же окне
function ConfirmModal({ open, title = 'Подтверждение', text, details, confirmText = 'Подтвердить', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setBusy(false);
    }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={confirm} disabled={busy}>
            {busy ? 'Сохранение…' : confirmText}
          </button>
        </>
      }
    >
      <div className="confirm-text">
        <span className="confirm-icon">{danger ? '⚠️' : '❓'}</span>
        <div>
          <p>{text}</p>
          {details && <p className="muted small">{details}</p>}
        </div>
      </div>
      <ErrorMessage text={error} />
    </Modal>
  );
}

// Хук для подтверждений: ask({ title, text, details, confirmText, danger, action })
// возвращает [окно, функция ask]; окно нужно вывести в разметке компонента
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const ask = useCallback((value) => setOptions(value), []);
  const element = (
    <ConfirmModal
      open={!!options}
      title={options?.title}
      text={options?.text}
      details={options?.details}
      confirmText={options?.confirmText}
      danger={options?.danger}
      onConfirm={() => options.action()}
      onClose={() => setOptions(null)}
    />
  );
  return [element, ask];
}

export default ConfirmModal;
