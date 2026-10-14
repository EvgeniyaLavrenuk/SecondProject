import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// счетчик открытых окон (окно подтверждения может открываться поверх другого окна)
let openCount = 0;

// Модальное окно: закрывается крестиком в правом верхнем углу,
// кликом по затемненному фону и клавишей Esc
function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  const backdrop = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      // Esc закрывает только верхнее окно
      const all = document.querySelectorAll('.modal-backdrop');
      if (event.key === 'Escape' && all[all.length - 1] === backdrop.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    openCount += 1;
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      openCount -= 1;
      if (openCount === 0) document.body.classList.remove('no-scroll');
    };
  }, [open]);

  if (!open) return null;

  // окно выводится прямо в body, чтобы его не обрезали родительские блоки
  return createPortal(
    <div
      ref={backdrop}
      className="modal-backdrop"
      onMouseDown={(event) => {
        // закрытие только при клике именно по фону, а не по окну
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
